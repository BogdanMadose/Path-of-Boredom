using Path_of_Boredom.Web;
using Path_of_Boredom.Web.Components;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.WebUtilities;

var builder = WebApplication.CreateBuilder(args);

// Wires up Aspire's shared cross-cutting concerns (service discovery, resilient HttpClients,
// health checks, OpenTelemetry) — see Path of Boredom.ServiceDefaults/Extensions.cs.
builder.AddServiceDefaults();

// Google is the only sign-in. The same Google account (and the same Web OAuth client the API
// validates ID tokens against) is used on mobile, so progress continues across devices. The
// browser only holds a cookie; the Google ID/refresh tokens stay on the server in GoogleTokenStore.
builder.Services.AddOptions<GoogleAuthOptions>()
    .BindConfiguration(GoogleAuthOptions.SectionName)
    .Validate(options => options.ClientId.EndsWith(".apps.googleusercontent.com", StringComparison.Ordinal)
        && !string.IsNullOrWhiteSpace(options.ClientSecret),
        "Configure Authentication:Google:ClientId and Authentication:Google:ClientSecret (user-secrets locally, Authentication__Google__ClientSecret when deployed).")
    .ValidateOnStart();
builder.Services.AddSingleton<GoogleTokenStore>();
builder.Services.AddHttpClient();
var googleAuth = builder.Configuration.GetSection(GoogleAuthOptions.SectionName).Get<GoogleAuthOptions>() ?? new();
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/account/login";
        options.Cookie.HttpOnly = true;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.ExpireTimeSpan = TimeSpan.FromDays(14);
        options.SlidingExpiration = true;
        options.Events.OnValidatePrincipal = async context =>
        {
            // Tokens live only in memory; after a restart the player signs in with Google again.
            var store = context.HttpContext.RequestServices.GetRequiredService<GoogleTokenStore>();
            if (context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier) is not { } sub || !store.Has(sub))
            {
                context.RejectPrincipal();
                await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            }
        };
    })
    .AddGoogle(GoogleDefaults.AuthenticationScheme, options =>
    {
        options.SignInScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        options.ClientId = googleAuth.ClientId;
        options.ClientSecret = googleAuth.ClientSecret;
        options.CallbackPath = "/signin-google";
        options.Scope.Add("openid");
        options.Events.OnRedirectToAuthorizationEndpoint = context =>
        {
            // offline + consent so Google issues a refresh token and the ID token can be renewed.
            var uri = QueryHelpers.AddQueryString(context.RedirectUri, new Dictionary<string, string?>
            {
                ["access_type"] = "offline", ["prompt"] = "select_account consent"
            });
            context.Response.Redirect(uri);
            return Task.CompletedTask;
        };
        options.Events.OnCreatingTicket = context =>
        {
            var sub = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
            if (sub is null || context.TokenResponse.Response is not { } json
                || !json.RootElement.TryGetProperty("id_token", out var idToken) || idToken.GetString() is not { Length: > 0 } token)
                throw new InvalidOperationException("Google did not return an ID token.");
            var expires = DateTimeOffset.UtcNow.AddSeconds(int.TryParse(context.TokenResponse.ExpiresIn, out var seconds) ? seconds : 3600);
            context.HttpContext.RequestServices.GetRequiredService<GoogleTokenStore>()
                .Save(sub, token, context.RefreshToken, expires);
            // Public profiles use the game's own player name, never the Google profile name.
            foreach (var claim in context.Identity?.FindAll(ClaimTypes.Name).ToList() ?? [])
                context.Identity!.RemoveClaim(claim);
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorization();
// Lets child components (like Home.razor) get at the current user via CascadingAuthenticationState
// without each one needing its own AuthenticationStateProvider plumbing.
builder.Services.AddCascadingAuthenticationState();
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents()
    // Raises the default 32KB SignalR message size limit to 96KB so a full save snapshot can be
    // sent up through the Blazor circuit without the connection rejecting it as oversized. This is
    // intentionally larger than the 64KB save-payload cap enforced elsewhere, to leave headroom for
    // the JSON envelope/framing overhead around the actual save data.
    .AddHubOptions(options => options.MaximumReceiveMessageSize = 96 * 1024);

// In local Aspire dev this resolves via service discovery (the "https+http://apiservice" scheme);
// in production/IIS it should be overridden by an explicit ApiService:BaseUrl app setting pointing
// at wherever ApiService is actually hosted.
var apiServiceBaseUrl = builder.Configuration["ApiService:BaseUrl"] ?? "https+http://apiservice";
builder.Services.AddHttpClient(WebCloudGameSession.ApiClientName, client =>
    {
        client.BaseAddress = new(apiServiceBaseUrl);
        client.Timeout = TimeSpan.FromSeconds(15);
    });

// Supplies the shared game components (Path of Boredom.Game) with their host-specific identity and
// save transport: Google sign-in plus the player's Google ID token sent to the API as a Bearer.
builder.Services.AddScoped<WebCloudGameSession>();
builder.Services.AddScoped<Path_of_Boredom.Game.IGameSession>(services => services.GetRequiredService<WebCloudGameSession>());
builder.Services.AddScoped<Path_of_Boredom.Game.ICloudGameSession>(services => services.GetRequiredService<WebCloudGameSession>());

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    // Generic error page in production so stack traces never leak to players; HSTS nudges browsers
    // to remember to always use HTTPS for this host.
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    app.UseHsts();
}

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.UseAntiforgery();

// Serves static assets (wwwroot — including all the game's JS modules and CSS) with the
// framework's standard caching/fingerprinting behavior.
app.MapStaticAssets();

// Every Razor component route requires authorization — there is no anonymous page in this app,
// including the rankings/patch-notes pages. A signed-out (or non-Windows) visitor gets a 401
// challenge before Blazor ever renders anything.
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode()
    // The routable game pages (Home, Rankings, PatchNotes) live in Path of Boredom.Game now, so
    // endpoint routing has to be told about that assembly explicitly — the <Router> component's
    // AdditionalAssemblies only covers client-side navigation, not the server-side endpoint table.
    .AddAdditionalAssemblies(typeof(Path_of_Boredom.Game.IGameSession).Assembly)
    .RequireAuthorization();

// Starts the Google sign-in, then returns to the game.
app.MapGet("/account/login", () => Results.Challenge(
    new AuthenticationProperties { RedirectUri = "/" }, [GoogleDefaults.AuthenticationScheme]))
    .AllowAnonymous();

// Signs out of this browser only; the device-independent cloud save is untouched.
app.MapGet("/account/logout", async (HttpContext context, GoogleTokenStore store) =>
{
    if (context.User.FindFirstValue(ClaimTypes.NameIdentifier) is { } sub) store.Remove(sub);
    await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.LocalRedirect("/");
}).AllowAnonymous();

// Maps the /health and /alive endpoints from ServiceDefaults (development-only).
app.MapDefaultEndpoints();

app.Run();
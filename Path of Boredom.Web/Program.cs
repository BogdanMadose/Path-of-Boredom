using Path_of_Boredom.Web;
using Path_of_Boredom.Web.Components;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Path_of_Boredom.ServiceDefaults;

var builder = WebApplication.CreateBuilder(args);

// Wires up Aspire's shared cross-cutting concerns (service discovery, resilient HttpClients,
// health checks, OpenTelemetry) — see Path of Boredom.ServiceDefaults/Extensions.cs.
builder.AddServiceDefaults();

// Windows/Kerberos authentication. There's no login page or password anywhere in this app — the
// browser and IIS/Kestrel negotiate the Windows identity automatically, and everything past this
// point trusts whatever identity comes out of that handshake. This is why the app assumes a
// domain-joined / intranet environment rather than public internet access.
builder.Services.AddAuthentication(NegotiateDefaults.AuthenticationScheme)
    .AddNegotiate();
builder.Services.AddAuthorization();
// Lets child components (like Home.razor) get at the current user via CascadingAuthenticationState
// without each one needing its own AuthenticationStateProvider plumbing.
builder.Services.AddCascadingAuthenticationState();
// Binds and validates the shared save-service secret. ValidateOnStart() means a missing or
// malformed key crashes the app immediately at boot with a clear message, rather than surfacing
// as a confusing 401 the first time a player tries to save.
builder.Services.AddOptions<SaveServiceOptions>()
    .BindConfiguration(SaveServiceOptions.SectionName)
    .Validate(options => SaveServiceOptions.IsValidApiKey(options.ApiKey), "Configure SaveService:ApiKey with the same 64-character hexadecimal secret in Web and ApiService, or start AppHost.")
    .ValidateOnStart();

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
builder.Services.AddHttpClient<GameSaveClient>(client =>
    {
        client.BaseAddress = new(apiServiceBaseUrl);
        client.Timeout = TimeSpan.FromSeconds(15);
    });

// Supplies the shared game components (Path of Boredom.Game) with their host-specific identity and
// save transport. On this host that means Negotiate-authenticated Windows identity plus the
// shared-secret GameSaveClient; the MAUI head will register its own implementation instead.
builder.Services.AddScoped<Path_of_Boredom.Game.IGameSession, WindowsGameSession>();

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

// Exists purely so Negotiate has an authenticated route to challenge against and redirect back
// from; there's no real "login page" UI here, the 401 challenge/response happens at the HTTP
// level and the browser resolves it silently via Windows credentials.
app.MapGet("/account/login", () => Results.LocalRedirect("/"))
    .RequireAuthorization();

// Maps the /health and /alive endpoints from ServiceDefaults (development-only).
app.MapDefaultEndpoints();

app.Run();
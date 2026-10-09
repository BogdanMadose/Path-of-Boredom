using Path_of_Boredom.ApiService;
using Microsoft.AspNetCore.Authentication;
using Path_of_Boredom.ServiceDefaults;
using Google.Cloud.Firestore;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using System.Security.Claims;

var builder = WebApplication.CreateBuilder(args);

// Cloud Run injects PORT; listen on all interfaces, not localhost. Aspire has no PORT.
if (Environment.GetEnvironmentVariable("PORT") is { Length: > 0 } port)
{
    if (!int.TryParse(port, out var number) || number is < 1 or > 65535)
        throw new InvalidOperationException("PORT must be between 1 and 65535.");
    builder.WebHost.UseUrls($"http://0.0.0.0:{number}");
}

// Aspire's shared service defaults (service discovery, health checks, OpenTelemetry).
builder.AddServiceDefaults();

// Enables the standard ASP.NET Core ProblemDetails middleware for unhandled exceptions — combined
// with UseExceptionHandler() below, this means an uncaught error returns a generic RFC 7807 JSON
// body instead of leaking a stack trace to the caller.
builder.Services.AddProblemDetails();
builder.Services.AddSingleton(_ => new FirestoreDbBuilder
{
    ProjectId = builder.Configuration["Firestore:ProjectId"]
        ?? throw new InvalidOperationException("Configure Firestore:ProjectId."),
    DatabaseId = builder.Configuration["Firestore:DatabaseId"] ?? "(default)",
    EmulatorDetection = Google.Api.Gax.EmulatorDetection.EmulatorOrProduction
}.Build());
builder.Services.AddSingleton<FirestorePersistence>();
builder.Services.AddSingleton<GameSaveStore>();
builder.Services.AddSingleton<RankingStore>();
builder.Services.AddOptions<GoogleIdentityOptions>()
    .BindConfiguration("GoogleIdentity")
    .Validate(options => options.Audience.EndsWith(".apps.googleusercontent.com", StringComparison.Ordinal)
        && !string.IsNullOrWhiteSpace(options.Audience), "Configure GoogleIdentity:Audience with the verified Web OAuth client ID.")
    .ValidateOnStart();
builder.Services.AddSingleton<IGoogleTokenValidator, GoogleTokenValidator>();
var authentication = builder.Services.AddAuthentication(GoogleTokenAuthenticationHandler.SchemeName)
    .AddScheme<AuthenticationSchemeOptions, GoogleTokenAuthenticationHandler>(GoogleTokenAuthenticationHandler.SchemeName, _ => { });
// Legacy Windows identity forwarding is opt-in AND development-only. Never enabled on Cloud Run.
if (builder.Environment.IsDevelopment() && builder.Configuration.GetValue<bool>("Authentication:EnableLegacyWindows"))
{
    builder.Services.AddOptions<SaveServiceOptions>().BindConfiguration(SaveServiceOptions.SectionName)
        .Validate(options => SaveServiceOptions.IsValidApiKey(options.ApiKey), "Configure the development SaveService API key.")
        .ValidateOnStart();
    authentication.AddScheme<AuthenticationSchemeOptions, SaveServiceAuthenticationHandler>(SaveServiceOptions.AuthenticationScheme, _ => { })
        .AddPolicyScheme("DevelopmentIdentity", null, options => options.ForwardDefaultSelector = context =>
            context.Request.Headers.Authorization.ToString() is { Length: 71 } credential
                && credential.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
                && SaveServiceOptions.IsValidApiKey(credential[7..])
                    ? SaveServiceOptions.AuthenticationScheme : GoogleTokenAuthenticationHandler.SchemeName);
    builder.Services.Configure<AuthenticationOptions>(options => options.DefaultScheme = "DevelopmentIdentity");
}
builder.Services.AddAuthorization(options => options.AddPolicy(GoogleTokenAuthenticationHandler.MobilePolicy,
    policy => policy.AddAuthenticationSchemes(GoogleTokenAuthenticationHandler.SchemeName)
        .RequireAuthenticatedUser().RequireClaim("sub").RequireClaim(ClaimTypes.NameIdentifier)));
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("PlayerRequests", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 60, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

var app = builder.Build();

app.UseExceptionHandler();
app.UseAuthentication();
app.Use(async (context, next) =>
{
    if (context.User.Identity?.IsAuthenticated == true && context.User.HasClaim(c => c.Type == "sub"))
    {
        var persistence = context.RequestServices.GetRequiredService<FirestorePersistence>();
        var account = await persistence.Account(context.User.FindFirstValue("sub")!).GetSnapshotAsync(context.RequestAborted);
        if (account.Exists && account.TryGetValue<long>("deletedAt", out var deletedAt)
            && GoogleTokenAuthenticationHandler.IssuedAt(context.User) <= deletedAt)
        {
            await RejectDeletedSessionAsync(context);
            return;
        }
    }
    try { await next(context); }
    catch (AccountDeletedException)
    {
        if (context.Response.HasStarted) throw;
        context.Response.Clear();
        await RejectDeletedSessionAsync(context);
    }
});
app.UseAuthorization();
app.UseRateLimiter();

// Endpoint groups defined in GameSaveEndpoints.cs and RankingEndpoints.cs respectively.
app.MapGameSaves();
app.MapRankings();
app.MapPlayerAccount();
// /health and /alive (development-only, see ServiceDefaults.Extensions).
app.MapDefaultEndpoints();

app.Run();

static Task RejectDeletedSessionAsync(HttpContext context)
{
    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
    context.Response.Headers.CacheControl = "no-store";
    return context.Response.WriteAsJsonAsync(new
    {
        code = "AccountDeleted",
        message = "This Google session predates account deletion. Sign in again to create a new game account."
    }, context.RequestAborted);
}

public partial class Program;

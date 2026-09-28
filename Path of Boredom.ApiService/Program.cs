using Path_of_Boredom.ApiService;
using Microsoft.AspNetCore.Authentication;
using Path_of_Boredom.ServiceDefaults;

var builder = WebApplication.CreateBuilder(args);

// Aspire's shared service defaults (service discovery, health checks, OpenTelemetry).
builder.AddServiceDefaults();

// Enables the standard ASP.NET Core ProblemDetails middleware for unhandled exceptions — combined
// with UseExceptionHandler() below, this means an uncaught error returns a generic RFC 7807 JSON
// body instead of leaking a stack trace to the caller.
builder.Services.AddProblemDetails();
// GameSaveStore and RankingStore are both registered as singletons because they own their own
// in-process locking (see each store's file for details) around the JSON files on disk — there's
// intentionally only ever one instance per process.
builder.Services.AddSingleton<GameSaveStore>();
builder.Services.AddSingleton<RankingStore>();
// Same shared-secret validation as the Web project — the API refuses to start if the configured
// key isn't a valid 64-hex-char secret, so a misconfiguration is caught at boot rather than on the
// first save request.
builder.Services.AddOptions<SaveServiceOptions>()
    .BindConfiguration(SaveServiceOptions.SectionName)
    .Validate(options => SaveServiceOptions.IsValidApiKey(options.ApiKey), "Configure SaveService:ApiKey with the same 64-character hexadecimal secret in Web and ApiService, or start AppHost.")
    .ValidateOnStart();
// Registers the custom SaveService auth scheme (see SaveServiceAuthenticationHandler.cs) as the
// only way to authenticate against this API — there is no cookie/JWT/OAuth scheme here, just the
// shared-secret Bearer token plus identity headers that GameSaveClient sends.
builder.Services.AddAuthentication(SaveServiceOptions.AuthenticationScheme)
    .AddScheme<AuthenticationSchemeOptions, SaveServiceAuthenticationHandler>(SaveServiceOptions.AuthenticationScheme, _ => { });
builder.Services.AddAuthorization();

var app = builder.Build();

app.UseExceptionHandler();
app.UseAuthentication();
app.UseAuthorization();

// Endpoint groups defined in GameSaveEndpoints.cs and RankingEndpoints.cs respectively.
app.MapGameSaves();
app.MapRankings();
// /health and /alive (development-only, see ServiceDefaults.Extensions).
app.MapDefaultEndpoints();

app.Run();

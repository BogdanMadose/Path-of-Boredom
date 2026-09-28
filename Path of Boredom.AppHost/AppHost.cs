// Entry point for the Aspire AppHost — this is only ever run for local development/orchestration.
// It does not run in production; IIS hosts Web and ApiService directly there, wired together
// through appsettings.json instead of this file. See the AppHost README for the bigger picture.
var builder = DistributedApplication.CreateBuilder(args);

// Auto-generate a random 256-bit hex secret for the SaveService shared key if one hasn't been
// configured yet (e.g. first run on a new dev machine). This keeps local dev "just work" without
// requiring a manually-configured secret, at the cost of the key changing across AppHost restarts
// unless it's persisted somewhere (e.g. user secrets) — that's fine locally since both Web and
// ApiService get the same freshly generated value below in the same run.
if (string.IsNullOrWhiteSpace(builder.Configuration["Parameters:save-service-key"]))
{
    builder.Configuration["Parameters:save-service-key"] = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
}

// Wraps the (now guaranteed-present) secret as an Aspire parameter, marked secret so it isn't
// logged/displayed in the Aspire dashboard.
var saveServiceKey = builder.AddParameter("save-service-key", secret: true);

// Registers the API project and injects the shared secret via the SaveService:ApiKey configuration
// path (double-underscore is ASP.NET Core's environment-variable convention for nested config keys).
// The health check here is what Aspire's dashboard polls to show the service as healthy/unhealthy.
var apiService = builder.AddProject<Projects.Path_of_Boredom_ApiService>("apiservice")
    .WithHttpHealthCheck("/health")
    .WithEnvironment("SaveService__ApiKey", saveServiceKey);

// Registers the Blazor Web project with the same shared secret, plus:
// - IsProxied = false on both endpoints: talk to Web directly rather than through Aspire's dashboard proxy,
//   which matters for the SignalR/Blazor Server circuit (proxying can interfere with WebSocket upgrades).
// - WithExternalHttpEndpoints(): exposes Web's endpoint outside the Aspire dashboard so a real browser
//   window can reach it directly.
// - WithReference(apiService) + WaitFor(apiService): gives Web the resolved apiservice address for
//   service discovery, and makes sure Web doesn't start serving traffic before the API is up.
builder.AddProject<Projects.Path_of_Boredom_Web>("webfrontend")
    .WithEnvironment("SaveService__ApiKey", saveServiceKey)
    .WithEndpoint("http", endpoint => endpoint.IsProxied = false)
    .WithEndpoint("https", endpoint => endpoint.IsProxied = false)
    .WithExternalHttpEndpoints()
    .WithHttpHealthCheck("/health")
    .WithReference(apiService)
    .WaitFor(apiService);

// Starts the Aspire orchestrator, which in turn starts both projects as child processes and
// keeps this process running until it's stopped (Ctrl+C, IDE stop, etc.).
builder.Build().Run();

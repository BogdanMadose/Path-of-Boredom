// Entry point for the Aspire AppHost — this is only ever run for local development/orchestration.
// It does not run in production; IIS hosts Web and ApiService directly there, wired together
// through appsettings.json instead of this file. See the AppHost README for the bigger picture.
var builder = DistributedApplication.CreateBuilder(args);

// By default Web talks to the deployed Cloud Run API, which already holds its own Firestore
// credentials, so no local Google credentials are needed. Set "LocalApi" to true (for example
// `dotnet user-secrets set LocalApi true --project "Path of Boredom.AppHost"` or an environment
// variable) to run the API from source instead; that needs Application Default Credentials or
// the Firestore emulator.
const string CloudApiUrl = "https://pob-api-438780560503.europe-west1.run.app";
var useLocalApi = bool.TryParse(builder.Configuration["LocalApi"], out var local) && local;

// Registers the Blazor Web project, which signs players in with Google (Authentication:Google:*
// from its user-secrets/environment) and calls the API with their Google ID token. Fixed ports
// come from launchSettings.json (Web 9989, API 9988; 9998/9999 belong to the deployed site) so the
// Google redirect URI https://localhost:9989/signin-google stays registered. IsProxied = false
// keeps the Blazor SignalR circuit off Aspire's dashboard proxy.
var web = builder.AddProject<Projects.Path_of_Boredom_Web>("webfrontend")
    .WithEndpoint("http", endpoint => endpoint.IsProxied = false)
    .WithEndpoint("https", endpoint => endpoint.IsProxied = false)
    .WithExternalHttpEndpoints()
    .WithHttpHealthCheck("/health");

if (useLocalApi)
{
    var apiService = builder.AddProject<Projects.Path_of_Boredom_ApiService>("apiservice")
        .WithHttpHealthCheck("/health");
    web.WithReference(apiService).WaitFor(apiService);
}
else
{
    web.WithEnvironment("ApiService__BaseUrl", CloudApiUrl);
}

// Starts the Aspire orchestrator, which in turn starts both projects as child processes and
// keeps this process running until it's stopped (Ctrl+C, IDE stop, etc.).
builder.Build().Run();

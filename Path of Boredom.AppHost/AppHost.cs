var builder = DistributedApplication.CreateBuilder(args);

if (string.IsNullOrWhiteSpace(builder.Configuration["Parameters:save-service-key"]))
{
    builder.Configuration["Parameters:save-service-key"] = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
}
var saveServiceKey = builder.AddParameter("save-service-key", secret: true);

var apiService = builder.AddProject<Projects.Path_of_Boredom_ApiService>("apiservice")
    .WithHttpHealthCheck("/health")
    .WithEnvironment("SaveService__ApiKey", saveServiceKey);

builder.AddProject<Projects.Path_of_Boredom_Web>("webfrontend")
    .WithEnvironment("SaveService__ApiKey", saveServiceKey)
    .WithEndpoint("http", endpoint => endpoint.IsProxied = false)
    .WithEndpoint("https", endpoint => endpoint.IsProxied = false)
    .WithExternalHttpEndpoints()
    .WithHttpHealthCheck("/health")
    .WithReference(apiService)
    .WaitFor(apiService);

builder.Build().Run();

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

namespace Microsoft.Extensions.Hosting;

// Adds common Aspire services: service discovery, resilience, health checks, and OpenTelemetry.
// This project should be referenced by each service project in your solution.
// To learn more about using this project, see https://aka.ms/dotnet/aspire/service-defaults

/// <summary>
/// Extension methods shared by Web and ApiService to wire up the standard Aspire cross-cutting
/// concerns (service discovery, resilient HTTP clients, health checks, OpenTelemetry). This is
/// mostly unmodified Aspire project-template boilerplate; if you're looking for anything
/// game-specific (auth, saves, rankings), see SaveServiceOptions and RankingModels instead.
/// </summary>
public static class Extensions
{
    /// <summary>Route the readiness health check endpoint is mapped to (dev-only, see MapDefaultEndpoints).</summary>
    private const string HealthEndpointPath = "/health";

    /// <summary>Route the liveness-only health check endpoint is mapped to (dev-only, see MapDefaultEndpoints).</summary>
    private const string AlivenessEndpointPath = "/alive";

    /// <summary>
    /// Call this once from each service's Program.cs right after creating the builder. Turns on
    /// OpenTelemetry, a basic "self" liveness health check, service discovery (so Aspire's
    /// https+http://apiservice-style logical URLs resolve), and a standard resilience handler
    /// (retry/circuit-breaker/timeout) applied to every outgoing HttpClient by default, including
    /// GameSaveClient's HttpClient.
    /// </summary>
    public static TBuilder AddServiceDefaults<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.ConfigureOpenTelemetry();

        builder.AddDefaultHealthChecks();

        builder.Services.AddServiceDiscovery();

        builder.Services.ConfigureHttpClientDefaults(http =>
        {
            // Turn on resilience by default
            http.AddStandardResilienceHandler();

            // Turn on service discovery by default
            http.AddServiceDiscovery();
        });

        // Uncomment the following to restrict the allowed schemes for service discovery.
        // builder.Services.Configure<ServiceDiscoveryOptions>(options =>
        // {
        //     options.AllowedSchemes = ["https"];
        // });

        return builder;
    }

    /// <summary>
    /// Wires up OpenTelemetry logging, metrics, and tracing for the service. Health-check requests
    /// are filtered out of traces so they don't spam whatever telemetry backend is configured.
    /// Whether anything actually gets exported depends on AddOpenTelemetryExporters below.
    /// </summary>
    public static TBuilder ConfigureOpenTelemetry<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
        });

        builder.Services.AddOpenTelemetry()
            .WithMetrics(metrics =>
            {
                metrics.AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddRuntimeInstrumentation();
            })
            .WithTracing(tracing =>
            {
                tracing.AddSource(builder.Environment.ApplicationName)
                    .AddAspNetCoreInstrumentation(tracing =>
                        // Exclude health check requests from tracing
                        tracing.Filter = context =>
                            !context.Request.Path.StartsWithSegments(HealthEndpointPath)
                            && !context.Request.Path.StartsWithSegments(AlivenessEndpointPath)
                    )
                    // Uncomment the following line to enable gRPC instrumentation (requires the OpenTelemetry.Instrumentation.GrpcNetClient package)
                    //.AddGrpcClientInstrumentation()
                    .AddHttpClientInstrumentation();
            });

        builder.AddOpenTelemetryExporters();

        return builder;
    }

    /// <summary>
    /// Turns on the OTLP telemetry exporter, but only if an OTLP endpoint is actually configured
    /// via the OTEL_EXPORTER_OTLP_ENDPOINT environment variable/setting (Aspire's dashboard sets
    /// this automatically in local dev; it's typically unset in the IIS production deployment,
    /// so no telemetry is exported there by default).
    /// </summary>
    private static TBuilder AddOpenTelemetryExporters<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        var useOtlpExporter = !string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]);

        if (useOtlpExporter)
        {
            builder.Services.AddOpenTelemetry().UseOtlpExporter();
        }

        // Uncomment the following lines to enable the Azure Monitor exporter (requires the Azure.Monitor.OpenTelemetry.AspNetCore package)
        //if (!string.IsNullOrEmpty(builder.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"]))
        //{
        //    builder.Services.AddOpenTelemetry()
        //       .UseAzureMonitor();
        //}

        return builder;
    }

    /// <summary>
    /// Registers a trivial always-healthy "self" check tagged "live", used by MapDefaultEndpoints's
    /// /alive endpoint. This just confirms the process is up and able to respond to HTTP at all —
    /// it says nothing about whether saves/rankings storage is reachable (that's not checked anywhere currently).
    /// </summary>
    public static TBuilder AddDefaultHealthChecks<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.Services.AddHealthChecks()
            // Add a default liveness check to ensure app is responsive
            .AddCheck("self", () => HealthCheckResult.Healthy(), ["live"]);

        return builder;
    }

    /// <summary>
    /// Maps the /health (readiness — all checks must pass) and /alive (liveness — only "live"-tagged
    /// checks must pass) endpoints, but only when running in the Development environment. These are
    /// intentionally not exposed in production/IIS because an unauthenticated health endpoint can leak
    /// information about the service's internals — see the Aspire docs link above before ever turning
    /// this on outside development.
    /// </summary>
    public static WebApplication MapDefaultEndpoints(this WebApplication app)
    {
        // Adding health checks endpoints to applications in non-development environments has security implications.
        // See https://aka.ms/dotnet/aspire/healthchecks for details before enabling these endpoints in non-development environments.
        if (app.Environment.IsDevelopment())
        {
            // All health checks must pass for app to be considered ready to accept traffic after starting
            app.MapHealthChecks(HealthEndpointPath);

            // Only health checks tagged with the "live" tag must pass for app to be considered alive
            app.MapHealthChecks(AlivenessEndpointPath, new HealthCheckOptions
            {
                Predicate = r => r.Tags.Contains("live")
            });
        }

        return app;
    }
}

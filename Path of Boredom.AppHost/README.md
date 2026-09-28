# Path of Boredom.AppHost

This is the .NET Aspire orchestrator. Its only job is local development convenience — it does not run in production/IIS at all.

## What it actually does (`AppHost.cs`)

1. Generates a random 32-byte hex secret the first time you run it (`save-service-key` parameter) if one isn't already configured, and stores it as a secret parameter.
2. Starts `Path of Boredom.ApiService`, injecting that secret as `SaveService__ApiKey`, and adds an HTTP health check against `/health`.
3. Starts `Path of Boredom.Web`, injecting the same secret, pointing it at the API via `WithReference(apiService)` (Aspire's service discovery — this is why Web's config can just say `https+http://apiservice` instead of a real URL), and waits for the API to be healthy before considering Web ready (`WaitFor`).
4. Exposes Web's endpoints as non-proxied so you can hit `https://localhost:xxxx` directly in a browser without going through the Aspire dashboard's proxy.

That's it — there's no other logic here. If you're trying to figure out "why does the API URL work without me configuring anything", this file is the answer: Aspire's service discovery resolves `apiservice` to wherever that project actually bound its ports for this run.

## Running it

Just F5 this project (or `dotnet run` from this folder). It opens the Aspire dashboard, which shows both services' logs, traces, and env vars in one place — genuinely useful for debugging save/ranking round-trips without juggling two terminal windows.

## Things to know

- The generated `save-service-key` parameter is only used if you haven't already put one in configuration. If you want a stable key across restarts (e.g. so saved auth doesn't shuffle), set `Parameters:save-service-key` yourself via user secrets.
- This project doesn't publish anywhere. When it's time to actually deploy, you configure and publish `Path of Boredom.Web` and `Path of Boredom.ApiService` directly to IIS — AppHost is dev-only tooling, not a deployment artifact. See the solution root README's "Deploying to IIS" section.
- If you add a new project to the solution that needs to talk to the API or share the save-service secret, wire it up here the same way (`WithEnvironment("SaveService__ApiKey", saveServiceKey)`), otherwise it'll fail auth silently.

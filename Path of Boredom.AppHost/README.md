# Path of Boredom.AppHost

This is the .NET Aspire orchestrator. Its job is local development convenience: start Web and API, show their logs, and keep the service addresses straight. It isn't the Android launcher, a Firestore emulator, or a production deployment artifact.

## What it actually does (`AppHost.cs`)

1. Generates a random 32-byte hex secret when `Parameters:save-service-key` hasn't been configured. It's marked as a secret parameter, but the generated value isn't automatically persisted across restarts.
2. Starts `Path of Boredom.ApiService` with that value as `SaveService__ApiKey` and adds a Development `/health` probe.
3. Starts `Path of Boredom.Web` with the same secret, adds an API reference for service discovery, and waits for the API to become healthy.
4. Exposes the Web endpoints without the dashboard proxy and gives Web its own health probe.

That's why Web can use `https+http://apiservice` instead of a hard-coded localhost port. Aspire resolves the address for this run; it doesn't change how the API authenticates a caller.

## Before pressing F5

The API now uses Firestore and verifies Google tokens. The AppHost wiring does **not** fill in `Firestore:ProjectId`, `GoogleIdentity:Audience`, database credentials, or emulator settings. Configure those for the API first; otherwise it won't start successfully just because Aspire supplied a shared key.

For the Windows Web host's save/ranking relay, the API also needs `Authentication:EnableLegacyWindows` set to true **in Development**. This is opt-in, and AppHost doesn't currently enable it for you. Without it, Web can render the game while its shared-secret API requests are rejected by the Google-only configuration.

Keep those local settings in user secrets, environment variables, or an untracked development configuration. Don't solve a local login problem by putting service credentials into the Android app or enabling legacy identity forwarding on the public backend.

## Running it

With the API settings in place, F5 this project or run `dotnet run --project "Path of Boredom.AppHost"` from the repository root. The dashboard puts both services' logs and traces in one place, which is much nicer than guessing which terminal printed the failed save request.

Launch `Path of Boredom.Maui` separately on an Android device or emulator. Its cloud URL comes from `GoogleSignInConfiguration.cs`, not from this AppHost's service discovery.

## Things to know

- Set `Parameters:save-service-key` yourself if you want a stable development relay key. A freshly generated key doesn't change player identity or replace Firestore data.
- The Web and API projects use Aspire's ServiceDefaults plumbing. The MAUI host doesn't pull that server plumbing into the app.
- Production backend deployment goes through the container/backend workflow described in `Path of Boredom.ApiService/README.md`. Android release builds go through `deployment/Publish-PlayBundle.ps1`. Publishing AppHost does neither.
- If you're adding another local service, wire its references and settings here. If you're adding a combat skill, you're in the wrong folder — head to `Path of Boredom.Game/wwwroot/js/`.

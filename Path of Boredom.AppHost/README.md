# Path of Boredom.AppHost

This is the .NET Aspire orchestrator. Its job is local development convenience: start Web and API, show their logs, and keep the service addresses straight. It isn't the Android launcher, a Firestore emulator, or a production deployment artifact.

## What it actually does (`AppHost.cs`)

(https 9988 locally; 9998 is the deployed host)
(https 9989 locally; 9999 is the deployed host)
3. Exposes the Web endpoints without the dashboard proxy and gives Web its own health probe.

That's why Web can use `https+http://apiservice` instead of a hard-coded localhost port. Aspire resolves the address for this run; it doesn't change how the API authenticates a caller.

## Before pressing F5

The API now uses Firestore and verifies Google tokens. The AppHost wiring does **not** fill in `Firestore:ProjectId`, `GoogleIdentity:Audience`, database credentials, or emulator settings. Configure those for the API first; otherwise it won't start successfully just because Aspire supplied a shared key.

Web signs players in with Google. Set these once with user-secrets (never in source):

```
dotnet user-secrets set "Authentication:Google:ClientSecret" "<secret>" --project "Path of Boredom.Web"
dotnet user-secrets set "GoogleIdentity:Audience" "<Web client ID>" --project "Path of Boredom.ApiService"
```

By default AppHost starts only Web and points it at the deployed Cloud Run API, so no local Google credentials are needed. To run the API from source instead, set `LocalApi` to `true` (it then needs Application Default Credentials or the Firestore emulator).

Register `https://localhost:9989/signin-google`

Keep those local settings in user secrets, environment variables, or an untracked development configuration. Don't solve a local login problem by putting service credentials into the Android app or enabling legacy identity forwarding on the public backend.

## Running it

With the API settings in place, F5 this project or run `dotnet run --project "Path of Boredom.AppHost"` from the repository root. The dashboard puts both services' logs and traces in one place, which is much nicer than guessing which terminal printed the failed save request.

Launch `Path of Boredom.Maui` separately on an Android device or emulator. Its cloud URL comes from `GoogleSignInConfiguration.cs`, not from this AppHost's service discovery.

## Things to know

- Web and API share no secret now; player identity is always the Google `sub` from the ID token. A restart of Web asks players to sign in again, because tokens are held in memory only.
- The Web and API projects use Aspire's ServiceDefaults plumbing. The MAUI host doesn't pull that server plumbing into the app.
- Production backend deployment goes through the container/backend workflow described in `Path of Boredom.ApiService/README.md`. Android release builds go through `deployment/Publish-PlayBundle.ps1`. Publishing AppHost does neither.
- If you're adding another local service, wire its references and settings here. If you're adding a combat skill, you're in the wrong folder — head to `Path of Boredom.Game/wwwroot/js/`.

# Path of Boredom.ServiceDefaults

Shared server plumbing for Web and ApiService. This started from Aspire's standard ServiceDefaults template and still mostly does what you'd expect: telemetry, health checks, service discovery, and HTTP resilience.

The game DTOs no longer live here. They moved to `Path of Boredom.Contracts` so the shared game and MAUI app can use them without dragging server-hosting infrastructure into an Android package.

## `Extensions.cs` — the Aspire bits

`AddServiceDefaults()` sets up OpenTelemetry traces/metrics, health checks, service discovery, and resilient `HttpClient` defaults. `MapDefaultEndpoints()` maps `/health` and `/alive` only in Development. Don't assume those URLs exist on the production Cloud Run service just because Aspire probes them locally.

Most of this is template plumbing, not a place to put game rules. If you're changing how a flask heals, you shouldn't need to edit this project.

## `SaveServiceOptions.cs` — the legacy Windows relay contract

This defines the service-auth scheme, `SaveService` configuration section, the `X-Windows-User` / `X-Windows-Sid` header names, and validation for a 64-character hex API key.

The Web host uses that key before forwarding a Windows identity. The API only registers the corresponding handler when legacy Windows auth is explicitly enabled in Development. Google-token authentication is a separate path, implemented by ApiService, not an alternative value for this shared secret.

The distinction matters: a trusted local server can keep the secret private; an installable Android app can't. Don't add `SaveServiceOptions` to a mobile sign-in flow or ship the key in app configuration.

## Where the contracts went

Look in `Path of Boredom.Contracts` for:

- `GameSaveResult.cs` — the host-facing save/load result and messages.
- `RankingModels.cs` — score submissions, ranking rows, build/upgrade snapshots, and `RankingRules`.
- `PlayerDisplayNameRules.cs` — the nickname normalization and 3–24-character rules shared by the UI and API.

Those types still use the `Path_of_Boredom.ServiceDefaults` namespace for compatibility. Seeing that namespace in a MAUI file doesn't mean the app references this server-plumbing project; check the actual project reference before moving things around.

`RankingRules.CurrentPatch` is `004`; `RankingRules.MobileRelease` is `release`. The accepted tags also include `005` and `pre004`. These board identifiers are separate from Android version codes and save format 16, so don't bump them just because a new AAB is being built.

The ranking build still carries `ManualSkill` in its wire contract for compatibility with older records. Current runs don't have a manual combat slot, and the rankings UI no longer displays that line. Removing a line from a view isn't a reason to break old serialized records.

When changing class keys, upgrade categories, point budgets, or build limits, check `RankingRules` alongside `arpg-ranking.js` and the save validators. A valid-looking client build can still be rejected if only one side got the memo.

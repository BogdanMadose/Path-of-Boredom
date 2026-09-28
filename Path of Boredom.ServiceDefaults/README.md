# Path of Boredom.ServiceDefaults

Shared library referenced by both `Web` and `ApiService`. Three files, three jobs. This is Aspire's standard "ServiceDefaults" template project, lightly extended with our own save/ranking contracts.

## `Extensions.cs` — Aspire boilerplate

`AddServiceDefaults()` wires up OpenTelemetry (traces/metrics), a default health check, service discovery, and resilience handlers on `HttpClient`. `MapDefaultEndpoints()` exposes `/health` and `/alive`, **but only in Development** — there's a comment in there warning that exposing health endpoints in production has security implications, and it's respected: in Production those endpoints simply don't exist. This mostly came straight from the Aspire project template; don't over-think it, it's not game-specific.

## `SaveServiceOptions.cs` — the auth contract between Web and ApiService

This is small but it's the thing that actually matters. It defines:

- `SectionName` / `AuthenticationScheme` — config section name and the custom auth scheme name used by `SaveServiceAuthenticationHandler` in the API project.
- `UserNameHeader` / `UserSidHeader` — the two HTTP headers (`X-Windows-User`, `X-Windows-Sid`) that `GameSaveClient` (in Web) sets on every request to the API, carrying the caller's Windows identity across the wire. The API trusts these headers **only** after verifying the bearer token matches the shared secret — so the security model is "if you have the shared secret, we believe whatever identity you tell us," which is fine because only the Web app is supposed to have that secret.
- `IsValidApiKey()` — just checks the key is 64 hex chars. Both `Program.cs` files validate this on startup (`ValidateOnStart()`), so a misconfigured key fails fast at boot instead of manifesting as mysterious 401s later.

If you ever add a third service that needs to call the API, it needs to send the same headers with the same secret — there's no other door in.

## `RankingModels.cs` — the ranking API's shared vocabulary

DTOs (`ScoreSubmission`, `RankingRow`, `RankingBuild`, `RankingUpgrade`) plus `RankingRules`, a static class that's the single source of truth for what counts as a valid difficulty/mode/class/patch, and what a "reasonable" build snapshot looks like (bounded upgrade counts, bounded ranks, etc. — this exists so a malicious or buggy client can't submit a ranking row with an absurd fake build).

`RankingRules.CurrentPatch` (`"004"`) is the one constant you'll bump when you ship a balance patch that should get its own fresh leaderboard — see the Web project's `PatchNotes.razor` and `Rankings.razor` for how that patch value flows through to the UI. Everything before the current patch value collapses into `"pre004"` on the archive board; there's no per-patch history beyond "current" vs "everything else," by design (see `RankingStore.MigrateClassBests` in the API project).

`RankingRules.IsValid(ScoreSubmission)` is the actual gate the API applies before persisting a score — if you add a new upgrade category or class, this is where you also need to add it, or valid submissions will get silently rejected.

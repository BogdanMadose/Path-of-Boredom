# Path of Boredom.ApiService

The API is deliberately boring: two feature areas (saves, rankings), both backed by plain JSON files on disk, both guarded by the shared-secret + Windows-identity scheme described in `Path of Boredom.ServiceDefaults/README.md`. There's no database, no ORM, no migrations tooling — just `System.Text.Json` and a semaphore.

## `Program.cs`

Standard minimal-API bootstrap: registers `GameSaveStore` and `RankingStore` as singletons, validates `SaveServiceOptions` on startup, wires the custom auth scheme, and maps the two endpoint groups. Nothing surprising here — if the API won't start, check the `SaveService:ApiKey` validation message first, it's usually that.

## `SaveServiceAuthenticationHandler.cs`

Custom `AuthenticationHandler` that:
1. If there's no `Authorization` header at all, returns `NoResult()` — **not** a failure. This matters: Aspire's health check probes hit `/health` without credentials, and if this returned `Fail()` instead, every health check would log as an authentication failure, which is noisy and misleading. This was a real bug we fixed — see the patch notes if you're wondering why this looks slightly unusual for an auth handler.
2. If there is a header, it must be `Bearer <64-hex-char-key>` matching the configured secret (constant-time compare via `CryptographicOperations.FixedTimeEquals`, to avoid timing side-channels on the comparison — probably overkill for this app's threat model, but cheap to do right).
3. Then it reads `X-Windows-User` / `X-Windows-Sid` headers, validates them (length, no control characters, SID format), and builds a `ClaimsPrincipal` from them. The user's "identity" for save/ranking ownership purposes is either `windows-sid:<SID>` or `windows-name:<UPPERCASE NAME>` if no SID was sent — SID is preferred because names can theoretically collide or get renamed, SIDs don't.

## `GameSaveStore.cs` — where saves actually live

One JSON file per player under `App_Data/saves/windows/<sha256-of-owner-id>.json`, written via write-to-temp-then-atomic-move (`File.Move(..., overwrite: true)`) so a save is never left half-written if the process dies mid-write.

The one non-obvious piece of behavior here: **before overwriting an existing save, it reads the old one first**, because it needs to check whether the *previous* save had already completed the campaign (to preserve the permanent Endless-mode unlock even if the new submitted state hasn't finished the campaign in this exact save). If that old file turns out to be corrupt JSON, saving used to just blow up with an unhandled exception — which is exactly the bug that prompted the recovery logic that's in there now: on a `JsonException` while reading the old file, it copies the damaged bytes to a uniquely-named `<hash>.json.<timestamp>.<guid>.corrupt` file next to it (so nothing is lost, an admin can inspect it later), then proceeds to write the new, validated save normally. If *that* backup copy fails (e.g., permissions), the whole operation aborts without touching the original file — we'd rather fail loudly than silently lose data.

`LoadAsync` follows the same "don't crash the whole request" philosophy — a corrupt stored file surfaces as a `JsonException` that the endpoint turns into a proper `CorruptStoredSave` error response instead of an ASP.NET Core generic 500 exception page.

## `GameSaveEndpoints.cs` — the validation wall

This is the least glamorous, most important file in the API. `PUT /game/save` doesn't trust the client at all: it manually reads the request body up to a 64KB cap (bigger requests get 413, not a buffer overrun), parses it as JSON, then walks the entire expected shape by hand — every field, every array, every numeric range — before it's allowed anywhere near `GameSaveStore`. This is not idiomatic "bind a DTO and let model validation handle it" because the save shape has evolved across 14 versions and different versions have different valid shapes (see `IsValidState(state, version)` and its long chain of `if (version >= N)` checks). It's ugly, but it's ugly on purpose: a save file is basically untrusted user input that then gets deserialized and displayed back to the same or other players (rankings), so being paranoid here is the right call.

Error responses use structured codes (`InvalidSaveEnvelope`, `UnsupportedSaveVersion`, `InvalidSaveState`, `InvalidSaveJson`, `SaveStorageJsonError`, `SaveStorageUnavailable`, `CorruptStoredSave`) rather than bare 400s, specifically so `GameSaveClient` on the Web side can show the player (or an admin) an actionable message instead of "something went wrong." Each error also carries `context.TraceIdentifier` as a `reference` so you can correlate a player's bug report with a specific log line if you've turned on stdout logging (see below).

If you're adding a new field to the save shape: bump `CurrentSaveVersion`, add the field's validation gated behind `version >= <new number>`, and mirror the exact same logic in `Path of Boredom.Web/wwwroot/js/arpg-save.js`'s `restoreSnapshot`/`captureSnapshot`. The two are not auto-generated from a shared schema — you have to keep them in sync by hand. This is the single most common source of "save is broken" bugs in this project's history.

## `RankingEndpoints.cs` / `RankingStore.cs`

Much simpler than saves, because a ranking row is much smaller and less structurally complex than a full run snapshot. One JSON file per player under `App_Data/saves/rankings/<sha256-of-owner-id>.json`, containing a dictionary of "best score per board key" where a board key is `patch:difficulty:mode:class`. `MigrateClassBests` handles the one-time upgrade from an older key format (`difficulty:mode` or `difficulty:mode:class` without a patch prefix) to the current `patch:difficulty:mode:class` format — this runs lazily on every read/write of a profile, so old profiles self-heal the first time they're touched rather than needing a batch migration script.

## Logging in production (IIS)

There is no logging sink beyond the ASP.NET Core default console logger. In IIS, console output is thrown away unless you explicitly turn on stdout capture in `web.config`. See `IIS-LOGGING.md` in this folder for the exact steps — short version: it's disabled by default (`stdoutLogEnabled="false"`) to avoid unbounded log file growth, and you flip it to `true` temporarily when chasing a bug, then flip it back off.

## App_Data

`App_Data/saves` (and its `windows` and `rankings` subfolders) is git-ignored and created on demand. Don't delete it in production without a backup — it's the entire persistence layer for this app. There is currently no automated backup story; if that ever becomes a real concern, that's the first infrastructure gap worth closing.

# Path of Boredom.Web

This is the Blazor Server app, but don't expect to find much game logic in the `.razor` files — this project's real jobs are: get the player signed in via Windows auth, render the page shell around a `<canvas>`, and act as the trusted relay between the browser's JS runtime and the API. The actual ARPG lives in `wwwroot/js/` (see that folder's own README).

## Auth (`Program.cs`)

Straightforward Negotiate (Windows/Kerberos) authentication — `AddAuthentication(NegotiateDefaults.AuthenticationScheme).AddNegotiate()`. Every Razor component route requires authorization (`RequireAuthorization()` on `MapRazorComponents`), so there's no anonymous access to anything, including the rankings page. There's no login page to speak of — `/account/login` just bounces back to `/`, because Negotiate handles the challenge/response at the HTTP level before Blazor ever gets involved. If a user's browser can't or won't do Windows auth (e.g. no domain, wrong browser settings), they'll just get stuck at a 401 — this app assumes an intranet/domain-joined environment, it was never meant to be public-internet facing.

The `SaveServiceOptions` validation (`ValidateOnStart()`) is also here, same as the API — if the shared secret isn't configured or isn't 64 hex chars, the app refuses to start rather than silently failing every save later.

## `GameSaveClient.cs` — the only thing allowed to talk to the API

Every request to `Path of Boredom.ApiService` goes through this class, and it's intentionally the single choke point. It:

- Builds requests with a `Bearer <shared secret>` auth header plus `X-Windows-User` / `X-Windows-Sid` headers pulled off the current `ClaimsPrincipal` — see `CreateRequest` (not shown above but referenced throughout `SendAsync`).
- Caps outgoing save payloads at 64KB client-side before even sending, matching the API's own cap, so an oversized request fails fast with a clear message instead of a generic error from the server.
- Translates every API error code (`InvalidSaveEnvelope`, `UnsupportedSaveVersion`, `CorruptStoredSave`, etc. — see `Path of Boredom.ApiService/README.md`) into an actual sentence a player or admin can act on. This is the file to edit if you add a new error code on the API side and want a friendly message instead of the generic fallback.
- Deliberately does **not** throw on network failure — it catches `HttpRequestException`/timeouts/etc. and returns a `GameSaveResult` with `Success = false` instead, because the JS side needs to keep the run alive and let the player retry rather than getting a Blazor error boundary mid-game.
- Also has `RegisterPlayerAsync` / `SubmitScoreAsync` for the ranking side, gated through the same request-building path so ranking submissions get the same identity headers as saves.

## `Home.razor` — the page that's mostly not Blazor

Almost the entire body is static markup: the canvas, the HUD stat spans (`data-stat="..."` attributes), the level-up draft overlay, the setup dialog (difficulty/class/loadout pickers), the death report panel, and the controls legend. None of it has `@bind` or event handlers wired the Blazor way — JS reaches into this DOM directly by selector (`data-action="save"`, `data-stat="wave"`, etc.) and mutates it in the render loop. This is why the file is long but the `@code` block is tiny.

The `@code` block itself only handles three things:
1. **On init**, it grabs the signed-in Windows username (stripped of the domain prefix) and calls `Saves.RegisterPlayerAsync` to warm up the ranking profile.
2. **On first render**, it imports `./js/arpg.js` as an ES module and calls its exported `createGame(gameRoot, saveBridge)`, handing over the canvas host element and a `DotNetObjectReference` to itself. Everything past this point is the JS engine driving the show.
3. Three `[JSInvokable]` methods (`SaveRun`, `LoadRun`, `SubmitScore`) that JS calls back into whenever the player saves, loads, or finishes a run. These just forward straight to `GameSaveClient`, re-reading the current `ClaimsPrincipal` each time so a stale identity can never be reused.

`DisposeAsync` is careful to tear down the JS side (`dispose()` on the game instance) before disposing the module and the `DotNetObjectReference` — if you swap this to a `try/finally` shape, make sure disposal order survives a `JSDisconnectedException` (the circuit can drop mid-teardown, and this already guards for that).

## Other Razor pages

- `Rankings.razor` — reads the API's rankings endpoint and renders the leaderboard tables (per-class boards plus the archive board for older patches). No game logic, just fetch-and-render.
- `PatchNotes.razor` — static changelog content, linked from the in-game patch notice banner (`data-patch-notice` in `Home.razor`).
- `Error.razor` / `GameLayout.razor` — standard Blazor error boundary page and the shared page chrome (nav, the `#blazor-error-ui` banner that warns you if the SignalR circuit drops — worth remembering that if that banner shows up mid-run, the JS game state is gone, because the game state was never persisted anywhere except in that JS module's memory until you hit Save).

## If you're adding a new page or feature here

Ask first whether it actually needs Blazor interactivity, or whether it's really a JS/canvas concern that just needs a thin host page like `Home.razor`. Most "game feature" requests (new enemy, new skill, new upgrade) belong entirely in `wwwroot/js/`, not here — this project only grows when you're touching auth, the save/ranking bridge, or genuinely server-rendered content like the rankings table or patch notes.

# Path of Boredom

A small ARPG built as an excuse to poke at .NET Aspire, Blazor Server, and a hand-rolled JavaScript canvas game engine. It's a Diablo-lite: pick a class, fight through a 30-wave campaign across six areas, then keep going forever in Endless mode if you want. Saves live on the server, tied to your Windows login, and there's a rankings page so you can see how your runs stack up.

This README is the map of the place. If you're new here, read this first, then dive into the project you actually need to touch.

## The shape of the solution

Four projects, and they talk to each other like this:

```
Path of Boredom.AppHost        → wires everything up for local dev (.NET Aspire)
Path of Boredom.Web            → the Blazor Server app; also serves the actual game (it's mostly JavaScript)
Path of Boredom.ApiService     → the save/ranking API; talks to the Web app over HTTP, not directly to browsers
Path of Boredom.ServiceDefaults→ shared plumbing (health checks, telemetry, the save-service auth contract)
```

The important thing to understand up front: **the game itself is not really a Blazor app**. `Home.razor` is basically a thin shell — a `<canvas>`, some HUD markup, and a single JS module import. Almost all gameplay logic (movement, combat, loot, skill trees, enemy AI, rendering) lives in plain JavaScript under `Path of Boredom.Web/wwwroot/js/`. Blazor's job here is authentication, hosting, and being the bridge that lets JavaScript call back into C# to save/load a run and submit rankings. If you're looking for "where does the boss deal damage", you want the JS files, not Razor.

## Why it's built this way

Early on this used to be closer to a normal Blazor game (component state driving the UI), but a canvas-based real-time ARPG with 60fps combat, particle effects, and physics-ish enemy movement is a much better fit for a JS render loop than for Blazor's diffing. So the split settled into: **JS owns the simulation and rendering, C# owns identity and persistence.** The two talk over a narrow bridge:

- Blazor → JS: `createGame(canvasElement, dotNetHelperRef)` (see `Home.razor`'s `OnAfterRenderAsync`)
- JS → Blazor: `DotNetObjectReference` invokable methods `SaveRun`, `LoadRun`, `SubmitScore` (see `Home.razor`'s `[JSInvokable]` methods)
- Blazor → API: `GameSaveClient` (HTTP, with a shared-secret + Windows identity header scheme, not cookies)

Nothing about saves or rankings touches the browser directly — the API only trusts the Web app, and the Web app only trusts whoever Windows-authenticated the browser session (via Negotiate/Kerberos). That's deliberate: the API's "auth" is really "are you the Web app, and who did you say the user is", not a public-facing scheme.

## Solution-wide gotchas worth knowing before you change anything

- **The save format has a version number and it matters.** `arpg-save.js` (client) and `GameSaveEndpoints.cs` (server) both hard-code `CurrentSaveVersion` / the version list, and they have to agree byte-for-byte on what a valid save looks like. If you add a field to game state, you bump the version in both places and add a migration branch in `restoreSnapshot()`. Skipping this is how you get save corruption reports. We've been bit by this before — see the "malformed save on the server" incident that led to the `.corrupt` backup mechanism in `GameSaveStore.cs`.
- **There's no database.** Saves and rankings are JSON files under `App_Data/saves` (and `App_Data/saves/rankings`), one per user, keyed by a SHA-256 hash of their identity. This is fine for a hobby project's player count; it will not scale past "a few dozen people," and there's no locking beyond an in-process semaphore per store. If this ever needs real concurrency (multiple API instances), this is the first thing to replace.
- **The shared secret is the whole auth story between Web and API.** `SaveServiceOptions.ApiKey` is a 64-char hex string both apps must have identically configured (`SaveService:ApiKey` / `SaveService__ApiKey`). AppHost generates and injects it automatically for local dev. In IIS, you set it by hand in both apps' config — get it wrong and every save silently 401s.
- **This targets .NET 9** and uses Blazor Server (not WASM) — interactivity is `@rendermode InteractiveServer`, which means the game state technically lives in a SignalR circuit on the server. If that circuit drops, the in-progress run's JS state is gone (there's a warning about this in `GameLayout.razor`'s `#blazor-error-ui`).

## Where to go next

- Building/running locally, or touching Aspire wiring → `Path of Boredom.AppHost/README.md`
- Windows auth, the game UI shell, save client plumbing → `Path of Boredom.Web/README.md`
- Save/ranking storage and validation, IIS deployment → `Path of Boredom.ApiService/README.md`
- Shared contracts (save auth header scheme, ranking DTOs, Aspire health check wiring) → `Path of Boredom.ServiceDefaults/README.md`
- The actual game (combat, skills, enemies, rendering) → `Path of Boredom.Web/wwwroot/js/README.md`

## A note on the JS style

The whole game is written as plain ES modules with no build step, no bundler, no TypeScript. That's a conscious tradeoff for a small solo/hobby project — there's nothing to compile, `Home.razor` just does `await JS.InvokeAsync<IJSObjectReference>("import", "./js/arpg.js")` and browsers handle the rest. It also means there's no type-checking safety net in the JS layer; the validation that keeps saves honest lives entirely in `GameSaveEndpoints.cs` on the server and mirrored logic in `arpg-save.js` on the client. If this project ever grows past "one or two people hacking on it," introducing TypeScript or at least JSDoc types for the engine module would pay for itself fast.

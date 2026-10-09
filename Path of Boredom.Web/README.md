# Path of Boredom.Web

This is the Windows-authenticated Blazor Server host. It used to own the game pages and JS files; those now live in `Path of Boredom.Game` so the Android app can use the same game without copying it.

The jobs left here are fairly small: negotiate the browser's Windows identity, host the shared components, and relay saves and rankings to the API through `WindowsGameSession` and `GameSaveClient`.

## Auth (`Program.cs`)

The browser still signs in through Negotiate, meaning Windows/Kerberos rather than a password form or Google's mobile sign-in. Routed components require authorization, including rankings. `/account/login` is just an authenticated redirect back to `/`; the actual challenge happens at HTTP level.

This host assumes a Windows/intranet-style environment. It isn't an anonymous public web version of the Android account flow.

`SaveService:ApiKey` must be a 64-character hex secret, and `ApiService:BaseUrl` identifies the API. Under Aspire the address can be `https+http://apiservice`; outside Aspire it needs an explicit URL. The API must separately have the matching secret and its development-only legacy Windows authentication enabled. The current public Google-token backend doesn't accept this relay scheme in Production.

## `WindowsGameSession.cs` and `GameSaveClient.cs`

`WindowsGameSession` implements the shared `IGameSession` interface. That lets `Home.razor` ask for a save or rankings without knowing it's running in a Windows-authenticated browser rather than an Android WebView.

`GameSaveClient` is the HTTP choke point. It attaches the service bearer secret and the current caller's Windows identity headers, bounds save payloads at 64 KiB, and translates API errors into useful `GameSaveResult` messages. Network failures should leave the run alive so the player can retry, not turn into an unhandled component exception.

Ranking registration and submissions use the same identity path. When changing it, keep the caller lookup fresh for each operation; a session object shouldn't quietly hold on to somebody else's old principal.

## Where the game pages went

`Path of Boredom.Game/Components/Pages/Home.razor` contains the canvas, data-attribute-driven controls, setup screens, tree markup, and death report. It imports `/_content/PathOfBoredom.Game/js/arpg.js` and calls `createGame(gameRoot, saveBridge)`.

The JS engine drives most of that DOM. Blazor supplies the host/session bridge through `SaveRun`, `LoadRun`, and `SubmitScore`, plus the account callbacks used by cloud-capable hosts. The session registration is the reason the same shared page can work in both heads without putting Windows auth into the mobile project.

The other shared pages are:

- `Rankings.razor` — class-separated columns of player records, with expandable automatic skills, upgrades, and equipment names, ratings, and styles captured at the achieved score. There is no manual-skill line in the build overview anymore; older records without equipment details aren't reconstructed from current gear.
- `PatchNotes.razor` — the browser's changelog content. The mobile game currently doesn't expose that page in its menu.
- `GameLayout.razor` — shared layout and the Blazor connection warning. The Web host's `Error.razor` remains here.

Both endpoint routing in `Program.cs` and the component router need to know about the shared game assembly. Fixing only one can leave direct URLs working differently from in-app navigation.

## A circuit is not the game state

The simulation runs in browser-side JavaScript. Interactive Server supplies the circuit needed for component events and .NET interop; it isn't advancing the enemies on the server.

A lost circuit can interrupt save/load calls and UI interactions. It doesn't, by itself, prove the JS state vanished. Reloading the page does discard unsaved in-memory progress, though, so don't tell players a reconnect banner is harmless either.

Disposal still matters: tear down the game instance before releasing its module and `DotNetObjectReference`, and allow for `JSDisconnectedException` during teardown.

## If you're adding a feature

Windows identity or HTTP relay work belongs here. Shared pages and styling belong in `Path of Boredom.Game`. Combat, skills, enemy AI, and canvas art belong in that project's `wwwroot/js/` folder. The folder split is there to avoid fixing a feature for one host and leaving the other with a stale copy.

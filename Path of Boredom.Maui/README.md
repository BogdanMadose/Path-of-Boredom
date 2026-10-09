# Path of Boredom.Maui

The Android head. It hosts the shared Blazor game inside a `BlazorWebView`, then adds the things a phone needs: a floating joystick, full-screen menus, native Google sign-in, and a device save that doesn't depend on having a connection.

The game itself still lives in `Path of Boredom.Game`. Don't copy its pages or engine into this project to fix a mobile bug; change the shared version, or the mobile shell if it's genuinely a phone-only layout/input problem.

## What runs here

`MauiProgram.cs` registers the WebView, local authentication state, `OfflineGameSession`, and `MobileCloudGameSession`. The cloud session is the registered `IGameSession`, with the offline session underneath it for device storage. A local authorized Blazor page is not proof of an online account — the backend verifies Google identity separately.

Android is the shipping target, with a minimum API of 24 and release target API 36. The project also has an iOS target conditional on a Mac, but that isn't a claim that the Android sign-in/release flow has been implemented and tested for iOS.

## The mobile shell

- `wwwroot/js/mobile-shell.js` owns the floating left-thumb joystick. It appears where the touch begins and disappears on release, cancellation, or leaving combat.
- `wwwroot/js/mobile-menu.js` builds the Skills, Forge, Pause, Rankings, and Account menu layer. It hides trees for unselected combat skills while keeping attack, dodge, and flask available.
- `wwwroot/css/mobile-shell.css` handles the full-screen arena, controls, and overlays, including a scrollable run/death card.
- `wwwroot/css/mobile-menu.css` handles the panels, tabs, and detail views.
- Shared tree art comes from `Path of Boredom.Game/wwwroot/images/skills/`, including sword/bow/hammer regular attacks and dodge/flask SVGs. Absolute shared-asset URLs matter for CSS backgrounds as well as image elements.

The big rule is still **don't re-parent Blazor-rendered nodes**. The menu layer adds its own controls and uses CSS to lift the original sections into panels. Moving the existing nodes around can break Blazor's DOM bookkeeping and the engine's listeners at the same time.

## Device first, cloud second

`OfflineGameSession.cs` keeps `offline-run.json` in the app's private data directory. Writes go through a temporary file and replacement move, malformed old saves are preserved before replacement, and downloading a cloud run keeps a `.before-cloud.json` backup. The current accepted save version is 16.

`MobileCloudGameSession.cs` handles Google-authenticated HTTP calls and cloud revision tracking. Tokens stay in memory; the persisted preference only records permission to restore the native sign-in session.

The distinction in the Account menu is deliberate:

- Upload sends the **saved device file**, not an unsaved live canvas state. Save the run first.
- Download copies a cloud save onto the device after confirmation and backup. Load then opens that run.
- Cloud writes acknowledge the observed server revision. A conflicting save needs a decision, not a silent overwrite based on a device clock.
- Sign out keeps device progress. Delete game account removes cloud saves/rankings and device saves/backups, revokes native access, and disables automatic restoration of the old session. It doesn't delete the Google account.

The server retains a minimal deletion marker to reject tokens issued before deletion. Signing in afresh can create a new game account; it can't bring deleted progress back.

## Google sign-in and player names

`GoogleSignInConfiguration.cs` holds public deployment identifiers: API URL, Web OAuth client ID, Android package registration, and certificate fingerprints. They aren't substitutes for the correct OAuth registration. Never add a service key or signing password there.

`NativeGoogleSignIn.cs` handles the Android account flow; the API verifies the returned ID token against its configured Web OAuth audience. Play app-signing and local upload/debug certificates can differ, so register the fingerprint for the install you're actually testing rather than assuming every build uses the same certificate.

`CloudAccountMenu.razor` is shared game UI. It constrains the nickname field, shows save results next to the button, and reports duplicate-name conflicts. Case-insensitive uniqueness is enforced by the API, not by the app guessing from a downloaded leaderboard. Deploy the updated backend before expecting that check to work live.

## Building an internal-test bundle

The release entry point is `deployment/Publish-PlayBundle.ps1` at the repository root. Call it with an unused Play version code, for example `& './deployment/Publish-PlayBundle.ps1' -VersionCode 12` for the next bundle after V11.

It expects local inputs that aren't part of a clean clone:

- `Play-Release/android-sdk` with the API 36 platform and the required SDK tooling.
- `Play-Release/API36-AndroidManifest.xml`.
- `.local-signing/pob-upload.jks` and `.local-signing/upload-password.txt`, using the existing upload-key alias.
- The .NET 9 Android/MAUI workload, plus the Java signing tools on the path.

The script clears generated Android Release outputs, publishes an AAB, signs it, verifies the signature, and refuses to overwrite an existing named bundle. The cleanup is intentional: stale resource designers previously produced an app that built successfully but crashed on startup.

The latest locally built artifact is `Play-Release/Path-of-Boredom-Internal-Test-v11-API36.aab`, with version code **11**, display version **0.5.0**, and target API **36**. It includes the base-action SVG fixes, death-screen scrolling, and class-column rankings without the obsolete manual-skill line.

The current .NET 9 Android toolchain reports an API 35 compile-target/API 36 target warning during publishing. Verify the generated bundle's manifest, not just the filename. V11 passed signature and bundle validation, but a Play-delivered update still needs device testing before wider rollout.

Building the bundle doesn't upload it, create a Play release, or deploy the API. Save format 16 and the `release` ranking tag also stay unchanged unless their own contracts/rules change.

## Checking changes

The 13 suites in `tests/` cover the shared engine as well as this shell. Run individual tests with Node, for example `node 'Path of Boredom.Maui/tests/base-icons-and-death-scroll.test.mjs'` from the repository root. The browser layout tests use Microsoft Edge when available and explicitly skip that part when it isn't.

Also test the actual app: start a run, release the joystick, pick skills at levels 5 and 10, scroll the death screen, expand a ranking build, save/load offline, and sign in/out. Headless browser geometry is useful, but it isn't the same thing as an Android WebView under somebody's thumb.

Keep keys, passwords, local SDKs, and signed artifacts out of commits and backend source archives. The backend packaging script has its own allowlist for exactly that reason.

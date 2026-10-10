# Path of Boredom.Maui

The Android head. It hosts the shared Blazor game inside a `BlazorWebView`, then adds the things a phone needs: a floating joystick, full-screen menus, native Google sign-in, and a device save that doesn't depend on having a connection.

The game itself still lives in `Path of Boredom.Game`. Don't copy its pages or engine into this project to fix a mobile bug; change the shared version, or the mobile shell if it's genuinely a phone-only layout/input problem.

## What runs here

`MauiProgram.cs` registers the WebView, local authentication state, `OfflineGameSession`, and `MobileCloudGameSession`. The cloud session is the registered `IGameSession`, with the offline session underneath it for device storage. A local authorized Blazor page is not proof of an online account — the backend verifies Google identity separately.

Android is the shipping target, with a minimum API of 24 and release target API 36. The project also has an iOS target conditional on a Mac, but that isn't a claim that the Android sign-in/release flow has been implemented and tested for iOS.

## The mobile shell

The shared main menu is available from the persistent Main menu button and Pause. It freezes the current run in memory, offers the single Training grounds entry, and warns before quitting. `GameApplicationControl` closes the Android task through the optional shared `IGameApplicationControl` bridge. Save before quitting: in-memory progress is not a device save. The floating joystick now covers the whole arena rather than only its left half; interactive buttons and menus retain their own input. Compact Skills/Forge/Pause controls are placed below the XP bar.

- `wwwroot/js/mobile-shell.js` owns the floating left-thumb joystick. It appears where the touch begins and disappears on release, cancellation, or leaving combat.
- `wwwroot/js/mobile-menu.js` builds the Skills, Forge, Pause, Rankings, and Account menu layer. It hides trees for unselected combat skills while keeping attack, dodge, and flask available.
- `wwwroot/css/mobile-shell.css` handles the full-screen arena, controls, and overlays, including a scrollable run/death card.
- `wwwroot/css/mobile-menu.css` handles the panels, tabs, and detail views.
- Shared tree art comes from `Path of Boredom.Game/wwwroot/images/skills/`, including sword/bow/hammer regular attacks and dodge/flask SVGs. Absolute shared-asset URLs matter for CSS backgrounds as well as image elements.

The big rule is still **don't re-parent Blazor-rendered nodes**. The menu layer adds its own controls and uses CSS to lift the original sections into panels. Moving the existing nodes around can break Blazor's DOM bookkeeping and the engine's listeners at the same time.

## Closed-test build systems

- Level-up drafts only offer skill-specific cards for chosen abilities. Each of the six newer abilities per class has a ten-rank card granting +6% damage per rank and an eight-rank Forge track granting +10% damage, +8 reach, and +8% cooldown recovery per rank.
- The Forge has **Upgrades**, **Mastery**, and **Equipment** tabs. Weapon upgrades cap at 50 ranks and armor at 12. Unselected skill tracks stay hidden and don't block Mastery; selected tracks must be completed. Scrolls grant real Forge ranks, while capped or unselected rewards salvage into gold.
- Forge's Equipment tab provides free equipment styles: heavy weapons trade +20% damage for -15% cooldown recovery, quick weapons trade -15% damage for +20% recovery, heavy plates trade +8 armor for -12% movement, and light weave trades -8 armor for +12% movement. Balanced styles have no modifier. Change styles while paused or resting without losing gear ratings or Forge ranks.
- Better weapon/armor pickups equip automatically; weaker pickups salvage into gold. Gear improves equipment ratings, not Forge ranks. Rankings snapshot equipment names, ratings, and styles when a higher score is recorded.
- Optional challenges can be selected before the first wave or at a checkpoint: no health damage, no flasks, or clear within 180 combat seconds. Success grants 100 + 50 per stage gold; skipping or failing costs nothing.
- Training keeps the real run intact, restores health on fatal hits, and grants no loot, XP, saves, or rankings. Run summaries remain separate from save-status messages and track time, stages, flasks, spending, challenges, and damage by skill.
- **Pause → Run options → Set up practice** uses its own scrollable panel, separate from Forge. Choose an ability with inline buttons (no native dropdown), read its details, then select **Start practice** to close the panel and begin the countdown. Pause to change abilities; **Exit training** restores the original run. Practice replaces the first automatic skill while retaining the other two, and closing the app still loses unsaved real-run progress. The Pause menu repeats these instructions during training.
- **Challenges** is directly available on the mobile menu bar and in Pause. Its separate panel shows four inline choices, current stage progress, reward gold, and whether selection is available. Choices remain restricted to before the first wave or a five-wave checkpoint; challenges cannot be changed mid-stage or used in training.

## Sound and music

The shared `arpg-audio.js` synthesizes combat/UI sounds, ordinary menu-button clicks, and original ambient/boss loops through the WebView's Web Audio API. There are no external audio files to package. Open **Pause → Run options → Sound & music** for mute and separate music/effects volumes. Preferences stay on the device in WebView local storage and do not change save format 18 or cloud revisions.

Audio begins after a trusted touch/key gesture and stops when the page loses focus or becomes hidden. `App.xaml.cs` forwards the Android window-stop event through `MainPage.SuspendGame()` as `game-background`, pausing gameplay and suspending audio even if the WebView doesn't emit a visibility event. Returning doesn't automatically resume combat or suspended audio; interact to resume. Disposal stops voices/timers and closes the context.

`audio.test.mjs` validates synthesis/lifecycle contracts with a fake audio context. Also test the actual Android app with speakers and headphones: attack with each class, spam abilities, adjust both sliders, mute, restart the app, background during a boss warning, and return. Verify no background music remains and visual warnings still work when muted.

## Device first, cloud second

`OfflineGameSession.cs` keeps `offline-run.json` in the app's private data directory. Writes go through a temporary file and replacement move, malformed old saves are preserved before replacement, and downloading a cloud run keeps a `.before-cloud.json` backup. The current accepted save version is 18; earlier supported saves remain loadable.

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

## Building a closed-test bundle

The release entry point is `deployment/Publish-PlayBundle.ps1` at the repository root. Call it with an unused Play version code, for example `& './deployment/Publish-PlayBundle.ps1' -VersionCode 13` for the next bundle after V12.

The script retains `Internal-Test` in bundle filenames. That name doesn't select a Play track: upload the intended bundle to the closed-testing release, and verify which source changes it contains.

It expects local inputs that aren't part of a clean clone:

- `Play-Release/android-sdk` with the API 36 platform and the required SDK tooling.
- `Play-Release/API36-AndroidManifest.xml`.
- `.local-signing/pob-upload.jks` and `.local-signing/upload-password.txt`, using the existing upload-key alias.
- The .NET 9 Android/MAUI workload, plus the Java signing tools on the path.

The script clears generated Android Release outputs, publishes an AAB, signs it, verifies the signature, and refuses to overwrite an existing named bundle. The cleanup is intentional: stale resource designers previously produced an app that built successfully but crashed on startup.

The latest local artifact is `Play-Release/Path-of-Boredom-Internal-Test-v12-API36.aab`, with version code **12**, display version **0.5.0**, and target API **36**. Current internal-test coverage includes loadout-specific boons and scroll rewards, Forge reminder acknowledgement, mobile boss/countdown placement, background Endless checkpoint saves and retries, and varied encounters, alongside the earlier SVG, death-scroll, and ranking-layout fixes.

The current .NET 9 Android toolchain reports an API 35 compile-target/API 36 target warning during publishing. Verify the generated bundle's manifest, not just the filename. V11 passed signature and bundle validation; verify V12 separately and test the Play-delivered update on a device before wider rollout.

Building the bundle doesn't upload it, create a Play release, or deploy the API. Current source writes save format 18; deploy a matching API before testing cloud uploads. The `release` ranking tag is unchanged, so this update doesn't itself reset the boards.

## Checking changes

The suites in `tests/` cover the shared engine as well as this shell, including procedural audio. Run individual tests with Node, for example `node 'Path of Boredom.Maui/tests/base-icons-and-death-scroll.test.mjs'` from the repository root. The browser layout tests use Microsoft Edge when available and explicitly skip that part when it isn't. `closed-beta-regressions.test.mjs` checks loadout-specific offers and scroll rewards, Forge notification acknowledgement, mobile boss/countdown placement, automatic Endless save/retry flow, and encounter variety.

Also test the actual app: start a run, release the joystick, pick skills at levels 5 and 10, scroll the death screen, expand a ranking build, save/load offline, and sign in/out. Headless browser geometry is useful, but it isn't the same thing as an Android WebView under somebody's thumb.

`run-options-and-forge.test.mjs` covers chosen-skill cards and Forge bonuses, previews, scrolls, Mastery gating, older-save migration, training isolation, and Run options scrolling. `equipment-rankings.test.mjs` checks equipment snapshots across all class/style combinations, save round-trips, and later gear changes. On-device checks should also exercise all three Forge tabs, equipment styles, challenge rewards, and entering/exiting training without replacing the real run.

`training-flow.test.mjs` checks setup, ability swapping, countdown start, combat guards, and exact restoration of the original run. The Run options browser checks also expand the training controls and verify panel height, button widths, and reachable exit actions in portrait and short landscape.

Keep keys, passwords, local SDKs, and signed artifacts out of commits and backend source archives. The backend packaging script has its own allowlist for exactly that reason.

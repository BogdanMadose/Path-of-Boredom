# Path of Boredom

A small ARPG that started as an excuse to poke at .NET Aspire, Blazor, and a hand-rolled JavaScript canvas engine. Pick a class, fight through a 30-wave campaign across six areas, then keep going in Endless if you still have something to prove.

It now has an Android app too: .NET MAUI hosts the same Blazor components and game engine as the browser version. Mobile play is local-first, with optional Google sign-in for cloud saves and rankings. The browser host still uses Windows sign-in; that older identity path is only supported by the API in an explicitly enabled development setup.

This README is the map of the place. Read this first, then head into the project you actually need to touch.

## What the game looks like now

- Three classes: Ember Knight, Dawn Ranger, and Iron Warden. Each has nine combat abilities, so there are 27 class-specific choices rather than nine skills recoloured three times.
- Choose one starting automatic skill, another at level 5, and a third at level 10. Those choices stay locked for the run. Regular attacks are automatic on mobile; dodge and flask remain manual and don't use a skill slot.
- Earn one tree-upgrade point every two levels, up to 32. Forge upgrades, level-up boons, and post-forge training give you other ways to grow the character.
- Non-boss waves alternate swarms, elite pressure, ranged pressure, and mixed assaults. Bosses keep their own attack patterns and short recovery windows. Arena hazard circles get fresh sizes, positions, counts, and activation timings each wave after hazardous areas begin.
- Skills and rankings live inside the mobile game. Ranking boards are separate by class, difficulty, and starting mode; expand a record to see its automatic skills and upgrades.
- Skill-specific boons and upgrade scrolls follow the chosen loadout. Forge reminders acknowledge affordable offers, mobile boss/countdown displays stay clear of touch controls, and Endless checkpoints save in the background with a retry path on failure.
- The six newer abilities per class each have a chosen-skill card (+6% damage per rank, ten ranks) and a Forge track (+10% damage, +8 reach, and +8% cooldown recovery per rank, eight ranks). Weapon forging now reaches 50 ranks and armor 12; only selected skill tracks count toward unlocking post-forge training.
- Gear pickups improve equipment ratings, not Forge ranks; better gear equips automatically and weaker gear becomes gold. Free weapon and armor styles trade damage for recovery or armor for movement without losing ratings or Forge upgrades. Ranking build snapshots retain equipment names, ratings, and styles.
- Optional stage challenges reward avoiding health damage, skipping flasks, or finishing within 180 combat seconds. A separate training arena keeps the real run intact and grants no loot, XP, saves, or ranking scores. Run summaries track combat time, stages, flask use, gold spent, challenges, and damage by skill.

## The shape of the solution

There are seven projects now. The important split is between the shared game and the things that host it:

- `Path of Boredom.Game` — shared Razor pages, session interfaces, canvas engine, CSS, and SVG art.
- `Path of Boredom.Maui` — the Android Blazor Hybrid app, floating joystick, mobile menus, Google sign-in, and device/cloud save transport.
- `Path of Boredom.Web` — the Windows-authenticated Blazor Server host and its save/ranking relay.
- `Path of Boredom.ApiService` — authenticated saves, rankings, player names, and account deletion, backed by Firestore.
- `Path of Boredom.Contracts` — the small shared DTOs and validation rules used by the hosts and API.
- `Path of Boredom.ServiceDefaults` — Aspire health checks, telemetry, HTTP plumbing, and the legacy Windows service-auth options.
- `Path of Boredom.AppHost` — local Aspire orchestration for the Web and API projects. It doesn't launch the Android app or deploy anything.

Almost all gameplay lives under `Path of Boredom.Game/wwwroot/js/`, not under the Web project anymore. If you're looking for where a boss deals damage, start there. `Home.razor` provides the canvas and controls; `IGameSession` lets that same page save through whichever host is running it.

## Why it's built this way

Real-time combat is a better fit for a JS loop than for component diffing. The arrangement is still pretty simple: **JavaScript owns the simulation and rendering; C# owns identity and persistence.**

`Home.razor` imports `arpg.js` and calls `createGame(gameRoot, saveBridge)`. The engine calls back through `SaveRun`, `LoadRun`, and `SubmitScore`. On Android those calls reach `MobileCloudGameSession`; in the browser they reach `WindowsGameSession` and `GameSaveClient`.

The Android app never carries the Web host's shared service secret. It sends a Google ID token, and the API verifies it itself. Cloud saves and rankings live in Firestore, not in the container's filesystem, so replacing a Cloud Run revision doesn't wipe player progress.

## Running and checking things

The solution targets .NET 9. Android development needs the MAUI/Android workload and the appropriate Android SDK; the current Play release targets API 36. The web development path also needs the API's Firestore and Google identity configuration, plus the development-only Windows-auth switch if you want Web save calls to work. F5 isn't a substitute for those settings — see the AppHost notes.

For an ordinary compilation check, run `dotnet build "Path of Boredom.sln"` from the repository root. The gameplay and UI regressions are under `Path of Boredom.Maui/tests/`; they use Node and can be run individually, for example `node "Path of Boredom.Maui/tests/checkpoint-saves.test.mjs"`.

There are currently 14 test suites covering skills, saves, combat facing, bosses, encounters, menus, rankings, SVG paths, and death-screen scrolling. Some layout checks launch Microsoft Edge when it's available; otherwise they explicitly skip the browser part. A clean C# build alone can't tell you whether a touch menu actually scrolls.

## Releases: three different numbers, not one

The latest local Android bundle is `Play-Release/Path-of-Boredom-Internal-Test-v12-API36.aab`: Play version code **12**, display version **0.5.0**, and target API **36**. That is a build artifact, not a claim that it's already validated, uploaded, or rolled out.

The current source uses save format **18**, including run systems, chosen-skill cards, and the newer Forge tracks; earlier supported saves remain loadable. The mobile leaderboard tag is **`release`**, while the desktop patch board is **`004`**. Building an app bundle doesn't automatically change these tags, reset rankings, or redeploy the backend. Deploy an API that accepts format 18 before relying on cloud saves from this source.

The current testing track is **closed testing**. The local bundle's `Internal-Test` filename is an artifact name, not its Play track or proof that it includes every current source change.

`deployment/Publish-PlayBundle.ps1` builds and signs an AAB with a supplied version code. `deployment/Prepare-CloudSource.ps1` prepares a backend-only source archive. They're separate on purpose. A new app bundle doesn't install server changes, and restarting an old container doesn't install new code either. Nickname uniqueness, for example, needs the updated API deployed before it works live.

## Things worth knowing before you change anything

- **Keep save validation in step.** `arpg-save.js`, `GameSaveEndpoints.cs`, and the device save version gate must agree. If you change persisted state, update the version, migration, and validation together. Cosmetic facing and stage hazard layouts are transient; they don't add fields to the save.
- **Local and cloud saves aren't the same file.** Mobile keeps a device save and makes a backup before replacing it with a cloud run. Cloud uploads use revision checks, not whichever device has the newest-looking clock.
- **Don't ship signing material.** `Play-Release` and `.local-signing` contain local release inputs and artifacts. Keys and passwords belong outside source control and outside the backend archive.
- **Don't move Blazor-owned DOM nodes around.** The mobile menus lift the existing sections with CSS instead of re-parenting them. Breaking that rule can break both Blazor rendering and the game's event bindings.
- **JS state lives in the WebView/browser.** Blazor Server needs its circuit for interop, but the simulation isn't running on the server. A dropped circuit can interrupt saving; a reload loses anything that wasn't saved.

## Where to go next

- Local Aspire wiring → `Path of Boredom.AppHost/README.md`
- Android controls, device/cloud saves, and Play bundles → `Path of Boredom.Maui/README.md`
- Windows auth and the browser save relay → `Path of Boredom.Web/README.md`
- Firestore, token validation, account names, and backend deployment → `Path of Boredom.ApiService/README.md`
- Shared plumbing and where the contracts moved → `Path of Boredom.ServiceDefaults/README.md`
- Combat, skills, enemies, art, and save migrations → `Path of Boredom.Game/wwwroot/js/README.md`

## A note on the JS style

The engine is still plain ES modules: no bundler, no TypeScript, no separate frontend compilation step. Edit a module, reload the host, and the browser handles the import. That keeps a small hobby game approachable, but it also means the regression tests and actual playtesting matter. A typo in a property name won't politely wait for the next C# build to tell you about it.

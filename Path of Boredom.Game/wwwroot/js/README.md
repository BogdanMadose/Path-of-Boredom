# wwwroot/js — the actual game

This folder is the game, shared by the browser and Android hosts. Everything from "what does a Ranger's rebound shot do" to "where does the boss spawn" to "what goes in a save" lives here as plain ES modules.

`Home.razor` imports `/_content/PathOfBoredom.Game/js/arpg.js` and calls `createGame(gameRoot, saveBridge)`. The root is the whole game host element, not just the canvas: the UI controller needs the controls and overlays too.

If the combat numbers feel wrong, start here. If the death screen won't scroll, also check `Home.razor.css` and MAUI's `mobile-shell.css`; not every game-looking bug is a simulation bug.

## The module breakdown

- **`arpg.js`** — runtime entry point, input, setup flow, HUD updates, trees, forge, overlays, and save/ranking bridge calls. It also contains the main canvas renderer and mob artwork. `createGame()` returns the host-facing game instance.
- **`arpg-engine.js`** — simulation and balance. `createState()` builds a run, `step()` advances combat, `useSkill()` dispatches attacks/abilities, and wave/checkpoint helpers advance the journey. `damageHistory` feeds the death report: up to 12 post-mitigation hits from the last eight seconds.
- **`arpg-classes.js`** — the three classes' base stats, regular attack identities, weapon types, and descriptions.
- **`arpg-skills.js`** — loadout rules, the 27 class combat abilities, tree rank/prerequisite rules, names, icons, and respec behaviour. `TREE_NODES` supplies stable saved rank keys; `treeNodeDefinition()` adds the class-specific presentation and effects.
- **`arpg-skill-trees.js`** — the 72 named upgrades for the six newer abilities in each class, plus their range bonuses. The original attack/nova/burst/guard/dodge/flask trees are still defined in `arpg-skills.js`.
- **`arpg-skill-effects.js`** — distinct canvas effects for class abilities. These are presentation, not extra damage checks.
- **`arpg-cards.js`** — level-up boon definitions and three-card drafts. Skill-only cards are offered only for the selected loadout; old saved offers can be repaired deterministically rather than randomly rerolled.
- **`arpg-campaign.js`** — the six areas, 30 campaign waves, map flavour, enemy introductions, pickups, and forge catalogue. Endless cycles the areas rather than running out of maps.
- **`arpg-hazards.js`** — randomized hazard layouts shared by simulation and rendering. Count, position, radius, spawn delay, and activation period vary per wave; circles stay within the arena, avoid one another, and leave the centre clear.
- **`arpg-modifiers.js`** — elite traits. General enemy/boss scaling and attack behaviour also live in the engine.
- **`arpg-difficulty.js`** — Hard, Nightmare, and Inferno multipliers.
- **`arpg-facing.js`** — cosmetic body/weapon turning. The attack is immediate and accurately aimed; the art catches up without making the attack wait.
- **`arpg-graphics.js`** — reusable hero art, cached orb/body sprites, floor decoration, atmosphere, and loot icons. Not the entire renderer; look in `arpg.js` for enemies and the frame draw order.
- **`arpg-hud.js`** — the in-canvas mobile HUD.
- **`arpg-upgrade-preview.js`** — current-to-next forge stat previews.
- **`arpg-ranking.js`** — snapshots the recorded build and keeps the initial mobile release board separate from development scores.
- **`arpg-save.js`** — snapshot capture, restore, validation, and old-format migrations. This is the client half of the API save contract.

## The build rules, without the old manual slot

Each class has nine combat choices. Pick one starter, a second at level 5, and a third at level 10; choices are locked for the run. Attack, dodge, and flask have their own trees but never consume one of those three slots. Mobile targets regular attacks and selected combat abilities automatically, while dodge and flask stay manual.

Tree points arrive every two levels, capped at 32. Respeccing a tree refunds its points for gold, but doesn't let you swap the run's chosen ability. The serialized loadout still has an unused fourth auto entry and a manual value of `none` for compatibility. Don't mistake that storage shape for a fourth playable skill slot.

SVGs live in the shared `wwwroot/images/skills/` folder. `skillIcon()` returns an absolute `/_content/PathOfBoredom.Game/...` URL for every skill, including class-specific regular attacks and shared dodge/flask icons. This matters for CSS backgrounds: a relative URL that works in an `<img>` can resolve somewhere else when a stylesheet uses it.

## The general shape of a frame

The controller reads input, calls `step(state, input, dt)`, updates the page HUD, and renders the arena from that state. Damage and movement belong to the engine. Draw order, silhouettes, and animation belong to the rendering code. Keep those apart so a prettier weapon turn doesn't accidentally change attack cadence.

Hazard drawing and damage checks both use `arenaHazards()` and `hazardPhase()`. Don't go back to reading the fixed map templates for only one of them, or the player can be hurt by a circle drawn somewhere else.

Hazard layouts are cached per state/wave in a `WeakMap`, not serialized. Loading a save generates a fresh layout with its own activation delay. Cosmetic facing is transient too. If either becomes persisted gameplay state later, that needs an explicit save-contract change rather than sneaking a new property into snapshots.

## Save version discipline (worth repeating)

The current save format is **16**. Client capture/restore, `GameSaveEndpoints.cs`, and the device version gate in `OfflineGameSession.cs` need to agree.

When changing persisted state:

1. Bump the client capture version and API `CurrentSaveVersion`, and update the device gate.
2. Keep old saves working through a deliberate `restoreSnapshot()` migration/default path.
3. Add matching version-gated API validation, including numeric bounds and collection sizes.
4. Run checkpoint and class-skill save round-trips, not just a syntax check.

An AAB version code, a leaderboard tag, and this format number are different things. Art or CSS changes don't automatically need a new save format; a changed serialized shape does.

## Testing the part C# can't compile for you

Regression tests are under `Path of Boredom.Maui/tests/` even though most exercise these shared modules. Run them from the repository root with Node, for example `node "Path of Boredom.Maui/tests/class-skills.test.mjs"` or `node "Path of Boredom.Maui/tests/checkpoint-saves.test.mjs"`.

There are also browser-backed checks for SVG loading, death-screen scrolling, and ranking columns. They use a separate local Edge profile when Edge is available and say when browser checks are skipped. If one times out, check for a leftover test-profile process before blaming the layout or closing somebody's normal browser.

The modules still have no separate frontend build step. That's deliberate, but it doesn't remove the need to playtest: start a run, pick skills, upgrade, save/load, and die on a short screen. A green .NET build won't catch a wrong asset URL or a clipped restart button.

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
- **`arpg-encounters.js`** — swarm, elite-heavy, ranged-pressure, and mixed wave compositions. Every fifth wave still gets its boss; early enemy introductions and the population cap remain bounded.
- **`arpg-ui-state.js`** — transient presentation rules: background Endless checkpoints, acknowledgement of newly affordable Forge offers, and boss HUD clearance below mobile controls. None of this adds fields to saves.
- **`arpg-hazards.js`** — randomized hazard layouts shared by simulation and rendering. Count, position, radius, spawn delay, and activation period vary per wave; circles stay within the arena, avoid one another, and leave the centre clear.
- **`arpg-modifiers.js`** — elite traits. General enemy/boss scaling and attack behaviour also live in the engine.
- **`arpg-difficulty.js`** — Hard, Nightmare, and Inferno multipliers.
- **`arpg-facing.js`** — cosmetic body/weapon turning. The attack is immediate and accurately aimed; the art catches up without making the attack wait.
- **`arpg-graphics.js`** — reusable hero art, cached orb/body sprites, floor decoration, atmosphere, and loot icons. Not the entire renderer; look in `arpg.js` for enemies and the frame draw order.
- **`arpg-hud.js`** — the in-canvas mobile HUD.
- **`arpg-audio.js`** — procedural Web Audio effects and original area/boss music, device-only volume preferences, bounded voice scheduling, background suspension, and cleanup. The controller observes transient state changes; audio never changes simulation or saves.
- **`arpg-upgrade-preview.js`** — current-to-next forge stat previews.
- **`arpg-ranking.js`** — snapshots the recorded build and keeps the initial mobile release board separate from development scores.
- **`arpg-run-systems.js`** — equipment-style trade-offs, optional stage challenges and rewards, and run summaries. Training lifecycle and isolation live in the engine/controller.
- **`arpg-save.js`** — snapshot capture, restore, validation, and old-format migrations. This is the client half of the API save contract.

## The build rules, without the old manual slot

Each class has nine combat choices. Pick one starter, a second at level 5, and a third at level 10; choices are locked for the run. Attack, dodge, and flask have their own trees but never consume one of those three slots. Mobile targets regular attacks and selected combat abilities automatically, while dodge and flask stay manual.

Tree points arrive every two levels, capped at 32. Respeccing a tree refunds its points for gold, but doesn't let you swap the run's chosen ability. The serialized loadout still has an unused fourth auto entry and a manual value of `none` for compatibility. Don't mistake that storage shape for a fourth playable skill slot.

SVGs live in the shared `wwwroot/images/skills/` folder. `skillIcon()` returns an absolute `/_content/PathOfBoredom.Game/...` URL for every skill, including class-specific regular attacks and shared dodge/flask icons. This matters for CSS backgrounds: a relative URL that works in an `<img>` can resolve somewhere else when a stylesheet uses it.

## Cards, Forge, and equipment

Level-ups draft three distinct available cards. Skill-specific cards require the chosen loadout and respect rank caps; saved unavailable offers are replaced deterministically. Each newer ability has a `${skill}Oath` card giving +6% damage per rank, capped at ten. General boons remain separate from tree points and Forge ranks.

The six newer skill tracks grant +10% damage, +8 reach, and +8% cooldown recovery per Forge rank, capped at eight. Weapon ranks cap at 50 and armor at 12. `forgeSkillSelected()` gates purchases and visibility; `forgeComplete()` considers only shared upgrades and selected skill tracks before unlocking Mastery. Mastery prices remain independent: 1,000 + 100 × that stat's rank. Upgrade previews show effective current → next stats with current buffs and equipment styles.

Scrolls grant an actual Forge rank through `grantUpgrade()`; capped or unselected scrolls convert into gold. Weapon and armor pickups instead improve equipment ratings, automatically equipping only strictly better gear and salvaging weaker or tied drops. They don't grant Forge ranks or discard existing upgrades.

Equipment styles are free to change while paused, at camp, or after victory. Heavy weapons multiply damage by 1.2 and recovery by 0.85; quick weapons multiply damage by 0.85 and recovery by 1.2. Heavy plates add eight armor and multiply movement by 0.88; light weave subtracts eight armor and multiplies movement by 1.12. Balanced styles have no modifier; normal armor/recovery caps still apply. Ranking builds snapshot gear names, ratings, and styles rather than following later equipment changes.

Optional challenges are chosen before a stage starts and reward no health damage, no flasks, or a clear within 180 combat seconds. Success grants 100 + 50 × stage gold once; failure has no penalty. Training preserves the real run, restores health after fatal hits, and disables loot, XP, saving, and rankings. Run summaries track combat seconds, stages, flasks, gold spent, challenges, and per-skill damage.

Training setup uses inline ability buttons in the independent Run options menu, not a native select popup. `training-menu` events keep mobile setup in that panel and close it explicitly on Start practice or Exit training. Changing an ability swaps the first automatic slot without duplicating the other two. Training-specific Pause copy explains isolation and exit; `training-flow.test.mjs` verifies the controller restores the exact original run without altering its progression. Forge retains equipment, upgrades, and Mastery; Challenges has its own panel and mobile menu-bar entry with inline choices and eligibility/reward text.

## The general shape of a frame

The controller reads input, calls `step(state, input, dt)`, updates the page HUD, and renders the arena from that state. Damage and movement belong to the engine. Draw order, silhouettes, and animation belong to the rendering code. Keep those apart so a prettier weapon turn doesn't accidentally change attack cadence.

Hazard drawing and damage checks both use `arenaHazards()` and `hazardPhase()`. Don't go back to reading the fixed map templates for only one of them, or the player can be hurt by a circle drawn somewhere else.

Hazard layouts are cached per state/wave in a `WeakMap`, not serialized. Loading a save generates a fresh layout with its own activation delay. Cosmetic facing is transient too. If either becomes persisted gameplay state later, that needs an explicit save-contract change rather than sneaking a new property into snapshots.

## Sound and music lifecycle

`createGameAudio()` lazily creates an `AudioContext` after trusted pointer/keyboard interaction. It synthesizes all effects and the original looping soundtrack with oscillators and generated noise; no downloaded audio assets or licenses are required. Class attacks and chosen skills have distinct tones, areas vary the ambient melody, and living bosses select a faster theme.

Settings live under `path-of-boredom.audio.v1` in local storage, independently of the player/account save. Defaults are 25% music and 55% effects; both buses have separate sliders plus a global mute in the independent Run options menu. Trusted ordinary button clicks play a short throttled cue; combat controls retain their action sounds. Missing/blocked storage or unsupported audio must not prevent playing.

Impact and loot cues are throttled, effects have a 16-voice ceiling, and all audio has a 40-voice ceiling with a compressor on the output. Pausing/countdowns stop music; document hiding, window blur, page exit, and Android's `game-background` event stop all voices and suspend the context. Returning requires interaction before resuming a suspended context. Disposal clears timers, stops sources, and closes the context. Audio is supplemental: boss warnings still have their visual indicators.

`audio.test.mjs` checks generation and lifecycle with a fake audio context, including preferences, gesture gating, throttling, music transitions, save isolation, and disposal. It does not measure sound quality: test the mix, mute/volume persistence, rapid casts, background/resume, and speakers/headphones in an actual browser and Android WebView.

## Save version discipline (worth repeating)

The current save format is **18**. Format 17 added run systems and chosen-skill cards; format 18 adds the six newer Forge tracks. Formats 1–17 remain supported through explicit migration/defaults; missing newer Forge ranks in format 16/17 saves start at zero. Client capture/restore, `GameSaveEndpoints.cs`, and the device version gate in `OfflineGameSession.cs` need to agree. Training sessions cannot be captured as saves.

When changing persisted state:

1. Bump the client capture version and API `CurrentSaveVersion`, and update the device gate.
2. Keep old saves working through a deliberate `restoreSnapshot()` migration/default path.
3. Add matching version-gated API validation, including numeric bounds and collection sizes.
4. Run checkpoint and class-skill save round-trips, not just a syntax check.

An AAB version code, a leaderboard tag, and this format number are different things. Art or CSS changes don't automatically need a new save format; a changed serialized shape does.

## Testing the part C# can't compile for you

Regression tests are under `Path of Boredom.Maui/tests/` even though most exercise these shared modules. Run them from the repository root with Node, for example `node "Path of Boredom.Maui/tests/class-skills.test.mjs"` or `node "Path of Boredom.Maui/tests/checkpoint-saves.test.mjs"`.

`run-options-and-forge.test.mjs` covers chosen-skill card/Forge gating, real bonuses, previews, scrolls, Mastery unlocks, format 16/17 migration, training isolation, and mobile Run options. `equipment-rankings.test.mjs` covers equipment/class snapshots across saves and JSON, including protection against later gear mutations.

There are also browser-backed checks for SVG loading, death-screen scrolling, and ranking columns. They use a separate local Edge profile when Edge is available and say when browser checks are skipped. If one times out, check for a leftover test-profile process before blaming the layout or closing somebody's normal browser.

The modules still have no separate frontend build step. That's deliberate, but it doesn't remove the need to playtest: start a run, pick skills, upgrade, save/load, and die on a short screen. A green .NET build won't catch a wrong asset URL or a clipped restart button.

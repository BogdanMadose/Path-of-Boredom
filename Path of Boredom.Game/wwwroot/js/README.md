# wwwroot/js — the actual game

This folder is the game. Everything from "what does a Ranger's ricochet do" to "how does a wave of enemies spawn" to "what does the save file look like" lives here as plain ES modules, imported with no bundler and no build step. `Home.razor` on the C# side just does `import("./js/arpg.js")` and hands it a canvas element — from that point on, this code owns the render loop, input handling, combat, and (via `arpg-save.js`) talking back to Blazor to persist progress.

If you're chasing a gameplay bug (numbers feel wrong, an enemy behaves oddly, a skill doesn't proc right), you almost certainly want a file in here, not a `.razor` file.

## The module breakdown

- **`arpg.js`** — the entry point and UI controller. This is what `createGame()` returns. It owns the pause menu, the setup dialog (difficulty/class/loadout pickers), the skills & loadout panel, tooltips, the forge, save/load button wiring (including the retry-on-failure flow when a server save call fails), and the keyboard/mouse input listeners. It calls into `arpg-engine.js` for the actual simulation step and into `arpg-save.js`/`arpg-ranking.js` when it needs to talk to the Blazor bridge. If a UI element on the page doesn't do anything, the wiring for it is missing here, not in the `.razor` file.
- **`arpg-engine.js`** — the simulation. `createState()` builds a fresh run's state (player stats, wave counters, entity lists), `step()` advances one frame (movement, collisions, skill cooldowns, enemy AI, loot), `spawnWave()`/`finishCheckpoint()` handle wave progression and checkpoint saves, and `useSkill()` dispatches to whatever a class's skill actually does. This is the biggest file and the one most balance/bug work touches. `damageHistory` here is what feeds the death report panel on the game-over screen (last ~12 hits, post-mitigation, in the last 8 seconds).
- **`arpg-classes.js`** — base stats and identity for the three classes (Ember Knight, Dawn Ranger, Iron Warden): starting health/damage/speed, class-specific skill unlocks, and the flavor text shown in the setup dialog's class preview.
- **`arpg-skills.js`** — skill trees. `TREE_NODES` is the actual tree data (per-class nodes with effects and prerequisites), `newSkillTree()` builds a fresh tree for a new character, `skillPointsEarned()` computes how many points a level total should have granted (one per 5 levels, capped at 12 — matches the text in `Home.razor`'s controls legend), and `respecTree()` resets spent points so a player can rebuild. If you add a new node, you also need to check `arpg-save.js` can serialize/restore it and that `arpg-ranking.js`'s build snapshot picks it up for the leaderboard.
- **`arpg-cards.js`** — the level-up draft system: what three boons get offered on level-up, their categories/ranks, and how a chosen card modifies the run. This is what powers the "Choose your next oath" overlay.
- **`arpg-modifiers.js`** — elite/enemy modifier definitions (the traits that make some enemies hit harder, move faster, explode on death, etc. as the campaign and Endless mode progress). Enemy difficulty scaling generally starts here or in `arpg-engine.js`'s wave/scaling logic.
- **`arpg-difficulty.js`** — the three difficulty presets (Hard/Nightmare/Inferno) and whatever multipliers they apply to enemy stats, player healing, etc.
- **`arpg-campaign.js`** — the 30-wave, 6-area campaign structure: which wave belongs to which chapter/area, boss waves, and the flavor text (chapter titles, map descriptions) shown in the HUD.
- **`arpg-upgrade-preview.js`** — computes the "next rank" preview numbers shown in the forge/upgrade UI, so a player can see what a rank-up actually does before spending points on it.
- **`arpg-ranking.js`** — `captureRankingBuild()` snapshots the current build (class, upgrades, tree ranks) into the shape `RankingRules` on the server expects, then `arpg.js` hands that to Blazor's `SubmitScore` bridge on a death or milestone.
- **`arpg-save.js`** — serialization. `captureSnapshot()` turns live engine state into the versioned JSON blob that gets PUT to the API; `restoreSnapshot()` does the reverse when loading, including migrating older save versions forward. **This file's shape has to match `GameSaveEndpoints.cs`'s validation on the server exactly, version for version** — there's no shared schema, you keep them in sync by hand. See the solution root README and the `ApiService` README for why this matters and what happens when it drifts (the `.corrupt` backup mechanism exists because of exactly this kind of mismatch).
- **`arpg-graphics.js`** — canvas rendering: drawing the player, enemies, projectiles, particles, and HUD overlays each frame. Pure presentation, doesn't mutate game state.

## The general shape of a frame

`arpg.js`'s render loop calls `arpg-engine.js`'s `step()` with input state and delta time, gets back updated state, then hands that state to `arpg-graphics.js` to draw. Anything that reads as "why did the character take damage they shouldn't have" is a `step()` question; anything that reads as "why does it look wrong on screen" is a `arpg-graphics.js` question — worth separating those two before you start debugging.

## Save version discipline (worth repeating here too)

`CurrentSaveVersion` lives on both this side (`arpg-save.js`) and the API side (`GameSaveEndpoints.cs`), and they are currently at version 14. If you add or change a field in the state that gets captured/restored:

1. Bump the version constant in both places.
2. Add a new `if (version >= N)` branch in `restoreSnapshot()` here for backward compatibility with older saves.
3. Add matching validation in `IsValidState(state, version)` on the API side.

Skipping any of these three steps is the single most common way this project's save system breaks. If a player reports "save is failing" right after a deploy, this mismatch is the first thing to check.

## No build step, on purpose

These are plain `<script type="module">`-style ES modules loaded straight by the browser — no webpack, no TypeScript, no minification. That's a deliberate tradeoff for a small project: you edit a `.js` file, refresh the page, done. The cost is there's no compile-time safety net here at all; typos in property names or wrong argument counts fail silently or at runtime in the console, not at build time. Test changes by actually playing through the affected system (start a run, level up, save/load, die) rather than assuming a clean build means it works.

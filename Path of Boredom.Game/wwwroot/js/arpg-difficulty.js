// arpg-difficulty.js — the three displayed difficulty presets (Easy / Medium / Hard).
//
// Each entry is a flat multiplier table applied to enemy stats and player healing; there is no
// other difficulty preset logic anywhere else, everything reads from DIFFICULTIES via
// difficultyFor(). Enemy base movement, wave composition, and fresh-run kits are tuned in arpg-engine.js.
//
// Multiplier meanings:
//   health  — multiplier applied to every enemy's max health.
//   damage  — multiplier applied to every enemy's damage output.
//   speed   — multiplier applied to every enemy's movement speed.
//   healing — multiplier applied to how much health potions/flasks restore (lower = harsher).
//   extra   — how many additional enemies spawn per wave on top of the base wave count.
export const DIFFICULTIES = {
    hard: { name: "Easy", description: "A forgiving run with nearly full flask value. Enemies still arrive in active waves, so keep moving and use your skills.", health: 1.2, damage: 1.08, speed: 1.08, healing: 0.95, extra: 3 },
    nightmare: { name: "Medium", description: "The recommended challenge. Enemies hit harder and close distance faster, while upgrades give you room to build momentum.", health: 1.45, damage: 1.25, speed: 1.14, healing: 0.85, extra: 5 },
    inferno: { name: "Hard", description: "A demanding run for experienced players. Expect tougher enemies, denser waves, and less healing.", health: 1.75, damage: 1.5, speed: 1.2, healing: 0.75, extra: 7 }
};

// Looks up the active difficulty preset for a given game state, falling back to Easy if the
// state's difficulty key is somehow missing/unrecognized (defensive — shouldn't happen given the
// save validation on the API side, but keeps rendering/combat code from crashing on bad state).
export const difficultyFor = state => DIFFICULTIES[state.difficulty] ?? DIFFICULTIES.hard;

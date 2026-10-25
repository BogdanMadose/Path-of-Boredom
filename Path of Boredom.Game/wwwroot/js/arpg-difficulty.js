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
    hard: { name: "Easy", description: "The gentlest setting. Enemies are still dangerous in groups, so use movement, flasks, and upgrades to survive. Healing restores 75% of its normal amount.", health: 1.45, damage: 1.3, speed: 1.16, healing: 0.75, extra: 3 },
    nightmare: { name: "Medium", description: "A demanding run for players who know the basics. Enemies are tougher, faster, and more numerous. Healing restores 58% of its normal amount.", health: 1.85, damage: 1.65, speed: 1.25, healing: 0.58, extra: 5 },
    inferno: { name: "Hard", description: "The harshest setting, for experienced players. Expect dense waves, fast enemies, and little room to recover. Healing restores 40% of its normal amount.", health: 2.35, damage: 2.05, speed: 1.32, healing: 0.4, extra: 7 }
};

// Looks up the active difficulty preset for a given game state, falling back to Easy if the
// state's difficulty key is somehow missing/unrecognized (defensive — shouldn't happen given the
// save validation on the API side, but keeps rendering/combat code from crashing on bad state).
export const difficultyFor = state => DIFFICULTIES[state.difficulty] ?? DIFFICULTIES.hard;

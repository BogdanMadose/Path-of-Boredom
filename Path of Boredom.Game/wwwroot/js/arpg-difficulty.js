// arpg-difficulty.js — the three difficulty presets (Hard / Nightmare / Inferno).
//
// Each entry is a flat multiplier table applied to enemy stats and player healing; there is no
// other difficulty-related logic anywhere else, everything reads from DIFFICULTIES via
// difficultyFor(). If you're tuning difficulty balance, this is almost always the only file you need.
//
// Multiplier meanings:
//   health  — multiplier applied to every enemy's max health.
//   damage  — multiplier applied to every enemy's damage output.
//   speed   — multiplier applied to every enemy's movement speed.
//   healing — multiplier applied to how much health potions/flasks restore (lower = harsher).
//   extra   — how many additional enemies spawn per wave on top of the base wave count.
export const DIFFICULTIES = {
    hard: { name: "Hard", description: "The easiest of the three difficulties and the recommended starting point. Enemies are less durable, slower, and hit less hard than on the higher tiers. Healing restores 80% of its normal amount.", health: 1.3, damage: 1.2, speed: 1.08, healing: 0.8, extra: 2 },
    nightmare: { name: "Nightmare", description: "The middle difficulty, for players comfortable with Hard. More enemies per wave; enemies are tougher, faster, and hit harder. Healing restores only 60% of its normal amount.", health: 1.7, damage: 1.5, speed: 1.16, healing: 0.6, extra: 4 },
    inferno: { name: "Inferno", description: "The hardest difficulty, for experienced players. The most enemies per wave, with the highest health, damage, and speed. Healing restores only 40% of its normal amount, so mistakes are much harder to recover from.", health: 2.2, damage: 1.9, speed: 1.24, healing: 0.4, extra: 6 }
};

// Looks up the active difficulty preset for a given game state, falling back to Hard if the
// state's difficulty key is somehow missing/unrecognized (defensive — shouldn't happen given the
// save validation on the API side, but keeps rendering/combat code from crashing on bad state).
export const difficultyFor = state => DIFFICULTIES[state.difficulty] ?? DIFFICULTIES.hard;
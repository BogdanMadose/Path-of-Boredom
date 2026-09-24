export const DIFFICULTIES = {
    hard: { name: "Hard", description: "The easiest of the three difficulties and the recommended starting point. Enemies are less durable, slower, and hit less hard than on the higher tiers. Healing restores 80% of its normal amount.", health: 1.3, damage: 1.2, speed: 1.08, healing: 0.8, extra: 2 },
    nightmare: { name: "Nightmare", description: "The middle difficulty, for players comfortable with Hard. More enemies per wave; enemies are tougher, faster, and hit harder. Healing restores only 60% of its normal amount.", health: 1.7, damage: 1.5, speed: 1.16, healing: 0.6, extra: 4 },
    inferno: { name: "Inferno", description: "The hardest difficulty, for experienced players. The most enemies per wave, with the highest health, damage, and speed. Healing restores only 40% of its normal amount, so mistakes are much harder to recover from.", health: 2.2, damage: 1.9, speed: 1.24, healing: 0.4, extra: 6 }
};
export const difficultyFor = state => DIFFICULTIES[state.difficulty] ?? DIFFICULTIES.hard;

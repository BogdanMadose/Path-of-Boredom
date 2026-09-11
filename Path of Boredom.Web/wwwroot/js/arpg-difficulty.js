export const DIFFICULTIES = {
    hard: { name: "Hard", health: 1.3, damage: 1.2, speed: 1.08, healing: 0.8, extra: 2 },
    nightmare: { name: "Nightmare", health: 1.7, damage: 1.5, speed: 1.16, healing: 0.6, extra: 4 },
    inferno: { name: "Inferno", health: 2.2, damage: 1.9, speed: 1.24, healing: 0.4, extra: 6 }
};
export const difficultyFor = state => DIFFICULTIES[state.difficulty] ?? DIFFICULTIES.hard;

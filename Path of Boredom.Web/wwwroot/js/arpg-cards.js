export const LEVEL_CARDS = {
    edge: { name: "Sunforged oath", category: "OFFENSE", max: Number.MAX_SAFE_INTEGER, description: "+6% weapon damage per rank, affecting cleave and nova. Stacks with your forge and blessings." },
    vitality: { name: "Heart of the dawn", category: "SURVIVAL", max: Number.MAX_SAFE_INTEGER, description: "+20 maximum health and restore 20 health immediately. Each rank adds another 20." },
    bulwark: { name: "Unbroken vow", category: "DEFENSE", max: 10, description: "+3 armor per rank. Combines with equipment and forge armor, up to the normal 65% reduction cap." },
    stride: { name: "Wayfarer's instinct", category: "MOBILITY", max: 10, description: "+5% movement speed per rank, up to +50%. Stacks with Windwake; does not change dodge distance." },
    focus: { name: "Quiet flame", category: "SKILLS", max: 10, description: "+6% skill cooldown recovery per rank, up to +60%. Affects cleave, nova, dodge, and flasks." },
    nova: { name: "Widening sunrise", category: "NOVA", max: 10, description: "+12 ember nova radius per rank, up to +120. Stacks with Solar heart forge upgrades." },
    cleave: { name: "Horizon cutter", category: "CLEAVE", max: 10, description: "+8 cleave reach per rank, up to +80. Strike the horde before it reaches you." },
    harvest: { name: "Call of the fallen", category: "UTILITY", max: 10, description: "+20 loot attraction range per rank, up to +200. Works with the Gravetide blessing." },
    siphon: { name: "Ashdrinker", category: "SUSTAIN", max: 10, description: "Recover a third of a heart per kill per rank, up to 3.5 at max rank. Healing never exceeds maximum health." },
    fortune: { name: "The ferryman's due", category: "WEALTH", max: Number.MAX_SAFE_INTEGER, description: "+10% gold from gold pickups per rank. Stacks across the run; equipment salvage is unchanged." }
};

export function drawLevelCards(state) {
    const available = Object.keys(LEVEL_CARDS).filter(key => state.boons[key] < LEVEL_CARDS[key].max);
    const choices = [];
    for (let i = 0; i < 3; i++) {
        const index = Math.floor(state.random() * available.length);
        choices.push(available.splice(index, 1)[0]);
    }
    return choices;
}

import { classFor } from "./arpg-classes.js";

export const SKILL_KEYS = ["attack", "nova", "burst", "guard", "dodge", "potion"];
export const SLOTTABLE_SKILLS = ["nova", "burst", "guard"];
export const wardUnlockWave = state => state.rankingMode === "endless" ? 41 : 11;
export const skillUnlocked = (state, skill) => skill !== "guard" || state.wave >= wardUnlockWave(state);
export const wardUnlockHint = state => state.rankingMode === "endless" ? "Unlocks at Echo 11 (third five-wave stage)" : "Unlocks at stage 3 (wave 11)";
export const AUTO_COOLDOWN = 1.6;
export const MAX_SKILL_POINTS = 32;
export const SKILL_POINT_INTERVAL = 2;
export const TREE_SLOTS = ["root", "left", "right", "capstone"];
export const TREE_NODES = {
    attack: {
        edge: { name: "Honed edge", max: 3, icon: "⚔", visual: "steel", detail: "+8% regular-attack damage per rank. Adds silver impact rays." },
        sweep: { name: "Long reach", max: 2, icon: "↔", visual: "steel", detail: "+10% regular-attack reach or arrow range per rank. Lengthens swings and adds arrow markings." },
        execution: { name: "Finisher", max: 1, icon: "◆", visual: "crimson", detail: "Regular attacks deal 25% more damage to enemies at or below 35% health. A crimson mark identifies finishing blows." },
        rhythm: { name: "Weapon tempo", max: 2, icon: "»", visual: "steel", detail: "+6% regular-attack speed per rank. Adds silver motion streaks; does not affect other skills." }
    },
    nova: {
        amplitude: { name: "Amplify", max: 3, icon: "✦", visual: "solar", detail: "+10% class-special damage per rank. Adds golden pulse rays." },
        resonance: { name: "Resonance", max: 2, icon: "◎", visual: "solar", detail: "+10% special radius or volley range per rank. Adds a larger outer ring and arrow markings." },
        ignition: { name: "Sunfire", max: 1, icon: "♨", visual: "fire", detail: "The class special deals 15% additional fire damage. Ignites its pulse or volley arrows." },
        chill: { name: "Chilling wake", max: 2, icon: "❄", visual: "frost", detail: "Special hits slow enemy walking by 15% per rank for 1.5s. Charges are unaffected. Chilled targets gain a frost ring." }
    },
    burst: {
        focus: { name: "Concentrate", max: 3, icon: "✧", visual: "violet", detail: "+12% burst damage per rank. Adds violet impact rays." },
        aperture: { name: "Shape", max: 2, icon: "⋔", visual: "violet", detail: "Changes the shape of your class burst." },
        shatter: { name: "Giant slayer", max: 1, icon: "⬟", visual: "crimson", detail: "Burst hits deal 25% more damage to elites and bosses. Adds a crimson impact mark on those targets." },
        overdrive: { name: "Overdrive", max: 2, icon: "ϟ", visual: "violet", detail: "+10 percentage points critical chance per rank for burst hits only, respecting the 75% cap. Adds violet casting sparks." }
    },
    guard: {
        barrier: { name: "Bulwark", max: 3, icon: "⬡", visual: "shield", detail: "+5 percentage points ward damage reduction per rank: 40% becomes up to 55%. Thickens the ward shield." },
        duration: { name: "Enduring ward", max: 2, icon: "◷", visual: "shield", detail: "+0.6s ward duration per rank. Adds a second protective ring." },
        repulse: { name: "Repulsion", max: 1, icon: "↗", visual: "shield", detail: "The ward's opening pulse pushes living enemies back 60 units; bosses are pushed 30. Shows an outward repulsion wave." },
        refuge: { name: "Safe haven", max: 2, icon: "+", visual: "healing", detail: "When the ward expires, restore 2% maximum health per rank, subject to difficulty healing penalties. Shows a green healing cross." }
    },
    dodge: {
        agility: { name: "Ghoststep", max: 3, icon: "◇", visual: "wind", detail: "+0.04s dodge invulnerability per rank. Adds a pale evasion outline." },
        distance: { name: "Long stride", max: 2, icon: "»", visual: "wind", detail: "+0.025s roll duration per rank, increasing dodge distance. Lengthens the dodge trail." },
        afterstep: { name: "Windstep", max: 1, icon: "≋", visual: "wind", detail: "Dodging grants +20% walking speed for 1.2s, including the roll time. The roll's speed stays unchanged. Adds cyan foot trails." },
        recovery: { name: "Quick footing", max: 2, icon: "↻", visual: "wind", detail: "+10% dodge cooldown recovery per rank. Adds cyan recovery streaks; does not affect other skills." }
    },
    potion: {
        concentration: { name: "Distill", max: 3, icon: "+", visual: "healing", detail: "+10% flask healing per rank. Strengthens the green healing-cross effect." },
        triage: { name: "Triage", max: 2, icon: "✚", visual: "amber", detail: "+12% flask healing per rank when drinking at or below 35% health. Adds an amber emergency-healing cross." },
        tonic: { name: "Iron tonic", max: 1, icon: "⬡", visual: "shield", detail: "Drinking a flask grants 25% damage reduction for 2s, stacking multiplicatively with ward and armor. Adds a blue tonic shield." },
        renewal: { name: "Renewal", max: 2, icon: "❧", visual: "healing", detail: "After drinking, regenerate 4% maximum health per rank over 2s, subject to difficulty penalties. Another flask refreshes rather than stacks regeneration. Adds a green regeneration aura." }
    }
};
export const EXTRA_SKILLS = {
    knight: { burst: { name: "Flame lance", cooldown: 8, reach: 380, damage: 2.4, shape: "beam" }, guard: { name: "Ember aegis", cooldown: 12, reach: 125, damage: 0.8 } },
    ranger: { burst: { name: "Piercing rain", cooldown: 9, reach: 760, damage: 1.1, shape: "arrows" }, guard: { name: "Briar ward", cooldown: 11, reach: 180, damage: 0.65 } },
    warden: { burst: { name: "Fault line", cooldown: 10, reach: 280, damage: 3.2, shape: "cone" }, guard: { name: "Iron bastion", cooldown: 14, reach: 150, damage: 1.2 } }
};
export const skillName = (state, key) => key === "attack" ? classFor(state).attackName : key === "nova" ? classFor(state).specialName
    : key === "dodge" ? "Dodge" : key === "potion" ? "Life flask" : EXTRA_SKILLS[state.heroClass][key].name;
export const treeNodeKey = (skill, slot) => Object.keys(TREE_NODES[skill])[TREE_SLOTS.indexOf(slot)];
export const newSkillTree = () => Object.fromEntries(SKILL_KEYS.map(key => [key, Object.fromEntries(Object.keys(TREE_NODES[key]).map(node => [node, 0]))]));
export const skillPointsEarned = state => Math.min(MAX_SKILL_POINTS, Math.floor(state.player.level / SKILL_POINT_INTERVAL));
export const skillPointsLeft = state => skillPointsEarned(state) - Object.values(state.skillTree).reduce((total, nodes) => total + Object.values(nodes).reduce((sum, rank) => sum + rank, 0), 0);
export const treePrerequisitesMet = (state, skill, node) => {
    const keys = Object.keys(TREE_NODES[skill]);
    return node === keys[0] || (node === keys[3] ? state.skillTree[skill][keys[1]] > 0 || state.skillTree[skill][keys[2]] > 0 : state.skillTree[skill][keys[0]] > 0);
};
export const canLearnSkill = (state, skill, node) => SKILL_KEYS.includes(skill) && skillUnlocked(state, skill) && Object.hasOwn(TREE_NODES[skill], node)
    && ["paused", "camp", "won"].includes(state.status) && skillPointsLeft(state) > 0 && state.skillTree[skill][node] < TREE_NODES[skill][node].max
    && treePrerequisitesMet(state, skill, node);
export function learnSkill(state, skill, node) {
    if (!canLearnSkill(state, skill, node)) return false;
    state.skillTree[skill][node]++;
    state.journal = `${skillName(state, skill)}: ${treeNodeDefinition(state, skill, node).name} learned. ${skillPointsLeft(state)} skill points remain.`;
    return true;
}
export const validLoadout = (state, manual, auto) => SLOTTABLE_SKILLS.includes(manual) && skillUnlocked(state, manual)
    && Array.isArray(auto) && auto.length === 2
    && auto.every(key => key === "none" || SLOTTABLE_SKILLS.includes(key) && skillUnlocked(state, key) && key !== manual)
    && new Set(auto.filter(key => key !== "none")).size === auto.filter(key => key !== "none").length;
export function setLoadout(state, manual, auto) {
    if (!["paused", "camp", "won"].includes(state.status) || !validLoadout(state, manual, auto)) return false;
    state.loadout = { manual, auto: [...auto] };
    if (manual === "guard" || auto.includes("guard")) state.wardUnlockSeen = 1;
    return true;
}

export function treeNodeDefinition(state, skill, node) {
    const definition = TREE_NODES[skill][node];
    if (skill !== "burst" || node !== "aperture") return definition;
    const shape = state.heroClass === "knight" ? { name: "Broad lance", detail: "+20% Flame lance beam width per rank. Widens the visible beam as well as its hit area." }
        : state.heroClass === "ranger" ? { name: "Arrow storm", detail: "+2 Piercing rain arrows per rank, from seven to eleven. Adds visible arrows within the same fan." }
        : { name: "Rift fan", detail: "+10 degrees to each side of Fault line's cone per rank. Widens its visible strike arc." };
    return { ...definition, ...shape };
}

export function treeNodeStatus(state, skill, node) {
    const rank = state.skillTree[skill][node];
    const keys = Object.keys(TREE_NODES[skill]);
    if (!skillUnlocked(state, skill)) return wardUnlockHint(state);
    if (rank >= TREE_NODES[skill][node].max) return "Fully learned";
    if (!treePrerequisitesMet(state, skill, node)) return node === keys[3]
        ? `Requires ${treeNodeDefinition(state, skill, keys[1]).name} or ${treeNodeDefinition(state, skill, keys[2]).name} rank 1`
        : `Requires ${treeNodeDefinition(state, skill, keys[0]).name} rank 1`;
    if (!skillPointsLeft(state)) return `No points available — earn one every ${SKILL_POINT_INTERVAL} levels, up to ${MAX_SKILL_POINTS}`;
    if (!["paused", "camp", "won"].includes(state.status)) return "Pause to learn this upgrade";
    return "Spend 1 point to learn the next rank";
}

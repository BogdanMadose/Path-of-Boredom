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
    knight: { burst: { name: "Flame lance", cooldown: 8, reach: 380, damage: 2.1, shape: "beam" }, guard: { name: "Ember aegis", cooldown: 12, reach: 125, damage: 0.8 } },
    ranger: { burst: { name: "Piercing rain", cooldown: 8, reach: 760, damage: 1.15, shape: "arrows" }, guard: { name: "Briar ward", cooldown: 11, reach: 180, damage: 0.65 } },
    warden: { burst: { name: "Fault line", cooldown: 11, reach: 250, damage: 2.6, shape: "cone" }, guard: { name: "Iron bastion", cooldown: 14, reach: 150, damage: 1 } }
};
const CLASS_TREE_NAMES = {
    knight: {
        attack: ["Tempered blade", "Flame arc", "Finisher", "Duelist tempo"], nova: ["Furnace", "Heat wave", "Sunfire", "Backdraft"],
        burst: ["Lance tip", "Broad lance", "Searing thrust", "Flashpoint"], guard: ["Ember shell", "Banked coals", "Cinder reprisal", "Hearth"],
        dodge: ["Cinder step", "Flame stride", "Hot pursuit", "Light footing"], potion: ["Warm draught", "Last ember", "Tempered tonic", "Rekindle"]
    },
    ranger: {
        attack: ["Keen fletching", "Longbow", "Trickshot", "Quickdraw"], nova: ["Draw strength", "Farflight", "Bodkin volley", "Briar barbs"],
        burst: ["Rain of thorns", "Arrow storm", "Deep penetration", "Deadeye"], guard: ["Barkskin", "Evergreen", "Briar snare", "Herbal refuge"],
        dodge: ["Foxstep", "Bounding stride", "Tailwind", "Trail runner"], potion: ["Herbal brew", "Field dressing", "Bark tonic", "Regrowth"]
    },
    warden: {
        attack: ["Forged hammer", "Heavy sweep", "Shieldbreaker", "Hammer rhythm"], nova: ["Tectonic force", "Fault radius", "Seismic core", "Quaking ground"],
        burst: ["Rift pressure", "Rift fan", "Giant slayer", "Crushing force"], guard: ["Iron wall", "Anchored stance", "Bulldozer", "Stone shelter"],
        dodge: ["Iron resolve", "Heavy stride", "Unstoppable", "Sure footing"], potion: ["Mineral draught", "Emergency repair", "Iron tonic", "Reconstruction"]
    }
};
const CLASS_TREE_EFFECTS = {
    knight: {
        "nova.chill": { icon: "↗", detail: "Ember nova pushes surviving enemies back 16 units per rank; bosses move half as far. Replaces slowing with a fiery outward shockwave." },
        "burst.shatter": { icon: "♨", detail: "Flame lance deals 25% more damage to targets at or below 50% health. An ember mark identifies the finishing hit." },
        "guard.repulse": { icon: "✹", detail: "Double Ember aegis opening-pulse damage. Releases a fiery blast instead of knocking enemies back." }
    },
    ranger: {
        "attack.execution": { icon: "↝", detail: "Dawn shot ricochets once to a different living enemy within 180 units for 60% damage. A green tracer connects the targets. Cannot bounce back." },
        "nova.ignition": { icon: "➶", detail: "Each Sunburst volley arrow penetrates one additional target in its remaining flight path for 70% damage. Green tracers show the piercing path; no added fire damage." },
        "burst.shatter": { icon: "⋙", detail: "Piercing rain penetrates two additional targets instead of one. Each penetration retains 70% of the previous hit's damage; no target is hit twice by the same arrow." },
        "guard.repulse": { icon: "♧", detail: "Briar ward pushes enemies back 60 units (bosses 30) and slows surviving targets' walking by 15% for 1.5 seconds. Charges are unaffected." }
    },
    warden: {
        "attack.execution": { icon: "⬟", detail: "Hammer sweep bypasses Sentinel resistance and deals 25% extra damage to Sentinels. A steel impact mark identifies shield-breaking hits." },
        "nova.ignition": { icon: "◆", detail: "Iron quake deals 25% extra damage inside half its radius. A steel inner ring marks the seismic core; no added fire damage." },
        "burst.overdrive": { icon: "⬢", detail: "Fault line deals 12% more damage per rank against slowed targets. Combines with Quaking ground; replaces extra critical chance." },
        "guard.repulse": { icon: "⬡", detail: "Iron bastion pushes living enemies back 100 units, or 50 for bosses. A broad steel shockwave clears breathing room." }
    }
};
export const skillName = (state, key) => key === "attack" ? classFor(state).attackName : key === "nova" ? classFor(state).specialName
    : key === "dodge" ? "Dodge" : key === "potion" ? "Life flask" : EXTRA_SKILLS[state.heroClass][key].name;
export const treeNodeKey = (skill, slot) => Object.keys(TREE_NODES[skill])[TREE_SLOTS.indexOf(slot)];
export const newSkillTree = () => Object.fromEntries(SKILL_KEYS.map(key => [key, Object.fromEntries(Object.keys(TREE_NODES[key]).map(node => [node, 0]))]));
export const skillPointsEarned = state => Math.min(MAX_SKILL_POINTS, Math.floor(state.player.level / SKILL_POINT_INTERVAL));
export const skillPointsLeft = state => skillPointsEarned(state) - Object.values(state.skillTree).reduce((total, nodes) => total + Object.values(nodes).reduce((sum, rank) => sum + rank, 0), 0);
export const treePointsSpent = (state, skill) => SKILL_KEYS.includes(skill) ? Object.values(state.skillTree[skill]).reduce((sum, rank) => sum + rank, 0) : 0;
export const treeRespecCost = (state, skill) => treePointsSpent(state, skill) > 0 ? 100 + 50 * treePointsSpent(state, skill) : 0;
export const canRespecTree = (state, skill) => SKILL_KEYS.includes(skill) && ["paused", "camp", "won"].includes(state.status)
    && treePointsSpent(state, skill) > 0 && state.gold >= treeRespecCost(state, skill);
export function respecTree(state, skill) {
    if (!canRespecTree(state, skill)) return false;
    const points = treePointsSpent(state, skill), cost = treeRespecCost(state, skill);
    state.gold -= cost;
    state.skillTree[skill] = newSkillTree()[skill];
    state.playerShots = state.playerShots.filter(shot => shot.skill !== skill);
    state.effects = [];
    const p = state.player;
    if (skill === "guard") { p.guarding = 0; p.guard = Math.max(p.guard, 4); }
    if (skill === "dodge") { p.afterstep = 0; p.invulnerable = 0; p.rolling = 0; p.vx = 0; p.vy = 0; }
    if (skill === "potion") { p.flaskWard = 0; p.renewal = 0; }
    if (skill === "nova") for (const enemy of state.enemies) { enemy.chilled = 0; enemy.chillStrength = 0; }
    state.journal = `${skillName(state, skill)} reset: ${points} points returned for ${cost} gold. Cooldowns and other upgrades are unchanged.`;
    return true;
}
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
    const index = Object.keys(TREE_NODES[skill]).indexOf(node);
    const definition = { ...TREE_NODES[skill][node], name: CLASS_TREE_NAMES[state.heroClass][skill][index],
        visual: state.heroClass, ...CLASS_TREE_EFFECTS[state.heroClass][`${skill}.${node}`] };
    const tint = state.heroClass === "knight" ? "ember-colored" : state.heroClass === "ranger" ? "jade" : "steel-blue";
    definition.detail = definition.detail.replace(/silver|golden|violet|crimson/gi, tint);
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

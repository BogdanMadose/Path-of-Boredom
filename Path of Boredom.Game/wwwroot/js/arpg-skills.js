// arpg-skills.js — skill trees, loadouts, and node/respec logic.
//
// Structure: every class shares the same generic node SHAPE per skill (TREE_NODES — 4 nodes per
// skill: root, then two branch nodes, then a capstone), but the actual node NAMES and flavor
// effects are class-specific (CLASS_TREE_NAMES / CLASS_TREE_EFFECTS), assembled together at
// render/lookup time by treeNodeDefinition(). This split exists because the underlying mechanical
// shape (max ranks, prerequisite structure) is identical across classes, but each class re-skins
// what those ranks actually do to fit its own theme (e.g. Knight's nova.chill becomes a
// knockback, Ranger's becomes piercing, Warden's becomes bonus damage).
//
// If you're adding a new skill tree node: add it to the right skill's object in TREE_NODES (generic
// shape), then add matching entries to CLASS_TREE_NAMES for all three classes, and optionally
// CLASS_TREE_EFFECTS if a class needs a re-skinned effect description. Remember save-version
// coupling: GameSaveEndpoints.cs's ValidSkillProgress hardcodes the per-skill branchKeys arrays and
// per-node rank caps, so a new node also needs a save version bump and a matching server-side update.
import { classFor } from "./arpg-classes.js";
import { CLASS_SKILL_TREES } from "./arpg-skill-trees.js";
import { SORCERER_SKILLS } from "./arpg-sorcerer.js";

// Stable keys identify saved slots; each class supplies its own ability and keystone.
export const CLASS_SKILLS = {
    sorcerer: SORCERER_SKILLS,
    knight: {
        chain: { name: "Cinder relay", cooldown: 7, reach: 420, damage: 1.4, color: "#ffc477", detail: "Fire jumps through three nearby enemies, losing 25% damage per jump. Jumps travel up to 180 units.", keystone: "Cinder relay jumps to two additional enemies." },
        frost: { name: "Blazing cross", cooldown: 9, reach: 260, damage: 1.6, color: "#ff9850", detail: "Four narrow fire lanes extend from you in a cross. Enemies between the lanes are not hit.", keystone: "Blazing cross lanes become 50% wider." },
        reap: { name: "Execution arc", cooldown: 5, reach: 190, damage: 1.9, color: "#ef8065", detail: "Sweeps a 160-degree melee arc. Deals 50% extra damage below 35% enemy health; Sentinel resistance applies.", keystone: "Execution arc bypasses Sentinel resistance." },
        meteor: { name: "Sun spear", cooldown: 12, reach: 600, damage: 2.4, color: "#ffdb82", detail: "A narrow fire beam aims at the farthest enemy in range and pierces every enemy along its line.", keystone: "Sun spear beam becomes twice as wide." },
        siphon: { name: "Bloodbrand", cooldown: 10, reach: 210, damage: 1.5, color: "#ed7680", detail: "Brands the nearest enemy. Damage rises by up to 100% as your health falls; restores 3% maximum health on hit, modified by difficulty.", keystone: "Bloodbrand restores 5% maximum health instead of 3%." },
        nullwave: { name: "Flamebreaker", cooldown: 14, reach: 240, damage: 1.2, color: "#ffb060", detail: "A forward 120-degree fire cone burns enemies and destroys enemy projectiles inside the cone. Does not clear attacks behind you.", keystone: "Flamebreaker widens to a 180-degree cone." }
    },
    ranger: {
        chain: { name: "Rebound shot", cooldown: 6, reach: 650, damage: 1.2, color: "#bbdf90", detail: "An instant shot hits the nearest enemy, then rebounds to the farthest other enemy within 220 units of it for 110% damage.", keystone: "Adds one rebound, raising the base target count from two to three." },
        frost: { name: "Snaring shot", cooldown: 9, reach: 620, damage: 0.9, color: "#8fdcbe", detail: "A shot bursts into vines around the nearest enemy in a 90-unit radius, slowing walking by 55% for 2s. Boss resistance applies; charges are unaffected.", keystone: "Snaring shot slow lasts 3s instead of 2s." },
        reap: { name: "Deadeye", cooldown: 7, reach: 800, damage: 1.6, color: "#e7dc9d", detail: "An instant precision shot hits only the farthest enemy. Deals up to 100% extra damage at the edge of its targeting range.", keystone: "Deadeye deals 25% extra damage to elites and bosses." },
        meteor: { name: "Scattershot", cooldown: 10, reach: 480, damage: 1.3, color: "#c4e795", detail: "Five instant arrow lanes spread across a 70-degree fan. Each lane stops at its first enemy; no enemy can be hit twice.", keystone: "Scattershot fires seven lanes instead of five." },
        siphon: { name: "Field harvest", cooldown: 11, reach: 500, damage: 1.1, color: "#89e6a6", detail: "Hits up to three enemies below half health. Each hit restores 8% of your missing health, modified by difficulty. Cannot cast without a wounded target.", keystone: "Field harvest can hit four wounded enemies." },
        nullwave: { name: "Gale escape", cooldown: 13, reach: 180, damage: 0.65, color: "#b2ebe1", detail: "A close-range wind blast pushes ordinary enemies back 90 units and grants 20% walking speed for 1.2s. Bosses are not displaced.", keystone: "Gale escape pushes enemies back 135 units." }
    },
    warden: {
        chain: { name: "Gravity well", cooldown: 9, reach: 360, damage: 1.1, color: "#afa3e1", detail: "Crushes a 130-unit area around the nearest enemy and pulls ordinary survivors 65 units toward its centre. Bosses are not displaced.", keystone: "Raises Gravity well's base radius from 130 to 180 units; reach and relay bonuses apply on top." },
        frost: { name: "Glacial rampart", cooldown: 11, reach: 260, damage: 1.2, color: "#95d6ef", detail: "A forward 90-degree ice wedge slows enemy walking by 45% for 2s and clears enemy projectiles in the wedge. Charges and boss attack timing are unaffected.", keystone: "Glacial rampart slow lasts 3s instead of 2s." },
        reap: { name: "Shieldbreaker", cooldown: 6, reach: 200, damage: 2, color: "#ccd4e4", detail: "Crushes one nearby enemy, prioritizing Sentinels and armored enemies. Bypasses Sentinel resistance and deals 50% extra damage to those targets.", keystone: "Shieldbreaker also deals 50% extra damage to elites and bosses." },
        meteor: { name: "Fault pillars", cooldown: 12, reach: 450, damage: 1.9, color: "#c6ac88", detail: "Three stone eruptions rise along your facing direction. Each has a 65-unit radius, leaving gaps between pillars. Each enemy is hit at most once.", keystone: "Fault pillars radius grows from 65 to 90." },
        siphon: { name: "Stone renewal", cooldown: 12, reach: 170, damage: 0.8, color: "#9dd7c7", detail: "Hits nearby enemies, restores 1% maximum health per hit up to 5%, modified by difficulty, and grants 25% damage reduction for 1s. Stacks multiplicatively with armor and ward.", keystone: "Stone renewal protection lasts 2s instead of 1s." },
        nullwave: { name: "Siege wave", cooldown: 14, reach: 320, damage: 1.8, color: "#aac9eb", detail: "An outer shockwave hits enemies between 40% and 100% of its radius, pushing ordinary survivors back 80 units. Enemies in its inner blind spot are untouched.", keystone: "Siege wave inner blind spot shrinks to 20% of its radius." }
    }
};
export const combatSkillDefinition = (state, skill) => CLASS_SKILLS[state.heroClass]?.[skill];
export const NEW_SKILLS = CLASS_SKILLS.knight;
export const SKILL_KEYS = ["attack", "nova", "burst", "guard", "dodge", "potion", ...Object.keys(NEW_SKILLS)];
// Nine combat slots per class; attack/dodge/potion never occupy a chosen skill slot.
export const SLOTTABLE_SKILLS = ["nova", "burst", "guard", ...Object.keys(NEW_SKILLS)];
export const skillIcon = (state, skill) => SLOTTABLE_SKILLS.includes(skill) || skill === "attack"
    ? `/_content/PathOfBoredom.Game/images/skills/${state.heroClass}/${skill}.svg`
    : `/_content/PathOfBoredom.Game/images/skills/${skill}.svg`;
export const STARTER_SKILLS = ["nova", "chain", "reap"];
// Guard/ward unlocks later in Endless mode (wave 41) than in campaign (wave 11), since Endless
// effectively starts players over at a higher baseline difficulty.
export const wardUnlockWave = state => state.rankingMode === "endless" ? 41 : 11;
export const skillUnlocked = (state, skill) => true;
export const skillCapacity = state => 1 + (state.skillSchedule === "legacy" ? [5, 10] : [10, 20]).filter(level => state.player.level >= level).length;
export const selectedSkills = state => state.loadout.auto.filter(key => key !== "none");
export const needsSkillChoice = state => selectedSkills(state).length < skillCapacity(state);
export const skillSelected = (state, skill) => !SLOTTABLE_SKILLS.includes(skill) || selectedSkills(state).includes(skill);
export const wardUnlockHint = state => state.rankingMode === "endless" ? "Unlocks at Echo 11 (third five-wave stage)" : "Unlocks at stage 3 (wave 11)";
export const AUTO_COOLDOWN = 1;
// One skill point earned every 2 levels, capped at 32 total — matches the pointBudget formula in
// GameSaveEndpoints.cs's ValidSkillProgress for save v12+.
export const MAX_SKILL_POINTS = 32;
export const SKILL_POINT_INTERVAL = 2;
// The four generic "slot" positions every skill's tree branch has, in order: the root node (always
// learnable first), two parallel branch nodes (each requires the root), and a capstone (requires
// at least one of the two branch nodes) — see treePrerequisitesMet below for the actual rule.
export const TREE_SLOTS = ["root", "left", "right", "capstone"];
// Each path keeps the same save-compatible rank rules, but gets its own clear silhouette. Nodes
// are laid out on a 300×300 board and connectors are drawn as straight, legible tracks between them.
const treeLayout = (root, left, right, capstone) => {
    const positions = { root, left, right, capstone };
    const point = ([x, y]) => `${x * 3} ${y * 3}`;
    const link = (from, to) => `M${point(positions[from])} L${point(positions[to])}`;
    return {
        positions,
        paths: {
            "root-left": link("root", "left"), "root-right": link("root", "right"),
            "left-capstone": link("left", "capstone"), "right-capstone": link("right", "capstone")
        }
    };
};

export const TREE_LAYOUTS = {
    // Weapon: a clean fork that rejoins at the finishing strike.
    attack: treeLayout([12, 50], [42, 28], [42, 72], [88, 50]),
    // Nova: a rising wave, split into two routes that meet at the far edge.
    nova: treeLayout([18, 28], [50, 28], [50, 72], [84, 72]),
    // Burst: alternating high and low lanes, like a lightning bolt.
    burst: treeLayout([14, 72], [44, 28], [58, 72], [88, 28]),
    // Guard: an upright bastion with two shoulders and a protected core.
    guard: treeLayout([50, 28], [22, 50], [78, 50], [50, 72]),
    // Dodge: a broad switchback with two parallel, easy-to-follow tracks.
    dodge: treeLayout([14, 28], [46, 28], [46, 72], [88, 72]),
    // Flask: a forked current that flows from a low start to a high finish.
    potion: treeLayout([14, 72], [44, 28], [62, 72], [88, 28]),
    // Class skills get dedicated routes too; none fall back to the old default diamond.
    chain: treeLayout([14, 50], [42, 28], [42, 72], [86, 72]),
    frost: treeLayout([50, 28], [22, 50], [78, 50], [86, 72]),
    reap: treeLayout([86, 50], [58, 28], [58, 72], [14, 50]),
    meteor: treeLayout([14, 72], [46, 72], [46, 28], [86, 28]),
    siphon: treeLayout([16, 28], [48, 28], [48, 72], [86, 50]),
    nullwave: treeLayout([50, 72], [20, 50], [80, 50], [50, 28])
};

// Shared node definitions contain mechanics that are genuinely common to every class. Class-specific
// effects live in CLASS_TREE_EFFECTS so the help text always describes what that class actually gets.
export const TREE_NODES = {
    attack: {
        edge: { name: "Honed edge", max: 3, icon: "⚔", visual: "steel", detail: "Your regular attack deals 8% more damage per rank." },
        sweep: { name: "Long reach", max: 2, icon: "↔", visual: "steel", detail: "Your regular attack reaches 10% farther per rank. This also extends Ranger arrows." },
        execution: { name: "Finisher", max: 1, icon: "◆", visual: "crimson", detail: "A class-specific bonus strengthens your regular attack; see the exact trigger for this class." },
        rhythm: { name: "Weapon tempo", max: 2, icon: "»", visual: "steel", detail: "Regular attacks recover 6% faster per rank. This does not speed up other skills." }
    },
    nova: {
        amplitude: { name: "Amplify", max: 3, icon: "✦", visual: "solar", detail: "Your class special deals 10% more damage per rank." },
        resonance: { name: "Resonance", max: 2, icon: "◎", visual: "solar", detail: "Your class special reaches 10% farther per rank." },
        ignition: { name: "Sunfire", max: 1, icon: "♨", visual: "fire", detail: "A class-specific enhancement improves your special; see the exact effect for this class." },
        chill: { name: "Chilling wake", max: 2, icon: "❄", visual: "frost", detail: "A class-specific control effect improves your special; see the exact effect for this class." }
    },
    burst: {
        focus: { name: "Concentrate", max: 3, icon: "✧", visual: "violet", detail: "Your class burst deals 12% more damage per rank." },
        aperture: { name: "Shape", max: 2, icon: "⋔", visual: "violet", detail: "Changes the shape or coverage of your class burst; see the exact change for this class." },
        shatter: { name: "Giant slayer", max: 1, icon: "⬟", visual: "crimson", detail: "A class-specific bonus makes your burst more effective against a key target or through a crowd." },
        overdrive: { name: "Overdrive", max: 2, icon: "ϟ", visual: "violet", detail: "Burst critical chance rises by 10 percentage points per rank, up to the 75% cap. Warden instead gains bonus damage against chilled enemies." }
    },
    guard: {
        barrier: { name: "Bulwark", max: 3, icon: "⬡", visual: "shield", detail: "While your ward is active, damage reduction rises by 5 percentage points per rank (40% base, up to 55%)." },
        duration: { name: "Enduring ward", max: 2, icon: "◷", visual: "shield", detail: "Your ward lasts 0.6 seconds longer per rank." },
        repulse: { name: "Repulsion", max: 1, icon: "↗", visual: "shield", detail: "A class-specific effect adds force or damage to the ward pulse; see the exact effect for this class." },
        refuge: { name: "Safe haven", max: 2, icon: "+", visual: "healing", detail: "When your ward expires, recover 2% maximum health per rank, scaled by the difficulty's healing modifier." }
    },
    dodge: {
        agility: { name: "Ghoststep", max: 3, icon: "◇", visual: "wind", detail: "Dodge invulnerability lasts 0.04 seconds longer per rank." },
        distance: { name: "Long stride", max: 2, icon: "»", visual: "wind", detail: "Your dodge lasts 0.025 seconds longer per rank, carrying you farther." },
        afterstep: { name: "Windstep", max: 1, icon: "≋", visual: "wind", detail: "Dodging increases walking speed by 20% for 1.2 seconds. Roll speed is unchanged." },
        recovery: { name: "Quick footing", max: 2, icon: "↻", visual: "wind", detail: "Dodge cooldown recovery increases by 10% per rank. Other skill cooldowns are unchanged." }
    },
    potion: {
        concentration: { name: "Distill", max: 3, icon: "+", visual: "healing", detail: "A flask restores 10% more health per rank, after the difficulty healing modifier." },
        triage: { name: "Triage", max: 2, icon: "✚", visual: "amber", detail: "At 35% health or lower, a flask restores an additional 12% per rank." },
        tonic: { name: "Iron tonic", max: 1, icon: "⬡", visual: "shield", detail: "Using a flask grants 25% damage reduction for 2 seconds. It combines multiplicatively with armor and ward." },
        renewal: { name: "Renewal", max: 2, icon: "❧", visual: "healing", detail: "After a flask, regenerate 4% maximum health per rank over 2 seconds, scaled by difficulty. Another flask refreshes the effect." }
    }
};
for (const key of Object.keys(NEW_SKILLS)) {
    TREE_NODES[key] = {
        potency: { name: "Empower", max: 3, icon: "✦", visual: key, detail: "This skill deals 10% more damage per rank." },
        reach: { name: "Expand", max: 2, icon: "◎", visual: key, detail: "Increases this skill's target range and its listed area or shape by the amounts shown for your class." },
        ember: { name: "Keystone", max: 1, icon: "◆", visual: key, detail: "Unlocks this skill's class-specific keystone effect." },
        recovery: { name: "Rhythm", max: 2, icon: "↻", visual: key, detail: "Cooldown recovery increases by 8% per rank; this skill's other rank effect is listed for your class." }
    };
}
// Class-specific manual-only skills for the burst and guard slots — unlike attack/nova/dodge/potion
// (which every class has an equivalent of), burst and guard are distinct signature abilities per
// class (e.g. Knight's Flame lance vs Ranger's Piercing rain), each with their own cooldown/reach/damage.
export const EXTRA_SKILLS = {
    sorcerer: { burst: { name: "Comet lance", cooldown: 12, reach: 480, damage: 2.4, shape: "beam" }, guard: { name: "Astral veil", cooldown: 15, reach: 145, damage: 0.7 } },
    knight: { burst: { name: "Flame lance", cooldown: 8, reach: 380, damage: 2.1, shape: "beam" }, guard: { name: "Ember aegis", cooldown: 12, reach: 125, damage: 0.8 } },
    ranger: { burst: { name: "Piercing rain", cooldown: 8, reach: 760, damage: 1.15, shape: "arrows" }, guard: { name: "Briar ward", cooldown: 11, reach: 180, damage: 0.65 } },
    warden: { burst: { name: "Fault line", cooldown: 11, reach: 250, damage: 2.6, shape: "cone" }, guard: { name: "Iron bastion", cooldown: 14, reach: 150, damage: 1 } }
};
// Per-class, per-skill display names for each of the 4 generic tree node slots (indexed 0-3,
// matching TREE_SLOTS order) — this is what actually shows up in the skill tree UI instead of the
// generic TREE_NODES keys/names.
const CLASS_TREE_NAMES = {
    sorcerer: {
        attack: ["Astral focus", "Far constellation", "Finishing spark", "Casting cadence"], nova: ["Arcane pressure", "Expanding bloom", "Astral fire", "Rime wake"],
        burst: ["Comet core", "Wide comet", "Giant slayer", "Starfall"], guard: ["Spell shell", "Enduring veil", "Repulsion", "Astral refuge"],
        dodge: ["Phase step", "Long passage", "Afterimage", "Quick footing"], potion: ["Moon draught", "Last light", "Runic tonic", "Renewal"]
    },
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
// Overrides describe class-specific effects and any node whose mechanics differ from the common
// fallback. Keep these descriptions aligned with the formulas in arpg-engine.js.
const CLASS_TREE_EFFECTS = {
    sorcerer: {
        "attack.execution": { detail: "Regular attacks deal 25% more damage to enemies at or below 35% health." },
        "nova.ignition": { detail: "Arcane bloom deals 15% more damage with every hit." },
        "nova.chill": { detail: "Arcane bloom slows surviving enemies by 15% per rank for 1.5 seconds. This does not affect enemy charges." },
        "burst.aperture": { name: "Wide comet", detail: "Comet lance's beam width and hit area increase by 20% per rank." },
        "burst.shatter": { detail: "Comet lance deals 25% more damage to elites and bosses." },
        "guard.repulse": { detail: "Astral veil pushes surviving ordinary enemies 60 units away. Bosses cannot be pushed." }
    },
    knight: {
        "attack.execution": { detail: "Regular attacks deal 25% more damage to enemies at or below 35% health." },
        "nova.ignition": { detail: "Ember nova deals 15% more damage with every hit." },
        "nova.chill": { icon: "↗", detail: "Ember nova pushes surviving ordinary enemies 16 units per rank. Bosses cannot be pushed; this replaces the slow." },
        "burst.aperture": { name: "Broad lance", detail: "Flame lance's beam width and hit area increase by 20% per rank." },
        "burst.shatter": { icon: "♨", detail: "Flame lance deals 25% more damage to targets at or below 50% health." },
        "guard.repulse": { icon: "✹", detail: "Doubles Ember aegis's opening-pulse damage. It does not add knockback." }
    },
    ranger: {
        "attack.execution": { icon: "\u219d", detail: "Dawn shot ricochets once to a different enemy within 180 units, dealing 60% of its original damage. It cannot bounce back." },
        "nova.ignition": { icon: "➶", detail: "Each Sunburst arrow pierces one additional enemy for 70% of the previous hit's damage." },
        "nova.chill": { detail: "Sunburst slows surviving enemies by 15% per rank for 1.5 seconds. This does not affect enemy charges." },
        "burst.aperture": { name: "Arrow storm", detail: "Piercing rain fires 2 more arrows per rank: 7 at base, up to 11. The fan angle stays the same." },
        "burst.shatter": { icon: "⋙", detail: "Each Piercing rain arrow can pierce two enemies after its first hit, instead of one. Each follow-through deals 70% of the previous hit; targets are hit at most once per arrow." },
        "guard.repulse": { icon: "♧", detail: "Briar ward pushes surviving ordinary enemies 60 units and raises its slow from 25% to 40% for 1.5 seconds. Bosses cannot be pushed." }
    },
    warden: {
        "attack.execution": { icon: "⬟", detail: "Hammer sweep deals 25% more damage to Sentinels and bypasses their physical resistance." },
        "nova.ignition": { icon: "◆", detail: "Iron quake's inner-half damage bonus rises from 25% to 50%." },
        "nova.chill": { icon: "❄", detail: "Iron quake's base 15% slow gains 15 percentage points per rank (30% or 45% total) for 1.5 seconds. Charges are unaffected." },
        "burst.aperture": { name: "Rift fan", detail: "Fault line's cone widens by 10° on each side per rank (20° total)." },
        "burst.shatter": { icon: "⬟", detail: "Fault line deals 25% more damage to elites and bosses." },
        "burst.overdrive": { icon: "⬢", detail: "Fault line deals 12% more damage per rank to chilled enemies. It does not increase critical chance for Warden." },
        "guard.repulse": { icon: "⬡", detail: "Iron bastion pushes surviving ordinary enemies 100 units away. Bosses cannot be pushed." }
    }
};
// Display name for a skill key, accounting for class-specific naming (attack/nova use the class's
// own attackName/specialName; burst/guard use EXTRA_SKILLS' class-specific names; dodge/potion are
// the same name for every class).
export const skillName = (state, key) => key === "attack" ? classFor(state).attackName : key === "nova" ? classFor(state).specialName
    : key === "dodge" ? "Dodge" : key === "potion" ? "Life flask" : key === "none" ? "No manual skill" : combatSkillDefinition(state, key)?.name ?? EXTRA_SKILLS[state.heroClass][key].name;
// Maps a generic tree slot name (root/left/right/capstone) to the actual node key for a given
// skill (e.g. treeNodeKey("attack", "root") => "edge").
export const treeNodeKey = (skill, slot) => Object.keys(TREE_NODES[skill])[TREE_SLOTS.indexOf(slot)];
// Builds a brand-new, all-zero skill tree for a fresh character (every node at rank 0).
export const newSkillTree = () => Object.fromEntries(SKILL_KEYS.map(key => [key, Object.fromEntries(Object.keys(TREE_NODES[key]).map(node => [node, 0]))]));
// How many total skill points a character's level should have earned by now (capped at MAX_SKILL_POINTS).
export const skillPointsEarned = state => Math.min(MAX_SKILL_POINTS, Math.floor(state.player.level / SKILL_POINT_INTERVAL));
// Points earned minus points already spent across every tree — how many are left to spend right now.
export const skillPointsLeft = state => skillPointsEarned(state) - Object.values(state.skillTree).reduce((total, nodes) => total + Object.values(nodes).reduce((sum, rank) => sum + rank, 0), 0);
// Total points spent in one specific skill's tree (used for respec cost and display).
export const treePointsSpent = (state, skill) => SKILL_KEYS.includes(skill) ? Object.values(state.skillTree[skill]).reduce((sum, rank) => sum + rank, 0) : 0;
// Gold cost to fully respec one skill's tree: a flat 100 plus 50 per point already spent — scales
// so respeccing a heavily-invested tree costs meaningfully more than a lightly-invested one.
export const treeRespecCost = (state, skill) => treePointsSpent(state, skill) > 0 ? 100 + 50 * treePointsSpent(state, skill) : 0;
// A tree can only be respecced while not actively in combat (paused/camp/won), if it actually has
// points spent, and if the player can afford the cost.
export const canRespecTree = (state, skill) => SKILL_KEYS.includes(skill) && ["paused", "camp", "won"].includes(state.status)
    && treePointsSpent(state, skill) > 0 && state.gold >= treeRespecCost(state, skill);

// Resets one skill's tree to all-zero and refunds the points (for the player to respend), charging
// the respec cost in gold. Also cleans up any lingering skill-specific runtime state so a respec
// can't leave stray effects active (e.g. an in-flight nova chill effect, a guard shield still up, or
// in-flight projectiles tied to the respecced skill) — this is important because those runtime
// effects were granted by tree ranks that no longer exist after the reset.
export function respecTree(state, skill) {
    if (!canRespecTree(state, skill)) return false;
    const points = treePointsSpent(state, skill), cost = treeRespecCost(state, skill);
    state.gold -= cost;
    state.runSystems.summary.spent += cost;
    state.skillTree[skill] = newSkillTree()[skill];
    state.playerShots = state.playerShots.filter(shot => shot.skill !== skill);
    state.effects = [];
    const p = state.player;
    if (skill === "guard") { p.guarding = 0; p.guard = Math.max(p.guard, 4); }
    if (skill === "dodge") { p.afterstep = 0; p.invulnerable = 0; p.rolling = 0; p.vx = 0; p.vy = 0; }
    if (skill === "potion") { p.flaskWard = 0; p.renewal = 0; }
    if (skill === "siphon" && state.heroClass === "warden") p.flaskWard = 0;
    if (skill === "nullwave" && state.heroClass === "ranger") p.afterstep = 0;
    if (skill === "nova" || skill === "frost") for (const enemy of state.enemies) { enemy.chilled = 0; enemy.chillStrength = 0; }
    state.journal = `${skillName(state, skill)} reset: ${points} points returned for ${cost} gold. Cooldowns and other upgrades are unchanged.`;
    return true;
}

// The actual prerequisite rule for tree nodes: the root (slot 0) always has no prerequisite; the
// capstone (slot 3) needs at least 1 point in either branch node (slot 1 or 2); the two branch
// nodes each just need at least 1 point in the root.
export const treePrerequisitesMet = (state, skill, node) => {
    const keys = Object.keys(TREE_NODES[skill]);
    return node === keys[0] || (node === keys[3] ? state.skillTree[skill][keys[1]] > 0 || state.skillTree[skill][keys[2]] > 0 : state.skillTree[skill][keys[0]] > 0);
};
// Whether a specific node can be learned right now: the skill itself must be unlocked, the node
// must exist, the game must be paused/at camp/won (never mid-combat), there must be a spare skill
// point, the node isn't already maxed, and its prerequisite is satisfied.
export const canLearnSkill = (state, skill, node) => SKILL_KEYS.includes(skill) && skillSelected(state, skill) && Object.hasOwn(TREE_NODES[skill], node)
    && ["paused", "camp", "won"].includes(state.status) && skillPointsLeft(state) > 0 && state.skillTree[skill][node] < TREE_NODES[skill][node].max
    && treePrerequisitesMet(state, skill, node);
// Spends one skill point into a node, if allowed. Returns false (no-op) rather than throwing if
// the attempt isn't currently valid, so UI code can call this speculatively without needing to
// duplicate canLearnSkill's checks first.
export function learnSkill(state, skill, node) {
    if (!canLearnSkill(state, skill, node)) return false;
    state.skillTree[skill][node]++;
    state.journal = `${skillName(state, skill)}: ${treeNodeDefinition(state, skill, node).name} learned. ${skillPointsLeft(state)} skill points remain.`;
    return true;
}
// Three playable auto slots; the fourth stays empty to preserve the v15 serialized layout.
export const validLoadout = (state, manual, auto) => manual === "none"
    && Array.isArray(auto) && auto.length === 4
    && auto.every((key, index) => key === "none" || SLOTTABLE_SKILLS.includes(key) && index < skillCapacity(state))
    && auto[0] !== "none"
    && new Set(auto.filter(key => key !== "none")).size === auto.filter(key => key !== "none").length;
// Applies a new loadout, if valid, and not mid-combat. Also flags wardUnlockSeen once the player
// has ever actually slotted the guard skill, so the "newly unlocked" UI hint only shows once.
export function setLoadout(state, manual, auto) {
    if (!["paused", "camp", "won"].includes(state.status) || !validLoadout(state, manual, auto)) return false;
    if (state.loadout.auto.some((skill, index) => skill !== "none" && auto[index] !== skill)) return false;
    state.loadout = { manual, auto: [...auto] };
    if (manual === "guard" || auto.includes("guard")) state.wardUnlockSeen = 1;
    return true;
}

// Builds the full class-specific display definition. Class-specific overrides describe mechanics,
// not just the shared node's visual theme.
export function treeNodeDefinition(state, skill, node) {
    if (NEW_SKILLS[skill]) {
        const definition = combatSkillDefinition(state, skill);
        return { ...TREE_NODES[skill][node], ...CLASS_SKILL_TREES[state.heroClass][skill][node], visual: state.heroClass,
            ...(node === "ember" ? { detail: definition.keystone } : {}) };
    }
    const index = Object.keys(TREE_NODES[skill]).indexOf(node);
    const definition = { ...TREE_NODES[skill][node], name: CLASS_TREE_NAMES[state.heroClass][skill][index],
        visual: state.heroClass, ...CLASS_TREE_EFFECTS[state.heroClass][`${skill}.${node}`] };
    return definition;
}

// Builds the human-readable status line shown under a tree node in the UI (why it can/can't be
// learned right now), checked in priority order: locked skill > already maxed > missing
// prerequisite > no points available > not paused > ready to learn.
export function treeNodeStatus(state, skill, node) {
    const rank = state.skillTree[skill][node];
    const keys = Object.keys(TREE_NODES[skill]);
    if (!skillSelected(state, skill)) return "Choose this skill for your run to train it";
    if (rank >= TREE_NODES[skill][node].max) return "Fully learned";
    if (!treePrerequisitesMet(state, skill, node)) return node === keys[3]
        ? `Requires ${treeNodeDefinition(state, skill, keys[1]).name} or ${treeNodeDefinition(state, skill, keys[2]).name} rank 1`
        : `Requires ${treeNodeDefinition(state, skill, keys[0]).name} rank 1`;
    if (!skillPointsLeft(state)) return `No points available — earn one every ${SKILL_POINT_INTERVAL} levels, up to ${MAX_SKILL_POINTS}`;
    if (!["paused", "camp", "won"].includes(state.status)) return "Pause to learn this upgrade";
    return "Spend 1 point to learn the next rank";
}

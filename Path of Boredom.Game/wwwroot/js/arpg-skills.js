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

export const SKILL_KEYS = ["attack", "nova", "burst", "guard", "dodge", "potion"];
// Only these three skills can be placed into an auto-cast slot (manual-only skills like attack/dodge/potion
// don't make sense to automate) — matches the slotSkills restriction added in save v10.
export const SLOTTABLE_SKILLS = ["nova", "burst", "guard"];
// Guard/ward unlocks later in Endless mode (wave 41) than in campaign (wave 11), since Endless
// effectively starts players over at a higher baseline difficulty.
export const wardUnlockWave = state => state.rankingMode === "endless" ? 41 : 11;
export const skillUnlocked = (state, skill) => skill !== "guard" || state.wave >= wardUnlockWave(state);
export const wardUnlockHint = state => state.rankingMode === "endless" ? "Unlocks at Echo 11 (third five-wave stage)" : "Unlocks at stage 3 (wave 11)";
export const AUTO_COOLDOWN = 1.6;
// One skill point earned every 2 levels, capped at 32 total — matches the pointBudget formula in
// GameSaveEndpoints.cs's ValidSkillProgress for save v12+.
export const MAX_SKILL_POINTS = 32;
export const SKILL_POINT_INTERVAL = 2;
// The four generic "slot" positions every skill's tree branch has, in order: the root node (always
// learnable first), two parallel branch nodes (each requires the root), and a capstone (requires
// at least one of the two branch nodes) — see treePrerequisitesMet below for the actual rule.
export const TREE_SLOTS = ["root", "left", "right", "capstone"];

// The generic node shape shared by every class for a given skill: max rank, a fallback icon/visual
// theme, and a generic detail description. treeNodeDefinition() overlays class-specific names/effects
// on top of these at lookup time (see below) — these base descriptions are really just the Knight's
// flavor and get re-colored/re-worded per class via the tint replacement in treeNodeDefinition.
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
// Class-specific manual-only skills for the burst and guard slots — unlike attack/nova/dodge/potion
// (which every class has an equivalent of), burst and guard are distinct signature abilities per
// class (e.g. Knight's Flame lance vs Ranger's Piercing rain), each with their own cooldown/reach/damage.
export const EXTRA_SKILLS = {
    knight: { burst: { name: "Flame lance", cooldown: 8, reach: 380, damage: 2.1, shape: "beam" }, guard: { name: "Ember aegis", cooldown: 12, reach: 125, damage: 0.8 } },
    ranger: { burst: { name: "Piercing rain", cooldown: 8, reach: 760, damage: 1.15, shape: "arrows" }, guard: { name: "Briar ward", cooldown: 11, reach: 180, damage: 0.65 } },
    warden: { burst: { name: "Fault line", cooldown: 11, reach: 250, damage: 2.6, shape: "cone" }, guard: { name: "Iron bastion", cooldown: 14, reach: 150, damage: 1 } }
};
// Per-class, per-skill display names for each of the 4 generic tree node slots (indexed 0-3,
// matching TREE_SLOTS order) — this is what actually shows up in the skill tree UI instead of the
// generic TREE_NODES keys/names.
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
// Overrides for specific (skill.node) combinations where a class's re-skinned effect isn't just a
// renamed version of the generic description but actually behaves differently mechanically (e.g.
// Knight's nova.chill becomes a knockback instead of a slow). Not every node needs an entry here —
// nodes without an override just get the generic TREE_NODES detail text with color words swapped
// (see treeNodeDefinition's tint replacement below).
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
// Display name for a skill key, accounting for class-specific naming (attack/nova use the class's
// own attackName/specialName; burst/guard use EXTRA_SKILLS' class-specific names; dodge/potion are
// the same name for every class).
export const skillName = (state, key) => key === "attack" ? classFor(state).attackName : key === "nova" ? classFor(state).specialName
    : key === "dodge" ? "Dodge" : key === "potion" ? "Life flask" : EXTRA_SKILLS[state.heroClass][key].name;
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
export const canLearnSkill = (state, skill, node) => SKILL_KEYS.includes(skill) && skillUnlocked(state, skill) && Object.hasOwn(TREE_NODES[skill], node)
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
// Validates a proposed manual+auto loadout: the manual skill must be a real slottable skill and
// unlocked; auto must be exactly 2 slots, each either "none" or a distinct unlocked slottable skill
// that isn't already the manual skill (no duplicate skills across slots).
export const validLoadout = (state, manual, auto) => SLOTTABLE_SKILLS.includes(manual) && skillUnlocked(state, manual)
    && Array.isArray(auto) && auto.length === 2
    && auto.every(key => key === "none" || SLOTTABLE_SKILLS.includes(key) && skillUnlocked(state, key) && key !== manual)
    && new Set(auto.filter(key => key !== "none")).size === auto.filter(key => key !== "none").length;
// Applies a new loadout, if valid, and not mid-combat. Also flags wardUnlockSeen once the player
// has ever actually slotted the guard skill, so the "newly unlocked" UI hint only shows once.
export function setLoadout(state, manual, auto) {
    if (!["paused", "camp", "won"].includes(state.status) || !validLoadout(state, manual, auto)) return false;
    state.loadout = { manual, auto: [...auto] };
    if (manual === "guard" || auto.includes("guard")) state.wardUnlockSeen = 1;
    return true;
}

// Builds the full, class-specific display definition for a tree node by overlaying
// CLASS_TREE_NAMES/CLASS_TREE_EFFECTS on top of the generic TREE_NODES entry, then re-coloring any
// generic color words in the detail text (silver/golden/violet/crimson) to match the current
// class's visual theme (ember-colored for Knight, jade for Ranger, steel-blue for Warden). The
// burst.aperture node gets an extra special case since its actual mechanical effect (beam width vs
// arrow count vs cone angle) is different enough per class that it needs its own name/detail
// entirely rather than just a re-themed description.
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

// Builds the human-readable status line shown under a tree node in the UI (why it can/can't be
// learned right now), checked in priority order: locked skill > already maxed > missing
// prerequisite > no points available > not paused > ready to learn.
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
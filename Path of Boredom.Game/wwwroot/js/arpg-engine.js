// arpg-engine.js — the actual simulation: game state, combat, waves, loot, and the per-frame step().
//
// This is the largest and most important gameplay module. Nothing here touches the DOM/canvas
// directly (that's arpg-graphics.js) and nothing here talks to the server (that's arpg-save.js and
// Home.razor/GameSaveClient). Everything else reads or mutates the plain state object created by createState().
//
// Rough map of this file, top to bottom: derived-stat helpers (weaponDamage, armorRating, etc.) that
// recompute fresh from state every call; purchase functions (buyMastery/buyUpgrade/chooseLevelCard);
// run lifecycle (createState/startRun/startEndlessRun/continueJourney/enterEndless/togglePause);
// combat internals (hurtPlayer/hitEnemy/killEnemy/useSkill/firePlayerArrows/autoCast/stepPlayerShots);
// world/wave management (spawnWave/fireVolley/collectLoot/finishCheckpoint); and step(), the single
// per-frame entry point arpg.js's render loop calls.
//
// IMPORTANT: this file's state shape is exactly what arpg-save.js serializes/validates and what
// GameSaveEndpoints.cs re-validates on the server. Adding/removing/renaming a field on `state` or
// `state.player` generally requires updating arpg-save.js (and bumping the save version) too.
import { LAST_WAVE, WAVES_PER_MAP, UPGRADES, POWER_UPS, mapForWave, mapIndexForWave, enemyKindForWave, firePhase } from "./arpg-campaign.js";
export { LAST_WAVE } from "./arpg-campaign.js";
import { LEVEL_CARDS, drawLevelCards } from "./arpg-cards.js";
import { DIFFICULTIES, difficultyFor } from "./arpg-difficulty.js";
import { HERO_CLASSES, classFor } from "./arpg-classes.js";
import { ELITE_MODIFIERS, enemyDamageSource } from "./arpg-modifiers.js";
import { SKILL_KEYS, SLOTTABLE_SKILLS, AUTO_COOLDOWN, EXTRA_SKILLS, newSkillTree, skillUnlocked } from "./arpg-skills.js";
// Logical canvas resolution (not the real on-screen pixel size — arpg-graphics.js scales this to
// fit the actual canvas). All position math throughout this file is in these logical units.
export const WIDTH = 1100;
export const HEIGHT = 650;
// Maximum number of health flasks a player can carry at once, regardless of class or upgrades.
export const MAX_FLASKS = 5;
// Mastery training — the gold-cost stat sink unlocked once every forge upgrade is maxed (see
// forgeComplete() below). Unlike boons/forge upgrades, mastery ranks have no cap; masteryCost()
// grows linearly with rank so it's always a meaningful, if diminishing, gold sink.
export const MASTERY = {
    might: { name: "Ember might", detail: "+2 base weapon damage" },
    vitality: { name: "Enduring heart", detail: "+5 maximum health and restore 5 health" },
    recovery: { name: "Battle rhythm", detail: "+0.5% skill cooldown recovery" },
    area: { name: "Widening ember", detail: "+1% reach: caps at 1,000 for arrows, 220 for melee attacks, 340 for pulses and 500 for melee bursts" },
    speed: { name: "Endless stride", detail: "+1% movement speed; does not change dodge distance" },
    critChance: { name: "Unerring spark", detail: "+0.5 percentage points critical chance; total chance capped at 75%" },
    critDamage: { name: "Endless ruin", detail: "+2 percentage points critical damage" }
};
// How far from the canvas edge the player and enemies are clamped to.
const MARGIN = 42;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Given a lancer/reaver-style charging enemy already moving in a straight line (chargeX/chargeY is
// a unit vector), computes where it will stop once it reaches the play area's edge — used to draw
// the charge-telegraph line and to know when an unobstructed charge naturally ends.
export function chargeLaneEnd(enemy) {
    const tx = enemy.chargeX > 0 ? (WIDTH - MARGIN - enemy.x) / enemy.chargeX : enemy.chargeX < 0 ? (MARGIN - enemy.x) / enemy.chargeX : Infinity;
    const ty = enemy.chargeY > 0 ? (HEIGHT - MARGIN - enemy.y) / enemy.chargeY : enemy.chargeY < 0 ? (MARGIN - enemy.y) / enemy.chargeY : Infinity;
    const travel = Math.max(0, Math.min(tx, ty));
    return Number.isFinite(travel) ? { x: enemy.x + enemy.chargeX * travel, y: enemy.y + enemy.chargeY * travel } : { x: enemy.x, y: enemy.y };
}

// Shortest distance from `point` to the line segment start→end — used for beam/arrow hit testing,
// since an arrow's flight path during a frame is a segment, not just a single point.
function distanceToSegment(point, start, end) {
    const dx = end.x - start.x, dy = end.y - start.y;
    const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(point.x - start.x - dx * t, point.y - start.y - dy * t);
}

// Builds a brand-new, blank engine state object — the single source of truth for what shape a
// save/run looks like (arpg-save.js's restoreSnapshot() and arpg-ranking.js's captureRankingBuild()
// both key off this shape). `random` is injectable so tests could supply a seeded PRNG instead of
// Math.random; production code always calls this with the default.
export function createState(random = Math.random) {
    return {
        random, status: "ready", time: 0, wave: 0, intermission: 0.8,
        mode: "campaign", campaignComplete: 0, difficulty: "hard", rankingMode: "campaign", scoreBaseline: 0,
        rankingPatch: "004", damageHistory: [], volleySequence: 2,
        mastery: Object.fromEntries(Object.keys(MASTERY).map(key => [key, 0])),
        upgrades: Object.fromEntries(Object.keys(UPGRADES).map(key => [key, 0])),
        buffs: Object.fromEntries(POWER_UPS.map(power => [power.key, 0])),
        boons: Object.fromEntries(Object.keys(LEVEL_CARDS).map(key => [key, 0])),
        pendingChoices: 0, cardChoices: [],
        loadout: { manual: "nova", auto: ["burst", "none"] }, skillTree: newSkillTree(), wardUnlockSeen: 0,
        resumeDelay: 0, travelPending: 0,
        heroClass: "knight", playerShots: [],
        kills: 0, gold: 0, enemies: [], projectiles: [], loot: [], effects: [],
        journal: "A faint warmth lingers beneath the ashes.",
        player: {
            x: WIDTH / 2, y: HEIGHT / 2, radius: 16, facing: -Math.PI / 2,
            health: 100, maxHealth: 100, level: 1, xp: 0, nextLevel: 60,
            damage: 18, weaponBonus: 0, weapon: "Worn iron blade", potions: 3,
            armorBonus: 0, armor: "Traveler's coat",
            attack: 0, nova: 0, burst: 0, guard: 0, guarding: 0, dodge: 0, potion: 0, invulnerable: 0,
            afterstep: 0, flaskWard: 0, renewal: 0,
            rolling: 0, rollX: 0, rollY: -1, vx: 0, vy: 0
        }
    };
}

// --- Derived stat helpers -------------------------------------------------------------------
// These all recompute their result from scratch on every call rather than caching anything on
// `state`, so any change to boons/upgrades/mastery/buffs is reflected immediately. They're called
// constantly (every attack, every frame, every UI tooltip render), so keep them cheap.

// Total weapon damage: base class damage + mastery flat bonus + a diminishing-returns curve from
// equipped weapon rarity (weaponBonus, from loot drops) + forge weapon rank, then multiplied by
// forge/boon percentage bonuses and the Fury power-up.
export const weaponDamage = state => Math.round((state.player.damage + state.mastery.might * 2
    + 60 * (Math.sqrt(1 + state.player.weaponBonus / 30) - 1) + state.upgrades.weapon * 3)
    * (1 + state.upgrades.weapon * 0.025 + state.boons.edge * 0.04) * (state.buffs.fury > 0 ? 1.5 : 1));
// Damage reduction rating, capped at 60% — combines class base armor, equipped armor rarity, forge
// armor rank, and the Unbroken vow boon.
export const armorRating = state => Math.min(60, classFor(state).armor + state.player.armorBonus * 0.6 + state.upgrades.armor * 3 + state.boons.bulwark * 1.5);
// Current movement speed: class base speed, boosted by the Haste power-up, Wayfarer's instinct
// boon, Endless stride mastery, and the dodge tree's "afterstep" burst-of-speed window.
export const movementSpeed = state => classFor(state).speed * (state.buffs.haste > 0 ? 1.35 : 1) * (1 + state.boons.stride * 0.04 + state.mastery.speed * 0.01) * (state.player.afterstep > 0 ? 1.2 : 1);
// Chance (0-0.75) that any given hit is a critical, from a base 5% plus card/forge/mastery ranks.
export const criticalChance = state => Math.min(0.75, 0.05 + state.boons.critChance * 0.02 + state.upgrades.critChance * 0.02 + state.mastery.critChance * 0.005);
// Damage multiplier applied on a critical hit, starting at 150% and growing with card/forge/mastery ranks.
export const criticalDamage = state => 1.5 + state.boons.critDamage * 0.1 + state.upgrades.critDamage * 0.1 + state.mastery.critDamage * 0.02;
// Effective range of a given skill, capped per class/skill and boosted by forge/card ranks,
// Widening ember mastery, and relevant skill tree nodes.
export const skillReach = (state, skill) => Math.min(state.heroClass === "ranger" ? 1000 : skill === "attack" ? 220 : skill === "burst" ? 500 : 340, (skill === "attack"
    ? classFor(state).attackReach + state.upgrades.cleave * 6 + state.boons.cleave * 6
    : skill === "nova" ? classFor(state).specialReach + state.upgrades.nova * 10 + state.boons.nova * 10
    : EXTRA_SKILLS[state.heroClass][skill].reach + state.upgrades[skill] * 8) * (1 + state.mastery.area * 0.01)
    * (1 + (skill === "attack" ? state.skillTree.attack.sweep * 0.1 : skill === "nova" ? state.skillTree.nova.resonance * 0.1 : 0)));
// A flat +10% bonus plus the Ferryman's due boon percentage, applied to every gold pickup's raw value.
const goldReward = (value, fortune = 0) => Math.round(value * 1.1 * (1 + fortune * 0.08));
// Gold price of the next rank of a given forge upgrade — grows both linearly and quadratically with
// current rank so late ranks cost substantially more than early ones.
export const upgradeCost = (state, key) => UPGRADES[key] ? Math.round(UPGRADES[key].base * (1 + state.upgrades[key] * 0.7 + state.upgrades[key] ** 2 * 0.12)) : Infinity;
// True once every forge upgrade is at its max rank — the gate that unlocks mastery training
// (buyMastery below) so gold always has somewhere useful to go even after the forge is exhausted.
export const forgeComplete = state => Object.entries(UPGRADES).every(([key, value]) => state.upgrades[key] >= value.max);
// Gold price of the next rank of a mastery stat — starts at 1000 and grows by 100 per rank already
// owned. Falls back to Infinity for unrecognized keys or if the cost would overflow safe-integer
// range (guards against pathological long Endless runs).
export const masteryCost = (state, key) => {
    if (!Object.hasOwn(MASTERY, key)) return Infinity;
    const cost = 1000 + state.mastery[key] * 100;
    return Number.isSafeInteger(cost) ? cost : Infinity;
};
// How much health a flask restores: at least 30, or a percentage of max health that grows with the
// forge flask upgrade, scaled down by the current difficulty's healing penalty.
export const flaskHealing = state => Math.max(30, Math.round(state.player.maxHealth * (0.22 + state.upgrades.flask * 0.06))) * difficultyFor(state).healing;
// Multiplier applied to skill cooldown countdown-per-second (capped at 2x) — combines the Haste
// power-up, Quiet flame boon, and Battle rhythm mastery.
export const cooldownRecovery = state => Math.min(2, (state.buffs.haste > 0 ? 1.4 : 1) * (1 + state.boons.focus * 0.05 + state.mastery.recovery * 0.005));

// Spends gold for one rank of a mastery stat, only available once the forge is fully upgraded and
// only while not mid-combat. Vitality mastery immediately grants +5 max health and +5 current health.
export function buyMastery(state, key) {
    if (!Object.hasOwn(MASTERY, key) || !forgeComplete(state) || !["paused", "camp", "won"].includes(state.status)) return false;
    const cost = masteryCost(state, key);
    if (!Number.isFinite(cost) || state.gold < cost) return false;
    state.gold -= cost;
    state.mastery[key]++;
    if (key === "vitality") {
        state.player.maxHealth += 5;
        state.player.health = Math.min(state.player.maxHealth, state.player.health + 5);
    }
    state.journal = `${MASTERY[key].name} rank ${state.mastery[key]}. ${MASTERY[key].detail}.`;
    return true;
}

// Spends gold for one rank of a forge upgrade, gated the same way as mastery, plus requiring the
// skill it powers to actually be unlocked on the skill tree.
export function buyUpgrade(state, key) {
    const upgrade = UPGRADES[key];
    if (!upgrade || !skillUnlocked(state, key) || !["paused", "camp", "won"].includes(state.status) || state.upgrades[key] >= upgrade.max) return false;
    const cost = upgradeCost(state, key);
    if (state.gold < cost) return false;
    state.gold -= cost;
    grantUpgrade(state, key);
    return true;
}

// Actually increments a forge upgrade's rank and applies one-off side effects (armor grants bonus
// max health immediately; flask grants a full refill). Shared by buyUpgrade() (gold purchase) and
// collectLoot() (free "upgrade" loot drops) — if already maxed, converts into a flat gold refund
// instead of being wasted.
function grantUpgrade(state, key) {
    const upgrade = UPGRADES[key];
    if (state.upgrades[key] >= upgrade.max) { state.gold += goldReward(50); return; }
    state.upgrades[key]++;
    if (key === "armor") { state.player.maxHealth += 12; state.player.health = Math.min(state.player.maxHealth, state.player.health + 12); }
    if (key === "flask") state.player.potions = MAX_FLASKS;
    state.journal = `${upgrade.name} forged to rank ${state.upgrades[key]}. ${upgrade.detail}.`;
}

// Applies the chosen level-up boon card, incrementing its rank (vitality grants immediate health).
// If more choices are still queued (multiple level-ups at once), draws a fresh set of 3 cards for
// the next choice; otherwise resumes play — straight to "playing", or into finishCheckpoint() if this
// was the last enemy of a boss wave and the level-up dialog was blocking that transition.
export function chooseLevelCard(state, key) {
    if (state.status !== "choosing" || state.pendingChoices <= 0 || !state.cardChoices.includes(key)) return false;
    const card = LEVEL_CARDS[key];
    if (!card || state.boons[key] >= card.max) return false;
    state.boons[key]++;
    if (key === "vitality") {
        state.player.maxHealth += 16;
        state.player.health = Math.min(state.player.maxHealth, state.player.health + 16);
    }
    state.pendingChoices--;
    state.journal = `${card.name} chosen (rank ${state.boons[key]}). This boon lasts for the rest of this run and its save.`;
    if (state.pendingChoices > 0) {
        state.cardChoices = drawLevelCards(state);
    } else {
        state.cardChoices = [];
        state.enemies = state.enemies.filter(enemy => enemy.health > 0);
        if (!state.enemies.length && state.wave > 0 && state.wave % WAVES_PER_MAP === 0) finishCheckpoint(state);
        else state.status = "playing";
    }
    return true;
}

// Leaves a checkpoint camp and heads toward the next wave. Doesn't spawn the wave immediately —
// instead sets travelPending/resumeDelay so step() shows a brief "traveling" transition before
// spawnWave() actually fires.
export function continueJourney(state) {
    if (state.status === "camp") {
        state.status = "playing";
        state.travelPending = 1;
        state.resumeDelay = 3;
        return true;
    }
    return false;
}

// Transitions a completed campaign run into Endless mode at the chosen difficulty. Only callable
// from the "won" (campaign-complete) state. rankingMode becomes "ascended" (unless it was already
// "legacy", a compatibility tag that never changes) so the rankings page can distinguish endless
// runs entered this way from ones started fresh via startEndlessRun().
export function enterEndless(state, difficulty = state.difficulty) {
    if (state.status !== "won" || state.campaignComplete !== 1 || !Object.hasOwn(DIFFICULTIES, difficulty)) return false;
    state.rankingMode = state.rankingMode === "legacy" ? "legacy" : "ascended";
    state.scoreBaseline = state.kills;
    state.difficulty = difficulty;
    state.mode = "endless";
    state.status = "playing";
    state.travelPending = 1;
    state.resumeDelay = 3;
    state.journal = "You return to the gate by choice. The Endless Watch begins. Your equipment and gold remain yours.";
    return true;
}

// Creates a fresh campaign run from wave 0 with the chosen class's starting stats — the normal
// "new game" entry point from the setup dialog in arpg.js.
export function startRun(random = Math.random, difficulty = "hard", heroClass = "knight") {
    if (!Object.hasOwn(DIFFICULTIES, difficulty)) throw new Error("Unknown difficulty.");
    if (!Object.hasOwn(HERO_CLASSES, heroClass)) throw new Error("Unknown class.");
    const state = createState(random);
    const hero = HERO_CLASSES[heroClass];
    state.heroClass = heroClass;
    Object.assign(state.player, { health: hero.health, maxHealth: hero.health, damage: hero.damage, weapon: hero.weapon });
    state.difficulty = difficulty;
    state.status = "playing";
    state.resumeDelay = 3;
    state.journal = `${hero.name}: ${hero.description}`;
    return state;
}

// Alternate "new game" entry point for players who want to skip straight to Endless mode without
// grinding the campaign — sets rankingMode to "endless" (a separate leaderboard bucket from
// "ascended") and hands the player a fixed "veteran's kit" of gold, forge ranks, level, and gear so
// it's immediately playable rather than starting from nothing at wave 30+ difficulty.
export function startEndlessRun(random = Math.random, difficulty = "hard", heroClass = "knight") {
    const state = startRun(random, difficulty, heroClass);
    const hero = classFor(state);
    state.rankingMode = "endless";
    state.mode = "endless";
    state.campaignComplete = 1;
    state.wave = LAST_WAVE;
    state.gold = 350;
    Object.assign(state.upgrades, { weapon: 4, armor: 3, cleave: 2, nova: 2, dodge: 2, flask: 1 });
    Object.assign(state.player, { level: 12, maxHealth: hero.health + 201, health: hero.health + 201, damage: hero.damage + 44, nextLevel: 1600, weaponBonus: 72, weapon: `Watchkeeper's ${hero.weaponType}`, armorBonus: 20, armor: "Watchkeeper's mail" });
    spawnWave(state);
    state.intermission = 3.5;
    state.journal = "The Endless Watch remembers you. A veteran's kit awaits. Build a new legend beyond the gate.";
    return state;
}

// Flips between playing and paused. On resuming, grants a brief resumeDelay grace window so a
// player un-pausing doesn't get instantly hit by something that was already mid-attack when paused.
export function togglePause(state) {
    if (state.status === "playing") state.status = "paused";
    else if (state.status === "paused") {
        state.status = "playing";
        state.resumeDelay = Math.max(state.resumeDelay, 2.5);
    }
}

// Queues a short-lived purely-visual effect (slash arcs, rings, floating damage text, etc.) for
// arpg-graphics.js to render and fade out. Capped at 256 concurrent effects (oldest dropped first).
function effect(state, kind, x, y, color, text = "", radius = 0, angle = 0) {
    const life = kind === "text" ? 0.9 : 0.35;
    const item = { kind, x, y, color, text, radius, angle, life, maxLife: life };
    state.effects.push(item);
    if (state.effects.length > 256) state.effects.shift();
    return item;
}

// Applies incoming damage to the player after all mitigation (armor, Ward power-up, guard skill
// block, flask ward) is factored in. Records the hit into damageHistory for the death report,
// triggers a brief invulnerability window, and transitions to "dead" status if health hits zero.
function hurtPlayer(state, damage, source = "Unknown attack") {
    const player = state.player;
    if (player.invulnerable > 0 || state.status !== "playing") return;
    damage = Math.max(1, Math.round(damage * (1 - armorRating(state) / 100) * (state.buffs.ward > 0 ? 0.5 : 1)
        * (player.guarding > 0 ? 0.6 - state.skillTree.guard.barrier * 0.05 : 1) * (player.flaskWard > 0 ? 0.75 : 1)));
    const taken = Math.min(player.health, damage);
    player.health = Math.max(0, player.health - damage);
    state.damageHistory.push({ source, damage: taken, age: 0, lethal: player.health === 0 });
    if (state.damageHistory.length > 12) state.damageHistory.shift();
    player.invulnerable = 0.3;
    effect(state, "text", player.x, player.y - 35, "#ff9384", `-${Math.ceil(taken)}`);
    if (player.health === 0) {
        state.status = "dead";
        state.journal = `Defeated by ${source}. The death report shows recent health lost after mitigation.`;
    }
}

// Adds XP (scaled up slightly at higher levels so late-game grinding isn't punishing) and resolves
// any number of level-ups that XP amount triggers. Each level-up grants a flat health/damage bump
// and queues a boon card choice; if any choices are pending, forces status to "choosing".
function gainExperience(state, amount) {
    const player = state.player;
    player.xp += Math.round(amount * 1.1 * (1 + Math.min(0.6, Math.max(0, player.level - 15) * 0.03)));
    while (player.xp >= player.nextLevel) {
        player.xp -= player.nextLevel;
        player.level++;
        state.pendingChoices++;
        player.nextLevel = Math.min(25000, Math.round(player.nextLevel * (player.level > 15 ? 1.22 : 1.35)));
        player.maxHealth += 8;
        player.damage += 3;
        effect(state, "ring", player.x, player.y, "#f2d390", "", 100);
        effect(state, "text", player.x, player.y - 60, "#f2d390", `LEVEL ${player.level}`);
        state.journal = `Level ${player.level}. Choose a lasting boon. +3 damage and +8 max vitality; no free healing or flask refill.`;
    }
    if (state.pendingChoices > 0) {
        if (!state.cardChoices.length) state.cardChoices = drawLevelCards(state);
        state.status = "choosing";
    }
}

// Handles everything that happens when an enemy's health drops to zero: kill counting, Ashdrinker
// (siphon) boon lifesteal for elites/bosses, XP award, and a cascade of randomized loot drops (gold
// always, plus periodic weapon/armor/health/power-up/flask/forge-upgrade drops on kill-count or
// random-chance triggers). Loot list is hard-capped at 64 — if exceeded, auto-collects everything.
function killEnemy(state, enemy) {
    state.kills++;
    if (enemy.elite || enemy.kind === "boss") {
        state.player.health = Math.min(state.player.maxHealth, state.player.health + state.boons.siphon * 0.8 * difficultyFor(state).healing);
    }
    const act = mapIndexForWave(state.wave);
    gainExperience(state, (enemy.kind === "boss" ? 70 + act * 35 : 10 + act * 4) * (enemy.elite ? 2 : 1));
    state.loot.push({ kind: "gold", x: enemy.x, y: enemy.y, value: Math.min(300, 4 + state.wave * 2) * (enemy.elite ? 2 : 1), life: 30 });
    if (state.kills % 5 === 0 || enemy.kind === "boss") {
        const tier = Math.min(200, Math.floor(state.kills / 5));
        state.loot.push({ kind: "weapon", x: enemy.x + 15, y: enemy.y + 8, value: tier * 3, life: 30 });
    } else if (state.kills % 7 === 0) {
        state.loot.push({ kind: "armor", x: enemy.x - 12, y: enemy.y, value: Math.min(40, 2 + Math.floor(state.wave * 1.2)), life: 30 });
    } else if (state.random() < 0.08) {
        state.loot.push({ kind: "health", x: enemy.x - 12, y: enemy.y, value: 12, life: 30 });
    }
    if (state.kills % 6 === 0) {
        state.loot.push({ kind: "power", x: enemy.x + 20, y: enemy.y - 10, value: Math.floor(state.random() * POWER_UPS.length), life: 30 });
    }
    if (state.random() < 0.03 || enemy.kind === "boss") {
        state.loot.push({ kind: "flask", x: enemy.x + 10, y: enemy.y + 18, value: 1, life: 30 });
    }
    if ((enemy.kind === "boss" && state.random() < 0.3) || (enemy.elite && state.random() < 0.04)) {
        const keys = Object.keys(UPGRADES);
        const available = keys.filter(key => skillUnlocked(state, key) && state.upgrades[key] < UPGRADES[key].max);
        const key = available[Math.floor(state.random() * available.length)];
        state.loot.push({ kind: key ? "upgrade" : "gold", x: enemy.x - 20, y: enemy.y - 10, value: key ? keys.indexOf(key) : 50, life: 30 });
    }
    effect(state, "burst", enemy.x, enemy.y, enemy.kind === "boss" ? "#edac60" : "#ac796d", "", enemy.radius * 2);
    if (state.loot.length > 64) {
        collectLoot(state, 0, true);
    }
}

// Applies one hit of skill damage to a single enemy: armored-modifier mitigation, class-specific
// finishing-move bonus damage, Warden's chilled-enemy burst bonus, critical roll, and the sentinel
// kind's resistance to non-piercing hits. Triggers killEnemy() if lethal, otherwise applies Nova's
// chill/knockback follow-up if that skill tree node is taken.
function hitEnemy(state, enemy, damage, piercing = false, skill = "attack") {
    if (enemy.health <= 0) return;
    if (enemy.modifier === "armored") damage = Math.max(1, Math.round(damage * 0.8));
    const finishing = skill === "attack" && state.skillTree.attack.execution > 0
        && (state.heroClass === "knight" ? enemy.health <= enemy.maxHealth * 0.35 : state.heroClass === "warden" && enemy.kind === "sentinel");
    const shattering = skill === "burst" && state.skillTree.burst.shatter > 0
        && (state.heroClass === "knight" ? enemy.health <= enemy.maxHealth * 0.5 : state.heroClass === "warden" && (enemy.elite || enemy.kind === "boss"));
    if (finishing || shattering) {
        damage = Math.round(damage * 1.25);
        effect(state, "execute", enemy.x, enemy.y, classFor(state).color, "", enemy.radius + 12);
    }
    if (skill === "burst" && state.heroClass === "warden" && enemy.chilled > 0) damage = Math.round(damage * (1 + state.skillTree.burst.overdrive * 0.12));
    const critical = state.random() < Math.min(0.75, criticalChance(state) + (skill === "burst" && state.heroClass !== "warden" ? state.skillTree.burst.overdrive * 0.1 : 0));
    if (critical) damage = Math.round(damage * criticalDamage(state));
    if (enemy.kind === "sentinel" && !piercing && !(state.heroClass === "warden" && skill === "attack" && state.skillTree.attack.execution)) damage = Math.round(damage * 0.55);
    enemy.health -= damage;
    enemy.flash = 0.15;
    effect(state, "text", enemy.x, enemy.y - enemy.radius - 10, critical ? "#ffd16a" : "#eee0ba", critical ? `CRIT ${damage}` : `${damage}`);
    if (enemy.health <= 0) killEnemy(state, enemy);
    else if (skill === "nova" && state.skillTree.nova.chill > 0) {
        if (state.heroClass === "knight") {
            pushEnemy(state, enemy, state.skillTree.nova.chill * 16);
            effect(state, "repulse", enemy.x, enemy.y, classFor(state).color, "", enemy.radius + 16);
        } else {
            enemy.chilled = 1.5;
            enemy.chillStrength = Math.max(enemy.chillStrength ?? 0, state.skillTree.nova.chill * 0.15);
            effect(state, "frost", enemy.x, enemy.y, classFor(state).color, "", enemy.radius + 10);
        }
    }
}

// Shoves an enemy directly away from the player by `amount` pixels (bosses pushed only half as far).
// Used by Nova's knockback follow-up (Knight only) and Guard's repulse node.
function pushEnemy(state, enemy, amount) {
    const p = state.player;
    const d = distance(p, enemy);
    const push = enemy.kind === "boss" ? amount / 2 : amount;
    enemy.x = clamp(enemy.x + (d ? (enemy.x - p.x) / d : Math.cos(p.facing)) * push, MARGIN, WIDTH - MARGIN);
    enemy.y = clamp(enemy.y + (d ? (enemy.y - p.y) / d : Math.sin(p.facing)) * push, MARGIN, HEIGHT - MARGIN);
}

// The single entry point for using any skill — attack, nova, class-specific burst/guard, dodge, or
// potion — whether triggered by player input or autoCast(). Handles cooldown gating, per-skill
// damage/effect resolution (each skill's shape differs enough that this is one big if/else chain),
// and applies the automatic-cast cooldown penalty (AUTO_COOLDOWN) so auto-cast skills recharge
// slower than manually-triggered ones.
export function useSkill(state, skill, automatic = false) {
    if (state.status !== "playing" || state.resumeDelay > 0 || !SKILL_KEYS.includes(skill) || !skillUnlocked(state, skill)
        || (automatic ? !SLOTTABLE_SKILLS.includes(skill) || !state.loadout.auto.includes(skill)
            : SLOTTABLE_SKILLS.includes(skill) && state.loadout.manual !== skill)) return false;
    const p = state.player;
    const hero = classFor(state);
    if (p[skill] > 0 || skill === "guard" && p.guarding > 0) return false;
    const nodes = state.skillTree[skill];
    const power = skill === "attack" ? 1 + nodes.edge * 0.08 : skill === "nova" ? (1 + nodes.amplitude * 0.1) * (1 + (state.heroClass === "knight" ? nodes.ignition * 0.15 : 0))
        : skill === "burst" ? 1 + nodes.focus * 0.12 : 1;
    const damage = multiplier => Math.round(weaponDamage(state) * multiplier * power);
    const color = skill === "nova" && nodes.ignition && state.heroClass === "knight" ? "#ff8b32" : hero.color;
    if (skill === "attack") {
        p.swing = 0.26;
        p.attack = hero.attackCooldown / (1 + state.upgrades.cleave * 0.07) / (1 + nodes.rhythm * 0.06);
        const reach = skillReach(state, "attack");
        if (state.heroClass === "ranger") {
            firePlayerArrows(state, [0], damage(1 + state.upgrades.cleave * 0.08), reach, 0, skill);
        } else {
            effect(state, "slash", p.x, p.y, color, "", reach, p.facing);
            for (const enemy of state.enemies) {
                const angle = Math.atan2(enemy.y - p.y, enemy.x - p.x) - p.facing;
                if (distance(p, enemy) < reach + enemy.radius && Math.cos(angle) > 0.25 - state.upgrades.cleave * 0.02) {
                    hitEnemy(state, enemy, damage(1 + state.upgrades.cleave * 0.08));
                }
            }
        }
    } else if (skill === "nova") {
        p.casting = 0.4;
        p.nova = hero.specialCooldown / (1 + state.upgrades.nova * 0.07);
        const reach = skillReach(state, "nova");
        if (state.heroClass === "ranger") {
            firePlayerArrows(state, [-0.36, -0.18, 0, 0.18, 0.36], damage(hero.specialDamage + state.upgrades.nova * 0.1), reach, 1, skill);
        } else {
            effect(state, "ring", p.x, p.y, color, "", reach);
            if (state.heroClass === "warden" && nodes.ignition) effect(state, "ring", p.x, p.y, color, "", reach / 2);
            for (const enemy of state.enemies) {
                if (distance(p, enemy) < reach + enemy.radius) {
                    const core = state.heroClass === "warden" && nodes.ignition && distance(p, enemy) <= reach / 2 ? 1.25 : 1;
                    hitEnemy(state, enemy, damage((hero.specialDamage + state.upgrades.nova * 0.12) * core), true, skill);
                }
            }
        }
    } else if (skill === "burst") {
        const extra = EXTRA_SKILLS[state.heroClass].burst;
        const reach = skillReach(state, skill);
        const hit = damage(extra.damage * (1 + state.upgrades.burst * 0.1 + state.boons.burst * 0.06));
        p.burst = extra.cooldown / (1 + state.upgrades.burst * 0.08);
        p.casting = 0.4;
        if (extra.shape === "arrows") {
            const count = 7 + nodes.aperture * 2;
            firePlayerArrows(state, Array.from({ length: count }, (_, index) => -0.36 + index * 0.72 / (count - 1)), hit, reach, 1, skill);
        } else {
            const end = { x: p.x + Math.cos(p.facing) * reach, y: p.y + Math.sin(p.facing) * reach };
            const halfAngle = (60 + nodes.aperture * 10) * Math.PI / 180;
            const visual = effect(state, extra.shape === "beam" ? "beam" : "slash", p.x, p.y, color, "", reach, p.facing);
            visual.width = 44 * (1 + nodes.aperture * 0.2);
            visual.arc = halfAngle;
            for (const enemy of state.enemies) {
                const inShape = extra.shape === "beam" ? distanceToSegment(enemy, p, end) < enemy.radius + visual.width / 2
                    : distance(p, enemy) < reach + enemy.radius && Math.cos(Math.atan2(enemy.y - p.y, enemy.x - p.x) - p.facing) > Math.cos(halfAngle);
                if (inShape) hitEnemy(state, enemy, hit, true, skill);
            }
        }
    } else if (skill === "guard") {
        const extra = EXTRA_SKILLS[state.heroClass].guard;
        const reach = skillReach(state, skill);
        p.guard = extra.cooldown / (1 + state.upgrades.guard * 0.08);
        p.guarding = Math.min(8, 3 + state.upgrades.guard * 0.2 + state.boons.guard * 0.15 + nodes.duration * 0.6);
        effect(state, "shield", p.x, p.y, color, "", reach);
        for (const enemy of state.enemies) {
            if (distance(p, enemy) < reach + enemy.radius) {
                hitEnemy(state, enemy, Math.round(weaponDamage(state) * extra.damage * (1 + state.upgrades.guard * 0.08)
                    * (state.heroClass === "knight" && nodes.repulse ? 2 : 1)), true, skill);
                if (nodes.repulse && enemy.health > 0) {
                    if (state.heroClass !== "knight") pushEnemy(state, enemy, state.heroClass === "warden" ? 100 : 60);
                    if (state.heroClass === "ranger") {
                        enemy.chilled = 1.5;
                        enemy.chillStrength = Math.max(enemy.chillStrength, 0.15);
                    }
                }
            }
        }
        if (nodes.repulse) effect(state, state.heroClass === "knight" ? "fire" : "repulse", p.x, p.y, hero.color, "", reach + 60);
    } else if (skill === "dodge") {
        p.dodge = Math.max(1.8, hero.dodgeCooldown / (1 + state.upgrades.dodge * 0.15) / (1 + nodes.recovery * 0.1));
        p.rolling = 0.23 + nodes.distance * 0.025;
        p.invulnerable = Math.max(p.invulnerable, 0.32 + state.upgrades.dodge * 0.025 + nodes.agility * 0.04);
        if (nodes.afterstep) p.afterstep = 1.2;
        p.rollX = Math.cos(p.facing);
        p.rollY = Math.sin(p.facing);
        effect(state, "wind", p.x, p.y, "#b5ecf4", "", 45 + nodes.distance * 15, p.facing);
    } else {
        if (p.potions <= 0 || p.health >= p.maxHealth) return false;
        p.potion = 0.7;
        p.potions--;
        const emergency = p.health <= p.maxHealth * 0.35;
        p.health = Math.min(p.maxHealth, p.health + flaskHealing(state) * (1 + nodes.concentration * 0.1 + (emergency ? nodes.triage * 0.12 : 0)));
        if (nodes.tonic) p.flaskWard = 2;
        if (nodes.renewal) p.renewal = 2;
        effect(state, "heal", p.x, p.y, emergency && nodes.triage ? "#ffcd79" : "#9de8ad", "", 24 + nodes.concentration * 5);
        state.journal = "A moment of warmth. Refill flasks at checkpoints or the forge, not on level-up.";
    }
    p[skill] *= automatic ? AUTO_COOLDOWN : 1;
    if (skill === "attack" && nodes.edge) effect(state, "empower", p.x, p.y, hero.color, "", 35 + nodes.edge * 9, nodes.edge);
    if (skill === "attack" && nodes.sweep) effect(state, "expand", p.x, p.y, hero.color, "", 55 + nodes.sweep * 15);
    if (skill === "attack" && nodes.rhythm) effect(state, "wind", p.x, p.y, hero.color, "", 40 + nodes.rhythm * 8, p.facing);
    if (skill === "nova" && nodes.amplitude) effect(state, "empower", p.x, p.y, hero.color, "", 45 + nodes.amplitude * 12, nodes.amplitude);
    if (skill === "nova" && nodes.resonance) effect(state, "expand", p.x, p.y, color, "", 65 + nodes.resonance * 20);
    if (skill === "nova" && nodes.ignition && state.heroClass === "knight") effect(state, "fire", p.x, p.y, "#ff8b32", "", 90);
    if (skill === "burst" && nodes.focus) effect(state, "empower", p.x, p.y, hero.color, "", 45 + nodes.focus * 12, nodes.focus);
    if (skill === "burst" && nodes.overdrive) effect(state, "sparks", p.x, p.y, hero.color, "", 45 + nodes.overdrive * 8);
    return true;
}

// Spawns Ranger projectile(s) — `offsets` is a list of angle offsets from the player's facing
// direction, letting one call fire a single arrow (attack) or a whole volley/fan (nova/burst).
// `volley` groups arrows fired together so hitArrowTarget() can apply diminishing returns per
// target per volley.
function firePlayerArrows(state, offsets, damage, reach, piercing, skill) {
    const p = state.player;
    if (state.volleySequence >= Number.MAX_SAFE_INTEGER) {
        if (state.playerShots.length) return;
        state.volleySequence = 2;
        for (const enemy of state.enemies) enemy.combat.volleys = [];
    }
    const volley = skill === "attack" ? 0 : ++state.volleySequence;
    for (const offset of offsets) {
        if (state.playerShots.length >= 48) break;
        const angle = p.facing + offset;
        state.playerShots.push({ x: p.x, y: p.y, vx: Math.cos(angle) * 780, vy: Math.sin(angle) * 780, damage, life: reach / 780, piercing, skill, volley });
    }
}

// Called every frame to fire any skills slotted into the auto-loadout (up to 2 slots) at the
// nearest living enemy in range. Temporarily overrides the player's facing to aim at the target,
// then restores it — auto-cast shouldn't change which way the player visually faces.
function autoCast(state) {
    const p = state.player;
    for (const skill of state.loadout.auto) {
        if (!SLOTTABLE_SKILLS.includes(skill) || p[skill] > 0 || state.status !== "playing") continue;
        const target = state.enemies.filter(enemy => enemy.health > 0).sort((a, b) => distance(p, a) - distance(p, b))[0];
        if (!target) continue;
        const d = distance(p, target);
        if (skill === "guard" ? d > 250 || p.guarding > 0 : d > skillReach(state, skill) + target.radius) continue;
        const facing = p.facing;
        p.facing = Math.atan2(target.y - p.y, target.x - p.x);
        useSkill(state, skill, true);
        p.facing = facing;
    }
}

// Advances every in-flight Ranger arrow this frame: moves it, tests collision against the nearest
// enemy along its travel segment, and on a hit resolves piercing follow-through (Burst's "shatter"
// and Nova's "ignition" nodes let an arrow punch through additional enemies, drawn as chained beam
// links via arrowLink()) plus Attack's "execution" node secondary-target effect. Also prunes stale
// volley-hit-tracking entries whose originating volley has fully expired.
function stepPlayerShots(state, dt) {
    const activeVolleys = new Set(state.playerShots.map(shot => shot.volley));
    for (const enemy of state.enemies) enemy.combat.volleys = enemy.combat.volleys.filter(entry => activeVolleys.has(entry.volley));
    for (const shot of state.playerShots) {
        if (state.status !== "playing") break;
        const start = { x: shot.x, y: shot.y };
        const elapsed = Math.min(dt, shot.life);
        shot.x += shot.vx * elapsed;
        shot.y += shot.vy * elapsed;
        shot.life = Math.max(0, shot.life - dt);
        const enemy = state.enemies.filter(target => target.health > 0 && distanceToSegment(target, start, shot) <= target.radius + 4)
            .sort((a, b) => distance(start, a) - distance(start, b))[0];
        if (enemy) {
            const remainingRange = Math.hypot(shot.vx, shot.vy) * shot.life;
            shot.life = 0;
            hitArrowTarget(state, shot, enemy, shot.damage, shot.piercing === 1);
            const penetrations = shot.skill === "burst" ? 1 + state.skillTree.burst.shatter
                : shot.skill === "nova" ? state.skillTree.nova.ignition : 0;
            const speed = Math.hypot(shot.vx, shot.vy) || 1;
            const direction = { x: shot.vx / speed, y: shot.vy / speed };
            const end = { x: enemy.x + direction.x * remainingRange, y: enemy.y + direction.y * remainingRange };
            const targets = state.enemies.filter(target => target !== enemy && target.health > 0
                && (target.x - enemy.x) * direction.x + (target.y - enemy.y) * direction.y > 0
                && distanceToSegment(target, enemy, end) <= target.radius + 4)
                .sort((a, b) => distance(enemy, a) - distance(enemy, b)).slice(0, penetrations);
            let previous = enemy;
            let damage = shot.damage;
            for (const target of targets) {
                damage = Math.max(1, Math.round(damage * 0.7));
                arrowLink(state, previous, target);
                hitArrowTarget(state, shot, target, damage, true);
                previous = target;
            }
            if (shot.skill === "attack" && state.skillTree.attack.execution) {
                const target = state.enemies.filter(target => target !== enemy && target.health > 0 && distance(enemy, target) <= 180)
                    .sort((a, b) => distance(enemy, a) - distance(enemy, b))[0];
                if (target) {
                    arrowLink(state, enemy, target);
                    hitEnemy(state, target, Math.max(1, Math.round(shot.damage * 0.6)), false, "attack");
                }
            }
        }
        if (shot.x < 0 || shot.x > WIDTH || shot.y < 0 || shot.y > HEIGHT) shot.life = 0;
    }
    state.playerShots = state.playerShots.filter(shot => shot.life > 0);
}

// Draws the thin connecting beam effect between two enemies hit by the same piercing arrow, purely
// so it's visually clear one arrow chained through multiple targets.
function arrowLink(state, from, to) {
    const link = effect(state, "beam", from.x, from.y, classFor(state).color, "", distance(from, to), Math.atan2(to.y - from.y, to.x - from.x));
    link.width = 3;
}

// Applies one arrow's damage to one enemy, tracking how many times this volley has already hit this
// enemy (enemy.combat.volleys) so piercing chains can't spam full damage into the same enemy
// repeatedly within one volley — a 2nd+ hit only deals 25% damage, and a 4th+ hit is ignored.
function hitArrowTarget(state, shot, enemy, damage, piercing) {
    if (shot.volley > 0) {
        let entry = enemy.combat.volleys.find(entry => entry.volley === shot.volley);
        if (!entry) { entry = { volley: shot.volley, hits: 0 }; enemy.combat.volleys.push(entry); }
        if (entry.hits >= 3) return;
        if (entry.hits > 0) damage *= 0.25;
        entry.hits++;
    }
    hitEnemy(state, enemy, Math.max(1, Math.round(damage)), piercing, shot.skill);
}

// Advances to the next wave: increments state.wave, works out which map/act it falls in, and spawns
// a batch of enemies scaled by act, depth-past-campaign-end (Endless mode gets harder forever via
// the `depth` term), player level (levelPressure), and difficulty preset. Every 5th wave
// (WAVES_PER_MAP) is a boss wave with one guaranteed boss. On returning to wave 1 of a new map,
// clears leftover projectiles/loot/effects and resets the player to the arena center.
function spawnWave(state) {
    state.wave++;
    const act = mapIndexForWave(state.wave);
    const map = mapForWave(state.wave);
    const localWave = (state.wave - 1) % WAVES_PER_MAP + 1;
    const bossWave = localWave === WAVES_PER_MAP;
    if (localWave === 1 && state.wave > 1) {
        collectLoot(state, 0, true);
        state.projectiles = [];
        state.playerShots = [];
        state.effects = [];
        Object.assign(state.player, { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, invulnerable: 1 });
    }
    const depth = Math.max(0, state.wave - LAST_WAVE);
    const difficulty = difficultyFor(state);
    const levelPressure = Math.max(0, state.player.level - 8);
    const scaling = (1 + act * 0.22) * (1 + depth * 0.055 + (depth / 60) ** 1.4)
        * (1 + levelPressure * 0.055) ** 1.15;
    const count = Math.min(40, (bossWave ? 10 + act * 3 : 5 + localWave * 3 + act * 3) + Math.floor(depth / 4) + difficulty.extra);
    for (let i = 0; i < count; i++) {
        const boss = bossWave && i === 0;
        const kind = boss ? "boss" : enemyKindForWave(state.wave, i);
        const side = Math.floor(state.random() * 4);
        const t = 0.08 + state.random() * 0.84;
        const x = side === 0 ? MARGIN : side === 1 ? WIDTH - MARGIN : WIDTH * t;
        const y = side === 2 ? MARGIN : side === 3 ? HEIGHT - MARGIN : HEIGHT * t;
        const elite = !boss && state.wave >= 6 && i % (depth ? 3 : 5) === 0 ? 1 : 0;
        const health = Math.round((boss ? 680 + act * 380 : (kind === "brute" || kind === "sentinel" ? 75 : kind === "runner" ? 20 : 32) + Math.min(state.wave, LAST_WAVE) * 10) * scaling * (elite ? 1.7 : 1));
        state.enemies.push({
            kind, x, y, health, maxHealth: health, elite, charging: 0, chargeX: 0, chargeY: 0,
            combat: { volleys: [], phase: 1, rest: 0, pattern: 1 },
            radius: boss ? 32 : kind === "brute" || kind === "sentinel" ? 22 : kind === "runner" ? 12 : 15,
            speed: boss ? 70 + act * 8 : kind === "runner" ? 160 + act * 10 : kind === "sentinel" ? 55 : kind === "brute" ? 62 : ["wisp", "spitter", "summoner", "cantor", "hexer"].includes(kind) ? 80 : 92 + Math.min(state.wave, LAST_WAVE) * 2.2,
            damage: Math.round((boss ? 30 + act * 10 : kind === "sentinel" ? 26 + act * 4 : kind === "brute" ? 22 + act * 5 : 13 + Math.min(state.wave, LAST_WAVE) * 1.5)
                * (1 + act * 0.045 + depth * 0.009 + levelPressure * 0.008) * (elite ? 1.3 : 1)),
            cooldown: 1.2, flash: 0, slam: 4, winding: 0, attackWindup: 0, attackX: x, attackY: y, chilled: 0, chillStrength: 0
        });
        const spawned = state.enemies[state.enemies.length - 1];
        const traits = Object.keys(ELITE_MODIFIERS).filter(key => key !== "none");
        spawned.modifier = elite && state.wave >= 11 && state.random() < 0.35
            ? traits[Math.floor(state.random() * traits.length)] : "none";
        spawned.health = spawned.maxHealth = Math.round(spawned.maxHealth * difficulty.health);
        spawned.damage = Math.round(spawned.damage * difficulty.damage);
        spawned.speed = Math.min(210, spawned.speed) * difficulty.speed * (1 + Math.min(0.15, depth * 0.0015));
    }
    state.journal = bossWave ? `${map.boss} awakens. Escape the slam${act ? " and its projectile volley" : ""}!`
        : localWave === 1 && act > 0 ? `${map.name}. The next stage begins. ${map.description}`
        : state.wave === 3 ? "Ash runners join the hunt. Fast but fragile: cleave before they surround you."
        : `Wave ${state.wave}. ${count} enemies emerge in ${map.name}.`;
}

// Spawns a fan of enemy projectiles centered on `angle` with the given angular `offsets` and speed
// — shared by boss ranged attack patterns, hexers, and generic ranged enemy kinds. Capped at 48
// concurrent projectiles total to bound worst-case per-frame collision cost.
function fireVolley(state, enemy, angle, offsets, speed) {
    for (const offset of offsets) {
        if (state.projectiles.length >= 48) break;
        state.projectiles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle + offset) * speed, vy: Math.sin(angle + offset) * speed,
            life: 3, damage: enemy.damage, source: enemyDamageSource(enemy, "projectile") });
    }
}

// Pulls nearby loot toward the player (range widened by the Magnet power-up and Call of the fallen
// boon) and, once close enough (or if `collectAll` forces immediate pickup), applies the drop's
// effect: gold with the Ferryman's due bonus, flask refilling or converting into a bonus heal if
// full, health/power-up drops applying directly, and weapon/armor/upgrade drops only replacing the
// player's current gear if strictly better (otherwise auto-salvaged for a small gold refund).
function collectLoot(state, dt, collectAll = false) {
    const p = state.player;
    for (const drop of state.loot) {
        if (drop.life <= 0) continue;
        const d = distance(p, drop);
        if (d < (state.buffs.magnet > 0 ? 270 : 95) + state.boons.harvest * 16 && d > 1) {
            const travel = Math.min(d, (1200 + d * 6) * dt);
            drop.x += (p.x - drop.x) / d * travel;
            drop.y += (p.y - drop.y) / d * travel;
        }
        if (!collectAll && distance(p, drop) > 28) continue;
        drop.life = 0;
        if (drop.kind === "gold") state.gold += goldReward(drop.value, state.boons.fortune);
        else if (drop.kind === "flask") {
            const full = p.potions >= MAX_FLASKS;
            if (full) p.health = Math.min(p.maxHealth, p.health + p.maxHealth * 0.08 * difficultyFor(state).healing);
            else p.potions++;
            effect(state, "text", p.x, p.y - 45, "#e6a39a", full ? "FLASK HEAL" : "+1 FLASK");
        }
        else if (drop.kind === "health") p.health = Math.min(p.maxHealth, p.health + drop.value * difficultyFor(state).healing);
        else if (drop.kind === "power") {
            const power = POWER_UPS[drop.value];
            state.buffs[power.key] = power.duration;
            state.journal = `${power.name}: ${power.detail} for ${power.duration}s. Picking up another refreshes the duration.`;
            effect(state, "text", p.x, p.y - 50, power.color, power.name.toUpperCase());
        } else if (drop.kind === "upgrade") {
            const key = Object.keys(UPGRADES)[drop.value];
            grantUpgrade(state, key);
            effect(state, "text", p.x, p.y - 50, "#eed0ff", `${UPGRADES[key].name.toUpperCase()} +1`);
        } else if (drop.kind === "armor") {
            if (drop.value > p.armorBonus) {
                p.armorBonus = drop.value;
                p.armor = drop.value >= 30 ? "Starwoven mantle" : drop.value >= 15 ? "Warden's mail" : "Ashguard leather";
                state.journal = `${p.armor} equipped. ${(drop.value * 0.6).toFixed(1)} armor from equipment. Forge bonuses are retained.`;
                effect(state, "text", p.x, p.y - 45, "#b5b9f2", "ARMOR UPGRADED");
            } else state.gold += goldReward(10);
        } else if (drop.value > p.weaponBonus) {
            p.weaponBonus = drop.value;
            p.weapon = `${drop.value >= 54 ? "Cinder crown" : drop.value >= 33 ? "Mireglass" : drop.value >= 18 ? "Ashen sovereign" : drop.value >= 9 ? "Emberforged" : "Tempered hollow"} ${classFor(state).weaponType}`;
            state.journal = `${p.weapon} equipped. Relic rating ${drop.value}; +${Math.round(60 * (Math.sqrt(1 + drop.value / 30) - 1))} weapon damage.`;
            effect(state, "text", p.x, p.y - 45, "#a8d5cf", "WEAPON UPGRADED");
        } else state.gold += goldReward(10);
    }
    state.loot = state.loot.filter(drop => drop.life > 0);
}

// Called when the last enemy of a boss wave dies — clears the battlefield, grants a partial heal and
// a couple flask charges, and transitions to "won" (final campaign wave) or "camp" (an
// in-between-maps checkpoint to rest, shop the forge, and choose to continue).
function finishCheckpoint(state) {
    const p = state.player;
    collectLoot(state, 0, true);
    state.projectiles = [];
    state.playerShots = [];
    p.health = Math.min(p.maxHealth, p.health + p.maxHealth * 0.2 * difficultyFor(state).healing);
    p.potions = Math.min(MAX_FLASKS, p.potions + 2);
    state.status = state.mode === "campaign" && state.wave === LAST_WAVE ? "won" : "camp";
    if (state.status === "won") state.campaignComplete = 1;
    state.journal = state.mode === "endless" ? "Stage cleared. All loot collected, partial healing and two flask charges granted. Saving before the next watch." : mapForWave(state.wave).ending;
}

// The single per-frame simulation entry point, called once per animation frame by arpg.js's render
// loop with elapsed real time and the current input snapshot (movement axes, aim point, action
// buttons). Does nothing unless status is "playing". `dt` is clamped to 0.05s so a lag spike can't
// cause one giant catch-up step that teleports everything or lets enemies all attack at once.
export function step(state, input, elapsed) {
    if (state.status !== "playing" || !Number.isFinite(elapsed) || elapsed <= 0) return;
    const dt = Math.min(elapsed, 0.05);
    if (state.resumeDelay > 0) {
        state.resumeDelay = Math.max(0, state.resumeDelay - dt);
        if (state.travelPending && state.resumeDelay <= 1.5) {
            state.travelPending = 0;
            spawnWave(state);
            state.intermission = 3.5;
        }
        return;
    }
    state.time = (state.time + dt) % 3600;
    for (const hit of state.damageHistory) hit.age += dt;
    state.damageHistory = state.damageHistory.filter(hit => hit.age <= 8);
    const p = state.player;
    p.swing = Math.max(0, (p.swing ?? 0) - dt);
    p.casting = Math.max(0, (p.casting ?? 0) - dt);
    const wardWasActive = p.guarding > 0;
    const regeneration = Math.min(p.renewal, dt);
    for (const power of POWER_UPS) state.buffs[power.key] = Math.max(0, state.buffs[power.key] - dt);
    for (const key of [...SKILL_KEYS, "guarding", "invulnerable", "rolling", "afterstep", "flaskWard", "renewal"]) {
        const recovery = SKILL_KEYS.includes(key) ? cooldownRecovery(state) : 1;
        p[key] = Math.max(0, p[key] - dt * recovery);
    }
    if (wardWasActive && p.guarding === 0) p.guard = Math.max(p.guard, 4);
    if (regeneration > 0) p.health = Math.min(p.maxHealth, p.health + p.maxHealth * state.skillTree.potion.renewal * 0.02 * regeneration * difficultyFor(state).healing);
    if (wardWasActive && p.guarding === 0 && state.skillTree.guard.refuge > 0) {
        p.health = Math.min(p.maxHealth, p.health + p.maxHealth * state.skillTree.guard.refuge * 0.02 * difficultyFor(state).healing);
        effect(state, "heal", p.x, p.y, "#9de8ad", "", 28);
    }
    let dx = input.x || 0;
    let dy = input.y || 0;
    const length = Math.hypot(dx, dy);
    if (length > 0) {
        dx /= length;
        dy /= length;
        p.facing = Math.atan2(dy, dx);
    }
    if (input.aim) p.facing = Math.atan2(input.aim.y - p.y, input.aim.x - p.x);
    if (input.dodge) useSkill(state, "dodge");
    if (input.potion) useSkill(state, "potion");
    if (input.attack) useSkill(state, "attack");
    if (input.manual) useSkill(state, state.loadout.manual);
    autoCast(state);
    if (state.status !== "playing") return;
    const rolling = p.rolling > 0;
    const map = mapForWave(state.wave);
    const slowed = map.hazard === "slow" && map.hazards.some(pool => distance(p, pool) < pool.radius);
    const speed = movementSpeed(state) * (slowed ? 135 / 220 : 1);
    const targetVx = rolling ? p.rollX * 690 : dx * speed;
    const targetVy = rolling ? p.rollY * 690 : dy * speed;
    const smoothing = rolling ? 1 : 1 - Math.exp(-dt * 13);
    p.vx += (targetVx - p.vx) * smoothing;
    p.vy += (targetVy - p.vy) * smoothing;
    p.stridePhase = (p.stridePhase ?? 0) + Math.hypot(p.vx, p.vy) * dt * 0.08;
    p.x = clamp(p.x + p.vx * dt, MARGIN, WIDTH - MARGIN);
    p.y = clamp(p.y + p.vy * dt, MARGIN, HEIGHT - MARGIN);
    if (state.enemies.some(enemy => enemy.health > 0) && ["fire", "storm", "void"].includes(map.hazard) && firePhase(state.time) >= 4
        && map.hazards.some(seal => distance(p, seal) < seal.radius + p.radius)) hurtPlayer(state, 12 + mapIndexForWave(state.wave) * 4, `${map.name}: ${map.hazard} ground hazard`);

    stepPlayerShots(state, dt);
    if (state.status !== "playing") return;
    // Per-enemy AI: each kind has its own movement/attack pattern below (lancer charges down a
    // lane, reaver winds up then dashes, bomber self-detonates on approach, boss cycles through
    // health-gated phases/patterns, and the remaining "generic" kinds share a common
    // chase-then-windup-then-strike flow at the bottom of the loop). The frequent
    // `state.status !== "playing"` checks are needed because hurtPlayer() inside this loop can end
    // the run (player death) mid-iteration.
    for (const enemy of state.enemies) {
        if (state.status !== "playing") break;
        if (enemy.health <= 0) continue;
        if (enemy.modifier === "mending") enemy.health = Math.min(enemy.maxHealth, enemy.health + enemy.maxHealth * 0.015 * dt);
        enemy.chilled = Math.max(0, enemy.chilled - dt);
        if (enemy.chilled === 0) enemy.chillStrength = 0;
        enemy.cooldown = Math.max(-5, enemy.cooldown - dt);
        enemy.flash = Math.max(0, enemy.flash - dt);
        enemy.swing = Math.max(0, (enemy.swing ?? 0) - dt);
        enemy.moving = false;
        const d = distance(p, enemy);
        const ex = (p.x - enemy.x) / (d || 1);
        const ey = (p.y - enemy.y) / (d || 1);
        if (enemy.kind === "lancer") {
            if (enemy.charging > 0) {
                const start = { x: enemy.x, y: enemy.y };
                const travel = Math.min(dt, enemy.charging) * 1200;
                enemy.x = clamp(enemy.x + enemy.chargeX * travel, MARGIN, WIDTH - MARGIN);
                enemy.y = clamp(enemy.y + enemy.chargeY * travel, MARGIN, HEIGHT - MARGIN);
                enemy.charging = Math.max(0, enemy.charging - dt);
                if (distanceToSegment(p, start, enemy) < enemy.radius + p.radius) hurtPlayer(state, enemy.damage * 1.5, enemyDamageSource(enemy, "charge"));
                if (!enemy.charging) enemy.slam = 3.8;
            } else if (enemy.winding > 0) {
                enemy.winding = Math.max(0, enemy.winding - dt);
                if (!enemy.winding) enemy.charging = distance(enemy, chargeLaneEnd(enemy)) / 1200;
            } else {
                enemy.slam -= dt;
                if (enemy.slam <= 0) {
                    const targetX = clamp(p.x, MARGIN + 80, WIDTH - MARGIN - 80);
                    const targetY = clamp(p.y, MARGIN + 80, HEIGHT - MARGIN - 80);
                    const length = Math.hypot(targetX - enemy.x, targetY - enemy.y) || 1;
                    enemy.chargeX = (targetX - enemy.x) / length;
                    enemy.chargeY = (targetY - enemy.y) / length;
                    enemy.winding = 1.1;
                }
            }
            continue;
        }
        if (enemy.kind === "reaver") {
            if (enemy.charging > 0) {
                enemy.charging = Math.max(0, enemy.charging - dt);
                enemy.x = clamp(enemy.x + enemy.chargeX * 560 * dt, MARGIN, WIDTH - MARGIN);
                enemy.y = clamp(enemy.y + enemy.chargeY * 560 * dt, MARGIN, HEIGHT - MARGIN);
                if (distance(p, enemy) < enemy.radius + p.radius + 8) hurtPlayer(state, enemy.damage * 2, enemyDamageSource(enemy, "charge"));
                continue;
            }
            if (enemy.winding > 0) {
                enemy.winding = Math.max(0, enemy.winding - dt);
                if (!enemy.winding) { enemy.charging = 0.45; enemy.slam = 3.5; }
                continue;
            }
            enemy.slam -= dt;
            if (enemy.slam <= 0 && d < 450) {
                enemy.winding = 0.9; enemy.chargeX = ex; enemy.chargeY = ey;
                continue;
            }
        }
        if (enemy.kind === "bomber") {
            if (enemy.winding > 0) {
                enemy.winding = Math.max(0, enemy.winding - dt);
                if (!enemy.winding) {
                    effect(state, "ring", enemy.x, enemy.y, "#ffc36d", "", 110);
                    if (d < 110 + p.radius) hurtPlayer(state, enemy.damage * 2, enemyDamageSource(enemy, "explosion"));
                    enemy.health = 0;
                    if (state.status === "playing") killEnemy(state, enemy);
                }
                continue;
            }
            if (d < 95) { enemy.winding = 1.1; continue; }
        }
        if (enemy.kind === "boss") {
            const combat = enemy.combat;
            if (combat.rest > 0) {
                combat.rest = Math.max(0, combat.rest - dt);
                continue;
            }
            if (enemy.winding > 0) {
                enemy.winding = Math.max(0, enemy.winding - dt);
                if (enemy.winding === 0) {
                    const angle = Math.atan2(enemy.attackY - enemy.y, enemy.attackX - enemy.x);
                    if (combat.pattern === 1) {
                        effect(state, "ring", enemy.x, enemy.y, "#ff775c", "", 135);
                        if (d < 135 + p.radius) hurtPlayer(state, Math.round(enemy.damage * 1.5), enemyDamageSource(enemy, "slam"));
                    } else if (combat.pattern === 2) {
                        fireVolley(state, enemy, angle, [-0.6, -0.3, 0, 0.3, 0.6], 190);
                    } else {
                        fireVolley(state, enemy, angle, Array.from({ length: 8 }, (_, i) => i * Math.PI / 4), 155);
                    }
                    combat.rest = combat.pattern === 3 ? 2 : 1.5;
                    enemy.slam = 3;
                    enemy.cooldown = Math.max(enemy.cooldown, 1);
                }
                continue;
            }
            const phase = enemy.health <= enemy.maxHealth / 3 ? 3 : enemy.health <= enemy.maxHealth * 2 / 3 ? 2 : 1;
            if (phase > combat.phase) {
                combat.phase = phase;
                combat.rest = 1.5;
                enemy.attackWindup = 0;
                effect(state, "text", enemy.x, enemy.y - 60, "#ffd18d", `PHASE ${phase}`);
                continue;
            }
            enemy.slam -= dt;
            if (enemy.slam <= 0 && enemy.attackWindup === 0) {
                combat.pattern = combat.phase === 1 ? 1 : combat.pattern % combat.phase + 1;
                enemy.attackX = p.x;
                enemy.attackY = p.y;
                enemy.winding = 1.1;
                continue;
            }
        }
        const ranged = ["wisp", "spitter", "summoner", "cantor", "hexer", "artillerist"].includes(enemy.kind);
        let attackReady = false;
        if (enemy.attackWindup > 0) {
            enemy.attackWindup = Math.max(0, enemy.attackWindup - dt);
            if (enemy.attackWindup > 0) continue;
            attackReady = true;
        }
        const stoppingDistance = enemy.kind === "artillerist" ? 360 : ranged ? 230 : enemy.radius + p.radius + 2;
        if (d > stoppingDistance && enemy.winding <= 0 && !attackReady) {
            const movement = Math.min(enemy.speed * (enemy.modifier === "swift" ? 1.18 : 1) * (1 - enemy.chillStrength) * dt, d - stoppingDistance);
            enemy.moving = true;
            enemy.stridePhase = (enemy.stridePhase ?? 0) + movement * 0.1;
            const flank = enemy.kind === "duelist" && d > 100 ? Math.sin(state.time * 2 + enemy.maxHealth) * 0.65 : 0;
            enemy.x = clamp(enemy.x + (ex - ey * flank) * movement, MARGIN, WIDTH - MARGIN);
            enemy.y = clamp(enemy.y + (ey + ex * flank) * movement, MARGIN, HEIGHT - MARGIN);
        }
        if (enemy.cooldown <= 0 && enemy.winding <= 0) {
            const meleeReach = enemy.kind === "duelist" ? 85 : enemy.radius + p.radius + 28;
            if (!attackReady) {
                if (d < (ranged ? enemy.kind === "artillerist" ? 650 : 430 : meleeReach)) {
                    enemy.attackX = p.x;
                    enemy.attackY = p.y;
                    enemy.attackWindup = enemy.kind === "artillerist" ? 1.1 : enemy.kind === "brute" ? 0.8 : enemy.kind === "duelist" ? 0.65 : 0.55;
                }
                continue;
            }
            if (enemy.kind === "artillerist") {
                effect(state, "ring", enemy.attackX, enemy.attackY, "#d39bff", "", 90);
                if (Math.hypot(p.x - enemy.attackX, p.y - enemy.attackY) < 90 + p.radius) hurtPlayer(state, enemy.damage * 1.4, enemyDamageSource(enemy, "mortar blast"));
                enemy.cooldown = 3.8;
                enemy.swing = 0.3;
            } else if (enemy.kind === "summoner") {
                if (state.enemies.length < 32) {
                    const health = Math.round(enemy.maxHealth * 0.35);
                    state.enemies.push({ ...enemy, kind: "husk", elite: 0, modifier: "none", combat: { volleys: [], phase: 1, rest: 0, pattern: 1 }, x: clamp(enemy.x + 24, MARGIN, WIDTH - MARGIN), health, maxHealth: health, radius: 14, speed: 100, cooldown: 1.5, attackWindup: 0, chilled: 0, chillStrength: 0 });
                    effect(state, "ring", enemy.x, enemy.y, "#cb9bea", "", 55);
                }
                enemy.cooldown = 5.5;
                enemy.swing = 0.3;
            } else if (enemy.kind === "cantor") {
                for (const ally of state.enemies) {
                    if (ally.health > 0 && distance(enemy, ally) < 180) ally.health = Math.min(ally.maxHealth, ally.health + Math.ceil(ally.maxHealth * 0.06));
                }
                effect(state, "ring", enemy.x, enemy.y, "#aeedbf", "", 180);
                enemy.cooldown = 3;
                enemy.swing = 0.3;
            } else if (enemy.kind === "hexer") {
                fireVolley(state, enemy, state.time, Array.from({ length: 8 }, (_, i) => i * Math.PI / 4), 155);
                enemy.cooldown = 3.2;
                enemy.swing = 0.3;
            } else if (ranged && d < 430) {
                fireVolley(state, enemy, Math.atan2(enemy.attackY - enemy.y, enemy.attackX - enemy.x), enemy.kind === "spitter" ? [-0.25, 0, 0.25] : [0], 190);
                enemy.cooldown = enemy.kind === "spitter" ? 2.6 : 2;
                enemy.swing = 0.3;
            } else if (!ranged) {
                const facing = Math.atan2(enemy.attackY - enemy.y, enemy.attackX - enemy.x);
                effect(state, "slash", enemy.x, enemy.y, enemy.kind === "duelist" ? "#85e6eb" : "#f18a68", "", meleeReach, facing);
                if (d < meleeReach + p.radius && Math.cos(Math.atan2(ey, ex) - facing) > 0.25) hurtPlayer(state, enemy.damage, enemyDamageSource(enemy, "melee strike"));
                enemy.cooldown = 1;
                enemy.swing = 0.3;
            }
        }
    }
    state.enemies = state.enemies.filter(enemy => enemy.health > 0);
    if (state.status !== "playing") return;
    for (const bolt of state.projectiles) {
        bolt.life -= dt;
        bolt.x += bolt.vx * dt;
        bolt.y += bolt.vy * dt;
        if (distance(p, bolt) < p.radius + 6) {
            hurtPlayer(state, bolt.damage, bolt.source ?? "Enemy projectile (older save)");
            bolt.life = 0;
        }
    }
    state.projectiles = state.projectiles.filter(bolt => bolt.life > 0);
    if (state.status !== "playing") return;
    collectLoot(state, dt);
    for (const item of state.effects) item.life -= dt;
    state.effects = state.effects.filter(item => item.life > 0);
    if (state.enemies.length === 0) {
        state.projectiles = [];
        state.playerShots = [];
        if (state.wave > 0 && state.wave % WAVES_PER_MAP === 0) {
            finishCheckpoint(state);
        } else {
            state.intermission -= dt;
            if (state.intermission <= 0) {
                spawnWave(state);
                state.intermission = 3.5;
            }
        }
    }
}
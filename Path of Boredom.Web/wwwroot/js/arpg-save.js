import { WIDTH, HEIGHT, createState } from "./arpg-engine.js";
import { LAST_WAVE, ENEMY_KINDS, UPGRADES, POWER_UPS } from "./arpg-campaign.js";
import { LEVEL_CARDS } from "./arpg-cards.js";
import { DIFFICULTIES } from "./arpg-difficulty.js";
import { MASTERY, MAX_FLASKS } from "./arpg-engine.js";
import { HERO_CLASSES } from "./arpg-classes.js";
import { ELITE_MODIFIERS } from "./arpg-modifiers.js";
import { SKILL_KEYS, SLOTTABLE_SKILLS, TREE_NODES, skillPointsLeft, skillUnlocked, validLoadout } from "./arpg-skills.js";

const playerNumbers = "x y radius facing health maxHealth level xp nextLevel damage weaponBonus potions attack nova dodge potion invulnerable rolling rollX rollY vx vy".split(" ");
const enemyNumbers = "x y health maxHealth radius speed damage cooldown flash slam winding".split(" ");
const projectileNumbers = "x y vx vy life damage".split(" ");
const lootNumbers = "x y value life".split(" ");

function require(condition) {
    if (!condition) throw new Error("The save is damaged or uses an unsupported version. Your current run is unchanged.");
}

function numbers(source, names) {
    require(source !== null && typeof source === "object" && !Array.isArray(source));
    return Object.fromEntries(names.map(name => {
        const value = source[name];
        require(typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER);
        return [name, value];
    }));
}

function text(value) {
    require(typeof value === "string" && value.length <= 200);
    return value.replace(/\uFFFD/g, "-");
}

function array(value, copy) {
    require(Array.isArray(value) && value.length <= 128);
    return value.map(copy);
}

function integer(value, min, max) {
    require(Number.isInteger(value) && value >= min && value <= max);
}

export function restoreSnapshot(snapshot, random = Math.random) {
    require([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].includes(snapshot?.version));
    const saved = snapshot.state;
    const state = createState(random);
    state.rankingPatch = snapshot.version < 13 ? "pre004" : saved.rankingPatch;
    require(["004", "pre004"].includes(state.rankingPatch));
    state.volleySequence = snapshot.version < 14 ? 2 : saved.volleySequence;
    integer(state.volleySequence, 2, Number.MAX_SAFE_INTEGER);
    state.heroClass = snapshot.version < 7 ? "knight" : saved.heroClass;
    require(Object.hasOwn(HERO_CLASSES, state.heroClass));
    if (snapshot.version >= 7) {
        state.playerShots = array(saved.playerShots, item => {
            const shot = numbers(item, [...projectileNumbers, "piercing"]);
            require(shot.life > 0 && shot.life <= 2 && shot.damage > 0);
            integer(shot.piercing, 0, 1);
            shot.skill = snapshot.version < 9 ? shot.piercing ? "nova" : "attack" : item.skill;
            require(["attack", "nova", "burst"].includes(shot.skill));
            shot.volley = snapshot.version < 14 ? shot.skill === "attack" ? 0 : shot.skill === "nova" ? 1 : 2 : item.volley;
            integer(shot.volley, shot.skill === "attack" ? 0 : 1, shot.skill === "attack" ? 0 : state.volleySequence);
            return shot;
        });
        require(state.playerShots.length <= 48 && (state.heroClass === "ranger" || state.playerShots.length === 0));
    }
    state.difficulty = snapshot.version < 5 ? "legacy" : saved.difficulty;
    state.rankingMode = snapshot.version < 5 ? "legacy" : saved.rankingMode;
    require(state.difficulty === "legacy" || Object.hasOwn(DIFFICULTIES, state.difficulty));
    require(["campaign", "endless", "ascended", "legacy"].includes(state.rankingMode));
    require(state.difficulty !== "legacy" || state.rankingMode === "legacy");
    if (snapshot.version >= 6) {
        Object.assign(state.mastery, numbers(saved.mastery, snapshot.version < 8 ? ["might", "vitality", "recovery"] : Object.keys(MASTERY)));
        for (const rank of Object.values(state.mastery)) integer(rank, 0, Number.MAX_SAFE_INTEGER);
        require(Number.isSafeInteger(Object.values(state.mastery).reduce((total, rank) => total + rank, 0)));
        state.scoreBaseline = saved.scoreBaseline;
    }
    Object.assign(state, numbers(saved, ["time", "wave", "intermission", "kills", "gold"]));
    integer(state.scoreBaseline, 0, state.kills);
    require(["playing", "paused", "camp", "won", "choosing"].includes(saved.status));
    state.mode = snapshot.version === 1 ? "campaign" : saved.mode;
    state.campaignComplete = snapshot.version === 1 ? 0 : saved.campaignComplete;
    require(["campaign", "endless"].includes(state.mode));
    require(!["ascended", "endless"].includes(state.rankingMode) || state.mode === "endless");
    integer(state.campaignComplete, 0, 1);
    integer(state.wave, 0, state.mode === "campaign" ? LAST_WAVE : Number.MAX_SAFE_INTEGER);
    if (state.mode === "endless") require(state.campaignComplete === 1 && state.wave >= LAST_WAVE);
    const oldUpgradeKeys = ["weapon", "armor", "cleave", "nova", "dodge", "flask", ...(snapshot.version >= 8 ? ["critChance", "critDamage"] : [])];
    const completedOldForge = snapshot.version >= 2 && snapshot.version < 9
        && oldUpgradeKeys.every(key => saved.upgrades?.[key] === UPGRADES[key].max);
    for (const [key, upgrade] of Object.entries(UPGRADES)) {
        const isNew = snapshot.version < 8 && ["critChance", "critDamage"].includes(key) || snapshot.version < 9 && ["burst", "guard"].includes(key);
        const rank = snapshot.version === 1 ? 0 : isNew
            ? completedOldForge ? upgrade.max : 0 : saved.upgrades?.[key];
        integer(rank, 0, upgrade.max);
        state.upgrades[key] = rank;
    }
    require(!Object.values(state.mastery).some(rank => rank > 0) || Object.entries(UPGRADES).every(([key, value]) => state.upgrades[key] === value.max));
    for (const power of POWER_UPS) {
        const remaining = snapshot.version < 3 ? 0 : saved.buffs?.[power.key];
        require(typeof remaining === "number" && Number.isFinite(remaining) && remaining >= 0 && remaining <= power.duration);
        state.buffs[power.key] = remaining;
    }
    integer(state.kills, 0, Number.MAX_SAFE_INTEGER);
    integer(state.gold, 0, Number.MAX_SAFE_INTEGER);
    require(state.time >= 0 && state.intermission >= 0 && state.intermission <= 3.5);
    state.player = numbers({ vx: 0, vy: 0, ...saved.player }, playerNumbers);
    const p = state.player;
    Object.assign(p, numbers(snapshot.version < 9 ? { burst: 0, guard: 0, guarding: 0 } : saved.player, ["burst", "guard", "guarding"]));
    Object.assign(p, numbers(snapshot.version < 12 ? { afterstep: 0, flaskWard: 0, renewal: 0 } : saved.player, ["afterstep", "flaskWard", "renewal"]));
    let previousTreePoints = 0;
    if (snapshot.version >= 9) {
        Object.assign(state, numbers(saved, ["resumeDelay", "travelPending"]));
        require(state.resumeDelay >= 0 && state.resumeDelay <= 3);
        integer(state.travelPending, 0, 1);
        const slotKeys = snapshot.version < 10 ? SKILL_KEYS : SLOTTABLE_SKILLS;
        require(saved.loadout && slotKeys.includes(saved.loadout.manual));
        state.loadout = { manual: saved.loadout.manual, auto: array(saved.loadout.auto, key => {
            require(key === "none" || slotKeys.includes(key) && key !== saved.loadout.manual);
            return key;
        }) };
        const slotted = state.loadout.auto.filter(key => key !== "none");
        require(state.loadout.auto.length === (snapshot.version < 10 ? 3 : 2) && new Set(slotted).size === slotted.length);
        if (snapshot.version < 10) {
            if (!SLOTTABLE_SKILLS.includes(state.loadout.manual)) state.loadout.manual = "nova";
            const auto = state.loadout.auto.filter(key => SLOTTABLE_SKILLS.includes(key) && key !== state.loadout.manual);
            state.loadout.auto = [auto[0] ?? "none", auto[1] ?? "none"];
        }
        require(saved.skillTree && typeof saved.skillTree === "object");
        for (const skill of SKILL_KEYS) {
            const keys = snapshot.version < 12 ? ["potency", "reach", "ember", "recovery"] : Object.keys(TREE_NODES[skill]);
            const nodes = numbers(saved.skillTree[skill], keys);
            keys.forEach((key, index) => integer(nodes[key], 0, [3, 2, 1, 2][index]));
            require(!(nodes[keys[1]] || nodes[keys[2]]) || nodes[keys[0]] > 0);
            require(!nodes[keys[3]] || nodes[keys[1]] > 0 || nodes[keys[2]] > 0);
            if (snapshot.version >= 12) state.skillTree[skill] = nodes;
            else previousTreePoints += Object.values(nodes).reduce((sum, rank) => sum + rank, 0);
        }
        require(previousTreePoints <= Math.min(12, Math.floor(p.level / 5)));
        require(skillPointsLeft(state) >= 0);
    }
    if (snapshot.version >= 11) {
        integer(saved.wardUnlockSeen, 0, 1);
        state.wardUnlockSeen = saved.wardUnlockSeen;
        require(validLoadout(state, state.loadout.manual, state.loadout.auto));
        require(skillUnlocked(state, "guard") || p.guarding === 0);
    } else {
        if (!skillUnlocked(state, state.loadout.manual)) state.loadout.manual = "nova";
        state.loadout.auto = state.loadout.auto.map(key => skillUnlocked(state, key) && key !== state.loadout.manual ? key : "none");
        state.wardUnlockSeen = state.loadout.manual === "guard" || state.loadout.auto.includes("guard") ? 1 : 0;
        if (!skillUnlocked(state, "guard")) { p.guard = 0; p.guarding = 0; }
    }
    p.weapon = text(saved.player.weapon);
    p.armorBonus = snapshot.version === 1 ? 0 : saved.player.armorBonus;
    p.armor = snapshot.version === 1 ? "Traveler's coat" : text(saved.player.armor);
    integer(p.armorBonus, 0, 40);
    require(p.x >= 42 && p.x <= WIDTH - 42 && p.y >= 42 && p.y <= HEIGHT - 42);
    require(p.health > 0 && p.health <= p.maxHealth && p.radius > 0 && p.radius <= 50);
    integer(p.level, 1, Number.MAX_SAFE_INTEGER);
    if (snapshot.version >= 4) {
        const cardKeys = Object.keys(LEVEL_CARDS).filter(key => (snapshot.version >= 8 || !["critChance", "critDamage"].includes(key)) && (snapshot.version >= 9 || !["burst", "guard"].includes(key)));
        Object.assign(state.boons, numbers(saved.boons, cardKeys));
        for (const [key, card] of Object.entries(LEVEL_CARDS)) integer(state.boons[key], 0, card.max);
        state.pendingChoices = saved.pendingChoices;
        integer(state.pendingChoices, 0, p.level - 1);
        require(Object.values(state.boons).reduce((sum, rank) => sum + rank, state.pendingChoices) <= p.level - 1);
        state.cardChoices = array(saved.cardChoices, key => {
            require(typeof key === "string" && Object.hasOwn(LEVEL_CARDS, key) && state.boons[key] < LEVEL_CARDS[key].max);
            require(cardKeys.includes(key));
            return key;
        });
        require(state.cardChoices.length === (state.pendingChoices > 0 ? 3 : 0));
        require(new Set(state.cardChoices).size === state.cardChoices.length);
    }
    require((state.pendingChoices > 0) === (saved.status === "choosing"));
    integer(p.potions, 0, MAX_FLASKS);
    require(p.nextLevel > 0 && p.xp >= 0 && p.xp < p.nextLevel && p.damage > 0 && p.weaponBonus >= 0);
    for (const key of SKILL_KEYS) require(p[key] >= 0 && p[key] <= 30);
    for (const key of ["invulnerable", "rolling"]) require(p[key] >= 0 && p[key] <= 10);
    require(p.guarding >= 0 && p.guarding <= 8);
    require(p.afterstep >= 0 && p.afterstep <= 1.2 && p.flaskWard >= 0 && p.flaskWard <= 2 && p.renewal >= 0 && p.renewal <= 2);
    require(!p.afterstep || state.skillTree.dodge.afterstep > 0);
    require(!p.flaskWard || state.skillTree.potion.tonic > 0);
    require(!p.renewal || state.skillTree.potion.renewal > 0);
    state.enemies = array(saved.enemies, item => {
        const enemy = numbers(item, enemyNumbers);
        Object.assign(enemy, numbers({ elite: 0, charging: 0, chargeX: 0, chargeY: 0, ...item }, ["elite", "charging", "chargeX", "chargeY"]));
        Object.assign(enemy, numbers(snapshot.version < 9 ? { attackWindup: 0, attackX: enemy.x, attackY: enemy.y } : item, ["attackWindup", "attackX", "attackY"]));
        Object.assign(enemy, numbers(snapshot.version < 12 ? { chilled: 0, chillStrength: 0 } : item, ["chilled", "chillStrength"]));
        require(enemy.chilled >= 0 && enemy.chilled <= 1.5 && enemy.chillStrength >= 0 && enemy.chillStrength <= 0.3);
        require(enemy.chilled > 0 || enemy.chillStrength === 0);
        require(enemy.attackWindup >= 0 && enemy.attackWindup <= 1.1 && enemy.attackX >= 0 && enemy.attackX <= WIDTH && enemy.attackY >= 0 && enemy.attackY <= HEIGHT);
        integer(enemy.elite, 0, 1);
        enemy.modifier = snapshot.version < 13 ? "none" : item.modifier;
        require(typeof enemy.modifier === "string" && Object.hasOwn(ELITE_MODIFIERS, enemy.modifier));
        require(enemy.modifier === "none" || enemy.elite === 1 && item.kind !== "boss" && state.wave >= 11);
        const combat = snapshot.version < 14 ? { phase: 1, rest: 0, pattern: 1, volleys: [] } : item.combat;
        enemy.combat = numbers(combat, ["phase", "rest", "pattern"]);
        integer(enemy.combat.phase, 1, item.kind === "boss" ? 3 : 1);
        integer(enemy.combat.pattern, 1, enemy.combat.phase);
        require(enemy.combat.rest >= 0 && enemy.combat.rest <= (item.kind === "boss" ? 2 : 0));
        require(!enemy.combat.rest || enemy.winding === 0 && enemy.attackWindup === 0);
        enemy.combat.volleys = array(combat.volleys, entry => {
            const hit = numbers(entry, ["volley", "hits"]);
            integer(hit.volley, 1, state.volleySequence);
            integer(hit.hits, 1, 3);
            return hit;
        });
        require(enemy.combat.volleys.length <= 48 && new Set(enemy.combat.volleys.map(hit => hit.volley)).size === enemy.combat.volleys.length);
        require(enemy.charging >= 0 && enemy.charging <= (item.kind === "lancer" ? 1.2 : 0.45) && Math.abs(enemy.chargeX) <= 1 && Math.abs(enemy.chargeY) <= 1);
        require(ENEMY_KINDS.includes(item.kind));
        require(enemy.health > 0 && enemy.health <= enemy.maxHealth && enemy.radius > 0 && enemy.radius <= 100);
        require(enemy.speed >= 0 && enemy.damage >= 0 && enemy.winding >= 0 && enemy.winding <= 1.1);
        enemy.kind = item.kind;
        return enemy;
    });
    state.projectiles = array(saved.projectiles, item => {
        const projectile = numbers(item, projectileNumbers);
        require(projectile.life > 0 && projectile.life <= 3 && projectile.damage >= 0);
        projectile.source = snapshot.version < 13 ? "Enemy projectile (older save)" : text(item.source);
        require(projectile.source.trim().length > 0 && projectile.source.length <= 100 && !/[\x00-\x1f\x7f-\x9f]/.test(projectile.source));
        return projectile;
    });
    state.loot = array(saved.loot, item => {
        const loot = numbers(item, lootNumbers);
        require(["gold", "weapon", "armor", "health", "power", "upgrade", "flask"].includes(item.kind));
        require(loot.life > 0 && loot.life <= 30 && loot.value >= 0);
        if (item.kind === "power") integer(loot.value, 0, POWER_UPS.length - 1);
        if (item.kind === "upgrade") integer(loot.value, 0, snapshot.version < 8 ? 5 : snapshot.version < 9 ? 7 : Object.keys(UPGRADES).length - 1);
        loot.kind = item.kind;
        return loot;
    });
    state.journal = text(saved.journal);
    if (previousTreePoints > 0) state.journal = `Skill trees redesigned: ${previousTreePoints} spent points returned. Open Skills & loadout to choose upgrades; your other progression is unchanged.`;
    if (state.travelPending) require(state.resumeDelay > 0 && state.wave > 0 && state.wave % 5 === 0 && !state.enemies.length
        && ["playing", "paused"].includes(saved.status) && (state.mode === "endless" || state.wave < LAST_WAVE));
    if (saved.status === "camp") require(state.wave > 0 && state.wave % 5 === 0 && !state.enemies.length && (state.mode === "endless" ? state.wave > LAST_WAVE : state.wave < LAST_WAVE));
    if (saved.status === "won") require(state.mode === "campaign" && state.wave === LAST_WAVE && state.campaignComplete === 1 && !state.enemies.length);
    state.status = ["camp", "won", "choosing"].includes(saved.status) ? saved.status : "paused";
    return state;
}

export function captureSnapshot(state) {
    require(["playing", "paused", "camp", "won", "choosing"].includes(state.status));
    const restored = restoreSnapshot({ version: 14, state: {
        ...state,
        playerShots: state.playerShots.filter(shot => shot.life > 0),
        enemies: state.enemies.filter(enemy => enemy.health > 0),
        projectiles: state.projectiles.filter(projectile => projectile.life > 0),
        loot: state.loot.filter(drop => drop.life > 0)
    } });
    const { random, effects, damageHistory, ...saved } = restored;
    const snapshot = { version: 14, state: saved };
    require(new TextEncoder().encode(JSON.stringify(snapshot)).length <= 64 * 1024);
    return snapshot;
}
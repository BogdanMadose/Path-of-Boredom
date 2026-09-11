import { WIDTH, HEIGHT, createState } from "./arpg-engine.js";
import { LAST_WAVE, ENEMY_KINDS, UPGRADES, POWER_UPS } from "./arpg-campaign.js";
import { LEVEL_CARDS } from "./arpg-cards.js";
import { DIFFICULTIES } from "./arpg-difficulty.js";
import { MASTERY, MAX_FLASKS } from "./arpg-engine.js";
import { HERO_CLASSES } from "./arpg-classes.js";

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
    require([1, 2, 3, 4, 5, 6, 7, 8].includes(snapshot?.version));
    const saved = snapshot.state;
    const state = createState(random);
    state.heroClass = snapshot.version < 7 ? "knight" : saved.heroClass;
    require(Object.hasOwn(HERO_CLASSES, state.heroClass));
    if (snapshot.version >= 7) {
        state.playerShots = array(saved.playerShots, item => {
            const shot = numbers(item, [...projectileNumbers, "piercing"]);
            require(shot.life > 0 && shot.life <= 2 && shot.damage > 0);
            integer(shot.piercing, 0, 1);
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
    const completedOldForge = snapshot.version >= 2 && snapshot.version < 8
        && ["weapon", "armor", "cleave", "nova", "dodge", "flask"].every(key => saved.upgrades?.[key] === UPGRADES[key].max);
    for (const [key, upgrade] of Object.entries(UPGRADES)) {
        const rank = snapshot.version === 1 ? 0 : snapshot.version < 8 && ["critChance", "critDamage"].includes(key)
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
    p.weapon = text(saved.player.weapon);
    p.armorBonus = snapshot.version === 1 ? 0 : saved.player.armorBonus;
    p.armor = snapshot.version === 1 ? "Traveler's coat" : text(saved.player.armor);
    integer(p.armorBonus, 0, 40);
    require(p.x >= 42 && p.x <= WIDTH - 42 && p.y >= 42 && p.y <= HEIGHT - 42);
    require(p.health > 0 && p.health <= p.maxHealth && p.radius > 0 && p.radius <= 50);
    integer(p.level, 1, Number.MAX_SAFE_INTEGER);
    if (snapshot.version >= 4) {
        Object.assign(state.boons, numbers(saved.boons, Object.keys(LEVEL_CARDS).filter(key => snapshot.version >= 8 || !["critChance", "critDamage"].includes(key))));
        for (const [key, card] of Object.entries(LEVEL_CARDS)) integer(state.boons[key], 0, card.max);
        state.pendingChoices = saved.pendingChoices;
        integer(state.pendingChoices, 0, p.level - 1);
        require(Object.values(state.boons).reduce((sum, rank) => sum + rank, state.pendingChoices) <= p.level - 1);
        state.cardChoices = array(saved.cardChoices, key => {
            require(typeof key === "string" && Object.hasOwn(LEVEL_CARDS, key) && state.boons[key] < LEVEL_CARDS[key].max);
            require(snapshot.version >= 8 || !["critChance", "critDamage"].includes(key));
            return key;
        });
        require(state.cardChoices.length === (state.pendingChoices > 0 ? 3 : 0));
        require(new Set(state.cardChoices).size === state.cardChoices.length);
    }
    require((state.pendingChoices > 0) === (saved.status === "choosing"));
    integer(p.potions, 0, MAX_FLASKS);
    require(p.nextLevel > 0 && p.xp >= 0 && p.xp < p.nextLevel && p.damage > 0 && p.weaponBonus >= 0);
    for (const key of ["attack", "nova", "dodge", "potion", "invulnerable", "rolling"]) require(p[key] >= 0 && p[key] <= 10);
    state.enemies = array(saved.enemies, item => {
        const enemy = numbers(item, enemyNumbers);
        Object.assign(enemy, numbers({ elite: 0, charging: 0, chargeX: 0, chargeY: 0, ...item }, ["elite", "charging", "chargeX", "chargeY"]));
        integer(enemy.elite, 0, 1);
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
        return projectile;
    });
    state.loot = array(saved.loot, item => {
        const loot = numbers(item, lootNumbers);
        require(["gold", "weapon", "armor", "health", "power", "upgrade", "flask"].includes(item.kind));
        require(loot.life > 0 && loot.life <= 30 && loot.value >= 0);
        if (item.kind === "power") integer(loot.value, 0, POWER_UPS.length - 1);
        if (item.kind === "upgrade") integer(loot.value, 0, snapshot.version < 8 ? 5 : Object.keys(UPGRADES).length - 1);
        loot.kind = item.kind;
        return loot;
    });
    state.journal = text(saved.journal);
    if (saved.status === "camp") require(state.wave > 0 && state.wave % 5 === 0 && !state.enemies.length && (state.mode === "endless" ? state.wave > LAST_WAVE : state.wave < LAST_WAVE));
    if (saved.status === "won") require(state.mode === "campaign" && state.wave === LAST_WAVE && state.campaignComplete === 1 && !state.enemies.length);
    state.status = ["camp", "won", "choosing"].includes(saved.status) ? saved.status : "paused";
    return state;
}

export function captureSnapshot(state) {
    require(["playing", "paused", "camp", "won", "choosing"].includes(state.status));
    const restored = restoreSnapshot({ version: 8, state: {
        ...state,
        playerShots: state.playerShots.filter(shot => shot.life > 0),
        enemies: state.enemies.filter(enemy => enemy.health > 0),
        projectiles: state.projectiles.filter(projectile => projectile.life > 0),
        loot: state.loot.filter(drop => drop.life > 0)
    } });
    const { random, effects, ...saved } = restored;
    const snapshot = { version: 8, state: saved };
    require(new TextEncoder().encode(JSON.stringify(snapshot)).length <= 64 * 1024);
    return snapshot;
}
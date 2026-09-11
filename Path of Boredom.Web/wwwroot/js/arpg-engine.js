import { LAST_WAVE, WAVES_PER_MAP, UPGRADES, POWER_UPS, mapForWave, mapIndexForWave, enemyKindForWave, firePhase } from "./arpg-campaign.js";
export { LAST_WAVE } from "./arpg-campaign.js";
import { LEVEL_CARDS, drawLevelCards } from "./arpg-cards.js";
import { DIFFICULTIES, difficultyFor } from "./arpg-difficulty.js";
import { HERO_CLASSES, classFor } from "./arpg-classes.js";
export const WIDTH = 1100;
export const HEIGHT = 650;
export const MAX_FLASKS = 5;
export const MASTERY = {
    might: { name: "Ember might", detail: "+2 base weapon damage" },
    vitality: { name: "Enduring heart", detail: "+5 maximum health and restore 5 health" },
    recovery: { name: "Battle rhythm", detail: "+0.5% skill cooldown recovery" },
    area: { name: "Widening ember", detail: "+1% attack reach and special radius/range; limited to the arena diagonal" },
    speed: { name: "Endless stride", detail: "+1% movement speed; does not change dodge distance" },
    critChance: { name: "Unerring spark", detail: "+0.5 percentage points critical chance; total chance capped at 75%" },
    critDamage: { name: "Endless ruin", detail: "+2 percentage points critical damage" }
};
const MARGIN = 42;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function chargeLaneEnd(enemy) {
    const tx = enemy.chargeX > 0 ? (WIDTH - MARGIN - enemy.x) / enemy.chargeX : enemy.chargeX < 0 ? (MARGIN - enemy.x) / enemy.chargeX : Infinity;
    const ty = enemy.chargeY > 0 ? (HEIGHT - MARGIN - enemy.y) / enemy.chargeY : enemy.chargeY < 0 ? (MARGIN - enemy.y) / enemy.chargeY : Infinity;
    const travel = Math.max(0, Math.min(tx, ty));
    return Number.isFinite(travel) ? { x: enemy.x + enemy.chargeX * travel, y: enemy.y + enemy.chargeY * travel } : { x: enemy.x, y: enemy.y };
}

function distanceToSegment(point, start, end) {
    const dx = end.x - start.x, dy = end.y - start.y;
    const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(point.x - start.x - dx * t, point.y - start.y - dy * t);
}

export function createState(random = Math.random) {
    return {
        random, status: "ready", time: 0, wave: 0, intermission: 0.8,
        mode: "campaign", campaignComplete: 0, difficulty: "hard", rankingMode: "campaign", scoreBaseline: 0,
        mastery: Object.fromEntries(Object.keys(MASTERY).map(key => [key, 0])),
        upgrades: Object.fromEntries(Object.keys(UPGRADES).map(key => [key, 0])),
        buffs: Object.fromEntries(POWER_UPS.map(power => [power.key, 0])),
        boons: Object.fromEntries(Object.keys(LEVEL_CARDS).map(key => [key, 0])),
        pendingChoices: 0, cardChoices: [],
        heroClass: "knight", playerShots: [],
        kills: 0, gold: 0, enemies: [], projectiles: [], loot: [], effects: [],
        journal: "A faint warmth lingers beneath the ashes.",
        player: {
            x: WIDTH / 2, y: HEIGHT / 2, radius: 16, facing: -Math.PI / 2,
            health: 100, maxHealth: 100, level: 1, xp: 0, nextLevel: 60,
            damage: 18, weaponBonus: 0, weapon: "Worn iron blade", potions: 3,
            armorBonus: 0, armor: "Traveler's coat",
            attack: 0, nova: 0, dodge: 0, potion: 0, invulnerable: 0,
            rolling: 0, rollX: 0, rollY: -1, vx: 0, vy: 0
        }
    };
}

export const weaponDamage = state => Math.round((state.player.damage + state.mastery.might * 2 + state.player.weaponBonus + state.upgrades.weapon * 6) * (1 + state.upgrades.weapon * 0.08) * (1 + state.boons.edge * 0.05) * (state.buffs.fury > 0 ? 1.5 : 1));
export const armorRating = state => Math.min(65, classFor(state).armor + state.player.armorBonus + state.upgrades.armor * 5 + state.boons.bulwark * 2.5);
export const movementSpeed = state => classFor(state).speed * (state.buffs.haste > 0 ? 1.35 : 1) * (1 + state.boons.stride * 0.04 + state.mastery.speed * 0.01);
export const criticalChance = state => Math.min(0.75, 0.05 + state.boons.critChance * 0.02 + state.upgrades.critChance * 0.02 + state.mastery.critChance * 0.005);
export const criticalDamage = state => 1.5 + state.boons.critDamage * 0.1 + state.upgrades.critDamage * 0.1 + state.mastery.critDamage * 0.02;
export const skillReach = (state, skill) => Math.min(Math.hypot(WIDTH, HEIGHT), (skill === "attack"
    ? classFor(state).attackReach + state.upgrades.cleave * 6 + state.boons.cleave * 6
    : classFor(state).specialReach + state.upgrades.nova * 10 + state.boons.nova * 10) * (1 + state.mastery.area * 0.01));
const goldReward = (value, fortune = 0) => Math.round(value * 1.1 * (1 + fortune * 0.08));
export const upgradeCost = (state, key) => UPGRADES[key] ? Math.round(UPGRADES[key].base * (1 + state.upgrades[key] * 0.7 + state.upgrades[key] ** 2 * 0.12)) : Infinity;
export const forgeComplete = state => Object.entries(UPGRADES).every(([key, value]) => state.upgrades[key] >= value.max);
export const masteryCost = (state, key) => {
    if (!Object.hasOwn(MASTERY, key)) return Infinity;
    const cost = 1000 + state.mastery[key] * 100;
    return Number.isSafeInteger(cost) ? cost : Infinity;
};
export const flaskHealing = state => Math.max(30, Math.round(state.player.maxHealth * (0.22 + state.upgrades.flask * 0.06))) * difficultyFor(state).healing;

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

export function buyUpgrade(state, key) {
    const upgrade = UPGRADES[key];
    if (!upgrade || !["paused", "camp", "won"].includes(state.status) || state.upgrades[key] >= upgrade.max) return false;
    const cost = upgradeCost(state, key);
    if (state.gold < cost) return false;
    state.gold -= cost;
    grantUpgrade(state, key);
    return true;
}

function grantUpgrade(state, key) {
    const upgrade = UPGRADES[key];
    if (state.upgrades[key] >= upgrade.max) { state.gold += goldReward(50); return; }
    state.upgrades[key]++;
    if (key === "armor") { state.player.maxHealth += 12; state.player.health = Math.min(state.player.maxHealth, state.player.health + 12); }
    if (key === "flask") state.player.potions = MAX_FLASKS;
    state.journal = `${upgrade.name} forged to rank ${state.upgrades[key]}. ${upgrade.detail}.`;
}

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

export function continueJourney(state) {
    if (state.status === "camp") {
        state.status = "playing";
        spawnWave(state);
        state.intermission = 3.5;
        return true;
    }
    return false;
}

export function enterEndless(state, difficulty = state.difficulty) {
    if (state.status !== "won" || state.campaignComplete !== 1 || !Object.hasOwn(DIFFICULTIES, difficulty)) return false;
    state.rankingMode = state.rankingMode === "legacy" ? "legacy" : "ascended";
    state.scoreBaseline = state.kills;
    state.difficulty = difficulty;
    state.mode = "endless";
    state.status = "playing";
    spawnWave(state);
    state.intermission = 3.5;
    state.journal = "You return to the gate by choice. The Endless Watch begins. Your equipment and gold remain yours.";
    return true;
}

export function startRun(random = Math.random, difficulty = "hard", heroClass = "knight") {
    if (!Object.hasOwn(DIFFICULTIES, difficulty)) throw new Error("Unknown difficulty.");
    if (!Object.hasOwn(HERO_CLASSES, heroClass)) throw new Error("Unknown class.");
    const state = createState(random);
    const hero = HERO_CLASSES[heroClass];
    state.heroClass = heroClass;
    Object.assign(state.player, { health: hero.health, maxHealth: hero.health, damage: hero.damage, weapon: hero.weapon });
    state.difficulty = difficulty;
    state.status = "playing";
    state.journal = `${hero.name}: ${hero.description}`;
    return state;
}

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

export function togglePause(state) {
    if (state.status === "playing") state.status = "paused";
    else if (state.status === "paused") state.status = "playing";
}

function effect(state, kind, x, y, color, text = "", radius = 0, angle = 0) {
    const life = kind === "text" ? 0.9 : 0.35;
    state.effects.push({ kind, x, y, color, text, radius, angle, life, maxLife: life });
    if (state.effects.length > 256) state.effects.shift();
}

function hurtPlayer(state, damage) {
    const player = state.player;
    if (player.invulnerable > 0 || state.status !== "playing") return;
    damage = Math.max(1, Math.round(damage * (1 - armorRating(state) / 100) * (state.buffs.ward > 0 ? 0.5 : 1)));
    player.health = Math.max(0, player.health - damage);
    player.invulnerable = 0.3;
    effect(state, "text", player.x, player.y - 35, "#ff9384", `-${damage}`);
    if (player.health === 0) {
        state.status = "dead";
        state.journal = "The ember fades. Every new run is another chance.";
    }
}

function gainExperience(state, amount) {
    const player = state.player;
    player.xp += Math.round(amount * 1.1);
    while (player.xp >= player.nextLevel) {
        player.xp -= player.nextLevel;
        player.level++;
        state.pendingChoices++;
        player.nextLevel = Math.min(25000, Math.round(player.nextLevel * 1.35));
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
    if (state.random() < 0.07 || enemy.kind === "boss") {
        state.loot.push({ kind: "flask", x: enemy.x + 10, y: enemy.y + 18, value: 1, life: 30 });
    }
    if ((enemy.kind === "boss" && state.random() < 0.3) || (enemy.elite && state.random() < 0.04)) {
        const keys = Object.keys(UPGRADES);
        const available = keys.filter(key => state.upgrades[key] < UPGRADES[key].max);
        const key = available[Math.floor(state.random() * available.length)];
        state.loot.push({ kind: key ? "upgrade" : "gold", x: enemy.x - 20, y: enemy.y - 10, value: key ? keys.indexOf(key) : 50, life: 30 });
    }
    effect(state, "burst", enemy.x, enemy.y, enemy.kind === "boss" ? "#edac60" : "#ac796d", "", enemy.radius * 2);
    if (state.loot.length > 64) {
        const overflow = state.loot.splice(0, state.loot.length - 64);
        for (const drop of overflow) state.gold += drop.kind === "gold" ? goldReward(drop.value, state.boons.fortune) : goldReward(10);
    }
}

function hitEnemy(state, enemy, damage, piercing = false) {
    if (enemy.health <= 0) return;
    const critical = state.random() < criticalChance(state);
    if (critical) damage = Math.round(damage * criticalDamage(state));
    if (enemy.kind === "sentinel" && !piercing) damage = Math.round(damage * 0.55);
    enemy.health -= damage;
    enemy.flash = 0.15;
    effect(state, "text", enemy.x, enemy.y - enemy.radius - 10, critical ? "#ffd16a" : "#eee0ba", critical ? `CRIT ${damage}` : `${damage}`);
    if (enemy.health <= 0) killEnemy(state, enemy);
}

export function useSkill(state, skill) {
    if (state.status !== "playing") return false;
    const p = state.player;
    const hero = classFor(state);
    if (!["attack", "nova", "dodge", "potion"].includes(skill) || p[skill] > 0) return false;
    if (skill === "attack") {
        p.swing = 0.26;
        p.attack = hero.attackCooldown / (1 + state.upgrades.cleave * 0.12);
        const reach = skillReach(state, "attack");
        if (state.heroClass === "ranger") {
            firePlayerArrows(state, [0], Math.round(weaponDamage(state) * (1 + state.upgrades.cleave * 0.08)), reach, 0);
            return true;
        }
        effect(state, "slash", p.x, p.y, "#e9d3a0", "", reach, p.facing);
        for (const enemy of state.enemies) {
            const angle = Math.atan2(enemy.y - p.y, enemy.x - p.x) - p.facing;
            if (distance(p, enemy) < reach + enemy.radius && Math.cos(angle) > 0.2 - state.upgrades.cleave * 0.04) {
                hitEnemy(state, enemy, Math.round(weaponDamage(state) * (1 + state.upgrades.cleave * 0.08)));
            }
        }
    } else if (skill === "nova") {
        p.casting = 0.4;
        p.nova = hero.specialCooldown / (1 + state.upgrades.nova * 0.12);
        const reach = skillReach(state, "nova");
        if (state.heroClass === "ranger") {
            firePlayerArrows(state, [-0.36, -0.18, 0, 0.18, 0.36], Math.round(weaponDamage(state) * (hero.specialDamage + state.upgrades.nova * 0.1)), reach, 1);
            return true;
        }
        effect(state, "ring", p.x, p.y, hero.color, "", reach);
        for (const enemy of state.enemies) {
            if (distance(p, enemy) < reach + enemy.radius) {
                hitEnemy(state, enemy, Math.round(weaponDamage(state) * (hero.specialDamage + state.upgrades.nova * 0.25)), true);
            }
        }
    } else if (skill === "dodge") {
        p.dodge = hero.dodgeCooldown / (1 + state.upgrades.dodge * 0.15);
        p.rolling = 0.23;
        p.invulnerable = Math.max(p.invulnerable, 0.32 + state.upgrades.dodge * 0.025);
        p.rollX = Math.cos(p.facing);
        p.rollY = Math.sin(p.facing);
    } else {
        if (p.potions <= 0 || p.health >= p.maxHealth) return false;
        p.potion = 0.7;
        p.potions--;
        p.health = Math.min(p.maxHealth, p.health + flaskHealing(state));
        effect(state, "ring", p.x, p.y, "#8fca96", "", 50);
        state.journal = "A moment of warmth. Refill flasks at checkpoints or the forge, not on level-up.";
    }
    return true;
}

function firePlayerArrows(state, offsets, damage, reach, piercing) {
    const p = state.player;
    for (const offset of offsets) {
        if (state.playerShots.length >= 48) break;
        const angle = p.facing + offset;
        state.playerShots.push({ x: p.x, y: p.y, vx: Math.cos(angle) * 780, vy: Math.sin(angle) * 780, damage, life: reach / 780, piercing });
    }
}

function stepPlayerShots(state, dt) {
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
            shot.life = 0;
            hitEnemy(state, enemy, shot.damage, shot.piercing === 1);
        }
        if (shot.x < 0 || shot.x > WIDTH || shot.y < 0 || shot.y > HEIGHT) shot.life = 0;
    }
    state.playerShots = state.playerShots.filter(shot => shot.life > 0);
}

function spawnWave(state) {
    state.wave++;
    const act = mapIndexForWave(state.wave);
    const map = mapForWave(state.wave);
    const localWave = (state.wave - 1) % WAVES_PER_MAP + 1;
    const bossWave = localWave === WAVES_PER_MAP;
    if (localWave === 1 && state.wave > 1) {
        for (const drop of state.loot) { drop.x = state.player.x; drop.y = state.player.y; }
        collectLoot(state, 0);
        state.projectiles = [];
        state.playerShots = [];
        state.effects = [];
        Object.assign(state.player, { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, health: state.player.maxHealth, potions: MAX_FLASKS, invulnerable: 1 });
    }
    const depth = Math.max(0, state.wave - LAST_WAVE);
    const difficulty = difficultyFor(state);
    const scaling = 1 + Math.log2(1 + depth / 5) * 0.9 + act * 0.15;
    const count = Math.min(40, (bossWave ? 10 + act * 3 : 5 + localWave * 3 + act * 3) + Math.floor(depth / 4) + difficulty.extra);
    for (let i = 0; i < count; i++) {
        const boss = bossWave && i === 0;
        const kind = boss ? "boss" : enemyKindForWave(state.wave, i);
        const side = Math.floor(state.random() * 4);
        const t = 0.08 + state.random() * 0.84;
        const x = side === 0 ? MARGIN : side === 1 ? WIDTH - MARGIN : WIDTH * t;
        const y = side === 2 ? MARGIN : side === 3 ? HEIGHT - MARGIN : HEIGHT * t;
        const elite = !boss && state.wave >= 6 && i % (depth ? 3 : 5) === 0 ? 1 : 0;
        const health = Math.round((boss ? 680 + act * 650 : (kind === "brute" || kind === "sentinel" ? 75 : kind === "runner" ? 20 : 32) + Math.min(state.wave, LAST_WAVE) * 10) * scaling * (elite ? 1.7 : 1));
        state.enemies.push({
            kind, x, y, health, maxHealth: health, elite, charging: 0, chargeX: 0, chargeY: 0,
            radius: boss ? 32 : kind === "brute" || kind === "sentinel" ? 22 : kind === "runner" ? 12 : 15,
            speed: boss ? 70 + act * 8 : kind === "runner" ? 160 + act * 10 : kind === "sentinel" ? 55 : kind === "brute" ? 62 : ["wisp", "spitter", "summoner", "cantor", "hexer"].includes(kind) ? 80 : 92 + Math.min(state.wave, LAST_WAVE) * 2.2,
            damage: Math.round((boss ? 30 + act * 12 : kind === "sentinel" ? 36 : kind === "brute" ? 22 + act * 5 : 13 + Math.min(state.wave, LAST_WAVE) * 1.5) * Math.sqrt(scaling) * (elite ? 1.4 : 1)),
            cooldown: 1.2, flash: 0, slam: 4, winding: 0
        });
        const spawned = state.enemies[state.enemies.length - 1];
        spawned.health = spawned.maxHealth = Math.round(spawned.maxHealth * difficulty.health);
        spawned.damage = Math.round(spawned.damage * difficulty.damage);
        spawned.speed *= difficulty.speed;
    }
    state.journal = bossWave ? `${map.boss} awakens. Escape the slam${act ? " and its projectile volley" : ""}!`
        : localWave === 1 && act > 0 ? `${map.name}. Vitality and flasks restored. ${map.description}`
        : state.wave === 3 ? "Ash runners join the hunt. Fast but fragile: cleave before they surround you."
        : `Wave ${state.wave}. ${count} enemies emerge in ${map.name}.`;
}

function fireVolley(state, enemy, angle, offsets, speed) {
    for (const offset of offsets) {
        if (state.projectiles.length >= 48) break;
        state.projectiles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle + offset) * speed, vy: Math.sin(angle + offset) * speed, life: 3, damage: enemy.damage });
    }
}

function collectLoot(state, dt) {
    const p = state.player;
    for (const drop of state.loot) {
        drop.life -= dt;
        const d = distance(p, drop);
        if (d < (state.buffs.magnet > 0 ? 270 : 95) + state.boons.harvest * 16 && d > 1) {
            const travel = Math.min(d, 230 * dt);
            drop.x += (p.x - drop.x) / d * travel;
            drop.y += (p.y - drop.y) / d * travel;
        }
        if (distance(p, drop) > 28) continue;
        drop.life = 0;
        if (drop.kind === "gold") state.gold += goldReward(drop.value, state.boons.fortune);
        else if (drop.kind === "flask") {
            const full = p.potions >= MAX_FLASKS;
            if (full) p.health = Math.min(p.maxHealth, p.health + flaskHealing(state));
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
                state.journal = `${p.armor} equipped. ${drop.value} base armor. Forge bonuses are retained.`;
                effect(state, "text", p.x, p.y - 45, "#b5b9f2", "ARMOR UPGRADED");
            } else state.gold += goldReward(10);
        } else if (drop.value > p.weaponBonus) {
            p.weaponBonus = drop.value;
            p.weapon = `${drop.value >= 54 ? "Cinder crown" : drop.value >= 33 ? "Mireglass" : drop.value >= 18 ? "Ashen sovereign" : drop.value >= 9 ? "Emberforged" : "Tempered hollow"} ${classFor(state).weaponType}`;
            state.journal = `${p.weapon} equipped. +${drop.value} weapon damage.`;
            effect(state, "text", p.x, p.y - 45, "#a8d5cf", "WEAPON UPGRADED");
        } else state.gold += goldReward(10);
    }
    state.loot = state.loot.filter(drop => drop.life > 0);
}

function finishCheckpoint(state) {
    const p = state.player;
    for (const drop of state.loot) { drop.x = p.x; drop.y = p.y; }
    collectLoot(state, 0);
    state.projectiles = [];
    state.playerShots = [];
    p.health = p.maxHealth;
    p.potions = MAX_FLASKS;
    state.status = state.mode === "campaign" && state.wave === LAST_WAVE ? "won" : "camp";
    if (state.status === "won") state.campaignComplete = 1;
    state.journal = state.mode === "endless" ? "Another watch completed. Rest, gather your strength, and carry the dawn onward. Your checkpoint is ready to save." : mapForWave(state.wave).ending;
}

export function step(state, input, elapsed) {
    if (state.status !== "playing" || !Number.isFinite(elapsed) || elapsed <= 0) return;
    const dt = Math.min(elapsed, 0.05);
    state.time = (state.time + dt) % 3600;
    const p = state.player;
    p.swing = Math.max(0, (p.swing ?? 0) - dt);
    p.casting = Math.max(0, (p.casting ?? 0) - dt);
    for (const power of POWER_UPS) state.buffs[power.key] = Math.max(0, state.buffs[power.key] - dt);
    for (const key of ["attack", "nova", "dodge", "potion", "invulnerable", "rolling"]) {
        const recovery = ["attack", "nova", "dodge", "potion"].includes(key)
            ? (state.buffs.haste > 0 ? 1.4 : 1) * (1 + state.boons.focus * 0.05 + state.mastery.recovery * 0.005) : 1;
        p[key] = Math.max(0, p[key] - dt * recovery);
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
    if (input.attack) useSkill(state, "attack");
    if (input.nova) useSkill(state, "nova");
    if (input.dodge) useSkill(state, "dodge");
    if (input.potion) useSkill(state, "potion");
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
        && map.hazards.some(seal => distance(p, seal) < seal.radius + p.radius)) hurtPlayer(state, 12 + mapIndexForWave(state.wave) * 4);

    stepPlayerShots(state, dt);
    if (state.status !== "playing") return;
    for (const enemy of state.enemies) {
        if (state.status !== "playing") break;
        if (enemy.health <= 0) continue;
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
                if (distanceToSegment(p, start, enemy) < enemy.radius + p.radius) hurtPlayer(state, enemy.damage * 1.5);
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
                if (distance(p, enemy) < enemy.radius + p.radius + 8) hurtPlayer(state, enemy.damage * 2);
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
                    if (d < 110 + p.radius) hurtPlayer(state, enemy.damage * 2);
                    enemy.health = 0;
                    if (state.status === "playing") killEnemy(state, enemy);
                }
                continue;
            }
            if (d < 95) { enemy.winding = 1.1; continue; }
        }
        if (enemy.kind === "boss") {
            if (enemy.winding > 0) {
                enemy.winding = Math.max(0, enemy.winding - dt);
                if (enemy.winding === 0) {
                    effect(state, "ring", enemy.x, enemy.y, "#ff775c", "", 135);
                    if (d < 135 + p.radius) hurtPlayer(state, Math.round(enemy.damage * 1.5));
                    const act = mapIndexForWave(state.wave);
                    if (act > 0) fireVolley(state, enemy, Math.atan2(ey, ex), act === 1 ? [-0.4, 0, 0.4] : [-0.8, -0.4, 0, 0.4, 0.8], 170);
                    enemy.slam = 4.5;
                }
            } else {
                enemy.slam -= dt;
                if (enemy.slam <= 0) enemy.winding = 1.1;
            }
        }
        const ranged = ["wisp", "spitter", "summoner", "cantor", "hexer"].includes(enemy.kind);
        const stoppingDistance = ranged ? 230 : enemy.radius + p.radius + 2;
        if (d > stoppingDistance && enemy.winding <= 0) {
            const movement = Math.min(enemy.speed * dt, d - stoppingDistance);
            enemy.moving = true;
            enemy.stridePhase = (enemy.stridePhase ?? 0) + movement * 0.1;
            enemy.x += ex * movement;
            enemy.y += ey * movement;
        }
        if (enemy.cooldown <= 0 && enemy.winding <= 0) {
            if (enemy.kind === "summoner") {
                if (state.enemies.length < 32) {
                    const health = Math.round(enemy.maxHealth * 0.35);
                    state.enemies.push({ ...enemy, kind: "husk", elite: 0, x: clamp(enemy.x + 24, MARGIN, WIDTH - MARGIN), health, maxHealth: health, radius: 14, speed: 100, cooldown: 1.5 });
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
                fireVolley(state, enemy, Math.atan2(ey, ex), enemy.kind === "spitter" ? [-0.25, 0, 0.25] : [0], 190);
                enemy.cooldown = enemy.kind === "spitter" ? 2.6 : 2;
                enemy.swing = 0.3;
            } else if (d < enemy.radius + p.radius + 10) {
                hurtPlayer(state, enemy.damage);
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
            hurtPlayer(state, bolt.damage);
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

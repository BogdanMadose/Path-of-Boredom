import { LAST_WAVE, WAVES_PER_MAP, UPGRADES, POWER_UPS, mapForWave, mapIndexForWave, enemyKindForWave, firePhase } from "./arpg-campaign.js";
export { LAST_WAVE } from "./arpg-campaign.js";
import { LEVEL_CARDS, drawLevelCards } from "./arpg-cards.js";
export const WIDTH = 1100;
export const HEIGHT = 650;
const MARGIN = 42;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function createState(random = Math.random) {
    return {
        random, status: "ready", time: 0, wave: 0, intermission: 0.8,
        mode: "campaign", campaignComplete: 0,
        upgrades: Object.fromEntries(Object.keys(UPGRADES).map(key => [key, 0])),
        buffs: Object.fromEntries(POWER_UPS.map(power => [power.key, 0])),
        boons: Object.fromEntries(Object.keys(LEVEL_CARDS).map(key => [key, 0])),
        pendingChoices: 0, cardChoices: [],
        kills: 0, gold: 0, enemies: [], projectiles: [], loot: [], effects: [],
        journal: "A faint warmth lingers beneath the ashes.",
        player: {
            x: WIDTH / 2, y: HEIGHT / 2, radius: 16, facing: -Math.PI / 2,
            health: 100, maxHealth: 100, level: 1, xp: 0, nextLevel: 40,
            damage: 18, weaponBonus: 0, weapon: "Worn iron blade", potions: 3,
            armorBonus: 0, armor: "Traveler's coat",
            attack: 0, nova: 0, dodge: 0, potion: 0, invulnerable: 0,
            rolling: 0, rollX: 0, rollY: -1, vx: 0, vy: 0
        }
    };
}

export const weaponDamage = state => Math.round((state.player.damage + state.player.weaponBonus + state.upgrades.weapon * 6) * (1 + state.upgrades.weapon * 0.08) * (1 + state.boons.edge * 0.06) * (state.buffs.fury > 0 ? 1.5 : 1));
export const armorRating = state => Math.min(65, state.player.armorBonus + state.upgrades.armor * 5 + state.boons.bulwark * 3);
export const upgradeCost = (state, key) => UPGRADES[key] ? Math.round(UPGRADES[key].base * (1 + state.upgrades[key] * 0.7 + state.upgrades[key] ** 2 * 0.12)) : Infinity;

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
    if (state.upgrades[key] >= upgrade.max) { state.gold += 50; return; }
    state.upgrades[key]++;
    if (key === "armor") { state.player.maxHealth += 12; state.player.health = Math.min(state.player.maxHealth, state.player.health + 12); }
    if (key === "flask") state.player.potions = 3;
    state.journal = `${upgrade.name} forged to rank ${state.upgrades[key]}. ${upgrade.detail}.`;
}

export function chooseLevelCard(state, key) {
    if (state.status !== "choosing" || state.pendingChoices <= 0 || !state.cardChoices.includes(key)) return false;
    const card = LEVEL_CARDS[key];
    if (!card || state.boons[key] >= card.max) return false;
    state.boons[key]++;
    if (key === "vitality") {
        state.player.maxHealth += 20;
        state.player.health = Math.min(state.player.maxHealth, state.player.health + 20);
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

export function enterEndless(state) {
    if (state.status !== "won" || state.campaignComplete !== 1) return false;
    state.mode = "endless";
    state.status = "playing";
    spawnWave(state);
    state.intermission = 3.5;
    state.journal = "You return to the gate by choice. The Endless Watch begins. Your equipment and gold remain yours.";
    return true;
}

export function startRun(random = Math.random) {
    const state = createState(random);
    state.status = "playing";
    state.journal = "Keep moving. Your ember nova can turn a surrounding horde to ash.";
    return state;
}

export function startEndlessRun(random = Math.random) {
    const state = startRun(random);
    state.mode = "endless";
    state.campaignComplete = 1;
    state.wave = LAST_WAVE;
    state.gold = 350;
    Object.assign(state.upgrades, { weapon: 4, armor: 3, cleave: 2, nova: 2, dodge: 2, flask: 1 });
    Object.assign(state.player, { level: 12, maxHealth: 301, health: 301, damage: 62, nextLevel: 700, weaponBonus: 72, weapon: "Watchkeeper's blade", armorBonus: 20, armor: "Watchkeeper's mail" });
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
    player.invulnerable = 0.4;
    effect(state, "text", player.x, player.y - 35, "#ff9384", `-${damage}`);
    if (player.health === 0) {
        state.status = "dead";
        state.journal = "The ember fades. Every new run is another chance.";
    }
}

function gainExperience(state, amount) {
    const player = state.player;
    player.xp += amount;
    while (player.xp >= player.nextLevel) {
        player.xp -= player.nextLevel;
        player.level++;
        state.pendingChoices++;
        player.nextLevel = Math.min(5000, Math.round(player.nextLevel * 1.3));
        player.maxHealth += 8;
        player.health = Math.min(player.maxHealth, player.health + 15);
        player.damage += 3;
        player.potions = Math.min(3, player.potions + 1);
        effect(state, "ring", player.x, player.y, "#f2d390", "", 100);
        effect(state, "text", player.x, player.y - 60, "#f2d390", `LEVEL ${player.level}`);
        state.journal = `Level ${player.level}. Choose a lasting boon. +3 damage, +8 max vitality, some healing, and a flask charge also gained.`;
    }
    if (state.pendingChoices > 0) {
        if (!state.cardChoices.length) state.cardChoices = drawLevelCards(state);
        state.status = "choosing";
    }
}

function killEnemy(state, enemy) {
    state.kills++;
    state.player.health = Math.min(state.player.maxHealth, state.player.health + state.boons.siphon * 0.35);
    const act = mapIndexForWave(state.wave);
    gainExperience(state, (enemy.kind === "boss" ? 100 + act * 50 : 14 + act * 6) * (enemy.elite ? 2 : 1));
    state.loot.push({ kind: "gold", x: enemy.x, y: enemy.y, value: Math.min(300, 4 + state.wave * 2) * (enemy.elite ? 2 : 1), life: 30 });
    if (state.kills % 5 === 0 || enemy.kind === "boss") {
        const tier = Math.min(200, Math.floor(state.kills / 5));
        state.loot.push({ kind: "weapon", x: enemy.x + 15, y: enemy.y + 8, value: tier * 3, life: 30 });
    } else if (state.kills % 7 === 0) {
        state.loot.push({ kind: "armor", x: enemy.x - 12, y: enemy.y, value: Math.min(40, 2 + Math.floor(state.wave * 1.2)), life: 30 });
    } else if (state.random() < 0.23) {
        state.loot.push({ kind: "health", x: enemy.x - 12, y: enemy.y, value: 22, life: 30 });
    }
    if (state.kills % 6 === 0) {
        state.loot.push({ kind: "power", x: enemy.x + 20, y: enemy.y - 10, value: Math.floor(state.random() * POWER_UPS.length), life: 30 });
    }
    if (enemy.kind === "boss" || state.kills % 13 === 0 || (enemy.elite && state.random() < 0.35)) {
        const keys = Object.keys(UPGRADES);
        const available = keys.filter(key => state.upgrades[key] < UPGRADES[key].max);
        const key = available[Math.floor(state.random() * available.length)];
        state.loot.push({ kind: key ? "upgrade" : "gold", x: enemy.x - 20, y: enemy.y - 10, value: key ? keys.indexOf(key) : 50, life: 30 });
    }
    effect(state, "burst", enemy.x, enemy.y, enemy.kind === "boss" ? "#edac60" : "#ac796d", "", enemy.radius * 2);
    if (state.loot.length > 64) {
        const overflow = state.loot.splice(0, state.loot.length - 64);
        for (const drop of overflow) state.gold += drop.kind === "gold" ? Math.round(drop.value * (1 + state.boons.fortune * 0.1)) : 10;
    }
}

function hitEnemy(state, enemy, damage, piercing = false) {
    if (enemy.health <= 0) return;
    if (enemy.kind === "sentinel" && !piercing) damage = Math.round(damage * 0.55);
    enemy.health -= damage;
    enemy.flash = 0.15;
    effect(state, "text", enemy.x, enemy.y - enemy.radius - 10, "#eee0ba", `${damage}`);
    if (enemy.health <= 0) killEnemy(state, enemy);
}

export function useSkill(state, skill) {
    if (state.status !== "playing") return false;
    const p = state.player;
    if (!["attack", "nova", "dodge", "potion"].includes(skill) || p[skill] > 0) return false;
    if (skill === "attack") {
        p.attack = 0.38 / (1 + state.upgrades.cleave * 0.12);
        const reach = 100 + state.upgrades.cleave * 6 + state.boons.cleave * 8;
        effect(state, "slash", p.x, p.y, "#e9d3a0", "", reach, p.facing);
        for (const enemy of state.enemies) {
            const angle = Math.atan2(enemy.y - p.y, enemy.x - p.x) - p.facing;
            if (distance(p, enemy) < reach + enemy.radius && Math.cos(angle) > 0.2 - state.upgrades.cleave * 0.04) {
                hitEnemy(state, enemy, Math.round(weaponDamage(state) * (1 + state.upgrades.cleave * 0.08)));
            }
        }
    } else if (skill === "nova") {
        p.nova = 5 / (1 + state.upgrades.nova * 0.12);
        const reach = 190 + state.upgrades.nova * 10 + state.boons.nova * 12;
        effect(state, "ring", p.x, p.y, "#f29c55", "", reach);
        for (const enemy of state.enemies) {
            if (distance(p, enemy) < reach + enemy.radius) {
                hitEnemy(state, enemy, Math.round(weaponDamage(state) * (2.2 + state.upgrades.nova * 0.25)), true);
            }
        }
    } else if (skill === "dodge") {
        p.dodge = 1.8 / (1 + state.upgrades.dodge * 0.15);
        p.rolling = 0.23;
        p.invulnerable = Math.max(p.invulnerable, 0.32 + state.upgrades.dodge * 0.025);
        p.rollX = Math.cos(p.facing);
        p.rollY = Math.sin(p.facing);
    } else {
        if (p.potions <= 0 || p.health >= p.maxHealth) return false;
        p.potion = 0.7;
        p.potions--;
        p.health = Math.min(p.maxHealth, p.health + Math.max(30, Math.round(p.maxHealth * (0.22 + state.upgrades.flask * 0.06))));
        effect(state, "ring", p.x, p.y, "#8fca96", "", 50);
        state.journal = "A moment of warmth. Flask charges return when you level up.";
    }
    return true;
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
        state.effects = [];
        Object.assign(state.player, { x: WIDTH / 2, y: HEIGHT / 2, health: state.player.maxHealth, potions: 3, invulnerable: 1 });
    }
    const depth = Math.max(0, state.wave - LAST_WAVE);
    const scaling = 1 + Math.log2(1 + depth / 5) * 0.7;
    const count = Math.min(36, (bossWave ? 10 + act * 3 : 5 + localWave * 3 + act * 3) + Math.floor(depth / 4));
    for (let i = 0; i < count; i++) {
        const boss = bossWave && i === 0;
        const kind = boss ? "boss" : enemyKindForWave(state.wave, i);
        const side = Math.floor(state.random() * 4);
        const t = 0.08 + state.random() * 0.84;
        const x = side === 0 ? MARGIN : side === 1 ? WIDTH - MARGIN : WIDTH * t;
        const y = side === 2 ? MARGIN : side === 3 ? HEIGHT - MARGIN : HEIGHT * t;
        const elite = !boss && state.wave >= 12 && i % (depth ? 3 : 5) === 0 ? 1 : 0;
        const health = Math.round((boss ? 680 + act * 650 : (kind === "brute" || kind === "sentinel" ? 75 : kind === "runner" ? 20 : 32) + Math.min(state.wave, LAST_WAVE) * 10) * scaling * (elite ? 1.7 : 1));
        state.enemies.push({
            kind, x, y, health, maxHealth: health, elite, charging: 0, chargeX: 0, chargeY: 0,
            radius: boss ? 32 : kind === "brute" || kind === "sentinel" ? 22 : kind === "runner" ? 12 : 15,
            speed: boss ? 70 + act * 8 : kind === "runner" ? 160 + act * 10 : kind === "sentinel" ? 55 : kind === "brute" ? 62 : ["wisp", "spitter", "summoner", "cantor", "hexer"].includes(kind) ? 80 : 92 + Math.min(state.wave, LAST_WAVE) * 2.2,
            damage: Math.round((boss ? 30 + act * 12 : kind === "sentinel" ? 36 : kind === "brute" ? 22 + act * 5 : 13 + Math.min(state.wave, LAST_WAVE) * 1.5) * Math.sqrt(scaling) * (elite ? 1.4 : 1)),
            cooldown: 1.2, flash: 0, slam: 4, winding: 0
        });
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
        if (d < (state.buffs.magnet > 0 ? 270 : 95) + state.boons.harvest * 20 && d > 1) {
            const travel = Math.min(d, 230 * dt);
            drop.x += (p.x - drop.x) / d * travel;
            drop.y += (p.y - drop.y) / d * travel;
        }
        if (distance(p, drop) > 28) continue;
        drop.life = 0;
        if (drop.kind === "gold") state.gold += Math.round(drop.value * (1 + state.boons.fortune * 0.1));
        else if (drop.kind === "health") p.health = Math.min(p.maxHealth, p.health + drop.value);
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
            } else state.gold += 10;
        } else if (drop.value > p.weaponBonus) {
            p.weaponBonus = drop.value;
            p.weapon = drop.value >= 54 ? "Cinder crown greatblade" : drop.value >= 33 ? "Mireglass reaver" : drop.value >= 18 ? "Ashen sovereign blade" : drop.value >= 9 ? "Emberforged edge" : "Tempered hollow blade";
            state.journal = `${p.weapon} equipped. +${drop.value} weapon damage.`;
            effect(state, "text", p.x, p.y - 45, "#a8d5cf", "WEAPON UPGRADED");
        } else state.gold += 10;
    }
    state.loot = state.loot.filter(drop => drop.life > 0);
}

function finishCheckpoint(state) {
    const p = state.player;
    for (const drop of state.loot) { drop.x = p.x; drop.y = p.y; }
    collectLoot(state, 0);
    state.projectiles = [];
    p.health = p.maxHealth;
    p.potions = 3;
    state.status = state.mode === "campaign" && state.wave === LAST_WAVE ? "won" : "camp";
    if (state.status === "won") state.campaignComplete = 1;
    state.journal = state.mode === "endless" ? "Another watch completed. Rest, gather your strength, and carry the dawn onward. Your checkpoint is ready to save." : mapForWave(state.wave).ending;
}

export function step(state, input, elapsed) {
    if (state.status !== "playing" || !Number.isFinite(elapsed) || elapsed <= 0) return;
    const dt = Math.min(elapsed, 0.05);
    state.time = (state.time + dt) % 3600;
    const p = state.player;
    for (const power of POWER_UPS) state.buffs[power.key] = Math.max(0, state.buffs[power.key] - dt);
    for (const key of ["attack", "nova", "dodge", "potion", "invulnerable", "rolling"]) {
        const recovery = ["attack", "nova", "dodge", "potion"].includes(key)
            ? (state.buffs.haste > 0 ? 1.4 : 1) * (1 + state.boons.focus * 0.06) : 1;
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
    const speed = (slowed ? 135 : 220) * (state.buffs.haste > 0 ? 1.35 : 1) * (1 + state.boons.stride * 0.05);
    const targetVx = rolling ? p.rollX * 690 : dx * speed;
    const targetVy = rolling ? p.rollY * 690 : dy * speed;
    const smoothing = rolling ? 1 : 1 - Math.exp(-dt * 13);
    p.vx += (targetVx - p.vx) * smoothing;
    p.vy += (targetVy - p.vy) * smoothing;
    p.x = clamp(p.x + p.vx * dt, MARGIN, WIDTH - MARGIN);
    p.y = clamp(p.y + p.vy * dt, MARGIN, HEIGHT - MARGIN);
    if (state.enemies.some(enemy => enemy.health > 0) && ["fire", "storm", "void"].includes(map.hazard) && firePhase(state.time) >= 4
        && map.hazards.some(seal => distance(p, seal) < seal.radius + p.radius)) hurtPlayer(state, 12 + mapIndexForWave(state.wave) * 4);

    for (const enemy of state.enemies) {
        if (state.status !== "playing") break;
        if (enemy.health <= 0) continue;
        enemy.cooldown = Math.max(-5, enemy.cooldown - dt);
        enemy.flash = Math.max(0, enemy.flash - dt);
        const d = distance(p, enemy);
        const ex = (p.x - enemy.x) / (d || 1);
        const ey = (p.y - enemy.y) / (d || 1);
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
            } else if (enemy.kind === "cantor") {
                for (const ally of state.enemies) {
                    if (ally.health > 0 && distance(enemy, ally) < 180) ally.health = Math.min(ally.maxHealth, ally.health + Math.ceil(ally.maxHealth * 0.06));
                }
                effect(state, "ring", enemy.x, enemy.y, "#aeedbf", "", 180);
                enemy.cooldown = 3;
            } else if (enemy.kind === "hexer") {
                fireVolley(state, enemy, state.time, Array.from({ length: 8 }, (_, i) => i * Math.PI / 4), 155);
                enemy.cooldown = 3.2;
            } else if (ranged && d < 430) {
                fireVolley(state, enemy, Math.atan2(ey, ex), enemy.kind === "spitter" ? [-0.25, 0, 0.25] : [0], 190);
                enemy.cooldown = enemy.kind === "spitter" ? 2.6 : 2;
            } else if (d < enemy.radius + p.radius + 10) {
                hurtPlayer(state, enemy.damage);
                enemy.cooldown = 1;
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

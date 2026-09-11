import { WIDTH, HEIGHT, createState, startRun, startEndlessRun, step, togglePause, useSkill, weaponDamage, armorRating, upgradeCost, buyUpgrade, continueJourney, enterEndless, chooseLevelCard } from "./arpg-engine.js";
import { captureSnapshot, restoreSnapshot } from "./arpg-save.js";
import { MAPS, LAST_WAVE, UPGRADES, POWER_UPS, threatForWave, mapForWave, mapIndexForWave, firePhase } from "./arpg-campaign.js";
import { LEVEL_CARDS } from "./arpg-cards.js";

const BEST_KEY = "path-of-boredom.best.v1";
const movementKeys = { KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right" };
const skillKeys = { KeyJ: "attack", KeyQ: "nova", Space: "dodge", KeyE: "potion" };

function makeFloor(map) {
    const floor = document.createElement("canvas");
    floor.width = WIDTH;
    floor.height = HEIGHT;
    const ctx = floor.getContext("2d");
    ctx.fillStyle = `rgb(${map.tint.join(",")})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    let seed = 72;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let row = -1; row < 12; row++) {
        for (let col = -1; col < 17; col++) {
            const x = col * 78 + (row % 2) * 39;
            const y = row * 62;
            const shade = Math.floor(random() * 12);
            ctx.fillStyle = `rgb(${map.tint.map(channel => channel + shade).join(",")})`;
            ctx.fillRect(x + 2, y + 2, 74, 58);
            ctx.strokeStyle = "#aeb3a408";
            ctx.strokeRect(x + 4, y + 4, 69, 53);
            if (random() < 0.3) {
                ctx.strokeStyle = "#0b13176b";
                ctx.beginPath();
                ctx.moveTo(x + 20, y + 3);
                ctx.lineTo(x + 35, y + 25);
                ctx.lineTo(x + 30, y + 40);
                ctx.stroke();
            }
        }
    }
    if (map.id === "marsh") {
        ctx.strokeStyle = "#73957755";
        ctx.lineWidth = 2;
        for (let i = 0; i < 100; i++) {
            const x = random() * WIDTH;
            const y = i % 2 ? 48 + random() * 30 : HEIGHT - 45 - random() * 30;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y - 20); ctx.moveTo(x, y); ctx.lineTo(x + 5, y - 27); ctx.stroke();
        }
    } else if (map.id === "citadel") {
        ctx.strokeStyle = "#ed824f30";
        ctx.lineWidth = 8;
        ctx.strokeRect(100, 100, WIDTH - 200, HEIGHT - 200);
        for (const x of [145, WIDTH - 145]) {
            ctx.fillStyle = "#0d1015";
            ctx.fillRect(x - 20, 110, 40, 80);
            ctx.fillRect(x - 20, HEIGHT - 190, 40, 80);
            ctx.fillStyle = "#987059";
            ctx.fillRect(x - 24, 106, 48, 10);
            ctx.fillRect(x - 24, HEIGHT - 194, 48, 10);
        }
    }
    if (["glacier", "archive", "rift"].includes(map.id)) {
        for (let i = 0; i < 18; i++) {
            const x = 70 + (i % 9) * 120;
            const y = i < 9 ? 55 : HEIGHT - 55;
            ctx.fillStyle = map.accent + "55";
            ctx.strokeStyle = map.accent + "88";
            ctx.beginPath();
            if (map.id === "glacier") {
                ctx.moveTo(x - 18, y + 14); ctx.lineTo(x - 6, y - 35); ctx.lineTo(x + 20, y + 10);
            } else if (map.id === "archive") {
                ctx.rect(x - 18, y - 15, 36, 30);
                ctx.moveTo(x, y - 15); ctx.lineTo(x, y + 15);
            } else {
                ctx.ellipse(x, y, 12, 30, Math.PI / 4, 0, Math.PI * 2);
            }
            ctx.closePath(); ctx.fill(); ctx.stroke();
        }
    }
    ctx.save();
    ctx.translate(WIDTH / 2, HEIGHT / 2);
    ctx.scale(1, 0.72);
    for (const radius of [155, 168, 215]) {
        ctx.strokeStyle = "#ab987526";
        ctx.lineWidth = radius === 168 ? 3 : 1;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
        ctx.save();
        ctx.rotate(i * Math.PI / 6);
        ctx.fillStyle = "#bdab7425";
        ctx.fillRect(-2, 179, 4, 18);
        ctx.restore();
    }
    ctx.strokeStyle = "#bc986130";
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
        const angle = i * Math.PI * 2 / 3 - Math.PI / 2;
        const x = Math.cos(angle) * 125;
        const y = Math.sin(angle) * 125;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    for (let i = 0; i < 160; i++) {
        const x = random() * WIDTH;
        const y = random() * HEIGHT;
        ctx.fillStyle = random() > 0.5 ? "#7b806221" : "#080e143a";
        ctx.beginPath();
        ctx.ellipse(x, y, 2 + random() * 10, 1 + random() * 4, random(), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.strokeStyle = "#080f16";
    ctx.lineWidth = 24;
    ctx.strokeRect(10, 10, WIDTH - 20, HEIGHT - 20);
    ctx.strokeStyle = "#7f80632e";
    ctx.lineWidth = 2;
    ctx.strokeRect(27, 27, WIDTH - 54, HEIGHT - 54);
    for (const [x, y] of [[74, 75], [WIDTH - 74, 75], [74, HEIGHT - 75], [WIDTH - 74, HEIGHT - 75]]) {
        const glow = ctx.createRadialGradient(x, y, 3, x, y, 140);
        glow.addColorStop(0, "#cb803f33");
        glow.addColorStop(1, "#cb803f00");
        ctx.fillStyle = glow;
        ctx.fillRect(x - 140, y - 140, 280, 280);
        ctx.fillStyle = "#0c1215";
        ctx.fillRect(x - 13, y - 8, 26, 33);
        ctx.fillStyle = "#5b5545";
        ctx.fillRect(x - 17, y - 12, 34, 11);
    }
    return floor;
}

function circle(ctx, x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
}

function drawActor(ctx, actor, player, time, map) {
    const hero = actor === player;
    const boss = actor.kind === "boss";
    const r = actor.radius;
    ctx.save();
    ctx.translate(actor.x, actor.y);
    ctx.fillStyle = "#0006";
    ctx.beginPath();
    ctx.ellipse(3, r * 0.55, r * 1.35, r * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    if (hero) {
        ctx.strokeStyle = "#a0d5db55";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 7, 23, 13, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (actor.invulnerable > 0) ctx.globalAlpha = 0.5 + Math.sin(time * 45) * 0.2;
        ctx.rotate(actor.facing + Math.PI / 2);
        ctx.fillStyle = "#984b37";
        ctx.beginPath();
        ctx.moveTo(-11, 0);
        ctx.lineTo(-17, 29);
        ctx.lineTo(2, 23 + Math.sin(time * 8) * 4);
        ctx.lineTo(14, 28);
        ctx.lineTo(11, 0);
        ctx.fill();
        circle(ctx, -8, 10, 6, "#333d40");
        circle(ctx, 8, 10, 6, "#333d40");
        ctx.fillStyle = "#8eaaa8";
        ctx.fillRect(-12, -8, 24, 19);
        ctx.fillStyle = "#c2c4aa";
        ctx.fillRect(-15, -7, 7, 10);
        ctx.fillRect(8, -7, 7, 10);
        circle(ctx, 0, -9, 9, "#d1c5a5");
        ctx.fillStyle = "#405459";
        ctx.fillRect(-7, -12, 14, 5);
        ctx.fillStyle = "#c9dcd7";
        ctx.beginPath();
        ctx.moveTo(20, -35);
        ctx.lineTo(24, -6);
        ctx.lineTo(19, -1);
        ctx.lineTo(16, -6);
        ctx.fill();
        ctx.fillStyle = "#d1ab61";
        ctx.fillRect(12, -2, 16, 4);
        ctx.fillStyle = "#644631";
        ctx.fillRect(18, 2, 4, 8);
    } else if (["summoner", "cantor", "hexer"].includes(actor.kind)) {
        const color = actor.kind === "cantor" ? "#a4e9bb" : actor.kind === "hexer" ? "#ef96cf" : "#b994e1";
        ctx.fillStyle = actor.flash > 0 ? "#fff4d6" : color;
        ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(20, 20); ctx.lineTo(0, 12); ctx.lineTo(-20, 20); ctx.closePath(); ctx.fill();
        circle(ctx, 0, -8, 8, "#292033");
        circle(ctx, -3, -8, 2, "#fff0ba"); circle(ctx, 3, -8, 2, "#fff0ba");
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, actor.kind === "cantor" ? 40 : 27, time, time + Math.PI * 1.6); ctx.stroke();
        if (actor.kind === "summoner") { ctx.fillStyle = "#cbbadd"; ctx.fillRect(22, -30, 3, 50); circle(ctx, 23, -30, 6, color); }
        if (actor.kind === "hexer") {
            for (let i = 0; i < 4; i++) circle(ctx, Math.cos(time + i * Math.PI / 2) * 30, Math.sin(time + i * Math.PI / 2) * 30, 4, color);
        }
    } else if (actor.kind === "bomber") {
        circle(ctx, 0, 0, 18, actor.flash > 0 ? "#fff4d6" : "#9d6646");
        circle(ctx, 0, -3, 12, actor.winding > 0 ? "#ffe3a0" : "#db9a43");
        ctx.strokeStyle = "#4d3737"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.moveTo(0, -17); ctx.lineTo(0, 17); ctx.stroke();
        circle(ctx, 0, -22, 4 + Math.sin(time * 15), "#ffb65d");
    } else if (actor.kind === "reaver") {
        ctx.rotate(Math.atan2(player.y - actor.y, player.x - actor.x));
        ctx.fillStyle = actor.flash > 0 ? "#fff4d6" : "#83b9cb";
        ctx.beginPath(); ctx.moveTo(25, 0); ctx.lineTo(-18, -18); ctx.lineTo(-9, 0); ctx.lineTo(-18, 18); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#d3f5ff"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(30, -14); ctx.lineTo(-2, -14); ctx.moveTo(30, 14); ctx.lineTo(-2, 14); ctx.stroke();
    } else if (actor.kind === "runner") {
        ctx.rotate(Math.atan2(player.y - actor.y, player.x - actor.x));
        ctx.fillStyle = actor.flash > 0 ? "#fff0cc" : "#c29068";
        ctx.beginPath(); ctx.ellipse(0, 0, 19, 9, 0, 0, Math.PI * 2); ctx.fill();
        circle(ctx, 15, 0, 8, "#d8b383");
        ctx.strokeStyle = "#ac7854"; ctx.lineWidth = 3;
        for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(-12, side * 5); ctx.lineTo(-18, side * 15); ctx.moveTo(6, side * 5); ctx.lineTo(12, side * 15); ctx.stroke();
        }
        circle(ctx, 17, -4, 2, "#ff725a");
    } else if (actor.kind === "spitter") {
        circle(ctx, 0, 0, 19, actor.flash > 0 ? "#fff0cc" : "#6b9764");
        circle(ctx, -8, -7, 7, "#a0b56b");
        circle(ctx, 8, -7, 7, "#a0b56b");
        circle(ctx, 0, 6, 8, "#253e36");
        circle(ctx, 0, 7, 4 + Math.sin(time * 3), "#bde498");
    } else if (actor.kind === "wisp") {
        ctx.shadowBlur = 20;
        ctx.shadowColor = "#85c0c6";
        ctx.fillStyle = actor.flash > 0 ? "#fff3d5" : "#568188";
        ctx.beginPath();
        ctx.moveTo(0, -23 + Math.sin(time * 4) * 3);
        ctx.lineTo(17, 8);
        ctx.lineTo(7, 17);
        ctx.lineTo(0, 10);
        ctx.lineTo(-10, 19);
        ctx.lineTo(-17, 8);
        ctx.fill();
        ctx.shadowBlur = 0;
        circle(ctx, -4, -3, 2, "#e9ffe8");
        circle(ctx, 4, -3, 2, "#e9ffe8");
    } else {
        const base = actor.flash > 0 ? "#fce5bf" : boss ? map.accent : actor.kind === "sentinel" ? "#8b6576" : actor.kind === "brute" ? "#787469" : "#747d6c";
        ctx.fillStyle = boss ? "#403845" : "#43453e";
        ctx.fillRect(-r * 0.6, 2, r * 0.45, r);
        ctx.fillRect(r * 0.2, 2, r * 0.45, r);
        circle(ctx, 0, -3, r * 0.88, base);
        circle(ctx, -r * 0.9, -3, r * 0.38, base);
        circle(ctx, r * 0.9, -3, r * 0.38, base);
        circle(ctx, 0, -r * 0.75, r * 0.55, boss ? "#b5aaa2" : "#aea58b");
        circle(ctx, -r * 0.2, -r * 0.85, 2.5, "#ec795c");
        circle(ctx, r * 0.2, -r * 0.85, 2.5, "#ec795c");
        if (actor.kind === "sentinel") {
            ctx.fillStyle = "#a5a0a5";
            ctx.beginPath(); ctx.moveTo(-27, -12); ctx.lineTo(-8, -12); ctx.lineTo(-8, 13); ctx.lineTo(-18, 24); ctx.lineTo(-27, 13); ctx.fill();
            ctx.strokeStyle = "#593e52"; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(-18, -7); ctx.lineTo(-18, 16); ctx.stroke();
            ctx.fillStyle = "#ddb898"; ctx.fillRect(23, -25, 4, 42);
        }
        if (boss) {
            ctx.strokeStyle = "#ac957a";
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(-12, -30);
            ctx.lineTo(-25, -49);
            ctx.lineTo(-22, -59);
            ctx.moveTo(12, -30);
            ctx.lineTo(25, -49);
            ctx.lineTo(22, -59);
            ctx.stroke();
            ctx.fillStyle = "#a58e77";
            ctx.fillRect(34, -30, 6, 65);
            ctx.fillStyle = "#657275";
            ctx.fillRect(22, -33, 31, 20);
        }
    }
    ctx.restore();
    if (actor.elite) {
        ctx.strokeStyle = "#f1cd76"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(actor.x, actor.y, r + 6, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#f1cd76"; ctx.font = "9px 'Segoe UI', sans-serif"; ctx.textAlign = "center";
        ctx.fillText("ELITE", actor.x, actor.y - r - 26);
    }
    if (!hero && actor.health < actor.maxHealth) {
        ctx.fillStyle = "#070b0dc9";
        ctx.fillRect(actor.x - r, actor.y - r - 20, r * 2, 4);
        ctx.fillStyle = boss ? "#cf9b64" : "#b47360";
        ctx.fillRect(actor.x - r, actor.y - r - 20, r * 2 * Math.max(0, actor.health / actor.maxHealth), 4);
    }
}

function render(ctx, floor, state) {
    const map = mapForWave(state.wave);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.drawImage(floor, 0, 0);
    for (const hazard of map.hazards) {
        const phase = firePhase(state.time);
        const burning = map.hazard !== "slow" && phase >= 4 && state.enemies.length > 0;
        const warning = map.hazard !== "slow" && phase >= 2 && !burning && state.enemies.length > 0;
        circle(ctx, hazard.x, hazard.y, hazard.radius, map.hazard === "slow" ? map.accent + "20" : burning ? map.accent + "77" : warning ? map.accent + "44" : "#4e333366");
        ctx.strokeStyle = map.accent;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.textAlign = "center"; ctx.font = "10px 'Segoe UI', sans-serif"; ctx.fillStyle = map.accent;
        ctx.fillText(map.hazard === "slow" ? "SLOW" : burning ? map.hazard.toUpperCase() : warning ? "DANGER SOON" : `${map.hazard.toUpperCase()} SEAL`, hazard.x, hazard.y + 4);
        if (burning) {
            for (let i = 0; i < 8; i++) {
                const angle = i * Math.PI / 4 + state.time;
                circle(ctx, hazard.x + Math.cos(angle) * hazard.radius * 0.6, hazard.y + Math.sin(angle) * hazard.radius * 0.6, 5, "#ffd295");
            }
        }
    }
    for (const [x, y] of [[74, 75], [WIDTH - 74, 75], [74, HEIGHT - 75], [WIDTH - 74, HEIGHT - 75]]) {
        ctx.save();
        ctx.shadowBlur = 25;
        ctx.shadowColor = "#ffae50";
        circle(ctx, x, y - 17, 7 + Math.sin(state.time * 8 + x) * 2, "#e5a14f");
        circle(ctx, x, y - 19, 3, "#ffe1a0");
        ctx.restore();
    }
    for (const enemy of state.enemies) {
        if (enemy.winding <= 0) continue;
        if (enemy.kind === "reaver") {
            ctx.strokeStyle = "#9ce5ee66"; ctx.lineWidth = 36;
            ctx.beginPath(); ctx.moveTo(enemy.x, enemy.y); ctx.lineTo(enemy.x + enemy.chargeX * 252, enemy.y + enemy.chargeY * 252); ctx.stroke();
            ctx.strokeStyle = "#d8fdff"; ctx.lineWidth = 2; ctx.stroke();
            continue;
        }
        const radius = enemy.kind === "bomber" ? 110 : 135;
        circle(ctx, enemy.x, enemy.y, radius, "#e6654930");
        ctx.strokeStyle = "#f68362";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, radius * Math.max(0, 1 - enemy.winding / 1.1), 0, Math.PI * 2);
        ctx.stroke();
    }
    for (const drop of state.loot) {
        const color = drop.kind === "power" ? POWER_UPS[drop.value].color : drop.kind === "upgrade" ? "#efd1ff" : drop.kind === "gold" ? "#dab769" : drop.kind === "weapon" ? "#8fcbc6" : drop.kind === "armor" ? "#b5b9f2" : "#cf7164";
        ctx.save();
        ctx.translate(drop.x, drop.y);
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.fillStyle = color;
        ctx.rotate(Math.PI / 4);
        const size = drop.kind === "power" || drop.kind === "upgrade" ? 7 : 4;
        ctx.fillRect(-size, -size, size * 2, size * 2);
        ctx.restore();
        if (["weapon", "armor", "power", "upgrade"].includes(drop.kind)) {
            ctx.fillStyle = color;
            ctx.font = "10px 'Segoe UI', sans-serif";
            ctx.textAlign = "center";
            const label = drop.kind === "power" ? POWER_UPS[drop.value].name
                : drop.kind === "upgrade" ? `${UPGRADES[Object.keys(UPGRADES)[drop.value]].name} +1`
                : `${drop.kind === "weapon" ? "Blade" : "Armor"} +${drop.value}`;
            ctx.fillText(label, drop.x, drop.y - 16);
        }
    }
    const actors = [...state.enemies.filter(enemy => enemy.health > 0), state.player].sort((a, b) => a.y - b.y);
    for (const actor of actors) drawActor(ctx, actor, state.player, state.time, map);
    for (const [index, power] of POWER_UPS.entries()) {
        if (state.buffs[power.key] <= 0) continue;
        ctx.strokeStyle = power.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(state.player.x, state.player.y, 25 + index * 4, state.time + index, state.time + index + Math.PI * 1.5); ctx.stroke();
    }
    for (const bolt of state.projectiles) {
        ctx.save();
        ctx.shadowColor = "#95dfd7";
        ctx.shadowBlur = 18;
        circle(ctx, bolt.x, bolt.y, 5, "#b5e4dc");
        ctx.restore();
    }
    for (const item of state.effects) {
        const progress = 1 - item.life / item.maxLife;
        ctx.save();
        ctx.globalAlpha = 1 - progress;
        ctx.strokeStyle = item.color;
        ctx.fillStyle = item.color;
        ctx.lineWidth = 3 * (1 - progress) + 1;
        if (item.kind === "text") {
            ctx.font = "bold 16px 'Segoe UI', sans-serif";
            ctx.textAlign = "center";
            ctx.shadowBlur = 3;
            ctx.shadowColor = "#000";
            ctx.fillText(item.text, item.x, item.y - progress * 35);
        } else if (item.kind === "slash") {
            ctx.lineWidth = 15 * (1 - progress);
            ctx.beginPath();
            ctx.arc(item.x, item.y, item.radius * (0.6 + progress * 0.4), item.angle - 1.3, item.angle + 1.3);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.arc(item.x, item.y, Math.max(1, item.radius * progress), 0, Math.PI * 2);
            ctx.stroke();
            for (let i = 0; i < 12; i++) {
                const angle = i * Math.PI / 6;
                circle(ctx, item.x + Math.cos(angle) * item.radius * progress, item.y + Math.sin(angle) * item.radius * progress, 3 * (1 - progress), item.color);
            }
        }
        ctx.restore();
    }
    const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 160, WIDTH / 2, HEIGHT / 2, 630);
    vignette.addColorStop(0, "#03090d00");
    vignette.addColorStop(1, "#03090d9c");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const boss = state.enemies.find(enemy => enemy.kind === "boss" && enemy.health > 0);
    if (boss) {
        ctx.textAlign = "center";
        ctx.font = "14px Georgia, serif";
        ctx.fillStyle = "#e4c9a4";
        ctx.fillText(map.boss.toUpperCase(), WIDTH / 2, 49);
        ctx.fillStyle = "#090e11";
        ctx.fillRect(WIDTH / 2 - 180, 61, 360, 8);
        ctx.fillStyle = "#ae6656";
        ctx.fillRect(WIDTH / 2 - 180, 61, 360 * boss.health / boss.maxHealth, 8);
    }
}

export function createGame(root, saveBridge = null) {
    const canvas = root.querySelector("canvas");
    const bestKey = `${BEST_KEY}:${root.dataset.player || "unknown"}`;
    const ctx = canvas.getContext("2d");
    const loading = root.querySelector("[data-loading]");
    if (!ctx) {
        loading.textContent = "This game needs a browser with Canvas 2D support.";
        return { dispose() {} };
    }
    const floors = MAPS.map(makeFloor);
    const controller = new AbortController();
    const on = (target, event, handler, options = {}) => target.addEventListener(event, handler, { ...options, signal: controller.signal });
    const stats = Object.fromEntries([...root.querySelectorAll("[data-stat]")].map(element => [element.dataset.stat, element]));
    const healthMeter = root.querySelector('[data-meter="health"]');
    const xpMeter = root.querySelector('[data-meter="xp"]');
    const overlay = root.querySelector("[data-overlay]");
    const title = root.querySelector("[data-overlay-title]");
    const kicker = root.querySelector("[data-overlay-kicker]");
    const description = root.querySelector("[data-overlay-description]");
    const startButton = root.querySelector('[data-action="start"]');
    const pauseButton = root.querySelector('[data-action="pause"]');
    const restartButton = root.querySelector('[data-action="restart"]');
    const saveButton = root.querySelector('[data-action="save"]');
    const loadButton = root.querySelector('[data-action="load"]');
    const saveStatus = root.querySelector("[data-save-status]");
    const endlessButton = root.querySelector('[data-action="endless"]');
    const forgeButton = root.querySelector('[data-action="forge"]');
    const forgeFeedback = root.querySelector("[data-forge-feedback]");
    const upgradeButtons = [...root.querySelectorAll("[data-upgrade]")];
    const draft = root.querySelector("[data-level-draft]");
    const runMenu = root.querySelector("[data-run-menu]");
    const cardButtons = [...root.querySelectorAll("[data-level-card]")];
    const keys = new Set();
    const pointers = new Map();
    let aim = null;
    let state = createState();
    let best = 0;
    let frame = 0;
    let last = 0;
    let hudTime = 0;
    let shownStatus = "ready";
    let disposed = false;
    let saving = false;
    let checkingUnlock = !!saveBridge;
    let endlessUnlocked = false;
    let checkpointHandled = null;
    let shownDraft = "";
    let cardPickReadyAt = 0;
    let draftVisible = false;
    try {
        const stored = Number(localStorage.getItem(bestKey));
        if (Number.isFinite(stored) && stored >= 0) best = Math.floor(stored);
    } catch {
        // Storage is optional; private browsing can disable it.
    }
    const text = (name, value) => {
        const next = String(value);
        if (stats[name] && stats[name].textContent !== next) stats[name].textContent = next;
    };
    function clearInput() {
        keys.clear();
        pointers.clear();
        aim = null;
    }
    function updateHud() {
        const p = state.player;
        const map = mapForWave(state.wave);
        text("map", map.name);
        text("chapter", `CHAPTER ${map.chapter}`);
        text("map-description", map.description);
        text("map-caption", `${map.name.toUpperCase()} / ${map.caption}`);
        text("mode", state.mode === "endless" ? "THE ENDLESS WATCH" : "THE EMBER CAMPAIGN");
        text("campaign", state.mode === "endless" ? `ECHO ${Math.max(0, state.wave - LAST_WAVE)}` : `MAP ${mapIndexForWave(state.wave) + 1} / ${MAPS.length}`);
        text("last-wave", state.mode === "endless" ? "ENDLESS" : LAST_WAVE);
        text("story-title", state.mode === "endless" ? "THE WATCH HAS NO END" : `CHAPTER ${mapIndexForWave(state.wave) + 1} / SIX STOLEN DAWNS`);
        text("story", state.mode === "endless" ? "The sun rises because someone keeps watch. The echoes borrow faces from your journey. Each return to these lands brings a stronger enemy." : ["camp", "won"].includes(state.status) ? map.ending : map.story);
        const dawns = state.campaignComplete ? 6 : Math.floor(Math.max(0, state.wave - (state.enemies.some(enemy => enemy.health > 0) ? 1 : 0)) / 5);
        text("dawns", `${dawns} / 6 dawns recovered`);
        text("threat", threatForWave(state.wave));
        const acquired = Object.entries(state.boons).filter(([, rank]) => rank > 0);
        text("boon-count", acquired.reduce((total, [, rank]) => total + rank, 0));
        text("boons", acquired.length ? acquired.map(([key, rank]) => `${LEVEL_CARDS[key].name} x${rank}`).join(" / ") : "Level up to choose your first lasting boon.");
        if (state.kills > best) {
            best = state.kills;
            try { localStorage.setItem(bestKey, String(best)); } catch { /* Best score is optional. */ }
        }
        text("best", best);
        text("wave", state.wave || "-");
        text("health", `${Math.ceil(p.health)} / ${p.maxHealth}`);
        text("level", p.level);
        text("xp", `${p.xp} / ${p.nextLevel}`);
        text("gold", state.gold);
        text("kills", state.kills);
        text("damage", weaponDamage(state));
        text("armor-name", p.armor);
        text("armor-detail", `${armorRating(state)}% damage reduction (cap 65%)`);
        text("forge-gold", `${state.gold} gold`);
        text("checkpoint-save", ["camp", "won"].includes(state.status) ? saveStatus.textContent : "");
        text("weapon", p.weapon);
        text("weapon-detail", `Relic +${p.weaponBonus} / Forge rank ${state.upgrades.weapon}`);
        text("unlock", checkingUnlock ? "Checking server unlock..." : endlessUnlocked ? "Endless Watch permanently unlocked on this server profile." : state.status === "won" ? (saving ? "Saving your permanent Endless unlock..." : "Endless is available now. Save successfully to keep the unlock permanently.") : "Complete the campaign to permanently unlock Endless Watch.");
        const activePowers = POWER_UPS.filter(power => state.buffs[power.key] > 0);
        text("buffs", activePowers.length ? activePowers.map(power => `${power.name}: ${Math.ceil(state.buffs[power.key])}s`).join(" / ") : "No active power-ups");
        text("journal", state.journal);
        for (const skill of ["attack", "nova", "dodge"]) text(skill, p[skill] > 0 ? `${p[skill].toFixed(1)}s` : "Ready");
        text("potion", `${p.potions} charge${p.potions === 1 ? "" : "s"}`);
        text("objective", state.status === "ready" ? `Survive ${LAST_WAVE} waves across ${MAPS.length} lands.`
            : state.status === "won" ? "Dawn restored. The Endless Watch is unlocked."
            : state.status === "camp" ? "Checkpoint reached. Rest and forge before continuing."
            : state.status === "choosing" ? `Level up! Choose a lasting boon (${state.pendingChoices} choice${state.pendingChoices === 1 ? "" : "s"} remaining).`
            : state.status === "dead" ? "Your ember has faded."
            : state.status === "paused" ? "Rest a moment, Ashbound."
            : state.enemies.length ? `${state.enemies.length} enemies remain / Collect fallen relics`
            : `Gather your loot / Next wave in ${Math.ceil(state.intermission)}s`);
        healthMeter.max = p.maxHealth;
        healthMeter.value = p.health;
        xpMeter.max = p.nextLevel;
        xpMeter.value = p.xp;
        const choosing = state.status === "choosing";
        const draftClosing = draftVisible && !choosing;
        overlay.hidden = state.status === "playing" && !draftClosing;
        const active = ["playing", "paused", "camp", "won", "choosing"].includes(state.status);
        const canForge = ["paused", "camp", "won"].includes(state.status);
        pauseButton.disabled = saving || !["playing", "paused"].includes(state.status);
        startButton.disabled = saving || choosing;
        restartButton.disabled = saving || choosing;
        endlessButton.disabled = saving || checkingUnlock || choosing;
        endlessButton.hidden = choosing || !(endlessUnlocked || state.status === "won") || (state.mode === "endless" && state.status !== "dead") || state.status === "playing";
        endlessButton.textContent = state.status === "won" ? "Continue into the Endless Watch" : "New Endless Watch run";
        forgeButton.disabled = saving || !active || choosing;
        if (choosing !== draftVisible) {
            draftVisible = choosing;
            if (choosing) {
                draft.hidden = false;
                draft.classList.remove("level-draft-exit");
                draft.classList.add("level-draft-enter");
                requestAnimationFrame(() => requestAnimationFrame(() => draft.classList.remove("level-draft-enter")));
            } else {
                draft.classList.remove("level-draft-enter");
                draft.classList.add("level-draft-exit");
                const hideAfterExit = draft;
                setTimeout(() => {
                    if (hideAfterExit.classList.contains("level-draft-exit")) {
                        hideAfterExit.hidden = true;
                        hideAfterExit.classList.remove("level-draft-exit");
                    }
                    updateHud();
                    if (state.status === "playing") canvas.focus({ preventScroll: true });
                }, 320);
            }
        }
        runMenu.hidden = choosing || draftClosing;
        for (const button of cardButtons) button.disabled = saving || !choosing;
        if (choosing) {
            text("draft-level", `LEVEL ${state.player.level - state.pendingChoices + 1} / AN OATH FOR THE JOURNEY`);
            text("draft-pending", state.pendingChoices > 1 ? `${state.pendingChoices} level-up choices queued. Select one card for each level.` : "Choose one card. Its bonus stays with this character and save.");
            const signature = `${state.pendingChoices}:${state.cardChoices.join(",")}`;
            if (signature !== shownDraft) {
                cardButtons.forEach((button, index) => {
                    const key = state.cardChoices[index];
                    const card = LEVEL_CARDS[key];
                    button.dataset.cardId = key;
                    button.querySelector("[data-card-category]").textContent = card.category;
                    button.querySelector("[data-card-name]").textContent = card.name;
                    button.querySelector("[data-card-description]").textContent = card.description;
                    button.querySelector("[data-card-rank]").textContent = `Rank ${state.boons[key]} to ${state.boons[key] + 1}${card.max < Number.MAX_SAFE_INTEGER ? ` / Max ${card.max}` : " / Stacking"}`;
                });
                if (!saving) { shownDraft = signature; cardButtons[0].focus({ preventScroll: true }); }
            }
        } else shownDraft = "";
        for (const button of upgradeButtons) {
            const key = button.dataset.upgrade;
            const rank = state.upgrades[key];
            const max = UPGRADES[key].max;
            const cost = upgradeCost(state, key);
            const label = `Rank ${rank}/${max} / ${rank >= max ? "Mastered" : `${cost} gold`}`;
            const element = button.querySelector("[data-upgrade-label]");
            if (element.textContent !== label) element.textContent = label;
            button.title = UPGRADES[key].detail;
            button.disabled = saving || !canForge || rank >= max || state.gold < cost;
        }
        if (saveButton) saveButton.disabled = saving || checkingUnlock || !saveBridge || !active;
        if (loadButton) loadButton.disabled = saving || checkingUnlock || !saveBridge;
        pauseButton.firstChild.textContent = state.status === "paused" ? "Resume " : "Pause ";
        if (state.status !== shownStatus) {
            shownStatus = state.status;
            overlay.hidden = state.status === "playing" && !draftClosing;
            restartButton.hidden = !["paused", "camp"].includes(state.status);
            if (state.status !== "playing") {
                clearInput();
            }
            if (state.status !== "playing" && !choosing) {
                const paused = state.status === "paused";
                const won = state.status === "won";
                const camp = state.status === "camp";
                const watch = state.mode === "endless";
                kicker.textContent = paused ? "A MOMENT OF RESPITE" : won ? "ALL SIX DAWNS RESTORED" : camp ? (watch ? "WATCH CHECKPOINT" : `DAWN ${dawns} RECOVERED`) : "THE WATCH REMEMBERS";
                title.textContent = paused ? "The hollow can wait." : won ? "A dawn of our own." : camp ? (watch ? "The watch endures." : `${map.boss} has fallen.`) : "Your ember fades.";
                description.textContent = paused ? "Your run is paused. Spend gold at the forge below, save your progress, or return to battle."
                    : camp || won ? (watch ? `Echo ${state.wave - LAST_WAVE} cleared. Vitality and flasks restored. Your checkpoint saves automatically. The next watch will be harder.` : map.ending)
                    : `${state.kills} enemies slain / ${state.gold} gold / Level ${p.level}. ${watch ? "Load your last checkpoint, or begin a fresh watch." : "Forge your equipment, dodge warning zones, and seek fallen upgrade scrolls."}`;
                startButton.textContent = paused ? "Return to battle" : camp ? (watch ? "Continue the watch" : `Travel to ${mapForWave(state.wave + 1).name}`) : "Begin a new campaign";
                (won ? endlessButton : startButton).focus({ preventScroll: true });
            }
        }
    }
    function pause() {
        if (saving) return;
        togglePause(state);
        clearInput();
        updateHud();
        if (state.status === "playing") canvas.focus({ preventScroll: true });
    }
    function begin() {
        if (saving || state.status === "choosing") return;
        if (state.status === "paused") togglePause(state);
        else if (state.status === "camp") continueJourney(state);
        else {
            if (state.status === "won" && !window.confirm("Begin a new campaign? Your saved Endless unlock is kept, but this character will be replaced.")) return;
            state = startRun();
            checkpointHandled = null;
        }
        clearInput();
        last = performance.now();
        updateHud();
        canvas.focus({ preventScroll: true });
    }
    on(startButton, "click", begin);
    on(pauseButton, "click", pause);
    on(endlessButton, "click", () => {
        if (saving || checkingUnlock || state.status === "choosing" || !(endlessUnlocked || state.status === "won")) return;
        if (state.status === "won") enterEndless(state);
        else {
            if (["paused", "camp"].includes(state.status) && !window.confirm("Start a fresh Endless Watch with a veteran kit? This replaces your current character.")) return;
            state = startEndlessRun();
        }
        checkpointHandled = null;
        clearInput(); last = performance.now(); updateHud(); canvas.focus({ preventScroll: true });
    });
    on(forgeButton, "click", () => {
        if (saving || state.status === "choosing") return;
        if (state.status === "playing") pause();
        root.querySelector("[data-forge]").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    for (const button of upgradeButtons) on(button, "click", () => {
        if (saving || !buyUpgrade(state, button.dataset.upgrade)) return;
        forgeFeedback.textContent = state.journal;
        saveStatus.textContent = "Equipment changed. Save to keep your upgrades on the server.";
        updateHud();
        if (["camp", "won"].includes(state.status)) void persist(false, true);
    });
    for (const button of cardButtons) on(button, "click", event => {
        if (saving || event.detail > 1 || performance.now() < cardPickReadyAt || !chooseLevelCard(state, button.dataset.cardId)) return;
        cardPickReadyAt = performance.now() + 250;
        clearInput();
        saveStatus.textContent = "Level-up boon selected. Save to keep it, or continue to the next autosaved checkpoint.";
        updateHud();
        if (state.status === "playing") canvas.focus({ preventScroll: true });
    });
    on(restartButton, "click", () => { if (saving || state.status === "choosing" || !window.confirm("Abandon this run? Unsaved progress will be lost.")) return; state = startRun(); checkpointHandled = null; clearInput(); updateHud(); canvas.focus({ preventScroll: true }); });
    async function persist(loadingSave, automatic = false) {
        if (saving || checkingUnlock) return;
        if (!saveBridge) {
            saveStatus.textContent = "Checkpoint autosave unavailable. Reconnect to Blazor and select Save before leaving.";
            return;
        }
        if (loadingSave && ["playing", "paused", "camp", "won", "choosing"].includes(state.status)
            && !window.confirm("Replace this run with your last server save? Unsaved progress will be lost.")) return;
        if (state.status === "playing") pause();
        clearInput();
        saving = true;
        saveStatus.textContent = loadingSave ? "Loading from the server..." : automatic ? "Autosaving checkpoint to the server..." : "Saving to the server...";
        updateHud();
        try {
            const result = loadingSave
                ? await saveBridge.invokeMethodAsync("LoadRun")
                : await saveBridge.invokeMethodAsync("SaveRun", captureSnapshot(state));
            if (disposed) return;
            if (result.success) endlessUnlocked = endlessUnlocked || result.endlessUnlocked || result.save?.endlessUnlocked || result.save?.state?.campaignComplete === 1;
            if (result.success && loadingSave) {
                const restored = restoreSnapshot(result.save);
                state = restored;
                checkpointHandled = ["camp", "won"].includes(state.status) ? `${state.mode}:${state.wave}` : null;
                shownStatus = "";
                shownDraft = "";
                last = performance.now();
            }
            saveStatus.textContent = automatic
                ? result.success ? `Checkpoint ${state.wave} saved on the server.${endlessUnlocked ? " Endless Watch remains permanently unlocked." : ""}` : `Checkpoint autosave failed. ${result.message} Select Save to retry before leaving.`
                : result.message;
        } catch {
            if (!disposed) saveStatus.textContent = automatic ? "Checkpoint autosave failed. Stay here, reconnect, then select Save to retry." : "Save/load failed: the connection was lost or the save was invalid. Your current run is unchanged; reconnect and try again.";
        } finally {
            if (!disposed) {
                saving = false;
                updateHud();
            }
        }
    }
    if (saveButton && saveStatus) on(saveButton, "click", () => persist(false));
    if (loadButton && saveStatus) on(loadButton, "click", () => persist(true));
    async function readUnlock() {
        try {
            if (saveBridge) {
                const result = await saveBridge.invokeMethodAsync("LoadRun");
                if (disposed) return;
                if (result.success) endlessUnlocked = !!(result.endlessUnlocked || result.save?.endlessUnlocked || result.save?.state?.campaignComplete === 1);
                else saveStatus.textContent = `${result.message} Load can retry the server profile check.`;
            }
        } catch {
            if (!disposed) saveStatus.textContent = "Could not read the server profile. Reconnect and use Load to recover your run and unlocks.";
        } finally {
            if (!disposed) { checkingUnlock = false; updateHud(); }
        }
    }
    on(window, "keydown", event => {
        if (!root.contains(document.activeElement) || event.ctrlKey || event.altKey || event.metaKey) return;
        if (["KeyP", "Escape"].includes(event.code)) {
            event.preventDefault();
            if (!event.repeat) pause();
        } else if (movementKeys[event.code] || skillKeys[event.code]) {
            if (state.status !== "playing") return;
            event.preventDefault();
            keys.add(event.code);
        }
    });
    on(window, "keyup", event => keys.delete(event.code));
    on(window, "blur", () => { if (state.status === "playing") pause(); else clearInput(); });
    on(document, "visibilitychange", () => { if (document.hidden && state.status === "playing") pause(); });
    on(root, "focusout", event => {
        if (event.relatedTarget && !root.contains(event.relatedTarget) && state.status === "playing") pause();
    });
    function point(event) {
        const bounds = canvas.getBoundingClientRect();
        return { x: (event.clientX - bounds.left) * WIDTH / bounds.width, y: (event.clientY - bounds.top) * HEIGHT / bounds.height };
    }
    on(canvas, "pointermove", event => { if (event.pointerType === "mouse" || pointers.has(event.pointerId)) aim = point(event); });
    on(canvas, "pointerdown", event => {
        if (event.button !== 0 || state.status !== "playing") return;
        event.preventDefault();
        canvas.focus({ preventScroll: true });
        canvas.setPointerCapture(event.pointerId);
        aim = point(event);
        pointers.set(event.pointerId, "attack");
    });
    on(canvas, "pointerleave", () => { if (!pointers.size) aim = null; });
    on(canvas, "contextmenu", event => event.preventDefault());
    for (const button of root.querySelectorAll("[data-skill], [data-move]")) {
        on(button, "pointerdown", event => {
            if (event.button !== 0 || state.status !== "playing") return;
            event.preventDefault();
            canvas.focus({ preventScroll: true });
            button.setPointerCapture(event.pointerId);
            if (event.pointerType !== "mouse") aim = null;
            pointers.set(event.pointerId, button.dataset.skill || button.dataset.move);
        });
        on(button, "lostpointercapture", event => pointers.delete(event.pointerId));
        on(button, "click", event => {
            if (event.detail === 0 && button.dataset.skill) {
                useSkill(state, button.dataset.skill);
                updateHud();
            }
        });
    }
    const release = event => { pointers.delete(event.pointerId); if (event.pointerType !== "mouse") aim = null; };
    on(window, "pointerup", release);
    on(window, "pointercancel", release);
    on(canvas, "lostpointercapture", release);
    function input() {
        const held = new Set(pointers.values());
        for (const key of keys) held.add(movementKeys[key] || skillKeys[key]);
        return {
            x: Number(held.has("right")) - Number(held.has("left")),
            y: Number(held.has("down")) - Number(held.has("up")),
            aim, attack: held.has("attack"), nova: held.has("nova"), dodge: held.has("dodge"), potion: held.has("potion")
        };
    }
    function animate(now) {
        if (disposed) return;
        if (!root.isConnected) { dispose(); return; }
        step(state, input(), last ? (now - last) / 1000 : 0);
        last = now;
        if (["camp", "won"].includes(state.status) && !saving && !checkingUnlock && checkpointHandled !== `${state.mode}:${state.wave}`) {
            checkpointHandled = `${state.mode}:${state.wave}`;
            void persist(false, true);
        }
        render(ctx, floors[mapIndexForWave(state.wave)], state);
        if (now - hudTime > 100 || state.status !== shownStatus) { updateHud(); hudTime = now; }
        frame = requestAnimationFrame(animate);
    }
    function dispose() {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(frame);
        controller.abort();
        observer.disconnect();
        clearInput();
    }
    const observer = new MutationObserver(() => { if (!root.isConnected) dispose(); });
    observer.observe(document.body, { childList: true, subtree: true });
    loading.hidden = true;
    startButton.disabled = false;
    updateHud();
    frame = requestAnimationFrame(animate);
    void readUnlock();
    return { dispose };
}

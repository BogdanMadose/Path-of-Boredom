import { WIDTH, HEIGHT, createState, startRun, startEndlessRun, step, togglePause, useSkill, weaponDamage, armorRating, upgradeCost, buyUpgrade, continueJourney, enterEndless, chooseLevelCard } from "./arpg-engine.js";
import { captureSnapshot, restoreSnapshot } from "./arpg-save.js";
import { captureRankingBuild } from "./arpg-ranking.js";
import { MAPS, LAST_WAVE, UPGRADES, POWER_UPS, threatForWave, mapForWave, mapIndexForWave, firePhase } from "./arpg-campaign.js";
import { LEVEL_CARDS } from "./arpg-cards.js";
import { DIFFICULTIES } from "./arpg-difficulty.js";
import { MASTERY, MAX_FLASKS, forgeComplete, masteryCost, buyMastery, chargeLaneEnd } from "./arpg-engine.js";
import { movementSpeed, criticalChance, criticalDamage, skillReach } from "./arpg-engine.js";
import { HERO_CLASSES, classFor } from "./arpg-classes.js";
import { SKILL_KEYS, SLOTTABLE_SKILLS, EXTRA_SKILLS, MAX_SKILL_POINTS, skillName, skillPointsLeft, skillPointsEarned, canLearnSkill, learnSkill, setLoadout, skillUnlocked, wardUnlockHint, validLoadout, treeNodeKey, treeNodeDefinition, treeNodeStatus } from "./arpg-skills.js";
import { drawHero, drawOrb, decorateFloor, drawAtmosphere, drawLootIcon } from "./arpg-graphics.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const BEST_KEY = "path-of-boredom.best.v1";
const movementKeys = { KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right" };
const skillKeys = { KeyJ: "attack", KeyQ: "manual", Space: "dodge", KeyE: "potion" };

function makeFloor(map) {
    const floor = document.createElement("canvas");
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    floor.width = Math.round(WIDTH * scale);
    floor.height = Math.round(HEIGHT * scale);
    const ctx = floor.getContext("2d");
    ctx.setTransform(floor.width / WIDTH, 0, 0, floor.height / HEIGHT, 0, 0);
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
            ctx.strokeStyle = "#dbd9b71b"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x + 3, y + 59); ctx.lineTo(x + 3, y + 3); ctx.lineTo(x + 75, y + 3); ctx.stroke();
            ctx.strokeStyle = "#050c1266";
            ctx.beginPath(); ctx.moveTo(x + 76, y + 3); ctx.lineTo(x + 76, y + 60); ctx.lineTo(x + 3, y + 60); ctx.stroke();
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
    decorateFloor(ctx, map, random, WIDTH, HEIGHT);
    return floor;
}

function circle(ctx, x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
}

function drawActor(ctx, actor, player, time, map, heroClass) {
    const hero = actor === player;
    if (reducedMotion.matches) time = 0;
    const boss = actor.kind === "boss";
    const r = actor.radius;
    ctx.save();
    ctx.translate(actor.x, actor.y);
    ctx.fillStyle = "#0006";
    ctx.beginPath();
    ctx.ellipse(3, r * 0.55, r * 1.35, r * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    const walking = hero ? Math.min(1, Math.hypot(actor.vx || 0, actor.vy || 0) / 180) : actor.moving ? 1 : 0;
    const stride = reducedMotion.matches ? 0 : Math.sin(actor.stridePhase ?? 0) * walking;
    const strike = Math.sin(Math.PI * Math.min(1, (actor.swing ?? 0) / (hero ? 0.26 : 0.3)));
    if (!reducedMotion.matches) {
        ctx.translate(0, -Math.abs(stride) * (hero ? 2 : 3));
        if (!hero) {
            const angle = Math.atan2(player.y - actor.y, player.x - actor.x);
            ctx.translate(Math.cos(angle) * strike * 7, Math.sin(angle) * strike * 7);
            if (actor.winding > 0 || actor.attackWindup > 0) ctx.scale(1.06, 0.94);
        }
    }
    if (hero) {
        drawHero(ctx, actor, HERO_CLASSES[heroClass], stride, strike, time, reducedMotion.matches);
    } else if (actor.kind === "duelist") {
        ctx.rotate(actor.attackWindup > 0 ? Math.atan2(actor.attackY - actor.y, actor.attackX - actor.x) : Math.atan2(player.y - actor.y, player.x - actor.x));
        drawOrb(ctx, 0, 0, 15, actor.flash > 0 ? "#fff4d6" : "#357a89");
        drawOrb(ctx, 7, 0, 9, "#b9e8e9");
        ctx.fillStyle = "#153d4e"; ctx.fillRect(8, -7, 4, 14);
        ctx.strokeStyle = actor.attackWindup > 0 ? "#e6ffff" : "#85e6eb"; ctx.lineWidth = 4;
        for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(-10, side * 15); ctx.lineTo(18 + strike * 8, side * 23); ctx.stroke();
        }
    } else if (actor.kind === "artillerist") {
        drawOrb(ctx, 0, 0, 21, actor.flash > 0 ? "#fff4d6" : "#705887");
        ctx.fillStyle = "#292638"; ctx.fillRect(-18, 9, 36, 12);
        ctx.rotate(Math.atan2(actor.attackY - actor.y, actor.attackX - actor.x));
        ctx.fillStyle = "#ad95c7"; ctx.fillRect(0, -8, 31, 16);
        drawOrb(ctx, 29, 0, actor.attackWindup > 0 ? 9 : 5, "#e1b7ff");
    } else if (["summoner", "cantor", "hexer"].includes(actor.kind)) {
        const color = actor.kind === "cantor" ? "#a4e9bb" : actor.kind === "hexer" ? "#ef96cf" : "#b994e1";
        const cloth = ctx.createLinearGradient(-20, -25, 20, 20);
        cloth.addColorStop(0, color); cloth.addColorStop(1, "#252437");
        ctx.fillStyle = actor.flash > 0 ? "#fff4d6" : cloth;
        ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(20, 20); ctx.lineTo(0, 12); ctx.lineTo(-20, 20); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = color + "88"; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-7, -5); ctx.lineTo(-12, 13); ctx.moveTo(7, -5); ctx.lineTo(12, 13); ctx.stroke();
        drawOrb(ctx, 0, -8, 8, "#292033");
        circle(ctx, -3, -8, 2, "#fff0ba"); circle(ctx, 3, -8, 2, "#fff0ba");
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, actor.kind === "cantor" ? 40 : 27, time, time + Math.PI * 1.6); ctx.stroke();
        if (actor.kind === "summoner") { ctx.fillStyle = "#cbbadd"; ctx.fillRect(22, -30, 3, 50); circle(ctx, 23, -30, 6, color); }
        if (actor.kind === "hexer") {
            for (let i = 0; i < 4; i++) circle(ctx, Math.cos(time + i * Math.PI / 2) * 30, Math.sin(time + i * Math.PI / 2) * 30, 4, color);
        }
    } else if (actor.kind === "bomber") {
        drawOrb(ctx, 0, 0, 18, actor.flash > 0 ? "#fff4d6" : "#9d6646");
        drawOrb(ctx, 0, -3, 12, actor.winding > 0 ? "#ffe3a0" : "#db9a43");
        ctx.strokeStyle = "#4d3737"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.moveTo(0, -17); ctx.lineTo(0, 17); ctx.stroke();
        circle(ctx, 0, -22, 4 + Math.sin(time * 15), "#ffb65d");
    } else if (["reaver", "lancer"].includes(actor.kind)) {
        ctx.rotate(actor.winding > 0 || actor.charging > 0 ? Math.atan2(actor.chargeY, actor.chargeX) : Math.atan2(player.y - actor.y, player.x - actor.x));
        ctx.fillStyle = actor.flash > 0 ? "#fff4d6" : actor.kind === "lancer" ? "#e9ac63" : "#83b9cb";
        if (actor.charging > 0 && !reducedMotion.matches) ctx.scale(1.3, 0.8);
        ctx.beginPath(); ctx.moveTo(25, 0); ctx.lineTo(-18, -18); ctx.lineTo(-9, 0); ctx.lineTo(-18, 18); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#142734"; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = "#f2e9c566";
        ctx.beginPath(); ctx.moveTo(23, 0); ctx.lineTo(-16, -16); ctx.lineTo(-5, -2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#d3f5ff"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(30, -14); ctx.lineTo(-2, -14); ctx.moveTo(30, 14); ctx.lineTo(-2, 14); ctx.stroke();
    } else if (actor.kind === "runner") {
        ctx.rotate(Math.atan2(player.y - actor.y, player.x - actor.x));
        ctx.save(); ctx.scale(1, 0.5);
        drawOrb(ctx, 0, 0, 19, actor.flash > 0 ? "#fff0cc" : "#c29068");
        ctx.restore();
        drawOrb(ctx, 15, 0, 8, "#d8b383");
        ctx.strokeStyle = "#ac7854"; ctx.lineWidth = 3;
        for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(-12, side * 5); ctx.lineTo(-18 + stride * side * 7, side * 15); ctx.moveTo(6, side * 5); ctx.lineTo(12 - stride * side * 7, side * 15); ctx.stroke();
        }
        circle(ctx, 17, -4, 2, "#ff725a");
    } else if (actor.kind === "spitter") {
        drawOrb(ctx, 0, 0, 19, actor.flash > 0 ? "#fff0cc" : "#6b9764");
        drawOrb(ctx, -8, -7, 7, "#a0b56b");
        drawOrb(ctx, 8, -7, 7, "#a0b56b");
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
        ctx.fillRect(-r * 0.6, 2 + stride * 5, r * 0.45, r);
        ctx.fillRect(r * 0.2, 2 - stride * 5, r * 0.45, r);
        drawOrb(ctx, 0, -3, r * 0.88, base);
        drawOrb(ctx, -r * 0.9, -3, r * 0.38, base);
        drawOrb(ctx, r * 0.9, -3, r * 0.38, base);
        drawOrb(ctx, 0, -r * 0.75, r * 0.55, boss ? "#b5aaa2" : "#aea58b");
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
    if (!hero && actor.chilled > 0) {
        ctx.save(); ctx.strokeStyle = "#9be5ff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(actor.x, actor.y, r + 5, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 6; i++) {
            const angle = i * Math.PI / 3;
            ctx.beginPath(); ctx.moveTo(actor.x + Math.cos(angle) * (r + 2), actor.y + Math.sin(angle) * (r + 2));
            ctx.lineTo(actor.x + Math.cos(angle) * (r + 10), actor.y + Math.sin(angle) * (r + 10)); ctx.stroke();
        }
        ctx.restore();
    }
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
    ctx.drawImage(floor, 0, 0, WIDTH, HEIGHT);
    drawAtmosphere(ctx, map, state.time, reducedMotion.matches, WIDTH, HEIGHT);
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
        if (enemy.attackWindup > 0) {
            ctx.save();
            const ranged = ["wisp", "spitter", "summoner", "cantor", "hexer", "artillerist"].includes(enemy.kind);
            const angle = Math.atan2(enemy.attackY - enemy.y, enemy.attackX - enemy.x);
            const color = enemy.kind === "duelist" ? "#85e6eb" : ranged ? "#d39bff" : "#ff956f";
            ctx.strokeStyle = color; ctx.fillStyle = color + "33"; ctx.lineWidth = 2;
            ctx.beginPath();
            if (enemy.kind === "artillerist") {
                ctx.arc(enemy.attackX, enemy.attackY, 90, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.arc(enemy.attackX, enemy.attackY, 90 * (1 - enemy.attackWindup / 1.1), 0, Math.PI * 2); ctx.stroke();
            } else if (ranged) {
                ctx.arc(enemy.x, enemy.y, enemy.radius + 12, 0, Math.PI * 2); ctx.stroke();
            } else {
                const radius = enemy.kind === "duelist" ? 85 : enemy.radius + state.player.radius + 28;
                ctx.moveTo(enemy.x, enemy.y); ctx.arc(enemy.x, enemy.y, radius, angle - 1.32, angle + 1.32); ctx.closePath(); ctx.fill(); ctx.stroke();
            }
            ctx.fillStyle = color; ctx.textAlign = "center"; ctx.font = "bold 10px 'Segoe UI', sans-serif";
            ctx.fillText(enemy.kind === "artillerist" ? "MORTAR — MOVE" : ranged ? "CASTING" : "STRIKE", enemy.kind === "artillerist" ? enemy.attackX : enemy.x, (enemy.kind === "artillerist" ? enemy.attackY - 100 : enemy.y - enemy.radius - 28));
            ctx.restore();
        }
        if (enemy.winding <= 0) continue;
        if (enemy.kind === "lancer") {
            const end = chargeLaneEnd(enemy);
            ctx.save();
            ctx.strokeStyle = "#ffae4444"; ctx.lineWidth = enemy.radius * 2;
            ctx.beginPath(); ctx.moveTo(enemy.x, enemy.y); ctx.lineTo(end.x, end.y); ctx.stroke();
            ctx.strokeStyle = "#ffe2a0"; ctx.lineWidth = 2;
            ctx.setLineDash([14, 9]); ctx.lineDashOffset = reducedMotion.matches ? 0 : -state.time * 50;
            ctx.stroke();
            ctx.font = "bold 12px 'Segoe UI', sans-serif"; ctx.fillStyle = "#ffe2a0"; ctx.textAlign = "center";
            ctx.fillText("LANCER — STEP ASIDE", (enemy.x + end.x) / 2, (enemy.y + end.y) / 2 - 24);
            ctx.restore();
            continue;
        }
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
        drawLootIcon(ctx, drop, color, classFor(state).weaponType, state.time, reducedMotion.matches);
        if (["weapon", "armor", "power", "upgrade", "flask"].includes(drop.kind)) {
            ctx.fillStyle = color;
            ctx.font = "10px 'Segoe UI', sans-serif";
            ctx.textAlign = "center";
            const label = drop.kind === "flask" ? "Life flask" : drop.kind === "power" ? POWER_UPS[drop.value].name
                : drop.kind === "upgrade" ? `${UPGRADES[Object.keys(UPGRADES)[drop.value]].name} +1`
                : `${drop.kind === "weapon" ? classFor(state).weaponType : "Armor"} +${drop.value}`;
            ctx.lineWidth = 3; ctx.strokeStyle = "#091218";
            ctx.strokeText(label, drop.x, drop.y - 18);
            ctx.fillText(label, drop.x, drop.y - 18);
        }
    }
    const actors = [...state.enemies.filter(enemy => enemy.health > 0), state.player].sort((a, b) => a.y - b.y);
    if (!reducedMotion.matches) {
        for (const actor of actors) {
            const hero = actor === state.player;
            if (hero ? actor.rolling <= 0 : actor.charging <= 0) continue;
            const dx = hero ? actor.rollX : actor.chargeX, dy = hero ? actor.rollY : actor.chargeY;
            for (let i = 3; i > 0; i--) {
                circle(ctx, actor.x - dx * i * 18, actor.y - dy * i * 18, actor.radius * (1 - i * 0.16), hero ? "#bce7ec22" : "#e9ac6333");
            }
        }
    }
    for (const actor of actors) drawActor(ctx, actor, state.player, state.time, map, state.heroClass);
    for (const shot of state.playerShots) {
        ctx.save();
        ctx.translate(shot.x, shot.y); ctx.rotate(Math.atan2(shot.vy, shot.vx));
        const nodes = state.skillTree[shot.skill || "attack"];
        const ignited = shot.skill === "nova" && nodes.ignition > 0;
        ctx.strokeStyle = ignited ? "#ff973c" : shot.skill === "burst" ? "#c8a6ff" : shot.piercing ? "#ffe7a5" : "#b8edc5";
        ctx.lineWidth = 2 + (nodes.edge ?? nodes.amplitude ?? nodes.focus ?? 0) * 0.6;
        if (ignited) { circle(ctx, -12, 0, 5, "#ff8b3277"); circle(ctx, -21, 0, 3, "#ffda78"); }
        ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(5, 0); ctx.moveTo(0, -4); ctx.lineTo(5, 0); ctx.lineTo(0, 4); ctx.stroke();
        if (nodes.sweep || nodes.resonance) { ctx.beginPath(); ctx.moveTo(-14, -5); ctx.lineTo(-4, -5); ctx.moveTo(-14, 5); ctx.lineTo(-4, 5); ctx.stroke(); }
        if (nodes.rhythm) { ctx.strokeStyle = "#deebf0"; ctx.beginPath(); ctx.moveTo(-25, -3); ctx.lineTo(-18, -3); ctx.moveTo(-25, 3); ctx.lineTo(-18, 3); ctx.stroke(); }
        if (nodes.chill) circle(ctx, 4, 0, 3, "#9be5ff");
        if (nodes.overdrive) { circle(ctx, -8, -5, 2, "#e8cfff"); circle(ctx, -8, 5, 2, "#e8cfff"); }
        ctx.restore();
    }
    if (state.player.guarding > 0) {
        ctx.save(); ctx.strokeStyle = classFor(state).color; ctx.lineWidth = 3 + state.skillTree.guard.barrier * 0.8;
        const sides = state.heroClass === "warden" ? 4 : state.heroClass === "ranger" ? 8 : 6;
        ctx.beginPath();
        for (let i = 0; i <= sides; i++) {
            const angle = i * Math.PI * 2 / sides + Math.PI / 4;
            const x = state.player.x + Math.cos(angle) * 34, y = state.player.y + Math.sin(angle) * 34;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        if (state.skillTree.guard.duration > 0) { ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(state.player.x, state.player.y, 39 + state.skillTree.guard.duration * 2, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
    }
    const p = state.player;
    if (p.rolling > 0 && state.skillTree.dodge.agility > 0) {
        ctx.save(); ctx.strokeStyle = "#e1faff"; ctx.lineWidth = 1 + state.skillTree.dodge.agility;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius + 7, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    if (p.afterstep > 0) {
        ctx.save(); ctx.translate(p.x, p.y + 12); ctx.rotate(Math.atan2(p.vy || Math.sin(p.facing), p.vx || Math.cos(p.facing)));
        ctx.strokeStyle = "#99eaf4"; ctx.lineWidth = 2;
        for (const y of [-5, 5]) { ctx.beginPath(); ctx.moveTo(-12, y); ctx.lineTo(-30, y); ctx.stroke(); }
        ctx.restore();
    }
    if (p.flaskWard > 0) {
        ctx.save(); ctx.strokeStyle = "#8bbff5"; ctx.lineWidth = 3; ctx.setLineDash([7, 4]);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius + 17, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    if (p.renewal > 0) {
        ctx.save(); ctx.strokeStyle = "#9de8ad"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius + 11, reducedMotion.matches ? 0 : state.time, (reducedMotion.matches ? 0 : state.time) + Math.PI * 1.6); ctx.stroke();
        ctx.fillStyle = "#c6ffd0"; ctx.fillRect(p.x - 2, p.y - 36, 4, 12); ctx.fillRect(p.x - 6, p.y - 32, 12, 4); ctx.restore();
    }
    for (const [index, power] of POWER_UPS.entries()) {
        if (state.buffs[power.key] <= 0) continue;
        ctx.strokeStyle = power.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(state.player.x, state.player.y, 25 + index * 4, state.time + index, state.time + index + Math.PI * 1.5); ctx.stroke();
    }
    for (const item of state.effects) {
        const progress = reducedMotion.matches && item.kind !== "text" ? 0.65 : 1 - item.life / item.maxLife;
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
            ctx.strokeStyle = "#111921"; ctx.lineWidth = 3;
            ctx.strokeText(item.text, item.x, item.y - progress * 35);
            ctx.fillText(item.text, item.x, item.y - progress * 35);
        } else if (item.kind === "beam") {
            ctx.lineWidth = (item.width ?? 44) * (1 - progress) + 3;
            ctx.beginPath(); ctx.moveTo(item.x, item.y); ctx.lineTo(item.x + Math.cos(item.angle) * item.radius, item.y + Math.sin(item.angle) * item.radius); ctx.stroke();
            ctx.strokeStyle = "#fff0ba"; ctx.lineWidth = 3; ctx.stroke();
        } else if (item.kind === "heal") {
            const y = item.y - (reducedMotion.matches ? 0 : progress * 20);
            ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(item.x - item.radius / 2, y); ctx.lineTo(item.x + item.radius / 2, y);
            ctx.moveTo(item.x, y - item.radius / 2); ctx.lineTo(item.x, y + item.radius / 2); ctx.stroke();
            ctx.strokeStyle = "#edfff1"; ctx.lineWidth = 2; ctx.stroke();
        } else if (item.kind === "wind") {
            ctx.translate(item.x, item.y); ctx.rotate(item.angle); ctx.lineWidth = 2;
            for (const y of [-10, 0, 10]) {
                ctx.beginPath(); ctx.moveTo(5, y); ctx.quadraticCurveTo(-item.radius * 0.4, y - 5, -item.radius * (0.6 + progress * 0.4), y); ctx.stroke();
            }
        } else if (item.kind === "execute") {
            const r = item.radius * (0.6 + progress * 0.4);
            ctx.beginPath(); ctx.moveTo(item.x, item.y - r); ctx.lineTo(item.x + r, item.y); ctx.lineTo(item.x, item.y + r); ctx.lineTo(item.x - r, item.y); ctx.closePath(); ctx.stroke();
        } else if (item.kind === "frost" || item.kind === "sparks") {
            for (let i = 0; i < 6; i++) {
                const angle = i * Math.PI / 3, r = item.radius * (0.7 + progress * 0.3);
                ctx.beginPath(); ctx.moveTo(item.x, item.y);
                if (item.kind === "sparks") ctx.lineTo(item.x + Math.cos(angle + 0.3) * r * 0.5, item.y + Math.sin(angle + 0.3) * r * 0.5);
                ctx.lineTo(item.x + Math.cos(angle) * r, item.y + Math.sin(angle) * r); ctx.stroke();
            }
        } else if (["fire", "runes", "empower", "expand", "shield", "repulse"].includes(item.kind)) {
            const radius = item.radius * (0.6 + progress * 0.4);
            ctx.beginPath(); ctx.arc(item.x, item.y, radius, 0, Math.PI * 2); ctx.stroke();
            const count = item.kind === "empower" ? 4 + item.angle * 2 : 8;
            for (let i = 0; i < count; i++) {
                const angle = i * Math.PI * 2 / count + (reducedMotion.matches ? 0 : progress);
                const x = item.x + Math.cos(angle) * radius, y = item.y + Math.sin(angle) * radius;
                if (item.kind === "fire") {
                    ctx.beginPath(); ctx.moveTo(x - 5, y + 5); ctx.lineTo(x, y - 15 * (1 - progress)); ctx.lineTo(x + 5, y + 5); ctx.closePath(); ctx.fill();
                } else if (item.kind === "runes") ctx.strokeRect(x - 3, y - 3, 6, 6);
                else { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(angle) * 10, y + Math.sin(angle) * 10); ctx.stroke(); }
            }
        } else if (item.kind === "slash") {
            const arc = item.arc ?? 1.3;
            ctx.save();
            ctx.globalAlpha *= 0.16;
            ctx.beginPath(); ctx.moveTo(item.x, item.y);
            ctx.arc(item.x, item.y, item.radius * (0.6 + progress * 0.4), item.angle - arc, item.angle + arc); ctx.closePath(); ctx.fill();
            ctx.restore();
            ctx.lineWidth = 15 * (1 - progress);
            ctx.beginPath();
            ctx.arc(item.x, item.y, item.radius * (0.6 + progress * 0.4), item.angle - arc, item.angle + arc);
            ctx.stroke();
            ctx.strokeStyle = "#fff1c9"; ctx.lineWidth = Math.max(1, 3 * (1 - progress)); ctx.stroke();
        } else {
            ctx.save();
            ctx.globalAlpha *= 0.2;
            ctx.lineWidth = 16 * (1 - progress) + 2;
            ctx.beginPath(); ctx.arc(item.x, item.y, Math.max(1, item.radius * progress), 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
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
    vignette.addColorStop(1, "#03090d70");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (const bolt of state.projectiles) {
        ctx.save();
        const speed = Math.hypot(bolt.vx, bolt.vy) || 1;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(bolt.x - bolt.vx / speed * 30, bolt.y - bolt.vy / speed * 30); ctx.lineTo(bolt.x, bolt.y);
        ctx.strokeStyle = "#100c1b"; ctx.lineWidth = 10; ctx.stroke();
        ctx.strokeStyle = "#ff527a"; ctx.lineWidth = 5; ctx.stroke();
        circle(ctx, bolt.x, bolt.y, 13, "#ff3d7044");
        circle(ctx, bolt.x, bolt.y, 9, "#140c1e");
        circle(ctx, bolt.x, bolt.y, 7, "#ff466d");
        circle(ctx, bolt.x, bolt.y, 3.5, "#fff5fc");
        ctx.strokeStyle = "#ffe1ec"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(bolt.x, bolt.y, 7, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    }
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
        ctx.fillStyle = "#f0c08b88"; ctx.fillRect(WIDTH / 2 - 180, 61, 360 * boss.health / boss.maxHealth, 2);
        ctx.strokeStyle = map.accent; ctx.lineWidth = 1; ctx.strokeRect(WIDTH / 2 - 184, 57, 368, 16);
        for (const side of [-1, 1]) {
            ctx.save(); ctx.translate(WIDTH / 2 + side * 190, 65); ctx.rotate(Math.PI / 4);
            ctx.fillStyle = map.accent; ctx.fillRect(-3, -3, 6, 6); ctx.restore();
        }
    }
}

function drawCountdown(ctx, state) {
    if (state.resumeDelay <= 0 || state.status !== "playing") return;
    ctx.save();
    ctx.fillStyle = `rgba(5, 12, 17, ${reducedMotion.matches ? 0.85 : 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, state.resumeDelay / 3))})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.textAlign = "center"; ctx.fillStyle = "#f5dbab"; ctx.font = "28px Georgia, serif";
    ctx.fillText(state.travelPending ? `Traveling to ${mapForWave(state.wave + 1).name}` : "Find your footing", WIDTH / 2, HEIGHT / 2 - 55);
    ctx.font = "bold 70px Georgia, serif"; ctx.fillText(String(Math.ceil(state.resumeDelay)), WIDTH / 2, HEIGHT / 2 + 25);
    ctx.font = "16px 'Segoe UI', sans-serif"; ctx.fillText("Combat is frozen · P to pause", WIDTH / 2, HEIGHT / 2 + 70);
    ctx.restore();
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
    const difficultySelect = root.querySelector("[data-difficulty]");
    const classSelect = root.querySelector("[data-hero-class]");
    const classPreview = root.querySelector("[data-class-preview]");
    const setup = root.querySelector("[data-setup]");
    const setupNext = root.querySelector("[data-setup-next]");
    const setupSkip = root.querySelector("[data-setup-skip]");
    const setupCancel = root.querySelector("[data-setup-cancel]");
    const masteryPanel = root.querySelector("[data-mastery]");
    const masteryButtons = [...root.querySelectorAll("[data-mastery-stat]")];
    const forgeNudge = root.querySelector("[data-forge-nudge]");
    let setupAction = null;
    let setupStep = 0;
    const combatView = root.querySelector("[data-combat-view]");
    const viewport = root.querySelector(".arena-viewport");
    const focusViewButton = root.querySelector("[data-focus-view]");
    const recenterButton = root.querySelector("[data-recenter]");
    const combatPause = root.querySelector("[data-combat-pause]");
    const healthWarning = root.querySelector("[data-health-warning]");
    const skillButtons = [...root.querySelectorAll("[data-skill]")];
    const launchEndless = root.querySelector("[data-launch-endless]");
    const openSkills = root.querySelector("[data-open-skills]");
    const loadoutSelects = [...root.querySelectorAll("[data-loadout-slot]")];
    const treeButtons = [...root.querySelectorAll("[data-learn-skill]")];
    const setupLoadoutPanel = root.querySelector("[data-setup-loadout]");
    const setupSlots = [...root.querySelectorAll("[data-setup-slot]")];
    const skillUnlockNotice = root.querySelector("[data-skill-unlock]");
    const skillFeedback = root.querySelector("[data-skill-feedback]");
    const patchNotice = root.querySelector("[data-patch-notice]");
    const patchPreference = `path-of-boredom.patch-003:${root.dataset.player || "unknown"}`;
    try { patchNotice.hidden = localStorage.getItem(patchPreference) === "seen"; } catch { /* Announcements work without storage. */ }
    on(root.querySelector("[data-dismiss-patch]"), "click", () => {
        patchNotice.hidden = true;
        try { localStorage.setItem(patchPreference, "seen"); } catch { /* Dismissal persistence is optional. */ }
    });
    const viewPreference = "path-of-boredom.focus-view";
    let focusView = true;
    let layoutFrame = 0;
    let alignArena = false;
    try { focusView = localStorage.getItem(viewPreference) !== "off"; } catch { /* View preferences are optional. */ }
    function updateCanvasResolution() {
        const scale = Math.max(1, Math.min(2, canvas.getBoundingClientRect().width / WIDTH * (window.devicePixelRatio || 1)));
        const width = Math.round(WIDTH * scale), height = Math.round(HEIGHT * scale);
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
    }
    function fitArena() {
        root.classList.toggle("focus-view", focusView);
        focusViewButton.setAttribute("aria-pressed", String(focusView));
        focusViewButton.textContent = focusView ? "Focus view: On" : "Focus view: Off";
        if (!focusView) { viewport.style.maxWidth = ""; updateCanvasResolution(); return; }
        const screenHeight = window.visualViewport?.height ?? document.documentElement.clientHeight;
        const controlsHeight = combatView.getBoundingClientRect().height - viewport.getBoundingClientRect().height;
        const availableHeight = Math.max(180, screenHeight - controlsHeight - 16);
        const width = `${Math.floor(Math.min(combatView.clientWidth, availableHeight * WIDTH / HEIGHT))}px`;
        if (viewport.style.maxWidth !== width) viewport.style.maxWidth = width;
        updateCanvasResolution();
    }
    function reveal(element, smooth = false) {
        const box = element.getBoundingClientRect();
        const height = window.visualViewport?.height ?? document.documentElement.clientHeight;
        const top = (window.visualViewport?.offsetTop ?? 0) + 8;
        const bottom = top + height - 16;
        const delta = box.height > height - 16 || box.top < top ? box.top - top : box.bottom > bottom ? box.bottom - bottom : 0;
        if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: smooth && !reducedMotion.matches ? "smooth" : "instant" });
    }
    function scheduleArenaLayout(align = false) {
        alignArena ||= align;
        if (layoutFrame || disposed) return;
        layoutFrame = requestAnimationFrame(() => {
            layoutFrame = 0;
            if (disposed) return;
            fitArena();
            if (alignArena) reveal(focusView && !setupAction ? combatView : viewport);
            alignArena = false;
        });
    }
    on(focusViewButton, "click", () => {
        focusView = !focusView;
        try { localStorage.setItem(viewPreference, focusView ? "on" : "off"); } catch { /* View preferences are optional. */ }
        scheduleArenaLayout(true);
        if (state.status === "playing") canvas.focus({ preventScroll: true });
    });
    on(recenterButton, "click", () => {
        scheduleArenaLayout(true);
        if (state.status === "playing") canvas.focus({ preventScroll: true });
    });
    on(combatPause, "click", pause);
    on(combatView, "wheel", event => {
        if (state.status === "playing" && !setupAction && document.activeElement === canvas && !event.ctrlKey && !event.metaKey) event.preventDefault();
    }, { passive: false });
    on(window, "resize", () => scheduleArenaLayout());
    if (window.visualViewport) on(window.visualViewport, "resize", () => scheduleArenaLayout());
    const tutorial = [
        { title: "Move, aim, strike", text: "Move with WASD or arrows. Aim with the mouse; J or left click is your regular attack, always available without a slot. Q casts your selected manual skill. Configure one manual and two auto combat-skill slots through Skills & loadout. Auto skills have 60% longer cooldowns." },
        { title: "Read danger before it strikes", text: "Space dodges and E drinks a flask. Both are manual-only and always available without a slot. Leave marked melee arcs and violet mortar circles, step out of amber Lancer lanes, and avoid bright pink-white enemy projectiles. Carry up to 5 flasks; level-ups do not refill them." },
        { title: "Spend gold to survive", text: "Select Forge to pause and buy weapon, armor, or skill ranks. Scrolls are rare: do not wait for drops. Max every forge item to unlock uncapped stat training from 1,000 gold. Level-ups offer a card; checkpoints autosave. Your difficulty stays locked through all campaign stages." }
    ];
    const rankingStatus = root.querySelector("[data-ranking-status]");
    const pendingScores = new Map();
    const reportedScores = new Map();
    let reporting = false;
    let lastScoreAttempt = 0;
    async function reportScore() {
        if (!saveBridge || disposed) return;
        if (state.status !== "ready" && state.rankingMode !== "legacy" && Object.hasOwn(DIFFICULTIES, state.difficulty)) {
            const key = `${state.difficulty}:${state.rankingMode}:${state.heroClass}`;
            const score = state.kills - state.scoreBaseline;
            if (score > (reportedScores.get(key) ?? -1)) {
                const previous = pendingScores.get(key);
                if (!previous || score > previous.score) {
                    pendingScores.set(key, { difficulty: state.difficulty, mode: state.rankingMode, score, heroClass: state.heroClass, build: captureRankingBuild(state) });
                }
            }
        }
        if (reporting || !pendingScores.size) return;
        reporting = true;
        lastScoreAttempt = performance.now();
        try {
            for (const [key, submission] of pendingScores) {
                const success = await saveBridge.invokeMethodAsync("SubmitScore", submission);
                if (disposed) return;
                if (!success) throw new Error("Rankings unavailable");
                reportedScores.set(key, Math.max(submission.score, reportedScores.get(key) ?? 0));
                if (pendingScores.get(key) === submission) pendingScores.delete(key);
            }
            rankingStatus.textContent = "Class best synced with its upgrades. Rankings are separated by class, difficulty, and starting mode.";
        } catch {
            if (!disposed) rankingStatus.textContent = "Score sync failed. Keep this page open; it will retry automatically.";
        } finally { reporting = false; }
    }
    try {
        const stored = Number(localStorage.getItem(bestKey));
        if (Number.isFinite(stored) && stored >= 0) best = Math.floor(stored);
    } catch {
        // Storage is optional; private browsing can disable it.
    }
    const text = (name, value) => {
        const next = String(value);
        if (stats[name] && stats[name].textContent !== next) stats[name].textContent = next;
        if (stats[name] && (name === "objective" || name === "buffs") && stats[name].title !== next) stats[name].title = next;
    };
    function clearInput() {
        keys.clear();
        pointers.clear();
        aim = null;
    }
    function updateClassPreview() {
        const hero = HERO_CLASSES[classSelect.value];
        classPreview.querySelector("[data-class-title]").textContent = hero.name;
        classPreview.querySelector("[data-class-description]").textContent = hero.description;
        classPreview.querySelector("[data-class-stats]").textContent = `${hero.health} health · ${hero.damage} damage · ${hero.speed} speed · ${hero.armor}% innate armor`;
        classPreview.querySelector("[data-class-skills]").textContent = `${hero.attackName}: ${hero.attackCooldown}s, ${hero.attackReach} range · ${hero.specialName}: ${hero.specialCooldown}s · Dodge: ${hero.dodgeCooldown}s`;
    }
    on(classSelect, "change", updateClassPreview);
    function updateDifficultyDescription() {
        root.querySelector("[data-difficulty-description]").textContent = DIFFICULTIES[difficultySelect.value].description;
    }
    on(difficultySelect, "change", updateDifficultyDescription);
    function setupPreview() {
        return setupAction === "continue" ? state : { ...state, heroClass: classSelect.value,
            rankingMode: setupAction === "endless" ? "endless" : "campaign", wave: setupAction === "endless" ? LAST_WAVE + 1 : 0 };
    }
    function readSetupLoadout() {
        return { manual: setupSlots[0].value, auto: setupSlots.slice(1).map(select => select.value) };
    }
    function updateSetupLoadout() {
        const preview = setupPreview();
        for (const option of root.querySelectorAll("[data-setup-skill]")) {
            const key = option.dataset.setupSkill;
            option.disabled = !skillUnlocked(preview, key);
            option.textContent = `${skillName(preview, key)}${option.disabled ? " — Locked" : ""}`;
        }
        root.querySelector("[data-setup-unlock]").textContent = skillUnlocked(preview, "guard")
            ? `${skillName(preview, "guard")} is unlocked and available to slot.`
            : `${skillName(preview, "guard")}: ${wardUnlockHint(preview)}. You will be reminded to slot it when it unlocks.`;
        const loadout = readSetupLoadout();
        const valid = validLoadout(preview, loadout.manual, loadout.auto);
        setupNext.disabled = saving || !valid;
        root.querySelector("[data-setup-loadout-feedback]").textContent = valid
            ? "Confirm your slots to begin. J / click attacks, Space dodges, E heals. Q casts your manual skill; auto skills have 60% longer cooldowns. Empty auto slots are allowed."
            : "Choose an unlocked skill for Q. Each skill can appear in only one slot; use Empty to free an auto slot.";
    }
    for (const select of setupSlots) on(select, "change", () => {
        if (select === setupSlots[0]) {
            for (const auto of setupSlots.slice(1)) if (auto.value === select.value) auto.value = "none";
        }
        updateSetupLoadout();
    });
    function showSetupStep() {
        const choosingDifficulty = setupStep === 0;
        const choosingLoadout = setupStep === tutorial.length + 1;
        root.querySelector("[data-class-picker]").hidden = !choosingDifficulty || setupAction === "continue";
        classPreview.hidden = !choosingDifficulty;
        classSelect.disabled = !choosingDifficulty || setupAction === "continue";
        updateClassPreview();
        updateDifficultyDescription();
        root.querySelector("[data-setup-step]").textContent = choosingDifficulty ? "PREPARE YOUR JOURNEY" : choosingLoadout ? "SLOT YOUR SKILLS" : `QUICK GUIDE ${setupStep} / ${tutorial.length}`;
        root.querySelector("[data-setup-title]").textContent = choosingDifficulty ? "Choose your challenge" : choosingLoadout ? "Choose your starting loadout" : tutorial[setupStep - 1].title;
        root.querySelector("[data-setup-description]").textContent = choosingDifficulty
            ? setupAction === "continue" ? "Keep your character and choose your Endless difficulty. Endless kills start a new score on the campaign-equipped board. Your campaign record is kept."
                : "Choose once for this new run. Stage transitions never change your difficulty. Starting replaces the current character; Cancel keeps it. Higher tiers strengthen enemies and reduce healing."
            : choosingLoadout ? "Choose which combat skill you want on Q and which should cast automatically. Your regular attack, dodge, and flask never need slots. You can change slots later while paused." : tutorial[setupStep - 1].text;
        if (setupStep === 1) {
            const hero = HERO_CLASSES[classSelect.value];
            root.querySelector("[data-setup-description]").textContent = `Move with WASD or arrows. J or left click always uses ${hero.attackName}; Q uses your manual skill (initially ${hero.specialName}). Space dodges; E drinks a flask. Only special, burst, and ward skills use slots. Open Skills & loadout to configure them or upgrade your attack and abilities. ${hero.description}`;
        }
        root.querySelector("[data-setup-difficulty]").hidden = !choosingDifficulty;
        difficultySelect.disabled = !choosingDifficulty;
        setupSkip.hidden = choosingDifficulty || choosingLoadout;
        setupLoadoutPanel.hidden = !choosingLoadout;
        setupNext.textContent = choosingLoadout ? setupAction === "campaign" ? "Confirm slots & begin" : "Confirm slots & enter Endless" : "Next";
        setupNext.disabled = saving;
        if (choosingLoadout) updateSetupLoadout();
        (choosingDifficulty ? difficultySelect : choosingLoadout ? setupSlots[0] : setupNext).focus({ preventScroll: true });
    }
    function openSetup(action) {
        if (saving || setupAction || state.status === "choosing") return;
        if (state.status === "playing") togglePause(state);
        clearInput();
        setupAction = action;
        setupStep = 0;
        difficultySelect.value = Object.hasOwn(DIFFICULTIES, state.difficulty) ? state.difficulty : "hard";
        classSelect.value = state.heroClass;
        const loadout = action === "continue" ? state.loadout : { manual: "nova", auto: ["burst", "none"] };
        setupSlots[0].value = loadout.manual;
        setupSlots.slice(1).forEach((select, index) => { select.value = loadout.auto[index]; });
        setup.hidden = false;
        updateHud();
        showSetupStep();
        scheduleArenaLayout(true);
    }
    function finishSetup() {
        if (!setupAction || saving || setupStep !== tutorial.length + 1) return;
        const loadout = readSetupLoadout();
        if (!validLoadout(setupPreview(), loadout.manual, loadout.auto)) return;
        void reportScore();
        if (setupAction === "continue") {
            if (!setLoadout(state, loadout.manual, loadout.auto)) return;
            if (!enterEndless(state, difficultySelect.value)) return;
        } else {
            state = setupAction === "endless" ? startEndlessRun(Math.random, difficultySelect.value, classSelect.value) : startRun(Math.random, difficultySelect.value, classSelect.value);
            state.loadout = loadout;
        }
        setupAction = null;
        setup.hidden = true;
        checkpointHandled = null;
        clearInput();
        last = performance.now();
        updateHud();
        canvas.focus({ preventScroll: true });
    }
    function cancelSetup() {
        setupAction = null;
        setup.hidden = true;
        updateHud();
        (state.status === "won" ? endlessButton : startButton).focus({ preventScroll: true });
    }
    on(setupNext, "click", () => {
        if (setupStep === tutorial.length + 1) finishSetup();
        else { setupStep = setupAction === "continue" ? tutorial.length + 1 : setupStep + 1; showSetupStep(); }
    });
    on(setupSkip, "click", () => { setupStep = tutorial.length + 1; showSetupStep(); });
    on(setupCancel, "click", cancelSetup);
    on(setup, "keydown", event => {
        if (event.key === "Escape") { event.preventDefault(); cancelSetup(); }
        if (event.key !== "Tab") return;
        const controls = [...setup.querySelectorAll("button, select")].filter(element => !element.disabled && element.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    function updateHud() {
        const p = state.player;
        const map = mapForWave(state.wave);
        const hero = classFor(state);
        const ranged = state.heroClass === "ranger";
        text("hero-class", hero.name);
        text("hero-role", hero.role);
        text("class-speed", Math.round(movementSpeed(state)));
        text("critical-chance", `${(criticalChance(state) * 100).toFixed(1)}%`);
        text("critical-damage", `${Math.round(criticalDamage(state) * 100)}%`);
        text("attack-reach", Math.round(skillReach(state, "attack")));
        text("special-reach", Math.round(skillReach(state, "nova")));
        text("class-armor", `${hero.armor}%`);
        text("class-attack", `${hero.attackCooldown}s`);
        text("class-dodge", `${hero.dodgeCooldown}s`);
        text("attack-name", hero.attackName);
        text("special-name", hero.specialName);
        text("class-icon", ranged ? "➶" : state.heroClass === "warden" ? "⬟" : "⚔");
        text("forge-attack", `${hero.attackName}: damage, ${ranged ? "range" : "reach"}, speed`);
        text("forge-special", `${hero.specialName}: damage, ${ranged ? "range" : "radius"}, recovery`);
        text("forge-burst", `${skillName(state, "burst")}: damage, range, recovery`);
        text("forge-guard", `${skillName(state, "guard")}: damage, radius, protection, recovery`);
        for (const element of root.querySelectorAll("[data-skill-name]")) {
            const name = skillName(state, element.dataset.skillName) + (element.tagName === "OPTION" && !skillUnlocked(state, element.dataset.skillName) ? " — Locked" : "");
            if (element.textContent !== name) element.textContent = name;
        }
        const extra = EXTRA_SKILLS[state.heroClass];
        const descriptions = {
            attack: `${hero.attackCooldown}s base cooldown. Regular attack: always available on J / left click, no slot required. Upgrades remain active.`,
            nova: `${hero.specialCooldown}s base cooldown. ${ranged ? "Five-arrow fan; each arrow hits once." : "A damaging pulse around you."}`,
            burst: `${extra.burst.cooldown}s base cooldown. ${extra.burst.shape === "beam" ? "A narrow lance strikes every enemy along its line." : extra.burst.shape === "arrows" ? "Seven shield-piercing arrows; each hits once." : "A heavy cone crushes enemies ahead."}`,
            guard: `${extra.guard.cooldown}s base cooldown. A damaging ward pulse grants 40% damage reduction for at least 3s.`,
            dodge: "Directional evasion on Space. Always available without a slot; manual-only.",
            potion: "Press E to consume one flask and heal. Always available without a slot; manual-only."
        };
        for (const element of root.querySelectorAll("[data-skill-description]")) {
            const value = descriptions[element.dataset.skillDescription];
            if (element.textContent !== value) element.textContent = value;
        }
        classSelect.disabled = saving || !setupAction || setupStep !== 0 || setupAction === "continue";
        const critical = state.status === "playing" && state.resumeDelay === 0 && p.health > 0 && p.health <= p.maxHealth * 0.25;
        viewport.classList.toggle("low-health", critical);
        const warning = critical ? p.potions > 0 ? "LOW HEALTH — E or Life flask to heal" : "LOW HEALTH — no flasks left; evade and seek a pickup" : "";
        if (healthWarning.textContent !== warning) healthWarning.textContent = warning;
        for (const button of skillButtons) {
            const skill = button.dataset.skill;
            const manual = !SLOTTABLE_SKILLS.includes(skill) || state.loadout.manual === skill;
            const automatic = state.loadout.auto.includes(skill);
            const locked = !skillUnlocked(state, skill);
            const unavailable = locked || state.status !== "playing" || state.resumeDelay > 0 || !!setupAction || saving;
            const cannotHeal = skill === "potion" && (p.potions === 0 || p.health >= p.maxHealth);
            button.disabled = unavailable || cannotHeal || !manual;
            button.classList.toggle("skill-auto", automatic);
            const slotLabel = locked ? "STAGE 3" : skill === "attack" ? "J / CLICK" : skill === "dodge" ? "SPACE" : skill === "potion" ? "E" : manual ? "Q" : automatic ? "AUTO ×1.6" : "UNSLOTTED";
            if (button.querySelector("[data-slot-label]").textContent !== slotLabel) button.querySelector("[data-slot-label]").textContent = slotLabel;
            button.classList.toggle("skill-cooling", p[skill] > 0);
            button.title = locked ? wardUnlockHint(state) : !manual ? automatic ? "Automatic casting: 60% longer cooldown" : "Assign a slot in Skills & loadout" : unavailable ? "Combat is paused or counting down" : cannotHeal ? p.potions === 0 ? "No flask charges left" : "Health is already full"
                : p[skill] > 0 ? `Recovering: ${p[skill].toFixed(1)}s` : "Ready";
        }
        text("score", state.kills - state.scoreBaseline);
        text("difficulty", state.rankingMode === "legacy" ? "LEGACY · UNRANKED" : DIFFICULTIES[state.difficulty].name.toUpperCase());
        difficultySelect.disabled = saving || !setupAction || setupStep !== 0;
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
        for (const skill of SKILL_KEYS) text(skill, !skillUnlocked(state, skill) ? "Locked" : skill === "potion" ? `${p.potions}/${MAX_FLASKS} · ${p.potion > 0 ? `${p.potion.toFixed(1)}s` : "Ready"}` : p[skill] > 0 ? `${p[skill].toFixed(1)}s` : "Ready");
        text("objective", state.status === "ready" ? `Survive ${LAST_WAVE} waves across ${MAPS.length} lands.`
            : state.status === "won" ? "Dawn restored. The Endless Watch is unlocked."
            : state.status === "camp" ? "Checkpoint reached. Rest and forge before continuing."
            : state.status === "choosing" ? `Level up! Choose a lasting boon (${state.pendingChoices} choice${state.pendingChoices === 1 ? "" : "s"} remaining).`
            : state.status === "dead" ? "Your ember has faded."
            : state.status === "paused" ? "Rest a moment, Ashbound."
            : state.resumeDelay > 0 ? `Get ready — ${Math.ceil(state.resumeDelay)}`
            : state.enemies.length ? `${state.enemies.length} enemies remain / Collect fallen relics`
            : `Gather your loot / Next wave in ${Math.ceil(state.intermission)}s`);
        healthMeter.max = p.maxHealth;
        healthMeter.value = p.health;
        xpMeter.max = p.nextLevel;
        xpMeter.value = p.xp;
        const choosing = state.status === "choosing";
        const draftClosing = (draftVisible || draft.classList.contains("level-draft-exit")) && !choosing;
        overlay.hidden = !!setupAction || state.status === "playing" && !draftClosing;
        const active = ["playing", "paused", "camp", "won", "choosing"].includes(state.status);
        const canForge = !setupAction && ["paused", "camp", "won"].includes(state.status);
        const wardUnlocked = skillUnlocked(state, "guard");
        const remindWard = wardUnlocked && !state.wardUnlockSeen;
        text("ward-unlock-status", wardUnlocked ? `${skillName(state, "guard")} unlocked — choose Q or an auto slot to equip it.` : `${skillName(state, "guard")}: ${wardUnlockHint(state)}.`);
        text("skill-unlock-hint", `${skillName(state, "guard")} unlocked! Slot your new skill.`);
        skillUnlockNotice.hidden = !remindWard || state.status !== "playing" || state.resumeDelay > 0 || draftClosing || !!setupAction;
        for (const button of root.querySelectorAll("[data-resume-combat]")) {
            button.disabled = saving || !!setupAction || !["paused", "camp"].includes(state.status);
            button.textContent = state.status === "camp" ? "Travel to next stage" : "Return to battle";
        }
        openSkills.disabled = saving || !!setupAction || !active || choosing;
        text("skill-points", `${skillPointsLeft(state)} points available · ${skillPointsEarned(state)}/${MAX_SKILL_POINTS} earned`);
        openSkills.classList.toggle("forge-available", active && (skillPointsLeft(state) > 0 || remindWard));
        for (const select of loadoutSelects) {
            const slot = Number(select.dataset.loadoutSlot);
            const value = slot === 0 ? state.loadout.manual : state.loadout.auto[slot - 1];
            if (select.value !== value) select.value = value;
            select.disabled = saving || !canForge;
            for (const option of select.options) option.disabled = !skillUnlocked(state, option.value);
        }
        for (const button of treeButtons) {
            const skill = button.dataset.learnSkill, node = treeNodeKey(skill, button.dataset.treeSlot);
            button.dataset.treeNode = node;
            const definition = treeNodeDefinition(state, skill, node);
            button.dataset.nodeVisual = definition.visual;
            const rank = state.skillTree[skill][node];
            const available = !saving && !setupAction && canLearnSkill(state, skill, node);
            button.querySelector("[data-tree-name]").textContent = definition.name;
            button.querySelector("[data-tree-icon]").textContent = definition.icon;
            button.parentElement.querySelector("[data-tree-detail]").textContent = definition.detail;
            button.parentElement.querySelector("[data-tree-status]").textContent = saving ? "Saving…" : treeNodeStatus(state, skill, node);
            button.querySelector("[data-tree-rank]").textContent = `${rank}/${definition.max}`;
            button.setAttribute("aria-disabled", String(!available));
            button.setAttribute("aria-label", `${skillName(state, skill)}: ${definition.name}, rank ${rank} of ${definition.max}`);
            button.classList.toggle("learned", rank > 0);
            button.classList.toggle("available", available);
        }
        for (const tree of root.querySelectorAll("[data-tree-skill]")) {
            const skill = tree.dataset.treeSkill, nodes = state.skillTree[skill];
            tree.classList.toggle("tree-locked", !skillUnlocked(state, skill));
            for (const link of tree.querySelectorAll("[data-tree-link]")) {
                const [from, to] = link.dataset.treeLink.split("-").map(slot => treeNodeKey(skill, slot));
                link.classList.toggle("learned", nodes[from] > 0 && nodes[to] > 0);
                link.classList.toggle("available", skillUnlocked(state, skill) && nodes[from] > 0);
            }
        }
        pauseButton.disabled = saving || !!setupAction || !["playing", "paused"].includes(state.status);
        combatPause.disabled = pauseButton.disabled;
        combatPause.textContent = state.status === "paused" ? "Resume" : "Pause";
        focusViewButton.disabled = !!setupAction;
        recenterButton.disabled = !!setupAction;
        startButton.disabled = saving || choosing || !!setupAction;
        restartButton.disabled = saving || choosing || !!setupAction;
        endlessButton.disabled = saving || checkingUnlock || choosing || !!setupAction;
        endlessButton.hidden = choosing || !(endlessUnlocked || state.status === "won") || (state.mode === "endless" && state.status !== "dead") || state.status === "playing";
        endlessButton.textContent = state.status === "won" ? "Continue into the Endless Watch" : "New Endless Watch run";
        launchEndless.disabled = endlessButton.disabled || !(endlessUnlocked || state.campaignComplete === 1);
        launchEndless.textContent = checkingUnlock ? "Checking Endless…" : state.status === "won" ? "Continue Endless" : endlessUnlocked || state.campaignComplete === 1 ? "New Endless run" : "Endless (locked)";
        launchEndless.title = state.status === "won" ? "Continue this campaign character into Endless" : "Unlocked profiles can start a new veteran Endless character here. To keep a completed campaign character, load its victory save first.";
        forgeButton.disabled = saving || !active || choosing || !!setupAction;
        const completedForge = forgeComplete(state);
        const cheapestTraining = Math.min(...Object.keys(MASTERY).map(key => masteryCost(state, key)));
        const affordable = completedForge ? state.gold >= cheapestTraining
            : Object.entries(UPGRADES).some(([key, upgrade]) => skillUnlocked(state, key) && state.upgrades[key] < upgrade.max && state.gold >= upgradeCost(state, key));
        forgeNudge.hidden = state.status !== "playing" || state.resumeDelay > 0 || draftClosing || !!setupAction || !affordable || !skillUnlockNotice.hidden;
        forgeButton.classList.toggle("forge-available", active && !choosing && !setupAction && affordable);
        root.querySelector("[data-open-forge]").disabled = forgeButton.disabled;
        text("forge-hint", completedForge ? `Stat training from ${cheapestTraining.toLocaleString()} gold.` : "Forge upgrade available!");
        masteryPanel.hidden = !completedForge;
        for (const button of masteryButtons) {
            const key = button.dataset.masteryStat;
            const cost = masteryCost(state, key);
            button.querySelector("[data-mastery-label]").textContent = `Rank ${state.mastery[key]} / ${cost.toLocaleString()} gold`;
            button.disabled = saving || !canForge || !completedForge || state.gold < cost || !Number.isFinite(cost);
            button.title = MASTERY[key].detail;
        }
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
        runMenu.hidden = choosing || draftClosing || !!setupAction;
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
                    button.querySelector("[data-card-description]").textContent = key === "cleave"
                        ? `+6 ${hero.attackName} ${ranged ? "arrow range" : "reach"} per rank, up to +60.`
                        : key === "nova" ? `+10 ${hero.specialName} ${ranged ? "arrow range" : "radius"} per rank, up to +100.` : card.description;
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
            button.title = key === "cleave" ? `Improves ${hero.attackName}: damage, range and attack speed.`
                : key === "nova" ? `Improves ${hero.specialName}: damage, range and recovery.` : UPGRADES[key].detail;
            button.disabled = saving || !canForge || !skillUnlocked(state, key) || rank >= max || state.gold < cost;
            if (!skillUnlocked(state, key)) button.title = wardUnlockHint(state);
        }
        if (saveButton) saveButton.disabled = saving || checkingUnlock || !saveBridge || !active || !!setupAction;
        if (loadButton) loadButton.disabled = saving || checkingUnlock || !saveBridge || !!setupAction;
        pauseButton.firstChild.textContent = state.status === "paused" ? "Resume " : "Pause ";
        if (state.status !== shownStatus) {
            if (state.status === "playing" && shownStatus !== "choosing") scheduleArenaLayout(true);
            if (["paused", "camp", "won", "dead"].includes(state.status)) void reportScore();
            shownStatus = state.status;
            overlay.hidden = !!setupAction || state.status === "playing" && !draftClosing;
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
                if (!setupAction) (won ? endlessButton : startButton).focus({ preventScroll: true });
            }
        }
    }
    function pause() {
        if (saving || setupAction) return;
        togglePause(state);
        clearInput();
        updateHud();
        if (state.status === "playing") canvas.focus({ preventScroll: true });
    }
    function begin() {
        if (saving || setupAction || state.status === "choosing") return;
        if (state.status === "paused") togglePause(state);
        else if (state.status === "camp") continueJourney(state);
        else {
            openSetup("campaign");
            return;
        }
        clearInput();
        last = performance.now();
        updateHud();
        canvas.focus({ preventScroll: true });
    }
    on(startButton, "click", begin);
    on(pauseButton, "click", pause);
    on(endlessButton, "click", () => {
        if (saving || checkingUnlock || setupAction || state.status === "choosing" || !(endlessUnlocked || state.campaignComplete === 1)) return;
        openSetup(state.status === "won" ? "continue" : "endless");
    });
    on(launchEndless, "click", () => endlessButton.click());
    on(root.querySelector("[data-slot-unlocked]"), "click", () => openSkills.click());
    on(root.querySelector("[data-dismiss-unlock]"), "click", () => {
        if (saving || setupAction || !skillUnlocked(state, "guard")) return;
        state.wardUnlockSeen = 1;
        updateHud();
    });
    on(openSkills, "click", () => {
        if (openSkills.disabled) return;
        if (state.status === "playing") pause();
        alignArena = false;
        reveal(root.querySelector("[data-skills]"), true);
    });
    for (const select of loadoutSelects) on(select, "change", () => {
        const manual = loadoutSelects[0].value;
        const auto = loadoutSelects.slice(1).map(element => select === loadoutSelects[0] && element.value === manual ? "none" : element.value);
        if (saving || setupAction || !setLoadout(state, manual, auto)) {
            skillFeedback.textContent = "Each skill can occupy only one slot. Choose Empty to free an auto slot first.";
        } else {
            skillFeedback.textContent = "Loadout changed. Save to keep it, or continue to the next autosaved checkpoint.";
            if (["camp", "won"].includes(state.status)) void persist(false, true);
        }
        clearInput();
        updateHud();
    });
    let inspectedTreeNode = null;
    for (const button of treeButtons) {
        const node = button.parentElement;
        const showTooltip = () => node.classList.remove("tooltip-dismissed");
        on(button, "focus", showTooltip);
        on(node, "pointerenter", event => { if (event.pointerType !== "touch") showTooltip(); });
        on(button, "blur", () => {
            if (inspectedTreeNode === button) inspectedTreeNode = null;
            node.classList.remove("tooltip-inspected");
        });
        on(button, "click", event => {
            if ((event.pointerType === "touch" || event.sourceCapabilities?.firesTouchEvents) && inspectedTreeNode !== button) {
                button.focus({ preventScroll: true });
                inspectedTreeNode = button;
                node.classList.add("tooltip-inspected");
                showTooltip();
                return;
            }
            if (saving || setupAction || !learnSkill(state, button.dataset.learnSkill, button.dataset.treeNode)) return;
            node.classList.add("tooltip-dismissed");
            node.classList.remove("tooltip-inspected");
            inspectedTreeNode = null;
            skillFeedback.textContent = `${state.journal} Save or reach a checkpoint to keep this choice.`;
            updateHud();
            if (["camp", "won"].includes(state.status)) void persist(false, true);
        });
    }
    for (const button of root.querySelectorAll("[data-resume-combat]")) on(button, "click", begin);
    on(forgeButton, "click", () => {
        if (saving || setupAction || state.status === "choosing") return;
        if (state.status === "playing") pause();
        alignArena = false;
        reveal(root.querySelector("[data-forge]"), true);
    });
    on(root.querySelector("[data-open-forge]"), "click", () => forgeButton.click());
    for (const button of masteryButtons) on(button, "click", () => {
        if (saving || setupAction || !buyMastery(state, button.dataset.masteryStat)) return;
        forgeFeedback.textContent = state.journal;
        saveStatus.textContent = "Stat trained. Save to keep your progress.";
        updateHud();
        if (["camp", "won"].includes(state.status)) void persist(false, true);
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
    on(restartButton, "click", () => openSetup("campaign"));
    async function persist(loadingSave, automatic = false) {
        if (saving || checkingUnlock || setupAction) return;
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
                void reportScore();
                state = restored;
                difficultySelect.value = Object.hasOwn(DIFFICULTIES, state.difficulty) ? state.difficulty : "hard";
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
        if (setupAction || setup.contains(event.target)) return;
        if (event.target.closest?.("input, select, textarea")) return;
        if (!root.contains(document.activeElement) || event.ctrlKey || event.altKey || event.metaKey) return;
        if (state.status === "playing" && document.activeElement === canvas && ["PageUp", "PageDown", "Home", "End"].includes(event.code)) {
            event.preventDefault();
            return;
        }
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
            if (event.button !== 0 || state.status !== "playing" || button.disabled) return;
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
            aim, attack: held.has("attack"), manual: held.has("manual") || held.has(state.loadout.manual),
            dodge: held.has("dodge"), potion: held.has("potion")
        };
    }
    function animate(now) {
        if (disposed) return;
        if (!root.isConnected) { dispose(); return; }
        step(state, input(), last ? (now - last) / 1000 : 0);
        last = now;
        if (now - lastScoreAttempt >= 15000) {
            lastScoreAttempt = now;
            void reportScore();
        }
        if (["camp", "won"].includes(state.status) && !saving && !checkingUnlock && !setupAction && checkpointHandled !== `${state.mode}:${state.wave}`) {
            checkpointHandled = `${state.mode}:${state.wave}`;
            void persist(false, true);
        }
        render(ctx, floors[mapIndexForWave(state.wave)], state);
        drawCountdown(ctx, state);
        if (now - hudTime > 100 || state.status !== shownStatus) { updateHud(); hudTime = now; }
        frame = requestAnimationFrame(animate);
    }
    function dispose() {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(frame);
        cancelAnimationFrame(layoutFrame);
        resizeObserver.disconnect();
        controller.abort();
        observer.disconnect();
        clearInput();
    }
    const observer = new MutationObserver(() => { if (!root.isConnected) dispose(); });
    observer.observe(document.body, { childList: true, subtree: true });
    const resizeObserver = new ResizeObserver(() => scheduleArenaLayout());
    resizeObserver.observe(combatView);
    fitArena();
    loading.hidden = true;
    startButton.disabled = false;
    updateHud();
    frame = requestAnimationFrame(animate);
    void readUnlock();
    return { dispose };
}

// arpg.js — main runtime controller / entry point for the whole game.
//
// This is the module Home.razor imports and calls createGame(rootElement, saveBridge) on. It does
// NOT run the simulation itself (that's arpg-engine.js's job) — instead it owns everything around
// the simulation: the pause menu, the setup dialog (difficulty/class/loadout pickers), the skills &
// loadout panel, tooltips, the forge/upgrade UI, save/load button wiring (including retry-on-failure),
// and all keyboard/mouse input listeners. Think of it as the "UI shell + input + render loop driver"
// while arpg-engine.js is the "what actually happens each frame" logic.
//
// General shape of a frame: this file's render loop reads input state, calls arpg-engine.js's
// step() with it, gets back updated game state, then hands that state to arpg-graphics.js to draw.
// If you're chasing "why did my character take damage it shouldn't have", look in arpg-engine.js.
// If it's "why does it look wrong on screen", look in arpg-graphics.js. If it's "why doesn't this
// button/panel do anything", it's almost certainly wiring that's missing in this file.
import { WIDTH, HEIGHT, createState, startRun, startEndlessRun, step, togglePause, useSkill, weaponDamage, armorRating, upgradeCost, buyUpgrade, continueJourney, enterEndless, chooseLevelCard } from "./arpg-engine.js";
import { captureSnapshot, restoreSnapshot } from "./arpg-save.js";
import { captureRankingBuild, resetToReleaseRankings } from "./arpg-ranking.js";
import { upgradePreview } from "./arpg-upgrade-preview.js";
import { MAPS, LAST_WAVE, UPGRADES, POWER_UPS, threatForWave, mapForWave, mapIndexForWave, firePhase } from "./arpg-campaign.js";
import { LEVEL_CARDS } from "./arpg-cards.js";
import { DIFFICULTIES } from "./arpg-difficulty.js";
import { MASTERY, MAX_FLASKS, forgeComplete, masteryCost, buyMastery, chargeLaneEnd } from "./arpg-engine.js";
import { movementSpeed, criticalChance, criticalDamage, skillReach } from "./arpg-engine.js";
import { HERO_CLASSES, classFor } from "./arpg-classes.js";
import { ELITE_MODIFIERS } from "./arpg-modifiers.js";
import { treePointsSpent, treeRespecCost, canRespecTree, respecTree } from "./arpg-skills.js";
import { SKILL_KEYS, SLOTTABLE_SKILLS, EXTRA_SKILLS, NEW_SKILLS, MAX_SKILL_POINTS, skillName, skillPointsLeft, skillPointsEarned, canLearnSkill, learnSkill, setLoadout, skillUnlocked, skillSelected, skillCapacity, selectedSkills, needsSkillChoice, wardUnlockHint, validLoadout, treeNodeKey, treeNodeDefinition, treeNodeStatus } from "./arpg-skills.js";
import { drawHero, drawOrb, decorateFloor, drawAtmosphere, drawLootIcon } from "./arpg-graphics.js";
import { drawHud } from "./arpg-hud.js";

// Respects the OS/browser-level "prefers-reduced-motion" setting so screen shake and other purely
// cosmetic motion effects can be toggled off for players sensitive to it.
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// localStorage key for a purely client-side "best score" fallback/cache — separate from the
// server-authoritative rankings system, just used for a quick local display before rankings load.
const BEST_KEY = "path-of-boredom.best.v1";
// Maps physical keyboard keys to logical movement directions (WASD or arrow keys, either works).
const movementKeys = { KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right" };
// Maps physical keys to logical skill/action inputs (J = attack, Q = manual skill, Space = dodge, E = flask).
const skillKeys = { KeyJ: "attack", KeyQ: "manual", Space: "dodge", KeyE: "potion" };

// Pre-renders a map's background floor tile to an offscreen canvas once per map, rather than
// redrawing the (static) floor tint/decoration every single frame — a basic but effective perf win
// since the floor never changes mid-run for a given map.
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

// Tiny shorthand for filling a solid circle — used constantly throughout the per-kind enemy art below.
function circle(ctx, x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
}

// Draws one actor (the player or any enemy) at its current position: a soft ground shadow, a
// walk-cycle bob/lean (skipped entirely under reduced-motion), then a big per-kind if/else chain of
// hand-drawn shape art unique to that enemy kind (each kind's silhouette/colors are deliberately
// distinct so players can identify threats at a glance mid-fight), and finally shared overlays: a
// chill frost-ring, an elite modifier ring + label, and a health bar for damaged non-player actors.
// The player's own art is delegated to drawHero() in arpg-graphics.js instead of being inlined here.
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
        ctx.bezierCurveTo(20, -20, 22, 8, 7, 17);
        ctx.quadraticCurveTo(2, 8, 0, 10);
        ctx.quadraticCurveTo(-6, 23, -10, 19);
        ctx.bezierCurveTo(-24, 9, -20, -18, 0, -23 + Math.sin(time * 4) * 3);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        circle(ctx, -4, -3, 2, "#e9ffe8");
        circle(ctx, 4, -3, 2, "#e9ffe8");
    } else {
        const base = actor.flash > 0 ? "#fce5bf" : boss ? map.accent : actor.kind === "sentinel" ? "#8b6576" : actor.kind === "brute" ? "#787469" : "#747d6c";
        if (boss) {
            const mantle = ctx.createLinearGradient(-r, -r, r, r);
            mantle.addColorStop(0, "#896552"); mantle.addColorStop(1, "#292331");
            ctx.fillStyle = mantle; ctx.strokeStyle = "#d0ac7266"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-r * 0.65, -r);
            ctx.bezierCurveTo(-r * 1.4, -r * 0.4, -r * 1.2, r, -r * 0.8, r * 1.3);
            ctx.quadraticCurveTo(0, r, r * 0.8, r * 1.3);
            ctx.bezierCurveTo(r * 1.2, r, r * 1.4, -r * 0.4, r * 0.65, -r);
            ctx.closePath(); ctx.fill(); ctx.stroke();
        }
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
        const modifier = ELITE_MODIFIERS[actor.modifier ?? "none"];
        ctx.strokeStyle = modifier.color; ctx.lineWidth = actor.modifier === "armored" ? 4 : 2;
        ctx.beginPath(); ctx.arc(actor.x, actor.y, r + 6, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = modifier.color; ctx.font = "bold 10px 'Segoe UI', sans-serif"; ctx.textAlign = "center";
        ctx.fillText(`${modifier.icon} ${modifier.name.toUpperCase()}`, actor.x, actor.y - r - 26);
    }
    if (!hero && actor.health < actor.maxHealth) {
        ctx.fillStyle = "#070b0dc9";
        ctx.fillRect(actor.x - r, actor.y - r - 20, r * 2, 4);
        ctx.fillStyle = boss ? "#cf9b64" : "#b47360";
        ctx.fillRect(actor.x - r, actor.y - r - 20, r * 2 * Math.max(0, actor.health / actor.maxHealth), 4);
    }
}

// The main per-frame draw call: blits the pre-rendered floor, draws atmosphere effects, the map's
// environmental hazards (with a slow/warning/burning visual state driven by firePhase()), the four
// corner brazier lights, then loops enemies to draw attack-telegraph shapes/labels before actors and
// projectiles are drawn later in this function. Kept intentionally simple/flat (no z-sorting beyond
// draw order) since the arena is a flat top-down view.
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
        if (enemy.kind === "boss" && enemy.combat.rest > 0) {
            ctx.save(); ctx.fillStyle = "#9de8ad"; ctx.textAlign = "center"; ctx.font = "bold 11px 'Segoe UI', sans-serif";
            ctx.fillText("RECOVERING — ATTACK", enemy.x, enemy.y - enemy.radius - 30); ctx.restore();
        }
        if (enemy.winding <= 0) continue;
        if (enemy.kind === "boss") {
            ctx.save();
            const pattern = enemy.combat.pattern;
            const angle = Math.atan2(enemy.attackY - enemy.y, enemy.attackX - enemy.x);
            const color = pattern === 1 ? "#ff956f" : pattern === 2 ? "#ffdc86" : "#d6adff";
            ctx.strokeStyle = color; ctx.fillStyle = color + "33"; ctx.lineWidth = 3;
            if (pattern === 1) {
                ctx.beginPath(); ctx.arc(enemy.x, enemy.y, 135, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            } else if (pattern === 2) {
                ctx.beginPath(); ctx.moveTo(enemy.x, enemy.y); ctx.arc(enemy.x, enemy.y, 210, angle - 0.65, angle + 0.65); ctx.closePath(); ctx.fill(); ctx.stroke();
            } else {
                for (let i = 0; i < 8; i++) {
                    const ray = angle + i * Math.PI / 4;
                    ctx.beginPath(); ctx.moveTo(enemy.x + Math.cos(ray) * 40, enemy.y + Math.sin(ray) * 40);
                    ctx.lineTo(enemy.x + Math.cos(ray) * 150, enemy.y + Math.sin(ray) * 150); ctx.stroke();
                }
            }
            ctx.fillStyle = color; ctx.textAlign = "center"; ctx.font = "bold 11px 'Segoe UI', sans-serif";
            ctx.fillText(pattern === 1 ? "SLAM — MOVE OUT" : pattern === 2 ? "FAN — STEP ASIDE" : "RING — FIND A GAP", enemy.x, enemy.y - enemy.radius - 35);
            ctx.restore();
            continue;
        }
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
        const penetrating = shot.skill === "burst" || shot.skill === "nova" && nodes.ignition > 0;
        ctx.strokeStyle = penetrating ? "#d1ff95" : "#8fefbd";
        ctx.lineWidth = 2 + (nodes.edge ?? nodes.amplitude ?? nodes.focus ?? 0) * 0.6;
        if (penetrating) { ctx.beginPath(); ctx.moveTo(-28, 0); ctx.lineTo(-18, 0); ctx.moveTo(-5, -6); ctx.lineTo(2, 0); ctx.lineTo(-5, 6); ctx.stroke(); }
        if (shot.skill === "attack" && nodes.execution) { ctx.beginPath(); ctx.moveTo(-12, -8); ctx.lineTo(-5, -5); ctx.lineTo(-12, -2); ctx.stroke(); }
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

// Draws the pulsing full-screen "resumeDelay" countdown overlay shown briefly after unpausing or
// traveling to a new checkpoint/wave, during which combat is frozen (see step()'s early-return for
// state.resumeDelay > 0). Purely cosmetic — the actual freeze logic lives in arpg-engine.js.
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

// The module's single export and entry point. `root` is the DOM element Home.razor renders the game
// UI inside (containing the canvas plus every button/panel/overlay referenced below via
// querySelector); `saveBridge` is the small object Home.razor passes in wrapping its JSInvokable
// save/load/score C# methods. Returns a `{ dispose() }` handle so Home.razor can tear down all
// listeners and stop the render loop when the component unmounts (e.g. navigating away).
//
// This function does a large amount of one-time setup (grabbing every DOM element it'll touch,
// building the per-map floor canvases, wiring every button/keyboard/pointer listener) and then
// returns without blocking — the actual gameplay happens later via the requestAnimationFrame loop
// defined further down in this function.
export function createGame(root, saveBridge = null) {
    const loadingReadyAt = performance.now() + 2500;
    const canvas = root.querySelector("canvas");
    const releaseRankings = root.dataset.rankingBoard === "release";
    const bestKey = `${BEST_KEY}:${releaseRankings ? "release:" : ""}${root.dataset.player || "unknown"}`;
    const ctx = canvas.getContext("2d");
    const loading = root.querySelector("[data-loading]");
    if (!ctx) {
        loading.textContent = "This game needs a browser with Canvas 2D support.";
        return { dispose() {} };
    }
    // Pre-render every map's floor tile once up front rather than per-run, so switching maps mid-session never stalls.
    const floors = MAPS.map(makeFloor);
    // A single AbortController whose signal is passed to every addEventListener call below (via the
    // `on` helper) so dispose() can remove every listener at once instead of tracking them individually.
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
    if (releaseRankings) resetToReleaseRankings(state);
    let best = 0;
    let frame = 0;
    let last = 0;
    let hudTime = 0;
    let shownStatus = "ready";
    let disposed = false;
    let saving = false;
    let checkpointSaveFailed = false;
    const retrySave = root.querySelector("[data-retry-save]");
    let checkingUnlock = true;
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
    const cooldownPeaks = new WeakMap();
    const launchEndless = root.querySelector("[data-launch-endless]");
    const openSkills = root.querySelector("[data-open-skills]");
    const loadoutSelects = [...root.querySelectorAll("[data-loadout-slot]")];
    const treeButtons = [...root.querySelectorAll("[data-learn-skill]")];
    const setupLoadoutPanel = root.querySelector("[data-setup-loadout]");
    const skillChoice = root.querySelector("[data-skill-choice]");
    const setupSlots = [...root.querySelectorAll("[data-setup-slot]")];
    const skillUnlockNotice = root.querySelector("[data-skill-unlock]");
    const skillFeedback = root.querySelector("[data-skill-feedback]");
    const patchNotice = root.querySelector("[data-patch-notice]");
    const patchPreference = `path-of-boredom.patch-004:${root.dataset.player || "unknown"}`;
    if (patchNotice) {
        try { patchNotice.hidden = localStorage.getItem(patchPreference) === "seen"; } catch { /* Announcements work without storage. */ }
        on(root.querySelector("[data-dismiss-patch]"), "click", () => {
            patchNotice.hidden = true;
            try { localStorage.setItem(patchPreference, "seen"); } catch { /* Dismissal persistence is optional. */ }
        });
    }
    const viewPreference = "path-of-boredom.focus-view";
    let focusView = true;
    let layoutFrame = 0;
    let alignArena = false;
    try { focusView = localStorage.getItem(viewPreference) !== "off"; } catch { /* View preferences are optional. */ }
    // --- Responsive layout: "focus view" mode -------------------------------------------------
    // On small/short screens the arena can be taller than the viewport, so "focus view" (persisted
    // to localStorage) shrinks the arena's max-width to whatever fits above the fold, letting
    // players still see their HUD/buttons without scrolling. updateCanvasResolution() keeps the
    // actual canvas backing-store resolution in sync with its CSS size and devicePixelRatio so
    // rendering stays crisp regardless of the layout mode.
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
    // Recomputes the arena viewport's max-width for focus view (or clears it when focus view is
    // off) based on however much vertical space is actually available around the game's other UI,
    // then resyncs canvas resolution to match the new size.
    function fitArena() {
        if (root.dataset.canvasHud === "on") {
            viewport.style.maxWidth = "";
            updateCanvasResolution();
            return;
        }
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
    // Scrolls the page just enough to bring `element` fully into view (used after entering focus
    // view or opening the game so the player isn't left having to scroll manually) without
    // over-scrolling if it's already visible.
    function reveal(element, smooth = false) {
        const box = element.getBoundingClientRect();
        const height = window.visualViewport?.height ?? document.documentElement.clientHeight;
        const top = (window.visualViewport?.offsetTop ?? 0) + 8;
        const bottom = top + height - 16;
        const delta = box.height > height - 16 || box.top < top ? box.top - top : box.bottom > bottom ? box.bottom - bottom : 0;
        if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: smooth && !reducedMotion.matches ? "smooth" : "instant" });
    }
    // Batches layout recalculation into a single requestAnimationFrame call, since resize/orientation
    // events can fire many times in quick succession — this coalesces them into one fitArena() call
    // per frame instead of thrashing layout repeatedly.
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
    let accountGeneration = 0;
    let lastScoreAttempt = 0;
    // Queues (and attempts to flush) the current run's score to the server rankings. Only reports
    // when there's actually an improvement over what's already been successfully reported for this
    // exact (patch, difficulty, mode, class) combination, since the server only cares about a
    // player's personal best per bucket. `pendingScores` holds not-yet-confirmed submissions;
    // `reportedScores` remembers the last value that round-tripped successfully so repeated calls
    // during the same run don't keep resending an unchanged or lower score. On failure, leaves the
    // pending entry queued so the next reportScore() call (e.g. on the next checkpoint/kill) retries automatically.
    async function reportScore() {
        if (!saveBridge || disposed) return;
        if (state.status !== "ready" && state.rankingMode !== "legacy" && Object.hasOwn(DIFFICULTIES, state.difficulty)) {
            const key = `${state.rankingPatch}:${state.difficulty}:${state.rankingMode}:${state.heroClass}`;
            const score = state.kills - state.scoreBaseline;
            if (score > (reportedScores.get(key) ?? -1)) {
                const previous = pendingScores.get(key);
                if (!previous || score > previous.score) {
                    pendingScores.set(key, { difficulty: state.difficulty, mode: state.rankingMode, score, heroClass: state.heroClass, build: captureRankingBuild(state), patch: state.rankingPatch });
                }
            }
        }
        if (reporting || !pendingScores.size) return;
        reporting = true;
        const generation = accountGeneration;
        lastScoreAttempt = performance.now();
        try {
            for (const [key, submission] of pendingScores) {
                const success = await saveBridge.invokeMethodAsync("SubmitScore", submission);
                if (disposed || generation !== accountGeneration) return;
                if (!success) throw new Error("Rankings unavailable");
                reportedScores.set(key, Math.max(submission.score, reportedScores.get(key) ?? 0));
                if (pendingScores.get(key) === submission) pendingScores.delete(key);
            }
            rankingStatus.textContent = releaseRankings
                ? "Initial release ranking synced. Scores are separate by class, difficulty and starting mode."
                : `Class best synced with its upgrades. Board: ${state.rankingPatch === "004" ? "Patch 004" : "archive / inherited run"}. Rankings also separate class, difficulty, and starting mode.`;
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
    // Small helper to update a HUD stat element's text only if it actually changed, avoiding
    // needless layout/reflow churn on every frame for values that haven't moved.
    const text = (name, value) => {
        const next = String(value);
        if (stats[name] && stats[name].textContent !== next) stats[name].textContent = next;
        if (stats[name] && (name === "objective" || name === "buffs") && stats[name].title !== next) stats[name].title = next;
    };
    // Resets all held input state — called whenever focus leaves the game (opening a dialog, pausing,
    // etc.) so a key/pointer that was down before the interruption doesn't stay "stuck" held after.
    function clearInput() {
        keys.clear();
        pointers.clear();
        aim = null;
        delete root.dataset.stickX;
        delete root.dataset.stickY;
    }
    let promptOpen = false;
    function gameConfirm(message) {
        if (promptOpen) return Promise.resolve(false);
        promptOpen = true;
        if (state.status === "playing") togglePause(state);
        clearInput();
        updateHud();
        const dialog = document.createElement("dialog");
        dialog.className = "game-confirm";
        dialog.setAttribute("aria-label", "Confirm game action");
        const heading = document.createElement("h2");
        heading.textContent = "Keep your ember safe";
        const copy = document.createElement("p");
        copy.textContent = message;
        const accept = document.createElement("button"), cancel = document.createElement("button");
        accept.textContent = "Confirm";
        cancel.textContent = "Cancel";
        dialog.append(heading, copy, accept, cancel);
        root.append(dialog);
        dialog.showModal();
        cancel.focus();
        return new Promise(resolve => {
            const finish = result => { promptOpen = false; dialog.remove(); resolve(result); };
            accept.addEventListener("click", () => finish(true), { once: true });
            cancel.addEventListener("click", () => finish(false), { once: true });
            dialog.addEventListener("cancel", event => { event.preventDefault(); finish(false); }, { once: true });
        });
    }
    // Refreshes the setup dialog's class-preview panel text to match whichever class is currently
    // selected in the dropdown, so players can compare stats before starting a run.
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
    // Builds a lightweight preview state reflecting what a new/continued run would look like with
    // the setup dialog's current class/mode selections, purely so skill-unlock checks (which read
    // things like wave/heroClass off state) can be evaluated before the run actually starts.
    function setupPreview() {
        return setupAction === "continue" ? state : { ...state, heroClass: classSelect.value,
            rankingMode: setupAction === "endless" ? "endless" : "campaign", wave: setupAction === "endless" ? LAST_WAVE + 1 : 0 };
    }
    // Reads the loadout dropdowns' current values as a { manual, auto } loadout object.
    function readSetupLoadout() {
        return setupAction === "continue" ? state.loadout : { manual: "none", auto: [setupSlots[0].value, "none", "none", "none"] };
    }
    // Refreshes the setup dialog's loadout step: disables/labels each skill option by whether it's
    // unlocked for the previewed class/mode, updates the guard-unlock hint text, and enables/disables
    // the "confirm" button based on whether the currently selected combination is a valid loadout
    // (no skill slotted twice, manual skill actually unlocked, etc. — see arpg-skills.js's validLoadout()).
    function updateSetupLoadout() {
        const preview = setupPreview();
        for (const option of root.querySelectorAll("[data-setup-skill]")) {
            const key = option.dataset.setupSkill;
            option.disabled = !skillUnlocked(preview, key);
            option.textContent = `${skillName(preview, key)}${option.disabled ? " — Locked" : ""}`;
        }
        root.querySelector("[data-setup-unlock]").textContent = "Auto attack + one skill. Add another at levels 5, 10 and 15. Choices are locked for this run.";
        const loadout = readSetupLoadout();
        const valid = validLoadout(preview, loadout.manual, loadout.auto);
        setupNext.disabled = saving || !valid;
        root.querySelector("[data-setup-loadout-feedback]").textContent = valid
            ? `${skillName(preview, setupSlots[0].value)}: ${NEW_SKILLS[setupSlots[0].value]?.detail ?? "Your class combat skill casts automatically at nearby enemies."}`
            : "Choose one starting skill.";
    }
    for (const select of setupSlots) on(select, "change", () => {
        if (select === setupSlots[0]) {
            for (const auto of setupSlots.slice(1)) if (auto.value === select.value) auto.value = "none";
        }
        updateSetupLoadout();
    });
    // Renders whichever step of the multi-step setup dialog is currently active: step 0 is the
    // difficulty/class picker, the middle steps are the short tutorial slideshow (skipped via
    // setupSkip), and the final step is the skill-loadout picker gating the actual "start"/"confirm"
    // button. Sets focus to the most relevant control at each step for keyboard/screen-reader users.
    function showSetupStep() {
        const mobile = root.dataset.canvasHud === "on";
        const choosingDifficulty = setupStep === 0;
        const choosingLoadout = setupStep === tutorial.length + 1;
        root.querySelector("[data-class-picker]").hidden = !choosingDifficulty || setupAction === "continue";
        classPreview.hidden = !choosingDifficulty || mobile;
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
        setupLoadoutPanel.hidden = setupAction === "continue" || (mobile ? !choosingDifficulty : !choosingLoadout);
        setupNext.textContent = mobile ? "Start adventure" : choosingLoadout ? setupAction === "campaign" ? "Confirm slots & begin" : "Confirm slots & enter Endless" : "Next";
        setupNext.disabled = saving;
        if (choosingLoadout || mobile) updateSetupLoadout();
        (choosingDifficulty ? difficultySelect : choosingLoadout ? setupSlots[0] : setupNext).focus({ preventScroll: true });
    }
    // Opens the setup dialog for a given `action` ("campaign", "endless", or "continue" — i.e.
    // transitioning a completed campaign run into Endless mode). Pauses an in-progress run first,
    // pre-fills the dialog with sensible defaults (the current run's settings when continuing, or
    // fresh defaults for a brand-new run), and always starts back at step 0.
    function openSetup(action) {
        if (saving || checkingUnlock || setupAction || state.status === "choosing") return;
        if (state.status === "playing") togglePause(state);
        clearInput();
        setupAction = action;
        setupStep = 0;
        difficultySelect.value = Object.hasOwn(DIFFICULTIES, state.difficulty) ? state.difficulty : "hard";
        classSelect.value = state.heroClass;
        setupSlots[0].value = action === "continue" ? state.loadout.auto[0] : "nova";
        setup.hidden = false;
        updateHud();
        showSetupStep();
        scheduleArenaLayout(true);
    }
    // Confirms the setup dialog and actually starts (or transitions into) a run, validating the
    // chosen loadout one last time as a safety net. Reports any pending score from the previous run
    // before replacing `state` so nothing is lost. Resets the frame-timing `last` timestamp so the
    // very next render loop tick doesn't see the (now stale) time since the last frame as elapsed time.
    function finishSetup() {
        if (!setupAction || saving || setupStep !== tutorial.length + 1) return;
        const loadout = readSetupLoadout();
        if (!validLoadout(setupPreview(), loadout.manual, loadout.auto)) return;
        void reportScore();
        if (setupAction === "continue") {
            if (!enterEndless(state, difficultySelect.value)) return;
        } else {
            state = setupAction === "endless" ? startEndlessRun(Math.random, difficultySelect.value, classSelect.value) : startRun(Math.random, difficultySelect.value, classSelect.value);
            state.loadout = loadout;
            if (releaseRankings) resetToReleaseRankings(state);
        }
        setupAction = null;
        setup.hidden = true;
        checkpointHandled = null;
        clearInput();
        last = performance.now();
        updateHud();
        canvas.focus({ preventScroll: true });
    }
    // Closes the setup dialog without starting/changing anything, returning focus to whichever
    // button would have opened it (Endless launch if the run was already won, otherwise Start).
    function cancelSetup() {
        setupAction = null;
        setup.hidden = true;
        updateHud();
        (state.status === "won" ? endlessButton : startButton).focus({ preventScroll: true });
    }
    on(setupNext, "click", () => {
        if (root.dataset.canvasHud === "on") {
            setupStep = tutorial.length + 1;
            finishSetup();
            return;
        }
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
    // Refreshes essentially every piece of the HUD/UI that can change between frames: class stat
    // panels, per-skill descriptions and tooltips, the low-health warning banner, each skill button's
    // enabled/cooldown/slot-label state, and the score readout. Called every render frame (see the
    // loop() function below) as well as immediately after any state-changing action (setup, pause,
    // skill purchase, etc.) so the UI never lags a frame behind the actual game state.
    function updateHud() {
        root.dataset.gameStatus = setupAction ? "setup" : state.status;
        root.dataset.saveBusy = saving || checkingUnlock ? "on" : "off";
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
            nova: `${hero.specialCooldown}s base cooldown. ${ranged ? "Five-arrow fan. Bodkin volley adds a second target per arrow at 70% damage." : state.heroClass === "knight" ? "A fire pulse; Backdraft pushes survivors away." : "A seismic pulse; train its inner core and slow to set up Fault line."}`,
            burst: `${extra.burst.cooldown}s base cooldown. ${extra.burst.shape === "beam" ? "A narrow lance strikes every enemy along its line." : extra.burst.shape === "arrows" ? "Seven arrows, each penetrating a second target at 70% damage. Deep penetration adds a third." : "A heavy cone; Crushing force rewards hitting slowed enemies."}`,
            guard: `${extra.guard.cooldown}s base cooldown. Grants 40% damage reduction for at least 3s. Cannot refresh while active; at least 2s without protection after expiry.`,
            dodge: "Directional evasion on Space. Always available without a slot; manual-only.",
            potion: "Press E to consume one flask and heal. Always available without a slot; manual-only.",
            ...Object.fromEntries(Object.entries(NEW_SKILLS).map(([key, skill]) => [key, `${skill.cooldown}s cooldown. ${skill.detail}`]))
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
            const locked = !skillSelected(state, skill);
            const unavailable = locked || state.status !== "playing" || state.resumeDelay > 0 || !!setupAction || saving;
            const cannotHeal = skill === "potion" && (p.potions === 0 || p.health >= p.maxHealth);
            button.disabled = unavailable || cannotHeal || !manual;
            button.classList.toggle("skill-auto", automatic);
            const slotLabel = locked ? "STAGE 3" : skill === "attack" ? "J / CLICK" : skill === "dodge" ? "SPACE" : skill === "potion" ? "E" : manual ? "Q" : automatic ? "AUTO ×1.6" : "UNSLOTTED";
            if (button.querySelector("[data-slot-label]").textContent !== slotLabel) button.querySelector("[data-slot-label]").textContent = slotLabel;
            button.classList.toggle("skill-cooling", p[skill] > 0);
            if (root.dataset.canvasHud === "on") {
                const remaining = Math.max(0, p[skill]);
                const peak = remaining > 0 ? Math.max(remaining, cooldownPeaks.get(button) || 0) : 0;
                cooldownPeaks.set(button, peak);
                button.style.setProperty("--cooldown-turn", `${peak > 0 ? remaining / peak : 0}turn`);
                button.dataset.skillMode = locked ? "locked" : automatic ? "auto" : manual ? "manual" : "unslotted";
                button.setAttribute("aria-label", `${skillName(state, skill)}: ${locked ? "Locked" : remaining > 0 ? `${remaining.toFixed(1)} seconds` : "Ready"}${automatic ? ", automatic" : ""}`);
            }
            button.classList.toggle("flask-needed", skill === "potion" && critical && p.potions > 0 && p.potion === 0 && !setupAction && !saving);
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
        const living = state.enemies.filter(enemy => enemy.health > 0);
        const boss = living.find(enemy => enemy.kind === "boss");
        const traits = Object.entries(ELITE_MODIFIERS).filter(([key]) => key !== "none")
            .map(([key, value]) => [value.name, living.filter(enemy => enemy.modifier === key).length]).filter(([, count]) => count > 0);
        const pressure = state.wave === 0 ? "Threat: awaiting a run" : `Stage ${Math.ceil((state.mode === "endless" ? Math.max(1, state.wave - LAST_WAVE) : state.wave) / 5)} · ${living.length} enemies · ${living.filter(enemy => enemy.elite).length} elites`
            + (boss ? ` · Boss phase ${boss.combat.phase}${boss.combat.rest > 0 ? " — recovery window" : ""}` : "")
            + (traits.length ? ` · ${traits.map(([name, count]) => `${name} ×${count}`).join(" / ")}` : "")
            + (state.player.level > 8 ? " · Level scaling active" : "");
        text("pressure", pressure);
        stats.pressure.title = pressure;
        const acquired = Object.entries(state.boons).filter(([, rank]) => rank > 0);
        text("boon-count", acquired.reduce((total, [, rank]) => total + rank, 0));
        text("boons", acquired.length ? acquired.map(([key, rank]) => `${LEVEL_CARDS[key].name} x${rank}`).join(" / ") : "Level up to choose your first lasting boon.");
        const bestScore = releaseRankings ? state.kills - state.scoreBaseline : state.kills;
        if (bestScore > best) {
            best = bestScore;
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
        text("armor-detail", `${armorRating(state).toFixed(1)}% damage reduction (cap 60%)`);
        text("forge-gold", `${state.gold} gold`);
        text("checkpoint-save", ["camp", "won"].includes(state.status) ? saveStatus.textContent : "");
        text("weapon", p.weapon);
        text("weapon-detail", `Relic rating ${p.weaponBonus} (+${Math.round(60 * (Math.sqrt(1 + p.weaponBonus / 30) - 1))} damage) / Forge rank ${state.upgrades.weapon}`);
        const localSaves = root.dataset.localSaves === "on";
        text("unlock", checkingUnlock ? localSaves ? "Checking local save..." : "Checking server unlock..." : endlessUnlocked ? localSaves ? "Endless Watch permanently unlocked on this device." : "Endless Watch permanently unlocked on this server profile." : state.status === "won" ? (saving ? "Saving your permanent Endless unlock..." : "Endless is available now. Save successfully to keep the unlock permanently.") : "Complete the campaign to permanently unlock Endless Watch.");
        const activePowers = POWER_UPS.filter(power => state.buffs[power.key] > 0);
        text("buffs", activePowers.length ? activePowers.map(power => `${power.name}: ${Math.ceil(state.buffs[power.key])}s`).join(" / ") : "No active power-ups");
        text("journal", state.journal);
        for (const skill of SKILL_KEYS) text(skill, !skillUnlocked(state, skill) ? "Locked" : skill === "potion" ? `${p.potions}/${MAX_FLASKS} · ${p.potion > 0 ? `${p.potion.toFixed(1)}s` : "Ready"}` : p[skill] > 0 ? `${p[skill].toFixed(1)}s` : "Ready");
        text("objective", state.status === "ready" ? `Survive ${LAST_WAVE} waves across ${MAPS.length} lands.`
            : state.status === "won" ? "Dawn restored. The Endless Watch is unlocked."
            : state.status === "camp" ? state.mode === "endless" ? "Stage cleared — save checkpoint, then auto-advance. Save retries a failed checkpoint." : "Checkpoint reached. Loot collected, partial healing and two flask charges granted."
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
        retrySave.hidden = !checkpointSaveFailed || !["camp", "won"].includes(state.status) || !!setupAction;
        retrySave.disabled = saving || checkingUnlock || !saveBridge;
        retrySave.textContent = saving ? "Retrying checkpoint save…" : "Retry checkpoint save";
        const wardUnlocked = skillUnlocked(state, "guard");
        const remindWard = false;
        text("ward-unlock-status", `${selectedSkills(state).map(key => skillName(state, key)).join(" · ")}. Next skill at ${[5, 10, 15].find(level => level > p.level) ?? "maximum loadout"}.`);
        text("skill-unlock-hint", `${skillName(state, "guard")} unlocked! Slot your new skill.`);
        skillUnlockNotice.hidden = !remindWard || state.status !== "playing" || state.resumeDelay > 0 || draftClosing || !!setupAction;
        for (const button of root.querySelectorAll("[data-resume-combat]")) {
            button.hidden = state.mode === "endless" && state.status === "camp";
            button.disabled = saving || !!setupAction || !["paused", "camp"].includes(state.status);
            button.textContent = state.status === "camp" ? "Travel to next stage" : "Return to battle";
        }
        openSkills.disabled = saving || !!setupAction || !active || choosing;
        text("skill-points", `${skillPointsLeft(state)} points available · ${skillPointsEarned(state)}/${MAX_SKILL_POINTS} earned`);
        for (const button of root.querySelectorAll("[data-respec-tree]")) {
            const skill = button.dataset.respecTree;
            const points = treePointsSpent(state, skill), cost = treeRespecCost(state, skill);
            button.textContent = points ? `Reset tree · ${cost} gold · refund ${points} points` : "No points to refund";
            button.disabled = saving || !!setupAction || !canRespecTree(state, skill);
            button.title = points ? `Reset ${skillName(state, skill)} only. Requires ${cost} gold; ${state.gold} available. Cooldowns remain; refunded effects end.` : "Learn an upgrade before resetting this tree.";
        }
        openSkills.classList.toggle("forge-available", active && (skillPointsLeft(state) > 0 || remindWard));
        for (const select of loadoutSelects) {
            const slot = Number(select.dataset.loadoutSlot);
            const value = state.loadout.auto[slot - 1];
            if (select.value !== value) select.value = value;
            select.disabled = saving || !canForge || value !== "none" || slot > skillCapacity(state);
            for (const option of select.options) option.disabled = option.value !== "none" && selectedSkills(state).includes(option.value) && option.value !== value;
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
            tree.dataset.heroClass = state.heroClass;
            const skill = tree.dataset.treeSkill, nodes = state.skillTree[skill];
            tree.hidden = !skillSelected(state, skill);
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
        startButton.hidden = state.mode === "endless" && state.status === "camp";
        startButton.disabled = saving || checkingUnlock || choosing || !!setupAction;
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
        root.dataset.forgeAvailable = active && !choosing && !setupAction && affordable ? "on" : "off";
        root.querySelector("[data-open-forge]").disabled = forgeButton.disabled;
        text("forge-hint", completedForge ? `Stat training from ${cheapestTraining.toLocaleString()} gold.` : "Forge upgrade available!");
        masteryPanel.hidden = !completedForge;
        for (const button of masteryButtons) {
            const key = button.dataset.masteryStat;
            const cost = masteryCost(state, key);
            button.querySelector("[data-mastery-label]").textContent = `Rank ${state.mastery[key]} / ${cost.toLocaleString()} gold`;
            button.disabled = saving || !canForge || !completedForge || state.gold < cost || !Number.isFinite(cost);
            button.title = MASTERY[key].detail;
            if (canForge && completedForge) showUpgradePreview(button, key, true);
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
            button.hidden = !skillSelected(state, key);
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
            if (canForge && skillUnlocked(state, key) && rank < max) showUpgradePreview(button, key);
            else if (button.querySelector("[data-upgrade-preview]")) button.querySelector("[data-upgrade-preview]").textContent = rank >= max ? "Fully forged" : "";
        }
        if (saveButton) saveButton.disabled = saving || checkingUnlock || !saveBridge || !active || !!setupAction;
        const choosingSkill = active && !choosing && !setupAction && needsSkillChoice(state);
        skillChoice.hidden = !choosingSkill || root.dataset.menuOpen === "on";
        for (const button of skillChoice.querySelectorAll("[data-choose-run-skill]")) {
            button.hidden = selectedSkills(state).includes(button.dataset.chooseRunSkill);
            button.disabled = saving || !choosingSkill;
        }
        if (loadButton) loadButton.disabled = saving || checkingUnlock || !saveBridge || !!setupAction;
        pauseButton.firstChild.textContent = state.status === "paused" ? "Resume " : "Pause ";
        if (state.status !== shownStatus) {
            const report = root.querySelector("[data-death-report]");
            report.hidden = state.status !== "dead";
            if (state.status === "dead") {
                const fatal = state.damageHistory.findLast(hit => hit.lethal);
                root.querySelector("[data-killing-blow]").textContent = fatal
                    ? `Killing blow: ${fatal.source} — ${fatal.damage.toFixed(1)} health lost.` : "Damage source unavailable.";
                const list = root.querySelector("[data-damage-history]");
                list.replaceChildren();
                for (const hit of [...state.damageHistory].reverse()) {
                    const item = document.createElement("li");
                    item.textContent = `${hit.lethal ? "FATAL" : `${hit.age.toFixed(1)}s earlier`} · ${hit.source} · ${hit.damage.toFixed(1)} health`;
                    if (hit.lethal) item.classList.add("fatal-hit");
                    list.append(item);
                }
            }
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
                    : camp || won ? (watch ? `Echo ${state.wave - LAST_WAVE} cleared. All loot collected, partial healing and two flask charges granted. Saving this stage, then continuing automatically. If saving fails, use Save to retry.` : map.ending)
                    : `${state.kills} enemies slain / ${state.gold} gold / Level ${p.level}. ${watch ? "Load your last checkpoint, or begin a fresh watch." : "Forge your equipment, dodge warning zones, and seek fallen upgrade scrolls."}`;
                startButton.textContent = paused ? "Return to battle" : camp ? (watch ? "Continue the watch" : `Travel to ${mapForWave(state.wave + 1).name}`) : "Begin a new campaign";
                if (!setupAction && !(camp && watch)) (won ? endlessButton : startButton).focus({ preventScroll: true });
            }
        }
    }
    // Adds/updates the small "+X damage" style preview label shown on a forge/mastery button so
    // players can see the concrete effect of their next purchase before spending gold; also flags
    // buttons whose underlying stat has hit its display cap (e.g. skillReach's per-skill maximums).
    function showUpgradePreview(button, key, mastery = false) {
        const preview = upgradePreview(state, key, mastery);
        let label = button.querySelector("[data-upgrade-preview]");
        if (!label) {
            label = document.createElement("span");
            label.dataset.upgradePreview = "";
            label.className = "upgrade-preview";
            button.append(label);
        }
        if (label.textContent !== preview.text) label.textContent = preview.text;
        button.classList.toggle("at-stat-cap", preview.capped);
        button.title += ` ${preview.text}`;
    }
    // Toggles pause via the engine, syncing input state and focus. Guarded against firing while a
    // save is in flight or the setup dialog is open, since pausing mid-save or mid-dialog would be confusing.
    function pause() {
        if (saving || setupAction || root.dataset.menuOpen === "on") return;
        togglePause(state);
        clearInput();
        updateHud();
        if (state.status === "playing") canvas.focus({ preventScroll: true });
    }
    on(root, "mobile-menu", event => {
        const opening = event.detail?.open === true;
        if (opening) {
            const idleInformation = event.detail?.information && ["ready", "dead", "won"].includes(state.status);
            if (saving || setupAction || (!idleInformation && !["playing", "paused", "camp"].includes(state.status))) return;
            if (state.status === "playing") togglePause(state);
            root.dataset.menuOpen = "on";
        } else {
            delete root.dataset.menuOpen;
            if (event.detail?.resume && state.status === "paused" && !saving && !setupAction) togglePause(state);
        }
        clearInput();
        updateHud();
    });
    on(root, "mobile-cast", event => {
        if (saving || setupAction || root.dataset.menuOpen === "on" || state.status !== "playing") return;
        const action = event.detail?.action;
        if (!["manual", "dodge", "potion"].includes(action)) return;
        const angle = Number(root.dataset.faceAngle);
        if (Number.isFinite(angle)) state.player.facing = angle;
        useSkill(state, action === "manual" ? state.loadout.manual : action);
        updateHud();
    });
    // Handles the primary "Start/Resume" button: resumes if paused, continues the journey if at a
    // checkpoint camp, or opens the setup dialog for a brand-new campaign run otherwise.
    function begin() {
        if (saving || checkingUnlock || setupAction || state.status === "choosing") return;
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
        const manual = "none";
        const auto = loadoutSelects.map(element => element.value);
        if (saving || setupAction || !setLoadout(state, manual, auto)) {
            skillFeedback.textContent = "Chosen slots stay locked for this run. Choose a different skill for an unlocked empty slot.";
        } else {
            skillFeedback.textContent = "Loadout changed. Save to keep it, or continue to the next autosaved checkpoint.";
            if (["camp", "won"].includes(state.status)) void persist(false, true);
        }
        clearInput();
        updateHud();
    });
    for (const button of root.querySelectorAll("[data-choose-run-skill]")) on(button, "click", () => {
        if (saving || setupAction || !needsSkillChoice(state)) return;
        const auto = [...state.loadout.auto];
        auto[auto.indexOf("none")] = button.dataset.chooseRunSkill;
        if (!setLoadout(state, "none", auto)) return;
        if (!needsSkillChoice(state) && state.status === "paused") togglePause(state);
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
    for (const button of root.querySelectorAll("[data-respec-tree]")) on(button, "click", async () => {
        const skill = button.dataset.respecTree;
        if (saving || setupAction || !canRespecTree(state, skill)) return;
        if (!await gameConfirm(`Reset ${skillName(state, skill)} for ${treeRespecCost(state, skill)} gold and refund ${treePointsSpent(state, skill)} points? Other trees stay unchanged. Cooldowns remain and this tree's active effects end.`)) return;
        if (!respecTree(state, skill)) return;
        skillFeedback.textContent = `${state.journal} Save or reach a checkpoint to keep this change.`;
        clearInput();
        updateHud();
        if (["camp", "won"].includes(state.status)) void persist(false, true);
    });
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
    // The single save/load entry point, covering both manual Save/Load button clicks and automatic
    // checkpoint autosaves (`automatic = true`, called right after finishCheckpoint() transitions the
    // run to "camp"/"won"). Pauses first so the state being saved can't change mid-save. On load,
    // round-trips the server's raw save envelope through restoreSnapshot() (the same validator the
    // server-side save went through when it was captured) before accepting it as the new live state
    // — if the server ever returned something malformed, this throws and the load is treated as
    // failed rather than corrupting the live run. Endless-mode checkpoint autosaves that succeed
    // auto-advance to the next stage (`advanceEndless`) so players don't have to manually continue
    // after every single stage transition; other modes always require an explicit "continue" action.
    // Any failure (network error, invalid save shape) leaves the current in-memory run completely
    // unchanged — nothing here can lose progress, only fail to persist it.
    async function persist(loadingSave, automatic = false) {
        if (saving || checkingUnlock || setupAction) return;
        if (!saveBridge) {
            checkpointSaveFailed = ["camp", "won"].includes(state.status);
            saveStatus.textContent = "Checkpoint autosave unavailable. Reconnect to Blazor and select Save before leaving.";
            updateHud();
            return;
        }
        if (promptOpen) return;
        if (loadingSave && ["playing", "paused", "camp", "won", "choosing"].includes(state.status)
            && !await gameConfirm(root.dataset.cloudSignedIn === "on"
                ? "Load the cloud run and replace this run? Unsaved progress will be lost."
                : "Load your saved run and replace this run? Unsaved progress will be lost.")) return;
        if (state.status === "playing") pause();
        clearInput();
        saving = true;
        let advanceEndless = false;
        let operationSucceeded = false;
        const local = root.dataset.localSaves === "on" && root.dataset.cloudSignedIn !== "on";
        saveStatus.textContent = loadingSave ? local ? "Loading from this device..." : "Loading from the server..."
            : automatic ? local ? "Saving checkpoint on this device..." : "Autosaving checkpoint to the server..."
            : local ? "Saving on this device..." : "Saving to the server...";
        updateHud();
        try {
            const result = loadingSave
                ? await saveBridge.invokeMethodAsync("LoadRun")
                : await saveBridge.invokeMethodAsync("SaveRun", captureSnapshot(state));
            if (disposed) return;
            operationSucceeded = result.success;
            if (result.success) root.dataset.hasSave = "on";
            if (result.success) endlessUnlocked = endlessUnlocked || result.endlessUnlocked || result.save?.endlessUnlocked || result.save?.state?.campaignComplete === 1;
            if (!loadingSave && ["camp", "won"].includes(state.status)) checkpointSaveFailed = !result.success;
            if (result.success && loadingSave) {
                const restored = restoreSnapshot(result.save);
                void reportScore();
                state = restored;
                if (releaseRankings) resetToReleaseRankings(state);
                checkpointSaveFailed = false;
                if (state.mode === "endless" && state.status === "camp") {
                    continueJourney(state);
                    togglePause(state);
                }
                difficultySelect.value = Object.hasOwn(DIFFICULTIES, state.difficulty) ? state.difficulty : "hard";
                checkpointHandled = ["camp", "won"].includes(state.status) ? `${state.mode}:${state.wave}` : null;
                shownStatus = "";
                shownDraft = "";
                last = performance.now();
            }
            advanceEndless = result.success && !loadingSave && state.mode === "endless" && state.status === "camp";
            saveStatus.textContent = automatic
                ? result.success ? `Checkpoint ${state.wave} saved ${local ? "on this device" : "on the server"}.${endlessUnlocked ? " Endless Watch remains permanently unlocked." : ""}` : `Checkpoint autosave failed. ${result.message} Select Save to retry before leaving.`
                : result.message;
        } catch {
            operationSucceeded = false;
            if (!loadingSave && ["camp", "won"].includes(state.status)) checkpointSaveFailed = true;
            if (!disposed) saveStatus.textContent = local
                ? "Local save/load failed or the save was invalid. Your current run is unchanged."
                : automatic ? "Checkpoint autosave failed. Stay here, reconnect, then select Save to retry." : "Save/load failed: the connection was lost or the save was invalid. Your current run is unchanged; reconnect and try again.";
        } finally {
            if (!disposed) {
                saving = false;
                if (advanceEndless) {
                    continueJourney(state);
                    clearInput();
                    last = performance.now();
                    if (document.hidden || !document.hasFocus()) togglePause(state);
                    else canvas.focus({ preventScroll: true });
                }
                updateHud();
                root.dispatchEvent(new CustomEvent("mobile-save-result", { detail: { success: operationSucceeded, loadingSave } }));
            }
        }
    }
    if (saveButton && saveStatus) on(saveButton, "click", () => persist(false));
    on(retrySave, "click", () => persist(false, true));
    if (loadButton && saveStatus) on(loadButton, "click", () => persist(true));
    // One-time startup check (see the `checkingUnlock` flag) that asks the server whether this
    // player's profile has already permanently unlocked Endless Watch, without disturbing the
    // current in-memory run — it only reads endlessUnlocked/campaignComplete off the result, never
    // replaces `state`. Runs once when the game first loads (see the call site further down).
    async function readUnlock() {
        try {
            if (saveBridge) {
                const result = await saveBridge.invokeMethodAsync("LoadRun");
                if (disposed) return;
                if (result.success) {
                    endlessUnlocked = !!(result.endlessUnlocked || result.save?.endlessUnlocked || result.save?.state?.campaignComplete === 1);
                    root.dataset.hasSave = "on";
                    if (root.dataset.localSaves === "on") saveStatus.textContent = root.dataset.cloudSignedIn === "on"
                        ? "Cloud save available. Choose Load to continue it." : "Device save found. Choose Load to restore it.";
                }
                else saveStatus.textContent = root.dataset.localSaves === "on" ? result.message : `${result.message} Load can retry the server profile check.`;
            }
        } catch {
            if (!disposed) saveStatus.textContent = root.dataset.localSaves === "on"
                ? "Could not read the local save. Use Load to retry; your saved file has not been changed."
                : "Could not read the server profile. Reconnect and use Load to recover your run and unlocks.";
        } finally {
            // Keep preparation visible for at least 2.5 seconds, but never hide a still-running
            // save lookup behind a fixed timer. The simulation remains in its ready state.
            await new Promise(resolve => setTimeout(resolve, Math.max(0, loadingReadyAt - performance.now())));
            if (!disposed) { checkingUnlock = false; loading.hidden = true; updateHud(); }
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
    // Converts a pointer event's browser (CSS pixel) coordinates into the game's logical WIDTH/HEIGHT
    // coordinate space, accounting for the canvas possibly being displayed scaled/resized on screen.
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
    // Builds the single input snapshot object passed to arpg-engine.js's step() each frame, merging
    // together every currently-held input source: physical keys, and any on-screen touch/mouse
    // buttons captured via pointer events (tracked in the `pointers` map so multiple simultaneous
    // touches — e.g. one finger moving, another attacking — all register). `aim` is the last known
    // mouse/touch position used for facing direction; it's cleared whenever a non-mouse pointer
    // leaves so a lifted touch doesn't leave a stale aim point behind.
    function input() {
        const held = new Set(pointers.values());
        for (const key of keys) held.add(movementKeys[key] || skillKeys[key]);
        return {
            x: Number(root.dataset.stickX || 0) || Number(held.has("right")) - Number(held.has("left")),
            y: Number(root.dataset.stickY || 0) || Number(held.has("down")) - Number(held.has("up")),
            aim: root.dataset.autoAttack === "on" ? null : aim,
            attack: held.has("attack"), manual: held.has("manual") || held.has(state.loadout.manual),
            dodge: held.has("dodge"), potion: held.has("potion"),
            // Opt-in, set by hosts that have no mouse (the MAUI mobile shell sets
            // data-auto-attack on the game root). Desktop leaves it undefined and is unaffected.
            autoAttack: root.dataset.autoAttack === "on",
            // Continuous facing from an on-screen thumbstick, in radians. Hosts publish it as
            // data-face-angle on the game root; absent on desktop, where the mouse sets aim.
            faceAngle: root.dataset.faceAngle === undefined ? undefined : Number(root.dataset.faceAngle)
        };
    }
    // The main requestAnimationFrame loop: advances the simulation via step(), periodically retries
    // score reporting (every 15s, as a fallback in case an earlier reportScore() call failed),
    // triggers exactly one automatic checkpoint autosave per unique (mode, wave) checkpoint reached
    // (checkpointHandled dedupes this so returning to the same checkpoint state doesn't re-save
    // repeatedly), then draws the frame and throttles full HUD updates to roughly 10 times per second
    // (every 100ms) rather than every single frame, since most HUD text doesn't need 60fps updates.
    // Self-terminates if the game's root element has been removed from the DOM (component unmounted
    // without dispose() being called for some reason) as a safety net against a leaked loop.
    function animate(now) {
        if (disposed) return;
        if (!root.isConnected) { dispose(); return; }
        step(state, input(), last ? (now - last) / 1000 : 0);
        root.dataset.gameStatus = setupAction ? "setup" : state.status;
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
        // Hosts without room for a DOM HUD (the mobile shell) draw it into the canvas instead, so
        // it scales with the playfield and cannot intercept touches. Opt-in: desktop keeps the
        // DOM HUD and is unaffected.
        if (root.dataset.canvasHud === "on") drawHud(ctx, state, { maxFlasks: MAX_FLASKS });
        if (now - hudTime > 100 || state.status !== shownStatus) { updateHud(); hudTime = now; }
        frame = requestAnimationFrame(animate);
    }
    // Tears down everything this game instance set up: stops the render loop and any pending layout
    // frame, disconnects both observers, and aborts every event listener registered via `on()` in one
    // shot (they all share `controller.signal`). Idempotent — safe to call multiple times or have it
    // triggered by more than one of the paths that call it (component disposal, DOM removal, the
    // animate() loop's own DOM-disconnection check).
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
    // Watches for this game's root element being removed from the document (e.g. Blazor tearing down
    // the component without an explicit dispose call) as a fallback cleanup trigger.
    const observer = new MutationObserver(() => { if (!root.isConnected) dispose(); });
    observer.observe(document.body, { childList: true, subtree: true });
    // Watches the combat view's own size (independent of window resize — e.g. a sidebar
    // collapsing/expanding can resize it without the window itself resizing) to keep the arena's
    // layout/canvas resolution in sync.
    const resizeObserver = new ResizeObserver(() => scheduleArenaLayout());
    resizeObserver.observe(combatView);
    fitArena();
    loading.hidden = false;
    updateHud();
    // Kick off the render loop and the one-time server unlock check; everything from here on is
    // driven by the animate() loop and the event listeners registered above.
    frame = requestAnimationFrame(animate);
    void readUnlock();
    return {
        dispose,
        accountChanged() {
            accountGeneration++;
            // Never replay a previous account's queued score submissions after switching users.
            pendingScores.clear();
            reportedScores.clear();
            rankingStatus.textContent = "Account updated. Rankings use your current verified sign-in.";
        },
        resetAfterDeletion() {
            accountGeneration++;
            pendingScores.clear();
            reportedScores.clear();
            state = createState();
            if (releaseRankings) resetToReleaseRankings(state);
            endlessUnlocked = false;
            checkpointHandled = null;
            checkpointSaveFailed = false;
            delete root.dataset.hasSave;
            delete root.dataset.menuOpen;
            clearInput();
            shownStatus = "ready";
            title.innerHTML = "One blade.<br />One last ember.";
            description.textContent = "Your game account data has been deleted. Begin a new journey to play offline.";
            startButton.textContent = "Begin a new journey";
            restartButton.hidden = true;
            saveStatus.textContent = "Game account deleted. Previous run discarded.";
            updateHud();
            root.dispatchEvent(new CustomEvent("mobile-account-deleted"));
        }
    };
}
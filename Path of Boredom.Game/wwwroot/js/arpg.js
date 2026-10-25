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
import { WIDTH, HEIGHT, createState, startRun, startEndlessRun, step, togglePause as engineTogglePause, useSkill, weaponDamage, armorRating, upgradeCost, buyUpgrade, continueJourney, enterEndless, chooseLevelCard } from "./arpg-engine.js";
import { captureSnapshot, restoreSnapshot } from "./arpg-save.js";
import { captureRankingBuild, resetToReleaseRankings } from "./arpg-ranking.js";
import { upgradePreview } from "./arpg-upgrade-preview.js";
import { MAPS, LAST_WAVE, UPGRADES, POWER_UPS, threatForWave, mapForWave, mapIndexForWave } from "./arpg-campaign.js";
import { LEVEL_CARDS, normalizeCardChoices } from "./arpg-cards.js";
import { DIFFICULTIES } from "./arpg-difficulty.js";
import { MASTERY, MAX_FLASKS, grantExperience, forgeSkillSelected, forgeComplete, masteryCost, buyMastery, chargeLaneEnd } from "./arpg-engine.js";
import { movementSpeed, criticalChance, criticalDamage, skillReach, cooldownRecovery } from "./arpg-engine.js";
import { HERO_CLASSES, classFor } from "./arpg-classes.js";
import { resistanceRating } from "./arpg-engine.js";
import { enemyDefense, skillDamageType } from "./arpg-damage.js";
import { BOSS_RELICS, BUILD_SYNERGIES, codexEntries, stageEvent, eventAvailable, eventDetail, resolveStageEvent, buildSynergy, discoverChapter, checkpointReport } from "./arpg-adventures.js";
import { bindPreferences } from "./arpg-preferences.js";
import { drawBossDanger, bossWarning, drawBossStrike, drawBossProjectile } from "./arpg-boss-patterns.js";
import { drawMob } from "./arpg-mob-art.js";
import { CAMP_NODES, CLASS_ORDER, CLASS_UNLOCK_HINT, MASTERY_MAX, MASTERY_REWARDS, masteryStep, loadProfile, onProfileChange, grandfatherClasses, classUnlocked, campCost, buyCampNode, extraStarters, relayForks, unlockedTrims, setTrim, applyCampBonuses, rerollsPerRun, creditProgress, mergeProfile, exportProfile } from "./arpg-meta.js";
import { setRelayForks } from "./arpg-engine.js";
import { RELICS, RELIC_KEYS } from "./arpg-relics.js";
import { recordRelics } from "./arpg-meta.js";
import { drawLevelCards } from "./arpg-cards.js";
import { ELITE_MODIFIERS } from "./arpg-modifiers.js";
import { treePointsSpent, treeRespecCost, canRespecTree, respecTree } from "./arpg-skills.js";
import { SKILL_KEYS, SLOTTABLE_SKILLS, STARTER_SKILLS, EXTRA_SKILLS, NEW_SKILLS, combatSkillDefinition, MAX_SKILL_POINTS, skillIcon, skillName, skillPointsLeft, skillPointsEarned, canLearnSkill, learnSkill, setLoadout, skillUnlocked, skillSelected, skillCapacity, selectedSkills, needsSkillChoice, wardUnlockHint, validLoadout, treeNodeKey, treeNodeDefinition, treeNodeStatus } from "./arpg-skills.js";
import { drawHero, drawOrb, decorateFloor, drawAtmosphere, drawLootIcon } from "./arpg-graphics.js";
import { drawClassSkillEffect } from "./arpg-skill-effects.js";
import { drawHud, drawHudCached } from "./arpg-hud.js";
import { arenaHazards, hazardPhase } from "./arpg-hazards.js";
import { turnToward } from "./arpg-facing.js";
import { automaticCheckpoint, forgeNotification, bossHudTop, combatControlStatus, bossWarningPosition } from "./arpg-ui-state.js";
import { encounterForWave } from "./arpg-encounters.js";
import { paintGround } from "./arpg-ground.js";
import { setEquipmentStyle, acceptChallenge, CHALLENGES, EQUIPMENT_STYLES, runSummary } from "./arpg-run-systems.js";
import { createGameAudio } from "./arpg-audio.js";
import { bindButtonFeedback } from "./arpg-button-feedback.js";
import { bossProfile, drawBoss } from "./arpg-bosses.js";
import { skillTagline } from "./arpg-skill-taglines.js";
import { drawGlow, drawGroundShadow, drawOutline } from "./arpg-sprite-cache.js";

const mobFacing = new WeakMap();

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
    paintGround(ctx, map, random, WIDTH, HEIGHT);
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
        glow.addColorStop(0, map.accent + "38");
        glow.addColorStop(1, map.accent + "00");
        ctx.fillStyle = glow;
        ctx.fillRect(x - 140, y - 140, 280, 280);
        ctx.fillStyle = "#0c1215";
        ctx.fillRect(x - 13, y - 8, 26, 33);
        ctx.fillStyle = "#5b5545";
        ctx.fillRect(x - 17, y - 12, 34, 11);
    }
    decorateFloor(ctx, map, random, WIDTH, HEIGHT);
    bakeFloorLighting(ctx, map, random);
    return floor;
}

// Lighting painted once into the cached floor so it costs nothing per frame: soft fog patches,
// darkened edges where the floor meets the walls (ambient occlusion), a gentle colour grade in the
// act's accent colour so every act has its own palette, and the arena vignette.
function bakeFloorLighting(ctx, map, random) {
    ctx.save();
    for (let i = 0; i < 7; i++) {
        const x = 120 + random() * (WIDTH - 240), y = 100 + random() * (HEIGHT - 200), r = 90 + random() * 120;
        const fog = ctx.createRadialGradient(x, y, 0, x, y, r);
        fog.addColorStop(0, map.accent + "12"); fog.addColorStop(1, map.accent + "00");
        ctx.fillStyle = fog; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const edge = 70;
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
        [0, 27, 0, 27 + edge, 0, 27, WIDTH, edge], [0, HEIGHT - 27, 0, HEIGHT - 27 - edge, 0, HEIGHT - 27 - edge, WIDTH, edge],
        [27, 0, 27 + edge, 0, 27, 0, edge, HEIGHT], [WIDTH - 27, 0, WIDTH - 27 - edge, 0, WIDTH - 27 - edge, 0, edge, HEIGHT]]) {
        const shade = ctx.createLinearGradient(x0, y0, x1, y1);
        shade.addColorStop(0, "#02070a66"); shade.addColorStop(1, "#02070a00");
        ctx.fillStyle = shade; ctx.fillRect(rx, ry, rw, rh);
    }
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = map.accent;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 160, WIDTH / 2, HEIGHT / 2, 630);
    vignette.addColorStop(0, "#03090d00"); vignette.addColorStop(1, "#03090d70");
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
}

// Tiny shorthand for filling a solid circle — used constantly throughout the per-kind enemy art below.
function circle(ctx, x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
}

// Enemy body gradients are in local (translated) coordinates, so one gradient object per kind/size
// can be reused forever instead of being rebuilt for every enemy on every frame.
const gradientCache = new WeakMap();
function cachedGradient(ctx, key, make) {
    let byKey = gradientCache.get(ctx);
    if (!byKey) { byKey = new Map(); gradientCache.set(ctx, byKey); }
    let gradient = byKey.get(key);
    if (!gradient) { gradient = make(); byKey.set(key, gradient); }
    return gradient;
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
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    drawGroundShadow(ctx, r);
    if (actor.elite && !hero) drawGlow(ctx, 0, 0, r * 2.2, "#c79bff", 0.22);
    if (actor.flash > 0 && !hero) drawGlow(ctx, 0, 0, r * 1.9, "#fff1cc", 0.5);
    if (!hero && !boss) drawOutline(ctx, r);
    const targetFacing = actor.winding > 0 || actor.charging > 0
        ? Math.atan2(actor.chargeY || 0, actor.chargeX || 0)
        : actor.attackWindup > 0 ? Math.atan2(actor.attackY - actor.y, actor.attackX - actor.x)
        : Math.atan2(player.y - actor.y, player.x - actor.x);
    const previousFacing = mobFacing.get(actor);
    const facing = !previousFacing || reducedMotion.matches ? targetFacing
        : turnToward(previousFacing.angle, targetFacing, Math.min(0.05, (time - previousFacing.time + 3600) % 3600), 10);
    if (!hero) mobFacing.set(actor, { angle: facing, time });
    const walking = hero ? Math.min(1, Math.hypot(actor.vx || 0, actor.vy || 0) / 180) : actor.moving ? 1 : 0;
    const stride = reducedMotion.matches ? 0 : Math.sin(actor.stridePhase ?? 0) * walking;
    const strike = Math.sin(Math.PI * Math.min(1, (actor.swing ?? 0) / (hero ? 0.26 : 0.3)));
    if (!reducedMotion.matches) {
        ctx.translate(0, -stride * stride * (hero ? 2 : 2.5));
        if (!hero && !boss) {
            const angle = Math.atan2(player.y - actor.y, player.x - actor.x);
            ctx.translate(Math.cos(angle) * strike * 7, Math.sin(angle) * strike * 7);
            const breath = Math.sin(time * 2.8 + actor.x * 0.01) * 0.012;
            ctx.scale(1 + breath, 1 - breath);
            if (actor.winding > 0 || actor.attackWindup > 0) ctx.scale(1.06, 0.94);
        }
    }
    if (hero) {
        drawHero(ctx, actor, HERO_CLASSES[heroClass], stride, strike, time, reducedMotion.matches, loadProfile().trim[heroClass] || "");
    } else if (!boss && drawMob(ctx, actor, facing, stride, strike, time)) {
        // Detailed cached artwork (arpg-mob-art.js).
    } else if (boss) {
        drawBoss(ctx, actor, map, time, reducedMotion.matches);
    } else if (actor.kind === "duelist") {
        ctx.rotate(facing);
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
        ctx.rotate(facing);
        ctx.fillStyle = "#ad95c7"; ctx.fillRect(0, -8, 31, 16);
        drawOrb(ctx, 29, 0, actor.attackWindup > 0 ? 9 : 5, "#e1b7ff");
    } else if (["summoner", "cantor", "hexer"].includes(actor.kind)) {
        const color = actor.kind === "cantor" ? "#a4e9bb" : actor.kind === "hexer" ? "#ef96cf" : "#b994e1";
        const cloth = cachedGradient(ctx, "cloth:" + color, () => {
            const g = ctx.createLinearGradient(-20, -25, 20, 20);
            g.addColorStop(0, color); g.addColorStop(1, "#252437");
            return g;
        });
        ctx.fillStyle = actor.flash > 0 ? "#fff4d6" : cloth;
        ctx.beginPath(); ctx.moveTo(0, -25); ctx.bezierCurveTo(13, -23, 12, 4, 20, 20);
        ctx.quadraticCurveTo(10, 24, 0, 16); ctx.quadraticCurveTo(-10, 24, -20, 20);
        ctx.bezierCurveTo(-12, 4, -13, -23, 0, -25); ctx.closePath(); ctx.fill();
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
        ctx.rotate(facing);
        const plate = cachedGradient(ctx, "plate:" + actor.kind, () => {
            const g = ctx.createLinearGradient(-18, -18, 22, 18);
            g.addColorStop(0, actor.kind === "lancer" ? "#ffe2ad" : "#c7f1ed");
            g.addColorStop(0.45, actor.kind === "lancer" ? "#e9ac63" : "#83b9cb");
            g.addColorStop(1, "#304958");
            return g;
        });
        ctx.fillStyle = actor.flash > 0 ? "#fff4d6" : plate;
        if (actor.charging > 0 && !reducedMotion.matches) ctx.scale(1.3, 0.8);
        ctx.beginPath(); ctx.moveTo(25, 0); ctx.quadraticCurveTo(3, -18, -18, -18);
        ctx.quadraticCurveTo(-8, 0, -18, 18); ctx.quadraticCurveTo(3, 18, 25, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#142734"; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = "#f2e9c566";
        ctx.beginPath(); ctx.moveTo(23, 0); ctx.lineTo(-16, -16); ctx.lineTo(-5, -2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#d3f5ff"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(30, -14); ctx.lineTo(-2, -14); ctx.moveTo(30, 14); ctx.lineTo(-2, 14); ctx.stroke();
    } else if (actor.kind === "runner") {
        ctx.rotate(facing);
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
        ctx.strokeStyle = "#2e533e"; ctx.lineWidth = 4;
        for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(side * 12, 4); ctx.quadraticCurveTo(side * 25, 8 + stride * side * 3, side * 23, 16); ctx.stroke();
        }
        drawOrb(ctx, -8, -7, 7, "#a0b56b");
        drawOrb(ctx, 8, -7, 7, "#a0b56b");
        circle(ctx, -8, -8, 2, "#e7f5b7"); circle(ctx, 8, -8, 2, "#e7f5b7");
        circle(ctx, 0, 6, 8, "#253e36");
        circle(ctx, 0, 7, 4 + Math.sin(time * 3), "#bde498");
    } else if (actor.kind === "wisp") {
        circle(ctx, 0, 0, 30, "#85c0c626");
        const mist = cachedGradient(ctx, "mist", () => {
            const g = ctx.createRadialGradient(-5, -10, 1, 0, 0, 28);
            g.addColorStop(0, "#c8f2e9"); g.addColorStop(0.45, "#568188"); g.addColorStop(1, "#24344866");
            return g;
        });
        ctx.fillStyle = actor.flash > 0 ? "#fff3d5" : mist;
        ctx.beginPath();
        ctx.moveTo(0, -23 + Math.sin(time * 4) * 3);
        ctx.bezierCurveTo(20, -20, 22, 8, 7, 17);
        ctx.quadraticCurveTo(2, 8, 0, 10);
        ctx.quadraticCurveTo(-6, 23, -10, 19);
        ctx.bezierCurveTo(-24, 9, -20, -18, 0, -23 + Math.sin(time * 4) * 3);
        ctx.closePath();
        ctx.fill();
        circle(ctx, -4, -3, 2, "#e9ffe8");
        circle(ctx, 4, -3, 2, "#e9ffe8");
    } else {
        const base = actor.flash > 0 ? "#fce5bf" : boss ? map.accent : actor.kind === "sentinel" ? "#8b6576" : actor.kind === "brute" ? "#787469" : "#747d6c";
        if (boss) {
            const mantle = cachedGradient(ctx, "mantle:" + r, () => {
                const g = ctx.createLinearGradient(-r, -r, r, r);
                g.addColorStop(0, "#896552"); g.addColorStop(1, "#292331");
                return g;
            });
            ctx.fillStyle = mantle; ctx.strokeStyle = "#d0ac7266"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-r * 0.65, -r);
            ctx.bezierCurveTo(-r * 1.4, -r * 0.4, -r * 1.2, r, -r * 0.8, r * 1.3);
            ctx.quadraticCurveTo(0, r, r * 0.8, r * 1.3);
            ctx.bezierCurveTo(r * 1.2, r, r * 1.4, -r * 0.4, r * 0.65, -r);
            ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.strokeStyle = boss ? "#403845" : "#43453e"; ctx.lineWidth = r * 0.4;
        for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(side * r * 0.4, 2);
            ctx.quadraticCurveTo(side * r * 0.5, r * 0.6, side * r * 0.5, r + stride * side * 5); ctx.stroke();
        }
        const armor = cachedGradient(ctx, "armor:" + r + ":" + base, () => {
            const g = ctx.createLinearGradient(-r, -r, r, r);
            g.addColorStop(0, base); g.addColorStop(0.35, base); g.addColorStop(1, "#27333a");
            return g;
        });
        ctx.fillStyle = armor; ctx.strokeStyle = "#15222b"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-r * 0.65, -r * 0.65);
        ctx.bezierCurveTo(-r * 1.1, -r * 0.15, -r * 0.75, r * 0.65, 0, r * 0.7);
        ctx.bezierCurveTo(r * 0.75, r * 0.65, r * 1.1, -r * 0.15, r * 0.65, -r * 0.65);
        ctx.quadraticCurveTo(0, -r * 0.95, -r * 0.65, -r * 0.65); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "#dfd7b555"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.35); ctx.quadraticCurveTo(0, -r * 0.05, r * 0.5, -r * 0.35); ctx.stroke();
        ctx.fillStyle = "#332d29"; ctx.fillRect(-r * 0.65, r * 0.3, r * 1.3, r * 0.17);
        drawOrb(ctx, 0, r * 0.38, r * 0.13, "#c7a66b");
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
    if (!hero) {
        const defense = enemyDefense(actor);
        if (defense.physical || defense.magical) {
            ctx.save(); ctx.globalAlpha = 0.45; ctx.lineWidth = 1;
            ctx.strokeStyle = defense.magical ? "#baa4ef" : "#a7bfdc";
            ctx.beginPath(); ctx.arc(actor.x, actor.y, r + 3, -0.9, -0.3); ctx.stroke(); ctx.restore();
        }
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
// randomized stage hazards (with staggered slow/warning/burning visual states), the four
// corner brazier lights, then loops enemies to draw attack-telegraph shapes/labels before actors and
// projectiles are drawn later in this function. Kept intentionally simple/flat (no z-sorting beyond
// draw order) since the arena is a flat top-down view.
function render(ctx, floor, state, bossTop = 49, preferences = {}, canvasHud = false) {
    const map = mapForWave(state.wave);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.save();
    const lite = preferences.batterySaver === true;
    if (preferences.shake !== false && !reducedMotion.matches && !lite) {
        const amount = state.shake > 0 ? state.shake * 16 : 0;
        if (amount) ctx.translate(Math.sin(state.time * 70) * amount, Math.cos(state.time * 65) * amount);
    }
    ctx.drawImage(floor, 0, 0, WIDTH, HEIGHT);
    drawAtmosphere(ctx, map, state.time, reducedMotion.matches, WIDTH, HEIGHT);
    // Twenty drifting motes in the act's colour. Positions are derived from time, so no objects are
    // allocated; all twenty are filled in one path (a single draw call). Skipped in Battery Saver.
    if (!lite) {
        const t = reducedMotion.matches ? 0 : state.time;
        for (let i = 0; i < 20; i++) {
            const x = ((i * 197.3 + t * (8 + (i % 5) * 3)) % (WIDTH + 40)) - 20;
            const y = ((i * 131.7 - t * (5 + (i % 3) * 4)) % HEIGHT + HEIGHT) % HEIGHT + Math.sin(t + i) * 6;
            drawGlow(ctx, x, y, 7 + (i % 3) * 2, map.accent, 0.18 + 0.14 * Math.sin(t * 1.7 + i));
        }
    }
    const enemiesAlive = state.enemies.some(enemy => enemy.health > 0);
    for (const hazard of arenaHazards(state)) {
        const phase = hazardPhase(hazard, state.time);
        if (phase < 0) continue;
        const burning = map.hazard !== "slow" && phase >= 4 && enemiesAlive;
        const warning = map.hazard !== "slow" && phase >= 2 && !burning && enemiesAlive;
        if (burning || warning) drawGlow(ctx, hazard.x, hazard.y, hazard.radius * 1.35, map.accent, burning ? 0.38 : 0.2 + 0.1 * Math.sin(state.time * 8));
        const idle = !burning && !warning;
        ctx.save();
        if (idle) ctx.globalAlpha *= 0.45;
        circle(ctx, hazard.x, hazard.y, hazard.radius, map.hazard === "slow" ? map.accent + "20" : burning ? map.accent + "77" : warning ? map.accent + "44" : "#4e333366");
        ctx.strokeStyle = preferences.contrast ? "#fff3cc" : map.accent;
        ctx.lineWidth = preferences.contrast ? 4 : idle ? 1.5 : 2;
        ctx.beginPath(); ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.textAlign = "center"; ctx.font = "10px 'Segoe UI', sans-serif"; ctx.fillStyle = map.accent;
        ctx.fillText(map.hazard === "slow" ? "SLOW" : burning ? map.hazard.toUpperCase() : warning ? "DANGER SOON" : `${map.hazard.toUpperCase()} SEAL`, hazard.x, hazard.y + 4);
        ctx.restore();
        if (burning) {
            for (let i = 0; i < 8; i++) {
                const angle = i * Math.PI / 4 + state.time;
                circle(ctx, hazard.x + Math.cos(angle) * hazard.radius * 0.6, hazard.y + Math.sin(angle) * hazard.radius * 0.6, 5, "#ffd295");
            }
        }
    }
    for (const [x, y] of [[74, 75], [WIDTH - 74, 75], [74, HEIGHT - 75], [WIDTH - 74, HEIGHT - 75]]) {
        const flicker = Math.sin(state.time * 8 + x) * 2;
        drawGlow(ctx, x, y - 17, 46 + flicker * 2, "#ffae50", 0.32);
        circle(ctx, x, y - 17, 7 + flicker, "#e5a14f");
        circle(ctx, x, y - 19, 3, "#ffe1a0");
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
            const identity = bossProfile(state.wave);
            const angle = Math.atan2(enemy.attackY - enemy.y, enemy.attackX - enemy.x);
            const color = pattern === 1 ? "#ff956f" : pattern === 2 ? "#ffdc86" : "#d6adff";
            ctx.strokeStyle = preferences.contrast ? "#fff3cc" : color; ctx.fillStyle = color + "33"; ctx.lineWidth = preferences.contrast ? 5 : 3;
            drawBossDanger(ctx, identity, enemy);
            if (pattern === 2 && enemy.combat.phase >= 2) {
                const spread = Math.max(...identity.fan.map(Math.abs)) + 0.05;
                ctx.beginPath(); ctx.moveTo(enemy.x, enemy.y); ctx.arc(enemy.x, enemy.y, 210, angle - spread, angle + spread); ctx.closePath(); ctx.fill(); ctx.stroke();
            } else if (pattern === 3 && enemy.combat.phase >= 3) {
                for (let i = 0; i < identity.rays; i++) {
                    const ray = angle + i * Math.PI * 2 / identity.rays;
                    ctx.beginPath(); ctx.moveTo(enemy.x + Math.cos(ray) * 40, enemy.y + Math.sin(ray) * 40);
                    ctx.lineTo(enemy.x + Math.cos(ray) * 150, enemy.y + Math.sin(ray) * 150); ctx.stroke();
                }
            }
            ctx.fillStyle = color; ctx.textAlign = "center"; ctx.font = "bold 11px 'Segoe UI', sans-serif";
            const warningPosition = bossWarningPosition(enemy, bossTop);
            ctx.strokeStyle = '#081218'; ctx.lineWidth = 4;
            ctx.strokeText(bossWarning(identity, pattern), warningPosition.x, warningPosition.y, 400);
            ctx.fillText(bossWarning(identity, pattern), warningPosition.x, warningPosition.y, 400);
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
    for (const actor of actors) {
        const appearance = actor === state.player || actor.appearanceAt === undefined ? 1
            : Math.max(0, Math.min(1, (state.time - actor.appearanceAt) / 0.25));
        if (appearance === 0) continue;
        ctx.save();
        ctx.globalAlpha *= appearance;
        if (!reducedMotion.matches) {
            const hero = actor === state.player;
            // Squash on spawn (lands wide then settles) and stretch along the roll while dodging.
            const squash = appearance < 1 ? 1 + (1 - appearance) * 0.35 : 1;
            const rolling = hero && actor.rolling > 0;
            if (squash !== 1 || rolling) {
                ctx.translate(actor.x, actor.y);
                if (rolling) {
                    const angle = Math.atan2(actor.rollY, actor.rollX);
                    ctx.rotate(angle); ctx.scale(1.18, 0.86); ctx.rotate(-angle);
                } else ctx.scale(squash, 1 / squash);
                ctx.translate(-actor.x, -actor.y);
            }
        }
        drawActor(ctx, actor, state.player, state.time, map, state.heroClass);
        ctx.restore();
    }
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
    if (state.relicBanner && state.time - state.relicBanner.at < 4) {
        const age = state.time - state.relicBanner.at, relic = RELICS[state.relicBanner.key];
        const alpha = Math.min(1, age * 4, (4 - age) * 2);
        ctx.save(); ctx.globalAlpha = alpha; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const cx = WIDTH / 2, cy = HEIGHT * 0.32;
        ctx.fillStyle = "#0b1417e6"; ctx.strokeStyle = relic.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(cx - 260, cy - 48, 520, 96, 16); ctx.fill(); ctx.stroke();
        ctx.fillStyle = relic.color; ctx.font = "bold 14px 'Segoe UI', sans-serif";
        ctx.fillText("RARE RELIC FOUND", cx, cy - 26);
        ctx.font = "bold 26px 'Segoe UI', sans-serif"; ctx.fillText(relic.name, cx, cy + 2);
        ctx.fillStyle = "#f3dfb9"; ctx.font = "14px 'Segoe UI', sans-serif"; ctx.fillText(relic.detail, cx, cy + 30);
        ctx.restore();
    }
    for (const burn of state.burns ?? []) {
        const fade = Math.min(1, burn.life / 0.6);
        ctx.save();
        const glow = ctx.createRadialGradient(burn.x, burn.y, 0, burn.x, burn.y, burn.radius);
        glow.addColorStop(0, `rgba(255, 150, 60, ${0.38 * fade})`);
        glow.addColorStop(0.65, `rgba(200, 60, 20, ${0.22 * fade})`);
        glow.addColorStop(1, "rgba(120, 20, 0, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(burn.x, burn.y, burn.radius, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255, 196, 92, ${0.85 * fade})`;
        for (let i = 0; i < 9; i++) {
            const angle = i * 2.399 + burn.x * 0.01, r = burn.radius * (0.2 + (i % 4) * 0.2);
            const x = burn.x + Math.cos(angle) * r, y = burn.y + Math.sin(angle) * r;
            const h = (reducedMotion.matches ? 9 : 7 + Math.sin(state.time * 9 + i * 1.7) * 4) * fade;
            ctx.beginPath(); ctx.moveTo(x - 4, y + 3); ctx.quadraticCurveTo(x - 2, y - h * 0.4, x, y - h); ctx.quadraticCurveTo(x + 2, y - h * 0.4, x + 4, y + 3); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    }
    let burstGlows = 0;
    for (const item of state.effects) {
        const progress = reducedMotion.matches && item.kind !== "text" ? 0.65 : 1 - item.life / item.maxLife;
        ctx.save();
        ctx.globalAlpha = 1 - progress;
        ctx.strokeStyle = item.color;
        ctx.fillStyle = item.color;
        ctx.lineWidth = 3 * (1 - progress) + 1;
        if (item.kind === 'boss-strike') {
            drawBossStrike(ctx, item, progress);
        } else if (item.kind === 'boss-intro') {
            ctx.globalAlpha = Math.min(1, item.life, (item.maxLife - item.life) * 3);
            ctx.font = '16px Georgia, serif'; ctx.textAlign = 'center';
            const lines = item.text.split(' · ');
            ctx.fillText(lines[0], WIDTH / 2, 105); ctx.font = "12px 'Segoe UI', sans-serif"; ctx.fillText(lines[1], WIDTH / 2, 124);
        } else if (item.kind === 'impact') {
            ctx.lineWidth = 2;
            if (item.damageType === 'magical') {
                ctx.beginPath(); ctx.arc(item.x, item.y, item.radius + progress * 12, 0, Math.PI * 2); ctx.stroke();
            } else {
                for (let i = 0; i < 3; i++) {
                    const angle = i * Math.PI * 2 / 3;
                    ctx.beginPath(); ctx.moveTo(item.x + Math.cos(angle) * item.radius * 0.5, item.y + Math.sin(angle) * item.radius * 0.5);
                    ctx.lineTo(item.x + Math.cos(angle) * (item.radius + 8), item.y + Math.sin(angle) * (item.radius + 8)); ctx.stroke();
                }
            }
        } else if (item.kind === "text") {
            if (/^(CRIT )?-?\d+( (MAG|PHY))?$/.test(item.text) && (preferences.damageNumbers === "off" || preferences.damageNumbers === "reduced" && !item.text.startsWith("CRIT") && !item.text.startsWith("-"))) { ctx.restore(); continue; }
            const crit = item.text.startsWith("CRIT");
            const pop = reducedMotion.matches ? 1 : 1 + Math.max(0, 0.18 - progress) * (crit ? 3.5 : 2);
            const size = Math.round((crit ? 21 : 15) * pop);
            ctx.font = `bold ${size}px 'Segoe UI', sans-serif`;
            ctx.textAlign = "center";
            ctx.strokeStyle = crit ? "#3a1f04" : "#111921"; ctx.lineWidth = crit ? 4.5 : 3;
            if (crit) ctx.fillStyle = "#ffc93a";
            const drift = reducedMotion.matches ? 0 : progress * (crit ? 42 : 32);
            const sway = reducedMotion.matches ? 0 : Math.sin(item.x + progress * 3) * 6 * progress;
            ctx.strokeText(item.text, item.x + sway, item.y - drift);
            ctx.fillText(item.text, item.x + sway, item.y - drift);
        } else if (item.kind === "relic-arrow") {
            const travel = Math.min(1, progress * 2.5), len = item.radius * travel;
            ctx.globalAlpha = Math.max(0, 1 - progress * 1.2);
            ctx.translate(item.x, item.y); ctx.rotate(item.angle);
            ctx.lineWidth = 6; ctx.globalAlpha *= 0.35;
            ctx.beginPath(); ctx.moveTo(Math.max(0, len - 70), 0); ctx.lineTo(len, 0); ctx.stroke();
            ctx.globalAlpha /= 0.35; ctx.lineWidth = 2; ctx.strokeStyle = "#effcff";
            ctx.beginPath(); ctx.moveTo(Math.max(0, len - 34), 0); ctx.lineTo(len, 0); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(len + 6, 0); ctx.lineTo(len - 4, -5); ctx.lineTo(len - 4, 5); ctx.closePath(); ctx.fill();
        } else if (item.kind === "class-skill") {
            drawClassSkillEffect(ctx, item, progress, reducedMotion.matches);
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
            ctx.lineWidth = (15 + (item.edge ?? 0) * 3) * (1 - progress);
            ctx.beginPath();
            ctx.arc(item.x, item.y, item.radius * (0.6 + progress * 0.4), item.angle - arc, item.angle + arc);
            ctx.stroke();
            ctx.strokeStyle = "#fff1c9"; ctx.lineWidth = Math.max(1, (3 + (item.edge ?? 0)) * (1 - progress)); ctx.stroke();
            if (item.rhythm) {
                ctx.globalAlpha *= 0.45; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(item.x, item.y, item.radius * (0.45 + progress * 0.3), item.angle - arc * 0.8, item.angle + arc * 0.8); ctx.stroke();
            }
        } else if (item.kind === "burst") {
            // Death burst: one soft cached glow (max 6 at once) plus a ring and 6 chunks in one path.
            const fade = 1 - progress;
            if (!lite && burstGlows++ < 6) drawGlow(ctx, item.x, item.y, item.radius * (0.9 + progress * 0.6), item.color, 0.55 * fade);
            ctx.globalAlpha = fade;
            ctx.lineWidth = 3 * fade + 1;
            ctx.beginPath(); ctx.arc(item.x, item.y, Math.max(1, item.radius * (0.4 + progress * 1.2)), 0, Math.PI * 2); ctx.stroke();
            const ease = 1 - fade * fade, size = 3 * fade + 0.5;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = i * Math.PI / 3 + item.x * 0.01;
                const reach = item.radius * (0.3 + ease * 1.5);
                const x = item.x + Math.cos(angle) * reach, y = item.y + Math.sin(angle) * reach;
                ctx.moveTo(x + size, y); ctx.arc(x, y, size, 0, Math.PI * 2);
            }
            ctx.fill();
        } else {
            if (item.hostile) {
                ctx.save();
                ctx.globalAlpha = 0.28 * (1 - progress);
                ctx.fillStyle = item.color;
                ctx.beginPath(); ctx.arc(item.x, item.y, Math.max(1, item.radius * Math.min(1, progress * 1.6)), 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1 - progress * 0.7; ctx.lineWidth = 5; ctx.strokeStyle = "#fff3dc";
                ctx.beginPath(); ctx.arc(item.x, item.y, Math.max(1, item.radius * Math.min(1, progress * 1.6)), 0, Math.PI * 2); ctx.stroke();
                ctx.restore();
            }
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
    for (const bolt of state.projectiles) {
        if (bolt.boss) { drawBossProjectile(ctx, bolt, state.time, lite); continue; }
        ctx.save();
        const speed = Math.hypot(bolt.vx, bolt.vy) || 1;
        drawGlow(ctx, bolt.x, bolt.y, 26, "#ff3d70", 0.45);
        if (!lite) {
            for (let i = 1; i <= 3; i++) {
                circle(ctx, bolt.x - bolt.vx / speed * i * 11, bolt.y - bolt.vy / speed * i * 11, 6 - i * 1.4, `rgba(255, 82, 122, ${0.42 - i * 0.12})`);
            }
        }
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(bolt.x - bolt.vx / speed * 30, bolt.y - bolt.vy / speed * 30); ctx.lineTo(bolt.x, bolt.y);
        ctx.strokeStyle = "#100c1b"; ctx.lineWidth = 10; ctx.stroke();
        ctx.strokeStyle = "#ff527a"; ctx.lineWidth = 5; ctx.stroke();
        circle(ctx, bolt.x, bolt.y, 9, "#140c1e");
        circle(ctx, bolt.x, bolt.y, 7, "#ff466d");
        circle(ctx, bolt.x, bolt.y, 3.5, "#fff5fc");
        ctx.strokeStyle = "#ffe1ec"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(bolt.x, bolt.y, 7, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    }
    const boss = state.enemies.find(enemy => enemy.kind === "boss" && enemy.health > 0);
    if (boss && !canvasHud) {
        ctx.textAlign = "center";
        ctx.font = "14px Georgia, serif";
        ctx.fillStyle = "#e4c9a4";
        ctx.fillText(map.boss.toUpperCase(), WIDTH / 2, bossTop);
        ctx.fillStyle = "#090e11";
        ctx.fillRect(WIDTH / 2 - 180, bossTop + 12, 360, 8);
        ctx.fillStyle = "#ae6656";
        ctx.fillRect(WIDTH / 2 - 180, bossTop + 12, 360 * boss.health / boss.maxHealth, 8);
        ctx.fillStyle = "#f0c08b88"; ctx.fillRect(WIDTH / 2 - 180, bossTop + 12, 360 * boss.health / boss.maxHealth, 2);
        ctx.strokeStyle = map.accent; ctx.lineWidth = 1; ctx.strokeRect(WIDTH / 2 - 184, bossTop + 8, 368, 16);
        for (const side of [-1, 1]) {
            ctx.save(); ctx.translate(WIDTH / 2 + side * 190, bossTop + 16); ctx.rotate(Math.PI / 4);
            ctx.fillStyle = map.accent; ctx.fillRect(-3, -3, 6, 6); ctx.restore();
        }
    }
    ctx.restore();
}

// Draws the pulsing full-screen "resumeDelay" countdown overlay shown briefly after unpausing or
// traveling to a new checkpoint/wave, during which combat is frozen (see step()'s early-return for
// state.resumeDelay > 0). Purely cosmetic — the actual freeze logic lives in arpg-engine.js.
function drawCountdown(ctx, state, mobile = false) {
    if (state.resumeDelay <= 0 || state.status !== "playing") return;
    ctx.save();
    ctx.fillStyle = `rgba(5, 12, 17, ${reducedMotion.matches ? 0.85 : 0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, state.resumeDelay / 3))})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.textAlign = "center"; ctx.fillStyle = "#f5dbab"; ctx.font = "28px Georgia, serif";
    ctx.fillText(state.travelPending ? `Traveling to ${mapForWave(state.wave + 1).name}` : "Find your footing", WIDTH / 2, HEIGHT / 2 - 55);
    ctx.font = "bold 70px Georgia, serif"; ctx.fillText(String(Math.ceil(state.resumeDelay)), WIDTH / 2, HEIGHT / 2 + 25);
    ctx.font = "16px 'Segoe UI', sans-serif"; ctx.fillText(mobile ? "Combat is frozen" : "Combat is frozen · P to pause", WIDTH / 2, HEIGHT / 2 + 70);
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
    let bossTop = 49;
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
    const audio = createGameAudio();
    const preferences = bindPreferences(root);
    const togglePause = target => engineTogglePause(target, root.dataset.quickTravel === "true");
    const buttonFeedback = bindButtonFeedback(root);
    const audioMute = root.querySelector("[data-audio-mute]");
    const audioMusic = root.querySelector("[data-audio-music]");
    const audioEffects = root.querySelector("[data-audio-effects]");
    const audioStatus = root.querySelector("[data-audio-status]");
    function updateAudioControls() {
        const settings = audio.settings;
        if (audioMute) audioMute.checked = settings.muted;
        if (audioMusic) audioMusic.value = Math.round(settings.music * 100);
        if (audioEffects) audioEffects.value = Math.round(settings.effects * 100);
        if (audioStatus) audioStatus.textContent = !(window.AudioContext || window.webkitAudioContext)
            ? "Audio is unavailable in this browser. Visual warnings remain active."
            : settings.muted ? "Audio muted. Visual warnings remain active."
            : `Music ${Math.round(settings.music * 100)}% · Effects ${Math.round(settings.effects * 100)}%.`;
    }
    updateAudioControls();
    for (const [element, key] of [[audioMute, "muted"], [audioMusic, "music"], [audioEffects, "effects"]]) {
        if (element) on(element, key === "muted" ? "change" : "input", () => {
            audio.setSettings({ [key]: key === "muted" ? element.checked : Number(element.value) / 100 });
            updateAudioControls();
        });
    }
    const unlockAudio = event => {
        if (!event.isTrusted || document.hidden) return;
        audio.setBackground(false);
        void audio.unlock();
    };
    on(window, "pointerdown", unlockAudio, { capture: true });
    on(window, "keydown", unlockAudio, { capture: true });
    on(root, "click", event => {
        const button = event.target.closest("button");
        // Buttons whose action already has its own cue (forge purchase, training, cards, tree
        // nodes, skill slotting) skip the generic click so two sounds never stack.
        if (event.isTrusted && button && !button.disabled && !button.matches("[data-skill], [data-move], [data-upgrade], [data-mastery-stat], [data-card-id], [data-learn-skill], [data-choose-run-skill], [data-slot-unlocked]")) audio.play("button");
    }, { capture: true });
    on(window, "pagehide", () => audio.setBackground(true));
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
    const rerollButton = root.querySelector("[data-card-reroll]");
    const rerollsUsed = new WeakMap();
    const keys = new Set();
    const pointers = new Map();
    let aim = null;
    let state = createState();
    if (releaseRankings) resetToReleaseRankings(state);
    let best = 0;
    let frame = 0;
    let last = 0;
    let hudTime = 0;
    let canvasCssWidth = 0, canvasCssHeight = 0, idleDrawTime = 0, idleDrawKey = "";
    let stageFade = 0, stageFadeMap = null, stageFadeTime = 0, suppressTravelFade = false;
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
    const challengeNudge = root.querySelector("[data-challenge-nudge]");
    const challengeNudgeText = root.querySelector("[data-challenge-nudge-text]");
    let challengeNudgeDismissedStage = 0, holdForChallenge = false;
    let bargainOutcome = null;
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
    const setupSkillButtons = [...root.querySelectorAll("[data-choose-starter-skill]")];
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
    let lastSaverMode;
    function updateCanvasResolution() {
        lastSaverMode = root.dataset.batterySaver;
        const bounds = canvas.getBoundingClientRect();
        canvasCssWidth = bounds.width;
        canvasCssHeight = bounds.height;
        bossTop = root.dataset.canvasHud === "on" ? 150 * HEIGHT / Math.max(1, bounds.height) : bossHudTop(bounds);
        const maxScale = root.dataset.batterySaver === "true" ? 1 : root.dataset.canvasHud === "on" ? 1.25 : 2;
        const scale = Math.max(1, Math.min(maxScale, bounds.width / WIDTH * (window.devicePixelRatio || 1)));
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
        { title: "Move, aim, strike", text: "Move with WASD or arrows. Attacks and chosen skills cast automatically.", touch: "Drag the left side of the screen to move. Attacks and skills fire on their own." },
        { title: "Read danger before it strikes", text: "Space dodges, E drinks a flask (max 5). Leave marked circles, lanes and arcs.", touch: "Tap Dodge to roll and the flask to heal (max 5). Step out of marked circles and lanes." },
        { title: "Spend gold to survive", text: "Open Forge to buy weapon, armor and skill ranks. Checkpoints autosave.", touch: "Pause, then open Forge to spend gold and Skills to spend points. Checkpoints autosave." }
    ];
    const tutorialKey = "pob-touch-tutorial-seen";
    const tutorialSeen = () => { try { return localStorage.getItem(tutorialKey) === "1"; } catch { return true; } };
    const markTutorialSeen = () => { try { localStorage.setItem(tutorialKey, "1"); } catch { /* storage unavailable */ } };
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
        if (!saveBridge || disposed || releaseRankings && root.dataset.cloudSignedIn !== "on") return;
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
            if (!disposed && generation === accountGeneration) rankingStatus.textContent = "Score sync failed. Keep this page open; it will retry automatically.";
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
    const loreReader = root.querySelector("[data-lore-reader]");
    const loreSeen = new WeakMap();
    let loreResume = false;
    function openLore(chapterWave = state.status === "camp" && state.wave % 5 === 0 ? state.wave : Math.max(1, state.wave)) {
        if (saving || setupAction || inMainMenu || state.mode !== "campaign" || !["playing", "paused", "camp", "won"].includes(state.status)) return;
        loreResume = state.status === "playing";
        if (loreResume) togglePause(state);
        const chapter = mapForWave(chapterWave);
        const identity = bossProfile(chapterWave);
        root.querySelector("[data-lore-chapter]").textContent = chapter.chapter;
        root.querySelector("[data-lore-title]").textContent = chapter.name;
        root.querySelector("[data-lore-story]").textContent = chapter.story;
        root.querySelector("[data-lore-boss]").textContent = `${chapter.boss} — ${identity.title}`;
        root.querySelector("[data-lore-boss-story]").textContent = identity.lore;
        root.querySelector("[data-lore-tactics]").textContent = `Watch for ${identity.warning.toLowerCase()}. At two-thirds and one-third health, new projectile patterns appear. Each special is warned before it strikes; attack during recovery, but avoid projectiles already in flight.`;
        root.querySelector("[data-lore-ending]").textContent = ["camp", "won"].includes(state.status) ? chapter.ending : "";
        clearInput();
        updateHud();
        loreReader.hidden = false;
        root.querySelector("[data-close-lore]").focus({ preventScroll: true });
    }
    on(root.querySelector("[data-open-lore]"), "click", () => openLore());
    on(root.querySelector("[data-close-lore]"), "click", () => {
        loreReader.hidden = true;
        if (loreResume && state.status === "paused" && !inMainMenu && !saving) togglePause(state);
        loreResume = false;
        clearInput();
        last = performance.now();
        updateHud();
        canvas.focus({ preventScroll: true });
    });
    const mainMenu = root.querySelector("[data-main-menu]");
    const emberCamp = root.querySelector("[data-ember-camp]");
    function renderCamp() {
        const profile = loadProfile();
        emberCamp.querySelector("[data-camp-balance]").textContent = `${profile.embers} Embers · earned every run, even when you fall.`;
        const nodes = emberCamp.querySelector("[data-camp-nodes]");
        nodes.replaceChildren(...Object.entries(CAMP_NODES).map(([key, node]) => {
            const cost = campCost(key), button = document.createElement("button");
            button.type = "button";
            button.className = "quiet-button camp-node";
            const affordable = cost !== null && profile.embers >= cost;
            button.setAttribute("aria-disabled", String(!affordable));
            button.classList.toggle("is-maxed", cost === null);
            button.classList.toggle("is-unaffordable", cost !== null && !affordable);
            const name = document.createElement("b"), detail = document.createElement("small"), price = document.createElement("small");
            name.textContent = `${node.name} ${profile.camp[key]}/${node.max}`;
            detail.textContent = node.detail;
            price.textContent = cost === null ? "Maxed" : affordable ? `Buy · ${cost} Embers` : `${cost} Embers · need ${cost - profile.embers} more`;
            button.append(name, detail, price);
            button.addEventListener("click", () => { if (buyCampNode(key)) renderCamp(); });
            return button;
        }));
        const found = RELIC_KEYS.filter(key => profile.codex[key]).length;
        emberCamp.querySelector("[data-codex-hint]").textContent = `${found}/${RELIC_KEYS.length} found. Relics are extremely rare finds from any foe (bosses and elites slightly more often).`;
        emberCamp.querySelector("[data-camp-codex]").replaceChildren(...RELIC_KEYS.map(key => {
            const card = document.createElement("div"), name = document.createElement("b"), detail = document.createElement("small");
            const known = !!profile.codex[key];
            card.className = `camp-relic${known ? "" : " is-unknown"}`;
            card.style.setProperty("--relic", RELICS[key].color);
            name.textContent = known ? RELICS[key].name : "??? Undiscovered relic";
            detail.textContent = known ? `${RELICS[key].detail} Found ${profile.codex[key]}×.` : "Keep hunting.";
            card.append(name, detail);
            return card;
        }));
        const mastery = emberCamp.querySelector("[data-camp-mastery]");
        mastery.replaceChildren(...CLASS_ORDER.map(hero => {
            const row = document.createElement("div"), m = profile.mastery[hero];
            row.className = "camp-mastery-row";
            const title = document.createElement("strong");
            title.textContent = classUnlocked(hero)
                ? `${HERO_CLASSES[hero].name} · Mastery ${m.level}/${MASTERY_MAX}`
                : `\u{1F512} ${HERO_CLASSES[hero].name}`;
            const rewards = document.createElement("small");
            const next = MASTERY_REWARDS.find(r => r.level > m.level);
            const label = r => r.kind === "starter" ? `new starting skill (${skillName({ heroClass: hero }, r.value)})` : r.label.replace(/\s*\(cosmetic\)/i, "");
            rewards.textContent = !classUnlocked(hero) ? CLASS_UNLOCK_HINT[hero]
                : next ? `Next at ${next.level}: ${label(next)}` : "All rewards unlocked.";
            row.append(title);
            if (classUnlocked(hero)) {
                const bar = document.createElement("div"), fill = document.createElement("i");
                bar.className = "camp-mastery-bar";
                fill.style.width = `${m.level >= MASTERY_MAX ? 100 : Math.min(100, m.xp / masteryStep(m.level) * 100)}%`;
                bar.append(fill);
                row.append(bar);
            }
            row.append(rewards);
            const trims = unlockedTrims(hero);
            if (classUnlocked(hero) && trims.length) {
                const picker = document.createElement("select");
                picker.setAttribute("aria-label", `${HERO_CLASSES[hero].name} trim`);
                for (const [value, label] of [["", "Default trim"], ...trims.map(t => [t.value, t.label])]) picker.add(new Option(label, value, false, profile.trim[hero] === value));
                picker.addEventListener("change", () => setTrim(hero, picker.value));
                row.append(picker);
            }
            return row;
        }));
    }
    on(root.querySelector("[data-open-camp]"), "click", () => { renderCamp(); emberCamp.hidden = false; emberCamp.querySelector("[data-close-camp]").focus({ preventScroll: true }); });
    on(emberCamp.querySelector("[data-close-camp]"), "click", () => { emberCamp.hidden = true; });
    function noteProgress() {
        setRelayForks(relayForks(state.heroClass));
        const discovered = recordRelics(state);
        if (discovered.length) saveStatus.textContent = `New codex entry: ${discovered.map(key => RELICS[key].name).join(", ")}!`;
        const earned = creditProgress(state);
        if (!earned) return;
        const notes = [];
        if (earned.levels.length) notes.push(`${HERO_CLASSES[state.heroClass].name} mastery ${earned.levels.at(-1)}!`);
        for (const hero of earned.unlocked) notes.push(`New class unlocked: ${HERO_CLASSES[hero].name}!`);
        if (notes.length) saveStatus.textContent = notes.join(" ");
    }
    let inMainMenu = true;
    let setupFromMain = false;
    root.dataset.mainMenu = "on";
    function showMainMenu(show) {
        if (saving || setupAction) return;
        if (show && state.status === "playing") togglePause(state);
        inMainMenu = show;
        if (show) { loreReader.hidden = true; loreResume = false; }
        mainMenu.hidden = !show;
        root.dataset.mainMenu = show ? "on" : "off";
        clearInput();
        updateHud();
    }
    on(root.querySelector("[data-open-main-menu]"), "click", () => {
        root.dispatchEvent(new CustomEvent("main-menu-open"));
        showMainMenu(true);
    });
    const deathMainMenu = root.querySelector("[data-death-main-menu]");
    on(deathMainMenu, "click", () => {
        root.dispatchEvent(new CustomEvent("main-menu-open"));
        showMainMenu(true);
    });
       
    const mainPlay = root.querySelector("[data-main-play]");
    const mainPlayMenu = root.querySelector("[data-main-play-menu]");

    if (mainPlay && mainPlayMenu && mainMenu) {

        function closePlayMenu() {
            mainPlayMenu.hidden = true;
            mainPlay.setAttribute("aria-expanded", "false");
            mainPlay.focus({ preventScroll: true });
        }

        mainPlay.addEventListener("click", () => {
            const open = mainPlayMenu.hidden;

            mainPlayMenu.hidden = !open;
            mainPlay.setAttribute("aria-expanded", String(open));
        });

        // Clicking the dimmed area closes the modal.
        mainMenu.addEventListener("click", event => {
            if (
                !mainPlayMenu.hidden &&
                event.target === mainMenu
            ) {
                closePlayMenu();
            }
        });

        // Escape closes the modal on desktop.
        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && !mainPlayMenu.hidden) {
                closePlayMenu();
            }
        });
    }

    on(root.querySelector("[data-close-play-menu]"), "click", () => {
        mainPlayMenu.hidden = true;
        mainPlay.setAttribute("aria-expanded", "false");
        mainPlay.focus({ preventScroll: true });
    });
    
    on(root.querySelector("[data-main-resume]"), "click", () => { showMainMenu(false); if (state.status === "paused") begin(); });
    on(root.querySelector("[data-main-new]"), "click", async () => {
        if (state.status !== "ready" && !await gameConfirm("Start a new campaign? Unsaved progress in the current run will be replaced.")) return;
        showMainMenu(false);
        setupFromMain = true;
        openSetup("campaign");
    });
    const mainEndless = root.querySelector("[data-main-endless]");
    on(mainEndless, "click", async () => {
        if (!(endlessUnlocked || state.campaignComplete === 1)) return;
        if (state.status !== "ready" && state.status !== "dead"
            && !await gameConfirm("Start a new Endless run? The current run ends and its score is submitted. Unsaved progress will be replaced.")) return;
        showMainMenu(false);
        setupFromMain = true;
        openSetup("endless");
    });
    on(root.querySelector("[data-main-load]"), "click", () => { showMainMenu(false); loadButton.click(); });
    on(root, 'open-main-panel', () => { showMainMenu(false); });
    on(root.querySelector("[data-main-options]"), "click", () => {
        showMainMenu(false);
        root.dispatchEvent(new CustomEvent("open-run-options", { detail: { fromMain: true } }));
        if (root.dataset.canvasHud !== "on") root.querySelector("[data-run-options]").scrollIntoView({ block: "start" });
    });
    for (const select of root.querySelectorAll("[data-equipment-style]")) on(select, "change", () => {
        if (!saving && setEquipmentStyle(state, select.dataset.equipmentStyle, select.value)) updateHud();
    });
    const challengeButtons = [...root.querySelectorAll("[data-challenge-choice]")];
    const challengePickedFor = (challenge, key) => !challenge.resolved
        && challenge.stage === Math.floor(state.wave / 5) + 1 && challenge.key === key;
    for (const [attribute, accept] of [["data-stage-event-accept", true], ["data-stage-event-skip", false]]) for (const eventButton of root.querySelectorAll(`[${attribute}]`)) {
        on(eventButton, "click", async () => {
            if (saving) return;
            const goldBefore = state.gold, flasksBefore = state.player.potions, healthBefore = state.player.health, levelBefore = state.player.level;
            const name = stageEvent(state).name;
            if (!resolveStageEvent(state, accept, DIFFICULTIES[state.difficulty]?.healing ?? 1, MAX_FLASKS, amount => grantExperience(state, amount))) return;
            const gained = state.gold - goldBefore, flasks = flasksBefore - state.player.potions, health = Math.round(state.player.health - healthBefore), levels = state.player.level - levelBefore;
            bargainOutcome = { wave: state.wave, text: !accept ? `You passed by the ${name.toLowerCase()}.`
                : `✓ Bargain done: ${[gained > 0 ? `+${gained} gold` : gained < 0 ? `${gained} gold` : "", flasks > 0 ? `-${flasks} flask` : "", health ? `${health > 0 ? "+" : ""}${health} health` : "", levels > 0 ? `+${levels} level${levels > 1 ? "s" : ""} — choose your boon${levels > 1 ? "s" : ""}` : ""].filter(Boolean).join(", ")}.` };
            updateHud();
            if (["camp", "won"].includes(state.status)) await persist(false);
        });
    }
    for (const button of challengeButtons) on(button, "click", () => {
        if (!saving) acceptChallenge(state, button.dataset.challengeChoice);
        updateHud();
    });
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
        for (const option of classSelect.options) {
            const locked = !classUnlocked(option.value);
            option.disabled = locked;
            option.textContent = `${locked ? "\u{1F512} " : ""}${HERO_CLASSES[option.value].name}${locked ? " — locked" : ` — Mastery ${loadProfile().mastery[option.value].level}`}`;
        }
        if (!classUnlocked(classSelect.value)) classSelect.value = "knight";
        const hero = HERO_CLASSES[classSelect.value];
        const lockedClasses = CLASS_ORDER.filter(key => !classUnlocked(key));
        classPreview.querySelector("[data-class-title]").textContent = hero.name;
        classPreview.querySelector("[data-class-description]").textContent = hero.description
            + (lockedClasses.length ? ` More classes to unlock: ${lockedClasses.map(key => `${HERO_CLASSES[key].name} (${CLASS_UNLOCK_HINT[key]})`).join(" ")}` : "");
        classPreview.querySelector("[data-class-stats]").textContent = `${hero.health} health · ${hero.damage} damage · ${hero.speed} speed · ${hero.armor}% innate armor`;
        classPreview.querySelector("[data-class-skills]").textContent = `${hero.attackName}: ${hero.attackCooldown}s, ${hero.attackReach} range · ${hero.specialName}: ${hero.specialCooldown}s · Dodge: ${hero.dodgeCooldown}s`;
    }
    on(classSelect, "change", () => {
        updateClassPreview();
        updateSetupLoadout();
    });
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
    const starterPool = () => [...STARTER_SKILLS, ...extraStarters(classSelect.value)];
    function updateSetupLoadout() {
        const preview = setupPreview();
        for (const option of root.querySelectorAll("[data-setup-skill]")) {
            const key = option.dataset.setupSkill;
            option.disabled = !starterPool().includes(key);
            option.textContent = `${skillName(preview, key)}${option.disabled ? " — Locked" : ""}`;
        }
        for (const button of setupSkillButtons) {
            const key = button.dataset.chooseStarterSkill;
            button.querySelector("[data-starter-skill-name]").textContent = skillName(preview, key);
            button.querySelector("img").setAttribute("src", skillIcon(preview, key));
            button.setAttribute("aria-pressed", String(setupSlots[0].value === key));
            button.hidden = !starterPool().includes(key);
            button.disabled = saving;
        }
        if (setupSlots[0].value !== "none" && !starterPool().includes(setupSlots[0].value)) setupSlots[0].value = "none";
        root.querySelector("[data-setup-unlock]").textContent = "Step 1: tap a starting skill. More skills at levels 10 and 20.";
        const loadout = readSetupLoadout();
        const valid = validLoadout(preview, loadout.manual, loadout.auto) && loadout.auto[0] !== "none"
            && (setupAction === "continue" || starterPool().includes(loadout.auto[0]));
        setupNext.disabled = saving;
        setup.dataset.needsSkill = valid ? "off" : "on";
        if (valid) setup.dataset.skillPrompt = "off";
        root.querySelector("[data-setup-loadout-feedback]").textContent = valid
            ? `${skillName(preview, setupSlots[0].value)}: ${skillTagline(preview.heroClass, setupSlots[0].value) || combatSkillDefinition(preview, setupSlots[0].value)?.detail || "Casts automatically at nearby enemies."}`
            : "Tap a skill above to start.";
    }
    for (const select of setupSlots) on(select, "change", () => {
        if (select === setupSlots[0]) {
            for (const auto of setupSlots.slice(1)) if (auto.value === select.value) auto.value = "none";
        }
        updateSetupLoadout();
    });
    for (const button of setupSkillButtons) on(button, "click", () => {
        if (saving || !setupAction || setupAction === "continue") return;
        setupSlots[0].value = button.dataset.chooseStarterSkill;
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
            ? setupAction === "continue" ? "Keep your character. Pick an Endless difficulty."
                : "Locked for this run. Starting replaces your current character."
                : choosingLoadout ? "Pick your first skill. More at levels 10 and 20." : tutorial[setupStep - 1][mobile ? "touch" : "text"];
        setup.dataset.tutorial = !choosingDifficulty && !choosingLoadout ? "on" : "off";
        if (setupStep === 1 && !mobile) {
            const hero = HERO_CLASSES[classSelect.value];
            root.querySelector("[data-setup-description]").textContent = `Move with WASD or arrows. ${hero.attackName} and your skills fire automatically. Space dodges; E drinks a flask.`;
        }
        root.querySelector("[data-setup-difficulty]").hidden = !choosingDifficulty;
        difficultySelect.disabled = !choosingDifficulty;
        setupSkip.hidden = choosingDifficulty || choosingLoadout;
        setupSkip.textContent = mobile ? "Skip tutorial" : "Skip tips & choose skills";
        setupLoadoutPanel.hidden = setupAction === "continue" || (mobile ? !choosingDifficulty : !choosingLoadout);
        setupNext.textContent = mobile ? (choosingDifficulty ? "Start adventure" : setupStep === tutorial.length ? "Got it — begin" : "Next") : choosingLoadout ? setupAction === "campaign" ? "Confirm slots & begin" : "Confirm slots & enter Endless" : "Next";
        setupNext.disabled = saving;
        setup.dataset.skillPrompt = "off";
        if (choosingLoadout || mobile) updateSetupLoadout();
        (choosingDifficulty ? difficultySelect : choosingLoadout ? setupSkillButtons[0] : setupNext).focus({ preventScroll: true });
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
        classSelect.value = classUnlocked(state.heroClass) || action === "continue" ? state.heroClass : "knight";
        setupSlots[0].value = action === "continue" ? state.loadout.auto[0] : "none";
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
        if (setupAction !== "continue" && (!starterPool().includes(loadout.auto[0]) || !classUnlocked(classSelect.value))) return;
        void reportScore();
        if (setupAction === "continue") {
            if (!enterEndless(state, difficultySelect.value)) return;
        } else {
            state = setupAction === "endless" ? startEndlessRun(Math.random, difficultySelect.value, classSelect.value) : startRun(Math.random, difficultySelect.value, classSelect.value);
            state.loadout = loadout;
            applyCampBonuses(state, MAX_FLASKS);
            state.journal += ` Rare relics can drop from any foe. Codex: ${RELIC_KEYS.filter(key => loadProfile().codex[key]).length}/${RELIC_KEYS.length}.`;
            creditProgress(state);
            const chosenChallenge = root.querySelector("[data-setup-challenge]")?.value;
            if (chosenChallenge && chosenChallenge !== "none") state.runSystems.challenge = { key: chosenChallenge, stage: 1, elapsed: 0, damage: 0, flasks: 0, resolved: 0 };
            if (releaseRankings) resetToReleaseRankings(state);
        }
        setupAction = null;
        setupFromMain = false;
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
        if (setupFromMain) {
            setupFromMain = false;
            root.dispatchEvent(new CustomEvent("main-menu-open"));
            showMainMenu(true);
            return;
        }
        updateHud();
        (state.status === "won" ? endlessButton : startButton).focus({ preventScroll: true });
    }
    // Start stays clickable: without a starter skill it points the player at the skill buttons
    // instead of silently doing nothing (beta feedback: "I can't click start and don't know why").
    function promptForSkill() {
        const loadout = readSetupLoadout();
        const needsSkill = setupAction !== "continue" && !starterPool().includes(loadout.auto[0]);
        const atSkillStep = root.dataset.canvasHud === "on" ? setupStep === 0 : setupStep === tutorial.length + 1;
        if (!needsSkill || !atSkillStep) return false;
        setup.dataset.skillPrompt = "on";
        setupSkillButtons[0]?.focus({ preventScroll: true });
        return true;
    }
    on(setupNext, "click", () => {
        if (promptForSkill()) return;
        if (root.dataset.canvasHud === "on") {
            const touringFirstTime = setupAction === "campaign" && !tutorialSeen();
            if (touringFirstTime && setupStep === 0) {
                const loadout = readSetupLoadout();
                if (!STARTER_SKILLS.includes(loadout.auto[0])) return;
                setupStep = 1; showSetupStep(); return;
            }
            if (setupStep >= 1 && setupStep < tutorial.length) { setupStep += 1; showSetupStep(); return; }
            if (setupStep === tutorial.length) markTutorialSeen();
            setupStep = tutorial.length + 1;
            finishSetup();
            return;
        }
        if (setupStep === tutorial.length + 1) finishSetup();
        else { setupStep = setupAction === "continue" ? tutorial.length + 1 : setupStep + 1; showSetupStep(); }
    });
    on(setupSkip, "click", () => {
        if (root.dataset.canvasHud === "on") { markTutorialSeen(); setupStep = tutorial.length + 1; finishSetup(); return; }
        setupStep = tutorial.length + 1; showSetupStep();
    });
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
    // Cached lookups for updateHud(), which runs ~10x per second: static elements are looked up once
    // (re-queried only if Blazor replaced them), and text is written only when it actually changes,
    // avoiding needless DOM mutations that trigger style/layout work on phones.
    const hudCache = new Map();
    const hudOne = selector => {
        let element = hudCache.get(selector);

        if (!element || !element.isConnected || !root.contains(element)) {
            element = root.querySelector(selector);
            hudCache.set(selector, element);
        }

        return element;
    };
    const hudAll = selector => {
        const key = `all:${selector}`;
        let elements = hudCache.get(key);
        if (!elements || !elements.length || !elements[0].isConnected) { elements = Array.from(root.querySelectorAll(selector)); hudCache.set(key, elements); }
        return elements;
    };
    const setText = (element, value) => {
        const next = String(value);
        if (element && element.textContent !== next) element.textContent = next;
    };
    function updateHud() {
        noteProgress();
        const gearPreview = [`Equipped now: damage ${weaponDamage(state)}, physical armor ${armorRating(state).toFixed(1)}%, spell resistance ${resistanceRating(state).toFixed(1)}%, movement ${Math.round(movementSpeed(state))}.`];
        if (state.runRelics?.length) for (const key of state.runRelics) gearPreview.push(`Relic · ${RELICS[key].name}: ${RELICS[key].detail}`);
        const equipmentPreview = hudOne('[data-equipment-preview]');
        const gearSignature = gearPreview.join('|');
        if (equipmentPreview.dataset.preview !== gearSignature) {
            equipmentPreview.dataset.preview = gearSignature;
            equipmentPreview.replaceChildren(...gearPreview.map(text => { const row = document.createElement('p'); row.textContent = text; return row; }));
        }
        hudOne("[data-checkpoint-report]").textContent = ["camp", "won"].includes(state.status)
            ? `${checkpointReport(state)} ${checkpointSaveFailed ? "Checkpoint save failed — retry before leaving." : saving ? "Saving checkpoint…" : "Review your run and save before continuing."}`
            : "At each five-wave checkpoint, review the boss relic, challenge result, and optional encounter here.";
        setText(hudOne("[data-build-synergy]"), buildSynergy(state).detail);
        setText(hudOne("[data-boss-relics]"), BOSS_RELICS.filter((_, index) => state.adventures.relics[index]).map(relic => `${relic.name}: ${relic.detail}`).join(" · ") || "Defeat each area boss to earn a unique, non-stacking relic.");
        const codex = hudOne("[data-campaign-codex]");
        const signature = state.adventures.chapters.join("");
        if (codex.dataset.entries !== signature) {
            codex.dataset.entries = signature;
            codex.replaceChildren();
            for (const { map, index } of codexEntries(state)) {
                const entry = document.createElement("details"), heading = document.createElement("summary"), copy = document.createElement("p");
                heading.textContent = map.name;
                copy.textContent = `${map.story} ${bossProfile(index * 5 + 1).lore}`;
                entry.append(heading, copy); codex.append(entry);
            }
        }
        const encounter = stageEvent(state);
        setText(hudOne("[data-stage-event]"), `${encounter.name}: ${eventDetail(state, encounter)} ${eventAvailable(state) ? "One choice at this checkpoint." : "Available before a stage starts at a clear checkpoint; already resolved encounters cannot be repeated."}`);
        for (const attribute of ["data-stage-event-accept", "data-stage-event-skip"]) for (const eventButton of root.querySelectorAll(`[${attribute}]`)) eventButton.disabled = saving || !eventAvailable(state);
        const campEvent = hudOne("[data-camp-event]");
        if (campEvent) {
            const open = eventAvailable(state);
            const atCheckpoint = state.wave > 0 && state.wave % 5 === 0 && !state.enemies.length
                && ["paused", "camp", "won"].includes(state.status);
            campEvent.hidden = !open && !atCheckpoint;
            setText(hudOne("[data-camp-event-name]"), encounter.name);
            setText(hudOne("[data-camp-event-detail]"), open ? eventDetail(state, encounter)
                : bargainOutcome?.wave === state.wave ? bargainOutcome.text : "✓ Already resolved at this checkpoint. A new stranger waits at the next one.");
            hudOne("[data-camp-event-actions]").hidden = !open;
        }
        hudOne("[data-open-lore]").hidden = inMainMenu || state.mode !== "campaign" || state.status === "ready";
        hudOne("[data-main-resume]").disabled = saving || state.status === "ready";
        hudOne('[data-main-resume]').hidden = !['playing', 'paused', 'camp', 'won'].includes(state.status);
        hudOne("[data-main-load]").disabled = saving || checkingUnlock || !saveBridge;
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
        for (const element of hudAll("[data-skill-name]")) {
            const name = skillName(state, element.dataset.skillName) + (element.tagName === "OPTION" && !skillUnlocked(state, element.dataset.skillName) ? " — Locked" : "");
            if (element.textContent !== name) element.textContent = name;
        }
        for (const image of hudAll("img[data-skill-icon]")) {
            const src = skillIcon(state, image.dataset.skillIcon);
            if (image.getAttribute("src") !== src) image.setAttribute("src", src);
        }
        const extra = EXTRA_SKILLS[state.heroClass];
        const descriptions = {
            attack: `${hero.attackCooldown}s base cooldown. Regular attack: always available on J / left click, no slot required. Upgrades remain active.`,
            nova: `${hero.specialCooldown}s base cooldown. ${ranged ? "Five-arrow fan. Bodkin volley adds a second target per arrow at 70% damage." : state.heroClass === "knight" ? "A fire pulse; Backdraft pushes survivors away." : "A seismic pulse dealing 25% extra damage inside half its radius and slowing walking by 15% for 1.5s. Train its core and slow to set up Fault line."}`,
            burst: `${extra.burst.cooldown}s base cooldown. ${extra.burst.shape === "beam" ? "A narrow lance strikes every enemy along its line." : extra.burst.shape === "arrows" ? "Seven arrows, each penetrating a second target at 70% damage. Deep penetration adds a third." : "A heavy cone; Crushing force rewards hitting slowed enemies."}`,
            guard: `${extra.guard.cooldown}s base cooldown. ${state.heroClass === "knight" ? "An opening fire pulse burns nearby enemies." : ranged ? "Opening vines slow nearby enemies' walking by 25% for 1.5s." : "An opening shockwave pushes ordinary enemies back 60 units."} Grants 40% damage reduction for at least 3s. Cannot refresh while active; at least 2s without protection after expiry.`,
            dodge: "Directional evasion. Always available without a slot; manual-only.",
            potion: "Consume one flask and heal. Always available without a slot; manual-only.",
            ...Object.fromEntries(Object.keys(NEW_SKILLS).map(key => {
                const skill = combatSkillDefinition(state, key);
                return [key, `${skill.cooldown}s cooldown · ${Math.round(skill.damage * 100)}% weapon damage before conditional bonuses. ${skill.detail}`];
            }))
        };
        if (state.heroClass === 'sorcerer') {
            descriptions.attack = 'A focused bolt targets the nearest enemy in range; no skill slot required.';
            descriptions.nova = 'A pulse damages nearby enemies. Rime wake slows survivors; range upgrades expand the pulse.';
            descriptions.guard = 'An opening pulse and 40% protection against both damage types. Cannot refresh while active.';
        }
        for (const key of Object.keys(descriptions)) {
            if (['dodge', 'potion'].includes(key)) continue;
            const definition = combatSkillDefinition(state, key);
            const cooldown = key === 'attack' ? hero.attackCooldown : key === 'nova' ? hero.specialCooldown : definition?.cooldown ?? extra[key]?.cooldown;
            descriptions[key] += ` ${skillDamageType(state, key)} damage · ${Math.round(skillReach(state, key))} reach · ${cooldown}s base cooldown. Targeting: ${definition?.detail ?? (key === 'attack' ? 'nearest enemy in reach; aimed on desktop' : key === 'burst' ? extra.burst.shape : 'nearby area')}. ${NEW_SKILLS[key] ? 'Forge: +10% damage, +8 reach, +8% skill recovery per rank. Tree potency: +10% damage per rank; branch effects are described on each node.' : 'Forge and tree previews show the exact damage, reach, recovery and branch changes.'}`;
        }
        for (const element of hudAll("[data-skill-description]")) {
            const key = element.dataset.skillDescription;
            const value = element.closest("[data-skill-choice]") ? skillTagline(state.heroClass, key) || descriptions[key] : descriptions[key];
            if (element.textContent !== value) element.textContent = value;
        }
        classSelect.disabled = saving || !setupAction || setupStep !== 0 || setupAction === "continue";
        const critical = state.status === "playing" && state.resumeDelay === 0 && p.health > 0 && p.health <= p.maxHealth * 0.25;
        viewport.classList.toggle("low-health", critical);
        const mobileHud = root.dataset.canvasHud === "on";
        const warning = critical ? p.potions > 0 ? mobileHud ? "LOW HEALTH — tap flask" : "LOW HEALTH — E or Life flask to heal" : "LOW HEALTH — no flasks; evade" : "";
        if (healthWarning.textContent !== warning) healthWarning.textContent = warning;
        if (critical && mobileHud) {
            healthWarning.style.top = "122px";
            healthWarning.style.left = "14px";
        } else {
            healthWarning.style.removeProperty("top");
            healthWarning.style.removeProperty("left");
        }
        for (const button of skillButtons) {
            const skill = button.dataset.skill;
            const icon = button.querySelector(".skill-icon"), src = skillIcon(state, skill);
            button.dataset.skillIcon = src;
            if (icon && icon.dataset.iconSource !== src) {
                icon.style.backgroundImage = `url('${src}')`;
                icon.dataset.iconSource = src;
            }
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
                if (['dodge', 'potion'].includes(skill)) {
                    const status = combatControlStatus(state, skill, !!setupAction || saving);
                    button.dataset.controlState = status.mode;
                    button.setAttribute('aria-label', `${skillName(state, skill)}: ${status.text}`);
                }
                const peak = remaining > 0 ? Math.max(remaining, cooldownPeaks.get(button) || 0) : 0;
                cooldownPeaks.set(button, peak);
                button.style.setProperty("--cooldown-turn", `${peak > 0 ? remaining / peak : 0}turn`);
                button.dataset.skillMode = locked ? "locked" : automatic ? "auto" : manual ? "manual" : "unslotted";
                if (!['dodge', 'potion'].includes(skill)) button.setAttribute("aria-label", `${skillName(state, skill)}: ${locked ? "Locked" : remaining > 0 ? `${remaining.toFixed(1)} seconds` : "Ready"}${automatic ? ", automatic" : ""}`);
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
            + ` · ${encounterForWave(state.wave).name}`
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
        text("armor-detail", `${armorRating(state).toFixed(1)}% physical armor · ${resistanceRating(state).toFixed(1)}% spell resistance (each capped at 60%)`);
        text("forge-gold", `${state.gold} gold`);
        text("checkpoint-save", ["camp", "won"].includes(state.status) ? saveStatus.textContent : "");
        text("weapon", p.weapon);
        text("weapon-detail", `Relic rating ${p.weaponBonus} (+${Math.round(60 * (Math.sqrt(1 + p.weaponBonus / 30) - 1))} damage) / Forge rank ${state.upgrades.weapon}`);
        const localSaves = root.dataset.localSaves === "on";
        text("unlock", checkingUnlock ? localSaves ? "Checking local save..." : "Checking server unlock..." : endlessUnlocked ? localSaves ? "Endless Watch permanently unlocked on this device." : "Endless Watch permanently unlocked on this server profile." : state.status === "won" ? (saving ? "Saving your permanent Endless unlock..." : "Endless is available now. Save successfully to keep the unlock permanently.") : "Complete the campaign to permanently unlock Endless Watch.");
        const activePowers = POWER_UPS.filter(power => state.buffs[power.key] > 0);
        text("buffs", activePowers.length ? activePowers.map(power => `${power.name}: ${Math.ceil(state.buffs[power.key])}s`).join(" / ") : "No active power-ups");
        text("journal", state.journal);
        for (const skill of SKILL_KEYS) text(skill, !skillUnlocked(state, skill) ? "Locked"
            : ['dodge', 'potion'].includes(skill) ? combatControlStatus(state, skill, !!setupAction || saving).text
            : p[skill] > 0 ? `${p[skill].toFixed(1)}s` : "Ready");
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
        const checkpointInBackground = automaticCheckpoint(state, checkpointSaveFailed);
        overlay.hidden = !!setupAction || (state.status === "playing" || checkpointInBackground) && !draftClosing;
        const active = ["playing", "paused", "camp", "won", "choosing"].includes(state.status);
        const canForge = !setupAction && ["paused", "camp", "won"].includes(state.status);
        for (const select of hudAll("[data-equipment-style]")) {
            select.value = state.runSystems.equipment[select.dataset.equipmentStyle];
            select.disabled = saving || !canForge;
        }
        const challenge = state.runSystems.challenge;
        const endlessTravel = state.mode === "endless" && state.status === "playing" && state.travelPending === 1 && !setupAction;
        const challengeAvailable = !saving && (canForge || endlessTravel) && state.wave % 5 === 0 && state.enemies.length === 0
            && !(challenge.stage === Math.floor(state.wave / 5) + 1 && challenge.elapsed > 0);
        for (const button of challengeButtons) {
            button.disabled = !challengeAvailable;
            button.setAttribute("aria-pressed", String(!challenge.resolved && challenge.key === button.dataset.challengeChoice));
            button.classList.toggle("is-selected", challengePickedFor(challenge, button.dataset.challengeChoice));
        }
        hudOne("[data-challenge-availability]").textContent = challengeAvailable
            ? `Choose for stage ${Math.floor(state.wave / 5) + 1} � Reward: ${100 + (Math.floor(state.wave / 5) + 1) * 50} gold.`
            : "Choose before the first wave or at the next five-wave checkpoint. The current stage cannot be changed mid-fight.";
        setText(hudOne("[data-challenge-status]"), `${CHALLENGES[challenge.key]}${challenge.key === "none" ? "" : ` · stage ${challenge.stage} · ${Math.floor(challenge.elapsed)}s · ${challenge.flasks} flasks · ${Math.round(challenge.damage)} health lost${challenge.resolved ? " · resolved" : ""}`}`);
        const nextStage = Math.floor(state.wave / 5) + 1;
        const challengePicked = challenge.key !== "none" && challenge.stage === nextStage && !challenge.resolved;
        challengeNudge.hidden = !endlessTravel || !challengeAvailable || challengePicked || challengeNudgeDismissedStage === nextStage
            || inMainMenu || !loreReader.hidden
            || !!setupAction || choosing || draftClosing || root.dataset.menuOpen === "on";
        holdForChallenge = endlessTravel && !challengeNudge.hidden;
        setText(challengeNudgeText, `Bonus ${100 + nextStage * 50} gold for stage ${nextStage}.`);
        const campChallenge = hudOne("[data-camp-challenge]");
        if (campChallenge) {
            campChallenge.hidden = !challengeAvailable && !(saving && canForge && state.wave % 5 === 0 && state.enemies.length === 0);
            setText(hudOne("[data-camp-challenge-reward]"), `+${100 + nextStage * 50} gold`);
            setText(hudOne("[data-camp-challenge-status]"), challengePicked
                ? `✓ Active for stage ${nextStage}: ${CHALLENGES[challenge.key]}. Continue when ready.`
                : "Tap one to accept. You can change it until you travel.");
        }
        const summary = runSummary(state, key => skillName(state, key));

        const summaryElement = hudOne("[data-run-summary]");
        const overviewList = hudOne("[data-summary-overview]");
        const damageList = hudOne("[data-summary-damage]");

        if (summaryElement && overviewList && damageList) {
            overviewList.replaceChildren(
                ...summary.overview.map((item, index) => {
                    const li = document.createElement("li");
                    li.textContent = (index > 0 ? "\u00B7 " : "") + item.replace(/\d{4,}/g, value => Number(value).toLocaleString("en-US"))
                    return li;
                })
            );

            damageList.replaceChildren();

            if (summary.damage.length > 0) {
                for (const item of summary.damage) {
                    const li = document.createElement("li");
                    li.textContent = `${item.name}: ${Number(item.value).toLocaleString("en-US")}`;
                    damageList.append(li);
                }
            } else {
                const li = document.createElement("li");
                li.textContent = "No damage recorded yet.";
                damageList.append(li);
            }

            summaryElement.hidden = state.status === "ready";
        } else {
            console.error("Run summary DOM elements are missing.", {
                rootConnected: root.isConnected,
                summaryElement,
                overviewList,
                damageList
            });
        }

        const forgeSummary = hudOne("[data-forge-summary]");

        if (forgeSummary) {
            setText(
                forgeSummary,
                `${summary.overview.join(" · ")}. Damage dealt: ${
                    summary.damage.length > 0
                        ? summary.damage.map(item => `${item.name}: ${item.value}`).join(" · ")
                        : "none yet"
                }`
            );
        }
        retrySave.hidden = !checkpointSaveFailed || !["camp", "won"].includes(state.status) || !!setupAction;
        retrySave.disabled = saving || checkingUnlock || !saveBridge;
        setText(retrySave, saving ? "Retrying checkpoint save…" : "Retry checkpoint save");
        const wardUnlocked = skillUnlocked(state, "guard");
        const remindWard = false;
        const unlockLevels = state.skillSchedule === "legacy" ? [5, 10] : [10, 20];
        setText(hudOne("[data-skill-choice-description]"), `New skill at levels ${unlockLevels[0]} and ${unlockLevels[1]}. Locked for this run.`);
        text("ward-unlock-status", `${selectedSkills(state).map(key => skillName(state, key)).join(" · ")}. ${p.level < unlockLevels[1] ? `Next skill at level ${p.level < unlockLevels[0] ? unlockLevels[0] : unlockLevels[1]}.` : "All three skill slots unlocked."}`);
        text("skill-unlock-hint", `${skillName(state, "guard")} unlocked! Slot your new skill.`);
        skillUnlockNotice.hidden = !remindWard || state.status !== "playing" || state.resumeDelay > 0 || draftClosing || !!setupAction;
        for (const button of hudAll("[data-resume-combat]")) {
            button.hidden = state.mode === "endless" && state.status === "camp";
            button.disabled = saving || !!setupAction || !["paused", "camp"].includes(state.status);
        }
        openSkills.disabled = saving || !!setupAction || !active || choosing;
        text("skill-points", `${skillPointsLeft(state)} points available · ${skillPointsEarned(state)}/${MAX_SKILL_POINTS} earned`);
        for (const button of hudAll("[data-respec-tree]")) {
            const skill = button.dataset.respecTree;
            const points = treePointsSpent(state, skill), cost = treeRespecCost(state, skill);
            setText(button, points ? `Reset · ${cost}g · +${points} pts` : "Reset");
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
            setText(button.querySelector("[data-tree-name]"), definition.name);
            setText(button.querySelector("[data-tree-icon]"), definition.icon);
            setText(button.parentElement.querySelector("[data-tree-detail]"), definition.detail);
            setText(button.parentElement.querySelector("[data-tree-status]"), saving ? "Saving…" : treeNodeStatus(state, skill, node));
            setText(button.querySelector("[data-tree-rank]"), `${rank}/${definition.max}`);
            button.setAttribute("aria-disabled", String(!available));
            button.setAttribute("aria-label", `${skillName(state, skill)}: ${definition.name}, rank ${rank} of ${definition.max}`);
            button.classList.toggle("learned", rank > 0);
            button.classList.toggle("available", available);
        }
        for (const tree of hudAll("[data-tree-skill]")) {
            tree.dataset.heroClass = state.heroClass;
            const skill = tree.dataset.treeSkill, nodes = state.skillTree[skill];
            tree.dataset.skillIcon = skillIcon(state, skill);
            tree.style.setProperty("--skill-art", `url('${tree.dataset.skillIcon}')`);
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
        setText(combatPause, state.status === "paused" ? "Resume" : "Pause");
        focusViewButton.disabled = !!setupAction;
        recenterButton.disabled = !!setupAction;
        startButton.hidden = state.mode === "endless" && state.status === "camp";
        startButton.disabled = saving || checkingUnlock || choosing || !!setupAction;
        restartButton.disabled = saving || choosing || !!setupAction;
        endlessButton.disabled = saving || checkingUnlock || choosing || !!setupAction;
        endlessButton.hidden = choosing || !(endlessUnlocked || state.status === "won") || (state.mode === "endless" && !["dead", "paused", "camp"].includes(state.status)) || state.status === "playing";
        launchEndless.disabled = endlessButton.disabled || !(endlessUnlocked || state.campaignComplete === 1);
        if (mainEndless) {
            mainEndless.hidden = !(endlessUnlocked || state.campaignComplete === 1);
            mainEndless.disabled = saving || checkingUnlock || choosing || !!setupAction;
        }
        setText(launchEndless, checkingUnlock ? "Checking Endless…" : state.status === "won" ? "Continue Endless" : endlessUnlocked || state.campaignComplete === 1 ? "New Endless run" : "Endless (locked)");
        launchEndless.title = state.status === "won" ? "Continue this campaign character into Endless" : "Unlocked profiles can start a new veteran Endless character here. To keep a completed campaign character, load its victory save first.";
        forgeButton.disabled = saving || !active || choosing || !!setupAction;
        const completedForge = forgeComplete(state);
        const cheapestTraining = Math.min(...Object.keys(MASTERY).map(key => masteryCost(state, key)));
        const offers = completedForge ? Object.keys(MASTERY)
            .filter(key => state.gold >= masteryCost(state, key) && Number.isFinite(masteryCost(state, key)) && !upgradePreview(state, key, true).capped)
            .map(key => ({ key: `mastery:${key}`, rank: state.mastery[key] }))
            : Object.entries(UPGRADES).filter(([key, upgrade]) => forgeSkillSelected(state, key) && state.upgrades[key] < upgrade.max && state.gold >= upgradeCost(state, key))
                .map(([key]) => ({ key: `forge:${key}`, rank: state.upgrades[key] }));
        const cheapestOffer = completedForge ? cheapestTraining
            : Math.min(...Object.keys(UPGRADES).filter(key => forgeSkillSelected(state, key) && state.upgrades[key] < UPGRADES[key].max).map(key => upgradeCost(state, key)));
        const notifyForge = forgeNotification(state, offers, root.dataset.menuPanel === "forge", cheapestOffer);
        forgeNudge.hidden = state.status !== "playing" || state.resumeDelay > 0 || draftClosing || !!setupAction || !notifyForge || !skillUnlockNotice.hidden;
        forgeButton.classList.toggle("forge-available", active && !choosing && !setupAction && notifyForge);
        root.dataset.forgeAvailable = active && !choosing && !setupAction && notifyForge ? "on" : "off";
        hudOne("[data-open-forge]").disabled = forgeButton.disabled;
        text("forge-hint", completedForge ? `Stat training from ${cheapestTraining.toLocaleString()} gold.` : "Forge upgrade available!");
        masteryPanel.hidden = !completedForge;

        for (const button of masteryButtons) {
            const key = button.dataset.masteryStat;
            const cost = masteryCost(state, key);
            const preview = upgradePreview(state, key, true);
            const capped = preview.capped;

            setText(
                button.querySelector("[data-mastery-label]"),
                capped ? "CAPPED" : `Rank ${state.mastery[key]} / ${cost.toLocaleString()} gold`
            );

            button.disabled = saving
                || !canForge
                || !completedForge
                || capped
                || state.gold < cost
                || !Number.isFinite(cost);

            button.title = capped
                ? `${MASTERY[key].detail} — Maximum effective value reached.`
                : MASTERY[key].detail;

            if (canForge && completedForge) {
                showUpgradePreview(button, key, true);
            }
        }

        if (choosing !== draftVisible) {
            draftVisible = choosing;
            if (choosing) {
                // Players are mid-fight when a level lands; ignore taps until the cards have settled in
                // so a stray attack tap never picks a boon by accident.
                cardPickReadyAt = performance.now() + 900;
                clearInput();
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
        runMenu.hidden = choosing || draftClosing || !!setupAction || checkpointInBackground;
        for (const button of cardButtons) button.disabled = saving || !choosing || performance.now() < cardPickReadyAt;
        if (choosing) {
            normalizeCardChoices(state);
            text("draft-level", `LEVEL UP! · LEVEL ${state.player.level - state.pendingChoices + 1} · COMBAT PAUSED`);
            text("draft-pending", state.pendingChoices > 1 ? `${state.pendingChoices} level-up choices queued. Select one card for each level.` : "Choose one card. Its bonus stays with this character and save.");
            const rerollsLeft = Math.max(0, rerollsPerRun() - (rerollsUsed.get(state) ?? 0));
            rerollButton.hidden = rerollsPerRun() === 0;
            rerollButton.disabled = saving || rerollsLeft === 0;
            rerollButton.textContent = `Reroll cards (${rerollsLeft} left)`;
            const signature = `${state.pendingChoices}:${state.cardChoices.join(",")}`;
            if (signature !== shownDraft) {
                cardButtons.forEach((button, index) => {
                    const key = state.cardChoices[index];
                    const card = LEVEL_CARDS[key];
                    button.dataset.cardId = key;
                    button.querySelector("[data-card-category]").textContent = ["nova", "burst", "guard"].includes(key)
                        ? skillName(state, key).toUpperCase() : key === "cleave" ? "REGULAR ATTACK" : card.category;
                    button.querySelector("[data-card-name]").textContent = card.skill ? `${skillName(state, card.skill)} oath` : card.name;
                    button.querySelector("[data-card-description]").textContent = key === "cleave"
                        ? `+6 ${hero.attackName} ${ranged ? "arrow range" : "reach"} per rank, up to +60.`
                        : key === "nova" ? `+10 ${hero.specialName} ${ranged ? "arrow range" : "radius"} per rank, up to +100.`
                        : key === "burst" ? `+6% ${skillName(state, "burst")} damage per rank, up to +60%.`
                        : key === "guard" ? `+0.15 seconds of ${skillName(state, "guard")} protection per rank. Reduces incoming damage by 40% before tree upgrades.` : card.skill ? `+6% ${skillName(state, card.skill)} damage per rank, up to +60%. Only affects this ability.` : card.description;
                    button.querySelector("[data-card-rank]").textContent = `Rank ${state.boons[key]} to ${state.boons[key] + 1}${card.max < Number.MAX_SAFE_INTEGER ? ` / Max ${card.max}` : " / Stacking"}`;
                });
                if (!saving) { shownDraft = signature; cardButtons[0].focus({ preventScroll: true }); }
            }
        } else shownDraft = "";
        for (const button of upgradeButtons) {
            const key = button.dataset.upgrade;
            const selected = forgeSkillSelected(state, key);
            button.hidden = !selected;
            if (["cleave", "nova", "burst", "guard"].includes(key) || NEW_SKILLS[key])
                setText(button.querySelector("strong"), `${skillName(state, key === "cleave" ? "attack" : key)} upgrades`);
            const rank = state.upgrades[key];
            const max = UPGRADES[key].max;
            const cost = upgradeCost(state, key);
            const label = `Rank ${rank}/${max} / ${rank >= max ? "Mastered" : `${cost} gold`}`;
            const element = button.querySelector("[data-upgrade-label]");
            if (element.textContent !== label) element.textContent = label;
            button.title = key === "cleave" ? `Improves ${hero.attackName}: damage, range and attack speed.`
                : key === "nova" ? `Improves ${hero.specialName}: damage, range and recovery.` : UPGRADES[key].detail;
            button.disabled = saving || !canForge || !selected || rank >= max || state.gold < cost;
            if (!skillUnlocked(state, key)) button.title = wardUnlockHint(state);
            if (canForge && selected && rank < max) showUpgradePreview(button, key);
            else setText(button.querySelector("[data-upgrade-preview]"), rank >= max ? "Fully forged" : "");
        }
        if (saveButton) saveButton.disabled = saving || checkingUnlock || !saveBridge || !active || !!setupAction;
        const choosingSkill = active && !choosing && !setupAction && needsSkillChoice(state);
        skillChoice.hidden = !choosingSkill || root.dataset.menuOpen === "on";
        const owned = selectedSkills(state);
        for (const button of skillChoice.querySelectorAll("[data-choose-run-skill]")) {
            const key = button.dataset.chooseRunSkill;
            button.hidden = owned.includes(key);
            button.disabled = saving || !choosingSkill;
            const synergy = BUILD_SYNERGIES.find(item => item.skills.includes(key) && item.skills.every(skill => skill === key || owned.includes(skill)));
            button.dataset.recommended = synergy ? "on" : "off";
            button.title = synergy ? `Recommended: completes ${synergy.name} (${synergy.detail})` : "";
        }
        if (loadButton) loadButton.disabled = saving || checkingUnlock || !saveBridge || !!setupAction;
        setText(pauseButton.firstChild, state.status === "paused" ? "Resume " : "Pause ");
        if (state.status !== shownStatus) {
            const report = hudOne("[data-death-report]");
            report.hidden = state.status !== "dead";
            if (state.status === "dead") {
                const fatal = state.damageHistory.findLast(hit => hit.lethal);
                hudOne("[data-killing-blow]").textContent = fatal
                    ? `Killing blow: ${fatal.source} — ${fatal.damage.toFixed(1)} health lost.` : "Damage source unavailable.";
                const list = hudOne("[data-damage-history]");
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
            overlay.hidden = !!setupAction || (state.status === "playing" || checkpointInBackground) && !draftClosing;
            restartButton.hidden = !["paused", "camp"].includes(state.status) || (state.mode === "endless" && !endlessButton.hidden);
            deathMainMenu.hidden = state.status !== "dead";
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
                if (!setupAction && root.dataset.menuOpen !== "on" && !(camp && watch)) (won ? endlessButton : startButton).focus({ preventScroll: true });
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

        if (label.textContent !== preview.text) {
            label.textContent = preview.text;
        }

        button.classList.toggle("at-stat-cap", preview.capped);

        // Preserve the original tooltip instead of appending duplicate preview text.
        if (!button.dataset.baseTitle) {
            button.dataset.baseTitle = button.title;
        }

        const title = button.dataset.baseTitle;
        const nextTitle = preview.text
            ? `${title}${title ? " — " : ""}${preview.text}`
            : title;

        if (button.title !== nextTitle) {
            button.title = nextTitle;
        }
    }

    // Toggles pause via the engine, syncing input state and focus. Guarded against firing while a
    // save is in flight or the setup dialog is open, since pausing mid-save or mid-dialog would be confusing.
    function pause() {
        if (saving || setupAction || !loreReader.hidden || root.dataset.menuOpen === "on") return;
        togglePause(state);
        clearInput();
        updateHud();
        if (state.status === "playing") canvas.focus({ preventScroll: true });
    }
    on(root, "mobile-menu", event => {
        const opening = event.detail?.open === true;
        if (opening) {
            if (!loreReader.hidden) return;
            const idleInformation = event.detail?.information && ["ready", "dead", "won"].includes(state.status);
            if (saving || setupAction || (!idleInformation && !["playing", "paused", "camp"].includes(state.status))) return;
            if (state.status === "playing") togglePause(state);
            root.dataset.menuOpen = "on";
            root.dataset.menuPanel = event.detail?.panel ?? "";
        } else {
            delete root.dataset.menuOpen;
            delete root.dataset.menuPanel;
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
        if (saving || checkingUnlock || setupAction || !loreReader.hidden || state.status === "choosing") return;
        if (state.status === "paused") togglePause(state);
        else if (state.status === "camp") continueJourney(state, root.dataset.quickTravel === "true");
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
        console.log("[Endless] CLICKED", {
            status: state.status,
            mode: state.mode,
            saving,
            checkingUnlock,
            setupAction,
            endlessUnlocked,
            campaignComplete: state.campaignComplete
        });

        if (saving || checkingUnlock || setupAction || state.status === "choosing") return;

        if (state.status === "won") {
            openSetup("continue");
            return;
        }

        if (!(endlessUnlocked || state.campaignComplete === 1)) return;

        if (state.mode === "endless" && ["paused", "camp"].includes(state.status)) {
            console.log("[Endless] Opening restart chooser");
            showRestartModeChooser();
            return;
        }

        openSetup("endless");
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
        const auto = [...loadoutSelects.map(element => element.value), "none"];
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
        const previewCta = () => { node.dataset.treeCta = button.getAttribute("aria-disabled") === "true" ? "Not available yet" : "Click to learn"; };
        on(button, "focus", () => { if (inspectedTreeNode !== button) previewCta(); showTooltip(); });
        on(node, "pointerenter", event => { if (event.pointerType !== "touch") { previewCta(); showTooltip(); } });
        on(button, "blur", () => {
            if (inspectedTreeNode === button) inspectedTreeNode = null;
            node.classList.remove("tooltip-inspected");
        });
        on(button, "click", event => {
            if ((event.pointerType === "touch" || event.sourceCapabilities?.firesTouchEvents) && inspectedTreeNode !== button) {
                for (const other of root.querySelectorAll(".tree-node.tooltip-inspected")) other.classList.remove("tooltip-inspected");
                button.focus({ preventScroll: true });
                inspectedTreeNode = button;
                node.dataset.treeCta = button.getAttribute("aria-disabled") === "true" ? "Not available yet" : "Tap again to learn";
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
        root.dataset.menuPanel = "forge";
        updateHud();
        if (root.dataset.menuOpen !== "on") delete root.dataset.menuPanel;
        alignArena = false;
        reveal(root.querySelector("[data-forge]"), true);
    });
    on(root.querySelector("[data-open-forge]"), "click", () => forgeButton.click());
    on(root.querySelector("[data-open-challenges]"), "click", () => {
        if (saving || setupAction || state.status === "choosing") return;
        challengeNudgeDismissedStage = Math.floor(state.wave / 5) + 1;
        if (state.status === "playing") pause();
        updateHud();
        alignArena = false;
    });
    on(root.querySelector("[data-dismiss-challenges]"), "click", () => {
        challengeNudgeDismissedStage = Math.floor(state.wave / 5) + 1;
        holdForChallenge = false;
        updateHud();
    });
    for (const button of masteryButtons) on(button, "click", () => {
        const key = button.dataset.masteryStat;
        if (saving || setupAction || upgradePreview(state, key, true).capped || !buyMastery(state, key)) return;

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
    function showRestartModeChooser() {
        const chooser = document.querySelector("[data-restart-mode-chooser]");

        console.log("[Endless] Chooser lookup", {
            found: !!chooser,
            rootConnected: root.isConnected,
            chooserHidden: chooser?.hidden
        });

        if (!chooser) return;

        if (chooser.open) return;
        chooser.hidden = false;
        chooser.showModal();

        console.log("[Endless] Chooser opened", {
            hidden: chooser.hidden,
            display: getComputedStyle(chooser).display
        });

        const campaignButton = chooser.querySelector('[data-restart-mode="campaign"]');
        const endlessButton = chooser.querySelector('[data-restart-mode="endless"]');
        const closeChooser = (restoreFocus = true) => {
            if (chooser.open) chooser.close();
            chooser.hidden = true;
            if (restoreFocus) restartButton.focus({ preventScroll: true });
        };

        chooser.oncancel = event => {
            event.preventDefault();
            closeChooser();
        };

        if (campaignButton) {
            campaignButton.onclick = () => {
                closeChooser(false);
                openSetup("campaign");
            };
        }

        if (endlessButton) {
            endlessButton.hidden = !(endlessUnlocked || state.campaignComplete === 1);
            endlessButton.onclick = () => {
                if (!(endlessUnlocked || state.campaignComplete === 1)) {
                    return;
                }

                closeChooser(false);
                openSetup("endless");
            };
        }

        const cancelButton = chooser.querySelector("[data-restart-cancel]");

        if (cancelButton) {
            cancelButton.onclick = () => {
                closeChooser();
            };
        }
    }
    on(rerollButton, "click", () => {
        if (saving || state.status !== "choosing") return;
        const used = rerollsUsed.get(state) ?? 0;
        if (used >= rerollsPerRun()) return;
        rerollsUsed.set(state, used + 1);
        state.cardChoices = drawLevelCards(state);
        cardPickReadyAt = performance.now() + 250;
        updateHud();
    });
    on(restartButton, "click", () => {
        if (saving || checkingUnlock || setupAction || state.status === "choosing") {
            return;
        }

        // Campaign is the only option until Endless has been unlocked.
        if (!endlessUnlocked && state.campaignComplete !== 1) {
            openSetup("campaign");
            return;
        }

        showRestartModeChooser();
    });    
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
        if (automatic && !loadingSave && saveBridge && state.mode === "endless" && state.status === "camp") {
            // Endless checkpoints save in the background so the watch never appears frozen.
            const snapshot = captureSnapshot(state);
            const wave = state.wave;
            const local = root.dataset.localSaves === "on" && root.dataset.cloudSignedIn !== "on";
            continueJourney(state, root.dataset.quickTravel === "true");
            clearInput();
            last = performance.now();
            checkpointSaveFailed = false;
            saveStatus.textContent = local ? "Saving checkpoint on this device in the background..." : "Autosaving checkpoint to the server in the background...";
            try {
                const result = await saveBridge.invokeMethodAsync("SaveRun", snapshot);
                if (disposed) return;
                if (result.success) root.dataset.hasSave = "on";
                saveStatus.textContent = result.success
                    ? `Checkpoint ${wave} saved ${local ? "on this device" : "on the server"}. Last successful save: ${new Date().toLocaleTimeString()}.`
                    : `Checkpoint autosave failed. ${result.message} Pause and select Save to retry.`;
                root.dispatchEvent(new CustomEvent("mobile-save-result", { detail: { success: result.success, loadingSave: false } }));
            } catch {
                if (!disposed) saveStatus.textContent = "Checkpoint autosave failed. Pause and select Save to retry.";
            }
            if (!disposed) updateHud();
            return;
        }
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
            if (endlessUnlocked) grandfatherClasses(true);
            if (!loadingSave && ["camp", "won"].includes(state.status)) checkpointSaveFailed = !result.success;
            if (result.success && loadingSave) {
                mergeProfile(result.save?.state?.meta);
                const restored = restoreSnapshot(result.save);
                void reportScore();
                state = restored;
                if (releaseRankings) resetToReleaseRankings(state);
                checkpointSaveFailed = false;
                if (state.mode === "endless" && state.status === "camp") {
                    continueJourney(state, root.dataset.quickTravel === "true");
                    if (root.dataset.quickTravel === "true") state.resumeDelay = 1.5;
                    togglePause(state);
                    challengeNudgeDismissedStage = Math.floor(state.wave / 5) + 1;
                }
                stageFade = 0; stageFadeMap = null; suppressTravelFade = true;
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
            if (result.success) saveStatus.textContent += ` Last successful ${loadingSave ? "load" : "save"}: ${new Date().toLocaleTimeString()}. ${local ? "Device storage" : "Cloud/server storage"}; unsaved combat progress remains in memory.`;
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
                    continueJourney(state, root.dataset.quickTravel === "true");
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
    // Account-wide meta progress (Embers, camp, mastery) syncs on its own channel so deaths and
    // camp purchases reach the cloud even when no run save is written.
    let profileSyncing = false, profileTimer = 0;
    async function syncProfile() {
        if (!saveBridge || profileSyncing || disposed) return;
        profileSyncing = true;
        try {
            const remote = await saveBridge.invokeMethodAsync("LoadProfile");
            if (disposed) return;
            if (remote) try { mergeProfile(JSON.parse(remote)); } catch { }
            for (let attempt = 0; attempt < 2; attempt++) {
                const conflict = await saveBridge.invokeMethodAsync("SaveProfile", JSON.stringify(exportProfile()));
                if (disposed || !conflict) break;
                try { mergeProfile(JSON.parse(conflict)); } catch { break; }
            }
        } catch { } finally { profileSyncing = false; }
    }
    onProfileChange(() => {
        if (profileSyncing) return;
        clearTimeout(profileTimer);
        profileTimer = setTimeout(syncProfile, 2500);
    });

    async function readUnlock() {
        syncProfile();
        try {
            if (saveBridge) {
                const result = await saveBridge.invokeMethodAsync("LoadRun");
                if (disposed) return;
                if (result.success) {
                    mergeProfile(result.save?.state?.meta);
                    endlessUnlocked = !!(result.endlessUnlocked || result.save?.endlessUnlocked || result.save?.state?.campaignComplete === 1);
                    if (endlessUnlocked) grandfatherClasses(true);
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
    on(window, "blur", () => { audio.setBackground(true); if (state.status === "playing") pause(); else clearInput(); });
    on(window, "game-background", () => {
        audio.setBackground(true);
        if (state.status === "playing") pause(); else clearInput();
    });
    on(document, "visibilitychange", () => {
        if (document.hidden) audio.setBackground(true);
        else { audio.setBackground(false); void audio.unlock(); }
        if (document.hidden && state.status === "playing") pause();
    });
    on(window, "focus", () => { if (!document.hidden) { audio.setBackground(false); void audio.unlock(); } });
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
        // 90/120 Hz phones would otherwise render up to twice as often as needed; cap at ~60 fps,
        // or ~30 fps with the battery saver preference. step() uses real elapsed time, so gameplay
        // speed is unaffected.
        const idleLoop = inMainMenu || !loreReader.hidden || state.status !== "playing";
        const minFrameMs = idleLoop ? 95 : root.dataset?.batterySaver === "true" ? 31 : 15;
        if (typeof updateCanvasResolution === "function" && root.dataset?.batterySaver !== lastSaverMode) updateCanvasResolution();
        if (last && now - last < minFrameMs) { frame = requestAnimationFrame(animate); return; }
        const chapterWave = state.travelPending || state.wave === 0 ? state.wave + 1 : state.wave;
        if (!inMainMenu && loreReader.hidden && !saving && !setupAction && state.mode === "campaign" && state.status === "playing" && chapterWave % 5 === 1) {
            const chapter = mapIndexForWave(chapterWave);
            let seen = loreSeen.get(state);
            if (!seen) { seen = new Set(); loreSeen.set(state, seen); }
            if (!seen.has(chapter)) { seen.add(chapter); openLore(chapterWave); }
        }
        // Endless travel waits on the challenge notice until the player picks View or Later.
        if (!inMainMenu && loreReader.hidden && !holdForChallenge) step(state, input(), last ? (now - last) / 1000 : 0);
        root.dataset.gameStatus = setupAction ? "setup" : state.status;
        audio.update(state, mapIndexForWave(state.wave), Boolean(setupAction) || document.hidden, inMainMenu);
        last = now;
        if (now - lastScoreAttempt >= 15000) {
            lastScoreAttempt = now;
            void reportScore();
        }
        if (!inMainMenu && loreReader.hidden && ["camp", "won"].includes(state.status) && !saving && !checkingUnlock && !setupAction && checkpointHandled !== `${state.mode}:${state.wave}`) {
            checkpointHandled = `${state.mode}:${state.wave}`;
            void persist(false, true);
        }
        const canvasHud = root.dataset.canvasHud === "on";
        // Paused, menus, lore and checkpoints show a static arena: draw it once, then only redraw when
        // something visible changes (or once a second as a safety net) to save battery and heat.
        const idle = inMainMenu || !loreReader.hidden || state.status !== "playing";
        const idleKey = idle ? [state.status, state.wave, inMainMenu, loreReader.hidden, canvas.width, canvas.height, state.player.health, state.enemies.length, state.gold].join("|") : "";
        if (!idle || idleKey !== idleDrawKey || now - idleDrawTime >= 1000 || state.status !== shownStatus) {
            idleDrawTime = now;
            idleDrawKey = idleKey;
            render(ctx, floors[mapIndexForWave(state.wave)], state, bossTop, preferences.settings, canvasHud);
            if (root.dataset.quickTravel !== "true") drawCountdown(ctx, state, canvasHud);
            // Stage change: fade the old land to black and the new one in instead of a hard cut.
            const drawnMap = mapIndexForWave(state.wave);
            const smoothTravel = root.dataset.quickTravel === "true";
            if (!state.travelPending) suppressTravelFade = false;
            if (smoothTravel && !suppressTravelFade && state.travelPending && state.status === "playing") stageFade = Math.max(stageFade, Math.min(1, 1 - (state.resumeDelay - 1.5) / 0.7));
            else if (smoothTravel && !suppressTravelFade && drawnMap !== stageFadeMap && stageFadeMap !== null) stageFade = Math.max(stageFade, 1);
            stageFadeMap = drawnMap;
            if (stageFade > 0) {
                ctx.save(); ctx.globalAlpha = Math.min(1, stageFade); ctx.fillStyle = "#050c11"; ctx.fillRect(0, 0, WIDTH, HEIGHT); ctx.restore();
                if (!state.travelPending) stageFade = Math.max(0, stageFade - (now - (stageFadeTime || now)) / 600);
            }
            stageFadeTime = now;
            if (canvasHud) {
                const boss = state.enemies.find(enemy => enemy.kind === "boss" && enemy.health > 0);
                const map = mapForWave(state.wave);
                drawHudCached(ctx, state, { maxFlasks: MAX_FLASKS, cssWidth: canvasCssWidth, cssHeight: canvasCssHeight,
                    boss: boss ? { ...boss, name: map.boss, accent: map.accent } : null,
                    stage: !state.wave ? "" : state.mode === "endless"
                        ? `Endless \u00b7 Wave ${Math.max(1, state.wave - LAST_WAVE)}`
                        : `Stage ${Math.ceil(state.wave / 5)} \u00b7 Wave ${state.wave}/${LAST_WAVE}`,
                    checkpoint: automaticCheckpoint(state, checkpointSaveFailed) ? "Stage cleared \u00b7 saving checkpoint\u2026" : "" });
            }
        }
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
        audio.dispose();
        buttonFeedback.dispose();
        preferences.dispose();
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
        accountChanged(signedIn = true) {
            accountGeneration++;
            if (signedIn) syncProfile();
            if (releaseRankings) root.dataset.cloudSignedIn = signedIn ? "on" : "off";
            // Never replay a previous account's queued score submissions after switching users.
            pendingScores.clear();
            reportedScores.clear();
            rankingStatus.textContent = signedIn ? "Account updated. Rankings use your current verified sign-in."
                : "Signed out. Online ranking requests are paused until you sign in.";
        },
        resetAfterDeletion() {
            accountGeneration++;
            root.dataset.cloudSignedIn = "off";
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

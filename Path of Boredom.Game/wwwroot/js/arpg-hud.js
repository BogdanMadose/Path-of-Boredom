// In-canvas HUD — drawn into the game canvas rather than laid out as DOM over it.
//
// WHY
// The vitals bar, level medallion and status text were DOM elements positioned on top of the
// canvas. That is what made the game read as "a web page with a canvas in it": the HUD scaled with
// CSS rather than the playfield, sat in its own stacking context, and intercepted touches. Drawing
// it into the canvas means it scales exactly with the arena, can never steal a tap, and looks like
// part of the game.
//
// COORDINATE SPACE
// arpg.js sets a transform so the canvas works in logical WIDTH x HEIGHT units regardless of the
// element's pixel size (see updateCanvasResolution). Mobile HUD drawing switches to CSS pixels
// so its text and controls remain readable independently of the arena's aspect ratio.
//
// This module only DRAWS. It never mutates state and never reads the DOM, so it is safe to call
// from the render loop every frame.
import { WIDTH, HEIGHT } from "./arpg-engine.js";

const PAD = 14;
const BAR_W = 330;
const BAR_H = 18;

// Rounded rectangle path; Path2D's roundRect is not available on every Android WebView version
// we support, so it is done manually.
function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

function bar(ctx, x, y, w, h, fraction, from, to, label, value) {
    ctx.save();

    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = "#060c0ecc";
    ctx.fill();
    ctx.strokeStyle = "#bca48a33";
    ctx.lineWidth = 1;
    ctx.stroke();

    const filled = Math.max(0, Math.min(1, fraction)) * (w - 2);
    if (filled > 0) {
        ctx.save();
        roundRect(ctx, x + 1, y + 1, Math.max(h - 2, filled), h - 2, (h - 2) / 2);
        ctx.clip();
        const gradient = ctx.createLinearGradient(x, y, x + w, y);
        gradient.addColorStop(0, from);
        gradient.addColorStop(1, to);
        ctx.fillStyle = gradient;
        ctx.fillRect(x + 1, y + 1, filled, h - 2);
        ctx.restore();
    }

    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#9fb0ad";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 2, y - 4);
    ctx.fillStyle = "#d8cbb2";
    ctx.textAlign = "center";
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.strokeStyle = '#071018'; ctx.lineWidth = 2;
    ctx.strokeText(value, x + w / 2, y + h - 5, w - 8);
    ctx.fillText(value, x + w / 2, y + h - 5, w - 8);

    ctx.restore();
}

// Circular level badge, sitting between the two bars like the DOM medallion used to.
function medallion(ctx, x, y, level) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 21, 0, Math.PI * 2);
    ctx.fillStyle = "#262925";
    ctx.fill();
    ctx.strokeStyle = "#bba16b99";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#d3ad68";
    ctx.font = "600 9px system-ui, sans-serif";
    ctx.fillText("LVL", x, y - 5);
    ctx.fillStyle = "#f1e5cc";
    ctx.font = "400 18px Georgia, serif";
    ctx.textBaseline = "middle";
    ctx.fillText(String(level), x, y + 7);
    ctx.restore();
}

/**
 * Draws the whole HUD for this frame.
 *
 * @param ctx      canvas 2D context, already transformed into logical units by arpg.js
 * @param state    engine state (read-only here)
 * @param options  { flasks, buffs } extra readouts resolved by the caller, which owns the rules
 */
export function drawHud(ctx, state, options = {}) {
    const p = state.player;
    if (!p) return;

    ctx.save();
    const width = options.cssWidth || WIDTH, height = options.cssHeight || HEIGHT;
    if (options.cssWidth && options.cssHeight) ctx.setTransform(ctx.canvas.width / width, 0, 0, ctx.canvas.height / height, 0, 0);
    const barWidth = Math.min(BAR_W, width * 0.3);
    ctx.textBaseline = "alphabetic";

    const compact = !!options.cssWidth;
    const scrimHeight = compact ? 50 : 76, barHeight = compact ? 14 : BAR_H;
    // Top scrim keeps the bars legible over bright floors without hiding the playfield.
    const scrim = ctx.createLinearGradient(0, 0, 0, scrimHeight);
    scrim.addColorStop(0, compact ? "#0b1114b0" : "#0b1114e0");
    scrim.addColorStop(1, "#0b111400");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, width, scrimHeight);

    const top = compact ? 18 : PAD + 16;
    const health = p.maxHealth > 0 ? p.health / p.maxHealth : 0;
    bar(ctx, PAD, top, barWidth, barHeight, health, "#722e31", "#cd6357",
        "VITALITY", `${Math.max(0, Math.ceil(p.health))} / ${Math.ceil(p.maxHealth)}`);

    // XP and level live on the PLAYER, not on state (see gainExperience in arpg-engine.js).
    const xpNeeded = p.nextLevel || 0;
    const xp = xpNeeded > 0 ? p.xp / xpNeeded : 0;
    bar(ctx, width - PAD - barWidth, top, barWidth, barHeight, xp, "#314c66", "#71afc6",
        "EXPERIENCE", `${Math.floor(p.xp || 0)} / ${xpNeeded}`);

    medallion(ctx, width / 2, top + barHeight / 2, p.level || 1);

    // Flasks: pips rather than a number, readable at a glance mid-fight.
    const flasks = p.potions || 0;
    const pipY = top + barHeight + (compact ? 9 : 13);
    for (let i = 0; i < (options.maxFlasks || 5); i++) {
        ctx.beginPath();
        ctx.arc(PAD + 6 + i * 16, pipY, compact ? 4 : 5, 0, Math.PI * 2);
        ctx.fillStyle = i < flasks ? "#c46d62" : "#2a3336";
        ctx.fill();
    }
    if (options.stage) {
        ctx.textAlign = "right"; ctx.textBaseline = "middle";
        ctx.font = "700 15px system-ui, sans-serif";
        ctx.strokeStyle = "#071018"; ctx.lineWidth = 4; ctx.fillStyle = "#f1d49b";
        ctx.strokeText(options.stage, width - PAD, pipY + 3, barWidth);
        ctx.fillText(options.stage, width - PAD, pipY + 3, barWidth);
        ctx.textBaseline = "alphabetic";
    }
    if (options.boss) {
        const boss = options.boss, bossWidth = Math.min(360, width * 0.3);
        ctx.textAlign = 'center'; ctx.font = '600 12px system-ui, sans-serif';
        ctx.fillStyle = '#f1dfbf'; ctx.strokeStyle = '#071018'; ctx.lineWidth = 3;
        const words = boss.name.toUpperCase().split(' '), lines = [''];
        for (const word of words) {
            const index = lines.length - 1, next = `${lines[index]} ${word}`.trim();
            if (ctx.measureText(next).width > bossWidth && lines[index] && lines.length < 2) lines.push(word);
            else lines[index] = next;
        }
        lines.forEach((line, index) => {
            if (ctx.measureText(line).width > bossWidth) {
                while (line.length && ctx.measureText(`${line}…`).width > bossWidth) line = line.slice(0, -1);
                line = `${line.trimEnd()}…`;
            }
            ctx.strokeText(line, width / 2, 76 + index * 14, bossWidth);
            ctx.fillText(line, width / 2, 76 + index * 14, bossWidth);
        });
        const y = 98;
        ctx.fillStyle = '#090e11'; roundRect(ctx, (width - bossWidth) / 2, y, bossWidth, 10, 4); ctx.fill();
        ctx.fillStyle = '#cf7965'; ctx.fillRect((width - bossWidth) / 2 + 1, y + 1, (bossWidth - 2) * Math.max(0, Math.min(1, boss.health / boss.maxHealth)), 8);
        ctx.strokeStyle = boss.accent; ctx.lineWidth = 1;
        roundRect(ctx, (width - bossWidth) / 2, y, bossWidth, 10, 4); ctx.stroke();
    }

    // Active power-up names, centred under the medallion.
    if (options.buffs) {
        ctx.textAlign = "center";
        ctx.font = "600 12px system-ui, sans-serif";
        ctx.fillStyle = "#e0bd84";
        ctx.fillText(options.buffs.toUpperCase(), width / 2, options.boss ? 122 : top + barHeight + 22, width * 0.3);
    }
    if (options.checkpoint) {
        ctx.textAlign = "center";
        ctx.font = "600 13px system-ui, sans-serif";
        ctx.fillStyle = "#ead5a8";
        ctx.fillText(options.checkpoint, width / 2, height - 24, width - 28);
    }

    ctx.restore();
}

// Draws the HUD into an offscreen layer that is only repainted when a displayed value changes,
// then stamps that layer each frame. Health, XP, flasks and boss bars change a few times a second
// at most, so most frames become a single drawImage instead of gradients, text and paths.
let hudLayer = null, hudKey = "";
export function drawHudCached(ctx, state, options = {}) {
    const p = state.player;
    if (!p) return;
    const canvas = ctx.canvas;
    if (typeof document === "undefined" || !canvas?.width) { drawHud(ctx, state, options); return; }
    const boss = options.boss;
    const key = [canvas.width, canvas.height, options.cssWidth, options.cssHeight, Math.ceil(p.health), Math.ceil(p.maxHealth),
        Math.floor(p.xp || 0), p.nextLevel, p.level, p.potions, options.maxFlasks, boss ? boss.name + ":" + Math.ceil(boss.health) + ":" + boss.maxHealth : "",
        options.buffs || "", options.checkpoint || "", options.stage || ""].join("|");
    if (!hudLayer || hudLayer.width !== canvas.width || hudLayer.height !== canvas.height) {
        hudLayer = document.createElement("canvas");
        hudLayer.width = canvas.width; hudLayer.height = canvas.height;
        hudKey = "";
    }
    if (key !== hudKey) {
        const layer = hudLayer.getContext("2d");
        layer.setTransform(1, 0, 0, 1, 0, 0);
        layer.clearRect(0, 0, hudLayer.width, hudLayer.height);
        layer.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
        drawHud(layer, state, options);
        hudKey = key;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(hudLayer, 0, 0);
    ctx.restore();
}

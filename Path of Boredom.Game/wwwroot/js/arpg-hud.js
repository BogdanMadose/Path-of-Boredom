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
// element's pixel size (see updateCanvasResolution). Everything here is therefore in those logical
// units and needs no DPI handling of its own.
//
// This module only DRAWS. It never mutates state and never reads the DOM, so it is safe to call
// from the render loop every frame.
import { WIDTH } from "./arpg-engine.js";

const PAD = 14;
const BAR_W = 300;
const BAR_H = 13;

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

    ctx.font = "600 9px system-ui, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#9fb0ad";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 2, y - 4);
    ctx.fillStyle = "#d8cbb2";
    ctx.textAlign = "right";
    ctx.fillText(value, x + w - 2, y - 4);

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
    ctx.font = "600 7px system-ui, sans-serif";
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
    ctx.textBaseline = "alphabetic";

    // Top scrim keeps the bars legible over bright floors without hiding the playfield.
    const scrim = ctx.createLinearGradient(0, 0, 0, 64);
    scrim.addColorStop(0, "#0b1114e0");
    scrim.addColorStop(1, "#0b111400");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, WIDTH, 64);

    const top = PAD + 12;
    const health = p.maxHealth > 0 ? p.health / p.maxHealth : 0;
    bar(ctx, PAD, top, BAR_W, BAR_H, health, "#722e31", "#cd6357",
        "VITALITY", `${Math.max(0, Math.ceil(p.health))} / ${Math.ceil(p.maxHealth)}`);

    // XP and level live on the PLAYER, not on state (see gainExperience in arpg-engine.js).
    const xpNeeded = p.nextLevel || 0;
    const xp = xpNeeded > 0 ? p.xp / xpNeeded : 0;
    bar(ctx, WIDTH - PAD - BAR_W, top, BAR_W, BAR_H, xp, "#314c66", "#71afc6",
        "EXPERIENCE", `${Math.floor(p.xp || 0)} / ${xpNeeded}`);

    medallion(ctx, WIDTH / 2, top + BAR_H / 2, p.level || 1);

    // Flasks: pips rather than a number, readable at a glance mid-fight.
    const flasks = p.potions || 0;
    const pipY = top + BAR_H + 14;
    for (let i = 0; i < (options.maxFlasks || 5); i++) {
        ctx.beginPath();
        ctx.arc(PAD + 5 + i * 13, pipY, 4, 0, Math.PI * 2);
        ctx.fillStyle = i < flasks ? "#c46d62" : "#2a3336";
        ctx.fill();
    }

    // Active power-up names, centred under the medallion.
    if (options.buffs) {
        ctx.textAlign = "center";
        ctx.font = "600 9px system-ui, sans-serif";
        ctx.fillStyle = "#e0bd84";
        ctx.fillText(options.buffs.toUpperCase(), WIDTH / 2, top + BAR_H + 22);
    }

    ctx.restore();
}

// arpg-graphics.js — pure presentation: hand-drawn canvas art for the hero, floor decoration, and
// atmosphere/weather effects. Enemy-kind art and most UI drawing lives directly in arpg.js instead;
// this module only holds the pieces reused across many draw calls or expensive enough to benefit
// from sprite caching (`sprites`, below) — namely the player hero's body (which is drawn every
// frame, unlike enemies which are simpler shapes) and orb/glow primitives used throughout arpg.js's
// enemy art. Nothing here reads or mutates game state beyond the read-only arguments passed in.
import { angleDifference } from "./arpg-facing.js";

// Small LRU-ish cache of pre-rendered offscreen canvases (bodySprite/drawOrb), keyed by a string
// describing the sprite's parameters (e.g. "orb:8:#ff0000"). Capped at 128 entries (see the
// `sprites.size >= 128` eviction checks below) so an unbounded variety of orb radii/colors over a
// long session can't leak memory — evicts the oldest inserted entry (Map iteration order) once full.
const sprites = new Map();

// Fills (and optionally strokes) an arbitrary closed polygon defined by an array of [x, y] points —
// the basic building block nearly every hand-drawn shape in this file and arpg.js's enemy art is
// constructed from.
function polygon(ctx, points, fill, stroke = "#10191f", width = 1.5) {
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

// Builds a diagonal light-to-dark linear gradient used to give flat polygon armor/weapon shapes a
// simple metallic sheen without needing actual lighting/shading math.
function metal(ctx, light, mid, dark) {
    const gradient = ctx.createLinearGradient(-22, -25, 25, 25);
    gradient.addColorStop(0, light); gradient.addColorStop(0.4, mid); gradient.addColorStop(1, dark);
    return gradient;
}

// Draws a small glossy sphere (used for heads, joints, projectile cores, etc. all over the game's
// art) with a highlight-to-shadow radial gradient. Rendered once per distinct (radius, color) pair
// into a cached offscreen sprite and reused via drawImage() from then on — recreating a radial
// gradient from scratch every frame for every orb (there can be dozens on screen) would be far more
// expensive than blitting a pre-rendered bitmap. Rounds the radius to the nearest half-pixel so
// near-identical radii share the same cache entry instead of each spawning a new one.
export function drawOrb(ctx, x, y, radius, color) {
    const r = Math.max(1, Math.round(radius * 2) / 2);
    const key = `orb:${r}:${color}`;
    let sprite = sprites.get(key);
    if (!sprite) {
        sprite = document.createElement("canvas");
        sprite.width = sprite.height = Math.ceil(r * 8 + 16);
        const brush = sprite.getContext("2d");
        brush.scale(4, 4);
        const center = sprite.width / 8;
        const gradient = brush.createRadialGradient(center - r * 0.35, center - r * 0.45, 0, center, center, r);
        gradient.addColorStop(0, "#f8eacb"); gradient.addColorStop(0.25, color); gradient.addColorStop(1, "#18222a");
        brush.fillStyle = gradient;
        brush.beginPath(); brush.arc(center, center, r, 0, Math.PI * 2); brush.fill();
        brush.strokeStyle = "#101820bb"; brush.lineWidth = 0.8; brush.stroke();
        if (sprites.size >= 128) sprites.delete(sprites.keys().next().value);
        sprites.set(key, sprite);
    }
    ctx.drawImage(sprite, x - sprite.width / 8, y - sprite.height / 8, sprite.width / 4, sprite.height / 4);
}

// Pre-renders and caches the hero's torso/armor sprite for a given weapon type (bow/hammer/sword),
// since the body itself doesn't change frame to frame (only limbs/weapon/cloak, drawn separately by
// drawHero, actually animate) — only 3 distinct sprites ever exist (one per weapon type) since class
// is 1:1 with weapon type, so this cache essentially never evicts in practice.
function bodySprite(hero) {
    const key = `body:${hero.weaponType}`;
    let sprite = sprites.get(key);
    if (sprite) return sprite;
    sprite = document.createElement("canvas");
    sprite.width = 256; sprite.height = 288;
    const ctx = sprite.getContext("2d"); ctx.imageSmoothingQuality = "high"; ctx.scale(4, 4); ctx.translate(32, 36);
    const ranger = hero.weaponType === "bow", warden = hero.weaponType === "hammer";
    const plate = metal(ctx, ranger ? "#ced6a1" : "#f0f2d9", ranger ? "#668c65" : warden ? "#8da7c7" : "#8daead", "#263847");
    ctx.fillStyle = plate; ctx.strokeStyle = "#10191f"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-12, -10); ctx.quadraticCurveTo(0, -15, 12, -10);
    ctx.bezierCurveTo(20, 0, 14, 14, 0, 16); ctx.bezierCurveTo(-14, 14, -20, 0, -12, -10);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    for (const side of [-1, 1]) {
        polygon(ctx, [[side * 10, -10], [side * 19, -10], [side * 21, -2], [side * 13, 3]], plate);
        ctx.strokeStyle = "#e8dfb388"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(side * 14, -7); ctx.lineTo(side * 18, -5); ctx.stroke();
    }
    ctx.fillStyle = "#3e3026"; ctx.fillRect(-12, 8, 24, 4);
    ctx.fillStyle = "#d8b569"; ctx.fillRect(-3, 7, 6, 6);
    polygon(ctx, [[0, -8], [5, -2], [0, 5], [-5, -2]], hero.color, "#fff0bf66", 1);
    ctx.strokeStyle = "#142b3599"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-9, -2); ctx.lineTo(-4, 3); ctx.moveTo(9, -2); ctx.lineTo(4, 3); ctx.stroke();
    if (ranger) {
        ctx.fillStyle = metal(ctx, "#86a67b", "#385d49", "#192c29"); ctx.strokeStyle = "#9ac48a";
        ctx.beginPath(); ctx.moveTo(0, -30); ctx.bezierCurveTo(18, -28, 17, -8, 0, -4);
        ctx.bezierCurveTo(-17, -8, -18, -28, 0, -30); ctx.closePath(); ctx.fill(); ctx.stroke();
        polygon(ctx, [[-6, -18], [6, -18], [4, -9], [-4, -9]], "#1b2e2c", null);
        ctx.fillStyle = "#e1d7a5"; ctx.fillRect(-5, -16, 3, 2); ctx.fillRect(2, -16, 3, 2);
        ctx.strokeStyle = "#d4c38c"; ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(10 + i * 3, 9); ctx.lineTo(11 + i * 3, -3); ctx.stroke(); }
    } else {
        polygon(ctx, [[-8, -25], [0, -29], [8, -25], [10, -13], [5, -7], [-5, -7], [-10, -13]], plate);
        ctx.fillStyle = "#172d38"; ctx.fillRect(-8, -18, 16, 4);
        ctx.fillStyle = hero.color; ctx.fillRect(-6, -17, 4, 1); ctx.fillRect(2, -17, 4, 1);
        ctx.strokeStyle = "#f1dfb4"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -27); ctx.lineTo(0, -9); ctx.stroke();
        if (!warden) polygon(ctx, [[-3, -28], [-4, -35], [2, -33], [5, -26]], "#bd6045", "#eea275", 1);
    }
    // Baked polish (free at draw time): top-left rim light, chest gloss, and a class-coloured trim.
    ctx.globalCompositeOperation = "source-atop";
    const sheen = ctx.createRadialGradient(-6, -14, 1, -6, -14, 22);
    sheen.addColorStop(0, "#ffffff40"); sheen.addColorStop(1, "#ffffff00");
    ctx.fillStyle = sheen; ctx.fillRect(-32, -36, 64, 72);
    const shade = ctx.createLinearGradient(-10, -10, 16, 18);
    shade.addColorStop(0.55, "#00000000"); shade.addColorStop(1, "#0000004d");
    ctx.fillStyle = shade; ctx.fillRect(-32, -36, 64, 72);
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "#fff6d266"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-11, -9); ctx.quadraticCurveTo(0, -13.5, 11, -9); ctx.stroke();
    ctx.strokeStyle = hero.color + "cc"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-10, 14); ctx.quadraticCurveTo(0, 18, 10, 14); ctx.stroke();
    // Fine detail: mail scallops under the breastplate, gilded pauldron trim, rivets and a lit gem.
    ctx.strokeStyle = "#0e161c88"; ctx.lineWidth = 0.6;
    for (let row = 0; row < 2; row++) for (let x = -9 + row * 1.5; x <= 9; x += 3) {
        ctx.beginPath(); ctx.arc(x, 4 + row * 2, 1.4, 0, Math.PI); ctx.stroke();
    }
    ctx.strokeStyle = "#e3c98a"; ctx.lineWidth = 0.9;
    for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(side * 10, -10); ctx.lineTo(side * 19, -10); ctx.lineTo(side * 21, -2); ctx.stroke();
        ctx.fillStyle = "#f2e2b4";
        for (const [x, y] of [[side * 12, -8], [side * 17, -8], [side * 19, -4]]) { ctx.beginPath(); ctx.arc(x, y, 0.7, 0, Math.PI * 2); ctx.fill(); }
    }
    for (const side of [-1, 1]) {
        ctx.fillStyle = "#5a4130"; ctx.strokeStyle = "#1a120c"; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.rect(side * 8 - 2, 8.5, 4, 3.5); ctx.fill(); ctx.stroke();
    }
    const gem = ctx.createRadialGradient(-1, -3, 0.2, 0, -2, 3.5);
    gem.addColorStop(0, "#ffffff"); gem.addColorStop(0.4, hero.color); gem.addColorStop(1, hero.color + "00");
    ctx.fillStyle = gem; ctx.beginPath(); ctx.arc(0, -2, 3.5, 0, Math.PI * 2); ctx.fill();
    if (sprites.size >= 128) sprites.delete(sprites.keys().next().value);
    sprites.set(key, sprite);
    return sprite;
}

// Sorcerer hood, face, shoulders and robe trim, baked once (only the robe hem and staff animate).
function sorcererSprite(hero) {
    const key = `body:staff:${hero.color}`;
    let sprite = sprites.get(key);
    if (sprite) return sprite;
    sprite = document.createElement("canvas");
    sprite.width = 256; sprite.height = 288;
    const ctx = sprite.getContext("2d"); ctx.scale(4, 4); ctx.translate(32, 36);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.strokeStyle = hero.color; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(0, 20); ctx.stroke();
    for (const y of [2, 8, 14]) { polygon(ctx, [[0, y - 2], [2, y], [0, y + 2], [-2, y]], "#e9dcff", null); }
    for (const side of [-1, 1]) {
        polygon(ctx, [[side * 6, -8], [side * 14, -7], [side * 15, 0], [side * 8, 2]], metal(ctx, "#8f78b8", "#4b3a6b", "#1d1729"), "#10101a", 1.2);
        ctx.strokeStyle = "#e3c98a"; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(side * 7, -7.5); ctx.lineTo(side * 14, -6.5); ctx.stroke();
    }
    polygon(ctx, [[0, -26], [11, -17], [10, -5], [-10, -5], [-11, -17]], metal(ctx, "#5a4a7c", "#30283f", "#15111e"), "#0d0b14", 1.5);
    ctx.strokeStyle = hero.color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(-11, -17); ctx.lineTo(0, -26); ctx.lineTo(11, -17); ctx.lineTo(10, -6); ctx.stroke();
    polygon(ctx, [[-5.5, -17], [5.5, -17], [4.5, -8], [-4.5, -8]], "#0c0a12", null);
    const face = ctx.createLinearGradient(0, -17, 0, -8);
    face.addColorStop(0, "#6a5850"); face.addColorStop(1, "#c9b2a3");
    polygon(ctx, [[-3.5, -14], [3.5, -14], [3, -8.5], [-3, -8.5]], face, null);
    for (const x of [-1.6, 1.6]) {
        const eye = ctx.createRadialGradient(x, -12.5, 0, x, -12.5, 2.2);
        eye.addColorStop(0, "#ffffff"); eye.addColorStop(0.35, hero.color); eye.addColorStop(1, hero.color + "00");
        ctx.fillStyle = eye; ctx.beginPath(); ctx.arc(x, -12.5, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-atop";
    const sheen = ctx.createRadialGradient(-6, -16, 1, -6, -16, 20);
    sheen.addColorStop(0, "#ffffff30"); sheen.addColorStop(1, "#ffffff00");
    ctx.fillStyle = sheen; ctx.fillRect(-32, -36, 64, 72);
    ctx.globalCompositeOperation = "source-over";
    if (sprites.size >= 128) sprites.delete(sprites.keys().next().value);
    sprites.set(key, sprite);
    return sprite;
}

// Gradients are reusable per context, so build the hero's cloak/steel paints once instead of every frame.
const paintCache = new WeakMap();
function heroPaints(ctx, type, ranger, warden) {
    let byType = paintCache.get(ctx);
    if (!byType) { byType = new Map(); paintCache.set(ctx, byType); }
    let paints = byType.get(type);
    if (!paints) {
        paints = {
            cloak: metal(ctx, ranger ? "#5a9565" : warden ? "#607c9d" : "#c5784e", ranger ? "#315b42" : warden ? "#344d6e" : "#78382d", "#18232c"),
            steel: metal(ctx, "#fff9de", "#a9d1d2", "#456276")
        };
        byType.set(type, paints);
    }
    return paints;
}

// Draws the player character every frame:
// skill is winding up, an invulnerability flicker, then a flowing cloak and walking legs facing
// the body's heading, a partially twisted torso, and finally a weapon following its attack aim — a
// weapon drawn per class — a bow with a stretch/loose animation tied to `strike`, or a sword/hammer
// swung via rotation tied to `strike` and the attack windup. `reduced` disables all of the purely
// cosmetic motion (flutter, sway, flicker) for the prefers-reduced-motion accessibility setting.
// Mastery cosmetic: a trim-coloured shoulder line and chest gem drawn over the cached body sprite.
function drawTrimAccent(ctx, trim) {
    ctx.save();
    // Spiked pauldrons in the trim colour.
    for (const side of [-1, 1]) {
        ctx.fillStyle = trim; ctx.strokeStyle = "#10191f"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(side * 8, -12); ctx.quadraticCurveTo(side * 19, -15, side * 20, -5);
        ctx.lineTo(side * 25, -11); ctx.lineTo(side * 21, -1); ctx.lineTo(side * 9, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.strokeStyle = trim; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-12, -10); ctx.quadraticCurveTo(0, -16, 12, -10); ctx.stroke();
    // Crest over the head.
    ctx.fillStyle = trim; ctx.strokeStyle = "#10191f"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-5, -24); ctx.lineTo(-2.5, -33); ctx.lineTo(0, -27); ctx.lineTo(2.5, -33); ctx.lineTo(5, -24); ctx.closePath(); ctx.fill(); ctx.stroke();
    // Glowing chest gem (soft halo without shadowBlur, which is costly on mobile canvases).
    ctx.save(); ctx.globalAlpha *= 0.35; ctx.beginPath(); ctx.arc(0, -1, 8, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(4.5, -1); ctx.lineTo(0, 5); ctx.lineTo(-4.5, -1); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
}
// Ground aura and long trimmed banner-cape drawn under the hero when a trim is equipped.
function drawTrimUnderlay(ctx, trim, time, reduced, flutter) {
    ctx.save();
    const pulse = reduced ? 0.5 : 0.5 + Math.sin(time * 3) * 0.2;
    ctx.globalAlpha *= 0.35 + pulse * 0.3; ctx.strokeStyle = trim; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, 8, 28, 15, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha *= 0.5; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(0, 8, 32, 18, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    return () => {
        ctx.save();
        ctx.fillStyle = trim + "cc"; ctx.strokeStyle = "#10191f"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0);
        ctx.lineTo(12 + flutter, 38); ctx.lineTo(5 + flutter * 0.6, 33); ctx.lineTo(0 + flutter * 0.5, 41); ctx.lineTo(-5 + flutter * 0.6, 33); ctx.lineTo(-12 + flutter, 38);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "#ffffff66"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(flutter * 0.5, 36); ctx.stroke();
        ctx.restore();
    };
}

export function drawHero(ctx, actor, hero, stride, strike, time, reduced, trim = "") {
    if (hero.weaponType === "staff") {
        ctx.save(); ctx.rotate(actor.facing + Math.PI / 2);
        if (actor.invulnerable > 0) ctx.globalAlpha *= reduced ? 0.8 : 0.72 + Math.sin(time * 18) * 0.12;
        const flutter = reduced ? 0 : Math.sin(time * 6) * 1.5 + stride * 1.5;
        if (trim) drawTrimUnderlay(ctx, trim, time, reduced, flutter)();
        for (const side of [-1, 1]) {
            polygon(ctx, [[side * 4, 14 + stride * side * 3], [side * 10, 14 + stride * side * 3], [side * 10, 29 + stride * side * 3], [side * 4, 29 + stride * side * 3]], '#25303e', '#8b80a255', 1);
        }
        polygon(ctx, [[-11, -8], [11, -8], [17 + flutter, 22], [6, 26], [0, 23], [-16 + flutter, 25]], "#51416f", trim || '#a68ac055', trim ? 2.5 : 1.5);
        ctx.drawImage(sorcererSprite(hero), -32, -36, 64, 72);
        if (trim) drawTrimAccent(ctx, trim);
        const twist = angleDifference(actor.facing, actor.weaponFacing ?? actor.facing);
        ctx.rotate(twist);
        ctx.strokeStyle = "#bda77c"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(17, 18); ctx.lineTo(17, -28); ctx.stroke();
        drawOrb(ctx, 17, -31, 5, hero.color);
        ctx.strokeStyle = hero.color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(17, -31, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.restore(); return;
    }
    const ranger = hero.weaponType === "bow", warden = hero.weaponType === "hammer";
    ctx.save();
    ctx.strokeStyle = hero.color + "88"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 8, 23, 12, 0, 0, Math.PI * 2); ctx.stroke();
    if ((actor.casting ?? 0) > 0) {
        ctx.strokeStyle = hero.color + "aa"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 24 + (1 - actor.casting / 0.4) * 18, 0, Math.PI * 2); ctx.stroke();
    }
    if (actor.invulnerable > 0) ctx.globalAlpha *= reduced ? 0.8 : 0.72 + Math.sin(time * 18) * 0.12;
    ctx.rotate(actor.facing + Math.PI / 2);
    const flutter = reduced ? 0 : Math.sin(time * 6) * 2 + stride * 2;
    if (trim) {
        ctx.save(); ctx.rotate(-(actor.facing + Math.PI / 2));
        const banner = drawTrimUnderlay(ctx, trim, time, reduced, flutter);
        ctx.restore(); banner();
    }
    const paints = heroPaints(ctx, hero.weaponType, ranger, warden);
    const cloak = paints.cloak;
    ctx.fillStyle = cloak; ctx.strokeStyle = "#10191f"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-12, -4); ctx.quadraticCurveTo(0, -9, 12, -4);
    ctx.bezierCurveTo(13, 9, 22 + flutter, 18, 18 + flutter, 28);
    ctx.quadraticCurveTo(8, 24, -2, 33); ctx.quadraticCurveTo(-10, 28, -18 + flutter, 29);
    ctx.bezierCurveTo(-22 + flutter, 18, -13, 9, -12, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = trim || hero.color + "aa"; ctx.lineWidth = trim ? 2.5 : 1.5;
    ctx.beginPath(); ctx.moveTo(-2, 33); ctx.quadraticCurveTo(8, 24, 18 + flutter, 28); ctx.moveTo(-2, 33); ctx.quadraticCurveTo(-10, 28, -18 + flutter, 29); ctx.stroke();
    ctx.strokeStyle = hero.color + "55"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-8, 3); ctx.lineTo(-11 + flutter, 23);
    for (const side of [-1, 1]) {
        const y = 13 + stride * side * 4;
        polygon(ctx, [[side * 4, y - 5], [side * 11, y - 5], [side * 12, y + 7], [side * 4, y + 8]], "#344753", "#a2b9ac55", 1);
    }
    const body = bodySprite(hero);
    const twist = angleDifference(actor.facing, actor.weaponFacing ?? actor.facing);
    ctx.save();
    ctx.rotate(twist * 0.45);
    ctx.drawImage(body, -32, -36, 64, 72);
    if (trim) drawTrimAccent(ctx, trim);
    ctx.restore();
    ctx.rotate(twist);
    const steel = paints.steel;
    if (ranger) {
        ctx.strokeStyle = "#15282b"; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(-22, -22); ctx.quadraticCurveTo(-15, -38, 0, -38); ctx.quadraticCurveTo(15, -38, 22, -22); ctx.stroke();
        ctx.strokeStyle = "#d9c08b"; ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = "#ddf4d8"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-22, -22); ctx.lineTo(0, -20 + strike * 5); ctx.lineTo(22, -22); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(0, -44); ctx.stroke();
        polygon(ctx, [[0, -49], [-3, -41], [3, -41]], "#e4f5c1", null);
    } else {
        ctx.save(); ctx.translate(15, 0); ctx.rotate(reduced ? 0 : strike * 1.4 - ((actor.swing ?? 0) > 0 ? 0.4 : 0));
        ctx.fillStyle = "#6c4831"; ctx.fillRect(0, -25, 4, 37);
        if (warden) {
            polygon(ctx, [[-11, -40], [12, -40], [17, -35], [17, -24], [-11, -24], [-16, -30]], steel, "#314657", 2);
            ctx.fillStyle = "#e2b974"; ctx.fillRect(-3, -38, 4, 12);
        } else {
            polygon(ctx, [[2, -49], [7, -37], [5, -5], [-2, -5], [-3, -37]], steel);
            ctx.strokeStyle = "#fff8df"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(2, -44); ctx.lineTo(2, -8); ctx.stroke();
            ctx.fillStyle = "#d8ad65"; ctx.fillRect(-7, -5, 17, 4);
        }
        drawOrb(ctx, 2, 9, 3, hero.color);
        ctx.restore();
        if (warden) {
            polygon(ctx, [[-31, -13], [-17, -17], [-10, -10], [-13, 10], [-23, 20], [-32, 9]], steel, "#162831", 2);
            polygon(ctx, [[-27, -7], [-18, -9], [-17, 7], [-23, 13], [-28, 6]], "#3c607f", "#debf7b", 1);
            ctx.strokeStyle = "#f1d59e"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-23, -5); ctx.lineTo(-23, 9); ctx.moveTo(-27, 0); ctx.lineTo(-18, 0); ctx.stroke();
        }
    }
    ctx.restore();
}

// Draws the per-map decorative overlay onto the pre-rendered floor tile (see arpg.js's makeFloor()):
// a soft ambient light gradient, a scattering of map-specific ground clutter (icicles for glacier,
// reeds for marsh, cracks for hollow/citadel, generic pebbles otherwise) placed with the given seeded
// `random`, and a decorative border frame with corner diamonds. Runs once per map when its floor
// canvas is built, not per frame, since the floor is otherwise static.
export function decorateFloor(ctx, map, random, width, height) {
    ctx.save();
    const light = ctx.createRadialGradient(width * 0.48, height * 0.35, 30, width / 2, height / 2, width * 0.6);
    light.addColorStop(0, map.accent + "0d"); light.addColorStop(0.7, "#14242b00"); light.addColorStop(1, "#050b1455");
    ctx.fillStyle = light; ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 22; i++) {
        const x = 45 + random() * (width - 90);
        const y = i % 2 ? 38 + random() * 24 : height - 38 - random() * 24;
        ctx.strokeStyle = map.id === "marsh" ? "#82ad7655" : "#a3a58033";
        ctx.lineWidth = 1.5; ctx.lineCap = "round";
        for (let stem = 0; stem < 5; stem++) {
            const lean = (random() - 0.5) * 30, height = 10 + random() * 20;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + lean * 0.4, y - height * 0.7, x + lean, y - height); ctx.stroke();
        }
    }
    for (let i = 0; i < 34; i++) {
        const x = 55 + random() * (width - 110);
        const y = i % 2 ? 45 + random() * 45 : height - 45 - random() * 45;
        const size = 7 + random() * 17;
        if (map.id === "glacier") {
            polygon(ctx, [[x, y - size], [x + size * 0.6, y], [x, y + 7], [x - size * 0.4, y]], "#46768788", "#bbebef55", 1);
            polygon(ctx, [[x, y - size], [x + size * 0.6, y], [x, y + 7]], "#a7d8e544", null);
        } else if (map.id === "marsh") {
            ctx.fillStyle = "#152c3266"; ctx.beginPath(); ctx.ellipse(x, y, size * 2, size * 0.6, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#9bc6a833"; ctx.lineWidth = 1; ctx.stroke();
        } else if (map.id === "hollow" || map.id === "citadel") {
            ctx.strokeStyle = map.id === "hollow" ? "#81715244" : "#ef955833";
            ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - size, y - 10); ctx.lineTo(x - size * 1.2, y - 24);
            ctx.moveTo(x - size, y - 10); ctx.lineTo(x - size * 2, y - 5); ctx.stroke();
        } else {
            ctx.strokeStyle = map.accent + "44"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(x, y, size * 0.6, 0, Math.PI * 2); ctx.moveTo(x - size, y); ctx.lineTo(x + size, y); ctx.stroke();
            ctx.fillStyle = map.accent + "77"; ctx.fillRect(x - 1, y - 1, 2, 2);
        }
    }
    ctx.strokeStyle = map.accent + "33"; ctx.lineWidth = 1;
    ctx.strokeRect(34, 34, width - 68, height - 68);
    for (const x of [38, width - 38]) for (const y of [38, height - 38]) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = "#e5c38e77"; ctx.strokeRect(-5, -5, 10, 10); ctx.restore();
    }
    ctx.restore();
}

// Draws a field of slowly drifting/twinkling particles (snow-like on Glacier, embers/motes
// elsewhere) for ambient atmosphere. Particle positions are a deterministic function of frame time
// and index rather than stored state, so there's nothing to update/store between frames — just
// recomputed fresh each call. Frozen in place (t = 0) under reduced-motion.
export function drawAtmosphere(ctx, map, time, reduced, width, height) {
    const t = reduced ? 0 : time;
    ctx.save();
    for (let i = 0; i < 28; i++) {
        const x = (i * 137.3 + Math.sin(t * 0.2 + i) * 16 + width) % width;
        const y = (i * 89.7 - t * (map.id === "glacier" ? -9 : 6) + height * 100) % height;
        ctx.globalAlpha = 0.15 + (Math.sin(t * 0.8 + i) + 1) * 0.12;
        ctx.fillStyle = map.id === "glacier" ? "#d7edf4" : map.accent;
        ctx.beginPath(); ctx.arc(x, y, i % 4 === 0 ? 1.8 : 0.9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}

// Draws the small pickup icon for a ground loot drop: a shadow, an optional glowing ring + gentle
// bob animation for "important" drops (power-ups/forge upgrades/flasks, to draw the eye compared to
// routine gold/gear drops), and then a per-kind icon shape (handled further below this comment).
export function drawLootIcon(ctx, drop, color, weaponType, time, reduced) {
    ctx.save(); ctx.translate(drop.x, drop.y);
    ctx.fillStyle = "#030a0d77"; ctx.beginPath(); ctx.ellipse(1, 5, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    const important = ["power", "upgrade", "flask"].includes(drop.kind);
    if (important) {
        ctx.strokeStyle = color + "55"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(0, 4, 12, 5, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (!reduced && important) ctx.translate(0, Math.sin(time * 2.5 + drop.x) * 1.5);
    ctx.lineJoin = "round";
    if (drop.kind === "gold") {
        ctx.fillStyle = "#8e652e"; ctx.beginPath(); ctx.ellipse(0, 2, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#e0be6b"; ctx.beginPath(); ctx.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#ffebaa"; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = "#8e652e"; ctx.fillRect(-1, -3, 2, 6);
    } else if (drop.kind === "flask") {
        polygon(ctx, [[-3, -10], [3, -10], [3, -5], [7, -1], [6, 7], [-6, 7], [-7, -1], [-3, -5]], "#c7e0df", "#edf5dc", 1);
        ctx.fillStyle = "#b84243"; ctx.fillRect(-4, 0, 8, 6); ctx.fillStyle = "#aa7c48"; ctx.fillRect(-4, -12, 8, 4);
        ctx.fillStyle = "#fff4d4"; ctx.fillRect(-3, -3, 2, 5);
    } else if (drop.kind === "health") {
        ctx.fillStyle = "#d3776a"; ctx.fillRect(-3, -8, 6, 16); ctx.fillRect(-8, -3, 16, 6);
    } else if (drop.kind === "armor") {
        polygon(ctx, [[-9, -8], [0, -11], [9, -8], [7, 4], [0, 11], [-7, 4]], "#7e95bb", color, 1);
        ctx.strokeStyle = "#e8d7a6"; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, 7); ctx.stroke();
    } else if (drop.kind === "upgrade") {
        polygon(ctx, [[-7, -9], [6, -9], [8, 7], [-5, 9]], "#e5d8b3", "#887660", 1);
        ctx.strokeStyle = "#866391"; ctx.lineWidth = 1; ctx.strokeRect(-3, -5, 6, 7);
        ctx.fillStyle = "#c6a5df"; ctx.fillRect(4, 5, 4, 5);
    } else if (drop.kind === "weapon") {
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        if (weaponType === "bow") {
            ctx.beginPath(); ctx.arc(-4, 0, 11, -1.2, 1.2); ctx.closePath(); ctx.stroke();
        } else {
            ctx.beginPath(); ctx.moveTo(-5, 9); ctx.lineTo(5, -9); ctx.stroke();
            if (weaponType === "hammer") { ctx.fillStyle = color; ctx.fillRect(0, -11, 12, 6); }
            else { ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(2, 6); ctx.stroke(); }
        }
    } else {
        polygon(ctx, [[0, -11], [8, -2], [0, 10], [-8, -2]], color, "#f8edcc", 1);
        polygon(ctx, [[0, -11], [0, 10], [-8, -2]], "#18243166", null);
    }
    ctx.restore();
}

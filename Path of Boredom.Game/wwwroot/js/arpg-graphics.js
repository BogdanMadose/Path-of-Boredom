// arpg-graphics.js — pure presentation: hand-drawn canvas art for the hero, floor decoration, and
// atmosphere/weather effects. Enemy-kind art and most UI drawing lives directly in arpg.js instead;
// this module only holds the pieces reused across many draw calls or expensive enough to benefit
// from sprite caching (`sprites`, below) — namely the player hero's body (which is drawn every
// frame, unlike enemies which are simpler shapes) and orb/glow primitives used throughout arpg.js's
// enemy art. Nothing here reads or mutates game state beyond the read-only arguments passed in.

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
        sprite.width = sprite.height = Math.ceil(r * 4 + 8);
        const brush = sprite.getContext("2d");
        brush.scale(2, 2);
        const center = sprite.width / 4;
        const gradient = brush.createRadialGradient(center - r * 0.35, center - r * 0.45, 0, center, center, r);
        gradient.addColorStop(0, "#f8eacb"); gradient.addColorStop(0.25, color); gradient.addColorStop(1, "#18222a");
        brush.fillStyle = gradient;
        brush.beginPath(); brush.arc(center, center, r, 0, Math.PI * 2); brush.fill();
        brush.strokeStyle = "#101820bb"; brush.lineWidth = 0.8; brush.stroke();
        if (sprites.size >= 128) sprites.delete(sprites.keys().next().value);
        sprites.set(key, sprite);
    }
    ctx.drawImage(sprite, x - sprite.width / 4, y - sprite.height / 4, sprite.width / 2, sprite.height / 2);
}

// Pre-renders and caches the hero's torso/armor sprite for a given weapon type (bow/hammer/sword),
// since the body itself doesn't change frame to frame (only limbs/weapon/cloak, drawn separately by
// drawHero, actually animate) — only 3 distinct sprites ever exist (one per weapon type) since class
// is 1:1 with weapon type, so this cache essentially never evicts in practice.
function bodySprite(hero) {
    const key = `body:${hero.weaponType}`;
    let sprite = sprites.get(key);
    if (sprite) return sprite;
    sprite = document.createElement("canvas"); sprite.width = 128; sprite.height = 144;
    const ctx = sprite.getContext("2d"); ctx.scale(2, 2); ctx.translate(32, 36);
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
    if (sprites.size >= 128) sprites.delete(sprites.keys().next().value);
    sprites.set(key, sprite);
    return sprite;
}

// Draws the player character every frame: a ground shadow ellipse, a casting-ring pulse while a
// skill is winding up, an invulnerability flicker, then (rotated to face the player's aim direction)
// a flowing cloak, legs with a walk-cycle stride offset, the cached body sprite, and finally a
// weapon drawn per class — a bow with a stretch/loose animation tied to `strike`, or a sword/hammer
// swung via rotation tied to `strike` and the attack windup. `reduced` disables all of the purely
// cosmetic motion (flutter, sway, flicker) for the prefers-reduced-motion accessibility setting.
export function drawHero(ctx, actor, hero, stride, strike, time, reduced) {
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
    const cloak = metal(ctx, ranger ? "#5a9565" : warden ? "#607c9d" : "#c5784e", ranger ? "#315b42" : warden ? "#344d6e" : "#78382d", "#18232c");
    ctx.fillStyle = cloak; ctx.strokeStyle = "#10191f"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-12, -4); ctx.quadraticCurveTo(0, -9, 12, -4);
    ctx.bezierCurveTo(13, 9, 22 + flutter, 18, 18 + flutter, 28);
    ctx.quadraticCurveTo(8, 24, -2, 33); ctx.quadraticCurveTo(-10, 28, -18 + flutter, 29);
    ctx.bezierCurveTo(-22 + flutter, 18, -13, 9, -12, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = hero.color + "55"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-8, 3); ctx.lineTo(-11 + flutter, 23); ctx.moveTo(8, 3); ctx.lineTo(12 + flutter, 23); ctx.stroke();
    for (const side of [-1, 1]) {
        const y = 13 + stride * side * 4;
        polygon(ctx, [[side * 4, y - 5], [side * 11, y - 5], [side * 12, y + 7], [side * 4, y + 8]], "#344753", "#a2b9ac55", 1);
    }
    const body = bodySprite(hero);
    ctx.drawImage(body, -32, -36, 64, 72);
    const steel = metal(ctx, "#fff9de", "#a9d1d2", "#456276");
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

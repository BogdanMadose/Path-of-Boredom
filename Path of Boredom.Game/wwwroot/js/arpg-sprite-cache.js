// Pre-rendered sprites for soft, gradient-heavy visuals (glows, ground shadows, vignette).
// Building a radial gradient and filling it every frame is one of the costliest canvas operations on
// phones; drawing a cached bitmap is a single cheap blit. Each sprite is rendered once per unique key
// and reused for the rest of the session, so these effects look richer while costing less power.
const cache = new Map();

function makeCanvas(width, height) {
    if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

function cached(key, width, height, paint) {
    let sprite = cache.get(key);
    if (!sprite) {
        sprite = makeCanvas(width, height);
        paint(sprite.getContext("2d"), width, height);
        cache.set(key, sprite);
    }
    return sprite;
}

// Soft radial light. `color` is a #rrggbb hex; `strength` is the centre alpha (0..1).
export function glowSprite(color, radius, strength = 0.5) {
    const r = Math.max(2, Math.round(radius));
    const alpha = Math.round(Math.min(1, Math.max(0, strength)) * 255).toString(16).padStart(2, "0");
    return cached(`glow:${color}:${r}:${alpha}`, r * 2, r * 2, (ctx, w) => {
        const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
        gradient.addColorStop(0, color + alpha);
        gradient.addColorStop(0.45, color + Math.round(parseInt(alpha, 16) * 0.35).toString(16).padStart(2, "0"));
        gradient.addColorStop(1, color + "00");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, w);
    });
}

// Draws a cached glow centred on (x, y) with additive blending so overlapping lights brighten naturally.
export function drawGlow(ctx, x, y, radius, color, strength = 0.5) {
    // One full-strength 64px sprite per colour, scaled and faded at draw time, so animated sizes and
    // pulsing strengths never create new cache entries.
    if (radius <= 0 || strength <= 0) return;
    const sprite = glowSprite(color, 64, 1);
    const previous = ctx.globalCompositeOperation, alpha = ctx.globalAlpha;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha * Math.min(1, strength);
    ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = previous;
}

// Elliptical contact shadow under an actor of the given radius, drawn in the actor's local space.
export function drawGroundShadow(ctx, radius) {
    const r = Math.max(4, Math.round(radius));
    const w = Math.ceil(r * 2.8), h = Math.ceil(r * 1.4);
    const sprite = cached(`shadow:${r}`, w, h, (brush) => {
        brush.translate(w / 2, h / 2);
        brush.scale(1, h / w);
        const gradient = brush.createRadialGradient(0, 0, 0, 0, 0, w / 2);
        gradient.addColorStop(0, "#02080c88");
        gradient.addColorStop(1, "#02080c00");
        brush.fillStyle = gradient;
        brush.beginPath();
        brush.arc(0, 0, w / 2, 0, Math.PI * 2);
        brush.fill();
    });
    ctx.drawImage(sprite, 3 - w / 2, r * 0.55 - h / 2);
}

// Dark rim drawn behind an enemy so its silhouette reads clearly against any floor colour.
export function drawOutline(ctx, radius) {
    const r = Math.max(4, Math.round(radius));
    const size = r * 2 + 10;
    const sprite = cached(`outline:${r}`, size, size, (brush) => {
        brush.beginPath();
        brush.arc(size / 2, size / 2, r + 2.5, 0, Math.PI * 2);
        brush.fillStyle = "#05090cb0";
        brush.fill();
    });
    ctx.drawImage(sprite, -size / 2, -size / 2);
}

// Full-arena vignette, rendered once per arena size.
export function vignetteSprite(width, height) {
    return cached(`vignette:${width}x${height}`, width, height, (ctx) => {
        const gradient = ctx.createRadialGradient(width / 2, height / 2, 160, width / 2, height / 2, 630);
        gradient.addColorStop(0, "#03090d00");
        gradient.addColorStop(1, "#03090d70");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    });
}

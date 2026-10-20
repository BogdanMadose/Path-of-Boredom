// arpg-mob-art.js — detailed enemy artwork rendered once into cached sprites.
//
// Every static part of an enemy (armour, robes, faces, shading, rim light) is painted a single time
// per kind into an offscreen canvas at 2x resolution and blitted with one drawImage per frame. Only
// cheap animated parts (legs, blades, glows) are drawn live. A hit-flash variant is baked lazily the
// first time it's needed, so flashing costs the same as normal drawing. The cache is capped.
import { drawGlow } from "./arpg-sprite-cache.js";

const SCALE = 2;
const sprites = new Map();

function makeCanvas(size) {
    const pixels = Math.ceil(size * SCALE);
    if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(pixels, pixels);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = pixels;
    return canvas;
}

function remember(key, sprite) {
    if (sprites.size >= 64) sprites.delete(sprites.keys().next().value);
    sprites.set(key, sprite);
    return sprite;
}

function bake(key, size, paint) {
    let sprite = sprites.get(key);
    if (sprite) return sprite;
    sprite = makeCanvas(size);
    const ctx = sprite.getContext("2d");
    ctx.scale(SCALE, SCALE);
    ctx.translate(size / 2, size / 2);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    paint(ctx);
    finish(ctx, size);
    return remember(key, sprite);
}

// Top-left key light and bottom-right falloff, applied only where something was painted.
function finish(ctx, size) {
    const half = size / 2;
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    const light = ctx.createRadialGradient(-half * 0.3, -half * 0.4, 1, -half * 0.3, -half * 0.4, half * 0.9);
    light.addColorStop(0, "#ffffff38"); light.addColorStop(1, "#ffffff00");
    ctx.fillStyle = light; ctx.fillRect(-half, -half, size, size);
    const shade = ctx.createLinearGradient(-half * 0.4, -half * 0.4, half * 0.6, half * 0.7);
    shade.addColorStop(0.5, "#00000000"); shade.addColorStop(1, "#00000059");
    ctx.fillStyle = shade; ctx.fillRect(-half, -half, size, size);
    ctx.restore();
}

function flashed(key, base, size) {
    return sprites.get(key) ?? (() => {
        const sprite = makeCanvas(size);
        const ctx = sprite.getContext("2d");
        ctx.drawImage(base, 0, 0);
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "#fff4d6d0";
        ctx.fillRect(0, 0, sprite.width, sprite.height);
        return remember(key, sprite);
    })();
}

function shape(ctx, points, fill, stroke = "#0b1116", width = 1.4) {
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function linear(ctx, x0, y0, x1, y1, ...stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((color, i) => g.addColorStop(i / (stops.length - 1), color));
    return g;
}

function ball(ctx, x, y, r, light, dark, stroke = "#0b1116") {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, light); g.addColorStop(1, dark);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke(); }
}

function ellipse(ctx, x, y, rx, ry, fill, stroke = "#0b1116", width = 1.2) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function glowEye(ctx, x, y, color, r = 1.8) {
    ctx.fillStyle = color + "55"; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff6dc"; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, Math.PI * 2); ctx.fill();
}

function rivets(ctx, points, color = "#e6d7a8") {
    ctx.fillStyle = color;
    for (const [x, y] of points) { ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI * 2); ctx.fill(); }
}

function legs(ctx, spread, top, length, stride, width, color) {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(side * spread, top);
        ctx.lineTo(side * (spread + 1), top + length + stride * side * 4); ctx.stroke();
    }
}

const ART = {
    husk: {
        size: 64,
        under: (ctx, a, stride) => legs(ctx, 4, 10, 8, stride, 4, "#363b31"),
        paint(ctx) {
            ctx.strokeStyle = "#58604f"; ctx.lineWidth = 3.2;
            for (const side of [-1, 1]) {
                ctx.beginPath(); ctx.moveTo(side * 9, -5); ctx.quadraticCurveTo(side * 15, 2, side * 13, 11); ctx.stroke();
                ctx.strokeStyle = "#d9cfae"; ctx.lineWidth = 1;
                for (const claw of [-1.5, 0, 1.5]) { ctx.beginPath(); ctx.moveTo(side * 13, 11); ctx.lineTo(side * 13 + claw, 14); ctx.stroke(); }
                ctx.strokeStyle = "#58604f"; ctx.lineWidth = 3.2;
            }
            shape(ctx, [[-10, -8], [-4, -11], [4, -11], [10, -8], [12, 4], [10, 13], [6, 10], [3, 14], [0, 11], [-3, 14], [-6, 10], [-10, 13], [-12, 4]],
                linear(ctx, -10, -10, 10, 14, "#7d8a6c", "#4a5543", "#232a22"));
            ctx.strokeStyle = "#d4cbaa66"; ctx.lineWidth = 1;
            for (const y of [-4, 0, 4]) { ctx.beginPath(); ctx.moveTo(-5, y); ctx.quadraticCurveTo(0, y + 2, 5, y); ctx.stroke(); }
            ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, 7); ctx.stroke();
            ellipse(ctx, 0, -13, 9, 8.5, "#20251d");
            ball(ctx, 0, -12, 6.5, "#efe7cb", "#7b735d");
            ellipse(ctx, -2.5, -12.5, 2, 1.8, "#1a120e", null);
            ellipse(ctx, 2.5, -12.5, 2, 1.8, "#1a120e", null);
            glowEye(ctx, -2.5, -12.5, "#ff8a4c", 1.1); glowEye(ctx, 2.5, -12.5, "#ff8a4c", 1.1);
            ctx.strokeStyle = "#3a332a"; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(-2.5, -8.5); ctx.lineTo(2.5, -8.5); ctx.stroke();
        }
    },
    brute: {
        size: 100,
        under: (ctx, a, stride) => legs(ctx, 8, 12, 11, stride * 1.2, 8, "#3a3b35"),
        paint(ctx) {
            for (const side of [-1, 1]) {
                ellipse(ctx, side * 22, 4, 7.5, 11, linear(ctx, side * 16, -6, side * 28, 14, "#a3957a", "#5d5446"));
                ball(ctx, side * 23, 15, 6.5, "#b7a789", "#4f463a");
                ctx.strokeStyle = "#2e2a24"; ctx.lineWidth = 0.9;
                for (const k of [-2.5, 0, 2.5]) { ctx.beginPath(); ctx.moveTo(side * 23 + k, 18); ctx.lineTo(side * 23 + k, 20.5); ctx.stroke(); }
            }
            shape(ctx, [[-16, -14], [16, -14], [19, 0], [15, 15], [0, 18], [-15, 15], [-19, 0]],
                linear(ctx, -16, -14, 16, 18, "#9c977f", "#5e5d52", "#24282a"), "#0b1116", 1.8);
            shape(ctx, [[-9, -6], [9, -6], [8, 6], [0, 9], [-8, 6]], linear(ctx, 0, -6, 0, 9, "#7d7b6c", "#3d3f3b"), "#1b1f22", 1);
            ctx.strokeStyle = "#e6dfc355"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(-8, -3); ctx.quadraticCurveTo(0, 0, 8, -3); ctx.stroke();
            ctx.fillStyle = "#3a2e25"; ctx.fillRect(-16, 9, 32, 5);
            shape(ctx, [[-3, 8], [3, 8], [3, 15], [-3, 15]], "#d6b46a", "#5a4520", 0.8);
            for (const side of [-1, 1]) {
                ellipse(ctx, side * 15, -12, 10, 7.5, linear(ctx, side * 8, -19, side * 22, -5, "#d5d0bb", "#7d7b70", "#3a3d3d"));
                rivets(ctx, [[side * 10, -12], [side * 15, -16], [side * 20, -12]]);
            }
            ball(ctx, 0, -19, 8, "#c9c2ad", "#4f514c");
            ctx.strokeStyle = "#e1d7bb"; ctx.lineWidth = 3;
            for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * 6, -23); ctx.quadraticCurveTo(side * 14, -26, side * 13, -34); ctx.stroke(); }
            ctx.fillStyle = "#15191b"; ctx.fillRect(-6, -21, 12, 3);
            glowEye(ctx, -3, -19.5, "#ff6f4f", 1.2); glowEye(ctx, 3, -19.5, "#ff6f4f", 1.2);
        }
    },
    sentinel: {
        size: 110,
        under: (ctx, a, stride) => legs(ctx, 7, 12, 11, stride, 7, "#2f2a33"),
        paint(ctx) {
            ctx.strokeStyle = "#7a5a3d"; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(24, -38); ctx.lineTo(24, 24); ctx.stroke();
            shape(ctx, [[24, -42], [34, -36], [36, -26], [24, -28]], linear(ctx, 24, -42, 36, -26, "#f1f4f6", "#8f9ba3"), "#1c2329", 1);
            shape(ctx, [[24, -42], [26, -50], [22, -42]], "#d7dde1", "#1c2329", 0.8);
            ctx.strokeStyle = "#ffffffaa"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(34, -35); ctx.lineTo(35, -27); ctx.stroke();
            ellipse(ctx, 25, 2, 4, 4, "#b49a84");
            shape(ctx, [[-14, -14], [14, -14], [17, 2], [13, 15], [0, 17], [-13, 15], [-17, 2]],
                linear(ctx, -14, -14, 14, 17, "#c3a7bb", "#7a5c71", "#2c222d"), "#0b1116", 1.6);
            shape(ctx, [[-5, -10], [5, -10], [5, 14], [0, 18], [-5, 14]], "#593e52", "#d9be82", 1);
            ctx.strokeStyle = "#e8cf8f"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 10); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.stroke();
            for (const side of [-1, 1]) ellipse(ctx, side * 14, -12, 8, 6, linear(ctx, side * 8, -18, side * 20, -6, "#e2d4de", "#7c6578", "#30262f"));
            shape(ctx, [[-8, -30], [8, -30], [9, -14], [-9, -14]], linear(ctx, -8, -30, 9, -14, "#e5dce2", "#867483", "#352c35"), "#0b1116", 1.4);
            ctx.fillStyle = "#120d12"; ctx.fillRect(-7, -23, 14, 2.6);
            ctx.fillStyle = "#ffcf7a"; ctx.fillRect(-6, -22.4, 12, 1.4);
            ctx.strokeStyle = "#b04a5a"; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(0, -30); ctx.quadraticCurveTo(-4, -40, -12, -38); ctx.stroke();
            shape(ctx, [[-31, -15], [-9, -15], [-9, 12], [-20, 25], [-31, 12]],
                linear(ctx, -31, -15, -9, 25, "#e0dce4", "#8e8999", "#3f3c48"), "#0b1116", 1.8);
            shape(ctx, [[-28, -12], [-12, -12], [-12, 10], [-20, 20], [-28, 10]], "#5d4458", "#e2d0a2", 1);
            ctx.strokeStyle = "#e9d49a"; ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.moveTo(-20, -8); ctx.lineTo(-20, 15); ctx.moveTo(-26, 0); ctx.lineTo(-14, 0); ctx.stroke();
        }
    },
    runner: {
        size: 72, rotate: true,
        under(ctx, a, stride) {
            ctx.strokeStyle = "#7e5338"; ctx.lineWidth = 2.6;
            for (const side of [-1, 1]) {
                ctx.beginPath(); ctx.moveTo(-10, side * 4); ctx.lineTo(-17 + stride * side * 7, side * 14);
                ctx.moveTo(6, side * 4); ctx.lineTo(12 - stride * side * 7, side * 14); ctx.stroke();
            }
        },
        paint(ctx) {
            ctx.strokeStyle = "#6e4a32"; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(-22, 4, -27, -1); ctx.stroke();
            ellipse(ctx, -2, 0, 16, 7.5, linear(ctx, -16, -7, 12, 7, "#e2b689", "#a87650", "#4d3020"), "#0b1116", 1.4);
            ctx.fillStyle = "#3c2416";
            for (let x = -12; x <= 6; x += 4.5) shape(ctx, [[x - 1.6, -5], [x + 1.6, -5], [x, -10]], "#5a3622", "#1f130c", 0.6);
            ctx.strokeStyle = "#f2d6b055"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(-12, -3); ctx.quadraticCurveTo(-2, -6, 8, -3); ctx.stroke();
            shape(ctx, [[8, -6], [17, -5], [23, -1], [23, 2], [16, 5], [8, 5]], linear(ctx, 8, -6, 23, 5, "#e8c294", "#8c5d3c"), "#0b1116", 1.2);
            shape(ctx, [[17, 1], [23, 1], [21, 3]], "#2a140c", null);
            ctx.fillStyle = "#fff3dc"; ctx.fillRect(18, 1, 0.8, 1.6); ctx.fillRect(20, 1, 0.8, 1.6);
            for (const side of [-1, 1]) shape(ctx, [[10, side * 4], [12, side * 9], [14, side * 4]], "#a46e49", "#1f130c", 0.6);
            glowEye(ctx, 17, -3, "#ff5a43", 1.3);
        }
    },
    spitter: {
        size: 84,
        under(ctx, a, stride) {
            ctx.strokeStyle = "#2e533e"; ctx.lineWidth = 4;
            for (const side of [-1, 1]) {
                ctx.beginPath(); ctx.moveTo(side * 12, 4); ctx.quadraticCurveTo(side * 25, 8 + stride * side * 3, side * 23, 16); ctx.stroke();
            }
        },
        paint(ctx) {
            ball(ctx, 0, 0, 19, "#a9d595", "#24412c");
            for (const [x, y, r] of [[-12, 6, 5], [12, 7, 4.5], [9, -12, 3.5], [-6, 12, 3]]) {
                ball(ctx, x, y, r, "#e4f2a6", "#7e9a52", "#2c4a33");
                ctx.fillStyle = "#ffffffaa"; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, Math.PI * 2); ctx.fill();
            }
            ctx.strokeStyle = "#1d362666"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(0, 0, 13, 0.6, 2.5); ctx.stroke();
            for (const side of [-1, 1]) {
                ctx.strokeStyle = "#3f6b45"; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(side * 5, -10); ctx.lineTo(side * 9, -16); ctx.stroke();
                ball(ctx, side * 9, -17, 5.5, "#f0f5c6", "#9db06a");
                ellipse(ctx, side * 9, -17, 1.6, 3, "#1b1f0f", null);
            }
            ellipse(ctx, 0, 6, 9, 6.5, "#1a2b23");
            ctx.fillStyle = "#f3f1d9";
            for (const x of [-6, -2, 2, 6]) shape(ctx, [[x - 1.2, 0.5], [x + 1.2, 0.5], [x, 3.4]], "#f3f1d9", null);
        },
        live(ctx, a, stride, strike, time) {
            const pulse = 3.5 + Math.sin(time * 3);
            drawGlow(ctx, 0, 7, pulse * 3, "#bde498", 0.35);
            ctx.fillStyle = "#c9ee9f"; ctx.beginPath(); ctx.arc(0, 7, pulse, 0, Math.PI * 2); ctx.fill();
        }
    },
    bomber: {
        size: 76,
        paint(ctx) {
            for (const side of [-1, 1]) shape(ctx, [[side * 4, -18], [side * 11, -24], [side * 7, -15]], "#6f8d4c", "#0b1116", 1);
            ball(ctx, 0, -17, 6.5, "#a7c47c", "#4d6a33");
            glowEye(ctx, -2.4, -17.5, "#ffe066", 1); glowEye(ctx, 2.4, -17.5, "#ffe066", 1);
            ellipse(ctx, 0, 2, 15, 16, linear(ctx, -15, -14, 15, 18, "#c58a50", "#8a5a31", "#3b2415"), "#0b1116", 1.6);
            ctx.strokeStyle = "#5a3a22"; ctx.lineWidth = 0.8;
            for (const x of [-9, -3, 3, 9]) { ctx.beginPath(); ctx.moveTo(x, -12); ctx.quadraticCurveTo(x * 1.15, 2, x, 16); ctx.stroke(); }
            ctx.strokeStyle = "#32343a"; ctx.lineWidth = 2.6;
            for (const y of [-8, 11]) { ctx.beginPath(); ctx.ellipse(0, y, 14.2, 3, 0, 0, Math.PI); ctx.stroke(); }
            rivets(ctx, [[-10, -6], [10, -6], [-10, 13], [10, 13]], "#bfc4c9");
            ctx.strokeStyle = "#ead9a8"; ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.arc(0, 1, 4, 0, Math.PI * 2); ctx.moveTo(-5, 7); ctx.lineTo(5, 3); ctx.moveTo(-5, 3); ctx.lineTo(5, 7); ctx.stroke();
            ctx.strokeStyle = "#4a3d2e"; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(4, -13); ctx.quadraticCurveTo(10, -20, 7, -25); ctx.stroke();
        },
        live(ctx, a, stride, strike, time) {
            const hot = a.winding > 0;
            const spark = 2.5 + Math.sin(time * 15) * 1.2;
            drawGlow(ctx, 7, -25, hot ? 22 : 10, "#ffb65d", hot ? 0.6 : 0.4);
            ctx.fillStyle = hot ? "#fff1b8" : "#ffb65d"; ctx.beginPath(); ctx.arc(7, -25, spark, 0, Math.PI * 2); ctx.fill();
        }
    },
    duelist: {
        size: 80, rotate: true,
        paint(ctx) {
            shape(ctx, [[-14, -13], [2, -10], [2, 10], [-14, 13], [-18, 0]], linear(ctx, -18, -13, 2, 13, "#2f6f7d", "#163a46"), "#0b1116", 1.2);
            ellipse(ctx, -1, 0, 11, 13, linear(ctx, -12, -13, 10, 13, "#7dc7cf", "#357a89", "#143644"), "#0b1116", 1.5);
            ctx.strokeStyle = "#d6f3ef88"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(-6, -9); ctx.quadraticCurveTo(2, 0, -6, 9); ctx.stroke();
            ctx.fillStyle = "#c8a45e"; ctx.fillRect(-4, -12, 3, 24);
            for (const side of [-1, 1]) ball(ctx, 1, side * 12, 4.2, "#b9e8e9", "#3b7f8b");
            ball(ctx, 8, 0, 7, "#cfeff0", "#2c6672");
            shape(ctx, [[8, -7], [16, -3], [16, 3], [8, 7], [5, 0]], "#163a46", "#0b1116", 1);
            ctx.fillStyle = "#e6ffff"; ctx.fillRect(12, -2.5, 3, 1.2); ctx.fillRect(12, 1.3, 3, 1.2);
        },
        live(ctx, a, stride, strike) {
            const color = a.attackWindup > 0 ? "#f2ffff" : "#a5eef1";
            for (const side of [-1, 1]) {
                ctx.strokeStyle = "#0b1116"; ctx.lineWidth = 4.2;
                ctx.beginPath(); ctx.moveTo(2, side * 12); ctx.lineTo(24 + strike * 8, side * 21); ctx.stroke();
                ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.stroke();
                ctx.strokeStyle = "#c8a45e"; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(4, side * 9); ctx.lineTo(3, side * 16); ctx.stroke();
            }
        }
    },
    artillerist: {
        size: 96,
        paint(ctx) {
            shape(ctx, [[-22, 4], [22, 4], [20, 15], [-20, 15]], linear(ctx, 0, 4, 0, 15, "#7a5638", "#3a2618"), "#0b1116", 1.4);
            for (const side of [-1, 1]) {
                ball(ctx, side * 17, 16, 7, "#8b6644", "#2f1f14");
                ctx.strokeStyle = "#c9a26f"; ctx.lineWidth = 1;
                for (let i = 0; i < 4; i++) {
                    const angle = i * Math.PI / 4;
                    ctx.beginPath(); ctx.moveTo(side * 17 - Math.cos(angle) * 6, 16 - Math.sin(angle) * 6);
                    ctx.lineTo(side * 17 + Math.cos(angle) * 6, 16 + Math.sin(angle) * 6); ctx.stroke();
                }
                ball(ctx, side * 17, 16, 2, "#e0c48d", "#7a5a32", null);
            }
            ellipse(ctx, 0, -4, 18, 14, linear(ctx, -18, -18, 18, 10, "#a48bc0", "#5e4a77", "#241d33"), "#0b1116", 1.6);
            ctx.strokeStyle = "#e1b7ff88"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(0, -4, 12, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
            rivets(ctx, [[-14, -4], [14, -4], [0, -16], [0, 8]], "#e8d6f6");
            ball(ctx, 0, -4, 7, "#3a2f4d", "#14101d");
        },
        live(ctx, a, stride, strike, time, facing) {
            ctx.save(); ctx.translate(0, -4); ctx.rotate(facing);
            ctx.fillStyle = linear(ctx, 0, -7, 0, 7, "#d9c6ee", "#8a71a8", "#3a2d4f");
            ctx.strokeStyle = "#0b1116"; ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.rect(0, -7, 30, 14); ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#2a2138"; ctx.fillRect(26, -8.5, 6, 17);
            const charge = a.attackWindup > 0;
            if (charge) drawGlow(ctx, 32, 0, 20, "#e1b7ff", 0.6);
            ctx.fillStyle = charge ? "#f6e3ff" : "#1a1424"; ctx.beginPath(); ctx.arc(32, 0, charge ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
    }
};

const CASTER_COLORS = { summoner: "#b994e1", cantor: "#a4e9bb", hexer: "#ef96cf" };

// Reaver: a hunched
const chargeStretch = (ctx, a) => { if (a.charging > 0) ctx.scale(1.25, 0.82); };
ART.reaver = {
    size: 88, rotate: true,
    under(ctx, a, stride) {
        chargeStretch(ctx, a);
        ctx.strokeStyle = "#1f3440"; ctx.lineWidth = 3.4;
        for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(-6, side * 8); ctx.lineTo(-15 + stride * side * 6, side * 16); ctx.stroke();
        }
    },
    paint(ctx) {
        shape(ctx, [[-20, -10], [-8, -15], [-12, 0], [-8, 15], [-20, 10], [-26, 0]], linear(ctx, -26, -15, -8, 15, "#3d6878", "#1a3240"), "#0b1116", 1.2);
        ellipse(ctx, -2, 0, 14, 12, linear(ctx, -16, -12, 12, 12, "#c7f1ed", "#83b9cb", "#243c4a"), "#0b1116", 1.6);
        for (let i = 0; i < 3; i++) {
            const x = -10 + i * 6;
            ctx.strokeStyle = "#13283399"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, -11); ctx.quadraticCurveTo(x + 3, 0, x, 11); ctx.stroke();
            shape(ctx, [[x - 2, -10], [x + 1, -17], [x + 2, -10]], "#d9f6f2", "#0b1116", 0.7);
        }
        shape(ctx, [[8, -8], [18, -5], [22, 0], [18, 5], [8, 8], [5, 0]], linear(ctx, 5, -8, 22, 8, "#e1fbf8", "#7fb3c3", "#21394a"), "#0b1116", 1.3);
        shape(ctx, [[12, -2.5], [19, -1], [19, 1], [12, 2.5]], "#081016", null);
        glowEye(ctx, 15, -1, "#8ff3ff", 1); glowEye(ctx, 15, 1.6, "#8ff3ff", 0.8);
        for (const side of [-1, 1]) ball(ctx, 4, side * 12, 4.5, "#e1fbf8", "#4f8597");
    },
    live(ctx, a, stride, strike) {
        const reach = 30 + strike * 8;
        for (const side of [-1, 1]) {
            ctx.fillStyle = linear(ctx, 0, side * 10, reach, side * 16, "#ffffff", "#b6eef3", "#5ea5b8");
            ctx.strokeStyle = "#0b1116"; ctx.lineWidth = 1.1;
            ctx.beginPath(); ctx.moveTo(4, side * 11); ctx.quadraticCurveTo(reach * 0.6, side * 22, reach, side * 14);
            ctx.quadraticCurveTo(reach * 0.55, side * 14, 6, side * 15); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        if (a.charging > 0) drawGlow(ctx, 10, 0, 26, "#8ff3ff", 0.35);
    }
};
ART.lancer = {
    size: 96, rotate: true,
    under(ctx, a, stride) {
        chargeStretch(ctx, a);
        ctx.strokeStyle = "#3b2a1c"; ctx.lineWidth = 3.4;
        for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(-8, side * 6); ctx.lineTo(-16 + stride * side * 6, side * 12); ctx.stroke();
        }
    },
    paint(ctx) {
        shape(ctx, [[-10, -12], [-22, -15], [-26, -6], [-24, 6], [-26, 15], [-10, 12]], linear(ctx, -26, -15, -10, 15, "#a33a2c", "#5b1b17"), "#0b1116", 1.2);
        ctx.strokeStyle = "#e9c46e"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-24, -14); ctx.lineTo(-26, -6); ctx.lineTo(-24, 6); ctx.lineTo(-26, 15); ctx.stroke();
        ellipse(ctx, -3, 0, 12, 13, linear(ctx, -15, -13, 9, 13, "#ffe2ad", "#e9ac63", "#5a3a1d"), "#0b1116", 1.6);
        ctx.strokeStyle = "#7a4f22"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-3, -12); ctx.lineTo(-3, 12); ctx.stroke();
        rivets(ctx, [[-8, -7], [-8, 7], [2, -8], [2, 8]], "#fff3d1");
        for (const side of [-1, 1]) ellipse(ctx, 0, side * 12, 6, 4.5, linear(ctx, -6, side * 8, 6, side * 16, "#fff0cc", "#c98d47", "#4d3016"), "#0b1116", 1.1);
        ball(ctx, 5, 0, 7, "#fff1d2", "#8d6534");
        ctx.fillStyle = "#1a1109"; ctx.fillRect(7, -4, 2, 8);
        ctx.fillStyle = "#ffd36b"; ctx.fillRect(7.4, -3.5, 1.2, 7);
        ctx.strokeStyle = "#b23a2c"; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(1, 0); ctx.quadraticCurveTo(-6, -4, -12, -2); ctx.stroke();
        shape(ctx, [[-6, -22], [8, -18], [9, -10], [-6, -12]], linear(ctx, -6, -22, 9, -10, "#f7f0dc", "#a39f8d", "#4a4638"), "#0b1116", 1.2);
        ctx.strokeStyle = "#e9c46e"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(2, -12); ctx.moveTo(-3, -16); ctx.lineTo(5, -15); ctx.stroke();
    },
    live(ctx, a, stride, strike) {
        const thrust = strike * 10 + (a.charging > 0 ? 6 : 0);
        ctx.fillStyle = linear(ctx, 0, 0, 44, 0, "#6b4524", "#a87742");
        ctx.strokeStyle = "#0b1116"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.rect(-6 + thrust, 9, 40, 3.2); ctx.fill(); ctx.stroke();
        shape(ctx, [[2 + thrust, 6.5], [8 + thrust, 6.5], [8 + thrust, 14.5], [2 + thrust, 14.5]], "#d9b062", "#0b1116", 0.8);
        shape(ctx, [[34 + thrust, 7], [46 + thrust, 10.6], [34 + thrust, 14.2]], linear(ctx, 34, 7, 46, 14, "#ffffff", "#c8d3d8", "#5f6c73"), "#0b1116", 1);
        if (a.charging > 0) drawGlow(ctx, 40 + thrust, 10.6, 16, "#ffd27a", 0.45);
    }
};

for (const [kind, color] of Object.entries(CASTER_COLORS)) {
    ART[kind] = {
        size: 92,
        paint(ctx) {
            if (kind === "summoner") {
                ctx.strokeStyle = "#7d6a55"; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(23, -28); ctx.lineTo(23, 22); ctx.stroke();
                ball(ctx, 23, -31, 5.5, "#f3eaff", color);
            }
            ctx.beginPath(); ctx.moveTo(0, -24); ctx.bezierCurveTo(13, -22, 12, 4, 20, 20);
            ctx.quadraticCurveTo(10, 24, 0, 16); ctx.quadraticCurveTo(-10, 24, -20, 20);
            ctx.bezierCurveTo(-12, 4, -13, -22, 0, -24); ctx.closePath();
            ctx.fillStyle = linear(ctx, -20, -24, 20, 22, color, "#4a3f63", "#1b1828");
            ctx.fill(); ctx.strokeStyle = "#0b1116"; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.strokeStyle = color; ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.moveTo(-20, 20); ctx.quadraticCurveTo(-10, 24, 0, 16); ctx.quadraticCurveTo(10, 24, 20, 20); ctx.stroke();
            ctx.strokeStyle = color + "aa"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 15); ctx.stroke();
            for (const y of [0, 5, 10]) { ctx.beginPath(); ctx.moveTo(-2, y); ctx.lineTo(2, y + 2); ctx.lineTo(-2, y + 4); ctx.stroke(); }
            for (const side of [-1, 1]) {
                ctx.strokeStyle = "#2b2540"; ctx.lineWidth = 4;
                ctx.beginPath(); ctx.moveTo(side * 8, -6); ctx.quadraticCurveTo(side * 14, 0, side * 13, 6); ctx.stroke();
                ball(ctx, side * 13, 7, 2.6, "#f4e7d6", "#a68f7c", null);
            }
            shape(ctx, [[0, -24], [10, -14], [8, -2], [-8, -2], [-10, -14]], linear(ctx, -10, -24, 10, -2, "#463b5e", "#1b1726"), "#0b1116", 1.3);
            ellipse(ctx, 0, -10, 5.5, 5, "#0b0910", null);
            glowEye(ctx, -2.2, -10, color, 1.2); glowEye(ctx, 2.2, -10, color, 1.2);
        },
        live(ctx, a, stride, strike, time) {
            for (const side of [-1, 1]) drawGlow(ctx, side * 13, 7, 7, color, 0.45);
            ctx.strokeStyle = color; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, kind === "cantor" ? 40 : 27, time, time + Math.PI * 1.6); ctx.stroke();
            if (kind === "hexer") {
                ctx.fillStyle = color;
                for (let i = 0; i < 4; i++) {
                    ctx.beginPath(); ctx.arc(Math.cos(time + i * Math.PI / 2) * 30, Math.sin(time + i * Math.PI / 2) * 30, 4, 0, Math.PI * 2); ctx.fill();
                }
            }
        }
    };
}

// Draws the enemy if this module has art for its kind; returns false so the caller can fall back.
export function drawMob(ctx, actor, facing, stride, strike, time) {
    const art = ART[actor.kind];
    if (!art) return false;
    const key = actor.kind;
    const base = bake(key, art.size, art.paint);
    const sprite = actor.flash > 0 ? flashed(key + ":flash", base, art.size) : base;
    if (art.rotate) ctx.rotate(facing);
    art.under?.(ctx, actor, stride, strike, time, facing);
    ctx.drawImage(sprite, -art.size / 2, -art.size / 2, art.size, art.size);
    art.live?.(ctx, actor, stride, strike, time, facing);
    return true;
}

// Per-stage ground textures, painted once into the cached floor canvas. Each act gets its own
// surface so the six stages read as different places instead of one recoloured brick floor.
const shift = (tint, amount) => `rgb(${tint.map(channel => Math.max(0, Math.min(255, channel + amount))).join(",")})`;

function blotches(ctx, random, width, height, tint, count, size, spread) {
    for (let i = 0; i < count; i++) {
        const x = random() * width, y = random() * height, r = size * (0.5 + random());
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, shift(tint, (random() - 0.5) * spread * 2));
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
}

function organicBlob(ctx, random, x, y, rx, ry, fill, stroke = null) {
    const points = [];
    const count = 8;
    for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2;
        const wobble = 0.72 + random() * 0.48;
        points.push({ x: x + Math.cos(angle) * rx * wobble, y: y + Math.sin(angle) * ry * wobble });
    }
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
        const current = points[i], next = points[(i + 1) % count];
        const midX = (current.x + next.x) / 2, midY = (current.y + next.y) / 2;
        if (i === 0) ctx.moveTo(midX, midY);
        ctx.quadraticCurveTo(current.x, current.y, midX, midY);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}

// Ashen Hollow: scorched earth, wind-smoothed ash and scattered broken stone.
function hollow(ctx, random, width, height, tint) {
    blotches(ctx, random, width, height, tint, 60, 90, 10);
    for (let i = 0; i < 14; i++) {
        const x = random() * width, y = random() * height;
        organicBlob(ctx, random, x, y, 24 + random() * 24, 18 + random() * 17, shift(tint, 5 + random() * 6), "#0b131746");
    }
    ctx.fillStyle = "#c9c2b012";
    for (let i = 0; i < 400; i++) ctx.fillRect(random() * width, random() * height, 2, 2);
}

// Drowned Wilds: dark mud with shallow water pools and moss.
function marsh(ctx, random, width, height, tint) {
    blotches(ctx, random, width, height, tint, 70, 100, 12);
    for (let i = 0; i < 9; i++) {
        const x = random() * width, y = random() * height, rx = 60 + random() * 90, ry = 25 + random() * 35;
        ctx.fillStyle = "#0e2a3088"; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, random() * 0.6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#7fb4b02a"; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.strokeStyle = "#a9d8d018"; ctx.beginPath(); ctx.ellipse(x - rx * 0.2, y - ry * 0.2, rx * 0.4, ry * 0.25, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = "#5f8a4a26";
    for (let i = 0; i < 260; i++) { ctx.beginPath(); ctx.arc(random() * width, random() * height, 1 + random() * 3, 0, Math.PI * 2); ctx.fill(); }
}

// Cinder Citadel: soot-dark stone with low, branching ember seams instead of a tile grid.
function citadel(ctx, random, width, height, tint) {
    blotches(ctx, random, width, height, tint, 55, 105, 9);
    for (let i = 0; i < 22; i++) organicBlob(ctx, random, random() * width, random() * height,
        25 + random() * 42, 16 + random() * 28, "#090d12" + (i % 2 ? "22" : "30"));
    ctx.lineCap = "round";
    for (let i = 0; i < 10; i++) {
        let x = random() * width, y = random() * height;
        ctx.strokeStyle = "#ff7a2c44"; ctx.lineWidth = 2 + random(); ctx.shadowColor = "#ff6a1a"; ctx.shadowBlur = 7;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let s = 0; s < 4; s++) {
            const cx = x + (random() - 0.5) * 55, cy = y + (random() - 0.5) * 50;
            x += (random() - 0.5) * 62; y += (random() - 0.5) * 56;
            ctx.quadraticCurveTo(cx, cy, x, y);
        }
        ctx.stroke();
    }
    ctx.shadowBlur = 0;
}

// Glass Expanse: smooth ice sheet with softly meandering fractures and frost glints.
function glacier(ctx, random, width, height, tint) {
    const sheen = ctx.createLinearGradient(0, 0, width, height);
    sheen.addColorStop(0, shift(tint, 14)); sheen.addColorStop(0.5, shift(tint, -4)); sheen.addColorStop(1, shift(tint, 10));
    ctx.fillStyle = sheen; ctx.fillRect(0, 0, width, height);
    blotches(ctx, random, width, height, tint, 30, 140, 14);
    ctx.strokeStyle = "#d8f4ff30"; ctx.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
        let x = random() * width, y = random() * height;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let s = 0; s < 4; s++) {
            const cx = x + (random() - 0.5) * 90, cy = y + (random() - 0.5) * 70;
            x += (random() - 0.5) * 140; y += (random() - 0.5) * 90;
            ctx.quadraticCurveTo(cx, cy, x, y);
        }
        ctx.stroke();
    }
    ctx.fillStyle = "#ffffff30";
    for (let i = 0; i < 120; i++) ctx.fillRect(random() * width, random() * height, 1.5, 1.5);
}

// Storm Archive: rain-dark slate, scattered ink-like marks and worn traces of old script.
function archive(ctx, random, width, height, tint) {
    blotches(ctx, random, width, height, tint, 48, 115, 10);
    for (let i = 0; i < 28; i++) {
        const x = random() * width, y = random() * height, w = 10 + random() * 20;
        ctx.save(); ctx.translate(x, y); ctx.rotate((random() - 0.5) * 1.2);
        ctx.strokeStyle = "#c8b8ff" + (i % 2 ? "20" : "28"); ctx.lineWidth = 1 + random(); ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(-w, 0); ctx.quadraticCurveTo(-w * 0.2, -5 - random() * 5, w * 0.3, 0);
        ctx.quadraticCurveTo(w * 0.7, 4 + random() * 4, w, -2); ctx.stroke();
        if (random() < 0.45) { ctx.beginPath(); ctx.moveTo(-w * 0.15, 2); ctx.quadraticCurveTo(w * 0.1, 8, w * 0.36, 3); ctx.stroke(); }
        ctx.restore();
    }
}

// Starless Gate: void ground with drifting stardust and soft, broken nebula-like islands.
function rift(ctx, random, width, height, tint) {
    ctx.fillStyle = shift(tint, -10); ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 220; i++) { ctx.fillStyle = `rgba(220,200,255,${0.08 + random() * 0.22})`; ctx.beginPath(); ctx.arc(random() * width, random() * height, 0.6 + random() * 1.2, 0, Math.PI * 2); ctx.fill(); }
    for (let i = 0; i < 24; i++) {
        const x = random() * width, y = random() * height, size = 36 + random() * 52;
        organicBlob(ctx, random, x, y, size, size * (0.4 + random() * 0.45), shift(tint, 4 + random() * 8), "#b07cff30");
    }
}

const PAINTERS = { hollow, marsh, citadel, glacier, archive, rift };

export function paintGround(ctx, map, random, width, height) {
    (PAINTERS[map.id] ?? hollow)(ctx, random, width, height, map.tint);
}

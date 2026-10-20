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

// Ashen Hollow: scorched earth with ash drifts and a few broken flagstones.
function hollow(ctx, random, width, height, tint) {
    blotches(ctx, random, width, height, tint, 60, 90, 10);
    for (let i = 0; i < 14; i++) {
        const x = random() * width, y = random() * height, w = 50 + random() * 40, h = 36 + random() * 26, a = (random() - 0.5) * 0.5;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        ctx.fillStyle = shift(tint, 6 + random() * 6); ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.strokeStyle = "#0b13176b"; ctx.lineWidth = 1.5; ctx.strokeRect(-w / 2, -h / 2, w, h);
        ctx.restore();
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

// Cinder Citadel: large dark iron-bound slabs with glowing ember seams.
function citadel(ctx, random, width, height, tint) {
    const size = 130;
    for (let y = 0; y < height + size; y += size) for (let x = 0; x < width + size; x += size) {
        ctx.fillStyle = shift(tint, Math.floor(random() * 10) - 4); ctx.fillRect(x + 3, y + 3, size - 6, size - 6);
        ctx.strokeStyle = "#00000088"; ctx.lineWidth = 3; ctx.strokeRect(x + 3, y + 3, size - 6, size - 6);
        ctx.fillStyle = "#00000055";
        for (const [dx, dy] of [[12, 12], [size - 12, 12], [12, size - 12], [size - 12, size - 12]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 3, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.lineCap = "round";
    for (let i = 0; i < 12; i++) {
        let x = random() * width, y = random() * height;
        ctx.strokeStyle = "#ff7a2c55"; ctx.lineWidth = 2.5; ctx.shadowColor = "#ff6a1a"; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let s = 0; s < 5; s++) { x += (random() - 0.5) * 60; y += (random() - 0.5) * 60; ctx.lineTo(x, y); }
        ctx.stroke();
    }
    ctx.shadowBlur = 0;
}

// Glass Expanse: smooth ice sheet with long fracture lines and frost glints.
function glacier(ctx, random, width, height, tint) {
    const sheen = ctx.createLinearGradient(0, 0, width, height);
    sheen.addColorStop(0, shift(tint, 14)); sheen.addColorStop(0.5, shift(tint, -4)); sheen.addColorStop(1, shift(tint, 10));
    ctx.fillStyle = sheen; ctx.fillRect(0, 0, width, height);
    blotches(ctx, random, width, height, tint, 30, 140, 14);
    ctx.strokeStyle = "#d8f4ff30"; ctx.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
        let x = random() * width, y = random() * height;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let s = 0; s < 4; s++) { x += (random() - 0.5) * 140; y += (random() - 0.5) * 90; ctx.lineTo(x, y); }
        ctx.stroke();
    }
    ctx.fillStyle = "#ffffff30";
    for (let i = 0; i < 120; i++) ctx.fillRect(random() * width, random() * height, 1.5, 1.5);
}

// Storm Archive: polished hexagonal mosaic with faint glyph inlays.
function archive(ctx, random, width, height, tint) {
    const r = 42, w = Math.sqrt(3) * r;
    for (let row = -1; row * r * 1.5 < height + r; row++) for (let col = -1; col * w < width + w; col++) {
        const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * r * 1.5;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; ctx.lineTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2)); }
        ctx.closePath();
        ctx.fillStyle = shift(tint, Math.floor(random() * 10) - 3); ctx.fill();
        ctx.strokeStyle = "#c8b8ff22"; ctx.lineWidth = 1.5; ctx.stroke();
        if (random() < 0.12) { ctx.strokeStyle = "#b9a6ff30"; ctx.beginPath(); ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2); ctx.moveTo(cx - r * 0.35, cy); ctx.lineTo(cx + r * 0.35, cy); ctx.stroke(); }
    }
}

// Starless Gate: void ground of floating broken plates over a starfield.
function rift(ctx, random, width, height, tint) {
    ctx.fillStyle = shift(tint, -10); ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 220; i++) { ctx.fillStyle = `rgba(220,200,255,${0.1 + random() * 0.35})`; ctx.fillRect(random() * width, random() * height, 1.5, 1.5); }
    for (let i = 0; i < 30; i++) {
        const x = random() * width, y = random() * height, size = 50 + random() * 70, sides = 5 + Math.floor(random() * 3);
        ctx.beginPath();
        for (let k = 0; k < sides; k++) { const a = k * Math.PI * 2 / sides + random() * 0.4; const d = size * (0.7 + random() * 0.3); ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
        ctx.closePath();
        ctx.fillStyle = shift(tint, 4 + random() * 8); ctx.fill();
        ctx.strokeStyle = "#b07cff44"; ctx.lineWidth = 1.5; ctx.stroke();
    }
}

const PAINTERS = { hollow, marsh, citadel, glacier, archive, rift };

export function paintGround(ctx, map, random, width, height) {
    (PAINTERS[map.id] ?? hollow)(ctx, random, width, height, map.tint);
}

export const BOSS_MOVES = {
    hollow: ['BELLFALL — LEAVE THE CIRCLE', 'OATH CHARGE — STEP SIDEWAYS', 'BELL ECHO — CLOSE THE DISTANCE'],
    marsh: ['MIREFALL — LEAVE THE CIRCLE', 'DROWNED MARK — LEAVE YOUR OLD POSITION', 'REED TRAP — BETWEEN THE POOLS'],
    citadel: ['FURNACE LANE — STEP SIDEWAYS', 'CINDER BRAND — LEAVE YOUR OLD POSITION', 'FURNACE WALLS — BETWEEN THE LANES'],
    glacier: ['SHATTER CROSS — LEAVE THE LANES', 'GLASS PRISON — INSIDE OR OUTSIDE', 'BROKEN MIRROR — LEAVE THE DIAGONALS'],
    archive: ['UNWRITTEN SEAL — LEAVE THE CIRCLE', 'ERASED LINE — STEP SIDEWAYS', 'INDEX SEALS — BETWEEN THE MARKS'],
    rift: ['VOID RING — INSIDE OR OUTSIDE', 'UNMAKING — LEAVE YOUR OLD POSITION', 'LAST HORIZON — CLOSE THE DISTANCE']
};

export function bossShapes(profile, enemy, pattern = enemy.combat?.pattern ?? 1) {
    const angle = Math.atan2(enemy.attackY - enemy.y, enemy.attackX - enemy.x);
    const circle = (x, y, radius, inner = 0) => ({ kind: 'circle', x, y, radius, inner });
    const lane = (x, y, length, width, rotation = angle) => ({ kind: 'lane', x, y, length, width, angle: rotation });
    const cross = rotation => [lane(enemy.x - Math.cos(rotation) * 300, enemy.y - Math.sin(rotation) * 300, 600, 48, rotation),
        lane(enemy.x + Math.sin(rotation) * 300, enemy.y - Math.cos(rotation) * 300, 600, 48, rotation + Math.PI / 2)];
    if (pattern === 1) {
        if (profile.id === 'citadel') return [lane(enemy.x, enemy.y, 450, 80)];
        if (profile.id === 'glacier') return cross(angle);
        return [circle(enemy.x, enemy.y, profile.radius, profile.id === 'rift' ? 70 : 0)];
    }
    if (pattern === 2) {
        if (['hollow', 'archive'].includes(profile.id)) return [lane(enemy.x, enemy.y, 550, profile.id === 'hollow' ? 90 : 60)];
        if (profile.id === 'glacier') return [circle(enemy.attackX, enemy.attackY, 155, 65)];
        return [circle(enemy.attackX, enemy.attackY, profile.id === 'rift' ? 120 : 90)];
    }
    if (profile.id === 'glacier') return cross(angle + Math.PI / 4);
    if (['hollow', 'rift'].includes(profile.id)) return [circle(enemy.x, enemy.y, profile.id === 'rift' ? 320 : 260, 125)];
    if (profile.id === 'citadel') return [-110, 110].map(offset => lane(enemy.x - Math.sin(angle) * offset, enemy.y + Math.cos(angle) * offset, 550, 65));
    return [-1, 0, 1].map(offset => circle(enemy.attackX + Math.cos(angle + Math.PI / 2) * offset * 155,
        enemy.attackY + Math.sin(angle + Math.PI / 2) * offset * 155, profile.id === 'archive' ? 55 : 60));
}

export function bossDanger(profile, enemy, point, pattern) {
    const padding = point.radius ?? 0;
    return bossShapes(profile, enemy, pattern).some(shape => {
        const dx = point.x - shape.x, dy = point.y - shape.y;
        if (shape.kind === 'circle') {
            const distance = Math.hypot(dx, dy);
            return distance <= shape.radius + padding && (!shape.inner || distance >= shape.inner - padding);
        }
        const along = dx * Math.cos(shape.angle) + dy * Math.sin(shape.angle);
        const across = -dx * Math.sin(shape.angle) + dy * Math.cos(shape.angle);
        return along >= -padding && along <= shape.length + padding && Math.abs(across) <= shape.width / 2 + padding;
    });
}

export function drawBossDanger(ctx, profile, enemy) {
    for (const shape of bossShapes(profile, enemy)) {
        ctx.save(); ctx.translate(shape.x, shape.y);
        if (shape.kind === 'lane') {
            ctx.rotate(shape.angle); ctx.fillRect(0, -shape.width / 2, shape.length, shape.width); ctx.strokeRect(0, -shape.width / 2, shape.length, shape.width);
        } else {
            ctx.beginPath(); ctx.arc(0, 0, shape.radius, 0, Math.PI * 2);
            if (shape.inner) ctx.arc(0, 0, shape.inner, 0, Math.PI * 2, true);
            ctx.fill('evenodd'); ctx.stroke();
        }
        ctx.restore();
    }
}
export const bossWarning = (profile, pattern = 1) => BOSS_MOVES[profile.id][pattern - 1];

// Landed boss skills: each realm gets its own attack look on the exact shapes it hits.
const STRIKE_THEMES = {
    hollow: { core: '#fff1c4', edge: '#d89a48', dark: '#3a2410', style: 'quake' },
    marsh: { core: '#dcffe0', edge: '#4f9a6c', dark: '#10261c', style: 'splash' },
    citadel: { core: '#fff3b8', edge: '#ff6a2a', dark: '#3b0d04', style: 'fire' },
    glacier: { core: '#f4feff', edge: '#7fd4ff', dark: '#0d2a3a', style: 'ice' },
    archive: { core: '#fff7dc', edge: '#c9a6ff', dark: '#22183a', style: 'rune' },
    rift: { core: '#f6e2ff', edge: '#9a4dff', dark: '#12021f', style: 'void' }
};
const jitter = seed => { const x = Math.sin(seed * 127.1) * 43758.5453; return x - Math.floor(x); };

function laneStrike(ctx, shape, t, progress, fade) {
    const head = shape.length * Math.min(1, progress / 0.28), half = shape.width / 2;
    const glow = ctx.createLinearGradient(0, -half, 0, half);
    glow.addColorStop(0, t.edge + '00'); glow.addColorStop(0.5, t.core); glow.addColorStop(1, t.edge + '00');
    ctx.globalAlpha = 0.55 * fade; ctx.fillStyle = t.edge; ctx.fillRect(0, -half, head, shape.width);
    ctx.globalAlpha = 0.9 * fade; ctx.fillStyle = glow; ctx.fillRect(0, -half * 0.45, head, half * 0.9);
    const step = 26;
    for (let x = step / 2; x < head; x += step) {
        const r = jitter(x + shape.length), age = Math.min(1, (head - x) / 120);
        ctx.globalAlpha = fade * age;
        if (t.style === 'fire') {
            const h = half * (0.6 + r * 0.7) * (1 - progress * 0.5);
            ctx.fillStyle = r > 0.5 ? t.core : t.edge;
            for (const side of [-1, 1]) {
                ctx.beginPath(); ctx.moveTo(x - 9, side * half * 0.3); ctx.lineTo(x + (r - 0.5) * 10, side * h); ctx.lineTo(x + 9, side * half * 0.3); ctx.closePath(); ctx.fill();
            }
        } else if (t.style === 'ice') {
            ctx.fillStyle = t.core; ctx.strokeStyle = t.edge; ctx.lineWidth = 2;
            const h = half * (0.7 + r * 0.6) * Math.min(1, age * 2);
            ctx.beginPath(); ctx.moveTo(x - 8, 0); ctx.lineTo(x + (r - 0.5) * 8, (r > 0.5 ? -1 : 1) * h); ctx.lineTo(x + 8, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        } else if (t.style === 'rune') {
            ctx.strokeStyle = t.core; ctx.lineWidth = 2;
            ctx.save(); ctx.translate(x, (r - 0.5) * half); ctx.rotate(progress * 4 + r * 6); ctx.strokeRect(-5, -5, 10, 10); ctx.restore();
        } else if (t.style === 'void') {
            ctx.fillStyle = t.dark; ctx.beginPath(); ctx.arc(x, (r - 0.5) * half, 6 + r * 8 * fade, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = t.edge; ctx.lineWidth = 1.5; ctx.stroke();
        } else {
            ctx.fillStyle = t.style === 'splash' ? t.core : t.edge;
            const lift = progress * 30 * r;
            ctx.beginPath(); ctx.arc(x + (r - 0.5) * 14, (r > 0.5 ? -1 : 1) * (half * 0.5 + lift), 3 + r * 4, 0, Math.PI * 2); ctx.fill();
        }
    }
    // Leading edge flash so the strike reads as travelling down the lane.
    if (progress < 0.35) {
        ctx.globalAlpha = 1 - progress / 0.35; ctx.fillStyle = t.core;
        ctx.beginPath(); ctx.ellipse(head, 0, 14, half * 1.1, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = fade; ctx.strokeStyle = t.core; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -half); ctx.lineTo(head, -half); ctx.moveTo(0, half); ctx.lineTo(head, half); ctx.stroke();
}

function circleStrike(ctx, shape, t, progress, fade) {
    const inner = shape.inner ?? 0, impact = Math.min(1, progress * 3.5);
    const area = () => { ctx.beginPath(); ctx.arc(0, 0, shape.radius, 0, Math.PI * 2); if (inner) ctx.arc(0, 0, inner, 0, Math.PI * 2, true); };
    const glow = ctx.createRadialGradient(0, 0, inner, 0, 0, shape.radius);
    glow.addColorStop(0, t.style === 'void' ? t.dark : t.core); glow.addColorStop(1, t.edge);
    ctx.globalAlpha = (progress < 0.12 ? 0.9 : 0.55) * fade; ctx.fillStyle = glow; area(); ctx.fill('evenodd');
    // Shockwave: expands outward (or collapses inward for the void).
    const wave = t.style === 'void' ? shape.radius - (shape.radius - inner) * impact : inner + (shape.radius - inner) * impact;
    ctx.globalAlpha = fade; ctx.strokeStyle = t.core; ctx.lineWidth = 6 * fade + 2;
    ctx.beginPath(); ctx.arc(0, 0, Math.max(1, wave), 0, Math.PI * 2); ctx.stroke();
    const count = Math.max(8, Math.round(shape.radius / 14));
    for (let i = 0; i < count; i++) {
        const r = jitter(i + shape.radius), a = i * Math.PI * 2 / count + r * 0.4;
        const cos = Math.cos(a), sin = Math.sin(a);
        ctx.globalAlpha = fade;
        if (t.style === 'quake') {
            ctx.strokeStyle = t.dark; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(cos * (inner + 6), sin * (inner + 6));
            const reach = inner + (shape.radius - inner) * impact * (0.6 + r * 0.4);
            ctx.lineTo(cos * reach * 0.55 - sin * 8 * (r - 0.5), sin * reach * 0.55 + cos * 8 * (r - 0.5)); ctx.lineTo(cos * reach, sin * reach); ctx.stroke();
        } else if (t.style === 'splash') {
            const d = inner + (shape.radius - inner) * (0.4 + progress * 0.8 * r), lift = Math.sin(progress * Math.PI) * 26 * r;
            ctx.fillStyle = t.core; ctx.beginPath(); ctx.arc(cos * d, sin * d - lift, 3 + r * 4, 0, Math.PI * 2); ctx.fill();
        } else if (t.style === 'fire') {
            const d = shape.radius * (0.55 + r * 0.45), h = 18 + r * 22;
            ctx.fillStyle = r > 0.5 ? t.core : t.edge;
            ctx.beginPath(); ctx.moveTo(cos * d - 8, sin * d); ctx.lineTo(cos * d + (r - 0.5) * 8, sin * d - h * fade - progress * 20); ctx.lineTo(cos * d + 8, sin * d); ctx.closePath(); ctx.fill();
        } else if (t.style === 'ice') {
            const base = inner + (shape.radius - inner) * (0.35 + r * 0.5), tip = base + 20 + r * 26;
            ctx.fillStyle = t.core; ctx.strokeStyle = t.edge; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(cos * base - sin * 7, sin * base + cos * 7); ctx.lineTo(cos * tip * impact + cos * base * (1 - impact), sin * tip * impact + sin * base * (1 - impact)); ctx.lineTo(cos * base + sin * 7, sin * base - cos * 7); ctx.closePath(); ctx.fill(); ctx.stroke();
        } else if (t.style === 'rune') {
            const d = (inner + shape.radius) / 2 + (shape.radius - inner) * 0.3 * (r - 0.5), spin = a + progress * 2;
            ctx.save(); ctx.translate(Math.cos(spin) * d, Math.sin(spin) * d); ctx.rotate(spin * 2);
            ctx.strokeStyle = t.core; ctx.lineWidth = 2; ctx.strokeRect(-5, -5, 10, 10);
            ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.stroke(); ctx.restore();
        } else {
            const from = shape.radius + 10, to = inner + 4, d = from - (from - to) * impact;
            ctx.strokeStyle = t.edge; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(cos * from, sin * from); ctx.quadraticCurveTo(Math.cos(a + 0.5) * (from + d) / 2, Math.sin(a + 0.5) * (from + d) / 2, cos * d, sin * d); ctx.stroke();
        }
    }
    ctx.globalAlpha = fade; ctx.strokeStyle = t.edge; ctx.lineWidth = 3; area(); ctx.stroke();
}

export function drawBossStrike(ctx, item, progress) {
    const theme = STRIKE_THEMES[item.bossId] ?? STRIKE_THEMES.hollow, fade = 1 - progress;
    for (const shape of item.shapes ?? []) {
        ctx.save(); ctx.translate(shape.x, shape.y);
        if (shape.kind === 'lane') { ctx.rotate(shape.angle); laneStrike(ctx, shape, theme, progress, fade); }
        else circleStrike(ctx, shape, theme, progress, fade);
        ctx.restore();
    }
}

// Boss projectiles: larger than mob bolts and shaped per realm so they never blend in.
const BOSS_IDS = ['hollow', 'marsh', 'citadel', 'glacier', 'archive', 'rift'];
export function drawBossProjectile(ctx, bolt, time, lite = false) {
    const t = STRIKE_THEMES[BOSS_IDS[(bolt.boss - 1) % 6]] ?? STRIKE_THEMES.hollow;
    const angle = Math.atan2(bolt.vy, bolt.vx), spin = time * 8 + bolt.x * 0.05;
    ctx.save(); ctx.translate(bolt.x, bolt.y);
    if (!lite) {
        ctx.globalAlpha = 0.35; ctx.fillStyle = t.edge;
        ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
    }
    ctx.rotate(angle);
    // Trail
    ctx.lineCap = 'round'; ctx.strokeStyle = t.edge; ctx.globalAlpha = 0.6; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-38, 0); ctx.lineTo(0, 0); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = t.edge; ctx.strokeStyle = t.dark; ctx.lineWidth = 2;
    switch (t.style) {
        case 'quake': // bell shard
            ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, -11); ctx.lineTo(-2, 0); ctx.lineTo(-6, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
            break;
        case 'splash': // bubbling mire glob
            for (const [x, y, r] of [[4, 0, 9], [-6, -5, 5], [-7, 5, 4]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
            break;
        case 'fire': // fireball with flame tail
            ctx.fillStyle = t.edge; ctx.beginPath(); ctx.moveTo(12, 0); ctx.quadraticCurveTo(0, -12, -18, Math.sin(spin) * 4); ctx.quadraticCurveTo(0, 12, 12, 0); ctx.fill(); ctx.stroke();
            break;
        case 'ice': // spinning ice star
            ctx.rotate(spin - angle); ctx.fillStyle = t.core; ctx.strokeStyle = t.edge;
            ctx.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 5 : 14, a = i * Math.PI / 4; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.stroke();
            break;
        case 'rune': // rotating sigil square
            ctx.rotate(spin - angle); ctx.strokeStyle = t.core; ctx.lineWidth = 2.5;
            ctx.strokeRect(-10, -10, 20, 20); ctx.rotate(Math.PI / 4); ctx.strokeRect(-7, -7, 14, 14);
            ctx.fillStyle = t.edge; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
            break;
        default: // void orb with dark core
            ctx.fillStyle = t.dark; ctx.strokeStyle = t.edge; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = t.core; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 15, spin, spin + 2); ctx.stroke();
    }
    ctx.fillStyle = t.core; ctx.beginPath(); ctx.arc(t.style === 'fire' ? 4 : 0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

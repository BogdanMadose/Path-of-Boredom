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

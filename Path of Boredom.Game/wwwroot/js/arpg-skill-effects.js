// Ability-specific canvas art. All geometry is transient; no combat timers or saved fields live here.
const TAU = Math.PI * 2;
function line(ctx, points) {
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
}
function polygon(ctx, points, fill = true) {
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    if (fill) ctx.fill();
    ctx.stroke();
}
function ring(ctx, x, y, radius) { ctx.beginPath(); ctx.arc(x, y, Math.max(1, radius), 0, TAU); ctx.stroke(); }
function leaf(ctx, x, y, size, angle) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(-size, 0); ctx.quadraticCurveTo(0, -size, size, 0); ctx.quadraticCurveTo(0, size, -size, 0); ctx.fill(); ctx.stroke();
    ctx.restore();
}
function arrow(ctx, length, width = 3) {
    ctx.lineWidth = width;
    line(ctx, [[0, 0], [length, 0]]);
    polygon(ctx, [[length, 0], [length - 15, -6], [length - 11, 0], [length - 15, 6]]);
}
function halo(ctx, radius, count, phase, stones = false) {
    for (let i = 0; i < count; i++) {
        const angle = i * TAU / count + phase, x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
        if (stones) polygon(ctx, [[x - 6, y - 4], [x + 4, y - 7], [x + 8, y + 2], [x - 2, y + 7]]);
        else leaf(ctx, x, y, 7, angle);
    }
}
export function drawClassSkillEffect(ctx, item, progress, reduced = false) {
    const r = Math.max(1, item.radius), bloom = 0.7 + progress * 0.3;
    const phase = reduced ? 0 : progress * 1.5;
    ctx.save(); ctx.translate(item.x, item.y); ctx.rotate(item.angle ?? 0);
    ctx.strokeStyle = item.color; ctx.fillStyle = item.color; ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const { heroClass: hero, skill } = item;
    if (hero === 'knight') {
        if (skill === 'chain') {
            const points = [[0, 0]];
            for (let i = 1; i <= 8; i++) points.push([r * i / 8, i === 8 ? 0 : Math.sin(i * 2.4 + phase) * 12]);
            ctx.lineWidth = 6; line(ctx, points);
            ctx.strokeStyle = '#fff1ae'; ctx.lineWidth = 2; line(ctx, points);
            for (let i = 1; i < 5; i++) polygon(ctx, [[r * i / 5 - 4, 3], [r * i / 5, -12], [r * i / 5 + 6, 4]]);
        } else if (skill === 'frost') {
            const w = (item.width ?? 48) / 2;
            ctx.globalAlpha *= 0.55;
            polygon(ctx, [[0, -w], [r, -w * 0.7], [r, w * 0.7], [0, w]]);
            for (let i = 1; i <= 7; i++) {
                const x = r * i / 8;
                polygon(ctx, [[x - 9, -w], [x, -w - 12 * bloom], [x + 9, -w]]);
                polygon(ctx, [[x - 9, w], [x, w + 12 * bloom], [x + 9, w]]);
            }
            ctx.strokeStyle = '#fff0bf'; line(ctx, [[0, 0], [r, 0]]);
        } else if (skill === 'reap') {
            const arc = item.arc ?? 1.4;
            for (const size of [0.8, 1]) { ctx.beginPath(); ctx.arc(0, 0, r * bloom * size, -arc, arc); ctx.stroke(); }
            for (let i = 0; i < 9; i++) {
                const a = -arc + i * arc / 4, x = Math.cos(a) * r * bloom, y = Math.sin(a) * r * bloom;
                polygon(ctx, [[x, y], [Math.cos(a + 0.07) * r * bloom * 0.82, Math.sin(a + 0.07) * r * bloom * 0.82], [Math.cos(a + 0.12) * r * bloom, Math.sin(a + 0.12) * r * bloom]]);
            }
        } else if (skill === 'meteor' || skill === 'burst') {
            const w = (item.width ?? 44) / 2;
            polygon(ctx, [[0, -w], [r * 0.8, -w * 0.65], [r, 0], [r * 0.8, w * 0.65], [0, w]]);
            ctx.strokeStyle = '#fff7c5'; ctx.lineWidth = 4; line(ctx, [[0, 0], [r, 0]]);
            if (skill === 'meteor') {
                ring(ctx, r, 0, 16 + progress * 10);
                for (let i = 0; i < 8; i++) { const a = i * TAU / 8; line(ctx, [[r + Math.cos(a) * 20, Math.sin(a) * 20], [r + Math.cos(a) * 30, Math.sin(a) * 30]]); }
            } else for (let i = 0; i < 6; i++) polygon(ctx, [[r * i / 6, -w], [r * i / 6 + 12, -w - 15], [r * i / 6 + 22, -w]]);
        } else if (skill === 'siphon') {
            ring(ctx, 0, 0, r * bloom); ring(ctx, 0, 0, r * 0.65);
            polygon(ctx, [[0, -r * 0.7], [r * 0.35, 0], [0, r * 0.6], [-r * 0.35, 0]]);
            for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; line(ctx, [[Math.cos(a) * r, Math.sin(a) * r], [Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3]]); }
        } else if (skill === 'nullwave') {
            const arc = item.arc ?? Math.PI / 3;
            for (let i = 0; i < 9; i++) {
                const a = -arc + i * arc / 4;
                polygon(ctx, [[Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4], [Math.cos(a - 0.05) * r * bloom, Math.sin(a - 0.05) * r * bloom], [Math.cos(a + 0.05) * r * bloom, Math.sin(a + 0.05) * r * bloom]]);
            }
            ctx.beginPath(); ctx.arc(0, 0, r * bloom, -arc, arc); ctx.stroke();
        } else if (skill === 'nova') {
            ring(ctx, 0, 0, r * bloom);
            for (let i = 0; i < 12; i++) {
                const a = i * TAU / 12, x = Math.cos(a) * r * bloom, y = Math.sin(a) * r * bloom;
                polygon(ctx, [[x - 6, y + 6], [x, y - 18], [x + 6, y + 6]]);
            }
        } else if (skill === 'guard') {
            polygon(ctx, Array.from({ length: 6 }, (_, i) => [Math.cos(i * TAU / 6) * r * 0.55, Math.sin(i * TAU / 6) * r * 0.55]), false);
            for (let i = 0; i < 8; i++) { const a = i * TAU / 8; polygon(ctx, [[Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7], [Math.cos(a + 0.1) * r, Math.sin(a + 0.1) * r], [Math.cos(a + 0.2) * r * 0.7, Math.sin(a + 0.2) * r * 0.7]]); }
        }
    } else if (hero === 'ranger') {
        if (skill === 'chain') {
            ctx.lineWidth = 3; arrow(ctx, r);
            for (let i = 1; i < 4; i++) line(ctx, [[r * i / 4 - 8, -6], [r * i / 4, 0], [r * i / 4 - 8, 6]]);
            ring(ctx, r, 0, 10 + progress * 10);
        } else if (skill === 'frost') {
            if (item.variant === 'link') arrow(ctx, r);
            else {
                ring(ctx, 0, 0, r * bloom);
                for (let i = 0; i < 8; i++) {
                    const a = i * TAU / 8;
                    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(Math.cos(a + 0.5) * r * 0.6, Math.sin(a + 0.5) * r * 0.6, Math.cos(a) * r * bloom, Math.sin(a) * r * bloom); ctx.stroke();
                    leaf(ctx, Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, 10, a);
                }
            }
        } else if (skill === 'reap') {
            ctx.lineWidth = 1.5; arrow(ctx, r);
            for (const radius of [14, 23]) ring(ctx, r, 0, radius);
            line(ctx, [[r - 32, 0], [r + 32, 0]]); line(ctx, [[r, -32], [r, 32]]);
            for (let i = 1; i < 8; i++) ring(ctx, r * i / 8, 0, 1.5);
        } else if (skill === 'meteor') {
            arrow(ctx, r * (0.8 + progress * 0.2), item.width ?? 5);
            for (const y of [-7, 7]) line(ctx, [[r * 0.15, y], [r * 0.15 + 18, 0], [r * 0.15 + 26, y]]);
        } else if (skill === 'siphon') {
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(r * 0.3, 18, r * 0.7, -18, r, 0); ctx.stroke();
            for (let i = 0; i < 5; i++) leaf(ctx, r * ((i / 5 + progress * 0.25) % 1), Math.sin(i + phase) * 9, 7, -0.5 + phase);
            polygon(ctx, [[r - 4, -12], [r + 4, -12], [r + 4, -4], [r + 12, -4], [r + 12, 4], [r + 4, 4], [r + 4, 12], [r - 4, 12], [r - 4, 4], [r - 12, 4], [r - 12, -4], [r - 4, -4]]);
        } else if (skill === 'nullwave') {
            for (let i = 0; i < 4; i++) {
                const a = i * Math.PI / 2 + phase;
                ctx.beginPath(); ctx.arc(0, 0, r * bloom * (0.6 + i * 0.1), a, a + 1.1); ctx.stroke();
                leaf(ctx, Math.cos(a + 1.1) * r * bloom, Math.sin(a + 1.1) * r * bloom, 9, a + 1.1);
            }
        } else if (skill === 'nova' || skill === 'burst') {
            const count = skill === 'nova' ? 5 : item.count ?? 7;
            for (let i = 0; i < count; i++) {
                ctx.save(); ctx.rotate(-0.36 + i * 0.72 / (count - 1));
                arrow(ctx, r * (skill === 'nova' ? 0.25 : 0.4), skill === 'nova' ? 2 : 3);
                if (skill === 'burst') line(ctx, [[r * 0.1, -8], [r * 0.1 + 16, 0], [r * 0.1, 8]]);
                ctx.restore();
            }
        } else if (skill === 'guard') {
            ring(ctx, 0, 0, r * 0.65);
            halo(ctx, r * 0.65, 10, phase);
            for (let i = 0; i < 6; i++) { const a = i * TAU / 6; line(ctx, [[Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5], [Math.cos(a + 0.07) * r * 0.85, Math.sin(a + 0.07) * r * 0.85]]); }
        }
    } else if (hero === 'warden') {
        if (skill === 'chain') {
            for (let arm = 0; arm < 3; arm++) {
                ctx.beginPath();
                for (let i = 0; i <= 24; i++) {
                    const a = arm * TAU / 3 + i / 24 * TAU + phase, radius = r * (1 - i / 28) * bloom;
                    const x = Math.cos(a) * radius, y = Math.sin(a) * radius;
                    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
                }
                ctx.stroke();
            }
            halo(ctx, r * (1 - progress * 0.65), 7, -phase, true);
        } else if (skill === 'frost' || skill === 'burst') {
            const arc = item.arc ?? 0.8;
            for (let i = 0; i < 9; i++) {
                const a = -arc + i * arc / 4;
                const radius = r * bloom, inner = radius * (skill === 'frost' ? 0.6 : 0.35);
                polygon(ctx, [[Math.cos(a - 0.07) * inner, Math.sin(a - 0.07) * inner], [Math.cos(a) * radius, Math.sin(a) * radius], [Math.cos(a + 0.07) * inner, Math.sin(a + 0.07) * inner]]);
            }
            if (skill === 'frost') { ctx.strokeStyle = '#effcff'; ctx.beginPath(); ctx.arc(0, 0, r * bloom * 0.7, -arc, arc); ctx.stroke(); }
            else halo(ctx, r * 0.3, 5, 0, true);
        } else if (skill === 'reap') {
            polygon(ctx, [[-r * 0.7, -r], [r * 0.7, -r], [r * 0.8, 0], [0, r], [-r * 0.8, 0]], false);
            ctx.strokeStyle = '#fff1c8'; ctx.lineWidth = 4;
            line(ctx, [[0, -r], [-r * 0.2, -r * 0.3], [r * 0.25, 0], [-r * 0.1, r]]);
            line(ctx, [[-r * 0.8, 0], [0, -r * 0.15], [r * 0.8, r * 0.2]]);
            halo(ctx, r * (1 + progress * 0.4), 5, 0, true);
        } else if (skill === 'meteor') {
            ctx.beginPath(); ctx.ellipse(0, r * 0.25, r * 0.65, r * 0.3, 0, 0, TAU); ctx.stroke();
            polygon(ctx, [[-r * 0.45, r * 0.25], [-r * 0.3, -r * bloom], [r * 0.1, -r * 1.2 * bloom], [r * 0.45, -r * 0.7], [r * 0.5, r * 0.25]]);
            ctx.strokeStyle = '#eee4c9'; line(ctx, [[r * 0.1, -r * 1.2 * bloom], [r * 0.05, r * 0.25]]);
            for (let i = 0; i < 5; i++) { const a = i * TAU / 5; line(ctx, [[Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.5], [Math.cos(a + 0.12) * r, Math.sin(a + 0.12) * r * 0.8]]); }
        } else if (skill === 'siphon') {
            const radius = r * 0.5;
            polygon(ctx, Array.from({ length: 6 }, (_, i) => [Math.cos(i * TAU / 6) * radius, Math.sin(i * TAU / 6) * radius]), false);
            halo(ctx, r * 0.7, 6, phase, true);
            line(ctx, [[-15, 0], [15, 0]]); line(ctx, [[0, -15], [0, 15]]);
            for (let i = 0; i < 6; i++) { const a = i * TAU / 6; line(ctx, [[Math.cos(a) * radius * 0.6, Math.sin(a) * radius * 0.6], [Math.cos(a) * radius, Math.sin(a) * radius]]); }
        } else if (skill === 'nullwave') {
            const inner = item.inner ?? r * 0.4, outer = Math.max(inner + 1, r * bloom);
            for (let i = 0; i < 12; i++) {
                const a = i * TAU / 12;
                polygon(ctx, [[Math.cos(a) * inner, Math.sin(a) * inner], [Math.cos(a) * outer, Math.sin(a) * outer], [Math.cos(a + 0.3) * outer, Math.sin(a + 0.3) * outer], [Math.cos(a + 0.3) * inner, Math.sin(a + 0.3) * inner]], false);
            }
        } else if (skill === 'nova') {
            for (const size of [0.5, 1]) polygon(ctx, Array.from({ length: 8 }, (_, i) => [Math.cos(i * TAU / 8) * r * bloom * size, Math.sin(i * TAU / 8) * r * bloom * size]), false);
            halo(ctx, r * bloom, 8, 0, true);
        } else if (skill === 'guard') {
            polygon(ctx, [[-r * 0.5, -r * 0.55], [r * 0.5, -r * 0.55], [r * 0.6, r * 0.1], [0, r * 0.65], [-r * 0.6, r * 0.1]], false);
            for (const x of [-0.25, 0.25]) { line(ctx, [[r * x, -r * 0.4], [r * x, r * 0.2]]); ring(ctx, r * x, -r * 0.4, 4); }
            halo(ctx, r * 0.8, 6, 0, true);
        }
    }
    ctx.restore();
}

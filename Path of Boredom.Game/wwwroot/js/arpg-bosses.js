import { mapIndexForWave } from "./arpg-campaign.js";
import { bossPose } from './arpg-boss-combat.js';

export const BOSS_PROFILES = [
    { id: "hollow", title: "The oath that outlived its king", radius: 135, fan: [-0.6, -0.3, 0, 0.3, 0.6], rays: 8, speed: 175, recovery: 1.2, interval: 3.2, warning: "BELLFALL — LEAVE THE CIRCLE", lore: "Once the king's shield, the Hollow Warden still guards an empty throne. Every toll of the bell is an order he can no longer refuse. Break his armor, and listen for the name he has forgotten." },
    { id: "marsh", title: "Keeper of the drowned names", radius: 165, fan: [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75], rays: 10, speed: 130, recovery: 1.5, interval: 3.5, warning: "DROWNED TIDE — REACH DRY GROUND", lore: "The Mire Sovereign wears reeds where a crown should be. The drowned gave it their names so they would not vanish. Beneath its slow, widening tides, those names still call for shore." },
    { id: "citadel", title: "The smith of daylight's cage", radius: 120, fan: [-0.4, -0.2, 0, 0.2, 0.4], rays: 8, speed: 230, recovery: 1, interval: 2.7, warning: "FURNACE STRIKE — CLEAR THE FORGE", lore: "The Cinder Tyrant forged the six cages that held the dawn. He mistook obedience for devotion, until his furnace consumed the hands that fed it. His hammer still strikes for a king who will never return." },
    { id: "glacier", title: "A reflection that learned to rule", radius: 145, fan: [-0.9, -0.45, 0, 0.45, 0.9], rays: 6, speed: 165, recovery: 1.4, interval: 3.1, warning: "GLASS SHATTER — LEAVE THE FRACTURE", lore: "The Glass Regent remembers every face frozen in the Expanse. It borrowed those faces until none remained its own. Between its shards, your reflection waits with a warning it cannot speak." },
    { id: "archive", title: "Author of the final page", radius: 110, fan: [-0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8], rays: 12, speed: 155, recovery: 1.3, interval: 3.3, warning: "ERASURE — LEAVE THE SEAL", lore: "The Nameless Archivist erased its own name to keep the prisoner's secret. Now it writes futures in lightning and burns every page that promises escape. Your sister left one sentence it could not destroy." },
    { id: "rift", title: "The hunger beyond the bell", radius: 180, fan: [-0.7, -0.35, 0, 0.35, 0.7], rays: 14, speed: 145, recovery: 1.6, interval: 3.6, warning: "UNMAKING — ESCAPE THE VOID", lore: "The Unmaking is not a king or a god. It is the space left when a promise is broken. The bell kept it outside the world; carrying the six dawns, you must teach that darkness to end." }
];
const recoveryWindows = [0.75, 0.9, 0.7, 0.85, 0.8, 1];
BOSS_PROFILES.forEach((profile, index) => { profile.recovery = recoveryWindows[index]; });
export const bossProfile = wave => BOSS_PROFILES[mapIndexForWave(wave)];

export function drawBoss(ctx, actor, map, time, reduced = false) {
    const r = actor.radius;
    const pose = bossPose(actor, time, reduced);
    const animationTime = reduced ? 0 : time;
    ctx.save();
    ctx.translate(0, pose.bob + pose.anticipation * 2 - pose.strike * 3);
    ctx.rotate(pose.sway);
    ctx.scale(1 + pose.anticipation * 0.025, 1 - pose.anticipation * 0.025);
    const color = actor.flash > 0 ? "#fff1d3" : map.accent;
    const surface = (light, dark) => {
        const gradient = ctx.createLinearGradient(-35, -45, 35, 40);
        if (!gradient?.addColorStop) return light;
        gradient.addColorStop(0, light); gradient.addColorStop(0.5, color); gradient.addColorStop(1, dark);
        return gradient;
    };
    const bodySurface = surface('#e2d2b6', '#26303d');
    ctx.fillStyle = bodySurface;
    ctx.strokeStyle = "#0a1420";
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const polygon = points => {
        const first = points[0], last = points[points.length - 1];
        ctx.beginPath(); ctx.moveTo((first[0] + last[0]) / 2, (first[1] + last[1]) / 2);
        points.forEach(([x, y], i) => {
            const next = points[(i + 1) % points.length];
            ctx.quadraticCurveTo(x, y, (x + next[0]) / 2, (y + next[1]) / 2);
        });
        ctx.closePath(); ctx.fill(); ctx.stroke();
    };
    const plate = (x, y, width, height, radius = 4) => {
        ctx.beginPath(); ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y); ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius); ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius); ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    };
    if (['hollow', 'citadel'].includes(map.id)) {
        ctx.strokeStyle = '#343c45'; ctx.lineWidth = 10; ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(side * 12, 22);
            ctx.lineTo(side * 14, 40 + pose.stride * side * 5); ctx.stroke();
        }
        ctx.strokeStyle = '#0a1420'; ctx.lineWidth = 2;
    }
    if (map.id === "hollow") {
        polygon([[-30, -25], [-19, -45], [19, -45], [30, -25], [24, 26], [-24, 26]]);
        ctx.fillStyle = surface('#9aaab5', '#253344');
        plate(-15, -22, 30, 37, 7);
        ctx.strokeStyle = '#efe0b780'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, -19); ctx.quadraticCurveTo(-4, -2, 0, 14); ctx.stroke();
        ctx.strokeStyle = '#0a1420';
        polygon([[-44, -14], [-20, -20], [-20, 29], [-34, 40], [-48, 20]]);
        ctx.strokeStyle = '#c3d0d080'; ctx.beginPath(); ctx.moveTo(-34, -8); ctx.quadraticCurveTo(-39, 13, -32, 29); ctx.stroke();
        ctx.save(); ctx.translate(30, 0); ctx.rotate(-pose.anticipation * 0.45 + pose.strike * 0.8); ctx.translate(-30, 0);
        ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(38, -42); ctx.lineTo(38, 34); ctx.stroke();
        ctx.fillStyle = bodySurface; ctx.strokeStyle = '#172331'; ctx.lineWidth = 2; plate(22, -45, 34, 18, 5);
        ctx.restore();
    } else if (map.id === "marsh") {
        ctx.fillStyle = surface('#b2c1a1', '#273e3c');
        ctx.beginPath(); ctx.ellipse(0, 8, 45, 26, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#d2d7ad66'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(-3, 5, 30, 16, -0.12, Math.PI, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = color; ctx.lineWidth = 5;
        for (let i = 0; i < 7; i++) { const x = (i - 3) * 11; ctx.beginPath(); ctx.moveTo(x, 12); ctx.quadraticCurveTo(x + Math.sin(animationTime + i) * 10, -25, x * 1.2 + pose.strike * (i - 3) * 3, -45 - i % 2 * 12 - pose.anticipation * 6); ctx.stroke(); }
    } else if (map.id === "citadel") {
        polygon([[-35, -30], [35, -30], [28, 35], [-28, 35]]);
        ctx.fillStyle = '#382730'; plate(-17, -20, 34, 39, 7);
        ctx.fillStyle = "#ffdc88";
        ctx.strokeStyle = '#d98747'; ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) plate(-12, -14 + i * 11, 24, 5, 2);
        ctx.fillStyle = bodySurface; ctx.strokeStyle = '#0a1420'; polygon([[-23, -31], [-18, -54], [-5, -37], [7, -53], [23, -31]]);
        ctx.save(); ctx.translate(30, 8); ctx.rotate(-pose.anticipation * 0.6 + pose.strike * 1.1); ctx.translate(-30, -8);
        ctx.fillStyle = '#735945'; plate(39, -25, 8, 61, 3);
        ctx.fillStyle = bodySurface; plate(24, -34, 38, 24, 6); ctx.restore();
    } else if (map.id === "glacier") {
        for (let i = 0; i < 6; i++) {
            ctx.save(); ctx.rotate(i * Math.PI / 3 + Math.sin(animationTime * 0.5) * 0.08);
            ctx.translate(0, -pose.anticipation * 5 - pose.strike * 8);
            polygon([[0, -56], [15, -22], [0, -12], [-15, -22]]); ctx.restore();
        }
        ctx.fillStyle = surface('#def7fa', '#486486');
        polygon([[0, -30], [20, 0], [0, 35], [-20, 0]]);
        ctx.strokeStyle = '#efffff99'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, -21); ctx.lineTo(-9, 1); ctx.lineTo(0, 25); ctx.stroke();
    } else if (map.id === "archive") {
        ctx.save(); ctx.rotate(Math.sin(animationTime * 0.6) * 0.12 + pose.anticipation * 0.08);
        ctx.fillStyle = surface('#e0d1bb', '#695579');
        polygon([[-39, -21], [-5, -28], [0, -20], [5, -28], [39, -21], [39, 23], [0, 30], [-39, 23]]);
        ctx.strokeStyle = '#f2e6c288'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, -17); ctx.quadraticCurveTo(-3, 4, 0, 23); ctx.stroke();
        ctx.strokeStyle = "#3b304e"; ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-30, -12 + i * 9); ctx.lineTo(-8, -16 + i * 9); ctx.moveTo(8, -16 + i * 9); ctx.lineTo(30, -12 + i * 9); ctx.stroke(); }
        ctx.restore(); ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(0, 0, 49, 0, Math.PI * 2); ctx.stroke();
    } else {
        for (let i = 0; i < 8; i++) { ctx.save(); ctx.rotate(i * Math.PI / 4 + animationTime * 0.12); ctx.translate(0, -pose.anticipation * 5 - pose.strike * 8); polygon([[0, -58], [10, -26], [0, -15], [-7, -31]]); ctx.restore(); }
        ctx.fillStyle = surface('#39314e', '#090d18'); ctx.beginPath(); ctx.ellipse(0, 0, 27, 34, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = color; ctx.stroke();
    }
    ctx.fillStyle = "#fff3cf";
    if (['hollow', 'marsh', 'citadel'].includes(map.id)) {
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * 7, map.id === 'marsh' ? 3 : -30, 3, 2, 0, 0, Math.PI * 2); ctx.fill(); }
    } else {
        ctx.beginPath(); ctx.ellipse(0, -8, r * 0.16, 3, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}

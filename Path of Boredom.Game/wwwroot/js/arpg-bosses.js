import { mapIndexForWave } from "./arpg-campaign.js";

export const BOSS_PROFILES = [
    { id: "hollow", title: "The oath that outlived its king", radius: 135, fan: [-0.6, -0.3, 0, 0.3, 0.6], rays: 8, speed: 175, recovery: 1.2, interval: 3.2, warning: "BELLFALL — LEAVE THE CIRCLE", lore: "Once the king's shield, the Hollow Warden still guards an empty throne. Every toll of the bell is an order he can no longer refuse. Break his armor, and listen for the name he has forgotten." },
    { id: "marsh", title: "Keeper of the drowned names", radius: 165, fan: [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75], rays: 10, speed: 130, recovery: 1.5, interval: 3.5, warning: "DROWNED TIDE — REACH DRY GROUND", lore: "The Mire Sovereign wears reeds where a crown should be. The drowned gave it their names so they would not vanish. Beneath its slow, widening tides, those names still call for shore." },
    { id: "citadel", title: "The smith of daylight's cage", radius: 120, fan: [-0.4, -0.2, 0, 0.2, 0.4], rays: 8, speed: 230, recovery: 1, interval: 2.7, warning: "FURNACE STRIKE — CLEAR THE FORGE", lore: "The Cinder Tyrant forged the six cages that held the dawn. He mistook obedience for devotion, until his furnace consumed the hands that fed it. His hammer still strikes for a king who will never return." },
    { id: "glacier", title: "A reflection that learned to rule", radius: 145, fan: [-0.9, -0.45, 0, 0.45, 0.9], rays: 6, speed: 165, recovery: 1.4, interval: 3.1, warning: "GLASS SHATTER — LEAVE THE FRACTURE", lore: "The Glass Regent remembers every face frozen in the Expanse. It borrowed those faces until none remained its own. Between its shards, your reflection waits with a warning it cannot speak." },
    { id: "archive", title: "Author of the final page", radius: 110, fan: [-0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8], rays: 12, speed: 155, recovery: 1.3, interval: 3.3, warning: "ERASURE — LEAVE THE SEAL", lore: "The Nameless Archivist erased its own name to keep the prisoner's secret. Now it writes futures in lightning and burns every page that promises escape. Your sister left one sentence it could not destroy." },
    { id: "rift", title: "The hunger beyond the bell", radius: 180, fan: [-0.7, -0.35, 0, 0.35, 0.7], rays: 14, speed: 145, recovery: 1.6, interval: 3.6, warning: "UNMAKING — ESCAPE THE VOID", lore: "The Unmaking is not a king or a god. It is the space left when a promise is broken. The bell kept it outside the world; carrying the six dawns, you must teach that darkness to end." }
];
export const bossProfile = wave => BOSS_PROFILES[mapIndexForWave(wave)];

export function drawBoss(ctx, actor, map, time) {
    const r = actor.radius;
    const color = actor.flash > 0 ? "#fff1d3" : map.accent;
    ctx.fillStyle = color;
    ctx.strokeStyle = "#0a1420";
    ctx.lineWidth = 3;
    const polygon = points => {
        ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); ctx.stroke();
    };
    if (map.id === "hollow") {
        polygon([[-30, -25], [-19, -45], [19, -45], [30, -25], [24, 26], [-24, 26]]);
        ctx.fillStyle = "#455662"; polygon([[-44, -14], [-20, -20], [-20, 29], [-34, 40], [-48, 20]]);
        ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(38, -42); ctx.lineTo(38, 34); ctx.stroke();
        ctx.fillStyle = color; ctx.fillRect(22, -45, 34, 18);
    } else if (map.id === "marsh") {
        ctx.beginPath(); ctx.ellipse(0, 8, 45, 26, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = color; ctx.lineWidth = 5;
        for (let i = 0; i < 7; i++) { const x = (i - 3) * 11; ctx.beginPath(); ctx.moveTo(x, 12); ctx.quadraticCurveTo(x + Math.sin(time + i) * 10, -25, x * 1.2, -45 - i % 2 * 12); ctx.stroke(); }
    } else if (map.id === "citadel") {
        polygon([[-35, -30], [35, -30], [28, 35], [-28, 35]]);
        ctx.fillStyle = "#382730"; ctx.fillRect(-17, -20, 34, 39);
        ctx.fillStyle = "#ffdc88";
        for (let i = 0; i < 3; i++) ctx.fillRect(-12, -14 + i * 11, 24, 5);
        ctx.fillStyle = color; polygon([[-23, -31], [-18, -54], [-5, -37], [7, -53], [23, -31]]);
        ctx.fillRect(39, -25, 8, 61); ctx.fillRect(24, -34, 38, 24);
    } else if (map.id === "glacier") {
        for (let i = 0; i < 6; i++) {
            ctx.save(); ctx.rotate(i * Math.PI / 3 + Math.sin(time * 0.5) * 0.08);
            polygon([[0, -56], [15, -22], [0, -12], [-15, -22]]); ctx.restore();
        }
        polygon([[0, -30], [20, 0], [0, 35], [-20, 0]]);
    } else if (map.id === "archive") {
        ctx.save(); ctx.rotate(Math.sin(time * 0.6) * 0.12);
        polygon([[-39, -21], [-5, -28], [0, -20], [5, -28], [39, -21], [39, 23], [0, 30], [-39, 23]]);
        ctx.strokeStyle = "#3b304e"; ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-30, -12 + i * 9); ctx.lineTo(-8, -16 + i * 9); ctx.moveTo(8, -16 + i * 9); ctx.lineTo(30, -12 + i * 9); ctx.stroke(); }
        ctx.restore(); ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(0, 0, 49, 0, Math.PI * 2); ctx.stroke();
    } else {
        for (let i = 0; i < 8; i++) { ctx.save(); ctx.rotate(i * Math.PI / 4 + time * 0.12); polygon([[0, -58], [10, -26], [0, -15], [-7, -31]]); ctx.restore(); }
        ctx.fillStyle = "#090d18"; ctx.beginPath(); ctx.ellipse(0, 0, 27, 34, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = color; ctx.stroke();
    }
    ctx.fillStyle = "#fff3cf";
    ctx.beginPath(); ctx.ellipse(0, -8, r * 0.16, 3, 0, 0, Math.PI * 2); ctx.fill();
}

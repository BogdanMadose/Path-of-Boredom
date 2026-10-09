import { mapForWave } from "./arpg-campaign.js";

// Transient stage layouts are shared by simulation and rendering, without changing save data.
const layouts = new WeakMap();

export function arenaHazards(state) {
    const cached = layouts.get(state);
    if (cached?.wave === state.wave) return cached.hazards;
    const map = mapForWave(state.wave);
    let seed = ((state.random() * 0xffffffff) ^ state.wave) >>> 0;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 0x100000000;
    };
    const hazards = [];
    const count = map.hazard === "none" ? 0 : Math.max(2, map.hazards.length + Math.floor(random() * 3) - 1);
    for (let attempt = 0; hazards.length < count && attempt < 100; attempt++) {
        const radius = 48 + random() * 52;
        const x = 42 + radius + random() * (1100 - 84 - radius * 2);
        const y = 42 + radius + random() * (650 - 84 - radius * 2);
        if (Math.hypot(x - 550, y - 325) < radius + 80) continue;
        if (hazards.some(other => Math.hypot(x - other.x, y - other.y) < radius + other.radius + 20)) continue;
        hazards.push({ x, y, radius, start: state.time, delay: random() * 2.5, period: 5.5 + random() * 3 });
    }
    layouts.set(state, { wave: state.wave, hazards });
    return hazards;
}

export function hazardPhase(hazard, time) {
    const elapsed = (time - hazard.start + 3600) % 3600 - hazard.delay;
    return elapsed < 0 ? -1 : elapsed % hazard.period / hazard.period * 6;
}

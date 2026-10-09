import { SKILL_KEYS } from "./arpg-skills.js";

export const EQUIPMENT_STYLES = {
    weapon: {
        balanced: { name: "Balanced", detail: "Normal damage and recovery", damage: 1, recovery: 1 },
        heavy: { name: "Heavy edge", detail: "+20% damage; -15% cooldown recovery", damage: 1.2, recovery: 0.85 },
        swift: { name: "Quick edge", detail: "-15% damage; +20% cooldown recovery", damage: 0.85, recovery: 1.2 }
    },
    armor: {
        balanced: { name: "Balanced", detail: "Normal armor and movement", armor: 0, speed: 1 },
        plated: { name: "Heavy plates", detail: "+8 armor; -12% movement speed", armor: 8, speed: 0.88 },
        light: { name: "Light weave", detail: "-8 armor; +12% movement speed", armor: -8, speed: 1.12 }
    }
};
export const CHALLENGES = {
    none: "No challenge",
    unscarred: "Take no health damage this stage",
    flaskless: "Clear this stage without drinking a flask",
    swift: "Clear this stage within 180 combat seconds"
};
export function newRunSystems() {
    return {
        equipment: { weapon: "balanced", armor: "balanced" },
        challenge: { key: "none", stage: 0, elapsed: 0, damage: 0, flasks: 0, resolved: 0 },
        summary: { seconds: 0, flasks: 0, spent: 0, stages: 0, challenges: 0, damage: Object.fromEntries(SKILL_KEYS.map(key => [key, 0])) }
    };
}
export const equipmentStyle = (state, slot) => EQUIPMENT_STYLES[slot][state.runSystems.equipment[slot]];
export function setEquipmentStyle(state, slot, key) {
    if (!EQUIPMENT_STYLES[slot]?.[key] || !["paused", "camp", "won"].includes(state.status)) return false;
    state.runSystems.equipment[slot] = key;
    state.journal = `${EQUIPMENT_STYLES[slot][key].name}: ${EQUIPMENT_STYLES[slot][key].detail}. Equipment rating and Forge ranks are retained.`;
    return true;
}
export function acceptChallenge(state, key) {
    if (state.training || !Object.hasOwn(CHALLENGES, key) || !["paused", "camp"].includes(state.status)) return false;
    if (state.wave % 5 !== 0 || state.enemies.length) return false;
    const stage = Math.floor(state.wave / 5) + 1;
    const previous = state.runSystems.challenge;
    if (previous.stage === stage && previous.elapsed > 0) return false;
    state.runSystems.challenge = { key, stage, elapsed: 0, damage: 0, flasks: 0, resolved: 0 };
    return true;
}
export function resolveChallenge(state) {
    const challenge = state.runSystems.challenge;
    if (challenge.resolved || challenge.key === "none" || challenge.stage !== Math.ceil(state.wave / 5)) return 0;
    challenge.resolved = 1;
    const success = challenge.key === "unscarred" ? challenge.damage === 0
        : challenge.key === "flaskless" ? challenge.flasks === 0 : challenge.elapsed <= 180;
    if (!success) return 0;
    const reward = 100 + challenge.stage * 50;
    state.gold += reward;
    state.runSystems.summary.challenges++;
    return reward;
}
export function runSummary(state, skillLabel = key => key) {
    const summary = state.runSystems.summary;
    const damage = Object.entries(summary.damage).filter(([, value]) => value > 0)
        .sort((a, b) => b[1] - a[1]).map(([key, value]) => `${skillLabel(key)}: ${Math.round(value)}`).join(" · ");
    return `${state.training ? "Training session" : "Run so far"}: ${Math.floor(summary.seconds / 60)}m ${Math.floor(summary.seconds % 60)}s · ${summary.stages} stages cleared · ${state.kills} kills · ${summary.flasks} flasks used · ${summary.spent} gold spent · ${summary.challenges} challenges completed. Damage dealt: ${damage || "none yet"}.`;
}

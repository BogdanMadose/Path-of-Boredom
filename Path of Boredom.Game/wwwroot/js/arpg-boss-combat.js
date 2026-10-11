const phaseProtection = new WeakMap();
const PHASE_PROTECTION = 2;

export function observeBossRecovery(enemy, time) {
    if (!phaseProtection.has(enemy)) {
        phaseProtection.set(enemy, time + (enemy.combat.rest || 0) + PHASE_PROTECTION);
    }
}

export function beginBossRecovery(enemy, time, duration, phaseChange = false) {
    if (phaseChange && (enemy.combat.rest > 0 || time < (phaseProtection.get(enemy) ?? 0))) return false;
    enemy.combat.rest = duration;
    phaseProtection.set(enemy, time + duration + PHASE_PROTECTION);
    return true;
}

export function bossPose(actor, time, reduced = false) {
    if (reduced) return { bob: 0, sway: 0, anticipation: 0, strike: 0, stride: 0 };
    const windup = Math.max(actor.winding ?? 0, actor.attackWindup ?? 0);
    const anticipation = windup > 0 ? Math.sin(Math.min(1, Math.max(0, 1 - windup / 1.1)) * Math.PI / 2) : 0;
    const strike = Math.sin(Math.PI * Math.min(1, (actor.swing ?? 0) / 0.3));
    const stride = actor.moving ? Math.sin(actor.stridePhase ?? 0) : 0;
    return { bob: Math.sin(time * 2.1) * 1.5 - Math.abs(stride) * 1.5,
        sway: Math.sin(time * 1.7) * 0.025 + stride * 0.025, anticipation, strike, stride };
}

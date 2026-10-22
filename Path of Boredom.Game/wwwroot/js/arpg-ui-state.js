const forgeSeen = new WeakMap();

export function combatControlStatus(state, skill, blocked = false) {
    const p = state.player;
    const charges = skill === 'potion' ? `${p.potions}/5 · ` : '';
    if (skill === 'potion' && p.potions === 0) return { mode: 'empty', text: '0/5 · Empty' };
    if (blocked || state.status !== 'playing' || state.resumeDelay > 0) return { mode: 'paused', text: `${charges}Paused` };
    if (p[skill] > 0) return { mode: 'cooling', text: `${charges}${p[skill].toFixed(1)}s` };
    if (skill === 'potion' && p.health >= p.maxHealth) return { mode: 'full', text: `${charges}Full HP` };
    return { mode: 'ready', text: `${charges}Ready` };
}

export const bossWarningPosition = (enemy, bossTop, width = 1100, height = 650) => ({
    x: Math.max(200, Math.min(width - 200, enemy.x)),
    y: Math.max(bossTop + 44, Math.min(height - 100, enemy.y - enemy.radius - 35))
});

export const automaticCheckpoint = (state, failed = false) => state.mode === "endless" && state.status === "camp" && !failed;

export function forgeNotification(state, offers, acknowledge = false, cheapest = Infinity) {
    let seen = forgeSeen.get(state);
    if (!seen) { seen = new Map(); forgeSeen.set(state, seen); }
    if (acknowledge) {
        for (const offer of offers) seen.set(offer.key, offer.rank);
        seen.set("gold", state.gold);
    }
    // Re-notify when something new became affordable, or once enough new gold arrived to buy another rank.
    const goldAtSeen = seen.get("gold");
    const earnedAgain = offers.length > 0 && goldAtSeen !== undefined && Number.isFinite(cheapest) && state.gold - goldAtSeen >= cheapest;
    return earnedAgain || offers.some(offer => seen.get(offer.key) !== offer.rank);
}

export function bossHudTop(canvas, menu, mobile = false, height = 650) {
    if (!mobile) return 49;
    return 76;
}

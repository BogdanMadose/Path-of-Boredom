const forgeSeen = new WeakMap();

export const automaticCheckpoint = (state, failed = false) => state.mode === "endless" && state.status === "camp" && !failed;

export function forgeNotification(state, offers, acknowledge = false) {
    let seen = forgeSeen.get(state);
    if (!seen) { seen = new Map(); forgeSeen.set(state, seen); }
    if (acknowledge) for (const offer of offers) seen.set(offer.key, offer.rank);
    return offers.some(offer => seen.get(offer.key) !== offer.rank);
}

export function bossHudTop(canvas, menu, mobile = false, height = 650) {
    if (!mobile) return 49;
    const menuBottom = menu?.height > 0 ? menu.bottom : canvas.top;
    return Math.max(96, (menuBottom - canvas.top + 22) * height / Math.max(1, canvas.height));
}

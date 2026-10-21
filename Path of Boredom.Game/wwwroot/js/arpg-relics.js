// arpg-relics.js — rare "relic" drops that change how a run plays. A relic found during a run stays
// active for that run (saved with it) and is recorded forever in the Relic Codex (meta profile).
//
// Drop odds per kill: regular foes 0.02%, elites 0.3%, bosses 2.5%. Duplicates of a relic already
// active this run are rerolled to another missing one when possible.

export const RELICS = {
    cinder: { name: "Cinder Heart", detail: "Your nova leaves burning ground for 3s.", color: "#ff8b32" },
    quiver: { name: "Phantom Quiver", detail: "Dodging fires 3 spectral arrows.", color: "#9fe3ff" },
    leech: { name: "Leech Fang", detail: "Every kill heals 0.5% of your max health.", color: "#e05a6a" },
    thorn: { name: "Bramble Crown", detail: "Taking a hit lashes nearby foes for a quarter of your weapon damage.", color: "#7fcf6a" },
    midas: { name: "Gilded Tooth", detail: "+15% gold from every pickup.", color: "#f4d27a" },
    echo: { name: "Echo Vial", detail: "Drinking a flask releases a damaging shockwave.", color: "#c6a4ff" }
};
export const RELIC_KEYS = Object.keys(RELICS);

export const RELIC_ODDS = { normal: 0.0002, elite: 0.003, boss: 0.025 };

export const hasRelic = (state, key) => Array.isArray(state.runRelics) && state.runRelics.includes(key);

// Rolls a relic drop for a kill. Returns the relic key granted (and marks it active), or null.
export function rollRelic(state, enemy) {
    if (state.training) return null;
    const odds = enemy.kind === "boss" ? RELIC_ODDS.boss : enemy.elite ? RELIC_ODDS.elite : RELIC_ODDS.normal;
    if (state.random() >= odds) return null;
    state.runRelics ??= [];
    const missing = RELIC_KEYS.filter(key => !state.runRelics.includes(key));
    if (!missing.length) return null;
    const key = missing[Math.floor(state.random() * missing.length)];
    state.runRelics.push(key);
    state.relicFound = key;
    return key;
}

export const validRunRelics = value => Array.isArray(value)
    ? [...new Set(value.filter(key => RELIC_KEYS.includes(key)))]
    : [];

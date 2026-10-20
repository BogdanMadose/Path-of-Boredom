// arpg-meta.js — permanent progression that survives every run: Embers (meta currency) spent at
// the Ember Camp, per-class mastery levels (1–30), and class unlocks.
//
// The profile lives in localStorage, separate from the run save, so run saves and their server-side
// validation are unchanged. Rewards are credited from *deltas* observed during play (kills, stages
// cleared) so loading an old save never pays out the same progress twice.

const STORAGE_KEY = "pob.meta.v1";

import { RELIC_KEYS } from "./arpg-relics.js";

export const CAMP_NODES = {
    might: { name: "Ember might", detail: "+2% base damage per rank.", max: 10, cost: rank => 40 + rank * 30 },
    flask: { name: "Spare flask", detail: "Start every run with +1 flask charge per rank.", max: 2, cost: rank => 150 + rank * 150 },
    purse: { name: "Pilgrim's purse", detail: "Start every run with +40 gold per rank.", max: 5, cost: rank => 60 + rank * 50 },
    reroll: { name: "Second sight", detail: "+1 level-up card reroll per run, per rank.", max: 3, cost: rank => 120 + rank * 120 }
};

export const MASTERY_MAX = 30;
// XP needed to go from `level` to `level + 1`; grows gently so early levels come quickly.
export const masteryStep = level => 120 + level * 40;

// Unlock rewards by mastery level. `starter` widens the starting-skill choice; `fork` upgrades the
// class's relay skill; `trim` is a cosmetic hero trim colour.
export const MASTERY_REWARDS = [
    { level: 3, kind: "trim", value: "#f4d27a", label: "Gilded trim (cosmetic)" },
    { level: 6, kind: "starter", value: "frost", label: "New starting skill" },
    { level: 10, kind: "trim", value: "#9fe3ff", label: "Frostfire trim (cosmetic)" },
    { level: 14, kind: "starter", value: "meteor", label: "New starting skill" },
    { level: 18, kind: "fork", value: 1, label: "Relay skill forks: +1 extra jump" },
    { level: 22, kind: "trim", value: "#ff8fb1", label: "Bloodmoon trim (cosmetic)" },
    { level: 26, kind: "starter", value: "siphon", label: "New starting skill" },
    { level: 30, kind: "fork", value: 2, label: "Relay skill forks twice: +2 extra jumps" }
];

// Class unlock chain: Knight and Ranger are free; beating the campaign with either unlocks the
// Warden; beating the campaign with the Warden unlocks the Sorcerer.
export const CLASS_ORDER = ["knight", "ranger", "warden", "sorcerer"];
export const CLASS_UNLOCK_HINT = {
    warden: "Beat the campaign with the Ember Knight or Dawn Ranger to unlock.",
    sorcerer: "Beat the campaign with the Iron Warden to unlock."
};

const fresh = () => ({
    rev: 0,
    embers: 0, lifetimeEmbers: 0,
    camp: { might: 0, flask: 0, purse: 0, reroll: 0 },
    mastery: { knight: { level: 1, xp: 0 }, ranger: { level: 1, xp: 0 }, warden: { level: 1, xp: 0 }, sorcerer: { level: 1, xp: 0 } },
    unlocked: { knight: 1, ranger: 1, warden: 0, sorcerer: 0 },
    victories: { knight: 0, ranger: 0, warden: 0, sorcerer: 0 },
    trim: { knight: "", ranger: "", warden: "", sorcerer: "" },
    codex: {}
});

let profile = null;
const listeners = new Set();

function int(value, min, max, fallback) {
    return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function sanitize(saved) {
    const clean = fresh();
    if (!saved || typeof saved !== "object") return clean;
    clean.rev = int(saved.rev, 0, 1e12, 0);
    clean.embers = int(saved.embers, 0, 1e9, 0);
    clean.lifetimeEmbers = int(saved.lifetimeEmbers, 0, 1e9, clean.embers);
    for (const key of Object.keys(CAMP_NODES)) clean.camp[key] = int(saved.camp?.[key], 0, CAMP_NODES[key].max, 0);
    for (const hero of CLASS_ORDER) {
        clean.mastery[hero] = { level: int(saved.mastery?.[hero]?.level, 1, MASTERY_MAX, 1), xp: int(saved.mastery?.[hero]?.xp, 0, 1e9, 0) };
        clean.unlocked[hero] = hero === "knight" || hero === "ranger" ? 1 : int(saved.unlocked?.[hero], 0, 1, 0);
        clean.victories[hero] = int(saved.victories?.[hero], 0, 1e9, 0);
        clean.trim[hero] = typeof saved.trim?.[hero] === "string" && /^#[0-9a-f]{6}$|^$/i.test(saved.trim[hero]) ? saved.trim[hero] : "";
    }
    if (saved.codex && typeof saved.codex === "object")
        for (const key of RELIC_KEYS) if (int(saved.codex[key], 0, 1e9, 0) > 0) clean.codex[key] = int(saved.codex[key], 0, 1e9, 0);
    return clean;
}

export function loadProfile() {
    if (profile) return profile;
    try { profile = sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")); }
    catch { profile = fresh(); /* A broken profile starts fresh; runs are unaffected. */ }
    return profile;
}

// Copy of the profile to embed in run saves so it follows the account across devices.
export const exportProfile = () => JSON.parse(JSON.stringify(loadProfile()));

// Merges a profile from a cloud/device save. The copy with more lifetime Embers (then the newer
// revision) wins as the base, so spent Embers are never refunded; unlocks, victories and mastery
// are unioned so progress from either device is never lost.
export function mergeProfile(incoming) {
    if (!incoming || typeof incoming !== "object") return false;
    const other = sanitize(incoming), mine = loadProfile();
    const base = other.lifetimeEmbers > mine.lifetimeEmbers || (other.lifetimeEmbers === mine.lifetimeEmbers && other.rev > mine.rev) ? other : mine;
    const extra = base === other ? mine : other;
    const before = JSON.stringify(mine);
    for (const key of Object.keys(CAMP_NODES)) base.camp[key] = Math.max(base.camp[key], extra.camp[key]);
    for (const hero of CLASS_ORDER) {
        const a = base.mastery[hero], b = extra.mastery[hero];
        if (b.level > a.level || (b.level === a.level && b.xp > a.xp)) base.mastery[hero] = { ...b };
        base.unlocked[hero] = Math.max(base.unlocked[hero], extra.unlocked[hero]);
        base.victories[hero] = Math.max(base.victories[hero], extra.victories[hero]);
        if (!base.trim[hero]) base.trim[hero] = extra.trim[hero];
    }
    for (const key of RELIC_KEYS) if ((extra.codex[key] ?? 0) > (base.codex[key] ?? 0)) base.codex[key] = extra.codex[key];
    base.rev = Math.max(base.rev, extra.rev);
    profile = base;
    if (JSON.stringify(profile) === before) return false;
    persist();
    return true;
}

function persist() {
    profile.rev++;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch { /* storage unavailable */ }
    for (const listener of listeners) listener(profile);
}

export const onProfileChange = listener => { listeners.add(listener); return () => listeners.delete(listener); };

// Veterans who already beat the campaign before classes were gated keep the Warden.
export function grandfatherClasses(campaignBeaten) {
    const p = loadProfile();
    if (campaignBeaten && !p.unlocked.warden) { p.unlocked.warden = 1; persist(); }
}

export const classUnlocked = hero => !!loadProfile().unlocked[hero];

export function campCost(key) {
    const node = CAMP_NODES[key], rank = loadProfile().camp[key];
    return rank >= node.max ? null : node.cost(rank);
}

export function buyCampNode(key) {
    const p = loadProfile(), cost = campCost(key);
    if (cost === null || p.embers < cost) return false;
    p.embers -= cost;
    p.camp[key]++;
    persist();
    return true;
}

export function masteryRewards(hero, level = loadProfile().mastery[hero].level) {
    return MASTERY_REWARDS.filter(reward => reward.level <= level);
}

export const extraStarters = hero => masteryRewards(hero).filter(r => r.kind === "starter").map(r => r.value);
export const relayForks = hero => masteryRewards(hero).filter(r => r.kind === "fork").reduce((best, r) => Math.max(best, r.value), 0);
export const unlockedTrims = hero => masteryRewards(hero).filter(r => r.kind === "trim");

export function setTrim(hero, color) {
    const p = loadProfile();
    if (color && !unlockedTrims(hero).some(t => t.value === color)) return false;
    p.trim[hero] = color || "";
    persist();
    return true;
}

// Applies permanent camp bonuses to a freshly started run (not continued or loaded runs).
export function applyCampBonuses(state, maxFlasks) {
    const camp = loadProfile().camp;
    state.player.damage = Math.round(state.player.damage * (1 + camp.might * 0.02) * 10) / 10;
    state.player.potions = Math.min(maxFlasks, state.player.potions + camp.flask);
    state.gold += camp.purse * 40;
}

export const rerollsPerRun = () => loadProfile().camp.reroll;

// Records relics active in a run into the permanent codex. Returns keys discovered for the first time.
const codexSeen = new WeakMap();
export function recordRelics(state) {
    const relics = state?.runRelics;
    if (!Array.isArray(relics) || state.training) return [];
    const seen = codexSeen.get(state) ?? new Set();
    codexSeen.set(state, seen);
    const fresh = [];
    for (const key of relics) {
        if (seen.has(key) || !RELIC_KEYS.includes(key)) continue;
        seen.add(key);
        const p = loadProfile();
        if (!p.codex[key]) fresh.push(key);
        p.codex[key] = (p.codex[key] ?? 0) + 1;
    }
    if (seen.size) persist();
    return fresh;
}

// Session bookkeeping: the last kills/stages credited for each live state object. A state seen for
// the first time (new or freshly loaded) starts from its current totals, so nothing is double-paid.
const credited = new WeakMap();

// Call every HUD update. Credits new kills/stages as Embers + class mastery XP, records campaign
// victories and unlocks classes. Returns a summary of anything newly earned, or null.
export function creditProgress(state) {
    if (!state || state.training || !["playing", "paused", "camp", "won", "dead", "choosing"].includes(state.status)) return null;
    const stages = state.runSystems?.summary?.stages ?? 0;
    const seen = credited.get(state);
    if (!seen) { credited.set(state, { kills: state.kills, stages, won: state.status === "won" }); return null; }
    const newKills = Math.max(0, state.kills - seen.kills), newStages = Math.max(0, stages - seen.stages);
    const justWon = state.status === "won" && !seen.won && state.mode === "campaign";
    if (!newKills && !newStages && !justWon) return null;
    seen.kills = state.kills; seen.stages = stages; seen.won = seen.won || justWon;
    const p = loadProfile();
    const hero = CLASS_ORDER.includes(state.heroClass) ? state.heroClass : "knight";
    // Embers: 1 per 8 kills (fractional kills carried), 12 per stage, 60 for a campaign victory.
    seen.killRemainder = (seen.killRemainder ?? 0) + newKills;
    const killEmbers = Math.floor(seen.killRemainder / 8);
    seen.killRemainder -= killEmbers * 8;
    const embers = killEmbers + newStages * 12 + (justWon ? 60 : 0);
    p.embers += embers;
    p.lifetimeEmbers += embers;
    const result = { embers, levels: [], unlocked: [] };
    const mastery = p.mastery[hero];
    mastery.xp += newKills * 2 + newStages * 60 + (justWon ? 400 : 0);
    while (mastery.level < MASTERY_MAX && mastery.xp >= masteryStep(mastery.level)) {
        mastery.xp -= masteryStep(mastery.level);
        mastery.level++;
        result.levels.push(mastery.level);
    }
    if (mastery.level >= MASTERY_MAX) mastery.xp = 0;
    if (justWon) {
        p.victories[hero]++;
        if ((hero === "knight" || hero === "ranger") && !p.unlocked.warden) { p.unlocked.warden = 1; result.unlocked.push("warden"); }
        if (hero === "warden" && !p.unlocked.sorcerer) { p.unlocked.sorcerer = 1; result.unlocked.push("sorcerer"); }
    }
    persist();
    return result;
}

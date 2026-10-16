// arpg-cards.js — the level-up "boon" draft system.
//
// On every level-up, drawLevelCards() offers 3 random cards from LEVEL_CARDS (filtering out
// anything already maxed or not yet unlocked); the player picks one, which increments its rank in
// state.boons — see the "Choose your next oath" overlay in Home.razor for the UI this feeds.
// Boons are separate from skill tree points and forge upgrades: they're the passive, permanent-for-the-run
// bonuses earned purely by leveling up. This mirrors the "boons"/"cardChoices"/"pendingChoices"
// fields that GameSaveEndpoints.cs's ValidCardProgress validates on the server.
import { skillUnlocked, skillSelected, NEW_SKILLS } from "./arpg-skills.js";

// Every possible boon card. `max` is the rank cap (Number.MAX_SAFE_INTEGER effectively means
// uncapped/always offerable — matches the "edge"/"vitality"/"fortune" special-cased caps in
// GameSaveEndpoints.cs's ValidCardProgress). `category` is just the display grouping shown on the card.
export const LEVEL_CARDS = {
    edge: { name: "Sunforged oath", category: "OFFENSE", max: Number.MAX_SAFE_INTEGER, description: "+4% damage per rank." },
    vitality: { name: "Heart of the dawn", category: "SURVIVAL", max: Number.MAX_SAFE_INTEGER, description: "+16 max health and heal 16." },
    bulwark: { name: "Unbroken vow", category: "DEFENSE", max: 10, description: "+1.5 armor per rank (cap 60%)." },
    stride: { name: "Wayfarer's instinct", category: "MOBILITY", max: 10, description: "+4% move speed per rank." },
    focus: { name: "Quiet flame", category: "ALL SKILLS", max: 10, description: "+5% cooldown recovery per rank." },
    nova: { name: "Widening sunrise", category: "NOVA", max: 10, description: "+10 nova radius per rank." },
    cleave: { name: "Horizon cutter", category: "CLEAVE", max: 10, description: "+6 cleave reach per rank." },
    harvest: { name: "Call of the fallen", category: "UTILITY", max: 10, description: "+16 loot pickup range per rank." },
    siphon: { name: "Ashdrinker", category: "SUSTAIN", max: 10, description: "Elite and boss kills heal 0.8 per rank." },
    fortune: { name: "The ferryman's due", category: "WEALTH", max: Number.MAX_SAFE_INTEGER, description: "+8% gold per rank." },
    critChance: { name: "The surest spark", category: "CRITICAL CHANCE", max: 10, description: "+2% crit chance per rank (cap 75%)." },
    critDamage: { name: "A shattering dawn", category: "CRITICAL DAMAGE", max: 10, description: "+10% crit damage per rank." },
    burst: { name: "Dawn unleashed", category: "BURST SKILL", max: 10, description: "+6% burst skill damage per rank." },
    guard: { name: "A shelter in embers", category: "WARD SKILL", max: 10, description: "+0.15 s ward duration per rank." },
    ...Object.fromEntries(Object.keys(NEW_SKILLS).map(skill => [`${skill}Oath`, {
        name: `${skill[0].toUpperCase()}${skill.slice(1)} oath`, category: "CHOSEN SKILL", skill, max: 10,
        description: "+6% damage per rank for this skill."
    }]))
};

const CARD_SKILLS = { nova: "nova", burst: "burst", guard: "guard", ...Object.fromEntries(Object.keys(NEW_SKILLS).map(skill => [`${skill}Oath`, skill])) };
export const levelCardAvailable = (state, key) => Object.hasOwn(LEVEL_CARDS, key)
    && skillUnlocked(state, CARD_SKILLS[key] ?? key)
    && (!CARD_SKILLS[key] || skillSelected(state, CARD_SKILLS[key]))
    && state.boons[key] < LEVEL_CARDS[key].max;

export function normalizeCardChoices(state) {
    const kept = new Set(state.cardChoices.filter(key => levelCardAvailable(state, key)));
    const replacements = Object.keys(LEVEL_CARDS).filter(key => levelCardAvailable(state, key) && !kept.has(key));
    state.cardChoices = state.cardChoices.map(key => levelCardAvailable(state, key) ? key : replacements.shift());
}

// Picks 3 distinct random boon keys to offer on level-up, drawn only from boons that are both
// available for the selected loadout and not already at their rank cap.
// Uses state.random() (the run's seeded PRNG, defined in arpg-engine.js) rather than Math.random()
// so card offers are reproducible from a given seed/state rather than truly random each call.
export function drawLevelCards(state) {
    const available = Object.keys(LEVEL_CARDS).filter(key => levelCardAvailable(state, key));
    const choices = [];

    for (let i = 0; i < 3; i++) {
        const index = Math.floor(state.random() * available.length);
        choices.push(available.splice(index, 1)[0]);
    }
    return choices;
}
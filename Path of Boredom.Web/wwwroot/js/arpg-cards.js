// arpg-cards.js — the level-up "boon" draft system.
//
// On every level-up, drawLevelCards() offers 3 random cards from LEVEL_CARDS (filtering out
// anything already maxed or not yet unlocked); the player picks one, which increments its rank in
// state.boons — see the "Choose your next oath" overlay in Home.razor for the UI this feeds.
// Boons are separate from skill tree points and forge upgrades: they're the passive, permanent-for-the-run
// bonuses earned purely by leveling up. This mirrors the "boons"/"cardChoices"/"pendingChoices"
// fields that GameSaveEndpoints.cs's ValidCardProgress validates on the server.
import { skillUnlocked } from "./arpg-skills.js";

// Every possible boon card. `max` is the rank cap (Number.MAX_SAFE_INTEGER effectively means
// uncapped/always offerable — matches the "edge"/"vitality"/"fortune" special-cased caps in
// GameSaveEndpoints.cs's ValidCardProgress). `category` is just the display grouping shown on the card.
export const LEVEL_CARDS = {
    edge: { name: "Sunforged oath", category: "OFFENSE", max: Number.MAX_SAFE_INTEGER, description: "+4% weapon damage per rank, affecting all damaging actions. Adds to the forge damage bonus instead of multiplying it." },
    vitality: { name: "Heart of the dawn", category: "SURVIVAL", max: Number.MAX_SAFE_INTEGER, description: "+16 maximum health and restore 16 health immediately. Each rank adds another 16." },
    bulwark: { name: "Unbroken vow", category: "DEFENSE", max: 10, description: "+1.5 armor per rank. Combines with equipment and forge armor, up to the 60% reduction cap." },
    stride: { name: "Wayfarer's instinct", category: "MOBILITY", max: 10, description: "+4% movement speed per rank, up to +40%. Stacks with Windwake; does not change dodge distance." },
    focus: { name: "Quiet flame", category: "SKILLS", max: 10, description: "+5% skill cooldown recovery per rank, up to +50%. Global recovery from cards, training, and Windwake caps at twice normal." },
    nova: { name: "Widening sunrise", category: "NOVA", max: 10, description: "+10 ember nova radius per rank, up to +100. Stacks with Solar heart forge upgrades." },
    cleave: { name: "Horizon cutter", category: "CLEAVE", max: 10, description: "+6 cleave reach per rank, up to +60. Strike the horde before it reaches you." },
    harvest: { name: "Call of the fallen", category: "UTILITY", max: 10, description: "+16 loot attraction range per rank, up to +160. Works with the Gravetide blessing." },
    siphon: { name: "Ashdrinker", category: "SUSTAIN", max: 10, description: "Only elite and boss kills heal: 0.8 health per rank before difficulty penalties (Hard 80%, Nightmare 60%, Inferno 40%). Ordinary kills do not heal." },
    fortune: { name: "The ferryman's due", category: "WEALTH", max: Number.MAX_SAFE_INTEGER, description: "+8% gold from gold pickups per rank. Stacks across the run; equipment salvage is unchanged." },
    critChance: { name: "The surest spark", category: "CRITICAL CHANCE", max: 10, description: "+2 percentage points critical chance per rank. Applies to attacks and specials for every class; total chance capped at 75%." },
    critDamage: { name: "A shattering dawn", category: "CRITICAL DAMAGE", max: 10, description: "+10 percentage points critical damage per rank. Critical hits start at 150% damage; stacks with both forge shops." },
    burst: { name: "Dawn unleashed", category: "BURST SKILL", max: 10, description: "+6% damage per rank for Flame lance, Piercing rain, or Fault line. Works in manual and automatic slots." },
    guard: { name: "A shelter in embers", category: "WARD SKILL", max: 10, description: "+0.15 seconds of class ward protection per rank. Wards reduce incoming damage by 40% while active." }
};

// Picks 3 distinct random boon keys to offer on level-up, drawn only from boons that are both
// unlocked for the player's class/skill state (skillUnlocked) and not already at their rank cap.
// Uses state.random() (the run's seeded PRNG, defined in arpg-engine.js) rather than Math.random()
// so card offers are reproducible from a given seed/state rather than truly random each call.
export function drawLevelCards(state) {
    const available = Object.keys(LEVEL_CARDS).filter(key => skillUnlocked(state, key) && state.boons[key] < LEVEL_CARDS[key].max);
    const choices = [];

    for (let i = 0; i < 3; i++) {
        const index = Math.floor(state.random() * available.length);
        choices.push(available.splice(index, 1)[0]);
    }
    return choices;
}
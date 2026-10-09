// arpg-classes.js — base stats and identity for the three playable classes.
//
// This is pure data (no logic) describing each class's starting stats, attack/skill timings and
// reach, and display info shown in the setup dialog's class preview. Class stays with the
// character for the whole run, including a continuation into Endless mode.
//
// Field meanings:
//   health/damage/speed/armor  — base stats before any upgrades, cards, or skill tree bonuses.
//   attackCooldown/attackReach — timing/range of the basic attack (J / left click).
//   specialCooldown/specialReach/specialDamage — timing/range/damage multiplier of the class's manual skill.
//   dodgeCooldown              — base cooldown of the dodge roll (Space).
//   weaponType                 — used by arpg-graphics.js to pick which weapon sprite/shape to draw.
export const HERO_CLASSES = {
    knight: {
        name: "Ember Knight", role: "Balanced melee", health: 100, damage: 18, speed: 220, armor: 0,
        attackCooldown: 0.42, attackReach: 100, specialCooldown: 6, specialReach: 175, specialDamage: 1.85, dodgeCooldown: 1.8,
        attackName: "Cleave", specialName: "Ember nova", weapon: "Worn iron blade", weaponType: "blade", color: "#e9ac63",
        description: "Fire and finishing blows: chain embers, cross-shaped fire lanes, piercing sun beams, and close-range execution attacks."
    },
    ranger: {
        name: "Dawn Ranger", role: "Ranged skirmisher", health: 90, damage: 18, speed: 245, armor: 0,
        attackCooldown: 0.30, attackReach: 680, specialCooldown: 5.5, specialReach: 680, specialDamage: 1.20, dodgeCooldown: 1.6,
        attackName: "Dawn shot", specialName: "Sunburst volley", weapon: "Weathered ash bow", weaponType: "bow", color: "#99d6ad",
        description: "Fast but fragile. Rebound shots, vine snares, distance-scaled precision hits, arrow fans, and wind-powered escapes reward positioning."
    },
    warden: {
        name: "Iron Warden", role: "Armored bruiser", health: 150, damage: 24, speed: 180, armor: 12,
        attackCooldown: 0.72, attackReach: 85, specialCooldown: 8, specialReach: 160, specialDamage: 2.2, dodgeCooldown: 2.4,
        attackName: "Hammer sweep", specialName: "Iron quake", weapon: "Ironbound hammer", weaponType: "hammer", color: "#a7bfdc",
        description: "High health and innate armor. Gravity wells, ice wedges, shield-breaking strikes, stone pillars, and outer shockwaves control the battlefield."
    }
};

// Looks up the active class definition for a given game state, falling back to Ember Knight if
// the state's heroClass key is somehow missing/unrecognized.
export const classFor = state => HERO_CLASSES[state.heroClass] ?? HERO_CLASSES.knight;
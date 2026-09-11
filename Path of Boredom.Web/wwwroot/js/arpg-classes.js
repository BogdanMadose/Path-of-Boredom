export const HERO_CLASSES = {
    knight: {
        name: "Ember Knight", role: "Balanced melee", health: 100, damage: 18, speed: 220, armor: 0,
        attackCooldown: 0.38, attackReach: 100, specialCooldown: 5, specialReach: 190, specialDamage: 2.2, dodgeCooldown: 1.8,
        attackName: "Cleave", specialName: "Ember nova", weapon: "Worn iron blade", weaponType: "blade", color: "#e9ac63",
        description: "Reliable melee damage, broad cleaves, and a nova that hits every nearby enemy."
    },
    ranger: {
        name: "Dawn Ranger", role: "Ranged skirmisher", health: 80, damage: 15, speed: 245, armor: 0,
        attackCooldown: 0.48, attackReach: 680, specialCooldown: 6, specialReach: 680, specialDamage: 0.9, dodgeCooldown: 1.6,
        attackName: "Dawn shot", specialName: "Sunburst volley", weapon: "Weathered ash bow", weaponType: "bow", color: "#99d6ad",
        description: "Aim arrows from a distance. Volley fires five arrows in a fan; each arrow hits one enemy. Fast, but fragile."
    },
    warden: {
        name: "Iron Warden", role: "Armored bruiser", health: 150, damage: 24, speed: 180, armor: 15,
        attackCooldown: 0.65, attackReach: 90, specialCooldown: 7, specialReach: 170, specialDamage: 2.8, dodgeCooldown: 2.4,
        attackName: "Hammer sweep", specialName: "Iron quake", weapon: "Ironbound hammer", weaponType: "hammer", color: "#a7bfdc",
        description: "High health and innate armor, balanced by slower movement, heavy attack timing, and a longer dodge recovery."
    }
};

export const classFor = state => HERO_CLASSES[state.heroClass] ?? HERO_CLASSES.knight;

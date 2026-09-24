export const HERO_CLASSES = {
    knight: {
        name: "Ember Knight", role: "Balanced melee", health: 100, damage: 18, speed: 220, armor: 0,
        attackCooldown: 0.42, attackReach: 100, specialCooldown: 6, specialReach: 175, specialDamage: 1.85, dodgeCooldown: 1.8,
        attackName: "Cleave", specialName: "Ember nova", weapon: "Worn iron blade", weaponType: "blade", color: "#e9ac63",
        description: "Reliable melee damage, broad cleaves, and a nova that hits every nearby enemy."
    },
    ranger: {
        name: "Dawn Ranger", role: "Ranged skirmisher", health: 80, damage: 15, speed: 245, armor: 0,
        attackCooldown: 0.34, attackReach: 680, specialCooldown: 5.5, specialReach: 680, specialDamage: 1.05, dodgeCooldown: 1.6,
        attackName: "Dawn shot", specialName: "Sunburst volley", weapon: "Weathered ash bow", weaponType: "bow", color: "#99d6ad",
        description: "Fast but fragile. Trickshot adds ricochets; Bodkin volley adds piercing. Piercing rain hits a second target by default. Keep moving."
    },
    warden: {
        name: "Iron Warden", role: "Armored bruiser", health: 150, damage: 24, speed: 180, armor: 12,
        attackCooldown: 0.72, attackReach: 85, specialCooldown: 8, specialReach: 160, specialDamage: 2.2, dodgeCooldown: 2.4,
        attackName: "Hammer sweep", specialName: "Iron quake", weapon: "Ironbound hammer", weaponType: "hammer", color: "#a7bfdc",
        description: "High health and innate armor, balanced by slower movement, heavy attack timing, and a longer dodge recovery."
    }
};

export const classFor = state => HERO_CLASSES[state.heroClass] ?? HERO_CLASSES.knight;

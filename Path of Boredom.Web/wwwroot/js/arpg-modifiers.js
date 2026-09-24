export const ELITE_MODIFIERS = {
    none: { name: "Elite", icon: "◆", color: "#f1cd76", detail: "Standard elite." },
    armored: { name: "Armored", icon: "⬡", color: "#a7cfff", detail: "Takes 20% less damage from all hits. No reflected damage." },
    swift: { name: "Swift", icon: "»", color: "#f2b879", detail: "+18% walking speed. Charge speed and attack warnings are unchanged." },
    mending: { name: "Mending", icon: "+", color: "#9de8ad", detail: "Regenerates 1.5% maximum health per second while alive. Focus it down." }
};

export function enemyDamageSource(enemy, attack) {
    const trait = ELITE_MODIFIERS[enemy.modifier ?? "none"];
    const prefix = enemy.elite ? `${trait.name} ` : "";
    return `${prefix}${enemy.kind}: ${attack}`;
}

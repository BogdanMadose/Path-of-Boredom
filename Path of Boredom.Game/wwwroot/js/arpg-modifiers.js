// arpg-modifiers.js — elite enemy modifier definitions.
//
// Starting from wave 11 (see ValidEliteModifier's wave check on the API side, which mirrors this),
// regular enemies have a chance to spawn as an "elite" carrying exactly one of these traits.
// Bosses never get these — they already have their own multi-phase mechanics. Actual application
// of these effects (damage reduction, speed boost, regen tick) happens in arpg-engine.js's combat
// code; this file only defines what the traits *are* and their display metadata.
export const ELITE_MODIFIERS = {
    none: { name: "Elite", icon: "◆", color: "#f1cd76", detail: "Standard elite." },
    armored: { name: "Armored", icon: "⬡", color: "#a7cfff", detail: "Takes 20% less damage from all hits. No reflected damage." },
    swift: { name: "Swift", icon: "»", color: "#f2b879", detail: "+18% walking speed. Charge speed and attack warnings are unchanged." },
    mending: { name: "Mending", icon: "+", color: "#9de8ad", detail: "Regenerates 1.5% maximum health per second while alive. Focus it down." }
};

// Builds the label used in the death report's damage history (see Home.razor's death-report
// panel) — e.g. "Armored husk: slam" — so a player can see exactly what killed them, including
// whether an elite trait was involved.
export function enemyDamageSource(enemy, attack) {
    const trait = ELITE_MODIFIERS[enemy.modifier ?? "none"];
    const prefix = enemy.elite ? `${trait.name} ` : "";
    return `${prefix}${enemy.kind}: ${attack}`;
}
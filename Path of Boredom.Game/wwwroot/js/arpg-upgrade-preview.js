// arpg-upgrade-preview.js — "before/after" number previews for the forge upgrade UI.
//
// The forge shows exactly what a purchase would change before the player commits gold/mastery to
// it. This works by computing the full set of derived combat stats (values()) twice — once for the
// current state, once for a cloned state with the candidate upgrade applied — then diffing the
// specific metrics that upgrade actually affects (fields lookup table) and formatting a readable
// string. If you add a new forge/mastery upgrade, you need to: add it to `fields` (which derived
// stats it touches) and make sure values() actually computes something meaningful for it.
import { weaponDamage, armorRating, movementSpeed, criticalChance, criticalDamage, skillReach, flaskHealing, cooldownRecovery } from "./arpg-engine.js";
import { classFor } from "./arpg-classes.js";
import { EXTRA_SKILLS, AUTO_COOLDOWN } from "./arpg-skills.js";

// Computes the full set of derived, human-relevant combat stats for a given state snapshot — this
// mirrors (and must stay consistent with) the actual formulas used in arpg-engine.js's combat code,
// just recomputed here independently for preview purposes rather than shared via a common function.
// If a formula changes in arpg-engine.js, the equivalent line here needs updating too or the
// preview numbers will silently drift out of sync with actual gameplay.
function values(state) {
    const hero = classFor(state), p = state.player, tree = state.skillTree, forge = state.upgrades;
    const damage = weaponDamage(state), recovery = cooldownRecovery(state);
    const interval = (value, skill) => value / recovery * (state.loadout.auto.includes(skill) ? AUTO_COOLDOWN : 1);
    const extra = EXTRA_SKILLS[state.heroClass];
    return {
        damage, armor: armorRating(state), health: p.maxHealth, speed: movementSpeed(state),
        crit: criticalChance(state) * 100, critDamage: criticalDamage(state) * 100, recovery: recovery * 100,
        attackHit: Math.round(damage * (1 + forge.cleave * 0.08) * (1 + tree.attack.edge * 0.08)),
        specialHit: Math.round(damage * (hero.specialDamage + forge.nova * (state.heroClass === "ranger" ? 0.1 : 0.12))
            * (1 + tree.nova.amplitude * 0.1) * (1 + (state.heroClass === "knight" ? tree.nova.ignition * 0.15 : 0))),
        burstHit: Math.round(damage * extra.burst.damage * (1 + forge.burst * 0.1 + state.boons.burst * 0.06) * (1 + tree.burst.focus * 0.12)),
        guardHit: Math.round(damage * extra.guard.damage * (1 + forge.guard * 0.08) * (state.heroClass === "knight" && tree.guard.repulse ? 2 : 1)),
        attackInterval: interval(hero.attackCooldown / (1 + forge.cleave * 0.07) / (1 + tree.attack.rhythm * 0.06), "attack"),
        specialInterval: interval(hero.specialCooldown / (1 + forge.nova * 0.07), "nova"),
        burstInterval: interval(extra.burst.cooldown / (1 + forge.burst * 0.08), "burst"),
        guardInterval: interval(extra.guard.cooldown / (1 + forge.guard * 0.08), "guard"),
        dodgeInterval: interval(Math.max(1.8, hero.dodgeCooldown / (1 + forge.dodge * 0.15) / (1 + tree.dodge.recovery * 0.1)), "dodge"),
        immunity: 0.32 + forge.dodge * 0.025 + tree.dodge.agility * 0.04,
        protection: Math.min(8, 3 + forge.guard * 0.2 + state.boons.guard * 0.15 + tree.guard.duration * 0.6),
        healing: flaskHealing(state) * (1 + tree.potion.concentration * 0.1 + (p.health <= p.maxHealth * 0.35 ? tree.potion.triage * 0.12 : 0)),
        attackReach: skillReach(state, "attack"), specialReach: skillReach(state, "nova"),
        burstReach: skillReach(state, "burst"), guardReach: skillReach(state, "guard")
    };
}
// Maps each forge/mastery upgrade key to which of the derived stats (from values() above) it
// actually affects — this is what upgradePreview() diffs to build its "X: before → after" text.
const fields = {
    weapon: ["damage"], armor: ["armor", "health"], cleave: ["attackHit", "attackInterval", "attackReach"],
    nova: ["specialHit", "specialInterval", "specialReach"], burst: ["burstHit", "burstInterval", "burstReach"],
    guard: ["guardHit", "guardInterval", "guardReach", "protection"], dodge: ["dodgeInterval", "immunity"], flask: ["healing"],
    critChance: ["crit"], critDamage: ["critDamage"], might: ["damage"], vitality: ["health"],
    recovery: ["recovery", "specialInterval"], area: ["attackReach", "specialReach", "burstReach", "guardReach"], speed: ["speed"]
};
// Human-readable labels for each derived stat, used to build the preview text.
const labels = {
    damage: "Weapon damage", armor: "Armor %", health: "Max health", speed: "Move speed", crit: "Crit chance %", critDamage: "Crit damage %", recovery: "Recovery %",
    attackHit: "Attack hit", specialHit: "Special hit / arrow", burstHit: "Burst hit / arrow", guardHit: "Ward pulse",
    attackInterval: "Attack interval s", specialInterval: "Special recharge s", burstInterval: "Burst recharge s", guardInterval: "Ward recharge s",
    dodgeInterval: "Dodge recharge s", immunity: "Dodge immunity s", protection: "Ward duration s", healing: "Flask heal at current health",
    attackReach: "Attack reach", specialReach: "Special reach", burstReach: "Burst reach", guardReach: "Ward radius"
};

// Builds the preview text shown in the forge UI for buying one more rank of `key` (a forge upgrade,
// or a mastery upgrade if `mastery` is true). Clones the relevant parts of state, bumps the target
// upgrade by one rank (plus the associated immediate health gain for armor/vitality, since those
// apply instantly rather than just changing a formula), recomputes derived stats, and diffs only
// the metrics that upgrade actually touches. Also flags when a stat is already at its cap (e.g.
// crit chance at 75%) so the UI can warn the player the purchase won't do anything numerically,
// even though some upgrades (like flask/guard) still have secondary effects worth calling out
// separately (refilling flask charges, minimum ward gap) regardless of whether the capped stat moved.
export function upgradePreview(state, key, mastery = false) {
    const next = { ...state, upgrades: { ...state.upgrades }, mastery: { ...state.mastery }, player: { ...state.player } };
    next[mastery ? "mastery" : "upgrades"][key]++;
    const health = key === "armor" ? 12 : mastery && key === "vitality" ? 5 : 0;
    next.player.maxHealth += health; next.player.health += health;
    const before = values(state), after = values(next);
    const ranged = state.heroClass === "ranger";
    const caps = { armor: 60, crit: 75, recovery: 200, protection: 8, attackReach: ranged ? 1000 : 220,
        specialReach: ranged ? 1000 : 340, burstReach: ranged ? 1000 : 500, guardReach: ranged ? 1000 : 340 };
    const metrics = fields[key] ?? [];
    const format = value => Number(value.toFixed(2)).toLocaleString();
    const capped = metrics.every(metric => Math.abs(after[metric] - before[metric]) < 1e-9);
    let text = metrics.map(metric => `${labels[metric]}: ${format(before[metric])} → ${format(after[metric])}${after[metric] >= (caps[metric] ?? Infinity) ? " (CAPPED)" : ""}`).join(" · ");
    if (key === "flask") text += " · Refills flask charges to 5";
    if (key === "guard") text += " · Active ward cannot refresh; minimum 2s protection gap";
    if (capped) text += " · No effective stat gain at current caps";
    return { text, capped };
}
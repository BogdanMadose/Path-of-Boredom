// arpg-ranking.js — captures a "build snapshot" for the leaderboard.
//
// This is the client-side counterpart to ServiceDefaults' RankingBuild/RankingUpgrade records.
// captureRankingBuild() is called right before a score submission (see arpg.js's death/score flow)
// to describe exactly what the character was built like — skill tree ranks, forge upgrades, card
// boons, mastery training, and current loadout — so other players can see how a top run was put
// together on the rankings page.
import { UPGRADES } from "./arpg-campaign.js";
import { LEVEL_CARDS } from "./arpg-cards.js";
import { MASTERY } from "./arpg-engine.js";
import { SKILL_KEYS, skillName, treeNodeDefinition } from "./arpg-skills.js";

// Mobile starts a separate release board without carrying development kills into its scores.
export function resetToReleaseRankings(state) {
    if (state.rankingPatch === "release") return;
    state.rankingPatch = "release";
    state.scoreBaseline = state.kills;
}

// Walks every upgrade "shape" the character has (skill tree nodes, forge upgrades, level-up cards,
// mastery training) and flattens them into one array of { category, name, rank } entries — the
// exact shape RankingRules.IsValid on the API expects. Only non-zero ranks are included, since a
// rank-0 entry isn't really "taken" and would just bloat the payload for nothing.
export function captureRankingBuild(state) {
    const upgrades = [];
    for (const skill of SKILL_KEYS) {
        for (const [node, rank] of Object.entries(state.skillTree[skill])) {
            if (rank > 0) upgrades.push({ category: "tree", name: `${skillName(state, skill)}: ${treeNodeDefinition(state, skill, node).name}`, rank });
        }
    }
    for (const [category, ranks, definitions] of [
        ["forge", state.upgrades, UPGRADES],
        ["card", state.boons, LEVEL_CARDS],
        ["mastery", state.mastery, MASTERY]
    ]) {
        for (const [key, rank] of Object.entries(ranks)) {
            const definition = definitions[key];
            const name = definition.skill ? `${skillName(state, definition.skill)} ${category === "forge" ? "upgrades" : "oath"}` : definition.name;
            if (rank > 0) upgrades.push({ category, name, rank });
        }
    }
    return {
        level: state.player.level,
        upgrades,
        manualSkill: skillName(state, state.loadout.manual),
        autoSkills: state.loadout.auto.filter(skill => skill !== "none").map(skill => skillName(state, skill)),
        equipment: {
            weapon: state.player.weapon, weaponRating: state.player.weaponBonus,
            weaponStyle: state.runSystems.equipment.weapon,
            armor: state.player.armor, armorRating: state.player.armorBonus,
            armorStyle: state.runSystems.equipment.armor
        }
    };
}
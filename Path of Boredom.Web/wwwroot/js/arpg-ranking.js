import { UPGRADES } from "./arpg-campaign.js";
import { LEVEL_CARDS } from "./arpg-cards.js";
import { MASTERY } from "./arpg-engine.js";
import { SKILL_KEYS, skillName, treeNodeDefinition } from "./arpg-skills.js";

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
            if (rank > 0) upgrades.push({ category, name: definitions[key].name, rank });
        }
    }
    return {
        level: state.player.level,
        upgrades,
        manualSkill: skillName(state, state.loadout.manual),
        autoSkills: state.loadout.auto.filter(skill => skill !== "none").map(skill => skillName(state, skill))
    };
}

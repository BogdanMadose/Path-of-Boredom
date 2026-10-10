import assert from 'node:assert/strict';
import { startRun, buyUpgrade, forgeSkillSelected, useSkill } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { LEVEL_CARDS, levelCardAvailable } from '../../Path of Boredom.Game/wwwroot/js/arpg-cards.js';
import { UPGRADES } from '../../Path of Boredom.Game/wwwroot/js/arpg-campaign.js';
import { skillName } from '../../Path of Boredom.Game/wwwroot/js/arpg-skills.js';
import { captureSnapshot, restoreSnapshot } from '../../Path of Boredom.Game/wwwroot/js/arpg-save.js';
for (const skill of ['chain', 'frost', 'reap', 'meteor', 'siphon', 'nullwave']) {
    function fixture() {
        const state = startRun(() => 0.99, 'hard', 'sorcerer');
        state.player.level = 20; state.loadout.auto = [skill, 'nova', 'guard', 'none'];
        state.resumeDelay = 0;
        state.enemies = [{ kind: 'husk', x: state.player.x + 50, y: state.player.y, radius: 15, health: 100000, maxHealth: 100000, modifier: 'none', elite: 0, chilled: 0, chillStrength: 0, combat: { volleys: [], phase: 1, rest: 0, pattern: 1 } }];
        return state;
    }
    const base = fixture(), card = fixture(), forge = fixture();
    assert.ok(LEVEL_CARDS[`${skill}Oath`] && UPGRADES[skill]);
    assert.equal(levelCardAvailable(base, `${skill}Oath`), true);
    card.boons[`${skill}Oath`] = 1;
    forge.status = 'paused'; forge.gold = 10000;
    assert.equal(forgeSkillSelected(forge, skill), true);
    assert.equal(buyUpgrade(forge, skill), true);
    forge.status = 'playing';
    for (const state of [base, card, forge]) assert.equal(useSkill(state, skill, true), true);
    assert.ok(card.runSystems.summary.damage[skill] > base.runSystems.summary.damage[skill], `${skillName(base, skill)} card increases damage`);
    assert.ok(forge.runSystems.summary.damage[skill] > base.runSystems.summary.damage[skill], `${skillName(base, skill)} Forge increases damage`);
    base.enemies = []; base.status = 'paused';
    const restored = restoreSnapshot(captureSnapshot(base));
    assert.equal(restored.heroClass, 'sorcerer');
    base.loadout.auto = ['nova', 'burst', 'guard', 'none'];
    assert.equal(levelCardAvailable(base, `${skill}Oath`), false);
    assert.equal(forgeSkillSelected(base, skill), false);
}
console.log('PASS: all six new Sorcerer abilities have loadout-gated cards and Forge tracks with real damage bonuses and save compatibility');

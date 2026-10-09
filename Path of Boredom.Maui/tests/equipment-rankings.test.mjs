import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startEndlessRun } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { captureRankingBuild } from '../../Path of Boredom.Game/wwwroot/js/arpg-ranking.js';
import { setEquipmentStyle, EQUIPMENT_STYLES } from '../../Path of Boredom.Game/wwwroot/js/arpg-run-systems.js';
import { captureSnapshot, restoreSnapshot } from '../../Path of Boredom.Game/wwwroot/js/arpg-save.js';

const fixtures = [];
for (const hero of ['knight', 'ranger', 'warden']) {
    for (const weapon of Object.keys(EQUIPMENT_STYLES.weapon)) {
        for (const armor of Object.keys(EQUIPMENT_STYLES.armor)) {
            const state = startEndlessRun(() => 0.5, 'hard', hero);
            state.status = 'paused';
            state.loadout.auto = ['chain', 'reap', 'siphon', 'none'];
            assert.equal(setEquipmentStyle(state, 'weapon', weapon), true);
            assert.equal(setEquipmentStyle(state, 'armor', armor), true);
            const build = captureRankingBuild(state);
            assert.deepEqual(build.equipment, {
                weapon: state.player.weapon, weaponRating: state.player.weaponBonus, weaponStyle: weapon,
                armor: state.player.armor, armorRating: state.player.armorBonus, armorStyle: armor
            });
            assert.deepEqual(captureRankingBuild(restoreSnapshot(captureSnapshot(state))), build);
            const wire = JSON.parse(JSON.stringify(build));
            assert.deepEqual(wire.equipment, build.equipment);
            state.runSystems.equipment.weapon = weapon === 'balanced' ? 'heavy' : 'balanced';
            state.player.weapon = 'Different weapon after the record';
            state.player.weaponBonus++;
            assert.equal(build.equipment.weaponStyle, weapon, 'rankings retain styles at the achieved score');
            assert.equal(build.equipment.weaponRating, 72, 'gear upgrades cannot mutate submitted records');
            fixtures.push({ difficulty: 'hard', mode: 'endless', score: 100, heroClass: hero, build, patch: 'release' });
        }
    }
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(fixtures));
console.log('PASS: 27 equipment/class ranking snapshots retain names, ratings and trade-offs across saves, JSON and later equipment changes');

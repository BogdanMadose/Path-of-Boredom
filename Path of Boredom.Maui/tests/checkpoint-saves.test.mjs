import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startRun, startEndlessRun, step } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { SLOTTABLE_SKILLS } from '../../Path of Boredom.Game/wwwroot/js/arpg-skills.js';
import { captureSnapshot, restoreSnapshot } from '../../Path of Boredom.Game/wwwroot/js/arpg-save.js';
import { resetToReleaseRankings } from '../../Path of Boredom.Game/wwwroot/js/arpg-ranking.js';

const fixtures = [];
for (const hero of ['knight', 'ranger', 'warden']) {
    for (const starter of SLOTTABLE_SKILLS) {
        for (const endless of [false, true]) {
            for (const wave of endless ? [35, 40] : [5, 10, 15, 20, 25, 30]) {
                const state = (endless ? startEndlessRun : startRun)(() => 0.5, 'hard', hero);
                resetToReleaseRankings(state);
                state.player.level = 16;
                state.loadout = { manual: 'none', auto: [starter, ...SLOTTABLE_SKILLS.filter(key => key !== starter).slice(0, 2), 'none'] };
                state.wave = wave;
                state.enemies = [];
                state.resumeDelay = 0;
                state.travelPending = 0;
                state.status = 'playing';
                step(state, {}, 0.05);
                assert.equal(state.status, !endless && wave === 30 ? 'won' : 'camp');
                const snapshot = captureSnapshot(state);
                assert.equal(snapshot.version, 16);
                const restored = restoreSnapshot(snapshot);
                assert.equal(restored.status, state.status);
                assert.deepEqual(restored.loadout, state.loadout);
                assert.equal(restored.heroClass, hero);
                assert.equal(restored.wave, wave);
                fixtures.push(snapshot);
            }
        }
    }
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(fixtures));
console.log(`PASS: ${fixtures.length} campaign/endless checkpoints capture and restore across all classes and starter skills`);

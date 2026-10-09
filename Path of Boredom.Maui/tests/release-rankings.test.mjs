import assert from 'node:assert/strict';
import { startRun, startEndlessRun } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { resetToReleaseRankings } from '../../Path of Boredom.Game/wwwroot/js/arpg-ranking.js';
import { captureSnapshot, restoreSnapshot } from '../../Path of Boredom.Game/wwwroot/js/arpg-save.js';

for (const start of [startRun, startEndlessRun]) {
    const state = start(() => 0.5, 'hard', 'knight');
    assert.equal(state.rankingPatch, '004', 'desktop runs retain their own board');
    resetToReleaseRankings(state);
    assert.equal(state.rankingPatch, 'release');
    assert.equal(state.kills - state.scoreBaseline, 0);
    const restored = restoreSnapshot(captureSnapshot(state));
    assert.equal(restored.rankingPatch, 'release', 'the initial-release board survives saving');
    assert.equal(restored.scoreBaseline, state.scoreBaseline);
}

for (const patch of ['005', '004', 'pre004']) {
    const state = startRun(() => 0.5, 'hard', 'ranger');
    state.rankingPatch = patch;
    state.kills = 250;
    state.gold = 1234;
    const saved = captureSnapshot(state);
    const restored = restoreSnapshot(saved);
    const playerBefore = structuredClone(restored.player);
    const loadoutBefore = structuredClone(restored.loadout);
    resetToReleaseRankings(restored);
    assert.equal(restored.rankingPatch, 'release');
    assert.equal(restored.kills - restored.scoreBaseline, 0, 'development kills must not enter the initial-release board');
    assert.equal(restored.gold, 1234);
    assert.deepEqual(restored.player, playerBefore, 'ranking reset must not reset the character');
    assert.deepEqual(restored.loadout, loadoutBefore);
    restored.kills += 7;
    resetToReleaseRankings(restored);
    assert.equal(restored.kills - restored.scoreBaseline, 7, 'the reset must happen only once');
    const reloaded = restoreSnapshot(captureSnapshot(restored));
    assert.equal(reloaded.kills - reloaded.scoreBaseline, 7);
}

console.log('PASS: initial mobile rankings exclude development scores, preserve progress, and round-trip through saves');

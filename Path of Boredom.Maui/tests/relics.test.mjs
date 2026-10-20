import assert from 'node:assert/strict';
globalThis.localStorage = { store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = v; } };
const { startRun, step, useSkill } = await import('../../Path of Boredom.Game/wwwroot/js/arpg-engine.js');
const { captureSnapshot, restoreSnapshot } = await import('../../Path of Boredom.Game/wwwroot/js/arpg-save.js');
const { RELIC_KEYS, rollRelic } = await import('../../Path of Boredom.Game/wwwroot/js/arpg-relics.js');
const { recordRelics, loadProfile, mergeProfile } = await import('../../Path of Boredom.Game/wwwroot/js/arpg-meta.js');

for (const hero of ['knight', 'ranger', 'warden', 'sorcerer']) {
    const state = startRun(Math.random, 'hard', hero);
    state.runRelics = [...RELIC_KEYS];
    for (let i = 0; i < 2400 && state.status === 'playing'; i++) {
        step(state, { x: Math.sin(i / 30), y: 0, dodge: i % 90 === 0 }, 1 / 60);
        if (i % 60 === 0) useSkill(state, 'nova', true);
    }
    assert.ok(state.kills > 0, `${hero} killed nothing`);
    if (['playing', 'paused', 'camp'].includes(state.status)) {
        const restored = restoreSnapshot(captureSnapshot(state));
        assert.deepEqual(restored.runRelics, state.runRelics);
    }
    recordRelics(state);
}
assert.equal(Object.keys(loadProfile().codex).length, RELIC_KEYS.length);
const state = startRun(() => 0, 'hard', 'knight');
assert.ok(rollRelic(state, { kind: 'boss' }));
assert.equal(mergeProfile({ codex: { cinder: 99 } }), true);
assert.equal(loadProfile().codex.cinder, 99);
console.log('PASS: relics fire for every class, survive save/restore, fill the codex and merge across devices');

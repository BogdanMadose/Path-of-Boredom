import assert from 'node:assert/strict';
import fs from 'node:fs';
import { audioSettings, DEFAULT_AUDIO_SETTINGS, createGameAudio } from '../../Path of Boredom.Game/wwwroot/js/arpg-audio.js';
import { startRun } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { captureSnapshot } from '../../Path of Boredom.Game/wwwroot/js/arpg-save.js';

assert.deepEqual(audioSettings(null), DEFAULT_AUDIO_SETTINGS);
assert.deepEqual(audioSettings({ muted: 'false', music: NaN, effects: Infinity }), DEFAULT_AUDIO_SETTINGS);
assert.deepEqual(audioSettings({ muted: true, music: 2, effects: -1 }), { muted: true, music: 1, effects: 0 });

function harness(stored = null) {
    const contexts = [], timers = new Map(), storage = new Map();
    if (stored !== null) storage.set('path-of-boredom.audio.v1', stored);
    let nextTimer = 0;
    const parameter = () => ({ value: 0, values: [],
        setValueAtTime(value) { this.value = value; this.values.push(value); },
        setTargetAtTime(value) { this.value = value; },
        linearRampToValueAtTime(value) { this.values.push(value); },
        exponentialRampToValueAtTime(value) { this.values.push(value); }
    });
    const node = () => ({ connect() {}, disconnect() { this.disconnected = true; } });
    class Context {
        constructor() {
            this.currentTime = 1; this.sampleRate = 100; this.state = 'suspended';
            this.destination = node(); this.sources = []; this.gains = [];
            this.resumes = 0; this.suspends = 0; this.closes = 0;
            contexts.push(this);
        }
        createGain() { const gain = { ...node(), gain: parameter() }; this.gains.push(gain); return gain; }
        createDynamicsCompressor() { return { ...node(), threshold: parameter(), ratio: parameter() }; }
        createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
        source(oscillator) {
            const source = { ...node(), frequency: parameter(), start(time) { this.started = time; },
                stop(time) { this.stopped = time ?? 0; if (time === undefined) this.onended?.(); } };
            source.oscillator = oscillator;
            this.sources.push(source);
            return source;
        }
        createOscillator() { return this.source(true); }
        createBufferSource() { return this.source(false); }
        async resume() { this.state = 'running'; this.resumes++; }
        async suspend() { this.state = 'suspended'; this.suspends++; }
        async close() { this.state = 'closed'; this.closes++; }
        finish() { for (const source of this.sources) source.onended?.(); }
    }
    const environment = {
        AudioContext: Context,
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        setInterval(callback) { const key = ++nextTimer; timers.set(key, callback); return key; },
        clearInterval(key) { timers.delete(key); }
    };
    return { contexts, timers, storage, environment };
}
const fixture = harness('{bad json');
const audio = createGameAudio(fixture.environment);
assert.deepEqual(audio.settings, DEFAULT_AUDIO_SETTINGS);
const state = startRun(() => 0.99, 'hard', 'knight');
state.resumeDelay = 0;
const saved = captureSnapshot(state);
audio.update(state);
audio.play('attack');
assert.equal(fixture.contexts.length, 0, 'no context before a trusted-gesture unlock');
await audio.unlock();
const context = fixture.contexts[0];
assert.equal(context.resumes, 1);
assert.equal(fixture.timers.size, 1, 'music scheduler starts after unlock');
assert.equal(context.sources.length, 3, 'ambient melody, bass and harmony');
assert.deepEqual(captureSnapshot(state), saved, 'audio must not change serialized state');
context.finish();
const beforeButton = context.sources.length;
audio.play('button');
assert.equal(context.sources.length, beforeButton + 1, 'UI button presses have a short synthesized cue');
context.finish();

for (const hero of ['knight', 'ranger', 'warden']) {
    context.currentTime += 1;
    const before = context.sources.length;
    audio.play('attack', hero);
    const attack = context.sources.slice(before);
    assert.ok(attack.length > 0);
    assert.equal(attack[0].frequency.values[0], hero === 'ranger' ? 1100 : hero === 'warden' ? 130 : 420);
    context.finish();
}
for (const skill of ['nova', 'burst', 'guard', 'chain', 'frost', 'reap', 'meteor', 'siphon', 'nullwave']) {
    const before = context.sources.length;
    audio.play('skill', 'ranger', skill);
    assert.equal(context.sources.length - before, 2);
    context.finish();
}
context.currentTime += 1;
const beforeSpam = context.sources.length;
for (let i = 0; i < 100; i++) audio.play('hit');
assert.equal(context.sources.length - beforeSpam, 1, 'impact spam is throttled');
for (let i = 0; i < 100; i++) { context.currentTime += 0.2; audio.play('hit'); }
assert.equal(context.sources.length - beforeSpam, 16, 'effects have a hard overlapping voice limit');
context.finish();

context.currentTime += 1;
const beforeEvents = context.sources.length;
state.player.attack = 0.4;
state.player.health -= 5;
state.runSystems.summary.damage.attack += 10;
audio.update(state);
assert.ok(context.sources.length > beforeEvents, 'real cooldown and health/damage changes produce cues');
context.finish();
const beforeReplacement = context.sources.length;
const replacement = startRun(() => 0.99, 'hard', 'warden');
replacement.status = 'paused';
replacement.player.level = 20;
replacement.gold = 1000;
audio.update(replacement);
assert.equal(context.sources.length, beforeReplacement, 'loading/replacing a state does not replay rewards');
assert.equal(fixture.timers.size, 0, 'paused music stops');

replacement.status = 'playing'; replacement.resumeDelay = 0;
replacement.enemies = [{ kind: 'boss', health: 100, winding: 0, combat: { phase: 1 } }];
context.currentTime += 1;
audio.update(replacement, 2);
assert.equal(fixture.timers.size, 1, 'boss music starts');
context.finish();
context.currentTime += 1;
const beforeWarning = context.sources.length;
replacement.enemies[0].winding = 1.1;
audio.update(replacement, 2);
assert.equal(context.sources.length - beforeWarning, 2, 'boss warning chime');
context.finish();

const beforeBackground = context.sources.length;
audio.setBackground(true);
assert.equal(fixture.timers.size, 0);
assert.equal(context.state, 'suspended');
audio.play('attack');
audio.update(replacement, 2);
assert.equal(context.sources.length, beforeBackground, 'hidden page cannot make sounds');
await audio.unlock();
assert.equal(context.resumes, 1, 'background gesture cannot resume audio');
audio.setBackground(false);
await audio.unlock();
assert.equal(context.resumes, 2);
assert.equal(fixture.timers.size, 1);

audio.setSettings({ muted: true, music: 0.7, effects: 0.3 });
assert.equal(fixture.timers.size, 0);
const mutedCount = context.sources.length;
audio.play('level');
assert.equal(context.sources.length, mutedCount);
const second = createGameAudio(fixture.environment);
assert.deepEqual(second.settings, { muted: true, music: 0.7, effects: 0.3 });
second.dispose();
audio.setSettings({ muted: false, music: 0 });
assert.equal(fixture.timers.size, 0, 'zero music volume stops scheduling');
audio.setSettings({ music: 0.25 });
assert.equal(fixture.timers.size, 1);
audio.dispose(); audio.dispose();
assert.equal(context.closes, 1);
assert.equal(fixture.timers.size, 0);
assert.ok(context.sources.every(source => source.disconnected), 'all sources cleaned up');
await audio.unlock();
assert.equal(context.resumes, 2, 'disposed audio cannot resume');

const unavailable = createGameAudio({});
await unavailable.unlock(); unavailable.update(state); unavailable.play('hit'); unavailable.dispose();
const blocked = harness();
blocked.environment.localStorage = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
const deniedStorage = createGameAudio(blocked.environment);
deniedStorage.setSettings({ effects: 0.2 });
assert.equal(deniedStorage.settings.effects, 0.2);
await deniedStorage.unlock(); deniedStorage.dispose();
const denied = harness();
denied.environment.AudioContext = class { constructor() { throw Error('blocked'); } };
const deniedContext = createGameAudio(denied.environment);
await deniedContext.unlock(); deniedContext.update(state); deniedContext.dispose();

const controller = fs.readFileSync(new URL('../../Path of Boredom.Game/wwwroot/js/arpg.js', import.meta.url), 'utf8');
assert.match(controller, /event\.isTrusted/);
assert.match(controller, /audio\.update\(state/);
assert.match(controller, /audio\.dispose\(\)/);
assert.match(controller, /"pagehide", \(\) => audio\.setBackground\(true\)/);
const home = fs.readFileSync(new URL('../../Path of Boredom.Game/Components/Pages/Home.razor', import.meta.url), 'utf8');
for (const attribute of ['data-audio-mute', 'data-audio-music', 'data-audio-effects', 'data-audio-status']) assert.ok(home.includes(attribute));
console.log('PASS: procedural audio, class/skill cues, music transitions, settings, gesture gating, spam limits, background suspension, save isolation and disposal');

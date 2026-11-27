import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ACHIEVEMENTS, achievementMetrics, evaluateAchievements, createAchievementReporter } from '../../Path of Boredom.Game/wwwroot/js/arpg-achievements.js';
import { startRun, startEndlessRun, enterEndless } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { RELIC_KEYS } from '../../Path of Boredom.Game/wwwroot/js/arpg-relics.js';

const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
const { exportProfile, mergeProfile, recordAchievements } = await import('../../Path of Boredom.Game/wwwroot/js/arpg-meta.js');
const ids = JSON.parse(fs.readFileSync(new URL('../Resources/Raw/play-games-achievements.json', import.meta.url), 'utf8'));
const project = fs.readFileSync(new URL('../Path of Boredom.Maui.csproj', import.meta.url), 'utf8');
assert.match(project, /<MauiAsset Update="Resources\\Raw\\play-games-achievements\.json"\s+LogicalName="play-games-achievements\.json"/,
    'retain the shared metadata Update for Apple builds');
const assetGroups = [...project.matchAll(/<ItemGroup\b([^>]*)>([\s\S]*?)<\/ItemGroup>/g)]
    .filter(group => /<MauiAsset Include="Resources\\Raw\\play-games-achievements\.json"/.test(group[2]));
assert.equal(assetGroups.length, 1, 'include the achievement mapping once');
assert.equal(assetGroups[0][1].trim(), 'Condition="$([MSBuild]::GetTargetPlatformIdentifier(\'$(TargetFramework)\')) == \'android\'"',
    'explicit inclusion must not affect Apple targets');
assert.match(assetGroups[0][2], /<MauiAsset Remove="Resources\\Raw\\play-games-achievements\.json"[\s\S]*<MauiAsset Include=/,
    'normalize any existing Android entry before including it to avoid duplicates');
assert.equal(ACHIEVEMENTS.length, 77);
assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, 77);
assert.deepEqual(Object.keys(ids).sort(), ACHIEVEMENTS.map(a => a.id).sort());
assert.equal(ids.first_blood, 'CgkI94jwyuIMEAIQAg');
assert.equal(new Set(Object.values(ids).filter(Boolean)).size, Object.values(ids).filter(Boolean).length);
assert.ok(ACHIEVEMENTS.every(a => /^[a-z0-9_]{1,64}$/.test(a.id) && a.description.length <= 200));
const p = exportProfile();
const run = startRun(() => 0.5);
assert.deepEqual(evaluateAchievements(run, p), []);
run.kills = 1;
assert.ok(recordAchievements(run).includes('first_blood'));
assert.deepEqual(recordAchievements(run), [], 'repeated polling/loading does not unlock twice');
assert.equal(JSON.parse(storage.get('pob.meta.v1')).achievements.first_blood, 1);
mergeProfile({ ...p, achievements: { first_fall: 1, unknown: 1, kills_100: '1' } });
assert.deepEqual(exportProfile().achievements, { first_blood: 1, first_fall: 1 }, 'union valid account unlocks only');
mergeProfile(p);
assert.equal(exportProfile().achievements.first_blood, 1, 'old cloud profile cannot erase unlocks');
assert.ok(Buffer.byteLength(JSON.stringify({ ...exportProfile(), achievements: Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, 1])) })) < 8192);

const endless = startEndlessRun(() => 0.5);
assert.equal(achievementMetrics(endless, p).endlessStages, 0);
endless.runSystems.summary.stages = 1;
assert.ok(evaluateAchievements(endless, p).includes('endless_stages_1'));
assert.ok(!evaluateAchievements(endless, p).includes('campaign_complete'), 'fresh Endless kit is not a campaign victory');
run.status = 'won'; run.campaignComplete = 1; run.wave = 30; run.runSystems.summary.stages = 6;
assert.ok(evaluateAchievements(run, p).includes('chapter_6'));
assert.ok(evaluateAchievements(run, p).includes('victory_medium'));
assert.ok(!evaluateAchievements(run, p).includes('victory_hard'));
assert.ok(enterEndless(run));
assert.equal(achievementMetrics(run, p).endlessStages, 0, 'campaign stages do not count as Endless');
run.runSystems.summary.stages = 7;
assert.equal(achievementMetrics(run, p).endlessStages, 1);

const veteran = structuredClone(p);
for (const hero of ['knight', 'ranger', 'warden', 'sorcerer']) {
    veteran.victories[hero] = 25; veteran.mastery[hero].level = 30;
}
veteran.unlocked.warden = veteran.unlocked.sorcerer = 1;
veteran.camp = { might: 10, flask: 2, purse: 5, reroll: 3 };
veteran.lifetimeEmbers = 10000;
veteran.codex = Object.fromEntries(RELIC_KEYS.map(key => [key, 1]));
assert.ok(ACHIEVEMENTS.filter(a => a.metric === 'relics').every(a => a.target <= RELIC_KEYS.length));
const champion = startRun(() => 0.5, 'inferno');
Object.assign(champion, { status: 'won', kills: 10000, gold: 10000, boons: { might: 50 } });
champion.player.level = 50;
Object.assign(champion.runSystems.summary, { stages: 6, spent: 20000, challenges: 12, damage: { attack: 1000000 } });
const all = new Set(evaluateAchievements(champion, veteran));
champion.status = 'dead'; champion.mode = 'endless'; champion.rankingMode = 'endless'; champion.runSystems.summary.stages = 40;
for (const id of evaluateAchievements(champion, veteran)) all.add(id);
assert.deepEqual([...all].sort(), ACHIEVEMENTS.map(a => a.id).sort(), 'all 77 conditions have reachable evaluations');

let online = false;
const calls = [];
const reporter = createAchievementReporter(async id => { calls.push(id); return online; });
assert.deepEqual(await reporter.sync({ first_blood: 1, first_fall: 1 }), { total: 2, confirmed: 0, pending: 2 });
assert.deepEqual(calls, ['first_blood']);
online = true;
assert.deepEqual(await reporter.sync({ first_blood: 1, first_fall: 1 }), { total: 2, confirmed: 2, pending: 0 });
assert.deepEqual(calls, ['first_blood', 'first_blood', 'first_fall']);
await reporter.sync({ first_blood: 1, first_fall: 1 });
assert.equal(calls.length, 3, 'confirmed unlocks are not spammed');
reporter.reset();
await reporter.sync({ first_blood: 1 });
assert.equal(calls.length, 4, 'new player/session receives existing account unlocks');
let finish;
const raced = createAchievementReporter(() => new Promise(resolve => { finish = resolve; }));
const pending = raced.sync({ first_blood: 1 });
raced.reset(); finish(true); await pending;
let completed = false;
const retried = raced.sync({ first_blood: 1 }).then(() => { completed = true; });
assert.equal(completed, false);
finish(true); await retried;
const queuedCalls = [];
let release;
const queued = createAchievementReporter(id => {
    queuedCalls.push(id);
    return new Promise(resolve => { release = resolve; });
});
const background = queued.sync({ first_blood: 1 });
queued.reset();
const connected = queued.sync({ first_blood: 1, first_fall: 1 });
assert.deepEqual(queuedCalls, ['first_blood'], 'connecting must wait for the old request');
release(true);
await background;
await Promise.resolve();
assert.deepEqual(queuedCalls, ['first_blood', 'first_blood'], 'retry after reset is not dropped while busy');
release(true);
await Promise.resolve();
assert.deepEqual(queuedCalls, ['first_blood', 'first_blood', 'first_fall']);
release(true);
assert.deepEqual(await connected, { total: 2, confirmed: 2, pending: 0 });
const failed = createAchievementReporter(async () => { throw new Error('Google Play rejected the ID'); });
assert.deepEqual(await failed.sync({ first_blood: 1 }), { total: 1, confirmed: 0, pending: 1 });
assert.deepEqual(await failed.sync({ first_blood: 0, unknown: 1 }), { total: 0, confirmed: 0, pending: 0 });
console.log('PASS: 77 mappings and conditions, persistence, union, replay safety, campaign/Endless boundaries, failed/retried platform reporting and reset races');

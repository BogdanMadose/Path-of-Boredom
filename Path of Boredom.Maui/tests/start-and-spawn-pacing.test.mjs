import assert from 'node:assert/strict';
import { startRun, startEndlessRun, enterEndless, pendingSpawns, step } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { LAST_WAVE } from '../../Path of Boredom.Game/wwwroot/js/arpg-campaign.js';

const normal = startRun(() => 0.5);
assert.equal(normal.resumeDelay, 3, 'the ordinary start keeps its ready countdown');

const quickCampaign = startRun(() => 0.5, 'hard', 'knight', true);
assert.equal(quickCampaign.resumeDelay, 0, 'quick Campaign starts without a frozen countdown');
assert.equal(quickCampaign.intermission, 0, 'quick Campaign does not add the initial intermission');
step(quickCampaign, {}, 0.05);
assert.equal(quickCampaign.wave, 1, 'the first Campaign wave starts on the first simulation frame');
assert.ok(quickCampaign.enemies.length > 0);

const quickEndless = startEndlessRun(() => 0.5, 'hard', 'knight', true);
assert.equal(quickEndless.resumeDelay, 0, 'fresh Endless starts without a frozen countdown');
assert.equal(quickEndless.wave, LAST_WAVE + 1);
assert.ok(quickEndless.enemies.length > 0, 'fresh Endless has its opening enemies immediately');

const ascension = startRun(() => 0.5);
ascension.status = 'won';
ascension.campaignComplete = 1;
ascension.wave = LAST_WAVE;
assert.equal(enterEndless(ascension, 'hard', true), true);
for (let i = 0; i < 15; i++) step(ascension, {}, 0.05);
assert.equal(ascension.wave, LAST_WAVE + 1, 'quick Endless entry releases its wave after the short transition');
assert.equal(ascension.resumeDelay, 0, 'quick Endless entry does not leave combat frozen');
assert.ok(ascension.enemies.length > 0);

// A quick clear must not release the entire remainder of the wave at once. This also exercises a
// boss wave, whose support queue is where the old low-enemy bypass caused the largest burst.
const bossWave = startRun(() => 0.5);
bossWave.status = 'playing';
bossWave.wave = 4;
bossWave.intermission = 0;
bossWave.resumeDelay = 0;
step(bossWave, {}, 0.05);
assert.equal(bossWave.wave, 5);
assert.ok(pendingSpawns(bossWave) > 0);
const queuedBefore = pendingSpawns(bossWave);
bossWave.enemies = [];
bossWave.spawnTimer = 0.75;
step(bossWave, {}, 0.05);
assert.equal(pendingSpawns(bossWave), queuedBefore, 'an empty arena still respects the reinforcement timer');
bossWave.spawnTimer = 0.01;
step(bossWave, {}, 0.05);
assert.equal(pendingSpawns(bossWave), queuedBefore - 1, 'one queued enemy releases when its timer expires');
assert.equal(bossWave.enemies.length, 1, 'the queue releases only one enemy per timer');
assert.ok(bossWave.spawnTimer >= 1.15 && bossWave.spawnTimer <= 1.35, 'reinforcements arrive at a measured, bounded interval');

console.log('PASS: quick starts and paced reinforcements');

import assert from 'node:assert/strict';
import fs from 'node:fs';

// New mobile players get a short touch tutorial after choosing their starter, once per device.
const source = fs.readFileSync(new URL('../../Path of Boredom.Game/wwwroot/js/arpg.js', import.meta.url), 'utf8');
const tutorial = source.slice(source.indexOf('    const tutorial = ['), source.indexOf('    const rankingStatus'));
const steps = new Function(`${tutorial.replace(/const tutorialKey[\s\S]*$/, '')}; return tutorial;`)();
assert.equal(steps.length, 3);
for (const step of steps) {
    assert.ok(step.title && step.text && step.touch, 'every step has desktop and touch text');
    assert.ok(step.touch.length <= 100, `touch tip must be short: ${step.touch}`);
    assert.doesNotMatch(step.touch, /WASD|arrows|\bE\b|Space/, 'touch tips must not mention keyboard keys');
}
assert.match(tutorial, /localStorage\.getItem\(tutorialKey\) === "1"/);

const next = source.slice(source.indexOf('    on(setupNext, "click"'), source.indexOf('    on(setupCancel'));
assert.match(next, /setupAction === "campaign" && !tutorialSeen\(\)/, 'tutorial only for new campaigns on first run');
assert.match(next, /STARTER_SKILLS\.includes\(loadout\.auto\[0\]\)\) return;\s*setupStep = 1/, 'a starter skill is required before the tutorial');
assert.match(next, /if \(setupStep === tutorial\.length\) markTutorialSeen\(\)/, 'finishing marks it seen');
assert.match(next, /on\(setupSkip[\s\S]*markTutorialSeen\(\);[\s\S]*finishSetup\(\)/, 'skip marks seen and starts');

const show = source.slice(source.indexOf('    function showSetupStep()'), source.indexOf('    function openSetup('));
assert.match(show, /tutorial\[setupStep - 1\]\[mobile \? "touch" : "text"\]/);
assert.match(show, /setup\.dataset\.tutorial = /);
assert.match(show, /"Got it — begin"/);
console.log('PASS: first-run touch tutorial is short, touch-specific, shown once, skippable and gated on a starter skill');

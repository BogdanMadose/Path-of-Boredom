import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const home = read('../../Path of Boredom.Game/Components/Pages/Home.razor');
const arpg = read('../../Path of Boredom.Game/wwwroot/js/arpg.js');
const css = read('../../Path of Boredom.Game/Components/Pages/Home.razor.css');
const menu = read('../wwwroot/js/mobile-menu.js');
const graphics = read('../../Path of Boredom.Game/wwwroot/js/arpg-graphics.js');

// Boss relics live in the Forge only.
const forge = home.slice(home.indexOf('<section class="forge-panel"'), home.indexOf('<section class="options-panel"'));
assert.ok(forge.includes('data-boss-relics'), 'Forge shows boss relics');
assert.equal(home.split('data-boss-relics').length - 1, 1, 'relics are not duplicated elsewhere');

// Stage challenge is chosen in setup, not from the main menu.
const setup = home.slice(home.indexOf('data-setup-loadout'), home.indexOf('data-setup-next'));
assert.ok(setup.includes('data-setup-challenge'), 'setup offers a stage challenge');
assert.ok(arpg.includes('[data-setup-challenge]'), 'setup applies the chosen challenge');
assert.ok(!menu.includes("['rankings', 'skills', 'forge', 'challenges']"), 'main menu has no challenge button');

// Card entrance CSS is valid and staggered.
assert.ok(!/^transition: \{/m.test(css), 'no malformed transition rules');
for (const n of [1, 2, 3]) assert.match(css, new RegExp(`\\.level-card:nth-child\\(${n}\\) \\{ transition-delay`));

// Graphics: sprites are created before use and rendered at high resolution.
assert.match(graphics, /sprite = document\.createElement\("canvas"\);\s*sprite\.width = 256; sprite\.height = 288;/);

// Account panel remembers it was opened from the main menu.
assert.ok(menu.includes('accountFromMain = true'));
console.log('PASS: recent UX changes');

import assert from 'node:assert/strict';
import { startRun } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { combatControlStatus, bossWarningPosition } from '../../Path of Boredom.Game/wwwroot/js/arpg-ui-state.js';
const state = startRun(() => 0.99);
state.resumeDelay = 0;
assert.deepEqual(combatControlStatus(state, 'dodge'), { mode: 'ready', text: 'Ready' });
assert.deepEqual(combatControlStatus(state, 'potion'), { mode: 'full', text: '3/5 · Full HP' });
state.player.health = 30;
assert.deepEqual(combatControlStatus(state, 'potion'), { mode: 'ready', text: '3/5 · Ready' });
state.player.potion = 1.25;
assert.deepEqual(combatControlStatus(state, 'potion'), { mode: 'cooling', text: '3/5 · 1.3s' });
state.player.potions = 0;
assert.deepEqual(combatControlStatus(state, 'potion'), { mode: 'empty', text: '0/5 · Empty' });
state.status = 'paused';
assert.equal(combatControlStatus(state, 'dodge').mode, 'paused');
state.status = 'playing'; state.resumeDelay = 2;
assert.equal(combatControlStatus(state, 'dodge').mode, 'paused');
for (const top of [96, 140, 220]) for (const x of [42, 550, 1058]) for (const y of [42, 325, 608]) {
    const position = bossWarningPosition({ x, y, radius: 32 }, top);
    assert.ok(position.y >= top + 44, 'warning clears boss HUD');
    assert.ok(position.y <= 550 && position.x >= 200 && position.x <= 900, 'text avoids edges and bottom controls');
}
console.log('PASS: ready/cooldown/empty/full/paused combat labels and bounded boss-warning placement below HUD');

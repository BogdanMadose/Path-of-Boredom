import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { startRun, weaponDamage, armorRating, resistanceRating, movementSpeed, cooldownRecovery } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { EQUIPMENT_STYLES } from '../../Path of Boredom.Game/wwwroot/js/arpg-run-systems.js';
const source=fs.readFileSync(new URL('../../Path of Boredom.Game/wwwroot/js/arpg.js',import.meta.url),'utf8');
const preview='{'+source.slice(source.indexOf('        const gearPreview ='),source.indexOf('        hudOne("[data-checkpoint-report]")'))+'}';
const state=startRun(()=>0.99);
const host={dataset:{},rows:[],replaceChildren(...rows){this.rows=rows;}};
const context=vm.createContext({state,weaponDamage,armorRating,resistanceRating,movementSpeed,cooldownRecovery,EQUIPMENT_STYLES,
 hudOne(){return host;},root:{querySelector(){return host;}},document:{createElement(){return {textContent:''};}}});
vm.runInContext(preview,context);
assert.equal(host.rows.length,1,'only the equipped summary is shown');
assert.ok(host.rows[0].textContent.startsWith('Equipped now:'));
assert.ok(!host.rows[0].textContent.includes('→'),'no alternative style comparisons');
console.log('PASS: only the equipped-now summary is shown');

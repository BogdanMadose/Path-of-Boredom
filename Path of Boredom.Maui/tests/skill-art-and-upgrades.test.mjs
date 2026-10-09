import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { startRun, startEndlessRun, useSkill, skillReach } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { CLASS_SKILL_TREES } from '../../Path of Boredom.Game/wwwroot/js/arpg-skill-trees.js';
import { CLASS_SKILLS, SLOTTABLE_SKILLS, STARTER_SKILLS, skillIcon, skillName, treeNodeDefinition, learnSkill, skillPointsLeft, validLoadout, combatSkillDefinition } from '../../Path of Boredom.Game/wwwroot/js/arpg-skills.js';
import { drawClassSkillEffect } from '../../Path of Boredom.Game/wwwroot/js/arpg-skill-effects.js';
import { captureSnapshot, restoreSnapshot } from '../../Path of Boredom.Game/wwwroot/js/arpg-save.js';

const names = [], iconGeometry = [], effects = [];
for (const hero of Object.keys(CLASS_SKILLS)) {
    for (const skill of SLOTTABLE_SKILLS) {
        const state = { heroClass: hero };
        const url = skillIcon(state, skill);
        const svg = fs.readFileSync(new URL(`../../Path of Boredom.Game/wwwroot/${url.replace('/_content/PathOfBoredom.Game/', '')}`, import.meta.url), 'utf8');
        assert.ok(svg.includes(`<title>${skillName(state, skill)}</title>`));
        assert.match(svg, /viewBox="0 0 64 64"/);
        iconGeometry.push((svg.match(/<(?:path|circle|ellipse|polygon|line)\b[^>]*>/g) || []).join('').replace(/\s(?:stroke[\w-]*|fill)="[^"]*"/g, ''));
        const trace = [];
        const ctx = new Proxy({}, { get: (target, key) => key in target ? target[key] : (...args) => {
            assert.ok(args.filter(value => typeof value === 'number').every(Number.isFinite));
            trace.push([key, ...args]);
        }, set: (target, key, value) => { target[key] = value; return true; } });
        const effect = { heroClass: hero, skill, x: 0, y: 0, radius: 100, angle: 0, color: '#ffffff', width: 44, arc: 0.8, inner: 40 };
        drawClassSkillEffect(ctx, effect, 0.5);
        assert.ok(trace.length > 10 && trace.length < 500, 'effect draws bounded, distinct geometry');
        effects.push(JSON.stringify(trace));
        drawClassSkillEffect(ctx, effect, 0.65, true);
        for (const [node, definition] of Object.entries(CLASS_SKILL_TREES[hero][skill] ?? {})) {
            names.push(definition.name);
            assert.notEqual(treeNodeDefinition(state, skill, node).name, node);
            assert.ok(treeNodeDefinition(state, skill, node).detail.length > 10);
        }
    }
}
assert.equal(iconGeometry.length, 27);
assert.equal(new Set(iconGeometry).size, 27, 'icons must differ in shape, not just color or title');
assert.equal(new Set(effects).size, 27, 'all class combat skills have different rendered geometry');
assert.equal(names.length, 72);
assert.equal(new Set(names).size, 72, 'new abilities have uniquely named upgrades');

function arena(hero, skill, offsets = [[60, 0], [160, 0]]) {
    const state = startEndlessRun(() => 0.99, 'hard', hero);
    const template = state.enemies.find(enemy => enemy.kind !== 'boss');
    state.player.level = 32;
    state.player.x = 400;
    state.player.y = 325;
    state.player.facing = 0;
    state.player.health = state.player.maxHealth / 2;
    state.resumeDelay = 0;
    state.playerShots = [];
    state.projectiles = [];
    state.loadout.auto = [skill, ...SLOTTABLE_SKILLS.filter(key => key !== skill).slice(0, 2), 'none'];
    state.enemies = offsets.map(([x, y]) => ({ ...structuredClone(template), kind: 'husk', modifier: 'none', elite: 0,
        x: 400 + x, y: 325 + y, health: 10000, maxHealth: 25000, radius: 10,
        chilled: 0, chillStrength: 0, charging: 0, winding: 0, attackWindup: 0,
        combat: { volleys: [], phase: 1, rest: 0, pattern: 1 } }));
    state.status = 'paused';
    assert.equal(learnSkill(state, skill, 'potency'), true);
    assert.equal(learnSkill(state, skill, 'reach'), true);
    return state;
}
const damage = (state, index = 0, initial = 10000) => initial - state.enemies[index].health;
function compare(hero, skill, configure, check) {
    const base = arena(hero, skill), upgraded = arena(hero, skill);
    configure?.(base); configure?.(upgraded);
    assert.equal(learnSkill(upgraded, skill, 'recovery'), true);
    assert.equal(skillPointsLeft(base) - skillPointsLeft(upgraded), 1);
    base.status = upgraded.status = 'playing';
    useSkill(base, skill, true); useSkill(upgraded, skill, true);
    check(base, upgraded);
    assert.deepEqual(restoreSnapshot(captureSnapshot(upgraded)).skillTree, upgraded.skillTree);
}
compare('knight', 'chain', null, (a, b) => assert.ok(damage(b, 1) > damage(a, 1)));
compare('knight', 'frost', s => { s.enemies[0].x = 420; }, (a, b) => assert.ok(damage(b) > damage(a)));
compare('knight', 'reap', s => { s.enemies[0].health = 9500; }, (a, b) => assert.ok(damage(b, 0, 9500) > damage(a, 0, 9500)));
compare('knight', 'meteor', s => { s.enemies[1].x = 800; }, (a, b) => assert.ok(damage(b, 1) > damage(a, 1)));
compare('knight', 'siphon', null, (a, b) => assert.ok(damage(b) > damage(a)));
compare('knight', 'nullwave', null, (a, b) => assert.ok(b.enemies[0].x > a.enemies[0].x));
compare('ranger', 'chain', null, (a, b) => assert.ok(damage(b, 1) > damage(a, 1)));
compare('ranger', 'frost', s => { s.enemies[0].chilled = 1; s.enemies[0].chillStrength = 0.1; }, (a, b) => assert.ok(damage(b) > damage(a)));
compare('ranger', 'reap', null, (a, b) => assert.ok(damage(b, 1) > damage(a, 1)));
compare('ranger', 'meteor', s => { s.enemies = [s.enemies[1]]; s.enemies[0].y = 332; s.enemies[0].radius = 1; }, (a, b) => { assert.equal(damage(a), 0); assert.ok(damage(b) > 0); });
compare('ranger', 'siphon', null, (a, b) => assert.ok(b.player.health > a.player.health));
compare('ranger', 'nullwave', s => { s.enemies[0].kind = 'wisp'; }, (a, b) => assert.ok(damage(b) > damage(a)));
compare('warden', 'chain', null, (a, b) => assert.ok(b.enemies[1].x < a.enemies[1].x));
compare('warden', 'frost', null, (a, b) => assert.ok(b.enemies[0].chillStrength > a.enemies[0].chillStrength));
compare('warden', 'reap', s => { s.enemies[0].kind = 'sentinel'; }, (a, b) => assert.ok(damage(b) > damage(a)));
compare('warden', 'meteor', s => { s.enemies = [s.enemies[0]]; s.enemies[0].x = 665; s.skillTree.meteor.reach = 2; }, (a, b) => assert.ok(damage(b) > damage(a)));
compare('warden', 'siphon', s => { s.player.health = s.player.maxHealth * 0.3; }, (a, b) => assert.ok(b.player.health > a.player.health));
compare('warden', 'nullwave', null, (a, b) => assert.ok(b.enemies[1].x > a.enemies[1].x));

for (const hero of Object.keys(CLASS_SKILLS)) {
    for (const skill of Object.keys(CLASS_SKILLS[hero])) {
        const state = arena(hero, skill);
        const reach = skillReach(state, skill);
        assert.equal(learnSkill(state, skill, 'reach'), true);
        assert.ok(skillReach(state, skill) > reach);
        state.status = 'playing';
        useSkill(state, skill, true);
        assert.ok(state.effects.some(effect => effect.kind === 'class-skill' && effect.heroClass === hero && effect.skill === skill));
    }
}

// Exercise the actual starter selection bridge, including class-specific icon/name refresh.
const ui = fs.readFileSync(new URL('../../Path of Boredom.Game/wwwroot/js/arpg.js', import.meta.url), 'utf8');
const refresh = ui.slice(ui.indexOf('    function updateSetupLoadout()'), ui.indexOf('    for (const select of setupSlots)'));
const bind = ui.slice(ui.indexOf('    for (const button of setupSkillButtons) on('), ui.indexOf('    // Renders whichever step'));
assert.ok(bind.includes('updateSetupLoadout();'));
for (const hero of Object.keys(CLASS_SKILLS)) {
    const state = startRun(() => 0.5, 'hard', hero);
    const setupSlots = [{ value: 'none' }];
    const setupSkillButtons = STARTER_SKILLS.map(key => ({ dataset: { chooseStarterSkill: key }, attrs: {}, name: {}, image: {
        setAttribute(name, value) { this[name] = value; }
    }, querySelector(selector) { return selector === 'img' ? this.image : this.name; }, setAttribute(name, value) { this.attrs[name] = value; } }));
    const messages = {};
    const context = vm.createContext({ setupSlots, setupSkillButtons, STARTER_SKILLS, skillName, skillIcon, validLoadout,
        combatSkillDefinition, saving: false, setupAction: 'campaign', setupNext: {},
        setupPreview: () => state, readSetupLoadout: () => ({ manual: 'none', auto: [setupSlots[0].value, 'none', 'none', 'none'] }),
        root: { querySelectorAll: () => STARTER_SKILLS.map(key => ({ dataset: { setupSkill: key } })),
            querySelector: selector => messages[selector] ??= {} }, on: (button, type, action) => { button[type] = action; }
    });
    vm.runInContext(refresh + bind, context);
    context.updateSetupLoadout();
    assert.equal(context.setupNext.disabled, true, 'an explicit starter choice is required');
    setupSkillButtons.forEach(button => {
        assert.equal(button.image.src, skillIcon(state, button.dataset.chooseStarterSkill));
        assert.equal(button.name.textContent, skillName(state, button.dataset.chooseStarterSkill));
    });
    setupSkillButtons[1].click();
    assert.equal(setupSlots[0].value, 'chain');
    assert.equal(context.setupNext.disabled, false);
    assert.equal(setupSkillButtons[1].attrs['aria-pressed'], 'true');
    context.saving = true;
    setupSkillButtons[2].click();
    assert.equal(setupSlots[0].value, 'chain', 'selection cannot change during a save');
}
const page = fs.readFileSync(new URL('../../Path of Boredom.Game/Components/Pages/Home.razor', import.meta.url), 'utf8');
assert.match(page, /data-choose-starter-skill="@skill"/);
assert.match(page, /img class="run-skill-icon" data-skill-icon="@skill"/);
console.log('PASS: 72 unique upgrades with real branch effects, 27 distinct icons and renderers, icon-based starter/later selection, and compatible saved ranks');

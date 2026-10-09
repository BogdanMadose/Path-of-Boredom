import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { startRun } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';
import { SKILL_KEYS, skillName, skillSelected } from '../../Path of Boredom.Game/wwwroot/js/arpg-skills.js';

class Element {
    constructor(tag = 'div', classes = '', text = '') {
        this.tagName = tag;
        this.textContent = text;
        this.children = [];
        this.dataset = {};
        this.attributes = {};
        this.listeners = {};
        this.hidden = false;
        this.style = { setProperty() {} };
        const names = new Set((classes || '').split(' ').filter(Boolean));
        this.classList = {
            add: name => names.add(name), remove: name => names.delete(name), contains: name => names.has(name),
            toggle(name, enabled = !names.has(name)) { if (enabled) names.add(name); else names.delete(name); return enabled; }
        };
    }
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
    prepend(child) { child.parentElement = this; this.children.unshift(child); }
    insertBefore(child, before) { child.parentElement = this; this.children.splice(this.children.indexOf(before), 0, child); }
    replaceChildren() { this.children = []; }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name]; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    click() { this.listeners.click?.({ target: this }); }
    matches(selector) {
        if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
        const match = selector.match(/^\[data-([\w-]+)\]$/);
        return !!match && match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()) in this.dataset;
    }
    querySelectorAll(selector) {
        return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
}
const element = (tag, classes, text) => new Element(tag, classes, text);
const script = fs.readFileSync(new URL('../wwwroot/js/mobile-menu.js', import.meta.url), 'utf8');
const construction = script.slice(script.indexOf('    function addHelpToggle('), script.indexOf('    function buildForge('));

for (const hero of ['knight', 'ranger', 'warden']) {
    const state = startRun(() => 0.5, 'hard', hero);
    state.loadout.auto = ['chain', 'none', 'none', 'none'];
    const source = element('section', 'skills-panel');
    const loadout = source.appendChild(element('div', 'loadout-grid'));
    const treeGrid = source.appendChild(element('div', 'skill-tree-grid'));
    const trees = SKILL_KEYS.map(skill => {
        const tree = treeGrid.appendChild(element('section', 'skill-tree'));
        tree.dataset.treeSkill = skill;
        tree.dataset.heroClass = hero;
        const title = tree.appendChild(element('h3', '', skillName(state, skill)));
        title.dataset.skillName = skill;
        tree.appendChild(element('p', 'mm-help-text', `Description: ${skillName(state, skill)}`));
        const node = tree.appendChild(element('div', 'tree-node'));
        for (const [key, text] of [['treeName', 'Empower'], ['treeDetail', 'Upgrade effect'], ['treeStatus', 'Available']]) {
            const label = node.appendChild(element('span', '', text));
            label.dataset[key] = '';
        }
        tree.hidden = !skillSelected(state, skill);
        return tree;
    });
    const context = vm.createContext({
        el: element, markHelp() {}, requestAnimationFrame: callback => callback(),
        makePanel(name, title, section) {
            const header = section.appendChild(element('div', 'mm-head'));
            header.appendChild(element('button', 'mm-close'));
            return { root: section, body: section };
        }
    });
    vm.runInContext(script.slice(script.indexOf('    function treeArt('), script.indexOf('    // ---- Panel construction')), context);
    vm.runInContext(construction, context);
    const panel = context.buildSkills(source);
    const tabs = source.querySelector('.mm-subtabs').children;
    const visibleNames = () => tabs.filter(tab => !tab.hidden).map(tab => tab.querySelector('.mm-subtab-label').textContent);
    assert.deepEqual(visibleNames(), ['Loadout', ...SKILL_KEYS.filter(skill => skillSelected(state, skill)).map(skill => skillName(state, skill))]);
    trees.forEach((tree, index) => {
        assert.equal(tabs[index + 1].hidden, tree.hidden);
        assert.equal(tabs[index + 1].classList.contains('mm-hidden'), tree.hidden, 'hidden tabs also have the explicit mobile hiding class');
        assert.equal(tree.parentElement, treeGrid, 'Blazor-rendered trees must not move');
    });
    const hiddenTab = tabs[SKILL_KEYS.indexOf('frost') + 1];
    hiddenTab.click();
    assert.equal(source.dataset.mobileSection, 'loadout', 'unselected trees cannot be activated');
    const selectedTab = tabs[SKILL_KEYS.indexOf('chain') + 1];
    selectedTab.click();
    assert.equal(source.dataset.mobileSection, 'tree');
    assert.equal(trees[SKILL_KEYS.indexOf('chain')].classList.contains('mm-hidden'), false);
    source.querySelector('.mm-help-toggle').click();
    const helpText = source.querySelector('.mm-help-view').children.map(child => child.textContent);
    assert.ok(helpText.includes(`Description: ${skillName(state, 'chain')}`));
    assert.ok(!helpText.includes(`Description: ${skillName(state, 'frost')}`), 'Help excludes unselected tree descriptions');

    state.heroClass = hero === 'knight' ? 'ranger' : 'knight';
    trees.forEach(tree => {
        tree.dataset.heroClass = state.heroClass;
        tree.querySelector('[data-skill-name]').textContent = skillName(state, tree.dataset.treeSkill);
    });
    panel.syncTabs();
    assert.equal(selectedTab.querySelector('.mm-subtab-label').textContent, skillName(state, 'chain'), 'class-specific names refresh without rebuilding tabs');
    assert.equal(selectedTab.querySelector('.mm-skill-art').src, `/_content/PathOfBoredom.Game/images/skills/${state.heroClass}/chain.svg`);
    state.loadout.auto = ['meteor', 'none', 'none', 'none'];
    trees.forEach(tree => { tree.hidden = !skillSelected(state, tree.dataset.treeSkill); });
    panel.syncTabs();
    assert.equal(source.dataset.mobileSection, 'loadout', 'loading a different build closes an obsolete tree');
    assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
    assert.equal(selectedTab.hidden, true);
    assert.ok(visibleNames().includes(skillName(state, 'meteor')));
    assert.ok(!visibleNames().includes(skillName(state, 'chain')));
    assert.equal(loadout.classList.contains('mm-hidden'), false);
    assert.deepEqual(treeGrid.children, trees, 'original tree order and element instances are preserved');
}

const page = fs.readFileSync(new URL('../../Path of Boredom.Game/Components/Pages/Home.razor', import.meta.url), 'utf8');
assert.match(page, /data-tree-skill="@skill" hidden="@CombatSkills\.Contains\(skill\)"/);
console.log('PASS: only chosen skill trees and always-available upgrades have tabs; class-specific labels, filtered Help, hidden-tab guards, load transitions, and Blazor DOM stability');

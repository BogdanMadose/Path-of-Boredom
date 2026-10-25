const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../wwwroot/js/mobile-menu.js'), 'utf8');
const navigation = source.slice(source.indexOf('    function returnToMainMenu('), source.indexOf('    // ---- Tab bar'));
assert.ok(navigation.includes('function openPanel('));
const classes = () => ({ add() {}, remove() {} });
const panel = () => ({ root: { classList: classes(), hidden: true, querySelector() { return null; } } });
const panels = { pause: panel(), skills: panel(), forge: panel(), options: panel(), rankings: panel(), account: panel() };
const events = [];
let refreshes = 0;
let mainMenuReturns = 0;
panels.rankings.root.querySelector = selector => selector === '.mm-close' ? null : ({ disabled: false, click() { refreshes++; } });
const root = {
    dataset: { gameStatus: 'playing' },
    querySelector(selector) {
        if (selector === '[data-open-main-menu]') return { click() { mainMenuReturns++; } };
        if (selector === '[data-main-resume]:not([hidden])' || selector === '[data-main-play]') return { focus() {} };
        return null;
    },
    dispatchEvent(event) {
        events.push(event.detail);
        if (event.detail.open) {
            if (this.dataset.gameStatus === 'playing') this.dataset.gameStatus = 'paused';
            this.dataset.menuOpen = 'on';
        } else {
            delete this.dataset.menuOpen;
            if (event.detail.resume) this.dataset.gameStatus = 'playing';
        }
    }
};
const document = {
    body: { classList: classes() },
    querySelector(selector) { return selector === '.arpg' ? root : { focus() {} }; }
};
class CustomEvent {
    constructor(type, options) { this.type = type; this.detail = options.detail; }
}
const context = vm.createContext({
    panels, document, CustomEvent,
    listen(target, type, handler) { target.addEventListener(type, handler); },
    syncBadges() {},
    layer: { querySelector() { return { setAttribute() {} }; } },
    currentRoot: root, openName: null, resumeAfterMenu: false, returnToMain: false,
    panelBackTarget: null, fromShortcut: false
});
vm.runInContext(navigation, context);
context.openPanel('pause');
assert.equal(root.dataset.gameStatus, 'paused');
context.openPanel('rankings');
assert.equal(root.dataset.gameStatus, 'paused');
assert.equal(refreshes, 1);
assert.equal(panels.rankings.root.hidden, false);
assert.equal(context.panelBackTarget, 'pause', 'Rankings opened from Pause remembers Pause as its back destination');
context.backFromPanel('rankings');
assert.equal(root.dataset.gameStatus, 'paused');
assert.equal(context.openName, 'pause', 'Rankings back returns to the open Pause menu');
assert.equal(panels.rankings.root.hidden, true);
context.openPanel('notes');
assert.equal(root.dataset.gameStatus, 'paused');
assert.equal(context.openName, 'pause', 'patch notes must not be accessible during mobile testing');
assert.doesNotMatch(source, /data-game-patch-notes/);
assert.ok(events.every(event => !event.resume), 'panel changes must never resume gameplay');
context.closePanel(true);
assert.equal(root.dataset.gameStatus, 'playing');
root.dataset.gameStatus = 'paused';
context.openPanel('rankings');
context.closePanel(true);
assert.equal(root.dataset.gameStatus, 'paused', 'a previously paused game must stay paused');
root.dataset.gameStatus = 'ready';
context.openPanel('notes');
assert.equal(context.openName, null, 'no information panel is opened during setup');
context.openPanel('account');
assert.equal(context.openName, 'account', 'future sign-in is available from the opening screen');
assert.equal(root.dataset.gameStatus, 'ready');
context.closePanel(false);
assert.equal(root.dataset.gameStatus, 'ready', 'leaving sign-in must not start a run');
context.openPanel('rankings');
assert.equal(context.openName, 'rankings', 'rankings are available before starting a run');
assert.equal(root.dataset.gameStatus, 'ready');
context.closePanel(false);
assert.equal(root.dataset.gameStatus, 'ready', 'leaving rankings must not start a run');
root.dataset.gameStatus = 'paused';
root.dataset.mainMenu = 'on';
context.openPanel('options');
assert.equal(context.panelBackTarget, 'main', 'Options opened from Main remembers Main as its back destination');
context.backFromPanel('options');
assert.equal(mainMenuReturns, 1, 'Options back reopens Main');
assert.equal(context.openName, null, 'Main back closes the information panel');
delete root.dataset.mainMenu;
root.dataset.gameStatus = 'playing';
context.openPanel('pause');
root.dataset.saveBusy = 'on';
context.openPanel('account');
context.backFromPanel('account');
assert.equal(context.openName, 'pause', 'save/load must keep the current menu open');
assert.equal(root.dataset.gameStatus, 'paused', 'save/load must not resume combat');
root.dataset.saveBusy = 'off';
context.openPanel('account');
context.openPanel('pause');
context.closePanel(true);
assert.equal(root.dataset.gameStatus, 'playing');

const information = source.slice(source.indexOf('    function buildInformation('), source.indexOf('    // ---- Live badges'));
const informationPanels = [];
context.makePanel = name => informationPanels.push(name);
vm.runInContext(information, context);
context.buildInformation({ querySelector(selector) {
    assert.equal(selector, '[data-game-rankings]');
    return { classList: classes() };
} });
assert.deepEqual(informationPanels, ['rankings'], 'information menus must initialize without a patch-notes section');

const saveActions = source.slice(source.indexOf('    function addSaveActions('), source.indexOf('    function buildAccount('));
const element = () => ({
    children: [], dataset: {}, listeners: {},
    get lastChild() { return this.children[this.children.length - 1]; },
    appendChild(child) { this.children.push(child); },
    querySelector() { return null; },
    setAttribute() {},
    addEventListener(type, listener) { this.listeners[type] = listener; }
});
const clicked = [];
const originals = {
    save: { disabled: false, click() { clicked.push('save'); } },
    load: { disabled: false, click() { clicked.push('load'); } }
};
const actionRoot = { dataset: { mainMenu: 'off' }, querySelector(selector) { return originals[selector.includes('"save"') ? 'save' : 'load']; } };
context.el = element;
vm.runInContext(saveActions, context);
const openingMenu = element();
const pauseMenu = element();
context.addSaveActions(openingMenu, actionRoot);
context.addSaveActions(pauseMenu, actionRoot);
const mainMenu = element();
mainMenu.matches = selector => selector === '.main-menu-card';
context.addSaveActions(mainMenu, actionRoot);
assert.equal(mainMenu.children[0].children.length, 2, 'main menu adds Save and Account only; its existing Load button is retained');
assert.equal(mainMenu.children[0].children[0].dataset.mobileSaveAction, 'save');
assert.equal(mainMenu.children[0].children[1].dataset.mobileSaveAction, undefined);
for (const host of [openingMenu, pauseMenu]) {
    const [save, load, signIn] = host.children[0].children;
    assert.equal(save.dataset.mobileSaveAction, 'save');
    assert.equal(load.dataset.mobileSaveAction, 'load');
    save.listeners.click();
    load.listeners.click();
    root.dataset.gameStatus = 'ready';
    signIn.listeners.click();
    assert.equal(context.openName, 'account');
    context.closePanel(false);
}
assert.deepEqual(clicked, ['save', 'load', 'save', 'load']);
assert.ok(source.includes('addSaveActions(mainCard, root)'), 'actual main menu includes account/save actions');
assert.ok(source.includes('skillsShortcut.hidden = !badge || badge.hidden'), 'Skills shortcut only appears for notifications');
assert.ok(source.includes('forgeShortcut.hidden = forgeBadge.hidden'), 'Forge shortcut only appears for notifications');
originals.save.disabled = true;
openingMenu.children[0].children[0].listeners.click();
assert.equal(clicked.length, 4, 'disabled original controls must not be activated');
const pauseConstruction = source.slice(source.indexOf('    function buildPause('), source.indexOf('    function addSaveActions('));
context.el = (tag, className, text) => Object.assign(element(), { textContent: text });
vm.runInContext(pauseConstruction, context);
const pauseHost = element();
context.buildPause(pauseHost);
const walk = node => [node, ...(node.children ?? []).flatMap(walk)];
const community = walk(pauseHost).find(child => child.children?.[0]?.textContent === 'Community');
assert.ok(community, 'pause menu has a Community group');
const labels = community.children.map(child => child.textContent);
assert.ok(labels.includes('Rankings') && labels.includes('Chapter lore'), 'Community lists Rankings and Chapter lore');
assert.ok(!labels.includes('Patch notes - Coming soon'), 'patch-notes placeholder is retired');

const saveResultBody = source.match(/listen\(root, "mobile-save-result", function \(event\) \{([\s\S]*?)\n        \}\);/)?.[1];
assert.ok(saveResultBody, 'save result handler exists');
const saveResultHandler = vm.runInContext(`(function(event) {${saveResultBody}})`, context);
context.openName = 'pause';
saveResultHandler({ detail: { success: true, loadingSave: true } });
assert.equal(context.openName, 'pause', 'loading successfully from Pause leaves Pause open');

for (const page of ['PatchNotes', 'Rankings']) {
    const markup = fs.readFileSync(path.join(__dirname, `../../Path of Boredom.Game/Components/Pages/${page}.razor`), 'utf8');
    assert.match(markup, /class="back-link" href="\/" aria-label="Back to game"/, `${page} back returns to the game route`);
}
console.log('PASS: opening and pause menus expose save/load/sign-in; panel navigation preserves pause and blocks during saves');

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../wwwroot/js/mobile-menu.js'), 'utf8');
const navigation = source.slice(source.indexOf('    function closePanel('), source.indexOf('    // ---- Tab bar'));
assert.ok(navigation.includes('function openPanel('));
const classes = () => ({ add() {}, remove() {} });
const panel = () => ({ root: { classList: classes(), hidden: true } });
const panels = { pause: panel(), skills: panel(), forge: panel(), rankings: panel(), notes: panel(), account: panel() };
const events = [];
let refreshes = 0;
panels.rankings.root.querySelector = () => ({ disabled: false, click() { refreshes++; } });
const root = {
    dataset: { gameStatus: 'playing' },
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
    layer: { querySelector() { return { setAttribute() {} }; } },
    openName: null, resumeAfterMenu: false
});
vm.runInContext(navigation, context);
context.openPanel('pause');
assert.equal(root.dataset.gameStatus, 'paused');
context.openPanel('rankings');
assert.equal(root.dataset.gameStatus, 'paused');
assert.equal(refreshes, 1);
assert.equal(panels.rankings.root.hidden, false);
context.openPanel('pause');
assert.equal(root.dataset.gameStatus, 'paused');
assert.equal(panels.rankings.root.hidden, true);
context.openPanel('notes');
assert.equal(root.dataset.gameStatus, 'paused');
context.openPanel('pause');
assert.equal(root.dataset.gameStatus, 'paused');
assert.equal(panels.notes.root.hidden, true);
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
root.dataset.gameStatus = 'playing';
context.openPanel('pause');
root.dataset.saveBusy = 'on';
context.openPanel('account');
context.closePanel(true);
assert.equal(context.openName, 'pause', 'save/load must keep the current menu open');
assert.equal(root.dataset.gameStatus, 'paused', 'save/load must not resume combat');
root.dataset.saveBusy = 'off';
context.openPanel('account');
context.openPanel('pause');
context.closePanel(true);
assert.equal(root.dataset.gameStatus, 'playing');

const saveActions = source.slice(source.indexOf('    function addSaveActions('), source.indexOf('    function buildAccount('));
const element = () => ({
    children: [], dataset: {}, listeners: {},
    appendChild(child) { this.children.push(child); },
    setAttribute() {},
    addEventListener(type, listener) { this.listeners[type] = listener; }
});
const clicked = [];
const originals = {
    save: { disabled: false, click() { clicked.push('save'); } },
    load: { disabled: false, click() { clicked.push('load'); } }
};
const actionRoot = { querySelector(selector) { return originals[selector.includes('"save"') ? 'save' : 'load']; } };
context.el = element;
vm.runInContext(saveActions, context);
const openingMenu = element();
const pauseMenu = element();
context.addSaveActions(openingMenu, actionRoot);
context.addSaveActions(pauseMenu, actionRoot);
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
originals.save.disabled = true;
openingMenu.children[0].children[0].listeners.click();
assert.equal(clicked.length, 4, 'disabled original controls must not be activated');
console.log('PASS: opening and pause menus expose save/load/sign-in; panel navigation preserves pause and blocks during saves');

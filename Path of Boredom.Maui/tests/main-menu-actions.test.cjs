const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../../Path of Boredom.Game/wwwroot/js/arpg.js'), 'utf8');
const start = source.indexOf('    on(root.querySelector("[data-open-main-menu]"), "click"');
const end = source.indexOf('    for (const select of root.querySelectorAll("[data-equipment-style]"))', start);
assert.ok(start >= 0 && end > start, 'main menu action handlers exist');

class Button {
    constructor() { this.hidden = true; this.disabled = false; this.listeners = {}; this.attributes = {}; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    setAttribute(name, value) { this.attributes[name] = value; }
    focus() { this.focused = true; }
    fire() { return this.listeners.click?.({}); }
}

const names = [
    '[data-open-main-menu]', '[data-death-main-menu]', '[data-main-play]', '[data-main-play-menu]',
    '[data-close-play-menu]', '[data-main-resume]', '[data-main-new]', '[data-main-endless]',
    '[data-main-load]', '[data-main-options]'
];
const elements = Object.fromEntries(names.map(name => [name, new Button()]));
elements['[data-main-play-menu]'].hidden = true;
const rootEvents = [];
const root = {
    dataset: { canvasHud: 'on' },
    querySelector(selector) { return elements[selector] || null; },
    addEventListener() {},
    dispatchEvent(event) { rootEvents.push(event); return true; }
};
const menuEvents = {};
const mainMenu = { addEventListener(type, listener) { menuEvents[type] = listener; } };
const documentListeners = {};
const document = { addEventListener(type, listener) { documentListeners[type] = listener; } };
const menuCalls = [];
let loaded = 0;
let setupFromMain = false;
const context = vm.createContext({
    root, mainMenu, document,
    state: { status: 'ready', campaignComplete: 0 },
    endlessUnlocked: false,
    setupFromMain,
    loadButton: { click() { loaded++; } },
    on(target, event, handler) { target?.addEventListener(event, handler); },
    showMainMenu(show) { menuCalls.push(show); },
    async gameConfirm() { return true; },
    openSetup(action) { menuCalls.push(action); menuCalls.push(context.setupFromMain); },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
});
vm.runInContext(source.slice(start, end), context);

async function run() {
elements['[data-main-play]'].fire();
assert.equal(elements['[data-main-play-menu]'].hidden, false, 'Play reveals its Campaign, Endless and Load actions');
assert.equal(elements['[data-main-play]'].attributes['aria-expanded'], 'true');
elements['[data-close-play-menu]'].fire();
assert.equal(elements['[data-main-play-menu]'].hidden, true, 'Back closes the Play submenu');
assert.equal(elements['[data-main-play]'].focused, true);

await elements['[data-main-new]'].fire();
assert.deepEqual(menuCalls.slice(0, 3), [false, 'campaign', true], 'Campaign closes the menu and opens the new-run setup');
assert.equal(context.setupFromMain, true);

elements['[data-main-load]'].fire();
assert.equal(menuCalls.at(-1), false, 'Load closes the main menu');
assert.equal(loaded, 1, 'Load delegates to the save-slot chooser');

elements['[data-main-options]'].fire();
const options = rootEvents.at(-1);
assert.equal(menuCalls.at(-1), false, 'Options closes the main menu');
assert.equal(options.type, 'open-run-options');
assert.equal(options.detail.fromMain, true, 'Options opens the mobile menu panel and can return to main');

context.endlessUnlocked = true;
await elements['[data-main-endless]'].fire();
assert.equal(menuCalls.at(-2), 'endless', 'Endless opens the Endless setup');
assert.equal(context.setupFromMain, true);
console.log('PASS: Play, Campaign, Endless, Load and Options route to their intended actions');
}

run().catch(error => { console.error(error); process.exitCode = 1; });

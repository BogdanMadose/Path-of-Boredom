const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '../wwwroot/js/mobile-menu.js'), 'utf8');
const menuFunctions = source.slice(source.indexOf('    function listen('), source.indexOf('    function el('));
const init = source.slice(source.indexOf('    function init() {'), source.indexOf('\n    var observer =', source.indexOf('    function init() {')));
assert.ok(menuFunctions && init, 'mobile menu lifecycle functions exist');

const controllers = [];
class Controller {
    constructor() {
        this.signal = { aborted: false };
        controllers.push(this);
    }
    abort() { this.signal.aborted = true; }
}

class Node {
    constructor() {
        this.dataset = {};
        this.children = [];
        this.listeners = [];
        this.isConnected = true;
        this.classList = { remove() {}, add() {} };
    }
    addEventListener(type, handler, options) { this.listeners.push({ type, handler, signal: options?.signal }); }
    appendChild(child) { child.isConnected = true; child.parent = this; this.children.push(child); }
    remove() { this.isConnected = false; this.parent?.children.splice(this.parent.children.indexOf(this), 1); }
    querySelector(selector) {
        if (selector === '.mm-pause-side') return new Node();
        return new Node();
    }
    querySelectorAll() { return []; }
    dispatchEvent(event) { (this.events ||= []).push(event); return true; }
}

function gameRoot(hasAccount) {
    const root = new Node();
    root.querySelector = selector => {
        if (selector === '[data-game-account]') return hasAccount ? new Node() : null;
        return new Node();
    };
    return root;
}

let activeRoot = gameRoot(false);
const window = new Node();
window.setInterval = () => 1;
window.clearInterval = () => {};
const context = vm.createContext({
    AbortController: Controller,
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    document: {
        body: { classList: { remove() {}, add() {} } },
        querySelector(selector) { return selector === '.arpg' ? activeRoot : null; }
    },
    window,
    layer: null,
    panels: {},
    openName: null,
    resumeAfterMenu: false,
    fromShortcut: false,
    returnToMain: false,
    accountFromMain: false,
    currentRoot: null,
    menuController: null,
    badgeTimer: 0,
    el() { return new Node(); },
    treeArt() { return ''; },
    syncBadges() {},
    buildSkills() {}, buildForge() {}, buildOptions() {}, buildInformation() {}, buildAccount() {},
    addSaveActions() {}, buildBar() {},
    makePanel(name, title, section) {
        if (name === 'pause') context.panels.pause = { root: { querySelector: () => new Node() } };
    },
    buildPause() {
        context.panels.pause = { root: { querySelector: () => new Node() } };
    }
});
vm.runInContext(menuFunctions + '\n' + init, context);

assert.equal(context.init(), true, 'menu initializes when the optional cloud panel is absent');
const firstRoot = activeRoot;
const firstLayer = context.layer;
const firstController = controllers[0];
assert.equal(firstRoot.dataset.canvasHud, 'on');
assert.equal(firstLayer.parent, firstRoot);

activeRoot = gameRoot(true);
assert.equal(context.init(), true, 'menu reinitializes for the page rendered after navigation');
assert.equal(firstController.signal.aborted, true, 'old page event listeners are removed');
assert.equal(firstRoot.dataset.canvasHud, undefined, 'old root flags are cleaned up');
assert.equal(firstLayer.isConnected, false, 'old menu layer is removed');
assert.equal(activeRoot.dataset.canvasHud, 'on');
assert.equal(activeRoot.children.includes(context.layer), true);
assert.equal(controllers.length, 2);
console.log('PASS: menu lifecycle reconnects after route navigation, cleans the old root, and initializes without requiring cloud markup');

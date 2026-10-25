const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

async function run() {
    const engine = fs.readFileSync(path.join(__dirname, '../../Path of Boredom.Game/wwwroot/js/arpg.js'), 'utf8').replace(/\r\n/g, '\n');
    const menus = fs.readFileSync(path.join(__dirname, '../wwwroot/js/mobile-menu.js'), 'utf8').replace(/\r\n/g, '\n');
    const events = [];
    const root = { dataset: { cloudSignedIn: 'on', gameStatus: 'paused' }, dispatchEvent(event) {
        events.push(event.type);
        if (event.type === 'mobile-menu' && event.detail?.open) this.dataset.menuOpen = 'on';
    } };
    let submissions = 0;
    const context = vm.createContext({
        root, releaseRankings: true, disposed: false, accountGeneration: 0, reporting: false, syncProfile() {},
        pendingScores: new Map([['old', {}]]), reportedScores: new Map([['old', 100]]),
        rankingStatus: { textContent: '' }, saveStatus: { textContent: '' },
        title: {}, description: {}, startButton: {}, restartButton: {},
        state: { status: 'paused', rankingMode: 'campaign', difficulty: 'hard', kills: 100 },
        createState: () => ({ status: 'ready' }), resetToReleaseRankings() {}, clearTemporaryRun() {}, clearInput() {}, dispose() {},
        updateHud() { root.dataset.gameStatus = context.state.status; },
        CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
        saveBridge: { async invokeMethodAsync() { submissions++; return true; } },
        DIFFICULTIES: { hard: {} }, captureRankingBuild: () => ({}), performance: { now: () => 1 }
    });
    const returnStart = engine.lastIndexOf('    return {\n        dispose,');
    assert.ok(returnStart > 0);
    vm.runInContext('bridge = ' + engine.slice(returnStart + '    return '.length, engine.lastIndexOf('\n}')), context);
    context.bridge.resetAfterDeletion();
    assert.equal(root.dataset.cloudSignedIn, 'off');
    assert.equal(root.dataset.gameStatus, 'ready');
    assert.equal(context.pendingScores.size, 0);
    assert.equal(context.reportedScores.size, 0);
    assert.deepEqual(events, ['mobile-account-deleted']);

    const scoreStart = engine.indexOf('    async function reportScore()');
    const scoreEnd = engine.indexOf('    try {\n        const stored = Number(localStorage.getItem(bestKey));', scoreStart);
    assert.ok(scoreEnd > scoreStart);
    vm.runInContext(engine.slice(scoreStart, scoreEnd), context);
    context.state.status = 'playing';
    await context.reportScore();
    assert.equal(submissions, 0, 'signed-out frames must not submit or queue scores');
    assert.equal(context.pendingScores.size, 0);
    context.bridge.accountChanged(true);
    assert.equal(root.dataset.cloudSignedIn, 'on');
    context.bridge.accountChanged(false);
    assert.equal(root.dataset.cloudSignedIn, 'off');

    let deletedHandler;
    root.addEventListener = (type, callback) => { assert.equal(type, 'mobile-account-deleted'); deletedHandler = callback; };
    context.listen = (target, type, callback) => target.addEventListener(type, callback);
    let selectedSection = null;
    const optionsSource = { querySelector() { return {}; }, querySelectorAll() { return []; }, dataset: {} };
    root.querySelector = selector => selector === '[data-run-options]' ? optionsSource : null;
    context.selectOptionsSection = (source, section) => { assert.equal(source, optionsSource); selectedSection = section; };
    context.openName = 'options';
    context.syncBadges = () => {};
    context.closePanel = () => { context.openName = null; };
    context.openPanel = name => { context.openName = name; root.dataset.menuOpen = 'on'; };
    const deletionStart = menus.indexOf('        listen(root, "mobile-account-deleted"');
    const deletionEnd = menus.indexOf('        // Android back', deletionStart);
    vm.runInContext(menus.slice(deletionStart, deletionEnd), context);
    deletedHandler();
    assert.equal(context.openName, 'options', 'deletion keeps the Options panel open');
    assert.equal(selectedSection, 'account', 'deletion selects the account tab for sign-in recovery');
    assert.equal(root.dataset.menuOpen, 'on', 'deletion restores the Options modal after resetting the run');
    context.openName = null;
    deletedHandler();
    assert.equal(context.openName, null, 'account deletion does not open a standalone account panel');
    console.log('PASS: deletion resets account UI and score queues, stops signed-out reporting, and returns to Options > Account');
}

run().catch(error => { console.error(error); process.exitCode = 1; });

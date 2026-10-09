const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

async function run() {
    const engine = fs.readFileSync(path.join(__dirname, '../../Path of Boredom.Game/wwwroot/js/arpg.js'), 'utf8').replace(/\r\n/g, '\n');
    const menus = fs.readFileSync(path.join(__dirname, '../wwwroot/js/mobile-menu.js'), 'utf8').replace(/\r\n/g, '\n');
    const events = [];
    const root = { dataset: { cloudSignedIn: 'on', gameStatus: 'paused' }, dispatchEvent(event) { events.push(event.type); } };
    let submissions = 0;
    const context = vm.createContext({
        root, releaseRankings: true, disposed: false, accountGeneration: 0, reporting: false,
        pendingScores: new Map([['old', {}]]), reportedScores: new Map([['old', 100]]),
        rankingStatus: { textContent: '' }, saveStatus: { textContent: '' },
        title: {}, description: {}, startButton: {}, restartButton: {},
        state: { status: 'paused', rankingMode: 'campaign', difficulty: 'hard', kills: 100 },
        createState: () => ({ status: 'ready' }), resetToReleaseRankings() {}, clearInput() {}, dispose() {},
        updateHud() { root.dataset.gameStatus = context.state.status; },
        CustomEvent: class { constructor(type) { this.type = type; } },
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
    context.openName = 'account';
    context.syncBadges = () => {};
    context.closePanel = () => { context.openName = null; };
    context.openPanel = name => { context.openName = name; root.dataset.menuOpen = 'on'; };
    const deletionStart = menus.indexOf('        root.addEventListener("mobile-account-deleted"');
    const deletionEnd = menus.indexOf('        // Android back', deletionStart);
    vm.runInContext(menus.slice(deletionStart, deletionEnd), context);
    deletedHandler();
    assert.equal(context.openName, 'account', 'deletion must keep the sign-in screen open');
    assert.equal(root.dataset.menuOpen, 'on');
    context.openName = null;
    deletedHandler();
    assert.equal(context.openName, 'account', 'deletion must return to sign-in if another panel was active');
    console.log('PASS: deletion resets account UI and score queues, stops signed-out reporting, and returns to sign-in');
}

run().catch(error => { console.error(error); process.exitCode = 1; });

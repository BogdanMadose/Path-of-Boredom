const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../Path of Boredom.Itch/wwwroot/js/itch-auth.js'), 'utf8');
class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.attributes = {}; }
    append(...children) { for (const child of children) { this.children.push(child); child.parent = this; } }
    appendChild(child) { this.append(child); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, callback) { this.events[name] = callback; }
    focus() { this.focused = true; }
    click() { this.events.click?.(); }
}
function browser() {
    const document = { body: new Node('body'), head: new Node('head'), createElement: tag => new Node(tag) };
    const timers = new Map(), intervals = new Map(), events = new Map();
    let next = 0, initializations = 0, callback;
    const popup = { closed: false, close() { this.closed = true; } };
    const google = { accounts: { id: { initialize(options) { initializations++; callback = options.callback; }, renderButton(slot) { slot.appendChild(new Node('google-button')); } } } };
    const window = { document, open: () => popup, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
    vm.runInNewContext(source, { window, document, google, URL, Promise,
        setTimeout: (fn, delay) => { timers.set(++next, {fn, delay}); return next; }, clearTimeout: id => timers.delete(id),
        setInterval: fn => { intervals.set(++next, fn); return next; }, clearInterval: id => intervals.delete(id) });
    return { document, window, timers, intervals, events, popup, auth: window.pobItchAuth,
        get initializations() { return initializations; }, credential: () => callback({credential: 'test-token'}),
        get card() { return document.body.children[0]?.children[0]; } };
}
(async () => {
    let b = browser();
    let result = b.auth.signInWithGoogle('test-client');
    assert.equal(b.card.children[0].textContent, 'Connecting to Google\u2026', 'feedback is mounted before the provider script loads');
    assert.match(b.card.children[1].textContent, /Loading secure sign-in/);
    b.card.children[2].click();
    assert.equal((await result).error, 'cancelled');
    b.document.head.children[0].onload();
    await Promise.resolve();
    assert.equal(b.initializations, 0, 'cancelling during loading cannot reopen the sign-in flow');
    assert.equal(b.document.body.children.length, 0);

    b = browser(); result = b.auth.signInWithGoogle('test-client');
    b.document.head.children[0].onerror();
    assert.equal((await result).error, 'unavailable');
    assert.equal(b.document.body.children.length, 0, 'load failure removes the waiting sheet');
    assert.equal(b.timers.size, 0);

    b = browser(); result = b.auth.signInWithGoogle('test-client');
    [...b.timers.values()].find(t => t.delay === 15000).fn();
    assert.equal((await result).error, 'unavailable', 'stalled script has a bounded wait');

    b = browser(); result = b.auth.signInWithGoogle('test-client');
    b.document.head.children[0].onload(); await Promise.resolve();
    assert.equal(b.card.children[0].textContent, 'Continue with Google');
    b.credential();
    assert.equal((await result).token, 'test-token');
    assert.equal(b.document.body.children.length, 0);

    b = browser(); result = b.auth.signInWithApple('https://api.example.test/', 'https://game.example.test/');
    assert.match(b.card.children[1].textContent, /Apple window/);
    b.events.get('message')({ origin: 'https://api.example.test', source: {}, data: {type:'pob-auth', token:'wrong-window'} });
    assert.ok(b.card, 'messages from a different window are ignored');
    b.card.children[2].click();
    assert.equal((await result).error, 'cancelled');
    assert.equal(b.popup.closed, true);
    assert.equal(b.events.size + b.intervals.size + b.timers.size, 0, 'Apple cancellation cleans watchers');

    b = browser(); result = b.auth.signInWithApple('https://api.example.test', 'https://game.example.test');
    b.events.get('message')({ origin: 'https://api.example.test', source: b.popup, data: {type:'pob-auth', token:'test-token', expires:123} });
    assert.equal((await result).token, 'test-token');
    assert.equal(b.document.body.children.length, 0);
    assert.equal(b.events.size + b.intervals.size + b.timers.size, 0);
    console.log('PASS: immediate Google/Apple feedback, provider failure/timeout, cancellation, completion and popup source validation');
})().catch(error => { console.error(error); process.exitCode = 1; });

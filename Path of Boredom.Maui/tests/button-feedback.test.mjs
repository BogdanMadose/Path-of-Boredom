import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bindButtonFeedback } from '../../Path of Boredom.Game/wwwroot/js/arpg-button-feedback.js';
const root = new EventTarget();
const environment = new EventTarget();
const classes = new Set();
const button = {
    disabled: false, ariaDisabled: false,
    closest: () => button,
    contains: target => target === button,
    getAttribute: () => button.ariaDisabled ? 'true' : null,
    classList: { toggle(name, value) { if (value) classes.add(name); else classes.delete(name); }, remove(name) { classes.delete(name); } }
};
root.contains = target => target === button;
const feedback = bindButtonFeedback(root, environment);
function send(target, type, values = {}) {
    const event = new Event(type);
    Object.defineProperties(event, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])));
    target.dispatchEvent(event);
}
const down = (pointerId = 1) => send(root, 'pointerdown', { target: button, button: 0, pointerId });
down(); assert.ok(classes.has('button-pressed'));
send(environment, 'pointerup', { pointerId: 1 }); assert.equal(classes.size, 0);
down(1); down(2);
send(environment, 'pointercancel', { pointerId: 1 }); assert.ok(classes.has('button-pressed'));
send(environment, 'pointercancel', { pointerId: 2 }); assert.equal(classes.size, 0);
down(); send(root, 'pointerout', { pointerId: 1, relatedTarget: null }); assert.equal(classes.size, 0);
for (const code of ['Space', 'Enter']) {
    send(root, 'keydown', { target: button, code, repeat: false }); assert.ok(classes.has('button-pressed'));
    send(environment, 'keyup', { code }); assert.equal(classes.size, 0);
}
for (const name of ['blur', 'pagehide', 'game-background']) {
    down(); send(environment, name); assert.equal(classes.size, 0);
}
down(); send(root, 'focusout'); assert.equal(classes.size, 0);
button.disabled = true; down(); assert.equal(classes.size, 0);
button.disabled = false; button.ariaDisabled = true; down(); assert.equal(classes.size, 0);
button.ariaDisabled = false;
down(); feedback.dispose(); assert.equal(classes.size, 0);
down(); assert.equal(classes.size, 0, 'disposed listeners cannot set pressed state');
const css = fs.readFileSync(new URL('../../Path of Boredom.Game/Components/Pages/Home.razor.css', import.meta.url), 'utf8');
assert.match(css, /:is\(:active, \.button-pressed\)/);
assert.match(css, /prefers-reduced-motion: reduce/);
console.log('PASS: mouse/touch/keyboard pressed feedback, multitouch, release/cancel/focus/background cleanup, disabled guards and disposal');

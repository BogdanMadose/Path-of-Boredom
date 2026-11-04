import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAchievementNotifications } from '../../Path of Boredom.Game/wwwroot/js/arpg-achievement-notifications.js';

function fixture(popover = true) {
    const listeners = new Map();
    const document = {
        hidden: false,
        createElement() {
            const node = { children: [], attrs: {}, hidden: false, textContent: '',
                setAttribute(key, value) { this.attrs[key] = value; },
                append(...children) { this.children.push(...children); },
                remove() { this.removed = true; },
                matches() { return this.open === true; } };
            if (popover) {
                node.showPopover = () => { node.open = true; };
                node.hidePopover = () => { node.open = false; };
            }
            return node;
        },
        addEventListener(name, listener) { listeners.set(name, listener); },
        removeEventListener(name) { listeners.delete(name); }
    };
    const root = { ownerDocument: document, isConnected: true, append(node) { this.toast = node; } };
    const notifications = createAchievementNotifications(root);
    return { root, notifications, listeners, document, title: () => root.toast.children[1].children[1].textContent };
}

test('queues distinct unlocks for five seconds without duplicates or unknown IDs', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = fixture();
    f.notifications.enqueue(['first_blood', 'first_fall', 'first_blood', 'not_an_achievement']);
    assert.equal(f.title(), 'First Blood');
    assert.equal(f.root.toast.attrs.role, 'status');
    assert.equal(f.root.toast.attrs['aria-live'], 'polite');
    assert.equal(f.root.toast.attrs.popover, 'manual');
    assert.equal(f.root.toast.hidden, false);
    t.mock.timers.tick(4999);
    assert.equal(f.title(), 'First Blood');
    t.mock.timers.tick(1);
    assert.equal(f.root.toast.hidden, true);
    t.mock.timers.tick(250);
    assert.equal(f.title(), 'The Ember Remembers');
    t.mock.timers.tick(5000);
    t.mock.timers.tick(250);
    assert.equal(f.root.toast.hidden, true);
    f.notifications.enqueue(['first_blood']);
    assert.equal(f.root.toast.hidden, true);
    f.notifications.dispose();
});

test('backgrounding pauses active and queued announcements', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = fixture();
    f.document.hidden = true;
    f.notifications.enqueue(['first_blood', 'first_fall']);
    t.mock.timers.tick(20000);
    assert.equal(f.root.toast.hidden, true);
    f.document.hidden = false;
    f.listeners.get('visibilitychange')();
    assert.equal(f.title(), 'First Blood');
    f.document.hidden = true;
    f.listeners.get('visibilitychange')();
    t.mock.timers.tick(20000);
    f.document.hidden = false;
    f.listeners.get('visibilitychange')();
    assert.equal(f.title(), 'First Blood');
    t.mock.timers.tick(5000);
    t.mock.timers.tick(250);
    assert.equal(f.title(), 'The Ember Remembers');
    f.notifications.dispose();
});

test('account changes clear the queue; disposal removes DOM and listeners', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = fixture();
    f.notifications.enqueue(['first_blood', 'first_fall']);
    f.notifications.clear();
    t.mock.timers.tick(20000);
    assert.equal(f.root.toast.hidden, true);
    f.notifications.enqueue(['first_blood']);
    assert.equal(f.title(), 'First Blood');
    f.notifications.dispose();
    f.notifications.dispose();
    assert.equal(f.listeners.size, 0);
    assert.equal(f.root.toast.removed, true);
    t.mock.timers.tick(20000);
    f.notifications.enqueue(['first_fall']);
    assert.equal(f.root.toast.hidden, true);
});

test('fallback works without Popover API, and empty batches remain silent', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = fixture(false);
    f.notifications.enqueue([]);
    assert.equal(f.root.toast.hidden, true);
    f.notifications.enqueue(['first_blood']);
    assert.equal(f.title(), 'First Blood');
    assert.equal(f.root.toast.attrs.popover, undefined);
    t.mock.timers.tick(5000);
    assert.equal(f.root.toast.hidden, true);
    f.notifications.dispose();
});

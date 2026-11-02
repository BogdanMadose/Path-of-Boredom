import assert from 'node:assert/strict';
import fs from 'node:fs';
import { drawHud } from '../../Path of Boredom.Game/wwwroot/js/arpg-hud.js';
import { createState } from '../../Path of Boredom.Game/wwwroot/js/arpg-engine.js';

const client = fs.readFileSync(new URL('../../Path of Boredom.Game/wwwroot/js/arpg.js', import.meta.url), 'utf8');
assert.ok(!client.includes('KeyQ:'), 'automatic skills have no Q shortcut');
assert.ok(!client.includes('manual ? "Q"'), 'skill bar never advertises the removed Q shortcut');
for (const autoAttack of [false, true]) for (const [width, height] of [[844, 390], [1100, 650], [1280, 756], [1827, 1080]]) {
    const labels = [], stack = [];
    const state = createState();
    const context = {
        canvas: { width, height }, sx: 1, sy: 1, textAlign: 'left', textBaseline: 'alphabetic', font: '12px system-ui',
        save() { stack.push({ sx: this.sx, sy: this.sy, textAlign: this.textAlign, textBaseline: this.textBaseline, font: this.font }); },
        restore() { Object.assign(this, stack.pop()); },
        setTransform(sx, b, c, sy) { this.sx = sx; this.sy = sy; },
        createLinearGradient() { return { addColorStop() {} }; },
        measureText(text) { return { width: text.length * Number(this.font.match(/([\d.]+)px/)[1]) * 0.55 }; },
        fillText(text, x, y, maxWidth = Infinity) {
            const size = Number(this.font.match(/([\d.]+)px/)[1]);
            const w = Math.min(maxWidth, this.measureText(text).width);
            const left = this.textAlign === 'center' ? x - w / 2 : this.textAlign === 'right' ? x - w : x;
            const top = this.textBaseline === 'middle' ? y - size / 2 : y - size;
            labels.push({ text, left: left * this.sx, right: (left + w) * this.sx, top: top * this.sy, bottom: (top + size) * this.sy });
        }
    };
    const ctx = new Proxy(context, { get(target, name) { return name in target ? target[name] : () => {}; } });
    drawHud(ctx, state, { cssWidth: width, cssHeight: height, desktop: true, autoAttack, stage: 'Stage 6 · Wave 30/30', boss: { name: 'The Unwritten King', health: 50, maxHealth: 100, accent: '#fff' } });
    const scale = Math.min(1.4, Math.max(1.1, width / 1100));
    const controls = [{ left: 14, right: 78, top: 80 * scale, bottom: 80 * scale + 52 }, { left: width - 150, right: width, top: 80 * scale + 2, bottom: 80 * scale + 54 }];
    for (const label of labels) {
        assert.ok(label.left >= 0 && label.right <= width + 1 && label.top >= 0 && label.bottom <= height, `${label.text} fits at ${width}x${height}`);
        for (const control of controls) assert.ok(label.right <= control.left || label.left >= control.right || label.bottom <= control.top || label.top >= control.bottom, `${label.text} clears desktop shortcuts`);
    }
    assert.ok(labels.some(label => label.text.includes('WASD')), 'desktop shows keyboard help');
    const hint = labels.find(label => label.text.includes('WASD')).text;
    assert.ok(!hint.includes('Q ·'), 'HUD never advertises manual skills');
    assert.equal(hint.includes('Mouse'), !autoAttack, 'mouse aiming is advertised only for manual attacks');
    assert.ok(hint.includes(autoAttack ? 'Attacks & skills · Auto' : 'Skills · Auto'));
    assert.equal(context.sx, 1, 'world transform restored');
    assert.equal(context.sy, 1);
}
console.log('PASS: desktop HUD text bounds, menu clearance, keyboard hint and transform restoration');

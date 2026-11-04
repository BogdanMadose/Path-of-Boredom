import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { dumpBrowserDom } from './browser-dom.mjs';

const read = path => fs.readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
assert.ok(fs.existsSync(edge), 'Microsoft Edge is required for toast layout validation');
const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (['/arpg-achievement-notifications.js', '/arpg-achievements.js'].includes(url.pathname)) {
        response.setHeader('Content-Type', 'text/javascript');
        response.end(read('Path of Boredom.Game/wwwroot/js' + url.pathname));
        return;
    }
    const host = url.searchParams.get('host');
    if (!['Maui', 'Web', 'Itch'].includes(host)) { response.writeHead(404); response.end(); return; }
    const css = ['Path of Boredom.Game/Components/Pages/Home.razor.css',
        `Path of Boredom.${host}/wwwroot/css/mobile-shell.css`, `Path of Boredom.${host}/wwwroot/css/mobile-menu.css`]
        .map(read).join('\n').replaceAll('::deep ', '').replaceAll('@media (pointer: coarse)', '@media all');
    response.setHeader('Content-Type', 'text/html');
    response.end(`<html><head><style>html,body{margin:0}${css}</style></head><body class="mobile-shell">
    <div class="arpg" data-main-menu="on"><dialog id="dialog"><button id="focus">Keep focus</button></dialog></div>
    <script type="module">
    import { createAchievementNotifications } from '/arpg-achievement-notifications.js';
    try {
        const check = (condition, message) => { if (!condition) throw new Error(message); };
        const root = document.querySelector('.arpg');
        const dialog = document.querySelector('dialog');
        const button = document.querySelector('button');
        dialog.showModal(); button.focus();
        const notifications = createAchievementNotifications(root);
        notifications.enqueue(['mastery_sorcerer_30', 'first_blood']);
        const toast = root.querySelector('.achievement-toast');
        await new Promise(resolve => setTimeout(resolve, 300));
        const bounds = toast.getBoundingClientRect();
        check(toast.matches(':popover-open'), 'toast is not in the top layer above the modal');
        check(bounds.width > 0 && bounds.height > 0, 'toast is hidden');
        check(bounds.left >= 0 && bounds.right <= innerWidth, 'horizontal overflow');
        check(bounds.top >= 0 && bounds.bottom <= innerHeight, 'vertical overflow');
        check(toast.scrollWidth <= toast.clientWidth + 1, 'text overflows');
        check(document.activeElement === button, 'toast stole focus');
        check(getComputedStyle(toast).pointerEvents === 'none', 'toast intercepts gameplay input');
        check(toast.getAttribute('aria-live') === 'polite', 'missing accessible announcement');
        notifications.clear();
        check(!toast.matches(':popover-open') && toast.hidden, 'clear left a visible toast');
        notifications.dispose();
        check(!root.querySelector('.achievement-toast'), 'dispose left an orphaned toast');
        dialog.close();
        document.body.dataset.result = 'PASS';
    } catch (error) { document.body.dataset.result = error.message; }
    </script></body></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
    for (const host of ['Maui', 'Web', 'Itch']) for (const size of ['740,360', '420,800']) {
        const output = await dumpBrowserDom(edge, ['--virtual-time-budget=2000', `--window-size=${size}`, `http://127.0.0.1:${server.address().port}/?host=${host}`]);
        const result = output.match(/data-result="([^"]*)"/)?.[1];
        assert.equal(result, 'PASS', `${host} ${size}: ${result ?? 'browser script did not finish'}`);
        console.log(`PASS: ${host} ${size}: visible over dialogs, text fits, focus retained, input passes through`);
    }
} finally { await new Promise(resolve => server.close(resolve)); }

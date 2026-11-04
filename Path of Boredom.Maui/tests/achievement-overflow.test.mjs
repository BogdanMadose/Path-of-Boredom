import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { dumpBrowserDom } from './browser-dom.mjs';

const read = file => fs.readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const home = read('Path of Boredom.Game/Components/Pages/Home.razor');
const start = home.indexOf('<div class="overlay-card" data-run-menu>');
const end = home.indexOf('<div class="arena-overlay skill-choice-overlay"', start);
const card = home.slice(start, home.lastIndexOf('</div>', end));
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
assert.ok(fs.existsSync(edge), 'Microsoft Edge is required for geometry validation');
const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const host = url.searchParams.get('host');
    if (!['Maui', 'Web', 'Itch'].includes(host)) { response.writeHead(404); response.end(); return; }
    const css = ['Path of Boredom.Game/Components/Pages/Home.razor.css',
        `Path of Boredom.${host}/wwwroot/css/mobile-shell.css`, `Path of Boredom.${host}/wwwroot/css/mobile-menu.css`]
        .map(read).join('\n').replaceAll('::deep ', '').replaceAll('@media (pointer: coarse)', '@media all');
    response.setHeader('Content-Type', 'text/html');
    response.end(`<html><head><style>html,body{margin:0}*{box-sizing:border-box}[hidden]{display:none!important}${css}</style></head>
        <body class="${url.searchParams.has('plain') ? '' : 'mobile-shell'}"><div class="arpg" data-canvas-hud="on" data-main-menu="off"><main class="game-shell"><div class="game-grid"><section class="arena-section"><div class="combat-view"><div class="arena-viewport"><canvas width="1100" height="650"></canvas><div class="arena-overlay" data-overlay>${card}</div></div></div></section></div></main></div>
        <script>
        try {
            const root = document.querySelector('.arpg'), menu = document.querySelector('[data-run-menu]');
            const check = (condition, message) => { if (!condition) throw new Error(message); };
            const q = s => menu.querySelector(s);
            for (const status of ['camp', 'dead', 'won']) {
                root.dataset.gameStatus = status;
                for (const mode of ['campaign', 'endless']) {
                    root.dataset.gameMode = mode;
                    q('[data-camp-event]').hidden = status !== 'camp';
                    q('[data-camp-challenge]').hidden = status !== 'camp';
                    q('[data-death-report]').hidden = status !== 'dead';
                    q('[data-run-summary]').hidden = false;
                    q('[data-action="endless"]').hidden = status !== 'won';
                    q('[data-action="restart"]').hidden = status === 'won';
                    q('[data-death-main-menu]').hidden = status !== 'dead';
                    q('[data-loading]').hidden = true;
                    q('[data-overlay-title]').textContent = status;
                    for (const selector of ['[data-killing-blow]', '[data-camp-event-detail]', '[data-build-synergy]', '[data-boss-relics]']) q(selector).textContent = 'LongUnbrokenReportText'.repeat(30);
                    for (const selector of ['[data-damage-history]', '[data-summary-overview]', '[data-summary-damage]']) q(selector).innerHTML = ('<li>' + 'LongUnbrokenReportText'.repeat(30) + '</li>').repeat(3);
                    for (const open of [false, true]) {
                        q('.run-build-details').open = open;
                        const bounds = menu.getBoundingClientRect();
                        const label = status + '/' + mode + '/' + open;
                        check(bounds.left >= -1 && bounds.right <= innerWidth + 1, label + ': card wider than screen ' + bounds.right);
                        check(menu.scrollWidth <= menu.clientWidth + 1, label + ': horizontal card overflow ' + menu.scrollWidth + '/' + menu.clientWidth);
                        check(document.documentElement.scrollWidth <= innerWidth + 1, label + ': document overflow');
                        for (const action of menu.querySelectorAll(':scope > button:not([hidden])')) {
                            const b = action.getBoundingClientRect();
                            check(b.width > 0 && b.left >= bounds.left - 1 && b.right <= bounds.right + 1, label + ': action outside card');
                        }
                    }
                }
            }
            document.body.dataset.result = 'PASS';
        } catch (error) { document.body.dataset.result = error.message; }
        </script></body></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
    for (const host of ['Maui', 'Web', 'Itch', 'Web&plain=1']) for (const size of ['740,360', '915,412', '1280,720', '420,800']) {
        const output = await dumpBrowserDom(edge, ['--virtual-time-budget=1500', `--window-size=${size}`, `http://127.0.0.1:${server.address().port}/?host=${host}`]);
        assert.match(output, /data-result="PASS"/, `${host} ${size}: ${output.match(/data-result="[^"]*"/)?.[0]}`);
        console.log(`PASS: ${host} ${size}, campaign/Endless camp, death and victory, expanded/collapsed reports`);
    }
} finally { await new Promise(resolve => server.close(resolve)); }

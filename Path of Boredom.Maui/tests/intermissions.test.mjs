import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { dumpBrowserDom } from './browser-dom.mjs';

const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const asset = '_content/PathOfBoredom.Game/css/intermissions.css';
for (const host of ['../wwwroot/index.html', '../../Path of Boredom.Itch/wwwroot/index.html']) {
    const page = read(host);
    assert.ok(page.includes(`href="${asset}"`), `${host} loads the shared intermissions`);
    assert.ok(page.indexOf(`href="${asset}"`) > page.indexOf('href="css/mobile-menu.css"'));
    assert.ok(!page.includes('getElementById("intermissions-css").disabled'), 'desktop must keep the shared intermissions');
}
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if (!fs.existsSync(edge)) {
    console.log('SKIP: intermission browser checks require Microsoft Edge');
} else {
    const home = read('../../Path of Boredom.Game/Components/Pages/Home.razor');
    const start = home.indexOf('<div class="overlay-card" data-run-menu>');
    const end = home.lastIndexOf('</div>', home.indexOf('<div class="arena-overlay skill-choice-overlay"'));
    const runMenu = home.slice(start, end);
    const common = read('../../Path of Boredom.Game/Components/Pages/Home.razor.css').replaceAll('::deep ', '');
    const shared = read('../../Path of Boredom.Game/wwwroot/css/intermissions.css');
    const desktop = read('../../Path of Boredom.Game/wwwroot/css/desktop-shell.css');
    const html = host => {
        const shell = host === 'itch-desktop' ? '' : read(host === 'itch-touch'
            ? '../../Path of Boredom.Itch/wwwroot/css/mobile-shell.css' : '../wwwroot/css/mobile-shell.css');
        const menu = read(host.startsWith('itch') ? '../../Path of Boredom.Itch/wwwroot/css/mobile-menu.css' : '../wwwroot/css/mobile-menu.css');
        return `<html><head><style>html,body{margin:0}*{box-sizing:border-box}[hidden]{display:none!important}
            ${common}\n${shell}\n${menu}\n${desktop}\n${shared}
            body.mobile-shell{--safe-top:12px!important;--safe-right:28px!important;--safe-bottom:12px!important;--safe-left:28px!important}
            </style></head><body class="mobile-shell ${host === 'itch-desktop' ? 'desktop-shell' : ''}">
            <div class="arpg" data-main-menu="off" data-canvas-hud="on" data-game-status="camp" data-game-mode="campaign">
            <div class="arena-overlay" data-overlay>${runMenu}</div></div><script>
            const root = document.querySelector('.arpg'), card = root.querySelector('[data-run-menu]');
            const results = [], errors = [];
            card.querySelector('[data-loading]').hidden = true;
            card.querySelector('[data-overlay-kicker]').textContent = 'CHAPTER COMPLETE';
            card.querySelector('[data-overlay-title]').textContent = 'A dawn recovered.';
            card.querySelector('[data-camp-event-detail]').textContent = 'The wanderer offers a blessing in exchange for a few coins.';
            card.querySelector('[data-camp-challenge-status]').textContent = 'Choose your oath before traveling.';
            card.querySelector('[data-camp-challenge-reward]').textContent = '150';
            card.querySelector('[data-run-summary]').hidden = false;
            card.querySelector('[data-summary-overview]').innerHTML = '<li>14m 22s</li><li>6 stages</li><li>512 kills</li>';
            card.querySelector('[data-summary-damage]').innerHTML = '<li>Ember nova: 900</li><li>Cinder relay: 850</li>';
            card.querySelector('[data-build-synergy]').textContent = 'Cinder relay and arcane bloom feed one another.';
            card.querySelector('[data-boss-relics]').textContent = 'Warden’s oath +2 armor · Ferryman token +2 resist · Furnace heart +3% damage.';
            card.querySelector('[data-run-relics]').innerHTML = ['Cinder Heart', 'Phantom Quiver', 'Leech Fang', 'Bramble Crown', 'Gilded Tooth', 'Echo Vial'].map(name => '<span class="run-relic-chip">' + name + '</span>').join('');
            const rect = element => { const r = element.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom }; };
            for (const mode of (innerWidth < 520 ? [] : ['campaign', 'endless'])) for (const status of ['camp', 'paused']) for (const decisions of [false, true]) for (const expanded of [false, true]) {
                const name = [mode, status, decisions, expanded].join('/');
                root.dataset.gameMode = mode; root.dataset.gameStatus = status;
                card.querySelector('[data-camp-event]').hidden = !decisions;
                card.querySelector('[data-camp-challenge]').hidden = !decisions;
                card.querySelector('.run-build-details').open = expanded;
                const primary = card.querySelector('[data-action="start"]');
                primary.disabled = false;
                primary.textContent = status === 'paused' ? 'Continue saved run' : mode === 'endless' ? 'Continue Endless Watch' : 'Travel to The Drowned Wilds';
                const restart = card.querySelector('[data-action="restart"]');
                const endless = card.querySelector('[data-action="endless"]');
                restart.hidden = status !== 'paused'; endless.hidden = status === 'paused';
                endless.textContent = 'New Endless Watch run';
                const secondary = status === 'paused' ? restart : endless;
                const a = rect(primary), b = rect(secondary), bounds = rect(card);
                if (Math.abs(a.width - b.width) > 1 || a.width < bounds.width * .4) errors.push(name + ': shortened or uneven action buttons');
                if (Math.abs(a.y - b.y) > 1 || a.right > b.x + 1) errors.push(name + ': Continue and Restart are not in separate columns of one row');
                if (bounds.x < 27 || bounds.right > innerWidth - 27 || bounds.y < 11 || bounds.bottom > innerHeight - 11) errors.push(name + ': card outside safe area');
                if (card.scrollWidth > card.clientWidth + 1 || card.scrollHeight > card.clientHeight + 1) errors.push(name + ': card content clipped ' + [card.scrollWidth, card.clientWidth, card.scrollHeight, card.clientHeight] + ' ' + [...card.children].filter(e => rect(e).height).map(e => e.className + ':' + rect(e).width + 'x' + rect(e).height).join(','));
                for (const button of card.querySelectorAll('button')) {
                    const box = rect(button); if (!box.height) continue;
                    if (box.x < bounds.x - 1 || box.right > bounds.right + 1 || box.y < bounds.y - 1 || box.bottom > bounds.bottom + 1) errors.push(name + ': action outside card');
                    const range = document.createRange(); range.selectNodeContents(button); const text = range.getBoundingClientRect();
                    if (text.width && (text.left < box.x - 1 || text.right > box.right + 1 || text.bottom > box.bottom + 1)) errors.push(name + ': clipped label ' + button.textContent.trim());
                }
                if (decisions) {
                    const event = rect(card.querySelector('.camp-event')), challenge = rect(card.querySelector('.camp-challenge'));
                    if (Math.abs(event.x - challenge.x) > 1 || Math.abs(event.width - challenge.width) > 1 || event.bottom > challenge.y + 1) errors.push(name + ': decision cards are not stacked full-width');
                }
                results.push({ name, columns:getComputedStyle(card).gridTemplateColumns, primary:a, secondary:b,
                    font:getComputedStyle(primary).fontSize, event:decisions ? rect(card.querySelector('.camp-event')) : null,
                    challenge:decisions ? rect(card.querySelector('.camp-challenge')) : null });
            }
            root.dataset.gameEdition = 'demo'; root.dataset.gameMode = 'campaign'; root.dataset.gameStatus = 'camp';
            card.querySelector('[data-camp-event]').hidden = true;
            card.querySelector('[data-camp-challenge]').hidden = true;
            card.querySelector('[data-action="restart"]').hidden = true;
            card.querySelector('[data-action="endless"]').hidden = true;
            card.querySelector('[data-action="start"]').textContent = 'Play the demo again';
            card.querySelector('[data-overlay-title]').textContent = 'Your journey has just begun.';
            card.querySelector('.run-build-details').open = true;
            const demo = card.querySelector('[data-demo-complete]'); demo.hidden = false;
            const stores = [...demo.querySelectorAll('a')];
            const expectedStores = [
                'https://madbone916.itch.io/path-of-boredom/donate',
                'https://apps.apple.com/ro/app/path-of-boredom/id6823944275',
                'https://play.google.com/store/apps/details?id=com.madbone.pathofboredom'
            ];
            if (stores.length !== 3) errors.push('demo: missing store buttons');
            for (let i = 0; i < stores.length; i++) {
                const link = stores[i], bounds = rect(link), panel = rect(demo);
                if (link.href !== expectedStores[i] || link.target !== '_blank' || !link.relList.contains('noopener') || !link.relList.contains('noreferrer')) errors.push('demo: incorrect URL or unsafe new-tab behavior');
                if (bounds.height < 44 || bounds.x < panel.x || bounds.right > panel.right || bounds.bottom > panel.bottom || bounds.bottom > innerHeight - 11) errors.push('demo: store button clipped or off-screen');
                const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
                if (hit?.closest('a') !== link) errors.push('demo: store button covered by another element');
                for (const label of link.querySelectorAll('.demo-store-copy small, .demo-store-copy strong')) {
                    const range = document.createRange(); range.selectNodeContents(label); const text = range.getBoundingClientRect();
                    if (text.left < bounds.x || text.right > bounds.right || text.bottom > bounds.bottom) errors.push('demo: store button label clipped');
                }
            }
            if (card.scrollHeight > card.clientHeight + 1) errors.push('demo: completion content overflows the card ' + card.scrollHeight + '/' + card.clientHeight);
            document.body.innerHTML = '<pre id="results"></pre>';
            document.querySelector('#results').textContent = JSON.stringify({errors,results});
            </script></body></html>`;
    };
    const server = http.createServer((request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end(html(request.url.slice(1)));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        for (const [width, height] of [[640, 360], [740, 360], [844, 390], [932, 430], [1280, 720], [420, 800]]) {
            let baseline;
            for (const host of ['mobile', 'itch-touch', 'itch-desktop']) {
                const dom = await dumpBrowserDom(edge, [`--window-size=${width + 24},${height + 92}`, '--force-device-scale-factor=1', '--hide-scrollbars', `http://127.0.0.1:${server.address().port}/${host}`]);
                const raw = dom.match(/<pre id="results">([\s\S]*?)<\/pre>/)?.[1];
                assert.ok(raw, `${host} ${width}x${height}: browser finished measuring`);
                const result = JSON.parse(raw.replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>'));
                assert.deepEqual(result.errors, [], `${host} ${width}x${height}`);
                if (baseline) {
                    for (let i = 0; i < baseline.length; i++) {
                        for (const key of Object.keys(baseline[i])) {
                            const actual = result.results[i][key], expected = baseline[i][key];
                            const message = `${host} ${width}x${height} ${baseline[i].name} ${key}`;
                            if (expected && typeof expected === 'object') {
                                for (const field of Object.keys(expected)) assert.ok(Math.abs(actual[field] - expected[field]) <= 1, `${message}.${field}: ${actual[field]} vs ${expected[field]}`);
                            } else assert.deepEqual(actual, expected, message);
                        }
                    }
                }
                else baseline = result.results;
            }
        }
        console.log('PASS: mobile/Itch intermission parity, demo store links/new-tab targets, readable clickable actions and safe-area fit');
    } finally { await new Promise(resolve => server.close(resolve)); }
}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { dumpBrowserDom } from './browser-dom.mjs';

const read = file => fs.readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const homeCss = read('Path of Boredom.Game/Components/Pages/Home.razor.css').replaceAll('::deep ', '');
const rankingCss = read('Path of Boredom.Game/Components/Pages/Rankings.razor.css');
const accountCss = read('Path of Boredom.Game/Components/CloudAccountMenu.razor.css');
const hosts = ['Itch', 'Web', 'Maui'];
const desktopCss = read('Path of Boredom.Game/wwwroot/css/desktop-shell.css');
for (const host of hosts) {
 const entry = read(host === 'Web' ? 'Path of Boredom.Web/Components/App.razor' : `Path of Boredom.${host}/wwwroot/index.html`);
 assert.ok(!entry.includes('document.getElementById("mobile-menu-css").disabled = true'), `${host}: desktop keeps menu CSS`);
 assert.ok(entry.includes('for (const src of window.pobDesktopShell ? ['), `${host}: desktop still loads menu script`);
 assert.ok(entry.includes('css/desktop-shell.css'), `${host}: desktop presentation is linked`);
 assert.ok(entry.includes('classList.add("desktop-shell")'), `${host}: shared menu hook is retained`);
 const menu = read(`Path of Boredom.${host}/wwwroot/js/mobile-menu.js`);
 const attackMode = host === 'Itch' ? 'root.dataset.autoAttack = "on"' : 'root.dataset.autoAttack = window.pobDesktopShell ? "off" : "on"';
 assert.ok(menu.includes(attackMode), `${host}: correct desktop/touch attack mode`);
}
const panelMarkup = `<div class="arpg" data-main-menu="off" data-game-status="ready" data-menu-open="on"><main class="game-shell"><div class="game-grid"><section class="arena-section"><section class="options-panel mm-panel" data-mobile-section="account"><div class="run-options"><section class="account-settings" data-options-section="account"><div class="mm-account-body"><p>Cloud save slots available. Choose a slot to load or save.</p><fieldset><legend>Game account</legend><p>Signed in as MadBone</p><label class="mm-display-name">Player display name<input value="MadBone"></label><small>Use 3–24 letters, numbers, spaces, dots, hyphens or underscores.</small><button>Save player name</button><button>Sign out · keep device save</button></fieldset><fieldset><legend>Device &amp; cloud saves</legend><p>Cloud save available.</p><button>Refresh</button><button>Upload device save</button><button>Use cloud save</button></fieldset><fieldset><legend>Delete account</legend><p>Removes cloud + device saves and rankings. Google account stays.</p><button>Delete game account</button></fieldset></div></section></div><div class="mm-head"><h2>Options</h2><button class="mm-close">Back</button></div><div class="mm-subtabs"><button>Sound</button><button>Controls</button><button>Lore</button><button>Relics</button><button>Account</button></div></section></section></div></main><section class="game-information mm-panel mm-info-panel mm-open" data-mm-panel="rankings"><main class="rankings embedded"><div class="filters"><label>Difficulty<select><option>Easy</option></select></label><button data-rankings-refresh>Refresh</button></div><p class="error">Could not reach the rankings service.</p></main><div class="mm-head"><h2>Hall of Embers</h2><button class="mm-close">Back</button></div></section></div>`;
const checkScript = `
const check = (ok, message) => { if (!ok) throw Error(message); };
const rect = node => node.getBoundingClientRect();
const visible = node => { const r = rect(node); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight + 1 && getComputedStyle(node).visibility !== 'hidden'; };
try {
 const ranking = document.querySelector('.game-information');
 const refresh = ranking.querySelector('button');
 check(visible(ranking), 'rankings panel visible');
 check(visible(refresh), 'ranking filters visible');
 const r = rect(refresh);
 const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
 check(refresh.contains(hit), 'ranking filters covered by ' + hit?.outerHTML.slice(0, 180) + ' at ' + JSON.stringify(r));
 check(visible(ranking.querySelector('.error')), 'ranking service errors visible');
 ranking.classList.remove('mm-open'); ranking.hidden = true;
 const options = document.querySelector('.options-panel'); options.classList.add('mm-open');
 const body = document.querySelector('.mm-account-body'), wrapper = document.querySelector('.run-options');
 const a = rect(body), b = rect(wrapper);
 const desktop = document.body.classList.contains('desktop-shell');
 if (desktop) {
  const section = document.querySelector('.account-settings');
  check(visible(section), 'account scroll region fits viewport');
  check(getComputedStyle(section).overflowY === 'auto', 'short desktops can reach all account actions');
  const button = body.querySelector('fieldset button:last-child');
  button.scrollIntoView({block:'nearest'});
  check(visible(button), 'account actions reachable by scrolling');
  section.scrollTop = wrapper.scrollTop = 0;
 } else check(visible(body), 'account body fits viewport');
 check(a.top - b.top <= 10, 'account content starts at top of tab: ' + (a.top - b.top));
 check(b.bottom - a.bottom <= 10, 'account content fills tab height: ' + (b.bottom - a.bottom));
 const scrollbar = wrapper.offsetWidth - wrapper.clientWidth + document.querySelector('.account-settings').offsetWidth - document.querySelector('.account-settings').clientWidth;
 check(a.left - b.left <= 10 && b.right - a.right <= 10 + scrollbar, 'account fills tab width');
 check(body.scrollWidth <= body.clientWidth, 'account no horizontal overflow');
 if (desktop) {
  body.dataset.signedIn = 'false';
  body.innerHTML = '<p>Sign in for cloud saves and rankings.</p><section class="account-intro"><h3>Keep your ember with you</h3><p>Your device saves still work without an account.</p></section><fieldset><legend>Game account</legend><button>Continue with Google</button><button>Sign in with Apple</button></fieldset>';
  check(rect(body.querySelector('fieldset')).width > body.clientWidth * .4, 'sign-in fills a meaningful part of the panel');
  check(parseFloat(getComputedStyle(body.querySelector('button')).fontSize) >= 14, 'desktop sign-in is readable');
  options.dataset.mobileSection = 'relics';
  wrapper.innerHTML = '<h3 data-options-section="relics">Relic codex</h3><p data-options-section="relics" data-codex-hint>0/6 found this run</p><div data-options-section="relics" data-relic-codex class="ember-camp-codex">' + Array.from({length:6}, () => '<div class="camp-relic"><b>Unknown relic</b><small>Not found this run.</small></div>').join('') + '</div>';
  const cards = [...wrapper.querySelectorAll('.camp-relic')].map(rect);
  check(cards[1].left > cards[0].left && Math.abs(cards[1].top-cards[0].top) < 1, 'relic cards are columns, not a narrow stacked list');
  check(rect(wrapper.querySelector('[data-relic-codex]')).width >= wrapper.clientWidth - 40, 'relic grid fills tab width');
  options.classList.remove('mm-open');
  const forge = document.createElement('section');
  forge.className = 'forge-panel mm-panel mm-open';
  forge.innerHTML = '<div class="mm-head"><h2>Forge</h2></div><div class="mm-subtabs"><button>Upgrades</button></div><div class="forge-grid">' + ['Sunsteel edge', 'Arcane bloom upgrades'].map(name => '<button><img class="forge-card-art" alt=""><strong>' + name + '</strong><span>Damage and recovery</span><small>Rank 1 / 8</small><span data-upgrade-preview>Next rank improves damage</span></button>').join('') + '</div>';
  document.querySelector('.arpg').appendChild(forge);
  for (const card of forge.querySelectorAll('.forge-grid button')) {
   const art = rect(card.querySelector('img')), title = rect(card.querySelector('strong'));
   check(art.bottom <= title.top, 'Forge icon never intrudes into title');
   check(card.scrollWidth <= card.clientWidth, 'Forge card text stays in bounds');
  }
 }
 document.body.dataset.result = 'PASS';
} catch (error) { document.body.dataset.result = error.message; }
`;
const server = http.createServer((req, res) => {
 const url = new URL(req.url, 'http://localhost');
 const [host, mode] = url.pathname.slice(1).split('/');
 if (!hosts.includes(host)) { res.end(); return; }
 if (url.searchParams.has('size')) {
  const [width, height] = url.searchParams.get('size').split(',').map(Number);
  res.setHeader('Content-Type', 'text/html');
  res.end(`<html><body><iframe width="${width}" height="${height}" style="border:0" src="/${host}/${mode}" onload="document.body.dataset.result=this.contentDocument.body.dataset.result"></iframe></body></html>`);
  return;
 }
 const shell = read(`Path of Boredom.${host}/wwwroot/css/mobile-shell.css`);
 const menu = read(`Path of Boredom.${host}/wwwroot/css/mobile-menu.css`);
 res.setHeader('Content-Type', 'text/html');
 res.end(`<html><head><meta charset="utf-8"><style>html,body{margin:0}*{box-sizing:border-box}${homeCss}${rankingCss}${accountCss}${mode === 'desktop' ? '' : shell}${menu}${desktopCss}</style></head><body class="mobile-shell ${mode === 'desktop' ? 'desktop-shell' : ''}">${panelMarkup}<script>${checkScript}</script></body></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
 for (const host of hosts) {
  for (const [mode, size] of [['mobile', '844,390'], ['mobile', '1280,800'], ['desktop', '1280,800'], ['desktop', '1920,1080'], ['desktop', '844,390']]) {
   const output = await dumpBrowserDom('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--window-size=1500,1200', '--virtual-time-budget=1000', `http://127.0.0.1:${server.address().port}/${host}/${mode}?size=${size}`]);
   assert.equal(output.match(/data-result="([^"]*)"/)?.[1], 'PASS', `${host} ${mode} ${size}`);
  }
 }
 console.log('PASS: Rankings visibility and Account tab fill with the complete game shell on all hosts');
} finally { await new Promise(resolve => server.close(resolve)); }

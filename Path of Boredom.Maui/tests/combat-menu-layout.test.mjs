import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { dumpBrowserDom } from './browser-dom.mjs';
const css = fs.readFileSync(new URL('../wwwroot/css/mobile-menu.css', import.meta.url), 'utf8').replace('@media (pointer: coarse)', '@media all');
const shellCss = fs.readFileSync(new URL('../wwwroot/css/mobile-shell.css', import.meta.url), 'utf8').replace('@media (pointer: coarse)', '@media all');
const script = fs.readFileSync(new URL('../wwwroot/js/mobile-menu.js', import.meta.url), 'utf8');
assert.ok(script.includes("lore.dataset.mobileLore = ''"), 'lore is available inside Pause');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
assert.ok(fs.existsSync(edge), 'Edge is required for this layout check');
const html = `<html><head><style>html,body{margin:0}*{box-sizing:border-box}${shellCss}${css}.arpg{position:relative}</style></head><body class="mobile-shell"><div class="arpg" data-game-status="playing"><button class="main-menu-return">Menu</button><button class="campaign-lore-return">Chapter lore</button><div class="skill-bar"><button data-skill="dodge">Dodge</button><button data-skill="potion">Flask</button></div><div class="mm-layer"><div class="mm-bar"><button class="mm-tab">Skills</button><button class="mm-tab">Forge</button><button class="mm-tab mm-pause-tab">Pause</button></div></div></div><script>
try {
 const check=(ok,message)=>{if(!ok)throw Error(message)};
 const root=document.querySelector('.arpg'), layer=document.querySelector('.mm-layer'), bar=document.querySelector('.mm-bar'), pause=document.querySelector('.mm-pause-tab');
 for(const [w,h] of [[320,480],[360,640],[430,932],[480,320],[640,360],[800,1280],[1024,768]]) {
  layer.style.width=w+'px'; layer.style.height=h+'px';
  root.style.width=w+'px'; root.style.height=h+'px';
  const flaskBottom=66, healthLeft=14;
  pause.style.setProperty('--pause-hud-top',(flaskBottom+6)+'px');
  pause.style.setProperty('--pause-hud-left',healthLeft+'px');
  bar.style.setProperty('--menu-shortcuts-top','52px');
  const a=pause.getBoundingClientRect();
  check(Math.abs(a.top-flaskBottom-6)<1,'pause clears flask row by six pixels');
  check(Math.abs(a.left-healthLeft)<1,'pause aligns with health bar');
  check(a.width===48 && a.height===44,'compact pause target');
  check(a.left>=0 && a.top>=0 && a.right<=w && a.bottom<=h,'pause fits');
  for(const side of ['left','right']) {
   root.dataset.buttonSide=side;
   const buttons=[...root.querySelectorAll('.skill-bar button')].map(button=>button.getBoundingClientRect());
   check(Math.abs(buttons[0].top-buttons[1].top)<1,'Dodge and Flask stay side by side');
   for(const b of buttons) {
    check(b.width===72 && b.height===72,'larger combat touch targets');
    check(b.left>=0 && b.right<=w && b.top>=0 && b.bottom<=h,'combat controls fit playfield');
    check(a.right<=b.left || b.right<=a.left || a.bottom<=b.top || b.bottom<=a.top,'combat controls do not overlap Pause');
   }
  }
  check(getComputedStyle(document.querySelector('.campaign-lore-return')).display==='none','no combat lore shortcut');
  check(getComputedStyle(document.querySelector('.main-menu-return')).display==='none','no duplicate menu during combat');
  for(const tab of bar.querySelectorAll('.mm-tab:not(.mm-pause-tab)')) {
   const b=tab.getBoundingClientRect();
   check(a.right<=b.left || b.right<=a.left || a.bottom<=b.top || b.bottom<=a.top,'pause and notifications must not overlap');
  }
 }
 document.body.dataset.result='PASS';
} catch(error) { document.body.dataset.result=error.message; }
</script></body></html>`;
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
 const output=await dumpBrowserDom(edge,['--window-size=1400,1400','--virtual-time-budget=1000',`http://127.0.0.1:${server.address().port}/`]);
 assert.equal(output.match(/data-result="([^"]*)"/)?.[1],'PASS');
 console.log('PASS: Pause aligned below health/flask HUD, compact target, no floating lore/duplicate menu and no notification overlap at seven phone/tablet sizes');
} finally {await new Promise(resolve=>server.close(resolve));}

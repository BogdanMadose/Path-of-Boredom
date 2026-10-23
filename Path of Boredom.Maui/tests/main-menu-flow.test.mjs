import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { dumpBrowserDom } from './browser-dom.mjs';
const source = fs.readFileSync(new URL('../wwwroot/js/mobile-menu.js', import.meta.url), 'utf8');
const home = fs.readFileSync(new URL('../../Path of Boredom.Game/Components/Pages/Home.razor', import.meta.url), 'utf8');
const base = fs.readFileSync(new URL('../../Path of Boredom.Game/Components/Pages/Home.razor.css', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../wwwroot/css/mobile-menu.css', import.meta.url), 'utf8').replace('@media (pointer: coarse)', '@media all');
const markup = home.slice(home.indexOf('<section class="main-menu"'), home.indexOf('<section class="campaign-lore"'));
const actions = source.slice(source.indexOf('    function addSaveActions('), source.indexOf('    function buildAccount('));
const construction = source.slice(source.indexOf('        var mainCard ='), source.indexOf('        buildBar();'));
const saveSync = source.slice(source.indexOf('        Array.prototype.forEach.call(root.querySelectorAll("[data-mobile-save-action]")'), source.indexOf('        var saveStatus ='));
const panelSync = source.slice(source.indexOf("        Array.prototype.forEach.call(root.querySelectorAll('[data-main-panel]')"), source.indexOf('        Array.prototype.forEach.call(layer.querySelectorAll(".mm-tab")'));
const html = `<html><head><style>html,body{margin:0}*{box-sizing:border-box}[hidden]{display:none!important}${base}${css}</style></head><body class="mobile-shell"><div class="arpg" data-game-status="ready" data-main-menu="on">${markup}<div class="mm-layer"><div class="mm-bar"><button class="mm-tab">Skills</button><button class="mm-tab">Forge</button><button class="mm-tab mm-pause-tab">Pause</button></div></div><button hidden data-action="save"></button><button hidden data-action="load"></button></div><script>
const root=document.querySelector('.arpg');
function el(tag,className,text){const node=document.createElement(tag);node.className=className||'';if(text!=null)node.textContent=text;return node;}
function openPanel(){}
let sync;
try {
${actions}
${construction}
sync=function(){${saveSync}${panelSync}};
 const check=(ok,message)=>{if(!ok)throw Error(message)};
 const card=root.querySelector('.main-menu-card');
 sync();
 const buttons=[...card.querySelectorAll('button')].filter(b=>!b.hidden);
 check(!buttons.some(b=>b.dataset.mobileSaveAction==='save'),'no Save before a run');
 check(!buttons.some(b=>['skills','forge'].includes(b.dataset.mainPanel)),'no character management before a run');
 check(buttons.some(b=>b.dataset.mainPanel==='rankings'&&!b.disabled),'Rankings available initially');
 check(buttons.filter(b=>b.hasAttribute('data-main-load')||b.dataset.mobileSaveAction==='load').length===1,'exactly one Load');
 root.dataset.gameStatus='paused';sync();
 check(!card.querySelector('[data-mobile-save-action="save"]').hidden,'Save available with a run');
 for(const name of ['skills','forge'])check(!card.querySelector('[data-main-panel="'+name+'"]').hidden,'run tools available');
 check(!card.querySelector('[data-main-panel="challenges"]'),'challenges are chosen in setup, not the main menu');
 for(const status of ['ready','setup','choosing','dead','won','paused']){
  root.dataset.gameStatus=status;root.dataset.mainMenu='off';
  check(getComputedStyle(root.querySelector('.main-menu-return')).display==='none','no floating Main menu in '+status);
  check(getComputedStyle(root.querySelector('.mm-bar')).display==='none','no floating shortcuts in '+status);
 }
 root.dataset.gameStatus='playing';
 for(const panel of ['account','options','rankings','pause']){
  root.dataset.menuOpen='on';document.body.classList.add('mm-panel-open');
  check(getComputedStyle(root.querySelector('.mm-bar')).display==='none','no shortcuts over '+panel);
  check(getComputedStyle(root.querySelector('.main-menu-return')).display==='none','no Main menu over '+panel);
 }
 document.body.dataset.result='PASS';
}catch(error){document.body.dataset.result=error.message;}
</script></body></html>`;
const pageScript = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
try { new Function(pageScript); } catch (error) { assert.fail('Generated page script is invalid: ' + error.message); }
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 const output=await dumpBrowserDom('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--window-size=430,932','--virtual-time-budget=1000',`http://127.0.0.1:${server.address().port}/`]);
 assert.equal(output.match(/data-result="([^"]*)"/)?.[1],'PASS',String(output.match(/<body[^>]*>/)?.[0]));
 console.log('PASS: initial menu contents, single Load, Quit last visually, run-only actions and no floating controls in submenus/setup/card selection');
}finally{await new Promise(resolve=>server.close(resolve));}

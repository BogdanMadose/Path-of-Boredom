import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dumpBrowserDom } from './browser-dom.mjs';
const modules = fileURLToPath(new URL('../../Path of Boredom.Game/wwwroot/js/', import.meta.url));
const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
const engine = read('../../Path of Boredom.Game/wwwroot/js/arpg.js');
const menu = read('../wwwroot/js/mobile-menu.js');
const align = menu.slice(menu.indexOf("        var bar = layer.querySelector('.mm-bar');"), menu.indexOf('        Array.prototype.forEach.call(root.querySelectorAll("[data-mobile-save-action]"'));
const warning = engine.slice(engine.indexOf('        if (critical && mobileHud) {'), engine.indexOf('        for (const button of skillButtons)', engine.indexOf('        if (critical && mobileHud) {')));
assert.ok(engine.includes('cssWidth: canvasCssWidth, cssHeight: canvasCssHeight'), 'render loop passes CSS dimensions');
assert.ok(engine.includes('boss: boss ? { ...boss, name: map.boss, accent: map.accent } : null'), 'render loop supplies the boss');
assert.ok(engine.includes('if (boss && !canvasHud)'), 'legacy boss bar is not drawn twice');
const css = [read('../wwwroot/css/mobile-shell.css'), read('../wwwroot/css/mobile-menu.css'), read('../../Path of Boredom.Game/Components/Pages/Home.razor.css')].join('\n').replaceAll('@media (pointer: coarse)', '@media all');
const html = `<html><head><style>${css}html,body{margin:0}*{box-sizing:border-box}.arpg,.arena-viewport{position:relative;margin:0;padding:0}.arena-viewport canvas{display:block;width:100%;height:100%}</style></head><body class="mobile-shell"><div class="arpg" data-game-status="playing"><div class="arena-viewport"><canvas></canvas><p class="health-warning"></p></div><div class="mm-layer"><div class="mm-bar"><button class="mm-tab">Skills</button><button class="mm-tab">Forge</button><button class="mm-tab mm-pause-tab" data-mm-tab="pause">Pause</button></div></div></div><script type="module">
import {drawHud} from '/js/arpg-hud.js';
import {createState} from '/js/arpg-engine.js';
import {MAPS} from '/js/arpg-campaign.js';
try {
 const check=(ok,message)=>{if(!ok)throw Error(message)};
 const root=document.querySelector('.arpg'),layer=document.querySelector('.mm-layer'),viewport=root.querySelector('.arena-viewport'),canvas=root.querySelector('canvas'),healthWarning=root.querySelector('.health-warning');
 const critical=true,mobileHud=true,state=createState();state.player.health=10;
 const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
 for(const [w,h] of [[320,480],[360,640],[390,844],[430,932],[480,320],[640,360],[800,1280],[1024,768]])for(const dpr of [1,2,3])for(const map of MAPS) {
  root.style.width=viewport.style.width=layer.style.width=w+'px';root.style.height=viewport.style.height=layer.style.height=h+'px';
  canvas.width=w*dpr;canvas.height=h*dpr;
  ${align}
  ${warning}
  for(const message of ['LOW HEALTH — tap flask','LOW HEALTH — no flasks; evade']) {
   healthWarning.textContent=message;
   const pause=root.querySelector('.mm-pause-tab').getBoundingClientRect(),notice=healthWarning.getBoundingClientRect();
   check(pause.left===6&&pause.top===50,'Pause sits at the screen edge under the compact HUD');
   check(!overlaps(pause,notice),'Low-health warning clears Pause');
   check(notice.left>=0&&notice.right<=w&&notice.top>=0&&notice.bottom<=h,'Low-health warning fits');
   check(healthWarning.scrollWidth<=healthWarning.clientWidth,'Warning text is not clipped');
   const native=canvas.getContext('2d'),texts=[];
   native.clearRect(0,0,canvas.width,canvas.height);native.setTransform(dpr* w/1100,0,0,dpr*h/650,0,0);
   const before=native.getTransform();
   const ctx=new Proxy(native,{get(target,key){if(key==='fillText')return(text,x,y,maxWidth)=>{
    const metrics=target.measureText(text),size=Number(target.font.match(/([0-9.]+)px/)[1]);
    const width=Math.min(metrics.width,maxWidth||Infinity),left=target.textAlign==='center'?x-width/2:x;
    const top=target.textBaseline==='middle'?y-size/2:y-size;
    texts.push({text,left,right:left+width,top,bottom:top+size,size});target.fillText(text,x,y,maxWidth);
   };const value=target[key];return typeof value==='function'?value.bind(target):value;},set(target,key,value){target[key]=value;return true;}});
   drawHud(ctx,state,{cssWidth:w,cssHeight:h,maxFlasks:5,boss:{name:map.boss,health:50,maxHealth:100,accent:map.accent}});
   const after=native.getTransform();check(before.a===after.a&&before.d===after.d,'HUD restores world transform');
   const bossBar={left:w*.35,right:w*.65,top:98,bottom:108};
   const controls=[pause,notice,...[...root.querySelectorAll('.mm-tab:not(.mm-pause-tab)')].map(el=>el.getBoundingClientRect())];
   for(const control of controls){check(!overlaps(control,bossBar),'Boss health clears all DOM controls');for(const text of texts)check(!overlaps(control,text),'DOM controls clear HUD text: '+text.text+' at '+w+'x'+h+'; control '+JSON.stringify(control)+'; text '+JSON.stringify(text));}
   for(const text of texts){check(text.left>=0&&text.right<=w&&text.top>=0&&text.bottom<=h,'HUD text fits: '+text.text);check(text.text==='LVL'||text.size>=12,'HUD text uses readable CSS-pixel sizing');}
   for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++)check(!overlaps(texts[i],texts[j]),'HUD text does not overlap');
   check(texts.some(text=>text.top>=64&&text.bottom<=92),'Boss name is beneath level badge');
  }
 }
 document.body.dataset.result='PASS';
}catch(error){document.body.dataset.result=error.message;}
</script></body></html>`;
const server=http.createServer((request,response)=>{
 const url=new URL(request.url,'http://localhost');
 if(url.pathname==='/'){response.setHeader('Content-Type','text/html');response.end(html);return;}
 const name=path.basename(url.pathname),file=path.join(modules,name);
 if(url.pathname!==`/js/${name}`||!name.endsWith('.js')||!fs.existsSync(file)){response.writeHead(404);response.end();return;}
 response.setHeader('Content-Type','text/javascript');response.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
 const output=await dumpBrowserDom('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--window-size=1400,1400','--virtual-time-budget=5000',`http://127.0.0.1:${server.address().port}/`]);
 assert.equal(output.match(/data-result="([^"]*)"/)?.[1],'PASS');
 console.log('PASS: combined canvas/DOM HUD at eight viewport sizes, three pixel densities, six boss names and both low-health states; readable text, restored transforms, no overlaps or clipped warnings');
}finally{await new Promise(resolve=>server.close(resolve));}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dumpBrowserDom } from './browser-dom.mjs';
const modules = fileURLToPath(new URL('../../Path of Boredom.Game/wwwroot/js/', import.meta.url));
const html = `<html><body><canvas width="180" height="180"></canvas><script type="module">
import { drawBoss } from '/js/arpg-bosses.js';
import { MAPS } from '/js/arpg-campaign.js';
try {
 const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
 const check=(ok,message)=>{if(!ok)throw Error(message)};
 for(const map of MAPS)for(const reduced of [false,true])for(const phase of ['idle','windup','strike']) {
  ctx.clearRect(0,0,180,180);ctx.save();ctx.translate(90,90);
  drawBoss(ctx,{radius:32,flash:0,moving:phase==='idle',stridePhase:1,winding:phase==='windup'?0.3:0,swing:phase==='strike'?0.15:0},map,2,reduced);
  ctx.restore();
  const transform=ctx.getTransform();check(transform.a===1&&transform.d===1&&transform.e===0&&transform.f===0,'canvas transforms must be restored');
  const pixels=ctx.getImageData(0,0,180,180).data,colors=new Set();let occupied=0,edge=0;
  for(let y=0;y<180;y++)for(let x=0;x<180;x++){
   const i=(y*180+x)*4;
   if(pixels[i+3]>0){occupied++;if(x<3||y<3||x>176||y>176)edge++;}
   if(pixels[i+3]>200)colors.add(pixels[i]+','+pixels[i+1]+','+pixels[i+2]);
  }
  check(occupied>500,map.id+' has a visible silhouette');
  check(colors.size>50,map.id+' has shaded surfaces, not flat blocks');
  check(edge===0,map.id+' artwork stays within its bounded footprint');
 }
 document.body.dataset.result='PASS';
}catch(error){document.body.dataset.result=error.message;}
</script></body></html>`;
const server = http.createServer((request,response)=>{
 const url=new URL(request.url,'http://localhost');
 if(url.pathname==='/'){response.setHeader('Content-Type','text/html');response.end(html);return;}
 const name=path.basename(url.pathname);
 if(url.pathname!==`/js/${name}`||!name.endsWith('.js')){response.writeHead(404);response.end();return;}
 const file=path.join(modules,name);
 if(!fs.existsSync(file)){response.writeHead(404);response.end();return;}
 response.setHeader('Content-Type','text/javascript');response.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 const output=await dumpBrowserDom('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--virtual-time-budget=3000',`http://127.0.0.1:${server.address().port}/`]);
 assert.equal(output.match(/data-result="([^"]*)"/)?.[1],'PASS');
 console.log('PASS: actual canvas rendering of six shaded boss silhouettes across idle/windup/strike and reduced motion, bounded artwork and restored transforms');
}finally{await new Promise(resolve=>server.close(resolve));}

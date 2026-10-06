import { cp, mkdir, writeFile } from 'node:fs/promises';
import { browserHarness } from './browser-harness.mjs';
const root = '.browser-tests/ocr-experiment-extension';
await mkdir(root, { recursive: true });
await cp('extension', root, { recursive: true });
await writeFile(`${root}/ocr-probe.js`, `
import { createOcrSession } from './lib/ocr/service.js';
self.onmessage = async ({data}) => {
 const canvas = new OffscreenCanvas(1200, 240), ctx = canvas.getContext('2d');
 ctx.fillStyle = 'white'; ctx.fillRect(0,0,1200,240); ctx.fillStyle='black'; ctx.font='54px Arial';
 ctx.direction = data.language === 'ar' ? 'rtl' : 'ltr'; ctx.textAlign = data.language === 'ar' ? 'right' : 'left';
 ctx.fillText(data.text, data.language === 'ar' ? 1150 : 40, 130);
 const session = createOcrSession({options:{ocrLanguage:data.language},report:stage=>self.postMessage({stage})});
 const start=performance.now();
 try { const result=await session.recognize(canvas); self.postMessage({result,ms:performance.now()-start}); }
 catch(e) {self.postMessage({error:e.stack});} finally {await session.close();}
};`);
const browser = await browserHarness(root);
try {
 const {session}=await browser.open();
 const results=[];
 let index = 0;
 await browser.command('Network.enable', {}, session);
 for(const [language,text] of [['en','Local document conversion 2026'],['en','Local document conversion 2026'],['ar','مرحبا بكم في الرياض']]) {
   await browser.command('Network.emulateNetworkConditions', {offline:index++ === 1,latency:0,downloadThroughput:-1,uploadThroughput:-1}, session);
   const result=await browser.evaluate(session, `new Promise(resolve=>{const worker=new Worker('./ocr-probe.js',{type:'module'});worker.onmessage=({data})=>{if(data.result||data.error){worker.terminate();resolve(data);}};worker.onerror=e=>resolve({error:e.message});worker.postMessage(${JSON.stringify({language,text})});})`);
   console.log(JSON.stringify({language,text,...result})); results.push({language,text,...result});
 }
 await writeFile('.browser-tests/ocr-experiment.json', JSON.stringify(results,null,2));
 if(results.some(result=>result.error||!result.result.text)) throw new Error('OCR experiment failed');
} finally {browser.close();}

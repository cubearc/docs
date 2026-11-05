import { manualExecution, loadCoreExample } from './workspace.mjs';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const dist=resolve(new URL('../../dist',import.meta.url).pathname);
const src=resolve(new URL('../../src',import.meta.url).pathname);
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.woff2':'font/woff2'};

/** Actual packaged worker/Wasm. Optional source overrides isolate a pending UI
 * change without mutating the shared dist while another browser suite runs. */
export async function instrumentBrowser(t,{sourceFiles=[]}={}) {
 const server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(!path.startsWith('/docs/playground/'))return res.writeHead(404).end();
  const relative=path.slice('/docs/playground/'.length)||'index.html';
  const root=sourceFiles.includes(relative)?src:dist;
  const file=resolve(root,relative);
  if(!file.startsWith(root+'/'))return res.writeHead(404).end();
  try{const body=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream'}).end(body);}catch{res.writeHead(404).end();}
 });
 server.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 t.after(()=>{server.closeAllConnections();server.close();});
 const engine=process.env.BROWSER_ENGINE??'chromium';
 const browser=await require(process.env.PLAYWRIGHT_MODULE??'playwright')[engine].launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>{window.instrumentCalls=0;const send=Worker.prototype.postMessage;Worker.prototype.postMessage=function(message,...args){if(['execute','runRecipe'].includes(message.method))window.instrumentCalls++;return send.call(this,message,...args);};});
 const errors=[];
 const base=`http://127.0.0.1:${server.address().port}/docs/playground/`;
 t.after(()=>assert.deepEqual(errors,[],'No browser errors.'));
 async function open(id,kind,version=1){const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(base+`#/tools/${id}/${version}`);await manualExecution(page);await ready(page,kind);await loadCoreExample(page);await page.getByText('Core example loaded.',{exact:true}).waitFor();await ready(page,kind);return page;}
 return {open,context,browser,base};
}
async function ready(page,kind){await page.waitForFunction(kind=>{const view=document.querySelector(`[data-instrument="${kind}"]`);return view&&!view.textContent.includes('Loading this instrument');},kind);}

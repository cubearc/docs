import {navigateActivity} from './workspace.mjs';
import assert from 'node:assert/strict';

/** Real SDK/Wasm; virtual time controls only debounce and navigation. */
export async function verifyAutomaticSelection(context,origin){
 const page=await context.newPage();let clock=false;
 try{
  await page.addInitScript(()=>{window.autoRequests=0;const send=Worker.prototype.postMessage;Worker.prototype.postMessage=function(message,...args){if(['execute','runRecipe'].includes(message.method))window.autoRequests++;return send.call(this,message,...args);};});
  await page.goto(`${origin}/docs/playground/`);
  await page.getByRole('heading',{name:'Multidecoder',exact:true}).waitFor({timeout:45000});
  await page.getByRole('button',{name:'Encode',exact:true}).click();await page.locator('#playground-input').fill('A');
  await page.waitForFunction(()=>document.querySelector('[aria-label="Encode Base64 contents"]')?.textContent==='QQ==');
  await page.waitForFunction(()=>!document.querySelector('#run-tools').disabled);
  await page.clock.install();clock=true;await page.clock.pauseAt(new Date(Date.now()+1000));
  await page.locator('#playground-input').fill('B');await page.clock.runFor(1000);
  await page.waitForFunction(()=>document.querySelector('[aria-label="Encode Base64 contents"]')?.textContent==='Qg==');
  await page.waitForFunction(()=>!document.querySelector('#run-tools').disabled);
  await page.locator('#playground-input').fill('C');await page.getByRole('button',{name:'Stop',exact:true}).click();await page.clock.runFor(1000);
  assert.equal(await page.getByLabel('Encode Base64 contents',{exact:true}).textContent(),'Qg==','Stop revokes the scheduled edit.');
  await page.locator('#playground-input').fill('D');await navigateActivity(page,'All tools');await page.locator('#tool-search').fill('Base64');await page.locator('[data-tool="encoding.base64"]').click();
  await page.locator('#tool-action').selectOption('encoding.base64.decode');await page.clock.runFor(1000);
  await page.locator('.execution-errors').waitFor();
  assert.equal(await page.locator('[data-result-operation="encoding.base64.encode"]').count(),0,'Old common-mode work cannot be presented as the selected decoder.');
  await page.locator('#tool-action').selectOption('encoding.base64.encode');await page.locator('#playground-input').fill('E');
  await navigateActivity(page,'Pipelines');await page.getByRole('button',{name:'New pipeline',exact:true}).click();await page.locator('#pipeline-input').fill('A');
  await page.locator('#add-step').selectOption('cipher.rot13');await page.getByRole('button',{name:'Add selected step',exact:true}).click();await page.locator('#run-pipeline').click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Pipeline result contents"]')?.textContent==='N');
  const calls=await page.evaluate(()=>window.autoRequests);await page.clock.runFor(1000);
  assert.equal(await page.evaluate(()=>window.autoRequests),calls,'Leaving Playground revokes its pending edit without scheduling background comparisons.');
  await navigateActivity(page,'Playground');await page.clock.runFor(1000);
  await page.waitForFunction(()=>document.querySelector('[aria-label="Encode Base64 contents"]')?.textContent==='RQ==');
 }finally{if(clock)await page.clock.resume();await page.close();}
}

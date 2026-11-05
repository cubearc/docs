import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {instrumentBrowser} from './support/instrument-browser.mjs';
const require=createRequire(import.meta.url);
const output=(page,id)=>page.locator(`[data-result-operation="${id}"] .viewer pre`).first();
async function current(page,id,text){
 try {await page.waitForFunction(({id,text})=>document.querySelector('#results-section')?.dataset.state==='current'&&document.querySelector(`[data-result-operation="${id}"][data-result-current="true"] .viewer pre`)?.textContent===text,{id,text});}
 catch(error){throw new Error(`${error.message}\nWorkspace state: ${await page.locator('#input-section').innerText()}\nResult state: ${await page.locator('#results-section').getAttribute('data-state')}`,{cause:error});}
 await page.waitForFunction(()=>document.querySelector('#run-tools')&&!document.querySelector('#run-tools').disabled);
}
async function select(page,key,query){
 if(await page.locator('#toggle-tools').isVisible())await page.locator('#toggle-tools').click();
 await page.locator('#tool-search').fill(query);
 await page.locator(`[data-tool="${key}"]`).click();
 await page.waitForFunction(key=>[...document.querySelectorAll('#tool-sidebar [data-family]')].some(node=>node.dataset.family===key&&node.getAttribute('aria-current')==='page'),key);
}
async function capture(page,label){
 if(!process.env.PLAYGROUND_EVIDENCE)return;
 await mkdir(process.env.PLAYGROUND_EVIDENCE,{recursive:true});
 for(const width of [1440,360]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${label} ${width} reflows`);await page.screenshot({path:`${process.env.PLAYGROUND_EVIDENCE}/${label}-${width}.png`,fullPage:true});}
 await page.setViewportSize({width:1440,height:1000});
}

test('persistent navigation, first-use automatic results, pins, configuration and reversible continuation',{timeout:120000},async t=>{
 const {context,base}=await instrumentBrowser(t);const page=await context.newPage();
 await page.goto(base);await page.getByRole('heading',{name:'Multidecoder',exact:true}).waitFor({timeout:45000});
 const sidebar=await page.locator('#tool-sidebar').elementHandle();
 await select(page,'encoding.base64','Base64');
 assert.match(page.url(),/#\/tools\/encoding.base64.decode\/1$/);
 assert.equal(await page.getByRole('button',{name:'Use tool',exact:true}).count(),0);
 assert.equal(await page.getByLabel('Automatic updates',{exact:true}).isChecked(),true);
 await page.locator('#playground-input').fill('SGVsbG8sIEN1YmUh');
 await current(page,'encoding.base64.decode','Hello, Cube!');
 const inputBox=await page.locator('#input-section').boundingBox(),resultBox=await page.locator('#results-section').boundingBox();
 assert.ok(inputBox.x<resultBox.x&&Math.abs(inputBox.y-resultBox.y)<30,'Desktop input and result sit beside each other, below the action row');
 assert.equal(await page.locator('#playground-input').evaluate(node=>node===document.activeElement),true,'automatic output does not steal input focus');
 assert.equal(await page.evaluate(sidebar=>sidebar===document.querySelector('#tool-sidebar'),sidebar),true);
 await page.locator('#playground-input').fill('SW5zcGVjdA==');
 await page.locator('[data-result-operation="encoding.base64.decode"] button[id$="-copy"]').focus();
 await current(page,'encoding.base64.decode','Inspect');
 assert.match(await page.evaluate(()=>document.activeElement.id),/-copy$/,'live results preserve focus on the output action');
 await page.locator('[data-result-operation="encoding.base64.decode"] summary[id$="-export-toggle"]').click();
 await page.locator('#playground-input').fill('SGVsbG8sIEN1YmUh');await current(page,'encoding.base64.decode','Hello, Cube!');
 assert.equal(await page.locator('[data-result-operation="encoding.base64.decode"] details[id$="-export"]').evaluate(node=>node.open),true,'export disclosure remains open across live recomputation');
 await page.locator('[data-result-operation="encoding.base64.decode"] summary[id$="-export-toggle"]').click();
 await page.locator('#tool-search').fill('');
 await capture(page,'base64-live');
 const card=page.locator('[data-result-operation="encoding.base64.decode"]');
 await card.getByText('Used settings',{exact:true}).click();
 const [receipt]=await Promise.all([page.waitForEvent('download'),card.getByRole('button',{name:'Download run details (includes input and settings)',exact:true}).click()]);
 const details=JSON.parse(await readFile(await receipt.path(),'utf8'));
 assert.equal(details.operation,'encoding.base64.decode');assert.equal(details.input.data,'SGVsbG8sIEN1YmUh');
 assert.equal(details.primary_input_name,'input');assert.equal(details.selected_output,'output');
 assert.ok(details.producing_build.sourceSha256);await card.getByText('Used settings',{exact:true}).click();
 await page.locator('[data-result-operation="encoding.base64.decode"] button[id$="-pin"]').click();
 for(let i=0;i<12;i++){await page.locator('#playground-input').fill(Buffer.from(`edit ${i}`).toString('base64'));await current(page,'encoding.base64.decode',`edit ${i}`);}
 assert.equal(await page.getByText('Previous rounds and original input (1)',{exact:true}).count(),1,'typing uses no retained slots');
 await page.locator('#result-filter-pinned').click();assert.equal(await output(page,'encoding.base64.decode').textContent(),'Hello, Cube!');
 await page.locator('#result-filter-all').click();
 await page.locator('#tool-action').selectOption('encoding.base64.encode');
 await page.locator('#playground-input').fill('雪\r\n');
 // DOM text controls normalize CRLF to LF, while file bytes below remain exact.
 await current(page,'encoding.base64.encode',Buffer.from('雪\n').toString('base64'));
 await select(page,'cipher.caesar','Caesar cipher');
 await page.locator('#tool-action').selectOption('cipher.caesar.encode');
 await page.locator('#playground-input').fill('ABC');await page.locator('#playground-options-shift').fill('2');
 await current(page,'cipher.caesar.encode','CDE');
 await select(page,'encoding.base64','Base64');assert.equal(await page.locator('#playground-input').inputValue(),'ABC');
 await select(page,'cipher.caesar','Caesar cipher');
 assert.equal(await page.locator('#playground-options-shift').inputValue(),'2');
 assert.equal(await page.locator('#tool-action').inputValue(),'cipher.caesar.encode');
 await current(page,'cipher.caesar.encode','CDE');
 await page.locator('[data-result-operation="cipher.caesar.encode"] button[id$="-continue"]').click();
 await page.getByRole('heading',{name:'Multidecoder',exact:true}).waitFor();
 assert.equal(await page.locator('#playground-input').inputValue(),'CDE');
 await page.getByRole('button',{name:'Restore previous input',exact:true}).click();
 assert.equal(await page.locator('#playground-input').inputValue(),'ABC');
 await select(page,'encoding.base64','Base64');await page.locator('#tool-action').selectOption('encoding.base64.decode');
 await page.locator('#playground-input').fill('!!!');
 await page.locator('.execution-errors').waitFor();assert.equal(await page.locator('[data-result-operation="encoding.base64.decode"]:not(:has(.warning))').count(),0);
 await page.locator('#playground-input').fill('');await current(page,'encoding.base64.decode','');
 await page.locator('#results-section').getByText('Empty output · valid result',{exact:true}).waitFor();
 await capture(page,'empty-valid');
 await page.close();
});

test('secondary inputs, real visual interfaces and deliberate media stay in the same workbench',{timeout:90000},async t=>{
 const {context,base}=await instrumentBrowser(t);const page=await context.newPage();
 await page.goto(base+'#/tools/cipher.book.decode/1');
 await page.getByRole('heading',{name:'Book cipher',exact:true}).waitFor({timeout:45000});
 await page.locator('#instrument-tab-parameters').click();
 await page.locator('#playground-options-source').fill('HIDDEN ECHO LIGHT LANTERN ORBIT');
 await page.locator('#playground-options-scheme').selectOption('word_character');
 await page.locator('#playground-options-index_base').fill('1');
 await page.locator('#playground-input').fill('1:1,2:1,3:1,4:1,5:1');
 await current(page,'cipher.book.decode','HELLO');
 await select(page,'encoding.base64','Base64');
 await select(page,'cipher.book','Book cipher');
 await page.locator('#instrument-tab-parameters').click();
 assert.equal(await page.locator('#playground-options-source').inputValue(),'HIDDEN ECHO LIGHT LANTERN ORBIT');
 assert.equal(await page.locator('#playground-input').inputValue(),'1:1,2:1,3:1,4:1,5:1');
 await select(page,'text.keyboard.remap','keyboard layout');
 await page.locator('[data-instrument="keyboard"]').waitFor();
 await page.locator('#instrument-tab-visual').click();
 assert.equal(await page.getByText('Visual instruments · 20 workbenches',{exact:true}).count(),0);
 await capture(page,'keyboard-navigation');
 await select(page,'audio.spectrum','Measure audio frequencies');
 const calls=await page.evaluate(()=>window.instrumentCalls);
 await page.locator('#playground-input').fill('not PCM');
 await page.waitForTimeout(400);
 assert.equal(await page.evaluate(()=>window.instrumentCalls),calls,'heavy analysis does not execute while editing');
 assert.match(await page.locator('#automatic-status').textContent(),/Run explicitly/);
 await page.locator('#run-tools').click();await page.locator('.execution-errors').waitFor();
 await page.close();
});

test('routes, exact file bytes, sidebar context and narrow keyboard drawer',{timeout:90000},async t=>{
 const {context,base}=await instrumentBrowser(t);const page=await context.newPage();
 await page.goto(base+'#/tools/encoding.base64.encode/1');
 await page.getByRole('heading',{name:'Base64',exact:true}).waitFor({timeout:45000});
 await page.locator('#playground-file').setInputFiles({name:'exact.bin',mimeType:'application/octet-stream',buffer:Buffer.from([0,255,13,10])});
 await current(page,'encoding.base64.encode','AP8NCg==');
 await select(page,'cipher.caesar','Caesar cipher');
 await page.locator('.execution-errors').waitFor();
 await page.locator('#input-section').getByText('4 bytes · bytes',{exact:false}).waitFor();
 await page.goBack();await page.getByRole('heading',{name:'Base64',exact:true}).waitFor();
 await current(page,'encoding.base64.encode','AP8NCg==');
 await page.reload();await page.getByRole('heading',{name:'Base64',exact:true}).waitFor({timeout:45000});
 assert.equal(await page.locator('#tool-action').inputValue(),'encoding.base64.encode');
 assert.equal(await page.locator('#playground-input').inputValue(),'','reload restores navigation without storing private input');
 await page.locator('#tool-search').fill('Base64');await page.locator('#playground-input').fill('A');
 await current(page,'encoding.base64.encode','QQ==');
 await page.setViewportSize({width:360,height:800});
 await page.locator('#toggle-tools').focus();await page.keyboard.press('Enter');
 await page.getByRole('dialog',{name:'Tools',exact:true}).waitFor();
 assert.equal(await page.locator('#tool-search').inputValue(),'Base64');
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#toggle-tools').evaluate(node=>node===document.activeElement),true);
 assert.equal(await page.locator('#playground-input').inputValue(),'A');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const axePath=require.resolve('axe-core/axe.min.js');await page.addScriptTag({path:axePath});
 const audit=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));
 assert.deepEqual(audit.violations.map(x=>({id:x.id,nodes:x.nodes.map(n=>n.target)})),[]);
 if(process.env.PLAYGROUND_A11Y_REPORT)await writeFile(process.env.PLAYGROUND_A11Y_REPORT,JSON.stringify({browser:process.env.BROWSER_ENGINE??'chromium',state:'360px live Base64',violations:audit.violations,incomplete:audit.incomplete},null,2));
 await capture(page,'base64-exact-navigation');await page.close();
});

test('late actual Worker responses cannot replace newer previews or another selected tool',{timeout:60000},async t=>{
 const {context,base}=await instrumentBrowser(t);
 await context.addInitScript(()=>{
  const descriptor=Object.getOwnPropertyDescriptor(Worker.prototype,'onmessage');
  const send=Worker.prototype.postMessage;const targets=new WeakMap();
  Worker.prototype.postMessage=function(message,...args){
   if(message.method==='runRecipe'&&message.args?.[0]?.input?.value?.data==='Zmlyc3Q=')targets.set(this,message.id);
   return send.call(this,message,...args);
  };
  Object.defineProperty(Worker.prototype,'onmessage',{...descriptor,set(listener){
   descriptor.set.call(this,event=>{
    if(targets.get(this)===event.data.id){window.delayedReplies=(window.delayedReplies??0)+1;setTimeout(()=>listener(event),1000);}
    else listener(event);
   });
  }});
 });
 const page=await context.newPage();await page.goto(base+'#/tools/encoding.base64.decode/1');
 await page.locator('#playground-input').waitFor({timeout:45000});
 await page.locator('#playground-input').fill('Zmlyc3Q=');
 await page.waitForFunction(()=>window.delayedReplies===1);
 await page.locator('#playground-input').fill('c2Vjb25k');
 await current(page,'encoding.base64.decode','second');await page.waitForTimeout(1100);
 assert.equal(await output(page,'encoding.base64.decode').textContent(),'second');
 await page.locator('#playground-input').fill('Zmlyc3Q=');
 await page.waitForFunction(()=>window.delayedReplies===2);
 await select(page,'cipher.caesar','Caesar cipher');
 await page.locator('#tool-action').selectOption('cipher.caesar.encode');await page.locator('#playground-options-shift').fill('1');
 await page.locator('#playground-input').fill('ABC');await current(page,'cipher.caesar.encode','BCD');
 await page.waitForTimeout(1100);
 assert.equal(await page.locator('[data-result-operation="encoding.base64.decode"]').count(),0);
 assert.equal(await output(page,'cipher.caesar.encode').textContent(),'BCD');await page.close();
});

test('adding a pipeline step is explicit, preserves parameters and enforces the adapter input type',{timeout:60000},async t=>{
 const {context,base}=await instrumentBrowser(t);const page=await context.newPage();
 await page.goto(base+'#/tools/cipher.caesar.encode/1');
 await page.locator('#playground-options-shift').waitFor({timeout:45000});
 await page.locator('#playground-input').fill('ABC');await page.locator('#playground-options-shift').fill('2');
 await current(page,'cipher.caesar.encode','CDE');
 await page.getByRole('button',{name:'Add to pipeline',exact:true}).click();
 await page.locator('[data-step="0"]').waitFor();
 assert.equal(await page.locator('[data-step]').count(),1);
 assert.equal(await page.locator('[data-step="0"] input').inputValue(),'2');
 assert.equal(await page.locator('#pipeline-input').inputValue(),'','adding a tool never substitutes the separate pipeline input');
 await page.locator('#pipeline-input').fill('ABC');await page.locator('#run-pipeline').click();
 await page.waitForFunction(()=>document.querySelector('[aria-label="Pipeline result contents"]')?.textContent==='CDE');
 await select(page,'encoding.base64','Base64');await page.locator('#tool-action').selectOption('encoding.base64.encode');
 assert.equal(await page.locator('#playground-input').inputValue(),'ABC');
 assert.equal(await page.getByRole('button',{name:'Add to pipeline',exact:true}).isDisabled(),true,'text cannot silently become bytes at the pipeline position');
 assert.match(await page.locator('.workspace-tool-actions').textContent(),/explicit conversion/);
 await select(page,'cipher.enigma','Enigma');
 assert.equal(await page.getByRole('button',{name:'Add to pipeline',exact:true}).count(),0,'a direct executor is not a pipeline adapter');
 await page.locator('#tool-sidebar').getByRole('link',{name:'Pipelines',exact:true}).click();
 assert.equal(await page.locator('[data-step]').count(),1,'selecting tools leaves the pipeline unchanged');
 await page.locator('#add-step').selectOption('text.utf8.encode');await page.getByRole('button',{name:'Add selected step',exact:true}).click();
 await select(page,'encoding.base64','Base64');
 await page.getByRole('button',{name:'Add to pipeline',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-step]').length===3);
 await page.locator('#run-pipeline').click();
 await page.waitForFunction(()=>document.querySelector('[aria-label="Pipeline result contents"]')?.textContent==='Q0RF');
 await capture(page,'pipeline-composition');await page.close();
});

test('named settings survive selection and a delayed file read cannot replace another tool input',{timeout:60000},async t=>{
 const {context,base}=await instrumentBrowser(t);const page=await context.newPage();
 await page.goto(base+'#/tools/cipher.alberti.encode/1');
 await page.getByText('About this tool',{exact:true}).waitFor({timeout:45000});
 const example=(await(await page.request.get(base+'tool-details/cipher.alberti.encode.json')).json()).example;
 await page.locator('#instrument-tab-parameters').click();
 const settings=' '+example.inputs.settings;
 await page.locator('#extra-settings').fill(settings);await page.locator('#playground-input').fill(example.inputs.text);
 await current(page,'cipher.alberti.encode',example.outputs.text);
 await select(page,'encoding.base64','Base64');await select(page,'cipher.alberti.encode','Alberti');
 assert.equal(await page.locator('#extra-settings').inputValue(),settings,'named input remains exact across navigation');
 await page.evaluate(()=>{
  const read=File.prototype.arrayBuffer;
  File.prototype.arrayBuffer=function(){return this.name==='delayed.bin'?new Promise(resolve=>{window.releaseRead=()=>read.call(this).then(resolve);}):read.call(this);};
 });
 await page.locator('#playground-file').setInputFiles({name:'delayed.bin',buffer:Buffer.from([0,255])});
 await page.waitForFunction(()=>Boolean(window.releaseRead));
 await select(page,'encoding.base64','Base64');
 const before=await page.locator('#playground-input').inputValue();await page.evaluate(()=>window.releaseRead());
 assert.equal(await page.locator('#playground-input').inputValue(),before);
 assert.equal(await page.locator('.byte-input').count(),0,'an earlier file cannot retarget the selected tool');
 await page.close();
});


test('visual configuration updates automatically while inspection and rotor execution state stay separate',{timeout:60000},async t=>{
 const {context,base}=await instrumentBrowser(t);const page=await context.newPage();
 await page.goto(base+'#/tools/text.keyboard.remap/1');
 await page.locator('#keyboard-source').waitFor({timeout:45000});
 await page.locator('#keyboard-source').selectOption('qwerty');await page.locator('#keyboard-target').selectOption('qwertz');
 await page.locator('#playground-input').fill('Y');await current(page,'text.keyboard.remap','Z');
 await page.locator('#keyboard-target').selectOption('qwerty');await current(page,'text.keyboard.remap','Y');
 const calls=await page.evaluate(()=>window.instrumentCalls);
 await page.locator('#keyboard-layer').selectOption('shift');await page.locator('#keyboard-source-shift-ansi18').click();
 await page.locator('#instrument-tab-parameters').click();await page.locator('#instrument-tab-visual').click();
 await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.instrumentCalls),calls,'presentation selection and tabs never schedule another operation');
 await select(page,'cipher.enigma','Enigma');await page.getByText('About this tool',{exact:true}).click();await page.locator('#load-core-example').click();
 await current(page,'cipher.enigma','BDZGO');assert.equal(await page.locator('#enigma-window-2').inputValue(),'A');
 assert.match(await page.locator('.mechanism-reading').textContent(),/Final windows: AAF/);
 await page.locator('#playground-input').fill('BBBBB');await page.waitForFunction(()=>document.querySelector('#results-section')?.dataset.state==='current');
 await page.locator('#playground-input').fill('AAAAA');await current(page,'cipher.enigma','BDZGO');
 for(let i=0;i<3;i++)assert.equal(await page.locator(`#enigma-window-${i}`).inputValue(),'A','preview starts at the configured initial state on every recomputation');
 await capture(page,'enigma-live');await page.close();
});


test('an oversized text edit is rejected visibly, preserves accepted input and revokes pending work',{timeout:45000},async t=>{
 const {context,base}=await instrumentBrowser(t);const page=await context.newPage();
 await page.goto(base+'#/tools/encoding.base64.decode/1');await page.locator('#playground-input').waitFor({timeout:45000});
 await page.locator('#playground-input').fill('SGVsbG8=');await current(page,'encoding.base64.decode','Hello');
 const calls=await page.evaluate(()=>window.instrumentCalls);
 await page.locator('#playground-input').fill('雪'.repeat(45000));
 await page.locator('.execution-errors').getByText(/128-KiB/).waitFor();
 assert.equal(await page.locator('#playground-input').inputValue(),'SGVsbG8=');
 assert.equal(await page.locator('[data-result-current="true"]').count(),0);
 await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.instrumentCalls),calls);
 await page.locator('#playground-input').fill('Q3ViZQ==');await current(page,'encoding.base64.decode','Cube');await page.close();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { instrumentBrowser } from './support/instrument-browser.mjs';
import { mkdir } from 'node:fs/promises';

const sourceFiles=process.env.INSTRUMENT_SOURCE==='1'?['instruments/workbench.mjs','instruments/workbench.css']:[];
async function run(page,id,expected){
 await page.locator('#run-tools').click();
 const output=page.locator(`[data-result-operation="${id}"]`).last().locator('.viewer pre');
 await output.waitFor();
 assert.equal(await output.textContent(),expected);
}
async function capture(page,kind){
 if(!process.env.PLAYGROUND_EVIDENCE)return;
 await mkdir(process.env.PLAYGROUND_EVIDENCE,{recursive:true});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${kind} reflows at ${width}`);
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:`${process.env.PLAYGROUND_EVIDENCE}/${kind}-study-${width}.png`,fullPage:true});
 }
}

test('keyboard case and physical-key readout remain inspection until insertion is selected',{timeout:60000},async t=>{
 const {open}=await instrumentBrowser(t,{sourceFiles});
 const page=await open('text.keyboard.remap','keyboard');
 await page.locator('#keyboard-target').selectOption('qwertz');
 await page.locator('#playground-input').fill('Y');
 await run(page,'text.keyboard.remap','Z');
 await page.locator('#keyboard-layer').selectOption('shift');
 const before=await page.evaluate(()=>window.instrumentCalls);
 await page.locator('#keyboard-source-shift-ansi18').focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('#keyboard-correspondence').count(),1,'The instrument exposes the selected physical correspondence');
 assert.equal(await page.locator('#keyboard-correspondence-source').textContent(),'Y');
 assert.equal(await page.locator('#keyboard-correspondence-target').textContent(),'Z');
 assert.equal(await page.locator('.key-layout').first().locator('#keyboard-source').count(),1,'Source layout is controlled on the source instrument');
 assert.equal(await page.locator('#keyboard-target-shift-ansi18').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#playground-input').inputValue(),'Y');
 assert.equal(await page.evaluate(()=>window.instrumentCalls),before);
 await page.locator('#keyboard-mode').selectOption('insert');
 await page.locator('#keyboard-source-shift-ansi18').focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('#playground-input').inputValue(),'YY');
 await page.getByText('This result belongs to earlier input or settings. The instrument retains its producing evidence.',{exact:true}).waitFor();
 await page.locator('#instrument-tab-parameters').click();
 assert.equal(await page.locator('#playground-options-target').inputValue(),'qwertz');
 await page.locator('#instrument-tab-visual').click();
 assert.equal(await page.evaluate(()=>window.instrumentCalls),before);
 await capture(page,'keyboard');
});

test('Polybius inspection shows exact coordinates and keyboard traversal without changing data',{timeout:60000},async t=>{
 const {open}=await instrumentBrowser(t,{sourceFiles});
 const page=await open('cipher.polybius.encode','polybius');
 await page.locator('#playground-input').fill('HI');
 await run(page,'cipher.polybius.encode','2,3 2,4');
 const before=await page.evaluate(()=>window.instrumentCalls);
 await page.locator('#polybius-cell-7').focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('#polybius-selected-symbol').count(),1,'Selected cell has a dedicated readable inspector');
 assert.equal(await page.locator('#polybius-selected-symbol').textContent(),'H');
 assert.equal(await page.locator('#polybius-selected-row').textContent(),'2');
 assert.equal(await page.locator('#polybius-selected-column').textContent(),'3');
 assert.equal(await page.locator('.polybius-square td.axis-highlight').count(),9,'Both selected axes are highlighted');
 await page.keyboard.press('ArrowRight');
 assert.equal(await page.evaluate(()=>document.activeElement?.id),'polybius-cell-8');
 assert.equal(await page.locator('#polybius-selected-symbol').textContent(),'I');
 assert.equal(await page.locator('#playground-input').inputValue(),'HI');
 await page.locator('#polybius-base').selectOption('0');
 assert.equal(await page.locator('#polybius-selected-row').textContent(),'1');
 assert.equal(await page.locator('#polybius-selected-column').textContent(),'3');
 await page.locator('#instrument-tab-parameters').click();
 assert.equal(await page.locator('#playground-options-index_base').inputValue(),'0');
 await page.locator('#instrument-tab-visual').click();
 assert.equal(await page.evaluate(()=>window.instrumentCalls),before);
 await page.locator('#polybius-base').selectOption('1');
 await page.locator('#polybius-cell-7').click();
 await capture(page,'polybius');
});

test('Polybius arrow inspection crosses a virtual row page without editing a custom alphabet',{timeout:60000},async t=>{
 const {open}=await instrumentBrowser(t,{sourceFiles});
 const page=await open('cipher.polybius.encode','polybius');
 const alphabet=Array.from({length:81},(_,index)=>String.fromCodePoint(0x400+index)).join('');
 await page.locator('#polybius-preset').selectOption('custom');
 await page.locator('#polybius-alphabet').fill(alphabet);await page.locator('#polybius-alphabet').press('Tab');
 await page.locator('#polybius-side').fill('9');await page.locator('#polybius-side').press('Tab');
 await page.locator('#instrument-tab-parameters').click();await page.locator('#playground-options-aliases').fill('[]');
 await page.locator('#instrument-tab-visual').click();
 const input=await page.locator('#playground-input').inputValue();
 const before=await page.evaluate(()=>window.instrumentCalls);
 await page.locator('#polybius-cell-71').focus();await page.keyboard.press('ArrowDown');
 assert.equal(await page.evaluate(()=>document.activeElement?.id),'polybius-cell-80');
 assert.equal(await page.locator('#polybius-selected-symbol').textContent(),Array.from(alphabet)[80]);
 assert.equal(await page.locator('#polybius-selected-row').textContent(),'9');
 assert.equal(await page.locator('#polybius-selected-column').textContent(),'9');
 await page.keyboard.press('ArrowUp');
 assert.equal(await page.evaluate(()=>document.activeElement?.id),'polybius-cell-71');
 assert.equal(await page.locator('#polybius-alphabet').inputValue(),alphabet);
 assert.equal(await page.locator('#playground-input').inputValue(),input);
 assert.equal(await page.evaluate(()=>window.instrumentCalls),before);
});

test('Polybius disclosure state survives queued and retired toggle events',{timeout:60000},async t=>{
 const {open}=await instrumentBrowser(t,{sourceFiles});
 const page=await open('cipher.polybius.encode','polybius');
 const panel=page.locator('.polybius-rules');
 const retired=await panel.elementHandle();
 const before=await page.evaluate(()=>window.instrumentCalls);
 await page.evaluate(()=>{
  document.querySelector('.polybius-rules summary').click();
  document.querySelector('#polybius-cell-7').click();
 });
 assert.equal(await panel.getAttribute('open'),'','Opening then inspecting before the native toggle task retains the visible rules.');
 await page.evaluate(()=>{
  document.querySelector('.polybius-rules summary').click();
  document.querySelector('#polybius-cell-8').click();
 });
 assert.equal(await panel.getAttribute('open'),null,'Closing then inspecting retains the closed rules.');
 await page.evaluate(details=>{
  details.dispatchEvent(new Event('toggle'));
  details.querySelector('summary').click();
  details.querySelector('summary').click();
  document.querySelector('#polybius-cell-7').click();
 },retired);
 assert.equal(await panel.getAttribute('open'),null,'Events on retired rules cannot reopen the replacement.');
 assert.equal(await page.evaluate(()=>window.instrumentCalls),before,'Disclosure and cell inspection never execute.');
 await retired.dispose();
});

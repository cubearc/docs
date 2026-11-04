import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const engine = process.env.BROWSER_ENGINE ?? 'chromium';
const browserType = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright')[engine];
const root = resolve(new URL('../dist/', import.meta.url).pathname);
const evidence = process.env.PLAYGROUND_EVIDENCE;
const mime = { '.html':'text/html', '.mjs':'text/javascript', '.js':'text/javascript', '.wasm':'application/wasm', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.woff2':'font/woff2' };

test('five mechanical instruments edit canonical config and inspect real worker/Wasm results', {timeout: 360000}, async t => {
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, path.replace(/^\/docs\/playground\//, '') || 'index.html');
    if (!path.startsWith('/docs/playground/') || !file.startsWith(`${root}/`)) { response.writeHead(404).end(); return; }
    try { const bytes=await readFile(file);response.writeHead(200, {'Content-Type':mime[extname(file)] ?? 'application/octet-stream'}).end(bytes); } catch { response.writeHead(404).end(); }
  });
  server.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {server.once('listening',resolve);server.once('error',reject);});
  t.after(() => {server.closeAllConnections();server.close();});
  const browser = await browserType.launch({headless:true,...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
  t.after(() => browser.close());
  const context = await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce',permissions:engine === 'chromium' ? ['clipboard-read','clipboard-write'] : []});
  await context.addInitScript(() => {
    window.__instrumentCalls = 0;
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(message,...rest) { if (['execute','runRecipe'].includes(message?.method)) window.__instrumentCalls++; return send.call(this,message,...rest); };
  });
  const origin = `http://127.0.0.1:${server.address().port}/docs/playground/`;
  const errors = []; const audits = [];
  if (evidence) await mkdir(evidence,{recursive:true});
  async function open(id,kind,version = 1) {
    const page = await context.newPage(); page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${origin}#/tools/${id}/${version}`);
    await page.getByRole('button',{name:'Use tool',exact:true}).waitFor({timeout:45000});
    await page.getByRole('button',{name:'Use tool',exact:true}).click();
    await page.locator(`[data-instrument="${kind}"] .mechanism`).waitFor({timeout:30000});
    await page.locator('#load-core-example').click();
    await page.getByText('Synthetic Core example loaded. Run to produce your own result.', {exact:true}).waitFor();
    await page.locator(`[data-instrument="${kind}"] .mechanism`).waitFor();
    return page;
  }
  async function run(page,id) {
    const before = await page.locator('.result-card').count();
    await page.locator('#run-tools').click();
    await page.waitForFunction(() => !document.querySelector('#run-tools').disabled,{timeout:30000});
    const card = page.locator(`[data-result-operation="${id}"]`).last();
    await card.waitFor({timeout:30000});
    return card;
  }
  async function textResult(card,name,expected) {
    const picker = card.locator('select[id^="output-"]');
    if (await picker.count()) await picker.selectOption(name);
    const text = card.locator('.viewer pre').first();
    assert.equal(await text.textContent(),expected);
  }
  async function downloadJson(page,card) {
    const exportDetails=card.locator('details').filter({hasText:'Export'}).first();
    if(await exportDetails.getAttribute('open') === null) await card.getByText('Export',{exact:true}).click();
    const [download]=await Promise.all([page.waitForEvent('download'),card.getByRole('button',{name:'Download selected view',exact:true}).click()]);
    return JSON.parse(await readFile(await download.path(),'utf8'));
  }
  async function tabsDoNotRun(page) {
    const before=await page.evaluate(()=>window.__instrumentCalls);
    await page.locator('#instrument-tab-parameters').click();
    await page.locator('#instrument-tab-visual').click();
    assert.equal(await page.evaluate(()=>window.__instrumentCalls),before,'Switching views must not run Core.');
  }
  async function invalidRun(page) {
    await page.locator('#run-tools').click();
    await page.waitForFunction(()=>!document.querySelector('#run-tools').disabled);
    await page.getByText(/Not applicable or needs options \(1\)/).waitFor();
    assert.ok((await page.locator('.instrument-surface > .warning').textContent()).includes('earlier input or settings'),'Invalid edits retain and label the earlier instrument evidence.');
    assert.ok(await page.getByText(/Previous rounds and original input/).count(),'Earlier rounds remain accessible.');
  }
  async function capture(page,kind) {
    await page.locator('#main').focus();
    await page.evaluate(()=>document.fonts.ready);
    for (const width of [1440,1100,834,700,390,320]) {
      await page.setViewportSize({width,height:1000});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),`${kind} reflows at ${width}`);
      if (evidence && [1440,390].includes(width)) await page.screenshot({path:`${evidence}/${kind}-${width}.png`,fullPage:true});
    }
    if (['enigma','brainfuck'].includes(kind)) {
      await page.evaluate(()=>document.documentElement.style.fontSize='200%');
      for (const width of [1440,834,320]) {
        await page.setViewportSize({width,height:1000});
        const reflows=await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth);
        if(!reflows)console.log('Overflow boxes',await page.evaluate(()=>Array.from(document.querySelectorAll('main *')).filter(n=>n.getBoundingClientRect().right>innerWidth+.5).map(n=>({tag:n.tagName,id:n.id,class:n.className,right:n.getBoundingClientRect().right})).slice(0,30)));
        assert.ok(reflows,`${kind} reflows with 200% CSS text at ${width}`);
        if(evidence)await page.screenshot({path:`${evidence}/${kind}-text200-${width}.png`,fullPage:true});
      }
      await page.evaluate(()=>document.documentElement.style.fontSize='');
      await page.setViewportSize({width:844,height:390});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),`${kind} reflows in short landscape`);
    }
    await page.setViewportSize({width:1440,height:1100});
    if (process.env.PLAYGROUND_A11Y_REPORT) {
      await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
      const result = await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});return {violations:r.violations.map(x=>({id:x.id,nodes:x.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(x=>({id:x.id,nodes:x.nodes.map(n=>n.target)}))};});
      audits.push({kind,width:1440,...result});assert.deepEqual(result.violations,[],kind+' automated accessibility checks');
    }
  }

  await t.test('Enigma: fixture, actual trace, profile/plugs validation and lamp selection',async()=>{
    const page=await open('cipher.enigma','enigma');
    await page.getByLabel('Record post-step windows',{exact:true}).check();
    const card=await run(page,'cipher.enigma');
    await textResult(card,'text','BDZGO');await textResult(card,'final_windows','AAF');
    const count=await page.evaluate(()=>window.__instrumentCalls);
    await page.getByRole('button',{name:'Next state',exact:true}).focus();await page.keyboard.press('Enter');
    assert.ok((await page.locator('.enigma-machine').textContent()).includes('Inspected post-step windows: AAB'));
    assert.equal(await page.locator('.lamp.lit').textContent(),'B');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'mechanism-trace-next','Recorded-step keyboard controls retain focus.');
    assert.equal(await page.evaluate(()=>window.__instrumentCalls),count,'Trace navigation must not execute.');
    await tabsDoNotRun(page);
    await page.locator('#enigma-ring-0').fill('2');await page.locator('#enigma-ring-0').press('Tab');
    await page.locator('#instrument-tab-parameters').click();
    assert.equal(JSON.parse(await page.locator('#playground-options-rings').inputValue())[0],2);
    await page.locator('#playground-options-rings').fill('[1,1,1]');await page.locator('#instrument-tab-visual').click();
    assert.equal(await page.locator('#enigma-ring-0').inputValue(),'1');
    await page.locator('#enigma-plugs').fill('AB AC');await page.locator('#enigma-plugs').press('Tab');
    await page.getByText('A plugboard letter appears in more than one pair.',{exact:true}).waitFor();await invalidRun(page);
    await page.locator('#enigma-plugs').fill('');await page.locator('#enigma-plugs').press('Tab');await textResult(await run(page,'cipher.enigma'),'text','BDZGO');
    await capture(page,'enigma');await page.close();
  });
  await t.test('Solitaire: full deck reorder, exact known answer and invalid recovery',async()=>{
    const page=await open('cipher.solitaire.encode','solitaire');
    await textResult(await run(page,'cipher.solitaire.encode'),'text','EXKYIZSGEH');
    assert.equal(await page.locator('.solitaire-card').count(),54);
    assert.equal(await page.locator('#solitaire-card-0').getAttribute('draggable'),'true');
    await page.locator('#solitaire-card-0').dragTo(page.locator('#solitaire-card-1'));
    await page.locator('#instrument-tab-parameters').click();
    assert.deepEqual(JSON.parse(await page.locator('#playground-options-deck').inputValue()).slice(0,2),[2,1],'Dragging changes the actual initial permutation.');
    await page.locator('#instrument-tab-visual').click();await page.getByRole('button',{name:'Use ordered deck 1–54',exact:true}).click();
    await page.getByRole('button',{name:'JOKER A #53. Position 53: Joker A. ID 53. Select to move.',exact:true}).focus();await page.keyboard.press('Enter');
    await page.getByRole('button',{name:'Move earlier',exact:true}).click();
    await page.locator('#instrument-tab-parameters').click();
    const order=JSON.parse(await page.locator('#playground-options-deck').inputValue());assert.equal(order[51],53);assert.equal(new Set(order).size,54);
    const bad=[...order];bad[53]=53;await page.locator('#playground-options-deck').fill(JSON.stringify(bad));await page.locator('#instrument-tab-visual').click();
    await invalidRun(page);await page.getByRole('button',{name:'Use ordered deck 1–54',exact:true}).click();
    await textResult(await run(page,'cipher.solitaire.encode'),'text','EXKYIZSGEH');await tabsDoNotRun(page);
    await capture(page,'solitaire');await page.close();
  });
  await t.test('Alberti: exact rings, actual trace, initial rotation and invalid recovery',async()=>{
    const page=await open('cipher.alberti.encode','alberti');
    await textResult(await run(page,'cipher.alberti.encode'),'text','czdqpoqlhqluybeix&okapa');
    assert.equal(await page.locator('.alberti-outer-letter').count(),24);assert.equal(await page.locator('.alberti-inner-letter').count(),24);
    const count=await page.evaluate(()=>window.__instrumentCalls);await page.getByRole('button',{name:'Next state',exact:true}).click();assert.equal(await page.evaluate(()=>window.__instrumentCalls),count);
    await page.getByRole('button',{name:'Previous state',exact:true}).click();
    const disk=await page.locator('.alberti-disk').boundingBox();const cx=disk.x+disk.width/2,cy=disk.y+disk.height/2,r=disk.width*.29;
    await page.mouse.move(cx,cy-r);await page.mouse.down();await page.mouse.move(cx+r*Math.sin(Math.PI/12),cy-r*Math.cos(Math.PI/12),{steps:5});await page.mouse.up();
    await page.locator('#instrument-tab-parameters').click();assert.equal(JSON.parse(await page.locator('#extra-settings').inputValue()).initial_index,'q','Disk manipulation changes the named settings input.');
    await page.locator('#instrument-tab-visual').click();await page.locator('#alberti-initial').selectOption('c');
    await page.getByRole('button',{name:'Rotate initial index right',exact:true}).focus();await page.keyboard.press('Enter');
    await page.locator('#instrument-tab-parameters').click();assert.equal(JSON.parse(await page.locator('#extra-settings').inputValue()).initial_index,'&');
    await page.locator('#instrument-tab-visual').click();await page.locator('#alberti-initial').selectOption('c');
    const text=await page.locator('#playground-input').inputValue();await page.locator('#playground-input').fill('!');await invalidRun(page);
    await page.locator('#playground-input').fill(text);await textResult(await run(page,'cipher.alberti.encode'),'text','czdqpoqlhqluybeix&okapa');
    await capture(page,'alberti');await page.close();
  });
  await t.test('M138: fixture series, track editing, block offsets and invalid recovery',async()=>{
    const page=await open('cipher.m138a.encode','m138a');
    await textResult(await run(page,'cipher.m138a.encode'),'text','BZBZBZBZBZBZBZBZBZBZBZBZBZBZBZC');
    assert.equal(await page.locator('.m138-strip').count(),30);
    await page.getByRole('button',{name:'#2 Track 2. Inspect strip 2',exact:true}).click();await page.getByRole('button',{name:'Move track left',exact:true}).click();
    await page.locator('#instrument-tab-parameters').click();const settings=JSON.parse(await page.locator('#extra-settings').inputValue());assert.equal(settings.order[0],2);
    settings.order[0]=1;await page.locator('#extra-settings').fill(JSON.stringify(settings));await page.locator('#instrument-tab-visual').click();await invalidRun(page);
    await page.locator('#instrument-tab-parameters').click();settings.order=Array.from({length:30},(_,i)=>i+1);await page.locator('#extra-settings').fill(JSON.stringify(settings));await page.locator('#instrument-tab-visual').click();
    await textResult(await run(page,'cipher.m138a.encode'),'text','BZBZBZBZBZBZBZBZBZBZBZBZBZBZBZC');
    await page.locator('#m138-block').fill('2');await page.locator('#m138-block').press('Tab');await tabsDoNotRun(page);
    await page.evaluate(() => {
      const original = File.prototype.text;
      window.__settingsReads = [];
      File.prototype.text = function() { if(this.name.startsWith('delayed-')) return new Promise(resolve => window.__settingsReads.push({name:this.name,resolve})); return original.call(this); };
    });
    const imported = {...settings,strip_series:'example:second'};
    for (const name of ['delayed-first.json','delayed-second.json']) await page.locator('#m138-import').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from('{}')});
    assert.equal(await page.locator('#run-tools').isDisabled(),true,'Run waits for strip settings import.');
    await page.evaluate(text => window.__settingsReads[1].resolve(text),JSON.stringify(imported));
    await page.waitForFunction(()=>!document.querySelector('#run-tools').disabled);
    await page.evaluate(text => window.__settingsReads[0].resolve(text),JSON.stringify({...settings,strip_series:'example:obsolete'}));
    assert.equal(JSON.parse(await page.locator('#extra-settings').inputValue()).strip_series,'example:second','A late first import cannot overwrite a newer one.');
    await page.locator('#m138-import').setInputFiles({name:'delayed-navigation.json',mimeType:'application/json',buffer:Buffer.from('{}')});
    await page.getByRole('navigation',{name:'Primary'}).getByRole('link',{name:'All tools',exact:true}).click();
    await page.locator('#tool-search').waitFor();
    await page.evaluate(text => window.__settingsReads[2].resolve(text),JSON.stringify({...settings,strip_series:'example:obsolete-navigation'}));
    await page.getByRole('navigation',{name:'Primary'}).getByRole('link',{name:'Playground',exact:true}).click();
    await page.locator('[data-instrument="m138a"] .mechanism').waitFor();
    assert.equal(JSON.parse(await page.locator('#extra-settings').inputValue()).strip_series,'example:second','Leaving the instrument revokes pending settings reads even at the same input revision.');
    await page.locator('#m138-import').setInputFiles({name:'delayed-stop.json',mimeType:'application/json',buffer:Buffer.from('{}')});
    assert.equal(await page.locator('#run-tools').isDisabled(),true);
    await page.getByRole('button',{name:'Stop',exact:true}).click();
    assert.equal(await page.locator('#run-tools').isDisabled(),false);
    await page.evaluate(text => window.__settingsReads[3].resolve(text),JSON.stringify({...settings,strip_series:'example:obsolete-stop'}));
    await page.waitForFunction(()=>!document.querySelector('[data-instrument="m138a"]').textContent.includes('Reading the selected strip settings'));
    assert.equal(JSON.parse(await page.locator('#extra-settings').inputValue()).strip_series,'example:second','Stop revokes a pending settings read without changing the draft.');
    await run(page,'cipher.m138a.encode');
    await capture(page,'m138a');await page.close();
  });
  await t.test('Brainfuck: 8-bit fixture, recorded dispatches, final tape and invalid recovery',async()=>{
    const page=await open('esolang.brainfuck.report','brainfuck',2);
    await page.locator('#playground-input').fill('++++++++[>++++++++<-]>+.');
    await page.locator('#bf-stdin').fill('');await page.locator('#bf-stdin').press('Tab');
    await page.getByRole('button',{name:'Request tape cells 0–31 and recorded dispatches',exact:true}).click();
    const card=await run(page,'esolang.brainfuck.report');
    const report=await downloadJson(page,card);
    assert.deepEqual(report.output,[65]);assert.equal(report.final_pointer,1);assert.deepEqual(report.tape.slice(0,2),[{index:0,value:0},{index:1,value:65}]);assert.ok(report.completed);
    const count=await page.evaluate(()=>window.__instrumentCalls);await page.getByRole('button',{name:'Next state',exact:true}).click();assert.equal(await page.evaluate(()=>window.__instrumentCalls),count);
    assert.ok((await page.locator('.bf-dispatch').textContent()).includes('Recorded dispatch 1'));
    await page.locator('#bf-width').selectOption('8');await page.locator('#instrument-tab-parameters').click();assert.equal(await page.locator('#playground-options-cell_bits').inputValue(),'8');await page.locator('#instrument-tab-visual').click();
    await page.locator('#playground-input').fill('[');await invalidRun(page);await page.locator('#playground-input').fill('++++++++[>++++++++<-]>+.');await run(page,'esolang.brainfuck.report');
    await page.locator('#instrument-tab-parameters').click();await page.locator('#playground-options-max_trace_records').fill('1');await page.locator('#instrument-tab-visual').click();
    const truncated=await downloadJson(page,await run(page,'esolang.brainfuck.report'));
    assert.equal(truncated.completed,true);assert.equal(truncated.trace_complete,false);assert.equal(truncated.trace.length,1);assert.deepEqual(truncated.output,[65]);
    await page.getByText(/Trace truncated; execution status is separate/).waitFor();
    await page.locator('#instrument-tab-parameters').click();await page.locator('#playground-options-max_instructions').fill('10');await page.locator('#instrument-tab-visual').click();
    const stopped=await downloadJson(page,await run(page,'esolang.brainfuck.report'));
    assert.equal(stopped.completed,false);assert.equal(stopped.stop_reason,'instruction_limit');assert.equal(stopped.instructions,10);assert.deepEqual(stopped.output,[]);
    await page.locator('[data-instrument="brainfuck"] p[role="status"]').filter({hasText:'Execution stopped'}).waitFor();
    await page.locator('#instrument-tab-parameters').click();await page.locator('#playground-options-max_instructions').fill('1000000');await page.locator('#playground-options-max_trace_records').fill('4096');await page.locator('#instrument-tab-visual').click();
    await run(page,'esolang.brainfuck.report');
    await capture(page,'brainfuck');await page.close();
  });
  if (process.env.PLAYGROUND_A11Y_REPORT) {await mkdir(dirname(process.env.PLAYGROUND_A11Y_REPORT),{recursive:true});await writeFile(process.env.PLAYGROUND_A11Y_REPORT,JSON.stringify({browser:engine,version:browser.version(),audits},null,2));}
  assert.deepEqual(errors,[],'No browser script failures.');
});

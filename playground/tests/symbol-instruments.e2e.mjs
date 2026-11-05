import {selectInstrument} from './support/workspace.mjs';
import { manualExecution, loadCoreExample } from './support/workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, extname, dirname } from 'node:path';
import { instrumentBrowser } from './support/instrument-browser.mjs';

const require = createRequire(import.meta.url);
const engine = process.env.BROWSER_ENGINE ?? 'chromium';
const playwright = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const root = resolve(new URL('../dist', import.meta.url).pathname);
const evidence = process.env.PLAYGROUND_EVIDENCE;
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };

test('six symbol instruments edit canonical configuration and execute actual Core results', { timeout: 300000 }, async t => {
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, path.replace(/^\/docs\/playground\//, '') || 'index.html');
    if (!path.startsWith('/docs/playground/') || !file.startsWith(`${root}/`)) { response.writeHead(404).end(); return; }
    try { response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file)); }
    catch { response.writeHead(404).end(); }
  });
  server.listen(0, '127.0.0.1');
  await new Promise((accept, reject) => { server.once('listening', accept); server.once('error', reject); });
  t.after(() => { server.closeAllConnections(); server.close(); });
  const browser = await playwright[engine].launch({ headless: true, timeout: 20000, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, hasTouch: true, permissions: engine === 'chromium' ? ['clipboard-read', 'clipboard-write'] : [] });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1100 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const base = `http://127.0.0.1:${server.address().port}/docs/playground/`;
  const reports = [];
  if (evidence) await mkdir(evidence, { recursive: true });
  t.after(async () => {
    if (!process.env.PLAYGROUND_A11Y_REPORT) return;
    await mkdir(dirname(process.env.PLAYGROUND_A11Y_REPORT), { recursive: true });
    await writeFile(process.env.PLAYGROUND_A11Y_REPORT, JSON.stringify({ browser: engine, browserVersion: browser.version(), harness: { name: require((process.env.PLAYWRIGHT_MODULE ?? 'playwright') + '/package.json').name, version: require((process.env.PLAYWRIGHT_MODULE ?? 'playwright') + '/package.json').version }, scope: 'Six symbol instruments. Automated rules only; manual screen reader/native zoom remain separate.', reports }, null, 2));
  });
  let documentRevision = 0;
  const toolUrl = id => `${base}?instrument-document=${documentRevision}#/tools/${id}/1`;
  async function open(id, kind) {
    // Reset through one full navigation; a second reload can abort module startup.
    documentRevision++;
    await page.goto(toolUrl(id));
    await page.locator('#playground-heading').waitFor({timeout:45000});
    await manualExecution(page);
    if (kind) await page.locator(`[data-instrument="${kind}"]`).waitFor();
  }
  async function load() {
    await loadCoreExample(page);
    await page.getByText('Core example loaded.', { exact: true }).waitFor();
  }
  async function run(id, expected) {
    await page.locator('#run-tools').click();
    await page.waitForFunction(() => !document.querySelector('#run-tools').disabled, { timeout: 30000 });
    const card = page.locator(`[data-result-operation="${id}"]`).last();
    await card.waitFor();
    if (expected !== undefined) {
      assert.equal(await card.locator('pre[aria-label$="contents"]').textContent(), expected);
      await card.getByRole('button', {name: /^Copy /}).click();
      if (engine === 'chromium') assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected);
      else await page.waitForFunction(() => /Copied the complete|Clipboard access is unavailable/.test(document.querySelector('#notice').textContent));
    }
    return card;
  }
  async function tabsDoNotRun() {
    const before = await page.locator('[data-result-operation]').count();
    await page.locator('#instrument-tab-parameters').click();
    await page.locator('#instrument-tab-visual').click();
    assert.equal(await page.locator('[data-result-operation]').count(), before);
  }
  async function stale() {
    await page.getByText('This result belongs to earlier input or settings. The instrument retains its producing evidence.', { exact: true }).waitFor();
  }
  async function audit(label) {
    if (!await page.evaluate(() => Boolean(window.axe))) await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const report = await page.evaluate(async () => {
      const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
      const brief = rule => ({ id: rule.id, impact: rule.impact, nodes: rule.nodes.map(n => ({ target: n.target, failureSummary: n.failureSummary })) });
      return { width: innerWidth, violations: result.violations.map(brief), incomplete: result.incomplete.map(brief), passes: result.passes.length };
    });
    reports.push({ label, ...report });
    assert.deepEqual(report.violations, [], `${label} accessibility engine violations`);
  }
  async function capture(kind) {
    for (const width of [1440, 1100, 834, 700, 390, 320]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.locator('#main').focus();
      await page.evaluate(() => { scrollTo({top:0,behavior:'instant'}); return document.fonts.ready; });
      await page.waitForFunction(() => !document.querySelector('#notice').textContent);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${kind} reflows at ${width}`);
      if ([1440,390].includes(width)) {
        if (evidence) await page.screenshot({ path: `${evidence}/${kind}-${width}.png`, fullPage: true });
        await audit(`${kind}-${width}`);
      }
    }
    if (['cardan','morse'].includes(kind)) {
      await page.setViewportSize({width:844,height:390});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),kind+' short landscape');
      const enlarged=await page.addStyleTag({content:'html{font-size:200% !important}'});
      for (const width of [1440,834,320]) {
        await page.setViewportSize({width,height:1000});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),kind+' 200% text '+width);
        await audit(`${kind}-text-200-${width}`);
      }
      await enlarged.evaluate(node=>node.remove());
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
  }
  async function failAndRecover(id, change, repair, expected) {
    await change(); await page.locator('#run-tools').click();
    await page.waitForFunction(() => !document.querySelector('#run-tools').disabled);
    await page.locator('.execution-errors').waitFor();
    await repair(); await run(id, expected);
  }
  await t.test('Scytale columns, ragged row, selection, current versus previous result', async () => {
    await open('cipher.scytale.encode', 'scytale'); await load();
    await page.locator('[data-instrument="scytale"] .symbol-grid').waitFor();
    await run('cipher.scytale.encode', 'ADGBEHCF'); await tabsDoNotRun();
    await page.locator('#visual-scytale-cell-5').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#visual-scytale-position').inputValue(), '5');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'visual-scytale-cell-5');
    assert.equal(await page.locator('#playground-input').inputValue(), 'ABCDEFGH');
    await page.locator('#visual-scytale-columns').fill('4'); await page.locator('#visual-scytale-columns').press('Tab');
    await stale(); await page.locator('#instrument-tab-parameters').click();
    assert.equal(await page.locator('#playground-options-columns').inputValue(), '4');
    await page.locator('#instrument-tab-visual').click();
    await failAndRecover('cipher.scytale.encode', async () => { await page.locator('#visual-scytale-columns').fill('0'); await page.locator('#visual-scytale-columns').press('Tab'); },
      async () => { await page.locator('#visual-scytale-columns').fill('3'); await page.locator('#visual-scytale-columns').press('Tab'); }, 'ADGBEHCF');
    assert.equal(await page.locator('#playground-input').inputValue(), 'ABCDEFGH');
    await capture('scytale');
  });
  await t.test('Cardan hole toggles produce FIND and overlay named outputs remain exact', async () => {
    await open('cipher.cardan.extract', 'cardan'); await load();
    await page.locator('#playground-input').fill('FORMTIMECONEREAD');
    await page.locator('#visual-cardan-rows').fill('4'); await page.locator('#visual-cardan-rows').press('Tab');
    await page.locator('#visual-cardan-columns').fill('4'); await page.locator('#visual-cardan-columns').press('Tab');
    await page.locator('#instrument-tab-parameters').click(); await page.locator('#playground-options-holes').fill('[]');
    await page.locator('#instrument-tab-visual').click();
    for (const index of [0,5,10,15]) { await page.locator(`#visual-cardan-cell-${index}`).focus(); await page.keyboard.press('Space'); assert.equal(await page.evaluate(() => document.activeElement.id), `visual-cardan-cell-${index}`); }
    await run('cipher.cardan.extract', 'FIND'); await tabsDoNotRun();
    await page.locator('#visual-cardan-position').fill('3'); await page.locator('#visual-cardan-position').press('Tab');
    await page.locator('#instrument-tab-parameters').click();
    assert.equal(await page.locator('#playground-options-holes').inputValue(), '[0,5,10,15]');
    await page.locator('#instrument-tab-visual').click(); await capture('cardan');
    await page.locator('#instrument-action').selectOption('cipher.cardan.overlay'); await load();
    const card = await run('cipher.cardan.overlay');
    await card.locator('select').first().selectOption('text');
    assert.equal(await card.locator('pre[aria-label$="contents"]').textContent(), 'xBCDyF');
    await card.locator('select').first().selectOption('original_selected');
    assert.equal(await card.locator('pre[aria-label$="contents"]').textContent(), 'AE');
  });
  await t.test('Semaphore sender arm orientation and explicit composition', async () => {
    await open('symbol.semaphore.encode', 'semaphore'); await load(); await page.locator('#playground-input').fill('');
    await page.getByRole('button', { name: 'Add symbol', exact: true }).click();
    await page.locator('#visual-semaphore-right').selectOption('W');
    await page.getByRole('button', { name: 'Add symbol', exact: true }).click();
    assert.equal(await page.locator('#playground-input').inputValue(), 'AB');
    await run('symbol.semaphore.encode', 'S,SW S,W'); await tabsDoNotRun();
    await page.locator('#visual-semaphore-right').selectOption('S');
    await page.getByRole('button', { name: 'Interpret pair', exact: true }).click();
    await page.locator('.symbol-semaphore .warning').waitFor();
    assert.equal(await page.locator('#playground-input').inputValue(), 'AB');
    await page.locator('#visual-semaphore-right').selectOption('SW');
    await page.getByRole('button', { name: 'Interpret pair', exact: true }).click();
    await page.locator('.symbol-pair strong').filter({ hasText: 'A' }).waitFor();
    await capture('semaphore');
  });
  await t.test('Pigpen Haverhill glyph composition, dots, exact tokens and invalid input recovery', async () => {
    await open('symbol.alphabet.encode');
    await page.locator('#playground-options-profile').selectOption('pigpen_haverhill_pairs_v1');
    // Selecting a supported profile is a configuration edit; remount the selected action to resolve its presentation.
    const openVisual = page.getByRole('button', { name: /Open visual|Use visual|Visual instrument/ }).first();
    if (await openVisual.count()) await openVisual.click();
    else { await page.getByRole('link', { name: 'All tools', exact: true }).click(); await page.goto(toolUrl('symbol.alphabet.encode')); await manualExecution(page); }
    await page.locator('[data-instrument="pigpen"] .pigpen-palette').waitFor();
    await page.locator('#playground-input').fill('[]');
    await page.getByRole('button', { name: 'A: grid:ES', exact: true }).click();
    await page.getByRole('button', { name: 'Add glyph', exact: true }).click();
    await page.getByLabel('With dot', { exact: true }).check();
    await page.getByRole('button', { name: 'Add glyph', exact: true }).click();
    assert.equal(await page.locator('#playground-input').inputValue(), '["A","B"]');
    const card = await run('symbol.alphabet.encode');
    await card.locator('select').first().selectOption('tokens');
    assert.deepEqual(JSON.parse(await card.locator('pre[aria-label$="contents"]').textContent()), ['grid:ES','grid:ES:dot']);
    await card.getByRole('button', {name:/^Copy /}).click();
    if (engine === 'chromium') assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), ['grid:ES','grid:ES:dot']);
    await tabsDoNotRun();
    await page.locator('#playground-input').fill('["?"]'); await stale();
    await failAndRecover('symbol.alphabet.encode', async () => {}, async () => { await page.locator('#playground-input').fill('["A","B"]'); });
    await page.locator('[data-result-operation="symbol.alphabet.encode"]').last().locator('select').first().selectOption('tokens');
    await capture('pigpen');
  });
  await t.test('Braille bit masks, dot order, Unicode and exact bytes', async () => {
    await open('symbol.braille.encode', 'braille'); await load();
    await page.locator('#visual-braille-dot-1').waitFor();
    for (const dot of [1,3,6,8]) { await page.locator(`#visual-braille-dot-${dot}`).focus(); await page.keyboard.press('Space'); }
    assert.equal(await page.locator('#visual-braille-16').inputValue(), 'A5');
    assert.equal(await page.locator('#visual-braille-2').inputValue(), '10100101');
    assert.equal(await page.locator('.braille-unicode').textContent(), '\u28a5');
    await run('symbol.braille.encode', '\u28a5\u2801\u28ff'); await tabsDoNotRun();
    await capture('braille');
    await page.locator('#instrument-action').selectOption('symbol.braille.decode'); await load();
    await page.locator('#playground-input').fill('\u28a5');
    const card = await run('symbol.braille.decode');
    await card.getByText('Export', { exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name:'Download exact bytes', exact:true }).click()]);
    assert.deepEqual(await readFile(await download.path()), Buffer.from([0xa5]));
    await failAndRecover('symbol.braille.decode', async () => { await page.locator('#playground-input').fill('X'); }, async () => { await page.locator('#playground-input').fill('\u28a5'); });
  });
  await t.test('Morse text and signal modes preserve drafts and compose SOS', async () => {
    await open('symbol.morse.encode', 'morse'); await load(); await page.locator('#playground-input').fill('SOS');
    await run('symbol.morse.encode', '... --- ...');
    await page.getByRole('button', { name: 'Compose signals', exact: true }).click();
    for (const name of ['Dot','Dot','Dot','Next letter','Dash','Dash','Dash','Next letter','Dot','Dot','Dot']) {
      const control = page.locator('.instrument').getByRole('button', {name,exact:name.startsWith('Next')}); await control.focus(); await page.keyboard.press('Enter');
    }
    assert.equal(await page.locator('#playground-input').inputValue(), '... --- ...');
    await run('symbol.morse.decode', 'SOS'); await tabsDoNotRun();
    await page.getByRole('button', { name: 'Enter text', exact: true }).click();
    assert.equal(await page.locator('#playground-input').inputValue(), 'SOS');
    await page.getByRole('button', { name: 'Compose signals', exact: true }).click();
    assert.equal(await page.locator('#playground-input').inputValue(), '... --- ...');
    await failAndRecover('symbol.morse.decode', async () => { await page.locator('#playground-input').fill('.......'); }, async () => { await page.locator('#playground-input').fill('... --- ...'); }, 'SOS');
    await capture('morse');
  });
  assert.deepEqual(errors, [], 'No uncaught browser errors');
});


test('Pigpen Core examples preserve the selected profile in both directions', { timeout: 90000 }, async t => {
  const {context,base} = await instrumentBrowser(t);
  const page = await context.newPage();
  await page.goto(base+'#/tools');
  await selectInstrument(page,'pigpen');
  const units = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',' '];
  for (const operation of ['symbol.alphabet.encode','symbol.alphabet.decode']) {
    if (operation.endsWith('.decode')) await page.locator('#instrument-action').selectOption(operation);
    const before = await page.evaluate(()=>window.instrumentCalls);
    await loadCoreExample(page);
    await page.getByText('Core example loaded.',{exact:true}).waitFor();
    assert.equal(await page.locator('#playground-options-profile').inputValue(),'pigpen_haverhill_pairs_v1','Loading an example must retain the visual profile');
    assert.equal(await page.locator('[data-instrument="pigpen"]').count(),1);
    assert.equal(await page.evaluate(()=>window.instrumentCalls),before,'Loading sample data does not execute it');
    const input = JSON.parse(await page.locator('#playground-input').inputValue());
    if (operation.endsWith('.encode')) assert.deepEqual(input,units);
    else { assert.equal(input[0],'grid:ES'); assert.equal(input[1],'grid:ES:dot'); assert.equal(input.at(-1),' '); }
    await page.locator('#run-tools').click();
    await page.waitForFunction(()=>!document.querySelector('#run-tools').disabled);
    const card = page.locator(`[data-result-operation="${operation}"]`).last();
    await card.waitFor();
    await card.locator('select[id^="output-"]').selectOption(operation.endsWith('.encode')?'tokens':'readings');
    assert.equal(await card.locator('.viewer pre').count(),1,await card.textContent());
    const result = JSON.parse(await card.locator('.viewer pre').textContent());
    if(operation.endsWith('.encode')) { assert.equal(result.length,units.length); assert.equal(result[0],'grid:ES'); assert.equal(result[1],'grid:ES:dot'); }
    else assert.deepEqual(result,units.map((unit,token_index)=>({token_index,alternatives:[unit]})));
    if(evidence) { await mkdir(evidence,{recursive:true});await page.screenshot({path:`${evidence}/pigpen-example-${operation.endsWith('.encode')?'encode':'decode'}.png`,fullPage:true}); }
  }
  await page.getByText('About this tool',{exact:true}).click();
  await page.getByRole('heading',{name:'Example',exact:true}).waitFor();
  let resume, seen;
  const held = new Promise(resolve => { seen = resolve; });
  await page.route('**/tool-details/symbol.alphabet.decode.json', async route => {
    await new Promise(resolve => { resume = resolve; seen(); });
    await route.continue();
  });
  const calls = await page.evaluate(()=>window.instrumentCalls);
  await loadCoreExample(page,{wait:false}); await held;
  const edited = '["grid:ES:dot"]';
  await page.locator('#playground-input').fill(edited);
  const response = page.waitForResponse(response => response.url().endsWith('/tool-details/symbol.alphabet.decode.json'));
  resume(); await (await response).finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator('#playground-input').inputValue(),edited,'A delayed example cannot replace a newer edit');
  assert.equal(await page.locator('#playground-options-profile').inputValue(),'pigpen_haverhill_pairs_v1');
  assert.equal(await page.evaluate(()=>window.instrumentCalls),calls);
  await page.unroute('**/tool-details/symbol.alphabet.decode.json');
  let rejectRead, reached;
  const pendingFailure = new Promise(resolve => { reached = resolve; });
  await page.route('**/tool-details/symbol.alphabet.decode.json', async route => {
    await new Promise(resolve => { rejectRead = resolve; reached(); });
    await route.fulfill({status:503,body:'Metadata unavailable'});
  });
  await loadCoreExample(page,{wait:false}); await pendingFailure;
  await page.locator('#playground-input').fill('["grid:SW"]');
  const status = await page.locator('.input-options > [role="status"]').textContent();
  const failureResponse = page.waitForResponse(response => response.url().endsWith('/tool-details/symbol.alphabet.decode.json'));
  rejectRead(); await (await failureResponse).finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator('.input-options > [role="status"]').textContent(),status,'A failed obsolete example read must not replace current feedback');
  assert.equal(await page.locator('#playground-input').inputValue(),'["grid:SW"]');
  await page.close();
});

test('Stop revokes a pending example before it can replace current input',{timeout:45000},async t=>{
 const {context,base}=await instrumentBrowser(t);const page=await context.newPage();
 await page.goto(base+'#/tools');
 await selectInstrument(page,'pigpen');
 await page.locator('[data-instrument="pigpen"] button').first().waitFor();
 await page.locator('#playground-input').fill('["B"]');
 await page.getByText('About this tool',{exact:true}).click();await page.getByRole('heading',{name:'Example',exact:true}).waitFor();
 let release,seen;const held=new Promise(resolve=>{seen=resolve;});
 await page.route('**/tool-details/symbol.alphabet.encode.json',async route=>{await new Promise(resolve=>{release=resolve;seen();});await route.continue();});
 const before=await page.evaluate(()=>window.instrumentCalls);
 await loadCoreExample(page,{wait:false});await held;
 assert.equal(await page.locator('#run-tools').isDisabled(),true,'Run waits for the pending input');
 await page.getByRole('button',{name:'Stop',exact:true}).click();
 const status=await page.locator('.input-options > [role="status"]').textContent();
 const response=page.waitForResponse(response=>response.url().endsWith('/tool-details/symbol.alphabet.encode.json'));
 release();await(await response).finished();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.locator('#playground-input').inputValue(),'["B"]','Stop must revoke the pending input replacement');
 assert.equal(await page.locator('.input-options > [role="status"]').textContent(),status);
 assert.equal(await page.locator('#run-tools').isEnabled(),true);
 await page.unroute('**/tool-details/symbol.alphabet.encode.json');
 await loadCoreExample(page);
 await page.getByText('Core example loaded.',{exact:true}).waitFor();
 assert.deepEqual(JSON.parse(await page.locator('#playground-input').inputValue()),[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',' ']);
 assert.equal(await page.evaluate(()=>window.instrumentCalls),before,'Stop/retry does not run the selected operation');
 await page.close();
});

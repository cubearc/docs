import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir} from 'node:fs/promises';
import {instrumentBrowser} from './support/instrument-browser.mjs';

test('Enigma wheel controls edit initial settings; recorded inspection never runs', {timeout:120000}, async t => {
  const {open, context} = await instrumentBrowser(t);
  const page = await open('cipher.enigma', 'enigma');
  const initialCalls = await page.evaluate(() => window.instrumentCalls);
  const advance = page.getByRole('button', {name:'Advance rotor 1 initial window', exact:true});
  await advance.focus({timeout:3000});
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#enigma-window-0').inputValue(), 'B');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'enigma-advance-0');
  await page.locator('#instrument-tab-parameters').click();
  assert.equal(await page.locator('#playground-options-windows').inputValue(), 'BAA');
  await page.locator('#playground-options-windows').fill('AAA');
  await page.locator('#instrument-tab-visual').click();
  await page.getByLabel('Record post-step windows', {exact:true}).check();
  assert.equal(await page.evaluate(() => window.instrumentCalls), initialCalls);
  await page.locator('#run-tools').click();
  await page.locator('[data-result-operation="cipher.enigma"]').waitFor();
  assert.equal(await page.locator('#enigma-output').textContent(), 'BDZGO');
  const calls = await page.evaluate(() => window.instrumentCalls);
  await page.locator('#mechanism-trace-next').click();
  assert.equal(await page.locator('.lamp.lit').textContent(), 'B');
  assert.match(await page.locator('.mechanism-reading').textContent(), /Inspected post-step windows: AAB/);
  assert.equal(await page.locator('#enigma-window-2').inputValue(), 'A');
  assert.equal(await page.evaluate(() => window.instrumentCalls), calls);
  const stage = await page.locator('.instrument-surface').boundingBox();
  const stageTop = stage.y + await page.evaluate(() => scrollY);
  assert.ok(stageTop < 360, `The console starts high in the first viewport (${stageTop}px).`);
  const folder = process.env.PLAYGROUND_EVIDENCE;
  if (folder) await mkdir(folder, {recursive:true});
  for (const width of [1440,1100,834,700,390,320]) {
    await page.setViewportSize({width, height:1000});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No page overflow at ${width}`);
    if (folder) await page.screenshot({path:`${folder}/enigma-${width}.png`, fullPage:true});
  }
  await page.evaluate(() => {document.documentElement.style.fontSize='200%';});
  if (folder) await page.screenshot({path:`${folder}/enigma-320-text200.png`, fullPage:true});
  const reflow = await page.evaluate(() => ({width:innerWidth, scroll:document.documentElement.scrollWidth, outside:[...document.querySelectorAll('main *')].filter(el => {const r=el.getBoundingClientRect();return r.width && r.right>innerWidth && !el.closest('[data-instrument-scroll]');}).map(el=>({tag:el.tagName,class:el.className,width:el.getBoundingClientRect().width})).slice(0,15)}));
  assert.ok(reflow.scroll <= reflow.width, `320px enlarged text reflows: ${JSON.stringify(reflow)}`);
  await page.evaluate(() => {document.documentElement.style.fontSize='';});
  await page.setViewportSize({width:1440,height:1000});
  await advance.click();
  assert.equal(await page.locator('#enigma-output').textContent(), 'BDZGO');
  await page.getByText('Previous configuration', {exact:true}).waitFor();
  assert.equal(await page.locator('.lamp.lit').count(), 0, 'Editing returns the instrument to its initial configuration');
  assert.equal(await page.evaluate(() => window.instrumentCalls), calls);
  if ((process.env.BROWSER_ENGINE ?? 'chromium') === 'chromium') {
    await context.grantPermissions(['clipboard-read','clipboard-write']);
    await page.getByRole('button', {name:'Copy output text',exact:true}).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'BDZGO');
  }
  await page.getByText('Input actions', {exact:true}).click();
  await page.getByRole('button', {name:'Clear',exact:true}).click();
  assert.equal(await page.locator('#playground-input').inputValue(), '');
  await page.locator('#playground-file').setInputFiles({name:'enigma-example.txt',mimeType:'text/plain',buffer:Buffer.from('AAAAA')});
  await page.locator('.byte-input').waitFor();
  assert.equal(await page.locator('.byte-input p').textContent(), '5 bytes · bytes');
  assert.equal(await page.evaluate(() => window.instrumentCalls), calls, 'Input actions do not implicitly execute.');
  await page.close();
});

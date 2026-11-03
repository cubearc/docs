import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir} from 'node:fs/promises';
import {instrumentBrowser} from './support/instrument-browser.mjs';

const sourceFiles=process.env.PLAYGROUND_SOURCE_MECHANISMS==='1'?['instruments/mechanisms.mjs','instruments/mechanisms.css']:[];
async function capture(page,kind) {
  const folder=process.env.PLAYGROUND_EVIDENCE;
  if(folder)await mkdir(folder,{recursive:true});
  for(const width of [1440,1100,834,700,390,320]) {
    await page.setViewportSize({width,height:1000});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${kind} reflows at ${width}`);
    if(folder&&[1440,390,320].includes(width))await page.screenshot({path:`${folder}/${kind}-${width}.png`,fullPage:true});
  }
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${kind} reflows with enlarged text at 320`);
  if(folder)await page.screenshot({path:`${folder}/${kind}-320-text200.png`,fullPage:true});
  await page.evaluate(()=>document.documentElement.style.fontSize='');
}

test('Alberti inspection can return to the editable alignment without changing settings or executing', {timeout:120000}, async t=>{
  const {open}=await instrumentBrowser(t,{sourceFiles});
  const page=await open('cipher.alberti.encode','alberti');
  await page.locator('#run-tools').click();
  await page.locator('[data-result-operation="cipher.alberti.encode"]').waitFor();
  const settings=await page.locator('#extra-settings').inputValue();
  const calls=await page.evaluate(()=>window.instrumentCalls);
  await page.locator('#mechanism-trace-next').click();
  assert.equal(await page.locator('#alberti-inspected-index').textContent(),'c');
  await page.getByRole('button',{name:'Return to initial alignment',exact:true}).focus({timeout:3000});
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'alberti-initial','Return to initial keeps keyboard focus on its editable alignment.');
  assert.equal(await page.locator('#alberti-inspected-index').textContent(),'—');
  assert.equal(await page.locator('#alberti-initial').inputValue(),'c');
  assert.equal(await page.locator('#extra-settings').inputValue(),settings);
  assert.equal(await page.evaluate(()=>window.instrumentCalls),calls);
  await page.locator('#alberti-rotate-right').focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('#alberti-initial').inputValue(),'&');
  assert.equal(await page.locator('#alberti-final-index').textContent(),'o');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'alberti-rotate-right');
  await page.locator('#instrument-tab-parameters').click();
  assert.equal(JSON.parse(await page.locator('#extra-settings').inputValue()).initial_index,'&');
  await page.locator('#instrument-tab-visual').click();
  assert.equal(await page.evaluate(()=>window.instrumentCalls),calls);
  await capture(page,'alberti');
});

test('Solitaire selected card readout follows actual moves and advanced options retain their disclosure', {timeout:120000}, async t=>{
  const {open}=await instrumentBrowser(t,{sourceFiles});
  const page=await open('cipher.solitaire.encode','solitaire');
  await page.locator('#solitaire-card-52').focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('#solitaire-selected-value').textContent(),'A');
  assert.match(await page.locator('#solitaire-selected-position').textContent(),/53/);
  assert.equal(await page.locator('#solitaire-passphrase').isVisible(),false,'Advanced settings start collapsed.');
  const calls=await page.evaluate(()=>window.instrumentCalls);
  await page.locator('#solitaire-move-earlier').click();
  assert.equal(await page.locator('#solitaire-selected-value').textContent(),'A');
  assert.match(await page.locator('#solitaire-selected-position').textContent(),/52/);
  await page.locator('#instrument-tab-parameters').click();
  assert.equal(JSON.parse(await page.locator('#playground-options-deck').inputValue())[51],53);
  await page.locator('#instrument-tab-visual').click();
  await page.locator('#mechanism-deck-list').click();
  await page.locator('#solitaire-max-steps').fill('10000');await page.locator('#solitaire-max-steps').press('Tab');
  assert.equal(await page.locator('.solitaire-table details').getAttribute('open'),'');
  await page.locator('#instrument-tab-parameters').click();
  assert.equal(await page.locator('#playground-options-max_steps').inputValue(),'10000');
  await page.locator('#instrument-tab-visual').click();
  assert.equal(await page.evaluate(()=>window.instrumentCalls),calls);
  await page.locator('#mechanism-deck-list').click();
  await page.getByRole('button',{name:'Use ordered deck 1–54',exact:true}).click();
  await page.locator('#run-tools').click();
  await page.locator('[data-result-operation="cipher.solitaire.encode"]').waitFor();
  assert.equal(await page.locator('.result-card .viewer pre').first().textContent(),'EXKYIZSGEH');
  await capture(page,'solitaire');
});

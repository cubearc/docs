import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir} from 'node:fs/promises';
import {instrumentBrowser} from './support/instrument-browser.mjs';

test('four studies keep input compact, output exact and previous evidence inspectable', {timeout:180000}, async t => {
  const {open,context} = await instrumentBrowser(t);
  const folder=process.env.PLAYGROUND_EVIDENCE;
  if(folder) await mkdir(folder,{recursive:true});
  for(const [kind,id,input,expected] of [
    ['keyboard','text.keyboard.remap','Y','Z'],
    ['polybius','cipher.polybius.encode','HI','2,3 2,4'],
    ['alberti','cipher.alberti.encode',null,'czdqpoqlhqluybeix&okapa'],
    ['solitaire','cipher.solitaire.encode','AAAAAAAAAA','EXKYIZSGEH'],
  ]) await t.test(kind,async()=>{
    const page=await open(id,kind);
    try {
      if(input!==null) await page.locator('#playground-input').fill(input);
      if(kind==='keyboard') {await page.locator('#keyboard-source').selectOption('qwerty');await page.locator('#keyboard-target').selectOption('qwertz');}
      const layout=await page.evaluate(()=>Object.fromEntries(['input-section','results-section'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return[id,{y:r.y+scrollY,height:r.height}];}).concat([['stage',(()=>{const r=document.querySelector('.instrument-surface').getBoundingClientRect();return{y:r.y+scrollY,height:r.height};})()]])));
      assert.ok(layout['input-section'].height<180,'Input stays a compact strip.');
      assert.ok(layout['input-section'].y+layout['input-section'].height<=layout.stage.y,'The instrument follows compact input.');
      assert.ok(layout.stage.y<360,'Instrument begins in first viewport.');
      await page.locator('#run-tools').click();
      await page.locator(`[data-result-operation="${id}"]`).waitFor();
      assert.equal(await page.locator('#instrument-study-output').textContent(),expected);
      const calls=await page.evaluate(()=>window.instrumentCalls);
      await page.locator('#instrument-tab-parameters').click();
      await page.locator('#instrument-tab-visual').click();
      if(kind==='polybius') await page.locator('#polybius-cell-7').click();
      if(kind==='keyboard') await page.locator('#keyboard-text-0').click();
      if(kind==='solitaire') await page.locator('#solitaire-card-3').click();
      if(kind==='alberti') await page.locator('#mechanism-trace-next').click();
      assert.equal(await page.evaluate(()=>window.instrumentCalls),calls,'Inspection and tabs do not execute.');
      for(const [width,height] of [[1440,1000],[1100,1000],[834,1000],[700,1000],[390,1000],[320,1000],[844,390]]) {
        await page.setViewportSize({width,height});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${kind} reflows at ${width}×${height}`);
        if(folder) await page.screenshot({path:`${folder}/${kind}-${width}x${height}.png`,fullPage:true});
      }
      await page.setViewportSize({width:320,height:1000});
      await page.evaluate(()=>document.documentElement.style.fontSize='200%');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Enlarged text reflows at 320px.');
      if(folder) await page.screenshot({path:`${folder}/${kind}-320-text200.png`,fullPage:true});
      await page.evaluate(()=>document.documentElement.style.fontSize='');
      await page.setViewportSize({width:1440,height:1000});
      await page.locator('#playground-input').fill((input??'ALE41SA1BEAVTI3FVL2CITI')+'A');
      assert.equal(await page.locator('#instrument-study-output').textContent(),expected);
      assert.equal(await page.locator('.study-output-status').textContent(),'Previous configuration');
      if((process.env.BROWSER_ENGINE??'chromium')==='chromium') {
        await context.grantPermissions(['clipboard-read','clipboard-write']);
        await page.getByRole('button',{name:'Copy instrument output',exact:true}).click();
        assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),expected);
      }
      assert.equal(await page.evaluate(()=>window.instrumentCalls),calls);
    } finally {await page.close();}
  });
});

test('study preview is bounded while copy and download retain the complete representation', {timeout:60000}, async t => {
  const {open,context}=await instrumentBrowser(t);
  const page=await open('text.keyboard.remap','keyboard');
  await page.locator('#keyboard-source').selectOption('qwerty');
  await page.locator('#keyboard-target').selectOption('qwertz');
  await page.locator('#playground-input').fill('Y'.repeat(5000));
  await page.locator('#run-tools').click();
  const result=page.locator('[data-result-operation="text.keyboard.remap"]');
  await result.waitFor();
  assert.equal(await page.locator('#instrument-study-output').textContent(),'Z'.repeat(4096));
  await page.getByText('Showing 4,096 characters. Copy keeps the complete output; export and named outputs are in Results.',{exact:true}).waitFor();
  if((process.env.BROWSER_ENGINE??'chromium')==='chromium') {
    await context.grantPermissions(['clipboard-read','clipboard-write']);
    await page.getByRole('button',{name:'Copy instrument output',exact:true}).click();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'Z'.repeat(5000));
  }
  await result.getByText('Export',{exact:true}).click();
  const downloadPromise=page.waitForEvent('download');
  await result.getByRole('button',{name:'Download selected view',exact:true}).click();
  const stream=await(await downloadPromise).createReadStream();
  const chunks=[];for await(const chunk of stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(),'Z'.repeat(5000));
  await page.close();
});

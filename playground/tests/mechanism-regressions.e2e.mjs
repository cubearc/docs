import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile,mkdir} from 'node:fs/promises';
import {instrumentBrowser} from './support/instrument-browser.mjs';

// Exercise the owned source without mutating shared build assets during parallel review.
test('mechanical editors preserve exact inputs and retained execution evidence',{timeout:120000},async t=>{
  const {open,context,base,browser}=await instrumentBrowser(t,{sourceFiles:process.env.PLAYGROUND_SOURCE_MECHANISMS==='1'?['app.mjs','playground-view.mjs','instruments/shell.mjs','instruments/mechanisms.mjs']:[]});
  t.diagnostic(`Browser: ${process.env.BROWSER_ENGINE ?? 'chromium'} ${browser.version()}; actual packaged worker/Wasm; UI from ${process.env.PLAYGROUND_SOURCE_MECHANISMS==='1'?'scoped source overrides':'built artifact'}.`);
  if(process.env.MECHANISM_SOURCE) await context.route('**/instruments/mechanisms.mjs',async route=>route.fulfill({contentType:'text/javascript',body:await readFile(process.env.MECHANISM_SOURCE,'utf8')}));
  async function capture(page,name){
    if(!process.env.PLAYGROUND_EVIDENCE)return;
    await mkdir(process.env.PLAYGROUND_EVIDENCE,{recursive:true});
    await page.locator('#main').focus();await page.evaluate(()=>document.fonts.ready);
    for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${process.env.PLAYGROUND_EVIDENCE}/${name}-${width}.png`,fullPage:true});}
  }
  async function run(page){await page.locator('#run-tools').click();await page.waitForFunction(()=>!document.querySelector('#run-tools').disabled);}
  async function unconfigured(operation,kind){
    const page=await context.newPage();await page.goto(base+`#/tools/${operation}/1`);
    await page.getByRole('button',{name:'Use tool',exact:true}).click();
    await page.locator(`[data-instrument="${kind}"] .mechanism`).waitFor();return page;
  }
  await t.test('fresh Enigma requires an explicit choice of no plugboard pairs',async()=>{
    const page=await unconfigured('cipher.enigma','enigma');
    assert.ok((await page.locator('.enigma-machine').textContent()).includes('No plugboard configuration supplied'),'An absent required configuration must not appear to be a supplied empty list.');
    assert.equal(await page.getByLabel('Machine profile',{exact:true}).count(),1,'The profile control exposes its visible label rather than a DOM ID.');
    assert.equal(await page.locator('#enigma-profile option:checked').textContent(),'Choose…','Missing required enum values need an explicit placeholder.');
    await capture(page,'enigma-unconfigured');
    await page.getByRole('button',{name:'Use no plugboard pairs',exact:true}).click();
    await page.locator('#instrument-tab-parameters').click();
    assert.equal(await page.locator('#playground-options-plugboard').inputValue(),'[]');await page.close();
  });
  await t.test('fresh Alberti geometry does not announce an initial index that was never set',async()=>{
    const page=await unconfigured('cipher.alberti.encode','alberti');
    assert.ok((await page.locator('.alberti-disk').getAttribute('aria-label')).includes('No initial alignment configured'));
    const before=await page.locator('#extra-settings').inputValue();await page.locator('.alberti-disk').click();
    assert.equal(await page.locator('#extra-settings').inputValue(),before,'Clicking an unconfigured preview is not an initial-index edit.');
    await capture(page,'alberti-unconfigured');
    await page.locator('.alberti-disk').scrollIntoViewIfNeeded();
    const disk=await page.locator('.alberti-disk').boundingBox();const cx=disk.x+disk.width/2,cy=disk.y+disk.height/2,r=disk.width*.29;
    await page.mouse.move(cx,cy-r);await page.mouse.down();await page.mouse.move(cx+r*Math.sin(Math.PI/12),cy-r*Math.cos(Math.PI/12),{steps:5});await page.mouse.up();
    assert.equal(JSON.parse(await page.locator('#extra-settings').inputValue()).initial_index,'q','An explicit disk rotation still configures the exact selected index.');await page.close();
  });
  await t.test('new M138 offset JSON must not round a wide integer',async()=>{
    const page=await open('cipher.m138a.encode','m138a');
    await page.locator('#m138-offsets').fill('[9007199254740993]');await page.locator('#m138-offsets').press('Tab');
    assert.ok((await page.locator('#extra-settings').inputValue()).includes('9007199254740993'),'The canonical settings must retain the exact invalid integer for Core validation.');
    assert.equal(await page.locator('#m138-offsets').inputValue(),'[9007199254740993]');
    await run(page);await page.getByText(/Not applicable or needs options \(1\)/).waitFor();
    await page.close();
  });
  await t.test('new M138 order JSON must not round a wide integer',async()=>{
    const page=await open('cipher.m138a.encode','m138a');
    await page.getByText('Series import and accessible track list',{exact:true}).click();
    await page.locator('#m138-order').fill('[9007199254740993]');await page.locator('#m138-order').press('Tab');
    assert.ok((await page.locator('#extra-settings').inputValue()).includes('9007199254740993'),'A newly supplied strip ID must survive without Number narrowing.');
    assert.ok((await page.locator('.m138-strip-label').textContent()).includes('9007199254740993'),'The invalid strip label must not present a different rounded ID.');
    await page.close();
  });
  await t.test('malformed M138 field remains the active invalid configuration until repaired',async()=>{
    const page=await open('cipher.m138a.encode','m138a');await run(page);
    await page.locator('#m138-offsets').fill('[1,');await page.locator('#m138-offsets').press('Tab');
    assert.equal(await page.locator('#m138-offsets').inputValue(),'[1,','A redraw must not erase the malformed field draft.');
    const malformed=await page.locator('#extra-settings').inputValue();assert.throws(()=>JSON.parse(malformed));
    await capture(page,'m138-malformed-draft');
    await run(page);await page.getByText(/Not applicable or needs options \(1\)/).waitFor();
    await page.getByText('Series import and accessible track list',{exact:true}).click();
    await page.locator('#m138-series').fill('example:unrelated-edit');await page.locator('#m138-series').press('Tab');
    assert.equal(await page.locator('#m138-offsets').inputValue(),'[1,','Other controls must not discard an invalid field.');
    await page.locator('#m138-offsets').fill('[1,2]');await page.locator('#m138-offsets').press('Tab');
    await run(page);
    assert.equal(await page.locator('[data-result-operation="cipher.m138a.encode"] .viewer pre').textContent(),'BZBZBZBZBZBZBZBZBZBZBZBZBZBZBZC');
    await page.close();
  });
  await t.test('Enigma ring editor must not round a wide integer',async()=>{
    const page=await open('cipher.enigma','enigma');
    await page.locator('#enigma-ring-0').fill('9007199254740993');await page.locator('#enigma-ring-0').press('Tab');
    await page.locator('#instrument-tab-parameters').click();
    assert.ok((await page.locator('#playground-options-rings').inputValue()).includes('9007199254740993'),'Invalid ring input must remain exact rather than becoming a different number.');
    await page.close();
  });
  await t.test('canceled Solitaire drag cannot authorize an external drop',async()=>{
    const page=await open('cipher.solitaire.encode','solitaire');
    const original=await page.locator('#playground-options-deck').inputValue();
    const drag=await page.evaluateHandle(()=>new DataTransfer());
    await page.locator('#solitaire-card-0').dispatchEvent('dragstart',{dataTransfer:drag});
    await page.locator('#solitaire-card-0').dispatchEvent('dragend',{dataTransfer:drag});
    const external=await page.evaluateHandle(()=>{const data=new DataTransfer();data.setData('text/plain','external text');return data;});
    await page.locator('#solitaire-card-2').dispatchEvent('drop',{dataTransfer:external});
    assert.equal(await page.locator('#playground-options-deck').inputValue(),original,'Dropping unrelated content after canceling a card drag must not edit the deck.');
    await page.locator('#solitaire-card-0').dragTo(page.locator('#solitaire-card-2'));
    assert.deepEqual(JSON.parse(await page.locator('#playground-options-deck').inputValue()).slice(0,3),[2,3,1],'A real current card drag remains functional.');
    await page.close();
  });
  await t.test('Solitaire keeps its accessible order panel open after editing',async()=>{
    const page=await open('cipher.solitaire.encode','solitaire');
    const panel=page.locator('.solitaire-table details');
    await panel.locator('summary').click();
    const order=JSON.parse(await page.locator('#solitaire-deck-json').inputValue());
    [order[0],order[1]]=[order[1],order[0]];
    await page.locator('#solitaire-deck-json').fill(JSON.stringify(order));
    await page.locator('#solitaire-deck-json').press('Tab');
    assert.equal(await panel.getAttribute('open'),'','Editing must not collapse the accessible configuration panel.');
    await page.close();
  });
  await t.test('deck and strip scrolling survives configuration and inspection edits',async()=>{
    const page=await open('cipher.solitaire.encode','solitaire');await page.setViewportSize({width:390,height:900});
    const deck=page.locator('.solitaire-deck');
    const before=await deck.evaluate(node=>{node.scrollLeft=200;return node.scrollLeft;});assert.ok(before>0);
    await page.locator('#solitaire-move-later').click();
    assert.ok(Math.abs(await deck.evaluate(node=>node.scrollLeft)-before)<1,'Moving a card must preserve local deck scrolling.');
    await page.close();
    const strips=await open('cipher.m138a.encode','m138a');
    const holder=strips.locator('.m138-holder');
    const position=await holder.evaluate(node=>{node.scrollLeft=400;node.scrollTop=150;return [node.scrollLeft,node.scrollTop];});
    assert.ok(position.every(value=>value>0));
    await strips.locator('#m138-block').fill('2');await strips.locator('#m138-block').press('Tab');
    assert.deepEqual(await holder.evaluate(node=>[node.scrollLeft,node.scrollTop]),position,'Selecting a message block must preserve both strip scroll axes.');
    await strips.close();
  });
  await t.test('Brainfuck final tape is not labeled as an initial configuration',async()=>{
    const page=await open('esolang.brainfuck.report','brainfuck',2);
    await page.locator('#playground-input').fill('++++++++[>++++++++<-]>+.');
    await page.locator('#bf-stdin').fill('');await page.locator('#bf-stdin').press('Tab');
    await page.getByRole('button',{name:'Request tape cells 0–31 and recorded dispatches',exact:true}).click();
    await run(page);
    assert.ok((await page.locator('.bf-tape').textContent()).includes('65'));
    assert.ok(!(await page.locator('.mechanism-trace').textContent()).includes('Initial configuration'),'No dispatch is selected; the displayed retained tape is the final state.');
    await page.close();
  });
  await t.test('Enigma recorded initial windows stay distinct from an edited draft',async()=>{
    const page=await open('cipher.enigma','enigma');
    await page.getByLabel('Record post-step windows',{exact:true}).check();await run(page);
    await page.locator('#mechanism-trace-next').click();
    const calls=await page.evaluate(()=>window.instrumentCalls);
    await page.locator('#enigma-window-0').selectOption('Z');
    assert.equal(await page.locator('#enigma-window-0').inputValue(),'Z');
    assert.equal((await page.locator('.rotor-drum strong').allTextContents()).join(''),'AAB');
    const recorded=page.locator('.enigma-machine details').filter({hasText:'Recorded initial settings'});
    assert.equal(await recorded.count(),1,'The trace retains its producing initial settings, separately from the editable windows.');
    await recorded.locator('summary').click();
    assert.ok((await recorded.textContent()).includes('Windows: AAA'));
    assert.ok((await page.locator('.enigma-machine').textContent()).includes('A → B'));
    assert.equal(await page.evaluate(()=>window.instrumentCalls),calls,'Inspecting the retained run and changing settings do not execute.');
    await capture(page,'enigma-retained-initial-settings');
    await page.close();
  });
  await t.test('Alberti recorded alignment and input survive edits and action changes',async()=>{
    const page=await open('cipher.alberti.encode','alberti');await run(page);
    await page.locator('#alberti-initial').selectOption('&');
    await page.locator('#mechanism-trace-next').click();
    await page.locator('#playground-input').fill('ZZZ');
    const recorded=page.locator('.alberti-instrument details').filter({hasText:'Recorded initial settings'});
    assert.equal(await recorded.count(),1,'The recorded run exposes its actual initial index after editing the draft.');
    await recorded.locator('summary').click();
    assert.ok((await recorded.textContent()).includes('Initial index: c'));
    assert.ok((await page.locator('.alberti-instrument').textContent()).includes('Recorded input byte 0: A → c'));
    assert.ok((await page.locator('.alberti-disk').getAttribute('aria-label')).includes('Inner c aligned'));
    await capture(page,'alberti-retained-initial-settings');
    const settings=await page.locator('#extra-settings').inputValue();
    const calls=await page.evaluate(()=>window.instrumentCalls);
    await page.locator('#instrument-action').selectOption('cipher.alberti.decode');
    await page.locator('[data-instrument="alberti"] .mechanism').waitFor();
    assert.equal(await page.locator('#extra-settings').inputValue(),settings);
    assert.equal(await page.locator('#playground-input').inputValue(),'ZZZ');
    await page.locator('#instrument-action').selectOption('cipher.alberti.encode');
    await page.locator('[data-instrument="alberti"] .mechanism').waitFor();
    assert.equal(await page.locator('#extra-settings').inputValue(),settings);
    assert.equal(await page.evaluate(()=>window.instrumentCalls),calls,'Switching actions preserves the configuration without executing.');
    await page.close();
  });
});

test('trace control words stay intact on narrow screens',{timeout:45000},async t=>{
  const {open}=await instrumentBrowser(t,{sourceFiles:process.env.PLAYGROUND_SOURCE_MECHANISMS==='1'?['instruments/mechanisms.css']:[]});
  const page=await open('cipher.enigma','enigma');
  await page.getByLabel('Record post-step windows',{exact:true}).check();
  await page.locator('#run-tools').click();await page.waitForFunction(()=>!document.querySelector('#run-tools').disabled);
  const calls=await page.evaluate(()=>window.instrumentCalls);
  for(const width of [390,320])for(const scale of [100,200]){
    await page.setViewportSize({width,height:1000});
    await page.evaluate(scale=>document.documentElement.style.fontSize=`${scale}%`,scale);await page.evaluate(()=>document.fonts.ready);
    const broken=await page.locator('.mechanism-trace .toolbar button').evaluateAll(buttons=>buttons.flatMap(button=>{
      const walker=document.createTreeWalker(button,NodeFilter.SHOW_TEXT);const split=[];let text;
      while(text=walker.nextNode())for(const match of text.data.matchAll(/\S+/g)){
        const range=document.createRange();range.setStart(text,match.index);range.setEnd(text,match.index+match[0].length);
        if(range.getClientRects().length>1)split.push({button:button.id,word:match[0]});
      }
      return split;
    }));
    assert.deepEqual(broken,[],`Trace words must stay legible at ${width}px and ${scale}% text.`);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(process.env.PLAYGROUND_EVIDENCE){await mkdir(process.env.PLAYGROUND_EVIDENCE,{recursive:true});await page.locator('.mechanism-trace').screenshot({path:`${process.env.PLAYGROUND_EVIDENCE}/trace-controls-${width}-text${scale}.png`});}
  }
  assert.equal(await page.evaluate(()=>window.instrumentCalls),calls,'Responsive inspection must not execute the operation again.');
  await page.close();
});

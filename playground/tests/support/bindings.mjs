import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

export async function verifyNewBindings(context,origin,audit = async () => {}) {
  const page=await context.newPage();
  try {
    await page.goto(`${origin}/docs/playground/#/tools`);
    await page.locator('#tool-search').waitFor({timeout:45000});
    await page.locator('#tool-search').fill('cipher.book.decode');
    await page.locator('[data-tool="cipher.book"]').click();
    await page.getByRole('button',{name:'Use tool',exact:true}).click();
    await page.locator('#playground-input').fill('1:1,2:1');
    await page.locator('#playground-options-source').fill('another book');
    await page.locator('#playground-options-scheme').selectOption('word_character');
    await page.getByRole('button',{name:'Run tools',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#run-tools').disabled);
    assert.equal(await page.locator('[data-result-operation="cipher.book.decode"] .viewer pre').first().textContent(),'ab');
    await page.getByRole('navigation',{name:'Primary'}).getByRole('link',{name:'All tools',exact:true}).click();
    await page.locator('#tool-search').fill('number.constant_digits');
    await page.locator('[data-tool="number.constant_digits"]').click();
    await page.getByRole('button',{name:'Use tool',exact:true}).click();
    await page.locator('#playground-options-constant').waitFor();
    assert.equal(await page.locator('#playground-options-constant').count(),1,'Tools with no input ports must open their actual options.');
    await page.locator('#playground-options-constant').selectOption('pi');
    await page.locator('#playground-options-count').fill('3');
    await page.locator('#playground-options-max_digits').fill('16');
    await page.getByRole('button',{name:'Run tools',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#run-tools').disabled);
    const result=JSON.parse(await page.locator('[data-result-operation="number.constant_digits"] .viewer pre').first().textContent());
    assert.equal(result.digits,'141');
    assert.equal(result.integer_part,'3');
    assert.equal(await page.locator('#playground-input').count(),0);
    await audit('options-only-tool',page);
    for (const width of [1440,834,390,320]) {
      await page.setViewportSize({width,height:900});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    await page.getByRole('button',{name:'Compare common tools',exact:true}).click();
    assert.equal(await page.locator('#playground-input').inputValue(),'1:1,2:1','Navigation through an options-only tool preserves the previous text.');
    await page.goto(`${origin}/docs/playground/#/tools/cipher.vic.encode/1`);
    await page.getByRole('heading',{name:'VIC (English 2010)',exact:true}).waitFor();
    const response = await page.request.get(`${origin}/docs/playground/tool-details/cipher.vic.encode.json`);
    assert.equal(response.status(),200);
    const example = (await response.json()).example;
    assert.equal(example.parameters.padding,'');
    await page.getByRole('button',{name:'Use tool',exact:true}).click();
    await page.locator('#playground-input').fill(example.inputs.text);
    for (const [name,value] of Object.entries(example.parameters)) await page.locator(`#playground-options-${name}`).fill(String(value));
    await page.getByRole('button',{name:'Run tools',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#run-tools').disabled);
    assert.equal(await page.locator('[data-result-operation="cipher.vic.encode"]').count(),1,await page.locator('#results-section').textContent());
    const vic = page.locator('[data-result-operation="cipher.vic.encode"] .viewer pre');
    await vic.first().waitFor({timeout:30000});
    assert.equal(await vic.first().textContent(),example.outputs.text,'The complete VIC source answer accepts explicit empty padding through the actual form.');
    await audit('vic-explicit-empty-padding',page);

    for (const operation of ['cipher.prime_number.encode','cipher.prime_multiplication.decode','symbol.solresol.encode','symbol.alphabet.encode','symbol.alphabet.decode']) {
      await page.goto(`${origin}/docs/playground/#/tools/${operation}/1`);
      const response=await page.request.get(`${origin}/docs/playground/tool-details/${operation}.json`);
      assert.equal(response.status(),200);
      const example=(await response.json()).example;
      await page.waitForFunction(operation=>document.querySelector('#tool-action')?.value===operation,operation);
      await page.getByRole('button',{name:'Use tool',exact:true}).click();
      const input=Object.values(example.inputs)[0];
      await page.locator('#playground-input').fill(typeof input==='string'?input:JSON.stringify(input));
      for (const [name,value] of Object.entries(example.parameters)) {
        const field=page.locator(`#playground-options-${name}`);
        if(await field.evaluate(element=>element.tagName)==='SELECT') await field.selectOption(String(value));
        else await field.fill(typeof value==='object'?JSON.stringify(value):String(value));
      }
      await page.getByRole('button',{name:'Run tools',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('#run-tools').disabled);
      const output=operation==='cipher.prime_multiplication.decode'?'groups':operation==='symbol.alphabet.decode'?'readings':'tokens';
      assert.equal(await page.locator(`[data-result-operation="${operation}"]`).count(),1,await page.locator('#main').innerText());
      await page.locator(`[data-result-operation="${operation}"]`).getByRole('combobox',{name:'Choose an output',exact:true}).selectOption(output);
      const result=page.locator(`[data-result-operation="${operation}"] .viewer pre`).first();
      await result.waitFor({timeout:30000});
      assert.deepEqual(JSON.parse(await result.textContent()),JSON.parse(example.outputs[output]),operation+' actual required-profile form answer');
      await audit(`puzzle-profile-${operation.split('.')[1]}`,page);
    }


    // The previous cases fill the bounded eight-round history; start a fresh session.
    await page.reload();
    await page.goto(`${origin}/docs/playground/#/tools/symbol.alphabet.decode/1`);
    await page.waitForFunction(()=>document.querySelector('#tool-action')?.value==='symbol.alphabet.decode');
    await page.getByRole('button',{name:'Use tool',exact:true}).click();
    await page.locator('#playground-input').fill('["hylian:r3c5"]');
    const profile=page.locator('#playground-options-profile');
    const choices=await profile.locator('option').evaluateAll(options=>options.map(option=>option.value).filter(Boolean));
    assert.equal(new Set(choices).size,23,'Every qualified profile is available through the actual required-profile control.');
    await profile.selectOption('hylian_skyward_dcode_v1');
    await page.getByRole('button',{name:'Run tools',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#run-tools').disabled);
    const card=page.locator('[data-result-operation="symbol.alphabet.decode"]');
    await card.getByRole('combobox',{name:'Choose an output',exact:true}).selectOption('readings');
    assert.deepEqual(JSON.parse(await card.locator('.viewer pre').textContent()),[{token_index:0,alternatives:['D','W']}]);
    await card.getByRole('combobox',{name:'Choose an output',exact:true}).selectOption('tokens');
    assert.deepEqual(JSON.parse(await card.locator('.viewer pre').textContent()),['hylian:r3c5']);
    await audit('symbolic-alphabet-ambiguity',page);

    await page.reload();
    for (const operation of ['analysis.substitution.solve','analysis.family.suggest']) {
      await page.goto(`${origin}/docs/playground/#/tools/${operation}/1`);
      const response=await page.request.get(`${origin}/docs/playground/tool-details/${operation}.json`);
      assert.equal(response.status(),200);
      const example=(await response.json()).example;
      const title=operation==='analysis.substitution.solve'?'Solve substitution constraints':'Suggest classical cipher families';
      await page.getByRole('heading',{name:title,exact:true}).waitFor();
      await page.getByRole('button',{name:'Use tool',exact:true}).click();
      const request=example.inputs.request;
      await page.locator('#playground-input').fill(typeof request==='string'?request:JSON.stringify(request));
      await page.getByRole('button',{name:'Run tools',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('#run-tools').disabled);
      const card=page.locator(`[data-result-operation="${operation}"]`);
      assert.equal(await card.count(),1,await page.locator('#main').innerText());
      const outputs=card.getByRole('combobox',{name:'Choose an output',exact:true});
      if(await outputs.count()) await outputs.selectOption('report');
      await card.getByText('Export',{exact:true}).click();
      const [download]=await Promise.all([page.waitForEvent('download'),card.getByRole('button',{name:'Download selected view',exact:true}).click()]);
      const report=JSON.parse(await readFile(await download.path(),'utf8'));
      const expected=typeof example.outputs.report==='string'?JSON.parse(example.outputs.report):example.outputs.report;
      assert.deepEqual(report,expected,operation+' actual browser form known answer');
      await audit(`classical-${operation.split('.')[1]}`,page);
    }

  } finally { await page.close(); }
}

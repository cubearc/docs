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
  } finally { await page.close(); }
}

import assert from 'node:assert/strict';

export async function verifyPresentation(context, origin) {
  const page = await context.newPage();
  let previous;
  try {
    await page.goto(`${origin}/docs/playground/#/tools`);
    await page.locator('#tool-search').waitFor({timeout:45000});
    previous = await page.evaluate(() => localStorage.getItem('cubearc.playground.favorites.v1'));
    await page.evaluate(() => localStorage.setItem('cubearc.playground.favorites.v1', '["image"]'));
    await page.reload();
    await page.getByRole('button',{name:'Favorites',exact:true}).first().click();
    await page.locator('[data-tool="image.decode"]').waitFor();
    assert.equal(await page.locator('[data-tool="image.decode"] strong').textContent(), 'Read image pixels');
    assert.equal(await page.locator('[data-tool="image.encode"] strong').textContent(), 'Save as PNG');
    assert.equal(await page.locator('[data-tool]').count(), 2, 'The old image favorite expands to both explicitly separated tasks.');
    await page.getByRole('button',{name:'All tools',exact:true}).click();
    await page.locator('#tool-search').fill('a book cipher');
    await page.locator('[data-tool="cipher.book"]').click();
    await page.getByRole('heading',{name:'Book cipher',exact:true}).waitFor();
    const detail=page.getByLabel('Selected tool',{exact:true});
    assert.ok((await detail.textContent()).includes('positions in a reference text'));
    assert.equal(await detail.locator('p').filter({hasText:/caller-supplied book coordinates/}).isVisible(),false,'The Core contract description stays under closed Technical details.');
    await detail.getByText('Technical details',{exact:true}).click();
    await detail.locator('p').filter({hasText:/Decode caller-supplied book coordinates/}).waitFor();
    await page.goto(`${origin}/docs/playground/#/tools/image`);
    await page.getByRole('heading',{name:'Read image pixels',exact:true}).waitFor({timeout:45000});
    for(const width of [1440,834,390,320]) {
      await page.setViewportSize({width,height:900});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
  } finally {
    if(previous!==undefined) await page.evaluate(value=>{if(value===null)localStorage.removeItem('cubearc.playground.favorites.v1');else localStorage.setItem('cubearc.playground.favorites.v1',value);},previous);
    await page.close();
  }
}

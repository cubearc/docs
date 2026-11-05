import {navigateActivity} from './workspace.mjs';
import assert from 'node:assert/strict';

export async function verifyFragments(context, origin) {
  for (const [hash, title] of [['#main', 'Multidecoder'], ['#input-section', 'Multidecoder'], ['#results-section', 'Multidecoder'], ['#steps-section', 'Pipelines'], ['#pipeline-result', 'Pipelines']]) {
    const page = await context.newPage();
    try {
      await page.goto(`${origin}/docs/playground/${hash}`);
      await page.waitForFunction(() => document.querySelector('#runtime-details')?.textContent.includes('catalogOperations'), undefined, { timeout: 45000 });
      assert.equal(await page.getByRole('heading', { level: 1, name: title, exact: true }).count(), 1, `Direct ${hash} must render a ready application after SDK initialization.`);
      if (title === 'Multidecoder') assert.equal(await page.getByRole('textbox', { name: 'Input', exact: true }).count(), 1, 'The input accessible name must match its visible label.');
    } finally { await page.close(); }
  }
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/docs/playground/#/playground`);
    await page.locator('#playground-input').fill('kept while jumping');
    await page.getByRole('link', { name: 'Results', exact: true }).tap();
    assert.equal(await page.locator('#playground-input').inputValue(), 'kept while jumping');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'results-section');
    await page.getByRole('link', { name: 'Input', exact: true }).tap();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'input-section');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#runtime-details')?.textContent.includes('catalogOperations'), undefined, { timeout: 45000 });
    assert.equal(await page.locator('#playground-input').count(), 1);
    await navigateActivity(page,'Pipelines');
    await page.getByRole('button', { name: 'New pipeline', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Starting input', exact: true }).count(), 1, 'The pipeline input accessible name must match its visible heading.');
  } finally { await page.close(); }
}

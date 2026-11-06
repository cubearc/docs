import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { instrumentBrowser } from './support/instrument-browser.mjs';
import { manualExecution } from './support/workspace.mjs';

test('CRAFT accepts an explicit plain-text tweak and XXTEA preserves complete word sequences', { timeout: 120000 }, async t => {
  const { context, base } = await instrumentBrowser(t);
  const page = await context.newPage();
  const key = '18f4eebdfced7841d9e0e38cfe6a9405';
  const tweak = '17f291a9a3aa0400';
  const cases = [
    ['cipher.block.encrypt_blocks', '0123456789abcdef', '111df5062a8d88c9'],
    ['cipher.block.decrypt_blocks', '111df5062a8d88c9', '0123456789abcdef'],
    ['cipher.xxtea.encrypt_words', '0000000000000000', 'ab043705808c5d57'],
    ['cipher.xxtea.decrypt_words', 'ab043705808c5d57', '0000000000000000'],
  ];
  for (const [operation, input, expected] of cases) {
    await page.goto(`${base}#/tools/${operation}/1`);
    await manualExecution(page);
    const craft = operation.startsWith('cipher.block.');
    if (craft) {
      await page.locator('#playground-options-profile').selectOption('craft_2020_v1');
      await page.locator('#playground-options-tweak_hex').fill(tweak);
    }
    await page.locator('#playground-options-key_hex').fill(craft ? key : '00'.repeat(16));
    await page.locator('#playground-file').setInputFiles({ name: 'public-answer.bin', mimeType: 'application/octet-stream', buffer: Buffer.from(input, 'hex') });
    await page.getByText('Exact file bytes loaded.', { exact: true }).waitFor();
    await page.locator('#run-tools').click();
    const card = page.locator(`[data-result-operation="${operation}"][data-result-current="true"]`);
    await card.waitFor();
    await card.getByRole('combobox', { name: 'View and copy as', exact: true }).selectOption('Hex');
    assert.equal(await card.locator('.viewer pre').textContent(), expected);
    await card.locator('summary[id$="-export-toggle"]').click();
    const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Download exact bytes', exact: true }).click()]);
    assert.equal((await readFile(await download.path())).toString('hex'), expected, operation);
    await card.locator('summary[id$="-settings-toggle"]').click();
    const settings = await card.locator('details[id$="-settings"] > pre').textContent();
    assert.ok(!settings.includes(craft ? key : '00'.repeat(16)));
    if (craft) {
      assert.ok(!settings.includes(tweak));
      await page.locator('#playground-options-tweak_hex').fill('');
      await page.locator('#run-tools').click();
      await page.getByText('Check input or parameters.', { exact: true }).waitFor();
      assert.equal(await page.locator('[data-result-current="true"]').count(), 0);
      await page.locator('#playground-options-tweak_hex').fill(tweak);
      await page.locator('#run-tools').click();
      await card.waitFor();
    }
    for (const width of [1440, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${operation} reflows at ${width}`);
      if (process.env.PLAYGROUND_EVIDENCE) await page.screenshot({ path: `${process.env.PLAYGROUND_EVIDENCE}/${operation}-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
});

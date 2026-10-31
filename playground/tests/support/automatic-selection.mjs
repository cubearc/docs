import assert from 'node:assert/strict';

/** Real Wasm results; virtual time controls only the typing/debounce transition. */
export async function verifyAutomaticSelection(context, origin) {
  const page = await context.newPage();
  let controlledClock = false;
  try {
    await page.goto(`${origin}/docs/playground/`);
    await page.getByRole('heading', { name: 'Decode text', exact: true }).waitFor({ timeout: 45000 });
    await page.getByRole('button', { name: 'Encode', exact: true }).click();
    await page.locator('#playground-input').fill('A');
    await page.getByRole('button', { name: 'Run tools', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#run-tools').disabled);
    assert.equal(await page.getByLabel('Encode Base64 contents', { exact: true }).textContent(), 'QQ==');
    await page.clock.install(); controlledClock = true;
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.getByLabel('Update recently fast tools as I type', { exact: true }).check();
    await page.locator('#playground-input').fill('B');
    await page.clock.runFor(1000);
    await page.waitForFunction(() => document.querySelector('[aria-label="Encode Base64 contents"]')?.textContent === 'Qg==');
    await page.waitForFunction(() => !document.querySelector('#run-tools').disabled);
    await page.locator('#playground-input').fill('C');
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await page.clock.runFor(1000);
    assert.equal(await page.getByLabel('Encode Base64 contents', { exact: true }).textContent(), 'Qg==', 'Stop must also cancel a scheduled typing update.');
    await page.locator('#playground-input').fill('D');

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'All tools', exact: true }).click();
    await page.locator('#tool-search').fill('Base64');
    await page.locator('[data-tool="encoding.base64"]').click();
    await page.locator('#tool-action').selectOption('encoding.base64.decode');
    await page.getByRole('button', { name: 'Use tool', exact: true }).click();
    await page.getByRole('heading', { name: 'Decode Base64', level: 1, exact: true }).waitFor();
    await page.clock.runFor(1000);
    await page.waitForFunction(() => !document.querySelector('#run-tools').disabled);
    assert.equal(await page.getByLabel('Encode Base64 contents', { exact: true }).textContent(), 'Qg==', 'A debounce from common Encode mode must not start a new round after explicit selection of another tool.');
    await page.getByRole('button', { name: 'Encode', exact: true }).click();
    await page.locator('#playground-input').fill('E');
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Pipelines', exact: true }).click();
    await page.getByRole('button', { name: 'New pipeline', exact: true }).click();
    await page.locator('#pipeline-input').fill('A');
    await page.locator('#add-step').selectOption('cipher.rot13');
    await page.getByRole('button', { name: 'Add selected step', exact: true }).click();
    await page.getByRole('button', { name: 'Run pipeline', exact: true }).click();
    await page.getByLabel('Pipeline result contents', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Pipeline result contents', { exact: true }).textContent(), 'N');
    await page.clock.runFor(1000);
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Playground', exact: true }).click();
    assert.equal(await page.getByLabel('Encode Base64 contents', { exact: true }).textContent(), 'Qg==', 'An explicit pipeline run must revoke an older scheduled Playground update.');

  } finally { if (controlledClock) await page.clock.resume(); await page.close(); }
}

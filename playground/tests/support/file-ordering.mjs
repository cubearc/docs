import assert from 'node:assert/strict';

/** Defer real browser reads; release still returns the original exact File bytes. */
export async function verifyFileReadOrdering(page, pipelineDocument) {
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer;
    const text = File.prototype.text;
    window.cubePendingReads = new Map();
    File.prototype.arrayBuffer = function () {
      if (!this.name.startsWith('deferred-')) return read.call(this);
      return new Promise((resolve, reject) => {
        window.cubePendingReads.set(this.name, async () => {
          try { resolve(await read.call(this)); } catch (error) { reject(error); }
          await Promise.resolve();
        });
      });
    };
    File.prototype.text = function () {
      if (!this.name.startsWith('deferred-')) return text.call(this);
      return new Promise((resolve, reject) => {
        window.cubePendingReads.set(this.name, async () => {
          try { resolve(await text.call(this)); } catch (error) { reject(error); }
          await Promise.resolve();
        });
      });
    };
  });
  const select = async (selector, name, bytes) => {
    await page.locator(selector).setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
    await page.waitForFunction(name => window.cubePendingReads.has(name), name);
  };
  const release = name => page.evaluate(name => window.cubePendingReads.get(name)(), name);
  const input = () => page.evaluate(() => document.querySelector('#playground-input')?.value);

  await page.locator('#playground-input').fill('original input');
  await select('#playground-file', 'deferred-edit.bin', [1]);
  await page.locator('#playground-input').fill('newer text');
  await release('deferred-edit.bin');
  assert.equal(await input(), 'newer text', 'An older File read must not overwrite a newer text edit.');
  await select('#playground-file', 'deferred-stop.bin', [1]);
  assert.equal(await page.getByRole('button', { name: 'Run tools', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await release('deferred-stop.bin');
  assert.equal(await input(), 'newer text');
  assert.equal(await page.getByRole('button', { name: 'Run tools', exact: true }).isDisabled(), false);


  await select('#playground-file', 'deferred-first.bin', [1]);
  await select('#playground-file', 'deferred-latest.bin', [0, 255]);
  await release('deferred-latest.bin');
  await page.getByText('deferred-latest.bin', { exact: true }).waitFor();
  await release('deferred-first.bin');
  assert.equal(await page.locator('.byte-input strong').textContent(), 'deferred-latest.bin', 'The latest file selection must win even if the first read finishes last.');
  await page.getByRole('button', { name: 'Run tools', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('#run-tools').disabled);
  assert.equal(await page.getByLabel('Encode Base64 contents', { exact: true }).textContent(), 'AP8=');

  await select('#playground-file', 'deferred-navigation.bin', [2]);
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'All tools', exact: true }).click();
  await page.locator('#tool-search').fill('Base64');
  await release('deferred-navigation.bin');
  assert.equal(await page.locator('#tool-search').inputValue(), 'Base64');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'tool-search', 'A background read must not redraw another section and steal its focus.');
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Playground', exact: true }).click();
  await page.getByText('deferred-navigation.bin', { exact: true }).waitFor();

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Pipelines', exact: true }).click();
  await page.locator('#pipeline-input').fill('original pipeline input');
  await select('input[type=file]:not([accept])', 'deferred-pipeline-edit.bin', [1]);
  await page.locator('#pipeline-input').fill('newer pipeline input');
  await release('deferred-pipeline-edit.bin');
  assert.equal(await page.evaluate(() => document.querySelector('#pipeline-input')?.value), 'newer pipeline input', 'An older file must not overwrite an edited pipeline input.');

  await select('input[type=file]:not([accept])', 'deferred-pipeline-first.bin', [1]);
  await select('input[type=file]:not([accept])', 'deferred-pipeline-last.bin', [0, 255]);
  await release('deferred-pipeline-last.bin');
  await page.getByText('2 exact bytes selected.', { exact: true }).waitFor();
  await release('deferred-pipeline-first.bin');
  assert.equal(await page.getByText('2 exact bytes selected.', { exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Use text input', exact: true }).click();
  await select('input[accept]', 'deferred-definition.json', Buffer.from(JSON.stringify(pipelineDocument)));
  await page.locator('#pipeline-input').fill('newer than definition import');
  await release('deferred-definition.json');
  assert.equal(await page.evaluate(() => document.querySelector('#pipeline-input')?.value), 'newer than definition import', 'An older definition import must not replace a newer pipeline edit.');

  await select('input[type=file]:not([accept])', 'deferred-replaced-draft.bin', [1]);
  await page.getByRole('button', { name: '← Saved pipelines', exact: true }).click();
  await page.getByRole('button', { name: 'New pipeline', exact: true }).click();
  await release('deferred-replaced-draft.bin');
  assert.equal(await page.locator('#pipeline-input').inputValue(), '');
  assert.equal(await page.getByRole('button', { name: 'Run pipeline', exact: true }).isDisabled(), false, 'An obsolete file selection must not leave a new pipeline permanently disabled.');


}

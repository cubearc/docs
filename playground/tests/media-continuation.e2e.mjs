import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, extname } from 'node:path';

const require = createRequire(import.meta.url);
const engine = process.env.BROWSER_ENGINE ?? 'chromium';
const playwright = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const root = resolve(new URL('../dist', import.meta.url).pathname);
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };

async function openColors(context, origin) {
  const page = await context.newPage();
  await page.goto(`${origin}#/tools/image.histogram/1`);
  await page.getByRole('button', { name: 'Use tool', exact: true }).click({ timeout: 45000 });
  await page.locator('[data-instrument="colors"]').waitFor();
  const tuples = { R: [255, 0, 0], G: [0, 255, 0], B: [0, 0, 255] };
  const samples = Array.from('RRGGRBBGRBGGRRBB').flatMap(letter => tuples[letter]);
  await page.locator('#playground-input').fill(JSON.stringify({
    width: 4, height: 4, color_model: 'rgb',
    samples: { base64: Buffer.from(samples).toString('base64') }, palette: [], transparency: { base64: '' },
  }));
  await page.locator('#run-tools').click();
  await page.getByRole('button', { name: 'FF0000, 6 pixels', exact: true }).click();
  await page.getByRole('button', { name: 'Build mask and transparent layer', exact: true }).click();
  await page.getByText('6 selected pixels.', { exact: false }).waitFor();
  return page;
}

async function settleAuxiliary(page, id) {
  await page.waitForFunction(id => document.getElementById(id)?.disabled === false, id);
}

test('media retained evidence and asynchronous lifetime regressions', { timeout: 120000 }, async t => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const relative = path.replace(/^\/docs\/playground\//, '') || 'index.html';
    const file = resolve(root, relative);
    const served = process.env.PLAYGROUND_SOURCE_MEDIA && ['instruments/media.mjs', 'instruments/media.css', 'instruments/shell.mjs', 'playground-view.mjs', 'app.mjs'].includes(relative) ? resolve(root, '../src', relative) : file;
    if (!path.startsWith('/docs/playground/') || !file.startsWith(`${root}/`)) return response.writeHead(404).end();
    try { const body = await readFile(served); response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }).end(body); }
    catch { response.writeHead(404).end(); }
  });
  server.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  t.after(() => { server.closeAllConnections(); server.close(); });
  const browser = await playwright[engine].launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  t.diagnostic(`${engine} ${browser.version()}`);
  const context = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  const origin = `http://127.0.0.1:${server.address().port}/docs/playground/`;
  const subtest = (name, work) => t.test(name, { skip: Boolean(process.env.MEDIA_CASE && !name.includes(process.env.MEDIA_CASE)) }, work);

  await subtest('PNG chunk labels remain horizontal inside the localized byte table', async () => {
    const page = await context.newPage();
    await page.goto(`${origin}#/tools/image.png.inspect/1`);
    await page.getByRole('button', { name: 'Use tool', exact: true }).click({ timeout: 45000 });
    await page.locator('#load-core-example').click();
    await page.getByText('Synthetic Core example loaded. Run to produce your own result.', { exact: true }).waitFor();
    await page.locator('#run-tools').click();
    await page.locator('[data-result-operation="image.png.inspect"]').waitFor();
    const records = await page.locator('[data-result-operation]').count();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const chunk of ['IHDR', 'IDAT', 'IEND']) {
        const button = page.getByRole('button', { name: chunk, exact: true });
        const geometry = await button.evaluate(node => {
          const range = document.createRange(); range.selectNodeContents(node);
          const lines = new Set(Array.from(range.getClientRects()).filter(rect => rect.width > 0).map(rect => Math.round(rect.top)));
          return { whiteSpace: getComputedStyle(node).whiteSpace, lines: lines.size };
        });
        assert.deepEqual(geometry, { whiteSpace: 'nowrap', lines: 1 }, `${chunk} must stay on one readable line at${width}px.`);
      }
      const table = page.getByRole('region', { name: 'PNG chunk offsets, lengths and CRC values', exact: true });
      assert.equal(await table.evaluate(node => node.scrollWidth > node.clientWidth), true, 'Necessary table overflow stays in its scroll region.');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.getByRole('button', { name: 'IDAT', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'IDAT', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.getByText('Zero-based offset 33; 24 total bytes', { exact: false }).waitFor();
      assert.equal(await page.locator('[data-result-operation]').count(), records, 'Selecting a chunk must not inspect the PNG again.');
      if (process.env.PLAYGROUND_EVIDENCE) {
        await mkdir(process.env.PLAYGROUND_EVIDENCE, { recursive: true });
        await page.locator('#main').focus(); await page.evaluate(() => scrollTo({ top: 0, left: 0, behavior: 'instant' }));
        await page.screenshot({ path: resolve(process.env.PLAYGROUND_EVIDENCE, `png-chunks-${width}.png`), fullPage: true });
      }
    }
    await page.close();
  });

  await subtest('canonical extract colors never inherit a histogram-only composition', async () => {
    const page = await openColors(context, origin);
    await settleAuxiliary(page, 'media-action-build-mask-and-transparent-layer');
    await page.locator('#instrument-action').selectOption('image.colors.extract');
    await page.locator('#instrument-tab-parameters').click();
    assert.equal(await page.locator('#playground-options-colors').inputValue(), '');
    await page.locator('#instrument-tab-visual').click();
    assert.equal(await page.getByText('Selected native tuples: none.', { exact: false }).count(), 1, 'Required colors must remain absent in both views, regardless of inspector composition.');
    await page.close();
  });

  await subtest('omitted canonical export filter means all native colors after an inspector action switch', async () => {
    const page = await openColors(context, origin);
    await settleAuxiliary(page, 'media-action-build-mask-and-transparent-layer');
    await page.locator('#instrument-action').selectOption('image.colors.export');
    await page.locator('#instrument-tab-parameters').click();
    assert.equal(await page.locator('#playground-options-colors').inputValue(), '');
    await page.locator('#instrument-tab-visual').click();
    assert.equal(await page.getByText('No color filter is configured. PNG export includes all exact native colors.', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Prepare selected PNG exports', exact: true }).click();
    await settleAuxiliary(page, 'media-action-prepare-selected-png-exports');
    assert.equal(await page.getByRole('button', { name: /^Download color-/ }).count(), 3, 'The real export must include all3 colors, not the earlier red-only histogram selection.');
    await page.close();
  });

  await subtest('changing a selected color labels retained mask/layer, including after another pixel read', async () => {
    const page = await openColors(context, origin);
    await settleAuxiliary(page, 'media-action-build-mask-and-transparent-layer');
    await page.getByRole('button', { name: 'FF0000, 6 pixels, selected', exact: true }).click();
    await page.getByRole('button', { name: '00FF00, 5 pixels', exact: true }).click();
    assert.equal(await page.locator('.instrument .warning').count(), 1, 'An old red mask must be labelled after choosing green.');
    await page.getByRole('button', { name: 'Inspect exact pixel', exact: true }).click();
    await settleAuxiliary(page, 'media-action-inspect-exact-pixel');
    assert.equal(await page.locator('.instrument .warning').count(), 1, 'A current pixel read must not relabel older mask/layer evidence.');
    await page.close();
  });

  await subtest('exporting an older mask does not erase its earlier-settings label', async () => {
    const page = await openColors(context, origin);
    await settleAuxiliary(page, 'media-action-build-mask-and-transparent-layer');
    await page.locator('#instrument-tab-parameters').click();
    await page.locator('#playground-options-max_colors').fill('999');
    await page.locator('#instrument-tab-visual').click();
    assert.ok(await page.locator('.instrument .warning').count() > 0);
    const [download] = await Promise.all([
      page.waitForEvent('download'), page.getByRole('button', { name: 'Download exact mask PNG', exact: true }).click(),
    ]);
    const data = await readFile(await download.path());
    assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    await settleAuxiliary(page, 'media-action-download-exact-mask-png');
    assert.ok(await page.locator('.instrument .warning').count() > 0, 'Export must not rewrite retained analysis provenance.');
    await page.close();
  });

  await subtest('a fresh auxiliary mask replaces an earlier primary extract in the visual viewer', async () => {
    const page = await context.newPage();
    await page.goto(`${origin}#/tools/image.colors.extract/1`);
    await page.getByRole('button', { name: 'Use tool', exact: true }).click({ timeout: 45000 });
    const tuples = { R: [255, 0, 0], G: [0, 255, 0], B: [0, 0, 255] };
    const samples = Array.from('RRGGRBBGRBGGRRBB').flatMap(letter => tuples[letter]);
    await page.locator('#playground-input').fill(JSON.stringify({ width: 4, height: 4, color_model: 'rgb', samples: { base64: Buffer.from(samples).toString('base64') }, palette: [], transparency: { base64: '' } }));
    await page.locator('#instrument-tab-parameters').click();
    await page.locator('#playground-options-colors').fill('["FF0000"]');
    await page.locator('#run-tools').click();
    await page.locator('[data-result-operation="image.colors.extract"]').waitFor();
    await page.locator('#playground-options-colors').fill('["00FF00"]');
    await page.locator('#instrument-tab-visual').click();
    await page.getByRole('button', { name: 'Build mask and transparent layer', exact: true }).click();
    await settleAuxiliary(page, 'media-action-build-mask-and-transparent-layer');
    const greenPixel = await page.getByRole('img', { name: /^Selection mask:/ }).evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(2, 0, 1, 1).data));
    assert.deepEqual(greenPixel, [255, 255, 255, 255], 'The viewer must draw the newly produced green mask, not the previous red primary output.');
    await page.close();
  });

  await subtest('a pending auxiliary rejection after disposal cannot mutate retained presentation state', async () => {
    const page = await context.newPage();
    await page.goto(`${origin}#/playground`);
    await page.locator('#run-tools').waitFor({ timeout: 45000 });
    const after = await page.evaluate(async () => {
      const media = await import('./instruments/media.mjs');
      const host = document.createElement('div');
      document.body.append(host);
      let reject;
      const api = {
        kind: 'bit-plane', action: { id: 'image.bit_plane.extract', contract: { parameters: { properties: {} } } }, ui: {},
        input: () => ({ type: 'json', data: { width: 1, height: 1, color_model: 'gray', samples: { base64: 'AA==' }, palette: [], transparency: { base64: '' } } }),
        param: name => name === 'bit' ? 0 : name === 'channel' ? 'gray' : undefined,
        result: () => ({}), stale: () => false, revision: () => 1,
        refresh: () => media.mountInstrument(host, api),
        execute: () => new Promise((_, no) => { reject = no; }),
      };
      media.mountInstrument(host, api);
      host.querySelector('#media-action-inspect-exact-pixel').click();
      media.disposeInstrument(api);
      reject(new Error('Late rejected invocation'));
      await new Promise(resolve => setTimeout(resolve, 0));
      host.remove();
      return { error: api.ui.media.error ?? '', pixel: api.ui.media.pixel ?? null, busy: api.ui.media.busy };
    });
    assert.deepEqual(after, { error: '', pixel: null, busy: false });
    await page.close();
  });
  await subtest('a delayed pixel read keeps the coordinates actually sent to Core', async () => {
    const page = await context.newPage();
    await page.goto(`${origin}#/playground`);
    await page.locator('#run-tools').waitFor({ timeout: 45000 });
    const inspected = await page.evaluate(async () => {
      const media = await import('./instruments/media.mjs');
      const host = document.createElement('div'); document.body.append(host);
      let resolve;
      const api = {
        kind: 'bit-plane', action: { id: 'image.bit_plane.extract', contract: { parameters: { properties: {} } } }, ui: {},
        input: () => ({ type: 'json', data: { width: 2, height: 1, color_model: 'gray', samples: { base64: '/wA=' }, palette: [], transparency: { base64: '' } } }),
        param: name => name === 'bit' ? 0 : name === 'channel' ? 'gray' : undefined,
        result: () => ({}), stale: () => false, revision: () => 1,
        refresh: () => media.mountInstrument(host, api),
        execute: () => new Promise(yes => { resolve = yes; }),
      };
      media.mountInstrument(host, api);
      host.querySelector('#media-action-inspect-exact-pixel').click();
      api.ui.media.x = 1; api.refresh();
      resolve({ output: Uint8Array.of(255) });
      await new Promise(yes => setTimeout(yes, 0));
      const record = { x: api.ui.media.pixel.x, y: api.ui.media.pixel.y, values: Array.from(api.ui.media.pixel.values) };
      host.remove(); return record;
    });
    assert.deepEqual(inspected, { x: 0, y: 0, values: [255] });
    await page.close();
  });

  await subtest('reverse Shift-click exports the inclusive bytes between both selected offsets', async () => {
    const page = await context.newPage();
    await page.goto(`${origin}#/tools/file.hex.inspect/1`);
    await page.getByRole('button', { name: 'Use tool', exact: true }).click({ timeout: 45000 });
    const original = Buffer.from(Array.from({ length: 16 }, (_, i) => i));
    await page.locator('#playground-file').setInputFiles({ name: 'offsets.bin', buffer: original });
    await page.getByText('File ready. Run tools with these exact bytes.', { exact: true }).waitFor();
    await page.locator('#run-tools').click();
    await page.locator('#media-byte-Left-8').waitFor();
    await page.locator('#media-byte-Left-8').click();
    await page.locator('#media-byte-Left-5').click({ modifiers: ['Shift'] });
    assert.equal(await page.getByLabel('Selection start', { exact: true }).inputValue(), '5');
    assert.equal(await page.getByLabel('Selection length', { exact: true }).inputValue(), '4');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download bytes · Left', exact: true }).click()]);
    assert.deepEqual(await readFile(await download.path()), original.subarray(5, 9));
    await page.close();
  });

  await subtest('next difference loads its actual byte page without rerunning comparison', async () => {
    const page = await context.newPage();
    await page.goto(`${origin}#/tools/file.binary.compare/1`);
    await page.getByRole('button', { name: 'Use tool', exact: true }).click({ timeout: 45000 });
    const left = Buffer.alloc(640), right = Buffer.alloc(640); right[300] = 0xFF; right[500] = 0x7F;
    await page.locator('#playground-file').setInputFiles({ name: 'left.bin', buffer: left });
    await page.getByText('File ready. Run tools with these exact bytes.', { exact: true }).waitFor();
    await page.locator('.instrument input[type=file]').setInputFiles({ name: 'right.bin', buffer: right });
    await page.getByText('Right source: right.bin', { exact: true }).waitFor();
    await page.locator('#run-tools').click();
    await page.getByText('2 differing bytes in total', { exact: false }).waitFor();
    const records = await page.locator('[data-result-operation]').count();
    await page.getByRole('button', { name: 'Load aligned byte rows', exact: true }).click();
    await settleAuxiliary(page, 'media-action-load-aligned-byte-rows');
    await page.getByRole('button', { name: 'Next difference', exact: true }).click();
    await settleAuxiliary(page, 'media-action-next-difference');
    assert.equal(await page.getByLabel('Byte page (256 bytes)', { exact: true }).inputValue(), '1');
    assert.equal(await page.locator('#media-byte-Right-300').count(), 1, 'The selected difference must be present in the loaded viewport.');
    assert.equal(await page.locator('#media-byte-Right-300').textContent(), 'FF');
    assert.equal(await page.locator('[data-result-operation]').count(), records, 'Navigation must not rerun comparison.');
    await page.close();
  });

  await subtest('image pan survives parameter tabs without executing the operation again', async () => {
    const page = await context.newPage();
    await page.goto(`${origin}#/tools/image.bit_plane.extract/1`);
    await page.getByRole('button', { name: 'Use tool', exact: true }).click({ timeout: 45000 });
    await page.locator('#playground-input').fill(JSON.stringify({ width: 64, height: 64, color_model: 'gray', samples: { base64: Buffer.alloc(4096, 255).toString('base64') }, palette: [], transparency: { base64: '' } }));
    await page.locator('#instrument-tab-parameters').click();
    await page.locator('#playground-options-channel').selectOption('gray');
    await page.locator('#playground-options-bit').fill('0');
    await page.locator('#instrument-tab-visual').click();
    await page.locator('#run-tools').click();
    await page.getByText('4096 valid bits', { exact: false }).waitFor();
    const records = await page.locator('[data-result-operation]').count();
    await page.locator('.media-image-scroll').first().evaluate(node => node.scrollTo({ left: 100, top: 120, behavior: 'instant' }));
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.media-image-scroll')).every(node => node.scrollLeft === 100 && node.scrollTop === 120));
    await page.locator('#instrument-tab-parameters').click();
    await page.locator('#instrument-tab-visual').click();
    const viewports = await page.locator('.media-image-scroll').evaluateAll(nodes => nodes.map(node => [node.scrollLeft, node.scrollTop]));
    assert.deepEqual(viewports, [[100, 120], [100, 120]]);
    assert.equal(await page.locator('[data-result-operation]').count(), records);
    await page.close();
  });

  await subtest('required bit-plane channel stays visibly unselected until canonical configuration chooses it', async () => {
    const page = await context.newPage();
    await page.goto(`${origin}#/tools/image.bit_plane.extract/1`);
    await page.getByRole('button', { name: 'Use tool', exact: true }).click({ timeout: 45000 });
    await page.locator('#playground-input').fill(JSON.stringify({ width: 2, height: 1, color_model: 'gray', samples: { base64: 'AP8=' }, palette: [], transparency: { base64: '' } }));
    await page.locator('#instrument-tab-parameters').click();
    assert.equal(await page.locator('#playground-options-channel').inputValue(), '');
    await page.locator('#instrument-tab-visual').click();
    assert.equal(await page.locator('#media-channel').inputValue(), '', 'Visual must not imply a channel while Parameters is empty.');
    await page.locator('#media-channel').selectOption('gray');
    await page.getByRole('button', { name: 'Bit 0, least significant', exact: true }).click();
    await page.locator('#run-tools').click();
    await page.getByText('2 valid bits', { exact: false }).waitFor();
    await page.close();
  });

  await subtest('expanded indexed samples offer their actual RGBA bit-plane channels', async () => {
    const page = await context.newPage();
    await page.goto(`${origin}#/tools/image.bit_plane.extract/1`);
    await page.getByRole('button', { name: 'Use tool', exact: true }).click({ timeout: 45000 });
    await page.locator('#playground-input').fill(JSON.stringify({ width: 2, height: 1, color_model: 'indexed', samples: { base64: 'AAE=' }, palette: [[255, 0, 0], [0, 0, 255]], transparency: { base64: '' } }));
    await page.locator('#instrument-tab-parameters').click();
    await page.locator('#playground-options-expand_palette').check();
    await page.locator('#playground-options-channel').selectOption('red');
    await page.locator('#playground-options-bit').fill('7');
    await page.locator('#instrument-tab-visual').click();
    assert.equal(await page.locator('#media-channel').count(), 1, await page.locator('[data-instrument=bit-plane]').textContent());
    assert.equal(await page.getByLabel('Channel', { exact: true }).inputValue(), 'red');
    assert.deepEqual(await page.getByLabel('Channel', { exact: true }).locator('option').evaluateAll(nodes => nodes.map(node => node.value)), ['red', 'green', 'blue', 'alpha']);
    await page.locator('#run-tools').click();
    await page.getByText('Plane inspection (0, 0): bit 7 = 1 (raw); display 255.', { exact: true }).waitFor();
    await page.close();
  });

  await subtest('supplied PCM keeps exact frame origin and selects the actual returned channel', async () => {
    const page = await context.newPage();
    await page.goto(`${origin}#/tools/audio.spectrum/1`);
    await page.getByRole('button', { name: 'Use tool', exact: true }).click({ timeout: 45000 });
    const samples = Buffer.alloc(32);
    for (let frame = 0; frame < 8; frame++) samples.writeInt16LE(1000, frame * 4 + 2);
    await page.locator('#playground-input').fill(JSON.stringify({ channels: [0, 1], format: { bits_per_sample: 16, block_align: 4, byte_rate: 32000, channels: 2, format_tag: 1, sample_rate: 8000 }, frames: 8, start_frame: '9007199254740993', data: { base64: samples.toString('base64') } }));
    await page.locator('#instrument-tab-parameters').click();
    await page.locator('#playground-options-fft_size').fill('8');
    await page.locator('#playground-options-window').selectOption('rectangular');
    await page.locator('#instrument-tab-visual').click();
    await page.locator('#run-tools').click();
    await page.locator('[data-result-operation="audio.spectrum"]').waitFor();
    assert.equal(await page.getByLabel('Start frame', { exact: true }).inputValue(), '9007199254740993');
    assert.equal(await page.getByLabel('Start frame', { exact: true }).isEditable(), false, 'Supplied PCM range is part of its named input, not an ignored extraction option.');
    assert.equal(await page.getByLabel('Selected frames', { exact: true }).inputValue(), '8');
    assert.equal(await page.getByLabel('Selected frames', { exact: true }).isEditable(), false);
    const records = await page.locator('[data-result-operation]').count();
    await page.getByLabel('Channel (zero-based)', { exact: true }).selectOption('1');
    await page.getByText('amplitude 0.030517578125', { exact: false }).waitFor();
    assert.equal(await page.locator('[data-result-operation]').count(), records, 'Changing inspected PCM channel must not execute again.');
    assert.equal(await page.getByLabel('Shared cursor (absolute frame)', { exact: true }).inputValue(), '9007199254740993');
    assert.equal(await page.getByLabel('Time viewport end (frame)', { exact: true }).inputValue(), '9007199254741001');
    await page.getByText('Cursor 1125899906842.624125 s.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Analyze waveform, spectrum and spectrogram', exact: true }).click();
    await settleAuxiliary(page, 'media-action-analyze-waveform-spectrum-and-spectrogram');
    const canvas = page.getByRole('img', { name: /^Spectrogram,/ });
    const bounds = await canvas.boundingBox();
    await canvas.click({ position: { x: (55 + 885 / 2) / 960 * bounds.width, y: bounds.height / 2 } });
    assert.equal(await page.getByLabel('Shared cursor (absolute frame)', { exact: true }).inputValue(), '9007199254740997');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export complete spectrum JSON', exact: true }).click()]);
    assert.equal(JSON.parse(await readFile(await download.path(), 'utf8')).start_frame, '9007199254740993');
    await page.close();
  });

  await subtest('audio axes expose their accessible names through semantic groups', async () => {
    const page = await context.newPage();
    await page.goto(`${origin}#/tools/audio.wave.inspect/1`);
    await page.getByRole('button', { name: 'Use tool', exact: true }).click({ timeout: 45000 });
    await page.getByRole('button', { name: 'Load synthetic 1 kHz WAVE example', exact: true }).click();
    await page.getByRole('button', { name: 'Analyze waveform, spectrum and spectrogram', exact: true }).click();
    await page.getByRole('button', { name: 'Export complete spectrum JSON', exact: true }).waitFor();
    await settleAuxiliary(page, 'media-action-analyze-waveform-spectrum-and-spectrogram');
    for (const name of ['Waveform time axis', 'Spectrum frequency axis', 'Spectrogram time axis']) {
      assert.equal(await page.getByRole('group', { name, exact: true }).count(), 1, `${name} must have a nameable semantic role.`);
    }
    await page.close();
  });

});

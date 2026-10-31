import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyFileReadOrdering } from './support/file-ordering.mjs';
import { verifyAutomaticSelection } from './support/automatic-selection.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, extname, dirname } from 'node:path';
const require = createRequire(import.meta.url);
const engine = process.env.BROWSER_ENGINE ?? 'chromium';
const browserType = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright')[engine];
const root = resolve(new URL('../dist', import.meta.url).pathname);
const evidence = process.env.PLAYGROUND_EVIDENCE;
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };

test('packed SDK powers responsive rounds, pipelines, persistence and complete discovery', { timeout: 240000 }, async t => {
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = path.replace(/^\/docs\/playground\//, '');
    const file = resolve(root, relative || 'index.html');
    if (!path.startsWith('/docs/playground/') || !file.startsWith(`${root}/`)) { response.writeHead(404).end(); return; }
    try { response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file)); }
    catch { response.writeHead(404).end(); }
  });
  server.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  t.after(() => { server.closeAllConnections(); server.close(); });
  const browser = await browserType.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, hasTouch: true, permissions: engine === 'chromium' ? ['clipboard-read', 'clipboard-write'] : [] });
  const page = await context.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const external = []; const errors = [];
  const accessibility = [];
  const accessibilityReport = process.env.PLAYGROUND_A11Y_REPORT;
  t.after(async () => {
    if (!accessibilityReport) return;
    await mkdir(dirname(accessibilityReport), { recursive: true });
    await writeFile(accessibilityReport, `${JSON.stringify({ formatVersion: 1, scope: 'Automated WCAG A/AA rules, not manual accessibility certification', browser: engine, browserVersion: browser.version(), snapshots: accessibility }, null, 2)}\n`);
  });
  async function waitForSection(section) {
    await page.waitForFunction(section => {
      const active = document.querySelector('nav[aria-label="Primary"] a[aria-current="page"]');
      const marker = section === 'playground' ? '#playground-heading' : section === 'tools' ? '#tool-search' : '#main h1';
      return active?.hash === `#/${section}` && Boolean(document.querySelector(marker)) &&
        (section !== 'pipelines' || document.querySelector(marker).textContent === 'Pipelines');
    }, section);
  }
  async function auditAccessibility(label) {
    await page.evaluate(() => document.fonts.ready);
    if (!await page.evaluate(() => Boolean(window.axe))) await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const result = await page.evaluate(async () => {
      const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
      const summary = rule => ({ id: rule.id, impact: rule.impact, nodes: rule.nodes.map(node => ({ targets: node.target, failureSummary: node.failureSummary })) });
      return { version: window.axe.version, hash: location.hash, section: document.querySelector('nav a[aria-current=page]')?.hash, heading: document.querySelector('#main h1')?.textContent, width: innerWidth, passes: result.passes.length,
        violations: result.violations.map(summary), incomplete: result.incomplete.map(summary) };
    });
    accessibility.push({ label, ...result });
    if (label.startsWith('narrow-')) assert.equal(result.section, `#/${label.slice('narrow-'.length)}`, 'Accessibility evidence must describe the requested rendered section.');
  }

  if (evidence) await mkdir(evidence, { recursive: true });
  async function captureScreen(label) {
    if (evidence) {
      await page.locator('#main').focus();
      await page.waitForFunction(() => !document.querySelector('#notice').textContent);
    }
    for (const width of [1440, 1100, 834, 700, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} must reflow at ${width}.`);
      const small = await page.locator('main button:visible, main select:visible').evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().height < 43.5).map(node => node.id || node.textContent));
      assert.deepEqual(small, [], `${label} must retain comfortable controls at ${width}.`);
      if (evidence && [1440, 834, 390].includes(width)) await page.screenshot({ path: `${evidence}/${label}-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
  }
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(origin) && !request.url().startsWith('blob:')) external.push(request.url()); });
  await page.goto(`${origin}/docs/playground/`);
  await page.getByRole('heading', { name: 'Decode text', exact: true }).waitFor({ timeout: 45000 });
  await auditAccessibility('first-use');
  await page.getByRole('button', { name: 'Try an example', exact: true }).click();
  await page.getByRole('button', { name: 'Run tools', exact: true }).click();
  const base64 = page.locator('[data-result-operation="encoding.base64.decode"]');
  await base64.getByText('Hello, Cube!', { exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Run tools', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('#run-tools').disabled);
  await captureScreen('decode-results');
  await auditAccessibility('decode-results');
  await base64.getByRole('button', { name: 'Pin', exact: false }).click();
  await page.getByRole('button', { name: 'Pinned', exact: true }).focus(); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Pinned', 'Result filters must retain keyboard focus after rendering.');
  await page.getByRole('button', { name: 'All', exact: true }).focus(); await page.keyboard.press('Enter');

  await base64.getByRole('button', { name: 'Copy', exact: false }).click();
  if (engine === 'chromium') assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'Hello, Cube!');
  else await page.waitForFunction(() => /Copied the complete|Clipboard access is unavailable/.test(document.querySelector('#notice').textContent));
  await base64.getByRole('button', { name: 'Continue', exact: false }).click();
  await page.getByRole('button', { name: 'Continue as UTF-8 text', exact: true }).click();
  assert.equal(await page.locator('#playground-input').inputValue(), 'Hello, Cube!');
  await page.getByRole('button', { name: 'Save chosen sequence', exact: true }).click();
  await page.getByRole('heading', { name: 'Pipelines', exact: true }).waitFor();
  assert.equal(await page.locator('[data-step]').count(), 2);
  const move = page.getByRole('button', { name: 'Move up: step 2', exact: true });
  await move.focus(); await page.keyboard.press('Enter');
  assert.ok((await page.locator('[data-step="0"]').textContent()).includes('Decode UTF-8'));
  assert.ok(await page.locator('[data-step="0"] h3').evaluate(node => node === document.activeElement), 'Keyboard reordering must retain focus on the moved step.');
  await page.getByRole('button', { name: 'Move down: step 1', exact: true }).focus(); await page.keyboard.press('Enter');
  assert.ok(await page.locator('[data-step="1"] h3').evaluate(node => node === document.activeElement));
  await page.getByRole('button', { name: 'Run pipeline', exact: true }).click();
  await page.getByLabel('Pipeline result contents', { exact: true }).waitFor({ timeout: 30000 });
  await page.getByText('See each produced step', { exact: true }).click();
  assert.equal(await page.locator('#pipeline-result .viewer').count(), 3);
  await captureScreen('pipeline-editor');
  await auditAccessibility('pipeline-editor-with-intermediates');
  await page.locator('#pipeline-input').fill('changed');
  await page.getByText('Produced with earlier input or settings. Run again for the edited pipeline.', { exact: true }).waitFor();
  const [definitionDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export pipeline', exact: true }).click()]);
  const exportedDocument = JSON.parse(await readFile(await definitionDownload.path(), 'utf8'));
  assert.equal(exportedDocument.input_data_json, undefined);
  assert.equal(JSON.parse(exportedDocument.definition_json).input.source, 'slot');
  assert.ok(!exportedDocument.definition_json.includes('changed'));
  await page.getByRole('button', { name: 'Save local copy', exact: true }).click();
  await page.getByText('Pipeline saved in this browser.', { exact: true }).waitFor();
  await page.getByRole('button', { name: '← Saved pipelines', exact: true }).click();
  await page.getByText('Definition only', { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Open', exact: true }).waitFor({ timeout: 45000 });
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-step]').length === 2);
  assert.equal(await page.locator('[data-step]').count(), 2, 'Reopening a normal saved pipeline must restore editable steps.');
  await page.locator('#pipeline-input').fill('SGVsbG8sIEN1YmUh');
  await page.getByRole('button', { name: 'Run pipeline', exact: true }).click();
  await page.getByLabel('Pipeline result contents', { exact: true }).waitFor({ timeout: 30000 });
  await page.locator('#add-step').selectOption('cipher.rot13');
  await page.getByRole('button', { name: 'Add selected step', exact: true }).click();
  await page.getByRole('button', { name: 'Run pipeline', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Pipeline result contents"]')?.textContent === 'Uryyb, Phor!');
  await page.locator('[data-step="2"]').getByRole('button', { name: 'Remove', exact: true }).click();
  assert.ok(await page.locator('[data-step="1"] h3').evaluate(node => node === document.activeElement), 'Removing a step must focus its nearest remaining step.');
  await page.getByRole('button', { name: 'Undo removal', exact: true }).click();
  assert.ok(await page.locator('[data-step="2"] h3').evaluate(node => node === document.activeElement), 'Undo must return focus to the restored step.');
  await page.locator('[data-step="2"]').getByRole('button', { name: 'Remove', exact: true }).click();


  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'All tools', exact: true }).click();
  await page.locator('#tool-search').fill('Base64');
  await page.locator('[data-tool="encoding.base64"]').click();
  await page.getByRole('heading', { name: 'Example', exact: true }).waitFor({ timeout: 3000 });
  assert.ok((await page.getByLabel('Example input input', { exact: true }).textContent()).includes('AP8='));
  assert.ok((await page.getByLabel('Example output output', { exact: true }).textContent()).includes('base64'));
  await auditAccessibility('selected-tool-reference');
  await page.getByText('Technical details', { exact: true }).click();
  const contractText = await page.getByLabel('Exact operation contract', { exact: true }).textContent();
  for (const field of ['"inputs"', '"outputs"', '"parameters"', '"errors"', '"limits"']) assert.ok(contractText.includes(field));
  const staleDetails = '**/tool-details/encoding.base64.encode.json';
  await page.route(staleDetails, async route => { const response = await route.fetch(); const data = await response.json(); await route.fulfill({ response, json: { ...data, catalog_sha256: 'stale' } }); });
  await page.locator('#tool-action').selectOption('encoding.base64.encode');
  await page.getByText('Tool detail identity differs from the selected operation. Reload the complete site.', { exact: true }).waitFor({ timeout: 3000 });
  await page.unroute(staleDetails);
  await page.getByRole('button', { name: 'Retry reference details', exact: true }).click();
  await page.getByRole('heading', { name: 'Example', exact: true }).waitFor();
  assert.equal(new URL(page.url()).hash, '#/tools/encoding.base64.encode/1', 'A grouped action must have an exact operation/version link.');
  await page.reload();
  await page.locator('#tool-action').waitFor({ timeout: 45000 });
  assert.equal(await page.locator('#tool-action').inputValue(), 'encoding.base64.encode');
  await page.goto(`${origin}/docs/playground/#/tools/encoding.base64.decode/999`);
  await page.getByText('This link requests operation version 999. This catalog provides version 1. Choose the current version to use this tool.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Use tool', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Open current version', exact: true }).click();
  assert.equal(await page.locator('#tool-action').inputValue(), 'encoding.base64.decode');
  await page.getByRole('button', { name: 'Use tool', exact: true }).click();
  await page.locator('#playground-input').fill('!not base64!');
  await page.getByRole('button', { name: 'Run tools', exact: true }).click();
  await page.getByText('Not applicable or needs options (1)', { exact: true }).waitFor({ timeout: 30000 });
  await page.locator('#playground-input').fill('AP8=');
  await page.getByRole('button', { name: 'Run tools', exact: true }).click();
  await page.locator('[data-result-operation="encoding.base64.decode"]').waitFor({ timeout: 30000 });
  const binary = page.locator('[data-result-operation="encoding.base64.decode"]');
  await binary.getByText('Export', { exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), binary.getByRole('button', { name: 'Download exact bytes', exact: true }).click()]);
  assert.deepEqual(new Uint8Array(await readFile(await download.path())), Uint8Array.of(0, 255));
  await page.locator('#playground-input').fill('changed');
  await binary.getByText('From an earlier input or settings.', { exact: true }).waitFor();

  await page.getByRole('button', { name: 'Encode', exact: true }).click();
  await page.locator('#playground-file').setInputFiles({ name: 'exact-bytes.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([0, 255]) });
  await page.getByText('exact-bytes.bin', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Run tools', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('#run-tools').disabled);
  assert.equal(await page.getByLabel('Encode Base64 contents', { exact: true }).textContent(), 'AP8=', 'A binary file must reach Core without text replacement or coercion.');
  await auditAccessibility('binary-file-encode');
  await page.getByRole('button', { name: 'Decode', exact: true }).click();
  await page.getByRole('button', { name: 'Run tools', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('#run-tools').disabled);
  assert.equal(await page.locator('[data-result-operation]').count(), 0, 'Invalid UTF-8 bytes must not become replacement-character success.');
  await page.getByText('Not applicable or needs options (1)', { exact: true }).click();
  assert.match(await page.locator('#results-section .compact-list').textContent(), /UTF-8|encoding/i);
  await auditAccessibility('invalid-utf8-file');
  await page.locator('#playground-file').setInputFiles({ name: 'unicode-lines.txt', mimeType: 'text/plain', buffer: Buffer.from('café\r\n', 'utf8') });
  await page.getByText('unicode-lines.txt', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Run tools', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('#run-tools').disabled);
  assert.equal(await page.getByLabel('Decode UTF-8 contents', { exact: true }).textContent(), 'café\r\n', 'Files retain Unicode and exact CRLF data through the explicit UTF-8 operation.');
  await auditAccessibility('unicode-file-decode');
  await page.getByRole('button', { name: 'Encode', exact: true }).click();
  await page.getByRole('button', { name: 'Try an example', exact: true }).click();
  await page.getByRole('button', { name: 'Run tools', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('#run-tools').disabled);
  assert.equal(await page.locator('[data-result-operation="encoding.base64.encode"]').count(), 1);
  assert.equal(await page.locator('.input-options').evaluate(node => [...node.childNodes].some(child => child.nodeType === 3 && child.textContent.includes('null'))), false);
  await captureScreen('encode-results');
  await auditAccessibility('encode-results');
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'All tools', exact: true }).click();
  await page.locator('#tool-search').fill('file.info.inspect');
  await page.locator('[data-tool="file.info.inspect"]').click();
  assert.equal(await page.getByRole('button', { name: 'Use tool', exact: true }).isDisabled(), true);
  await page.getByText('This operation is documented in Cube. No executable binding is available in this browser runtime.', { exact: true }).waitFor();
  await auditAccessibility('unavailable-tool');
  await page.locator('#tool-search').fill('binary.xor');
  await page.locator('[data-tool="binary.xor"]').click();
  await page.getByRole('button', { name: 'Use tool', exact: true }).click();
  await page.getByRole('button', { name: 'Run tools', exact: true }).click();
  await page.getByText('Not applicable or needs options (1)', { exact: true }).waitFor();
  await page.getByText('Not applicable or needs options (1)', { exact: true }).click();
  await page.getByText('Add key to use this tool.', { exact: true }).waitFor();
  await auditAccessibility('missing-key');
  const beforeFile = await page.locator('#playground-input').inputValue();
  await page.locator('#playground-file').setInputFiles({ name: 'too-large.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(128 * 1024 + 1) });
  await page.getByText('Choose a file no larger than 128 KiB for this Playground.', { exact: true }).waitFor();
  assert.equal(await page.locator('#playground-input').inputValue(), beforeFile);
  for (const width of [1440, 1100, 834, 700, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const section of ['playground', 'pipelines', 'tools']) {
      await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: section === 'playground' ? 'Playground' : section === 'pipelines' ? 'Pipelines' : 'All tools', exact: true }).click();
      await waitForSection(section);
      if (section === 'tools') { await page.locator('#tool-search').fill('Base64'); await page.locator('[data-tool="encoding.base64"]').click(); }
      const smallControls = await page.evaluate(() => [...document.querySelectorAll('main button, main select, main input:not([type=file]), main .check')].filter(node => node.getClientRects().length && !(node.matches('input[type=checkbox]') && node.closest('.check'))).map(node => ({ tag: node.tagName, id: node.id, height: node.getBoundingClientRect().height })).filter(node => node.height < 43.5));
      assert.deepEqual(smallControls, [], `${section} needs comfortable touch targets at ${width}`);
      const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      if (dimensions.scroll > dimensions.width) {
        t.diagnostic(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('main *')].map(node => { const box = node.getBoundingClientRect(); const style = getComputedStyle(node); return { tag: node.tagName, id: node.id, class: node.className, right: Math.round(box.right), width: Math.round(box.width), minWidth: style.minWidth, maxWidth: style.maxWidth, display: style.display }; }).filter(node => node.right > innerWidth).slice(0, 25))));
        if (evidence) await page.screenshot({ path: `${evidence}/overflow-${engine}-${section}-${width}.png`, fullPage: true });
      }
      assert.ok(dimensions.scroll <= dimensions.width, `${section} overflow at ${width}: ${dimensions.scroll}`);
      if (evidence && [1440, 834, 390, 320].includes(width)) await page.screenshot({ path: `${evidence}/${section}-${width}.png`, fullPage: true });
      if (width === 320) await auditAccessibility(`narrow-${section}`);
      if (section === 'tools' && width <= 700) {
        await page.getByRole('button', { name: '← Back to tools', exact: true }).tap();
        assert.equal(await page.locator('#tool-search').inputValue(), 'Base64');
        await page.waitForFunction(() => document.activeElement?.getAttribute('data-tool') === 'encoding.base64');
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-tool')), 'encoding.base64');
        await page.locator('[data-tool="encoding.base64"]').waitFor({ state: 'visible' });
      }
    }
  }
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => document.activeElement !== document.body));
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Pipelines', exact: true }).click();
  await page.locator('input[accept]').setInputFiles({ name: 'pipeline.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exportedDocument)) });
  await page.waitForFunction(() => document.querySelector('#pipeline-input')?.value === '');
  assert.equal(await page.locator('[data-step]').count(), 2);
  assert.equal(await page.locator('#pipeline-input').inputValue(), '');
  await page.locator('input[accept]').setInputFiles({ name: 'graph.json', mimeType: 'application/json', buffer: Buffer.from('{"nodes":[],"edges":[]}') });
  await page.locator('.warning').filter({ hasText: 'invalid schema: check required/unknown fields, parameter types and explicit data tags' }).waitFor();
  assert.equal(await page.locator('[data-step]').count(), 2);
  assert.equal(await page.locator('#pipeline-input').inputValue(), '');
  await page.getByText(/Import an ordered Core Recipe; Play graphs are not supported/).first().waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Import recovery must reflow at narrow width.');
  // CSS text enlargement exercises reflow; it is not native browser zoom or a physical-device claim.
  const enlargedText = await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 834, height: 600 }, { width: 320, height: 600 }]) {
    await page.setViewportSize(viewport);
    for (const section of ['playground', 'pipelines', 'tools']) {
      await page.goto(`${origin}/docs/playground/#/${section}`);
      await waitForSection(section);
      if (section === 'tools') { await page.locator('#tool-search').fill('Base64'); await page.locator('[data-tool="encoding.base64"]').click(); }
      const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, font: getComputedStyle(document.documentElement).fontSize }));
      assert.equal(dimensions.font, '32px');
      if (dimensions.scroll > dimensions.width) t.diagnostic(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('body *')].map(node => ({ tag: node.tagName, id: node.id, class: node.className, right: Math.round(node.getBoundingClientRect().right), width: Math.round(node.getBoundingClientRect().width) })).filter(node => node.right > innerWidth).slice(0, 20))));
      assert.ok(dimensions.scroll <= dimensions.width, `${section} must reflow with 200% text at ${viewport.width}: ${dimensions.scroll}`);
      const shortSelectors = await page.locator('main select:visible').evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().height < Number.parseFloat(getComputedStyle(node).fontSize) * 2).map(node => node.id));
      assert.deepEqual(shortSelectors, [], 'Native selectors must grow with enlarged text.');
    }
  }
  await enlargedText.evaluate(node => node.remove());
  await page.setViewportSize({ width: 844, height: 390 });
  for (const section of ['playground', 'pipelines', 'tools']) {
    await page.goto(`${origin}/docs/playground/#/${section}`);
    await waitForSection(section);
    if (section === 'tools') { await page.locator('#tool-search').fill('Base64'); await page.locator('[data-tool="encoding.base64"]').click(); }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${section} must fit a short landscape viewport.`);
  }
  const blockedStorage = await context.newPage();
  await blockedStorage.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage disabled', 'SecurityError'); } }));
  blockedStorage.on('pageerror', error => errors.push(error.message));
  await blockedStorage.goto(`${origin}/docs/playground/`);
  await blockedStorage.getByRole('heading', { name: 'Decode text', exact: true }).waitFor({ timeout: 45000 });
  await blockedStorage.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Pipelines', exact: true }).click();
  await blockedStorage.getByRole('heading', { name: 'Recover saved pipelines', exact: true }).waitFor();
  await blockedStorage.close();
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Playground', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Clear session history', exact: true }).click();
  await page.getByRole('button', { name: 'Encode', exact: true }).click();
  await page.getByRole('button', { name: 'Run tools', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('#run-tools').disabled);
  assert.equal(await page.getByLabel('Encode Base64 contents', { exact: true }).textContent(), '', 'Empty output is a valid real result rather than a loading or missing-result state.');
  await auditAccessibility('empty-input-encode');
  const longText = 'x'.repeat(6000);
  const longEncoded = Buffer.from(longText).toString('base64');
  await page.locator('#playground-input').fill(longText);
  await page.getByRole('button', { name: 'Run tools', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('#run-tools').disabled);
  const longResult = page.locator('[data-result-operation="encoding.base64.encode"]');
  assert.equal(await longResult.getByLabel('Encode Base64 contents', { exact: true }).textContent(), longEncoded.slice(0, 4096));
  await longResult.getByText('Export', { exact: true }).click();
  const [longDownload] = await Promise.all([page.waitForEvent('download'), longResult.getByRole('button', { name: 'Download selected view', exact: true }).click()]);
  assert.equal(await readFile(await longDownload.path(), 'utf8'), longEncoded, 'Export must preserve all 8,000 characters despite the 4,096-character preview.');
  await longResult.getByRole('button', { name: 'Copy', exact: false }).click();
  if (engine === 'chromium') assert.equal(await page.evaluate(() => navigator.clipboard.readText()), longEncoded);
  await captureScreen('long-encode-results');
  await auditAccessibility('long-encode-results');

  await verifyFileReadOrdering(page, exportedDocument);
  await verifyAutomaticSelection(context, origin);

  assert.deepEqual(accessibility.flatMap(snapshot => snapshot.violations.map(rule => ({ label: snapshot.label, ...rule }))), [], 'Automated accessibility violations must be resolved without disabling rules.');
  t.diagnostic(`axe-core ${accessibility[0]?.version}: ${accessibility.length} snapshots; ${accessibility.reduce((sum, snapshot) => sum + snapshot.incomplete.length, 0)} rule checks require manual review.`);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  t.diagnostic(`Actual browser ${browser.version()}; local packed SDK, binary export, provenance, persistence and six viewport widths verified.`);
});

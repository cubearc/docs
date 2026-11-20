import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const engine = process.env.BROWSER_ENGINE ?? 'chromium';
const root = fileURLToPath(new URL('../dist', import.meta.url));
const mime = { '.css': 'text/css', '.html': 'text/html', '.json': 'application/json',
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm' };

test('SipHash displays an exact local result without adding a session entry', { timeout: 120000 }, async t => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const file = resolve(root, path.slice(1) || 'index.html');
    if (!file.startsWith(root + sep)) { response.writeHead(404).end(); return; }
    try {
      response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
      response.end(await readFile(file));
    } catch {
      response.end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const browser = await require(process.env.PLAYWRIGHT_MODULE ?? 'playwright')[engine].launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const base = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(base + '#/tools/hash.siphash24/1');
  const key = page.getByLabel('Key (Base64 bytes)');
  await key.waitFor();
  assert.equal(await key.getAttribute('type'), 'password');
  await key.fill('AAECAwQFBgcICQoLDA0ODw==');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const result = page.locator('[data-result-operation="hash.siphash24"]');
  await result.getByText(/310e0edd47db6f72/).waitFor();
  assert.equal(await key.inputValue(), '');
  assert.equal(await result.getByRole('button', { name: /Pin |Use as input|Download run details/ }).count(), 0);
  assert.equal(await page.getByText('Previous rounds and original input', { exact: false }).count(), 0);
  assert.ok(!(await page.locator('#main').innerHTML()).includes('AAECAwQFBgcICQoLDA0ODw=='));
  assert.ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes('310e0edd47db6f72'));
  await page.evaluate(() => { location.hash = '#/playground'; });
  await page.getByRole('heading', { name: 'Multidecoder' }).waitFor();
  await page.evaluate(() => { location.hash = '#/tools/hash.siphash24/1'; });
  await key.waitFor();
  assert.equal(await key.inputValue(), '');
  assert.equal(await result.count(), 0);
  assert.deepEqual(errors, []);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { instrumentBrowser } from './support/instrument-browser.mjs';

const require = createRequire(import.meta.url);
const reportPath = process.env.PLAYGROUND_A11Y_REPORT;
const sourceOverrides = process.env.PLAYGROUND_SOURCE_OVERRIDES === '1';
const evidence = process.env.PLAYGROUND_EVIDENCE;

// This inspects Chromium's platform accessibility tree and DOM geometry. It does
// not claim to exercise a native screen reader, browser zoom, or physical device.
test('resolve symbol and workbench accessibility review conditions', { timeout: 240000, skip: (process.env.BROWSER_ENGINE ?? 'chromium') !== 'chromium' }, async t => {
  const { browser, context, base } = await instrumentBrowser(t, { sourceFiles: sourceOverrides ? ['instruments/symbols.mjs', 'instruments/symbols.css', 'instruments/workbench.mjs', 'instruments/shell.mjs'] : [] });
  const errors = [];
  t.after(() => assert.deepEqual(errors, [], 'No uncaught browser errors in the accessibility review.'));
  const reports = [];
  if (evidence) await mkdir(evidence, { recursive: true });
  t.after(async () => {
    if (!reportPath) return;
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify({ browser: 'chromium', browserVersion: browser.version(), harnessVersion: require((process.env.PLAYWRIGHT_MODULE ?? 'playwright') + '/package.json').version,
      sourceOverrides, scope: 'Targeted review of prior axe incomplete findings, actual Chromium platform AX roles/names/states, keyboard focus, CSS contrast and content bounds. No native assistive technology, physical-device or native-zoom claim.', reports }, null, 2));
  });
  async function open(kind) {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}#/tools`);
    await page.getByText('Visual instruments · 20 workbenches', { exact: true }).click({ timeout: 45000 });
    await page.locator(`[data-open-instrument="${kind}"]`).click();
    await page.locator(`[data-instrument="${kind}"]`).waitFor();
    if (kind === 'pigpen') await page.locator('#playground-input').fill('["A","B"," "]');
    else {
      await page.locator('#load-core-example').click();
      await page.getByText('Synthetic Core example loaded. Run to produce your own result.', { exact: true }).waitFor();
    }
    await page.locator(`[data-instrument="${kind}"] button`).first().waitFor();
    if (kind === 'morse') {
      await page.locator('#playground-input').fill('SOS');
      await page.locator('#run-tools').click();
      await page.waitForFunction(() => !document.querySelector('#run-tools').disabled);
    }
    if (kind === 'book') {
      await page.locator('#book-index').click();
      await page.locator('#book-cell-0').waitFor();
    }
    return page;
  }
  async function platformNode(page, selector) {
    const client = await context.newCDPSession(page);
    try {
      const { root } = await client.send('DOM.getDocument');
      const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      const { node } = await client.send('DOM.describeNode', { nodeId });
      const { nodes } = await client.send('Accessibility.getPartialAXTree', { backendNodeId: node.backendNodeId, fetchRelatives: false });
      const ax = nodes.find(item => item.backendDOMNodeId === node.backendNodeId);
      return { selector, ignored: ax?.ignored, role: ax?.role?.value, name: ax?.name?.value,
        properties: Object.fromEntries((ax?.properties ?? []).map(p => [p.name, p.value.value])), ignoredReasons: ax?.ignoredReasons };
    } finally { await client.detach(); }
  }
  async function review(page, kind) {
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const review = await page.evaluate(async () => {
      const result = await window.axe.run(document, { runOnly: { type: 'rule', values: ['label-content-name-mismatch', 'color-contrast', 'aria-prohibited-attr'] } });
      const brief = rule => ({ id: rule.id, nodes: rule.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) });
      const candidates = [...new Set(result.incomplete.filter(r => r.id === 'label-content-name-mismatch').flatMap(r => r.nodes).flatMap(n => n.target))];
      const visibleText = node => {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT); const parts = [];
        while (walker.nextNode()) {
          const parent = walker.currentNode.parentElement;
          if (parent.closest('[aria-hidden="true"]')) continue;
          const style = getComputedStyle(parent);
          if (style.display !== 'none' && style.visibility !== 'hidden') parts.push(walker.currentNode.textContent);
        }
        return parts.join('').trim().replace(/\s+/g, ' ');
      };
      const labels = candidates.map(selector => { const node = document.querySelector(selector); return { selector, visible: visibleText(node), declaredName: node.getAttribute('aria-label') }; });
      const colors = result.incomplete.filter(r => r.id === 'color-contrast').flatMap(r => r.nodes).map(n => {
        const node = document.querySelector(n.target[0]); let parent = node; let background;
        while (parent) { const color = getComputedStyle(parent).backgroundColor; if (/^rgb\(/.test(color)) { background = color; break; } parent = parent.parentElement; }
        const css = getComputedStyle(node);
        return { selector: n.target[0], foreground: node instanceof SVGElement ? css.fill : css.color, background, fontSize: css.fontSize, text: node.textContent, decorative: Boolean(node.closest('[aria-hidden="true"]')) };
      });
      return { violations: result.violations.map(brief), incomplete: result.incomplete.map(brief), labels, colors };
    });
    // WCAG relative luminance for the actual opaque CSS foreground/backgrounds.
    const luminance = color => {
      const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      if (!channels || channels.length !== 3) return null;
      return channels.map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
    };
    for (const color of review.colors) {
      const fg = luminance(color.foreground); const bg = luminance(color.background ?? '');
      color.ratio = fg === null || bg === null ? null : (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
    }
    const names = [];
    for (const label of review.labels) names.push({ ...label, platform: await platformNode(page, label.selector) });
    reports.push({ kind, review, names });
    assert.deepEqual(review.violations, [], `${kind}: concrete axe violation in targeted rules`);
    for (const item of names) {
      assert.equal(item.platform.ignored, false, `${kind}: named control is exposed`);
      assert.equal(item.platform.role, 'button', `${kind}: actual button role`);
      assert.ok(item.platform.name?.toLocaleLowerCase().includes(item.visible.toLocaleLowerCase()), `${kind}: literal visible content ${JSON.stringify(item.visible)} must be in actual AX name ${JSON.stringify(item.platform.name)}`);
    }
    for (const color of review.colors) assert.ok(color.ratio !== null && color.ratio >= 4.5, `${kind}: ${color.selector} actual CSS contrast ${color.ratio}`);
  }
  for (const kind of ['scytale', 'cardan', 'semaphore', 'pigpen', 'braille', 'morse', 'keyboard', 'polybius', 'book', 'graph']) {
    await t.test(`${kind}: targeted incomplete review and platform semantics`, async () => {
      const page = await open(kind);
      try {
        await review(page, kind);
        if (kind === 'braille') {
          const unicode = await platformNode(page, '.braille-unicode');
          reports.push({ kind, unicode });
          assert.equal(unicode.ignored, false);
          assert.notEqual(unicode.role, 'generic', 'Unicode preview must expose a supported semantic role for its accessible name');
          assert.match(unicode.name ?? '', /Unicode|Braille/i);
          const dot = page.locator('#visual-braille-dot-1');
          await dot.focus(); await page.keyboard.press('Space');
          assert.equal(await page.evaluate(() => document.activeElement.id), 'visual-braille-dot-1');
          const state = await platformNode(page, '#visual-braille-dot-1');
          reports.push({ kind, dot: state });
          assert.equal(state.properties.pressed, 'true');
        }
        if (kind === 'morse') {
          await page.getByRole('button', { name: 'Compose signals', exact: true }).click();
          await page.addStyleTag({ content: 'html{font-size:200%}' });
          await page.setViewportSize({ width: 320, height: 1000 });
          const bounds = await page.locator('#visual-symbol-dash').evaluate(button => {
            const container = button.getBoundingClientRect();
            const nodes = [...button.querySelectorAll('*')].map(node => { const r = node.getBoundingClientRect(); return { class: node.className, text: node.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
            return { container: { left: container.left, right: container.right, top: container.top, bottom: container.bottom }, nodes };
          });
          reports.push({ kind, enlargedDashBounds: bounds });
          if (evidence) { await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await page.screenshot({ path: `${evidence}/morse-200-320.png`, fullPage: true }); await page.locator('.morse-composer').screenshot({ path: `${evidence}/morse-composer-200-320.png` }); }
          assert.ok(bounds.nodes.every(n => n.left >= bounds.container.left - 1 && n.right <= bounds.container.right + 1 && n.top >= bounds.container.top - 1 && n.bottom <= bounds.container.bottom + 1), 'Every visible Dash glyph and text must fit its button at 200% CSS text/320px');
        }
      } finally { await page.close(); }
    });
  }
  await t.test('Graph layout movement retains the activating keyboard control', async () => {
    const page = await open('graph');
    try {
      const move = page.getByRole('button', { name: 'Move A left', exact: true });
      await move.focus(); await page.keyboard.press('Enter');
      const focused = await page.evaluate(() => ({ tag: document.activeElement.tagName, id: document.activeElement.id, name: document.activeElement.getAttribute('aria-label') ?? (document.activeElement.tagName === 'BODY' ? '(document body)' : document.activeElement.textContent) }));
      reports.push({ kind: 'graph', keyboardAfterMove: focused });
      assert.equal(focused.name, 'Move A left', 'A layout edit must retain focus so keyboard users can continue positioning the same node');
    } finally { await page.close(); }
  });
  await t.test('Book paging retains keyboard focus without changing input', async () => {
    const page = await open('book');
    try {
      await page.locator('#playground-input').fill('A'.repeat(321));
      await page.locator('#book-index').click(); await page.getByText(/321 of 321 indexed scalars/).waitFor();
      const next = page.getByRole('button', { name: 'Next source cells', exact: true });
      await next.focus(); await page.keyboard.press('Enter');
      const focused = await page.evaluate(() => ({ tag: document.activeElement.tagName, name: document.activeElement.tagName === 'BODY' ? '(document body)' : document.activeElement.textContent }));
      reports.push({ kind: 'book', keyboardAfterPage: focused });
      assert.equal(await page.locator('#playground-input').inputValue(), 'A'.repeat(321));
      assert.equal(focused.name, 'Next source cells', 'Paging must retain its still-enabled keyboard control');
    } finally { await page.close(); }
  });
  await t.test('Custom Polybius paging retains keyboard focus without running', async () => {
    const page = await open('polybius');
    try {
      await page.locator('#polybius-preset').selectOption('custom');
      await page.locator('#polybius-alphabet').fill('ABCDEFGHIKLMNOPQRSTUVWXYZ' + Array.from({ length: 17 * 17 - 25 }, (_, n) => String.fromCodePoint(0x400 + n)).join(''));
      await page.locator('#polybius-alphabet').press('Tab');
      await page.locator('#polybius-side').fill('17'); await page.locator('#polybius-side').press('Tab');
      const next = page.getByRole('button', { name: 'Next rows', exact: true });
      await next.focus(); await page.keyboard.press('Enter');
      const focused = await page.evaluate(() => ({ tag: document.activeElement.tagName, name: document.activeElement.tagName === 'BODY' ? '(document body)' : document.activeElement.textContent }));
      reports.push({ kind: 'polybius', keyboardAfterPage: focused });
      assert.equal(focused.name, 'Next rows', 'Paging must retain its still-enabled keyboard control');
      assert.equal(await page.locator('[data-result-operation]').count(), 0);
    } finally { await page.close(); }
  });
});

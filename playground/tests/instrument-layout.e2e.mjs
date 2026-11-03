import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir} from 'node:fs/promises';
import {instrumentBrowser} from './support/instrument-browser.mjs';
import {instrumentSeries} from '../src/instruments/registry.mjs';

// Read one layout frame in document coordinates. A native smooth-scroll started
// by keyboard focus must not make sequential viewport rectangles disagree.
const geometry = page => page.evaluate(() => Object.fromEntries([
  ['surface', '.instrument-surface'], ['input', '#input-section'], ['result', '#results-section'],
].map(([name, selector]) => {
  const rect = document.querySelector(selector).getBoundingClientRect();
  return [name, {x:rect.x + scrollX, y:rect.y + scrollY, width:rect.width, height:rect.height}];
})));

test('action menus and paired glyph targets fit narrow enlarged-text views', {timeout:120000}, async t => {
  const {context, base} = await instrumentBrowser(t);
  const folder = process.env.PLAYGROUND_EVIDENCE;
  if (folder) await mkdir(folder, {recursive:true});
  for (const kind of ['pigpen', 'keyboard', 'book', 'audio']) {
    await t.test(kind, async () => {
      const page = await context.newPage();
      try {
        await page.goto(base + '#/tools');
        await page.getByText('Visual instruments · 20 workbenches', {exact:true}).click({timeout:45000});
        await page.locator(`[data-open-instrument="${kind}"]`).click();
        await page.locator('#load-core-example').click();
        await page.getByText('Synthetic Core example loaded. Run to produce your own result.', {exact:true}).waitFor();
        await page.setViewportSize({width:320, height:1000});
        for (const size of [100, 200]) {
          await page.evaluate(size => { document.documentElement.style.fontSize = `${size}%`; }, size);
          const layout = await page.evaluate(() => {
            const keys = [...document.querySelectorAll('.pigpen-letter-pair button')];
            const overlaps = keys.flatMap((a, index) => keys.slice(index + 1).filter(b => {
              const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
              return Math.min(x.right,y.right) - Math.max(x.left,y.left) > 1 && Math.min(x.bottom,y.bottom) - Math.max(x.top,y.top) > 1;
            }).map(b => [a.id,b.id]));
            return {width:innerWidth, scroll:document.documentElement.scrollWidth, overlaps};
          });
          if (folder) await page.screenshot({path:`${folder}/${kind}-menu-text${size}-320.png`, fullPage:true});
          assert.ok(layout.scroll <= layout.width, `${kind} ${size}% reflow: ${JSON.stringify(layout)}`);
          assert.deepEqual(layout.overlaps, [], `${kind} ${size}% glyph targets remain separate`);
          if (kind === 'audio') {
            const clippedValues = await page.evaluate(() => {
              const context = document.createElement('canvas').getContext('2d');
              return [...document.querySelectorAll('.media-audio-controls input, .media-audio-controls select')].flatMap(control => {
                const style = getComputedStyle(control);
                context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
                const value = control.selectedOptions?.[0]?.textContent ?? control.value;
                const available = control.getBoundingClientRect().width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth) - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
                return context.measureText(value).width > available + 1 ? [{id:control.id, value, available}] : [];
              });
            });
            assert.deepEqual(clippedValues, [], `${size}% audio example values remain readable`);
          }
          const fragmentedWords = await page.evaluate(() => {
            const broken = [];
            for (const control of document.querySelectorAll('#run-tools, #instrument-tab-visual, #instrument-tab-parameters, #input-section .input-main .toolbar button, .instrument-jumps a, .media-audio-commandbar button, .site-header nav a')) {
              const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
              while (walker.nextNode()) {
                const node = walker.currentNode;
                for (const match of node.textContent.matchAll(/[A-Za-z]+/g)) {
                  const range = document.createRange();
                  range.setStart(node,match.index); range.setEnd(node,match.index + match[0].length);
                  if ([...range.getClientRects()].filter(rect => rect.width > 0).length > 1) broken.push(match[0]);
                }
              }
            }
            return broken;
          });
          assert.deepEqual(fragmentedWords, [], `${kind} ${size}% essential labels preserve whole words`);
        }
        const action = page.locator('#instrument-action');
        const original = await action.inputValue();
        await page.locator('.section-jumps a').last().focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'instrument-action', 'The native menu remains in the keyboard focus order.');
        const next = await action.locator('option').evaluateAll((options, current) => options.find(option => option.value !== current).value, original);
        await action.selectOption(next);
        assert.equal(await page.locator('#instrument-action').inputValue(), next, 'A native menu selection changes the action.');
      } finally { await page.close(); }
    });
  }
});

test('an instrument immediately shows its main output without losing named outputs', {timeout:60000}, async t => {
  const {open} = await instrumentBrowser(t);
  const page = await open('cipher.enigma', 'enigma');
  await page.locator('#run-tools').click();
  const card = page.locator('[data-result-operation="cipher.enigma"]');
  await card.waitFor();
  assert.equal(await card.locator('.viewer pre').count(), 1, 'The completed output is visible without another choice.');
  assert.equal(await card.locator('.viewer pre').textContent(), 'BDZGO');
  const calls = await page.evaluate(() => window.instrumentCalls);
  await card.locator('select[id^="output-"]').selectOption('final_windows');
  assert.equal(await card.locator('.viewer pre').textContent(), 'AAF');
  await page.locator('#instrument-tab-parameters').click();
  await page.locator('#instrument-tab-visual').click();
  assert.equal(await card.locator('.viewer pre').textContent(), 'AAF', 'An explicit output choice survives a redraw.');
  assert.equal(await page.evaluate(() => window.instrumentCalls), calls);
  await page.close();
  const book = await open('cipher.book.encode', 'book');
  await book.locator('#run-tools').click();
  const bookResult = book.locator('[data-result-operation="cipher.book.encode"]');
  await bookResult.waitFor();
  assert.equal(await bookResult.locator('select[id^="output-"]').inputValue(), 'coordinates', 'Show the encoded coordinates before secondary counts or hashes.');
  await book.close();
});

test('visual instruments keep the working surface beside input and results', {timeout:240000}, async t => {
  const {context, base} = await instrumentBrowser(t);
  const folder = process.env.PLAYGROUND_EVIDENCE;
  if (folder) await mkdir(folder, {recursive:true});
  for (const {kind} of instrumentSeries) {
    await t.test(kind, async () => {
      const page = await context.newPage();
      try {
        await page.goto(base + '#/tools');
        await page.getByText('Visual instruments · 20 workbenches', {exact:true}).click({timeout:45000});
        await page.locator(`[data-open-instrument="${kind}"]`).click();
        await page.locator('#load-core-example').click();
        await page.getByText('Synthetic Core example loaded. Run to produce your own result.', {exact:true}).waitFor();
        await page.locator(`[data-instrument="${kind}"] button, [data-instrument="${kind}"] input`).first().waitFor();
        if (kind === 'enigma') await page.getByLabel('Record post-step windows', {exact:true}).check();
        await page.locator('#run-tools').click();
        await page.locator('[data-result-operation]').last().waitFor();
        await page.waitForFunction(() => !document.querySelector('#run-tools').disabled);
        if (kind === 'pigpen') assert.equal(await page.locator('.result-card select[id^="output-"]').inputValue(), 'tokens', 'The encoded symbols precede their provenance metadata.');
        if (kind === 'enigma') await page.locator('#mechanism-trace-next').click();
        if (kind === 'book') {
          await page.locator('#book-index').click();
          await page.locator('#book-cell-0').click();
        }
        if (kind === 'polybius') await page.locator('#polybius-cell-7').click();
        await page.evaluate(() => window.scrollTo(0, 0));
        const {surface, input, result} = await geometry(page);
        assert.ok(surface.width > input.width * 2, 'The instrument is the dominant work area.');
        assert.ok(surface.x + surface.width <= input.x, 'Input sits beside the instrument.');
        assert.ok(Math.abs(surface.y - input.y) < 2, 'Input and instrument start together.');
        assert.ok(Math.abs(result.x - input.x) < 2, 'Result follows its input in the same rail.');
        assert.ok(surface.y < 360, 'The instrument starts within the first viewport.');
        const calls = await page.evaluate(() => window.instrumentCalls);
        await page.locator('#instrument-tab-parameters').click();
        assert.ok(await page.locator('#instrument-parameter-panel').isVisible());
        await page.locator('#instrument-tab-visual').click();
        assert.equal(await page.evaluate(() => window.instrumentCalls), calls);
        for (const width of [1440, 390, 320]) {
          await page.setViewportSize({width, height:1000});
          await page.evaluate(() => document.fonts.ready);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${kind} reflows at ${width}`);
          if (width < 700) {
            const {input:top, surface:visual, result:bottom} = await geometry(page);
            assert.ok(top.y + top.height <= visual.y, 'Mobile input precedes the instrument.');
            assert.ok(visual.y + visual.height <= bottom.y, 'Mobile results follow the instrument.');
          }
          if (folder && width !== 320) await page.screenshot({path:`${folder}/${kind}-${width}.png`, fullPage:true});
        }
      } finally { await page.close(); }
    });
  }
});

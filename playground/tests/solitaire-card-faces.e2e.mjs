import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir} from 'node:fs/promises';
import {instrumentBrowser} from './support/instrument-browser.mjs';

const faces = [
  [1, 'Ace of clubs'], [11, 'Jack of clubs'], [12, 'Queen of clubs'], [13, 'King of clubs'],
  [14, 'Ace of diamonds'], [26, 'King of diamonds'], [27, 'Ace of hearts'], [39, 'King of hearts'],
  [40, 'Ace of spades'], [52, 'King of spades'], [53, 'Joker A'], [54, 'Joker B'],
];
const evidence = process.env.PLAYGROUND_EVIDENCE;
async function capture(page, name) {
  if (!evidence) return;
  await mkdir(evidence, {recursive:true});
  await page.screenshot({path:`${evidence}/${name}.png`, fullPage:true});
  if (/(queen-(1440|390)|joker-[ab]-1440)$/.test(name)) {
    await page.locator('.solitaire-selection').screenshot({path:`${evidence}/${name}-selection.png`});
  }
}

// Face identity belongs to the card ID, never its current position. Tests use
// the actual SDK fixture so decorative faces cannot replace or remap the deck.
test('Solitaire illustrated faces retain card identity through inspection, moves and invalid recovery', {timeout:180000}, async t => {
  const {open} = await instrumentBrowser(t);
  const page = await open('cipher.solitaire.encode', 'solitaire');
  for (const [id, name] of faces) {
    const label = await page.locator(`#solitaire-card-${id - 1}`).getAttribute('aria-label');
    assert.ok(label.includes(name), `Card ${id} identifies ${name}, not just a numeric tile.`);
    assert.match(label, new RegExp(`Position ${id}\\b`));
    assert.match(label, new RegExp(`ID ${id}\\b`));
  }
  assert.equal(await page.locator('.solitaire-card .solitaire-face').count(), 54);
  for (let id = 1; id <= 10; id++) {
    assert.equal(await page.locator(`#solitaire-card-${id - 1} .solitaire-face > .solitaire-pip`).count(), id,
      `Card ${id} draws ${id} central pips independently of its corner suit marks.`);
  }
  const calls = await page.evaluate(() => window.instrumentCalls);
  await page.locator('#solitaire-card-11').focus();
  await page.keyboard.press('Enter');
  assert.match(await page.locator('#solitaire-selected-position').textContent(), /Queen of clubs/);
  assert.equal(await page.locator('.solitaire-selected-card .solitaire-face').count(), 1);
  assert.equal(await page.locator('.solitaire-selected-card .solitaire-face image').count(), 1, 'The enlarged court card displays its portrait.');
  const portrait = await page.locator('.solitaire-selected-card .solitaire-face image').getAttribute('href');
  assert.ok(portrait, 'Court portrait has a real asset.');
  const portraitResponse = await page.request.get(new URL(portrait, page.url()).href);
  assert.equal(portraitResponse.status(), 200, 'Court portrait loads from the static build.');
  assert.ok((await portraitResponse.body()).length > 1000);
  await page.locator('#solitaire-move-later').click();
  assert.match(await page.locator('#solitaire-card-12').getAttribute('aria-label'), /Queen of clubs/);
  assert.match(await page.locator('#solitaire-card-12').getAttribute('aria-label'), /Position 13\b/);
  assert.match(await page.locator('#solitaire-card-12').getAttribute('aria-label'), /ID 12\b/);
  assert.match(await page.locator('#solitaire-selected-position').textContent(), /Queen of clubs/);
  await page.locator('#instrument-tab-parameters').click();
  const moved = JSON.parse(await page.locator('#playground-options-deck').inputValue());
  assert.deepEqual(moved.slice(10,14), [11,13,12,14]);
  await page.locator('#instrument-tab-visual').click();
  assert.equal(await page.evaluate(() => window.instrumentCalls), calls, 'Inspecting a face, moving and changing tabs never execute.');
  await page.getByRole('button', {name:'Use ordered deck 1–54', exact:true}).click();
  await page.locator('#run-tools').click();
  await page.locator('[data-result-operation="cipher.solitaire.encode"]').waitFor();
  assert.equal(await page.locator('.result-card .viewer pre').first().textContent(), 'EXKYIZSGEH');
  const acceptedCalls = await page.evaluate(() => window.instrumentCalls);

  for (const [id, name] of [[12,'queen'],[13,'king'],[53,'joker-a'],[54,'joker-b']]) {
    await page.locator(`#solitaire-card-${id - 1}`).click();
    assert.match(await page.locator('#solitaire-selected-position').textContent(), new RegExp(faces.find(face=>face[0]===id)[1]));
    assert.equal(await page.locator('.solitaire-selected-card .solitaire-face image').count(), 1);
    await capture(page, `solitaire-${name}-1440`);
  }
  for (const width of [1440,1100,834,700,390,320]) {
    await page.setViewportSize({width, height:1000});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No app overflow at ${width}.`);
    await page.locator('#solitaire-card-11').focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#solitaire-selected-position').textContent(), /Queen of clubs/);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'solitaire-card-11');
    const card = await page.locator('#solitaire-card-11').boundingBox();
    assert.ok(card.width >= 44 && card.height >= 44, 'Cards retain touch targets.');
    if ([1440,390,320].includes(width)) await capture(page, `solitaire-queen-${width}`);
  }
  await page.evaluate(() => document.documentElement.style.fontSize='200%');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No app overflow at 320px with 200% text.');
  await capture(page, 'solitaire-320-text200');
  await page.evaluate(() => document.documentElement.style.fontSize='');
  await page.setViewportSize({width:844, height:390});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No app overflow in short landscape.');
  await capture(page, 'solitaire-844-landscape');

  await page.locator('#instrument-tab-parameters').click();
  const invalid = Array.from({length:54}, (_,index) => index + 1); invalid[0] = 55;
  await page.locator('#playground-options-deck').fill(JSON.stringify(invalid));
  await page.locator('#instrument-tab-visual').click();
  assert.doesNotMatch(await page.locator('#solitaire-card-0').getAttribute('aria-label'), /Ace of clubs|Joker [AB]/, 'Invalid IDs cannot acquire a plausible card face.');
  assert.equal(await page.locator('#solitaire-card-0').getAttribute('draggable'), 'false');
  await page.locator('#solitaire-card-0').click();
  assert.equal(await page.locator('#solitaire-move-later').isDisabled(), true);
  await page.locator('#instrument-tab-parameters').click();
  assert.deepEqual(JSON.parse(await page.locator('#playground-options-deck').inputValue()), invalid, 'Inspection preserves the invalid draft for repair.');
  await page.locator('#instrument-tab-visual').click();
  await page.getByRole('button', {name:'Use ordered deck 1–54', exact:true}).click();
  assert.match(await page.locator('#solitaire-card-0').getAttribute('aria-label'), /Ace of clubs/);
  assert.equal(await page.locator('#solitaire-card-0').getAttribute('draggable'), 'true');
  assert.equal(await page.evaluate(() => window.instrumentCalls), acceptedCalls, 'Face inspection and draft repair preserve the recorded execution.');
});

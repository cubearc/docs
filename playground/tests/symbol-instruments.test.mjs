import test from 'node:test';
import assert from 'node:assert/strict';
import { editMask, editSequence, displayWindow, brailleDots, glyphSegments } from '../src/instruments/symbols.mjs';

test('mask edits preserve sorted exact hole coordinates and reject non-editable representations', () => {
  assert.deepEqual(editMask('[0,5,10,15]', 5), [0,10,15]);
  assert.deepEqual(editMask('[0,10,15]', 5), [0,5,10,15]);
  assert.equal(editMask('["18446744073709551615"]', 5), null);
  assert.equal(editMask('[1,1]', 5), null);
});
test('symbol composer separates selection, insertion, replacement and deletion', () => {
  assert.deepEqual(editSequence(['grid:ES'], 'grid:SW', null), ['grid:ES','grid:SW']);
  assert.deepEqual(editSequence(['grid:ES','grid:SW'], 'grid:NW', 0), ['grid:NW','grid:SW']);
  assert.deepEqual(editSequence(['...','---','...'], null, 1), ['...','...']);
});
test('large display windows retain absolute indices without trimming source', () => {
  const text = Array.from({length:1000}, (_,i) => String.fromCodePoint(0x1f600+i));
  const window = displayWindow(text, 800, 64);
  assert.equal(window.start, 800);
  assert.equal(window.items.length, 64);
  assert.equal(window.items[0], text[800]);
  assert.equal(text.length,1000);
});
test('eight dot drawing follows physical row order and selected mask', () => {
  assert.deepEqual(brailleDots(0xa5).map(d=>[d.number,d.active]), [[1,true],[4,false],[2,false],[5,false],[3,true],[6,true],[7,false],[8,true]]);
});
test('Pigpen segments follow canonical token sides and wedge orientation', () => {
  assert.deepEqual(glyphSegments('grid:ES:dot').lines, [[34,6,34,34],[6,34,34,34]]);
  assert.equal(glyphSegments('grid:ES:dot').dot,true);
  assert.deepEqual(glyphSegments('wedge:north').lines, [[6,6,20,34],[20,34,34,6]]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { armGeometry, directionAt } from '../src/instruments/semaphore-figure.mjs';

test('facing-sender arm anchors preserve anatomy and all eight compass directions', () => {
  const directions = ['N','NE','E','SE','S','SW','W','NW'];
  for (const side of ['left','right']) {
    for (const direction of directions) {
      const arm = armGeometry(side, direction);
      assert.equal(directionAt(arm.end[0], arm.end[1], side), direction);
    }
  }
  assert.ok(armGeometry('left', 'S').origin[0] > armGeometry('right', 'S').origin[0]);
  const down = armGeometry('left', 'S');
  assert.equal(down.origin[0], down.end[0]);
  assert.ok(down.end[1] > down.origin[1]);
  const sw = armGeometry('right', 'SW');
  assert.ok(sw.end[0] < sw.origin[0]);
  assert.ok(sw.end[1] > sw.origin[1]);
});

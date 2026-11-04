import test from 'node:test';
import assert from 'node:assert/strict';
import {instrumentSeries} from '../src/instruments/registry.mjs';
import {isInstrumentStudy} from '../src/instruments/study.mjs';

test('every registered instrument receives the compact visual workspace', () => {
  for (const descriptor of instrumentSeries) assert.equal(isInstrumentStudy(descriptor), true, descriptor.kind);
  assert.equal(isInstrumentStudy(null), false);
  assert.equal(isInstrumentStudy({kind:'unknown'}), false);
});

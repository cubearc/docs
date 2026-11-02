import test from 'node:test';
import assert from 'node:assert/strict';
import { presentationFor, instrumentSeries } from '../src/instruments/registry.mjs';
import { PresentationState } from '../src/instruments/state.mjs';

test('20 presentation families distinguish profile and executable capability', () => {
  assert.equal(instrumentSeries.length, 20);
  const action = { id: 'symbol.alphabet.encode', contract: { operation_version: 1 }, direct: { version: 1 } };
  assert.equal(presentationFor(action, { profile: 'other' }), null);
  assert.equal(presentationFor(action, { profile: 'pigpen_haverhill_pairs_v1' }).kind, 'pigpen');
  assert.equal(presentationFor({ ...action, contract: { operation_version: 999 } }, { profile: 'pigpen_haverhill_pairs_v1' }), null);
  assert.equal(presentationFor({id:'cipher.polybius.encode',contract:{operation_version:1}}).kind,'polybius');
});

test('presentation cursors do not edit configuration and late mount responses are rejected', () => {
  const state = new PresentationState();
  const first = state.open('keyboard', 3);
  state.ui('keyboard').selection = 7;
  assert.equal(state.current(first, 3), true);
  state.open('polybius', 3);
  assert.equal(state.current(first, 3), false);
  assert.equal(state.ui('keyboard').selection, 7);
  const next = state.open('keyboard', 4);
  assert.equal(state.current(next, 5), false);
  assert.equal(state.current(next, 4), true);
});

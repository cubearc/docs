import assert from 'node:assert/strict';
import test from 'node:test';
import { Session } from '../src/session.mjs';

test('alternatives use independent copies of one frozen round input and stale replies cannot replace edits', () => {
  const session = new Session();
  session.setInput({ type: 'bytes', data: Uint8Array.of(0, 255) });
  const round = session.begin();
  const first = session.inputFor(round);
  first.data.fill(1);
  assert.deepEqual(session.inputFor(round).data, Uint8Array.of(0, 255));
  const result = { operation: 'encoding.hex.encode', version: 1, parameters: {}, outputs: { output: { type: 'text', data: '00ff' } } };
  assert.equal(session.accept(round, result), true);
  session.setInput({ type: 'text', data: 'changed' });
  assert.equal(session.current.results[0].earlierInput, true);
  assert.equal(session.accept(round, result), false);
  const current = session.begin();
  assert.equal(session.accept(round, result), false);
  assert.equal(session.accept(current, result), true);
});

test('Continue preserves original data and only the selected alternative enters its sequence', () => {
  const session = new Session();
  session.setInput({ type: 'text', data: 'AP8=' });
  const round = session.begin();
  session.accept(round, { operation: 'encoding.base64.decode', version: 1, parameters: {}, outputs: { output: { type: 'bytes', data: Uint8Array.of(0, 255) } } });
  session.accept(round, { operation: 'cipher.rot13', version: 1, parameters: {}, outputs: { output: { type: 'text', data: 'NC8=' } } });
  const selected = session.current.results[0];
  session.continue(selected.id, 'output');
  assert.deepEqual(session.input.data, Uint8Array.of(0, 255));
  assert.deepEqual(session.originalInput, { type: 'text', data: 'AP8=' });
  assert.equal(session.rounds.length, 1);
  assert.deepEqual(session.path.map(step => step.operation), ['encoding.base64.decode']);
  const next = session.begin();
  assert.deepEqual(session.inputFor(next), { type: 'bytes', data: Uint8Array.of(0, 255) });
});

test('pins retain exact named outputs and bounded provenance independently of caller mutation', () => {
  const session = new Session({ maxPins: 1 });
  session.setInput({ type: 'text', data: 'A' });
  const token = session.begin();
  const value = Uint8Array.of(65);
  session.accept(token, { operation: 'text.utf8.encode', version: 1, parameters: {}, outputs: { output: { type: 'bytes', data: value } } });
  value.fill(0);
  const result = session.current.results[0];
  session.pin(result.id);
  assert.deepEqual(session.pins[0].outputs.output.data, Uint8Array.of(65));
  assert.equal(session.pins[0].round, token.round);
  session.setInput({ type: 'text', data: 'B' });
  const second = session.begin();
  session.accept(second, { operation: 'text.reverse', version: 1, parameters: {}, outputs: { output: { type: 'text', data: 'B' } } });
  assert.throws(() => session.pin(session.current.results[0].id), /pin limit/i);
});

test('retained budgets include configuration and provenance as well as output bytes', () => {
  const session = new Session({ maxRetainedBytes: 4096 });
  session.setInput({ type: 'text', data: 'A' });
  const round = session.begin();
  assert.throws(() => session.accept(round, {
    operation: 'cipher.vigenere.decode', version: 1,
    parameters: { key: 'A'.repeat(5000) }, outputs: { output: { type: 'text', data: 'A' } },
  }), /retained.*limit/i);
  assert.equal(session.current.results.length, 0);
});

test('shared caller bytes cannot mutate retained session evidence', () => {
  const data = new Uint8Array(new SharedArrayBuffer(2));
  data.set([0, 255]);
  const session = new Session();
  session.setInput({ type: 'bytes', data });
  data.fill(1);
  assert.deepEqual(session.input.data, Uint8Array.of(0, 255));
});

test('Continue retains a selected structured output without implicit text serialization', () => {
  const session = new Session();
  session.setInput({ type: 'text', data: '{"letter":"A"}' });
  const round = session.begin();
  session.accept(round, { operation: 'json.parse', version: 1, parameters: {}, outputs: { output: { type: 'json', data: { letter: 'A' } } } });
  session.continue(session.current.results[0].id, 'output');
  assert.deepEqual(session.input, { type: 'json', data: { letter: 'A' } });
  assert.equal(session.path[0].operation, 'json.parse');
});

test('pinned results disclose their earlier input after edits', () => {
  const session = new Session(); session.setInput({ type: 'text', data: 'first' });
  const token = session.begin(); session.accept(token, { outputs: { output: { type: 'text', data: 'result' } } });
  session.pin(session.current.results[0].id);
  session.setInput({ type: 'text', data: 'second' });
  assert.equal(session.pins[0].earlierInput, true);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { PipelineDraft } from '../src/pipeline.mjs';

test('pipeline runs keep the exact producing input/configuration and reject late edited replies', () => {
  const draft = new PipelineDraft();
  draft.setInput({ type: 'text', data: 'AP8=' });
  draft.add({ operation: 'encoding.base64.decode', version: 1 });
  const first = draft.begin();
  draft.update(0, 'key', 'changed');
  assert.equal(draft.accept(first, { output: { type: 'bytes', data: Uint8Array.of(0, 255) } }, {}), false);
  const current = draft.begin();
  assert.equal(draft.accept(current, { output: { type: 'bytes', data: Uint8Array.of(0, 255) } }, {}), true);
  draft.setInput({ type: 'text', data: 'changed input' });
  assert.equal(draft.result.earlierSettings, true);
  assert.equal(draft.result.snapshot.input.data, 'AP8=');
  assert.equal(draft.result.snapshot.steps[0].raw.key, 'changed');
});

test('ordered steps move and undo removal without silently changing operation versions', () => {
  const draft = new PipelineDraft();
  draft.add({ operation: 'encoding.base64.decode', version: 1 });
  draft.add({ operation: 'text.utf8.decode', version: 1 });
  draft.move(1, -1);
  assert.deepEqual(draft.steps.map(step => step.operation), ['text.utf8.decode', 'encoding.base64.decode']);
  draft.remove(0);
  assert.equal(draft.steps.length, 1);
  draft.undoRemove();
  assert.equal(draft.steps[0].operation, 'text.utf8.decode');
  assert.equal(draft.steps[0].version, 1);
  assert.equal(draft.steps[1].version, 1);
});

test('advanced definitions remain exact strings and run snapshots own shared input buffers', () => {
  const draft = new PipelineDraft();
  const bytes = new Uint8Array(new SharedArrayBuffer(2));
  bytes.set([0, 255]);
  draft.setInput({ type: 'bytes', data: bytes });
  bytes.fill(1);
  assert.deepEqual(draft.input.data, Uint8Array.of(0, 255));
  const raw = '{"offset":9007199254740993}';
  draft.setAdvanced(raw, { input_slot: null, plan: { steps: [] } });
  assert.equal(draft.begin().rawDefinition, raw);
});

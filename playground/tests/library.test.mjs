import assert from 'node:assert/strict';
import test from 'node:test';
import { PipelineLibrary } from '../src/library.mjs';
const memory = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
const document = name => ({ format: 'cubearc.playground.pipeline', version: 1, name, definition_json: '{"offset":9007199254740993}' });
test('local library saves exact definitions atomically and keeps input separate', () => {
  const storage = memory(); const library = new PipelineLibrary(storage);
  library.save(document('First'));
  assert.equal(library.entries()[0].definition_json, '{"offset":9007199254740993}');
  assert.equal(library.entries()[0].input_data_json, undefined);
  assert.throws(() => library.save({ ...document('bad'), input_data_json: 4 }));
  assert.equal(library.entries().length, 1);
  const id = library.entries()[0].id;
  library.remove(id); assert.equal(library.entries().length, 0);
});
test('corrupt or newer library data is preserved for recovery', () => {
  const storage = memory(); storage.setItem('cubearc.playground.pipelines.v1', '{broken');
  const library = new PipelineLibrary(storage);
  assert.throws(() => library.entries()); assert.throws(() => library.save(document('new')));
  assert.equal(library.recovery(), '{broken');
  library.reset(); library.save(document('recovered')); assert.equal(library.entries().length, 1);
});

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
test('renaming preserves the saved identifier, exact definition and included input atomically', () => {
  const storage = memory(); const library = new PipelineLibrary(storage);
  const original = { ...document('Original'), input_data_json: '{"data":[0,255]}', needs_parameters: ['key'] };
  const id = library.save(original);
  library.rename(id, 'Renamed');
  assert.deepEqual(library.entries(), [{ ...original, id, name: 'Renamed' }]);
  const before = library.recovery();
  for (const name of ['', '   ', 'x'.repeat(121), null]) assert.throws(() => library.rename(id, name));
  assert.throws(() => library.rename('missing', 'Other'));
  assert.equal(library.recovery(), before);
  storage.setItem = () => { throw new Error('Storage full'); };
  assert.throws(() => library.rename(id, 'Unsaved'), /Storage full/);
  assert.equal(library.recovery(), before);
});

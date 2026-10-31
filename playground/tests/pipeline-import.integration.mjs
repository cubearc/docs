import assert from 'node:assert/strict';
import test from 'node:test';
import { createCube } from '../.build/runtime/node_modules/@cubearc/cube/dist/node.mjs';
import { loadPipeline, recipeForDraft, exportPipeline, importPipeline } from '../src/pipeline-document.mjs';

// Real installed Wasm, canonical contracts and discovered adapter metadata.
const cube = await createCube();
const contracts = JSON.parse(cube.catalogJson()).operations;
const runtime = {
  action(id) { const contract = contracts.find(row => row.operation === id); const pipeline = cube.pipelineAdapters.find(row => row.operation === id); return contract ? { id, title: id, contract, pipeline } : null; },
  async call(method, args) { return cube[method](...args); },
};
const recipe = () => ({ format_version: 1, engine_api: 1,
  input: { source: 'slot', name: 'message', type: 'text' }, output: { type: 'text' },
  steps: [{ operation: 'encoding.base64.decode', version: 1 }, { operation: 'text.utf8.decode', version: 1 }] });
const envelope = definition => ({ format: 'cubearc.playground.pipeline', version: 1, name: 'Reusable message', definition_json: cube.recipeJson(definition) });
async function execute(draft) { return cube.runRecipe((await recipeForDraft(runtime, draft.describe())).definition).output; }

test('saved definitions reopen editable, retain the named slot and can be changed and run', async () => {
  const loaded = await loadPipeline(runtime, envelope(recipe()));
  assert.equal(loaded.draft.advanced, false);
  assert.equal(loaded.inputOmitted, true);
  assert.equal(loaded.draft.steps.length, 2);
  loaded.draft.setInput({ type: 'text', data: 'SGVsbG8=' });
  loaded.draft.add({ operation: 'cipher.rot13', version: 1 });
  assert.deepEqual(await execute(loaded.draft), { type: 'text', data: 'Uryyb' });
  const saved = await exportPipeline(runtime, loaded.draft);
  assert.equal(JSON.parse(saved.definition_json).input.name, 'message');
  assert.equal(saved.input_data_json, undefined);
  assert.equal((await loadPipeline(runtime, saved)).draft.steps.length, 3);
});

test('included exact bytes and binary keys survive reopen, option edits and explicit export', async () => {
  const definition = { format_version: 1, engine_api: 1, input: { source: 'slot', name: 'binary', type: 'bytes' }, output: { type: 'bytes' },
    steps: [{ operation: 'binary.xor', version: 1, parameters: { key: { base64: 'gAE=' } } }] };
  const document = { ...envelope(definition), input_data_json: '{"binary":{"type":"bytes","base64":"AP8="}}' };
  const { draft } = await loadPipeline(runtime, document);
  assert.equal(draft.advanced, false);
  assert.deepEqual(draft.input.data, Uint8Array.of(0, 255));
  assert.deepEqual((await execute(draft)).data, Uint8Array.of(128, 254));
  draft.update(0, 'key', 'AP8=');
  assert.deepEqual((await execute(draft)).data, Uint8Array.of(0, 0));
  const included = await exportPipeline(runtime, draft, { includeInput: true, includeKeys: true });
  assert.deepEqual((await loadPipeline(runtime, included)).draft.input.data, Uint8Array.of(0, 255));
  assert.deepEqual(JSON.parse(included.input_data_json), { binary: { type: 'bytes', base64: 'AP8=' } });
  const redacted = await exportPipeline(runtime, draft);
  assert.equal(redacted.input_data_json, undefined);
  assert.deepEqual(JSON.parse(redacted.definition_json).steps[0].parameters, {});
  assert.equal(redacted.needs_parameters.length, 1);
  const reopened = await loadPipeline(runtime, redacted);
  assert.equal(reopened.draft.advanced, false);
  reopened.draft.setInput({ type: 'bytes', data: Uint8Array.of(0, 255) });
  reopened.draft.update(0, 'key', 'AQ==');
  assert.deepEqual((await execute(reopened.draft)).data, Uint8Array.of(1, 254));
});

test('inline inputs become editable without discarding their exact representation', async () => {
  const definition = recipe();
  definition.input = { source: 'inline', value: { type: 'text', data: 'Q2Fmw6k=' } };
  const loaded = await loadPipeline(runtime, envelope(definition));
  assert.equal(loaded.draft.input.data, 'Q2Fmw6k=');
  assert.equal((await execute(loaded.draft)).data, 'Café');
});

test('wide integers, explicit lowered limits and unsupported input kinds remain exact', async () => {
  const wide = { format_version: 1, engine_api: 1, input: { source: 'inline', value: { type: 'bytes', base64: 'AQ==' } }, output: { type: 'bytes' },
    steps: [{ operation: 'binary.rotate_left', version: 1, parameters: { count: 9007199254740993n } }] };
  const document = envelope(wide);
  const loaded = await importPipeline(runtime, document.definition_json, 'wide-recipe.json');
  assert.equal(loaded.draft.advanced, true);
  assert.equal(loaded.draft.describe().rawDefinition, document.definition_json);
  assert.deepEqual(cube.runRecipe(loaded.draft.describe().rawDefinition).output.data, Uint8Array.of(2));
  const limited = envelope({ ...recipe(), limits: { max_steps: 4 } });
  const preserved = await loadPipeline(runtime, limited);
  assert.equal(preserved.draft.advanced, true);
  assert.equal(preserved.draft.describe().rawDefinition, limited.definition_json);
  const range = envelope({ format_version: 1, engine_api: 1, input: { source: 'inline', value: { type: 'byte_range', offset: 0, length: 2 } }, output: { type: 'byte_range' }, steps: [] });
  assert.equal((await loadPipeline(runtime, range)).draft.describe().rawDefinition, range.definition_json);
});

test('graph, duplicate-field and unknown version imports are rejected by actual Core', async () => {
  await assert.rejects(loadPipeline(runtime, { ...envelope(recipe()), definition_json: '{"nodes":[],"edges":[]}' }), /Play graphs are not supported/);
  await assert.rejects(importPipeline(runtime, '{"formatVersion":4,"inputs":[],"nodes":[],"output":"example"}', 'play-graph.json'), /Play graphs are not supported/);
  await assert.rejects(loadPipeline(runtime, { ...envelope(recipe()), definition_json: '{"format_version":1,"format_version":1}' }));
  const wrong = recipe(); wrong.steps[0].version = 99;
  await assert.rejects(loadPipeline(runtime, envelope(wrong)));
  await assert.rejects(loadPipeline(runtime, { ...envelope({ ...recipe(), limits: { max_steps: 4 } }), needs_parameters: ['key'] }), /cannot be represented faithfully/);
});

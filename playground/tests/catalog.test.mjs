import assert from 'node:assert/strict';
import test from 'node:test';
import { toolsFor, searchTools } from '../src/catalog.mjs';

const contracts = [
  { operation: 'encoding.base64.encode', category: 'encoding', description: 'Encode bytes.', pipeline_adapter: 1 },
  { operation: 'encoding.base64.decode', category: 'encoding', description: 'Decode text.', pipeline_adapter: 1 },
  { operation: 'image.decode', category: 'image', description: 'Decode an image.', pipeline_adapter: null },
];
const presentation = { operations: { 'encoding.base64.encode': 'Encode Base64', 'encoding.base64.decode': 'Decode Base64', 'image.decode': 'Decode an image' }, categories: { encoding: 'Encoding', image: 'Images' } };

test('catalog groups related actions while retaining every canonical operation', () => {
  const tools = toolsFor(contracts, presentation, { executors: [], pipelineAdapters: [] });
  assert.equal(tools.length, 2);
  assert.equal(tools[0].title, 'Base64');
  assert.deepEqual(tools.flatMap(tool => tool.actions.map(action => action.id)).sort(), contracts.map(row => row.operation).sort());
  assert.equal(tools[0].actions[0].available, false, 'catalog pipeline metadata does not establish runtime availability');
});

test('runtime execution support, search and categories are independently discoverable', () => {
  const tools = toolsFor(contracts, presentation, { executors: [{ operation: 'encoding.base64.encode' }], pipelineAdapters: [] });
  assert.equal(tools[0].actions[0].available, true);
  assert.equal(tools[0].actions[1].available, false);
  assert.equal(searchTools(tools, { query: 'base64' }).length, 1);
  assert.equal(searchTools(tools, { query: 'image.decode', category: 'image' }).length, 1);
  assert.equal(searchTools(tools, { category: 'encoding', favoritesOnly: true, favorites: ['encoding.base64'] }).length, 1);
});

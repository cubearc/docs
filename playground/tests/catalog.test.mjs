import assert from 'node:assert/strict';
import test from 'node:test';
import { toolsFor, searchTools, migrateFavorites } from '../src/catalog.mjs';
const contracts = [
  { operation: 'encoding.base64.encode', category: 'encoding', description: 'Technical encode contract.' },
  { operation: 'encoding.base64.decode', category: 'encoding', description: 'Technical decode contract.' },
  { operation: 'image.decode', category: 'image', description: 'Technical raster decoding.' },
  { operation: 'image.encode', category: 'image', description: 'Technical PNG encoding.' },
];
const presentation = { format_version: 1, operations: {
  'encoding.base64.encode': { tool_id: 'encoding.base64', display_name: 'Encode Base64', summary: 'Turn bytes into Base64 text.' },
  'encoding.base64.decode': { tool_id: 'encoding.base64', display_name: 'Decode Base64', summary: 'Turn Base64 text into bytes.' },
  'image.decode': { tool_id: 'image.decode', display_name: 'Read image pixels', summary: 'Read pixels from an image file.' },
  'image.encode': { tool_id: 'image.encode', display_name: 'Save as PNG', summary: 'Save pixel data as PNG.' },
}, tools: {
  'encoding.base64': { display_name: 'Base64', summary: 'Encode data or read a Base64 message.', aliases: [] },
  'image.decode': { display_name: 'Read image pixels', summary: 'Read pixels from an image file.', aliases: ['an image'], legacy_tool_ids: ['image'] },
  'image.encode': { display_name: 'Save as PNG', summary: 'Save pixel data as PNG.', aliases: [], legacy_tool_ids: ['image'] },
}, categories: { encoding: 'Encoding', image: 'Images' } };
const runtime = { executors: [{ operation: 'encoding.base64.encode' }], pipelineAdapters: [] };
test('explicit tool names, summaries and membership preserve every canonical action', () => {
  const tools = toolsFor(contracts, presentation, runtime);
  assert.equal(tools.length, 3, 'Image read and PNG save are separate explicit tools, despite matching suffixes.');
  assert.equal(tools[0].title, 'Base64');
  assert.equal(tools[0].description, presentation.tools['encoding.base64'].summary);
  assert.equal(tools[0].actions[1].description, presentation.operations['encoding.base64.decode'].summary);
  assert.deepEqual(tools.flatMap(tool => tool.actions.map(action => action.id)).sort(), contracts.map(row => row.operation).sort());
  const renamed = structuredClone(presentation); renamed.tools['encoding.base64'].display_name = 'Message formats';
  assert.equal(toolsFor(contracts, renamed, runtime).find(t => t.key === 'encoding.base64').title, 'Message formats');
  assert.equal(tools[0].actions[1].available, false);
});
test('presentation omissions and cross-category groupings fail explicitly', () => {
  for (const edit of [p => delete p.operations['image.decode'], p => delete p.tools['image.decode'].summary,
    p => { p.operations['image.decode'].tool_id = 'encoding.base64'; }]) {
    const invalid = structuredClone(presentation); edit(invalid);
    assert.throws(() => toolsFor(contracts, invalid, runtime), /presentation|category/i);
  }
});
test('search uses editorial text, aliases and exact IDs independently of availability', () => {
  const tools = toolsFor(contracts, presentation, runtime);
  assert.equal(searchTools(tools, { query: 'base64' }).length, 1);
  assert.equal(searchTools(tools, { query: 'an image' })[0].key, 'image.decode');
  assert.equal(searchTools(tools, { query: 'image.decode', category: 'image' }).length, 1);
  assert.equal(searchTools(tools, { category: 'encoding', favoritesOnly: true, favorites: ['encoding.base64'] }).length, 1);
  assert.equal(tools[0].actions[0].available, true);
});
test('saved favorites survive an explicitly split legacy family', () => {
  const tools = toolsFor(contracts, presentation, runtime);
  assert.deepEqual(migrateFavorites(['image', 'encoding.base64', 'unknown'], tools).sort(), ['encoding.base64','image.decode','image.encode','unknown']);
});

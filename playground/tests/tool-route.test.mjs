import assert from 'node:assert/strict';
import test from 'node:test';
import { toolLink, resolveToolLink } from '../src/tool-route.mjs';
const action = id => ({ id, contract: { operation_version: 1 } });
const tools = [{ key: 'encoding.base64', actions: [action('encoding.base64.encode'), action('encoding.base64.decode')] }];

test('exact links restore grouped actions and distinguish canonical operation versions', () => {
  for (const row of tools[0].actions) {
    const link = toolLink(row);
    assert.equal(link, `#/tools/${row.id}/1`);
    assert.deepEqual(resolveToolLink(link, tools), { detailOpen: true, tool: 'encoding.base64', action: row.id, routeError: '' });
    assert.match(resolveToolLink(link.replace('/1', '/999'), tools).routeError, /requests operation version 999/);
  }
  assert.equal(resolveToolLink('#/tools/encoding.base64', tools, 'Decode').action, 'encoding.base64.decode');
  assert.equal(resolveToolLink('#/tools/encoding.base64.decode', tools).action, 'encoding.base64.decode');
  for (const link of ['#/tools/%xy', '#/tools/absent/1', '#/tools/encoding.base64.decode/1/extra']) {
    const result = resolveToolLink(link, tools);
    assert.equal(result.tool, null);
    assert.equal(result.detailOpen, true);
    assert.ok(result.routeError);
  }
  assert.deepEqual(resolveToolLink('#/tools', tools), { detailOpen: false, routeError: '' });
});

test('split image tools retain their old unversioned family link', () => {
  const images = ['image.decode','image.encode'].map(id => ({ key:id, legacyToolIds:['image'], actions:[action(id)] }));
  assert.equal(resolveToolLink('#/tools/image', images).action, 'image.decode');
  assert.equal(resolveToolLink('#/tools/image', images, 'Encode').action, 'image.encode');
  assert.equal(resolveToolLink('#/tools/image.encode/1', images).action, 'image.encode');
});

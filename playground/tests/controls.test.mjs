import assert from 'node:assert/strict';
import test from 'node:test';
import { parametersFor } from '../src/controls.mjs';

const action = (schema, defaults = {}) => ({
  contract: { parameters: { type: 'object', properties: { padding: schema }, required: ['padding'] } },
  direct: { parameters: defaults },
});
const runtime = { call() { throw new Error('Text parameters require no conversion operation.'); } };

test('required empty text remains an explicit value when its canonical schema permits it', async () => {
  const vicPadding = action({ type: 'string', maxLength: 4, pattern: '^[0-9]{0,4}$' });
  assert.deepEqual(await parametersFor(runtime, vicPadding, { padding: '' }), { padding: '' });
  assert.deepEqual(await parametersFor(runtime, vicPadding, {}), { padding: '' }, 'A rendered blank control already supplies an empty text value.');
  await assert.rejects(parametersFor(runtime, vicPadding, {padding:null}), {code:'missing_parameter'});
  assert.deepEqual(await parametersFor(runtime, action({ type: 'string' }, { padding: '' }), {}), { padding: '' });
});

test('missing required text and prohibited empty values remain missing parameter errors', async () => {
  await assert.rejects(parametersFor(runtime, action({ type: 'string', minLength: 1 }), {}), { code: 'missing_parameter', parameter: 'padding' });
  await assert.rejects(parametersFor(runtime, action({ type: 'string', minLength: 1 }), { padding: '' }), { code: 'missing_parameter', parameter: 'padding' });
  assert.deepEqual(await parametersFor(runtime, action({ type: 'string', minLength: 1 }), { padding: '7' }), { padding: '7' });
});

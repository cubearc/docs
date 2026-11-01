import assert from 'node:assert/strict';
import test from 'node:test';
import { fieldsFor, parametersFor } from '../src/controls.mjs';

const action = (schema, defaults = {}) => ({
  contract: { parameters: { type: 'object', properties: { padding: schema }, required: ['padding'] } },
  direct: { parameters: defaults },
});
const runtime = { call() { throw new Error('Text parameters require no conversion operation.'); } };

test('referenced required profile enums remain explicit text choices rather than JSON documents', async()=>{
  const profile={contract:{parameters:{type:'object',properties:{profile:{$ref:'#/$defs/Profile'}},required:['profile'],$defs:{Profile:{type:'string',enum:['indexed_primes_v1']}}}},direct:{parameters:{}}};
  assert.deepEqual(fieldsFor(profile)[0].constraints,{type:'text',choices:['indexed_primes_v1']});
  assert.deepEqual(await parametersFor(runtime,profile,{profile:'indexed_primes_v1'}),{profile:'indexed_primes_v1'});
  await assert.rejects(parametersFor(runtime,profile,{}),{code:'missing_parameter',parameter:'profile'});
  await assert.rejects(parametersFor(runtime,profile,{profile:''}),{code:'missing_parameter',parameter:'profile'});
});

test('referenced text preserves an explicitly permitted empty value', async()=>{
  const referenced=action({$ref:'#/$defs/Padding'});
  referenced.contract.parameters.$defs={Padding:{type:'string',minLength:0,maxLength:4}};
  assert.deepEqual(await parametersFor(runtime,referenced,{padding:''}),{padding:''});
});

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

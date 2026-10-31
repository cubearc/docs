import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import test from 'node:test';
import { createCube } from '../.build/runtime/node_modules/@cubearc/cube/dist/node.mjs';
import { Runtime } from '../dist/runtime.mjs';
import { toolsFor } from '../src/catalog.mjs';
const cube=await createCube();
const catalog=JSON.parse(cube.catalogJson());
const presentation=JSON.parse(await readFile(new URL('../dist/presentation.json',import.meta.url),'utf8'));
const tools=toolsFor(catalog.operations,presentation,cube);
const sdk=Object.fromEntries(['execute','runRecipe','validateRecipe'].map(method=>[method,async(...args)=>({value:cube[method](...args)})]));
const runtime=new Runtime(sdk,catalog,presentation,tools);
const fixturePath=process.env.CUBE_CONFORMANCE_FIXTURES;
if(!fixturePath) throw new Error('Provide the matching reviewed Core conformance fixture path.');
const fixtures=JSON.parse(await readFile(fixturePath,'utf8'));
const bytes=value=>Uint8Array.from(Buffer.from(value.base64,'base64'));

test('every catalog tool is available and every direct-only tool executes its real SDK known answer',async()=>{
  const actions=tools.flatMap(tool=>tool.actions);
  assert.equal(actions.length,catalog.operations.length);
  assert.ok(actions.every(action=>action.available));
  const directOnly=actions.filter(action=>!action.pipeline);
  for(const action of directOnly){
    const fixture=fixtures.find(row=>row.operation===action.id);
    const names=action.contract.inputs.map(p=>p.name);
    const representation=action.direct.inputs[names[0]];
    const value=fixture.inputs[names[0]];
    const input=representation==='text'?{type:'text',data:value}:
      representation==='bytes'?{type:'bytes',data:bytes(value)}:
      representation==='byte_array'?{type:'bytes',data:Uint8Array.from(value)}:
      {type:'json',data:value??null};
    const extraInputs=Object.fromEntries(names.slice(1).map(name=>{
      const r=action.direct.inputs[name];const v=fixture.inputs[name];
      return [name,r==='text'?v:r==='bytes'?v.base64:r==='byte_array'?Buffer.from(v).toString('base64'):JSON.stringify(v)];
    }));
    const actual=await runtime.perform(action,input,fixture.parameters,{extraInputs});
    const wire=Object.fromEntries(Object.entries(actual.outputs).map(([name,v])=>[name,
      v.type==='bytes'?action.direct.outputs[name]==='byte_array'?Array.from(v.data):{base64:Buffer.from(v.data).toString('base64')}:v.data]));
    assert.ok(isDeepStrictEqual(wire,fixture.outputs),action.id+' actual portal/SDK known answer');
  }
});

test('Book cipher and opaque file inputs execute arbitrary user data through the portal adapter',async()=>{
  const book=await runtime.perform(runtime.action('cipher.book.decode'),{type:'text',data:'1:1,2:1'}, {source:'another book',scheme:'word_character',index_base:1});
  assert.equal(book.outputs.output.data,'ab');
  const info=await runtime.perform(runtime.action('file.info.inspect'),{type:'bytes',data:Uint8Array.of(0,255,128)},{});
  assert.deepEqual(info.outputs.output.data,{source_kind:'artifact',size:3,regular_file:null,modified:null,created:null,signatures:[]});
});

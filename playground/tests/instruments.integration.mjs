import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCube} from '../.build/runtime/node_modules/@cubearc/cube/dist/node.mjs';
import {Runtime} from '../dist/runtime.mjs';
import {toolsFor} from '../src/catalog.mjs';
import {instrumentSeries} from '../src/instruments/registry.mjs';
const cube=await createCube();
const catalog=JSON.parse(cube.catalogJson());
const presentation=JSON.parse(await readFile(new URL('../dist/presentation.json',import.meta.url),'utf8'));
const tools=toolsFor(catalog.operations,presentation,cube);
const sdk={execute:async(...args)=>({value:cube.execute(...args)})};
const runtime=new Runtime(sdk,catalog,presentation,tools);
const fixturePath=process.env.CUBE_CONFORMANCE_FIXTURES;
if(!fixturePath)throw new Error('Set CUBE_CONFORMANCE_FIXTURES to the matching reviewed Core fixtures.');
const fixtures=JSON.parse(await readFile(fixturePath,'utf8'));
const byteInput=(value,kind)=>kind==='byte_array'?Uint8Array.from(value):Uint8Array.from(Buffer.from(value.base64,'base64'));
const wireInput=(value,kind)=>kind==='text'?{type:'text',data:value}:['bytes','byte_array'].includes(kind)?{type:'bytes',data:byteInput(value,kind)}:{type:'json',data:value};
for(const family of instrumentSeries)test(`${family.kind}: every registered action executes its exact direct SDK fixture`,async()=>{
 for(const id of family.operations){
  const original=runtime.action(id),action={...original,pipeline:null};
  const fixture=fixtures.find(row=>row.operation===id);
  const [primary,...extra]=action.contract.inputs.map(port=>port.name);
  const extraInputs=Object.fromEntries(extra.map(name=>[name,action.direct.inputs[name]==='text'?fixture.inputs[name]:['bytes','byte_array'].includes(action.direct.inputs[name])?Buffer.from(byteInput(fixture.inputs[name],action.direct.inputs[name])).toString('base64'):JSON.stringify(fixture.inputs[name])]));
  const output=await runtime.perform(action,wireInput(fixture.inputs[primary],action.direct.inputs[primary]),fixture.parameters,{extraInputs});
  const wire=Object.fromEntries(Object.entries(output.outputs).map(([name,value])=>[name,value.type==='bytes'?action.direct.outputs[name]==='byte_array'?Array.from(value.data):{base64:Buffer.from(value.data).toString('base64')}:value.data]));
  assert.deepEqual(wire,fixture.outputs,id);
  await assert.rejects(()=>runtime.perform(action,wireInput(fixture.inputs[primary],action.direct.inputs[primary]),{...fixture.parameters,invalid_visual_parameter:true},{extraInputs}),id+' rejects unknown options');
 }
});
test('canonical drawing assets match installed source and known mappings',async()=>{
 const data=JSON.parse(await readFile(new URL('../dist/instrument-data.json',import.meta.url),'utf8'));
 assert.equal(data.source.coreRevision,cube.build.coreRevision);
 assert.equal(data.source.sourceDirty,false);
 assert.equal(data.layouts.qwertz.entries.find(e=>e.key===data.layouts.qwerty.entries.find(e=>e.symbol==='Y').key&&e.layer==='shift').symbol,'Z');
 assert.equal(data.braille[0xa5],'\u28a5');assert.equal(data.squares.polybius.aliases[0],'J=I');
 assert.deepEqual(data.semaphore[0],{unit:'A',token:'S,SW'});
});

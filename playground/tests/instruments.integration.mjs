import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {writeInstrumentAssets,profileExamplesFor} from '../scripts/instrument-assets.mjs';
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

// The general alphabet conformance fixture uses another profile. Loading an
// example inside Pigpen must retain the selected canonical Haverhill profile.
test('Pigpen profile examples preserve the selected profile for encode and decode',async t=>{
 const source=resolve(dirname(fixturePath),'../../../../..');
 const vectors=JSON.parse(await readFile(join(source,'crates/cube-core/src/symbols/alphabet/vectors.json'),'utf8'));
 const vector=vectors.find(row=>row.profile==='pigpen_haverhill_pairs_v1');
 const output=await mkdtemp(join(tmpdir(),'cube-profile-examples-'));
 t.after(()=>rm(output,{recursive:true,force:true}));
 await writeInstrumentAssets(cube,source,output);
 const assets=JSON.parse(await readFile(join(output,'instrument-data.json'),'utf8'));
 for(const [operation,inputName,input]of [['symbol.alphabet.encode','units',vector.units],['symbol.alphabet.decode','tokens',vector.tokens]]){
  const example=assets.profileExamples?.[operation]?.[vector.profile];
  assert.ok(example,`${operation}: selected Pigpen profile must have its own Core-vector example`);
  assert.equal(example.operation_version,1);
  assert.deepEqual(Object.keys(example.inputs),[inputName]);
  assert.equal(typeof example.inputs[inputName],'string');
  assert.deepEqual(JSON.parse(example.inputs[inputName]),input);
  assert.deepEqual(example.parameters,{profile:vector.profile});
  assert.deepEqual(JSON.parse(example.outputs.tokens),vector.tokens);
  const action={...runtime.action(operation),pipeline:null};
  const actual=await runtime.perform(action,{type:'text',data:example.inputs[inputName]},example.parameters);
  assert.deepEqual(Object.fromEntries(Object.entries(actual.outputs).map(([name,value])=>[name,value.data])),Object.fromEntries(Object.entries(example.outputs).map(([name,value])=>[name,JSON.parse(value)])));
  if(operation.endsWith('.decode'))assert.deepEqual(actual.outputs.readings.data,vector.units.map((unit,token_index)=>({token_index,alternatives:[unit]})));
 }
});

test('profile-example projection rejects vector disagreement and ambiguous source identity',async()=>{
 const source=resolve(dirname(fixturePath),'../../../../..');
 const vectors=JSON.parse(await readFile(join(source,'crates/cube-core/src/symbols/alphabet/vectors.json'),'utf8'));
 const vector=vectors.find(row=>row.profile==='pigpen_haverhill_pairs_v1');
 const corrupted=structuredClone(vector);
 corrupted.tokens[0]='grid:SW';
 assert.throws(()=>profileExamplesFor(cube,[corrupted]),/encode example disagrees with its canonical vector/);
 assert.throws(()=>profileExamplesFor(cube,[]),/one canonical Pigpen profile vector/);
 assert.throws(()=>profileExamplesFor(cube,[vector,vector]),/one canonical Pigpen profile vector/);
});

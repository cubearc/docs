import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticPolicy, comparisonCandidates, PreviewScheduler } from '../src/execution-policy.mjs';

const action=(id,policy={})=>({id,available:true,contract:{operation_version:1,policy}});
test('first-use Base64 and visual parameter edits are eligible without timing history',()=>{
 for(const id of ['encoding.base64.decode','cipher.caesar.encode','text.keyboard.remap','cipher.enigma'])
  assert.equal(automaticPolicy(action(id),{type:'text',data:'雪\r\n'},{}).eligible,true,id);
 assert.equal(automaticPolicy(action('encoding.base64.decode'),{type:'text',data:''},{}).eligible,true,'empty is a valid value, distinct from fresh untouched input');
});
test('expensive, deliberate, unavailable, oversized and measured slow operations require explicit execution',()=>{
 for(const id of ['audio.spectrum','image.bit_plane.extract','esolang.brainfuck.execute','cipher.caesar.bruteforce','number.random'])
  assert.equal(automaticPolicy(action(id),{type:'text',data:'A'},{}).eligible,false,id);
 assert.equal(automaticPolicy({...action('encoding.base64.decode'),available:false},{type:'text',data:'A'},{}).eligible,false);
 assert.equal(automaticPolicy(action('encoding.base64.decode'),{type:'text',data:'A'.repeat(4097)},{}).eligible,false);
 assert.equal(automaticPolicy(action('cipher.enigma'),{type:'text',data:'A'},{extraInputs:{key:'x'.repeat(9000)}}).eligible,false);
 assert.equal(automaticPolicy(action('encoding.base64.decode'),{type:'text',data:'A'},{slow:true}).eligible,false);
 assert.equal(automaticPolicy(action('encoding.base64.decode',{grants_network_access:true}),{type:'text',data:'A'},{}).eligible,false);
});
test('Multidecoder has a bounded discovered eligible set and preserves exact byte handling',()=>{
 const runtime={action:id=>action(id)};
 const ids=comparisonCandidates(runtime,'Decode',{type:'text',data:'SGVsbG8='});
 assert.ok(ids.includes('encoding.base64.decode'));assert.ok(ids.length<=6);
 assert.deepEqual(comparisonCandidates(runtime,'Decode',{type:'bytes',data:Uint8Array.of(0,255)}),['text.utf8.decode']);
});
test('rapid edits replace pending work while one task is active, without a growing queue',async()=>{
 const scheduler=new PreviewScheduler();let release;const seen=[];
 scheduler.schedule(async()=>{seen.push('first');await new Promise(resolve=>release=resolve);},0);
 await new Promise(resolve=>setTimeout(resolve,5));
 for(let i=0;i<50;i++)scheduler.schedule(async()=>seen.push(i),0);
 await new Promise(resolve=>setTimeout(resolve,5));assert.deepEqual(seen,['first']);
 release();await scheduler.idle();await new Promise(resolve=>setTimeout(resolve,5));await scheduler.idle();
 assert.deepEqual(seen,['first',49]);scheduler.cancel();
});
test('leaving a workspace or stopping revokes the scheduled preview',async()=>{
 const scheduler=new PreviewScheduler();let called=false;
 scheduler.schedule(async()=>{called=true;},5);scheduler.cancel();
 await new Promise(resolve=>setTimeout(resolve,15));assert.equal(called,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { pipelineCompatibility } from '../src/pipeline.mjs';
test('tool navigation cannot imply pipeline support or silently convert a pipeline position',()=>{
 const draft={advanced:false,input:{type:'text'},steps:[]};
 assert.equal(pipelineCompatibility(draft,{},{}).compatible,false);
 assert.equal(pipelineCompatibility(draft,{pipeline:{input_type:'bytes'}},{}).compatible,false);
 assert.equal(pipelineCompatibility(draft,{pipeline:{input_type:'text'}},{}).compatible,true);
 assert.equal(pipelineCompatibility({...draft,advanced:true},{pipeline:{input_type:'text'}},{}).compatible,false);
 const runtime={action:()=>({pipeline:{output_type:'bytes'}})};
 assert.equal(pipelineCompatibility({...draft,steps:[{operation:'text.utf8.encode'}]},{pipeline:{input_type:'bytes'}},runtime).compatible,true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { graphDraft, editGraphEdge, sourceCells } from '../src/instruments/workbench.mjs';
test('graph edits preserve existing edges and require explicit valid endpoints',()=>{
 const graph=graphDraft('{"directed":false,"vertices":["A","B"],"edges":[]}');
 assert.equal(editGraphEdge(graph,'A','B','ab').edges.length,1);
 assert.equal(graph.edges.length,0);
 assert.throws(()=>editGraphEdge(graph,'A','C','ac'));
});
test('book drawing derives words from Core spans and preserves non-BMP scalars',()=>{
 const source='H😀\r\n  I';
 const spans=[{word_index:0,scalar_index:0,scalar_length:2},{word_index:1,scalar_index:6,scalar_length:1}];
 assert.deepEqual(sourceCells(source,spans,'word_character',1).map(c=>[c.symbol,c.coordinate]),[['H','1:1'],['😀','1:2'],['I','2:1']]);
 assert.deepEqual(sourceCells(source,spans,'line_word_character',0).map(c=>c.coordinate),['0:0:0','0:0:1','1:0:0']);
});

test('coordinate composition appends without rewriting existing JSON numeric lexemes', async()=>{
 const {appendCoordinate}=await import('../src/instruments/workbench.mjs');
 const input='[ [9007199254740993, 0, "base"] ]  ';
 assert.equal(appendCoordinate(input,[0,1,'base']),'[ [9007199254740993, 0, "base"] , [0,1,"base"]]  ');
 assert.equal(appendCoordinate('[  ]',[1,1,'shift']),'[  [1,1,"shift"]]');
 assert.equal(appendCoordinate('{"coordinates":[]}',[0,0,'base']),null);
});

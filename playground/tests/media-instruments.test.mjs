import assert from 'node:assert/strict';
import test from 'node:test';
import { pngSegments, planeSamples, imageForDrawing, sourceKey, viewportRows, auxiliaryBytes, disposeInstrument, inspectedPlaneBit, sameAnalysisConfiguration, bytesForEvidence } from '../src/instruments/media.mjs';

test('PNG map separates signature, framing, payload and trailing bytes using Core offsets', () => {
 const report={chunks:[{kind:'IHDR',offset:8,length:13},{kind:'IDAT',offset:33,length:12},{kind:'IEND',offset:57,length:0}],boundary:{logical_end:69,trailing_offset:69,trailing_bytes:3}};
 const segments=pngSegments(report);
 assert.deepEqual(segments.map(x=>[x.label,x.offset,x.length]),[['Signature',0,8],['IHDR',8,25],['IDAT',33,24],['IEND',57,12],['Trailing bytes',69,3]]);
});

test('bit-plane display decodes only valid returned packed bits and never analyzes source samples', () => {
 assert.deepEqual(Array.from(planeSamples(Uint8Array.of(0xA5,0x80),9)),[255,0,255,0,0,255,0,255,255]);
 assert.throws(()=>planeSamples(Uint8Array.of(0),9),/packed/);
});

test('image drawing retains exact RGB and alpha bytes without canvas sampling', () => {
 const image={color_model:'rgba',width:1,height:1,samples:{base64:'Af8Afw=='},palette:[],transparency:{base64:''}};
 assert.deepEqual(Array.from(imageForDrawing(image)),[1,255,0,127]);
 assert.throws(()=>imageForDrawing({...image,width:2}),/sample/);
});

test('source cache identities distinguish equal-length files and configuration revisions', () => {
 assert.notEqual(sourceKey({type:'bytes',data:Uint8Array.of(0,255)},1),sourceKey({type:'bytes',data:Uint8Array.of(255,0)},1));
 assert.notEqual(sourceKey({type:'text',data:'same'},1),sourceKey({type:'text',data:'same'},2));
});

test('hex viewport caps rendered rows without changing complete source or selection', () => {
 const rows=Array.from({length:1000},(_,i)=>({offset:i*16}));
 assert.equal(viewportRows(rows,500,16).length,16);
 assert.equal(viewportRows(rows,500,16)[0].offset,8000);
 assert.equal(rows.length,1000);
});

test('auxiliary retention is measurable and leaving a tool releases arrays but preserves view settings', () => {
 const api={ui:{media:{zoom:8,cursor:24,pcm:{data:{base64:'AAAA'}},thumbnails:{0:{data:Uint8Array.of(0xFF)}},originalBytes:Uint8Array.of(1,2),key:'old'}}};
 assert.ok(auxiliaryBytes(api.ui.media)>0);
 disposeInstrument(api);
 assert.equal(api.ui.media.zoom,8);
 assert.equal(api.ui.media.cursor,24);
 for(const name of ['pcm','thumbnails','originalBytes','key']) assert.equal(api.ui.media[name],undefined);
});

test('inspecting a plane reports its returned raw bit at absolute region coordinates', () => {
 const result={output:{bit:0,valid_bits:4,pixels:{region:{x:3,y:2,width:2,height:2}}},data:Uint8Array.of(0xA0)};
 assert.equal(inspectedPlaneBit(result,3,2),1);
 assert.equal(inspectedPlaneBit(result,4,2),0);
 assert.equal(inspectedPlaneBit(result,3,3),1);
 assert.equal(inspectedPlaneBit(result,0,0),null);
});

test('auxiliary audio identity changes with analysis settings but can retain a producing snapshot', () => {
 const produced={start_frame:'0',frames:1024,channel:0,fft_size:256,window:'hann'};
 assert.equal(sameAnalysisConfiguration(produced,{...produced}),true);
 assert.equal(sameAnalysisConfiguration(produced,{...produced,fft_size:512}),false);
 assert.equal(sameAnalysisConfiguration(produced,{...produced,start_frame:'9007199254740993'}),false);
 assert.equal(produced.fft_size,256);
});

test('file evidence inspection uses the producing source when current file has changed', () => {
 const current={type:'bytes',data:Uint8Array.of(9,9)};
 const previous={type:'bytes',data:Uint8Array.of(1,2,3)};
 const api={input:()=>current,stale:()=>true,snapshot:()=>({input:previous})};
 assert.deepEqual(Array.from(bytesForEvidence(api)),[1,2,3]);
 api.stale=()=>false;
 assert.deepEqual(Array.from(bytesForEvidence(api)),[9,9]);
});

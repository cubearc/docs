import assert from 'node:assert/strict';
import test from 'node:test';
import { Session } from '../src/session.mjs';

const result = text => ({ operation: 'encoding.base64.decode', version: 1,
  parameters: {}, snapshot: { extraInputs: { source: 'original\r\n雪' } },
  outputs: { output: { type: 'text', data: text } } });

test('live edits replace a bounded preview without using retained rounds; pins keep producing evidence', () => {
  const session = new Session();
  for (let i=0;i<20;i++) {
    session.setInput({type:'text',data:`input ${i}`});
    const token=session.beginPreview();
    assert.equal(session.accept(token,result(`output ${i}`)),true);
    if(i===0)session.pin(session.current.results[0].id);
  }
  assert.equal(session.rounds.length,1,'only the explicit pin retained a round');
  assert.equal(session.current.kind,'preview');
  assert.equal(session.current.results[0].outputs.output.data,'output 19');
  assert.equal(session.pins[0].outputs.output.data,'output 0');
  assert.equal(session.pins[0].input.data,'input 0');
  assert.equal(session.pins[0].snapshot.extraInputs.source,'original\r\n雪');
  assert.equal(session.pins[0].earlierInput,true);
});

test('replacing a preview rejects older execution tokens even without an input edit', () => {
  const session=new Session();const first=session.beginPreview(),second=session.beginPreview();
  assert.equal(session.accept(first,result('stale')),false);
  assert.equal(session.accept(second,result('current')),true);
  session.invalidate();
  assert.equal(session.accept(second,result('late')),false);
  assert.equal(session.current.results[0].earlierInput,true);
});

test('preview memory and result limits still apply and replacements release old payloads', () => {
  const session=new Session({maxRetainedBytes:4096,maxResults:1});
  for(let i=0;i<12;i++) {const token=session.beginPreview();session.accept(token,result('x'.repeat(1000)));}
  const token=session.beginPreview();
  assert.throws(()=>session.accept(token,result('x'.repeat(5000))),/retained.*limit/i);
  session.accept(token,result('small'));
  assert.throws(()=>session.accept(token,result('another')),/result.*limit/i);
  assert.equal(session.rounds.length,0);
});

test('using a live named output retains its producing snapshot and can restore the previous exact input', () => {
  const session=new Session();session.setInput({type:'bytes',data:Uint8Array.of(0,255,13,10)});
  const token=session.beginPreview();session.accept(token,result('雪\r\n'));
  session.continue(session.current.results[0].id,'output');
  assert.deepEqual(session.input,{type:'text',data:'雪\r\n'});
  assert.equal(session.rounds.length,1);
  assert.equal(session.canRestoreInput,true);
  session.restoreInput();
  assert.deepEqual(session.input,{type:'bytes',data:Uint8Array.of(0,255,13,10)});
  assert.equal(session.path.length,0);
});

test('manual history still enforces the existing eight-round limit independently of previews', () => {
  const session=new Session();for(let i=0;i<8;i++)session.begin();
  const token=session.beginPreview();session.accept(token,result('allowed live update'));
  assert.throws(()=>session.retainPreview(),/round history limit/i);
  assert.throws(()=>session.begin(),/round history limit/i);
  assert.equal(session.current.results[0].outputs.output.data,'allowed live update');
});

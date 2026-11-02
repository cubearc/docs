import assert from 'node:assert/strict';
import test from 'node:test';
import { deckStatus, moveCard, enigmaProblems, stripProblems, traceWindow, tapePage, settingsForEdit } from '../src/instruments/mechanisms.mjs';

test('deck editing moves the selected card and preserves the complete permutation', () => {
  const deck = Array.from({length: 54}, (_, i) => i + 1);
  const moved = moveCard(deck, 52, 1);
  assert.equal(moved[1], 53);
  assert.equal(moved[53], 54);
  assert.deepEqual(deckStatus(moved), []);
  assert.deepEqual(deck.slice(0, 3), [1, 2, 3]);
  assert.match(deckStatus([...deck.slice(0, 53), 53]).join(' '), /exactly once/);
  assert.deepEqual(moveCard(deck, -1, 5), deck);
});

test('Enigma preserves profile restrictions and disjoint plugs', () => {
  const valid = { profile:'enigma_i', rotors:['I','II','III'], rings:[1,1,1], windows:'AAA', reflector:'B', plugboard:[] };
  assert.deepEqual(enigmaProblems(valid), []);
  assert.match(enigmaProblems({...valid, plugboard:['AB','AC']}).join(' '), /more than one pair/);
  assert.match(enigmaProblems({...valid, rotors:['I','II','VI']}).join(' '), /I–V/);
  assert.match(enigmaProblems({...valid, rings:[0,1,1]}).join(' '), /1–26/);
});

test('M138 validates exactly 100 series definitions and 30 unique selected IDs', () => {
  const valid = { profile:'m138a_configured_v1', strip_series:'example:test', strips:Array(100).fill('ABCDEFGHIJKLMNOPQRSTUVWXYZ'), order:Array.from({length:30}, (_,i)=>i+1), row_offsets:[1,2] };
  assert.deepEqual(stripProblems(valid, 31), []);
  assert.match(stripProblems({...valid, order:Array(30).fill(1)},31).join(' '), /30 distinct/);
  assert.match(stripProblems({...valid, row_offsets:[1]},31).join(' '), /2 block/);
  assert.match(stripProblems({...valid, strips:['ABC']},31).join(' '), /100/);
});

test('trace inspection never derives an unreported state', () => {
  const trace=[{windows:'AAB',offset:0},{windows:'AAC',offset:1}];
  assert.equal(traceWindow(trace, -1), null);
  assert.deepEqual(traceWindow(trace, 1), trace[1]);
  assert.equal(traceWindow(trace, 2), null);
});

test('tape page keeps full exact tape separate from bounded display', () => {
  const tape=Array.from({length:30000},(_,index)=>({index,value:index}));
  assert.deepEqual(tapePage(tape, 100, 3), tape.slice(100,103));
  assert.equal(tape.length,30000);
});


test('visual settings editing refuses JSON numbers it cannot preserve exactly', () => {
  assert.throws(() => settingsForEdit('{"order":[1,9007199254740993]}'), /exact/);
  assert.throws(() => settingsForEdit('{"row_offsets":[1e0]}'), /exact/);
  assert.deepEqual(settingsForEdit('{"order":[1,2],"label":"9007199254740993"}'), {order:[1,2],label:'9007199254740993'});
});

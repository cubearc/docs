import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { instrumentSeries } from '../src/instruments/registry.mjs';

// These samples retain the selected visual profile instead of borrowing the
// generic alphabet conformance example, which deliberately uses another one.
export function profileExamplesFor(sdk, vectors) {
  const { profile } = instrumentSeries.find(row => row.kind === 'pigpen');
  const matches = vectors.filter(row => row.profile === profile);
  if (matches.length !== 1) throw new Error('Require one canonical Pigpen profile vector.');
  const vector = matches[0];
  const parameters = { profile };
  const encoded = sdk.execute({ operation: 'symbol.alphabet.encode', version: 1, inputs: { units: vector.units }, parameters });
  if (!isDeepStrictEqual(encoded.tokens, vector.tokens)) throw new Error('Pigpen encode example disagrees with its canonical vector.');
  const decoded = sdk.execute({ operation: 'symbol.alphabet.decode', version: 1, inputs: { tokens: vector.tokens }, parameters });
  const expectedReadings = vector.units.map((unit, token_index) => ({ token_index, alternatives: [unit] }));
  if (!isDeepStrictEqual(decoded.tokens, vector.tokens) || !isDeepStrictEqual(decoded.readings, expectedReadings)) throw new Error('Pigpen decode example disagrees with its canonical vector.');
  if (encoded.provenance.profile_id !== profile || !isDeepStrictEqual(encoded.provenance, decoded.provenance)) throw new Error('Pigpen example provenance disagrees with its selected profile.');
  const jsonFields = fields => Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, JSON.stringify(value, null, 2)]));
  const example = (inputs, outputs) => ({ operation_version: 1, inputs: jsonFields(inputs), parameters, outputs: jsonFields(outputs) });
  return {
    'symbol.alphabet.encode': { [profile]: example({ units: vector.units }, encoded) },
    'symbol.alphabet.decode': { [profile]: example({ tokens: vector.tokens }, decoded) },
  };
}

// A projection of factual canonical definitions, checked by this exact Wasm.
// It supplies drawing geometry, never an alternative implementation of a codec.
export async function writeInstrumentAssets(sdk, source, output) {
  const keyboard = await readFile(join(source, 'crates/cube-core/src/text/keyboard.rs'), 'utf8');
  const table = name => {
    const match = keyboard.match(new RegExp(`const ${name}: \\[&str; 2\\] = \\[([\\s\\S]*?)\\];`));
    if (!match) throw new Error(`Missing canonical keyboard table ${name}.`);
    return [...match[1].matchAll(/"(?:\\.|[^"\\])*"/g)].map(row => JSON.parse(row[0]));
  };
  const qwerty = table('QWERTY');
  const qwertz = qwerty.map(input => sdk.execute({ operation: 'text.keyboard.remap', version: 1, inputs: { input }, parameters: { source: 'qwerty', target: 'qwertz' } }).output);
  const layouts = Object.fromEntries(Object.entries({ qwerty, qwertz, dvorak: table('DVORAK') }).map(([name, layers]) => {
    const entries = layers.flatMap((text, layerIndex) => Array.from(text, (symbol, index) => {
      const row = index < 13 ? 0 : index < 26 ? 1 : index < 37 ? 2 : 3;
      return { key: `ansi${String(index).padStart(2, '0')}`, layer: ['base', 'shift'][layerIndex], symbol, row, column: index - [0, 13, 26, 37][row] };
    }));
    const layout = { geometry: 'us_ansi_printable47', entries };
    const result = sdk.execute({operation:'text.keyboard.coordinates.encode',version:1,inputs:{text:layers.join('')},parameters:{layout,index_base:0}});
    if (result.coordinates.length !== entries.length) throw new Error('Canonical geometry failed its Core check.');
    return [name, layout];
  }));
  const polybiusSource = await readFile(join(source, 'crates/cube-core/src/ciphers/polybius.rs'), 'utf8');
  const squares = Object.fromEntries([...polybiusSource.matchAll(/"(polybius|tap)" => Self::new\(5, "([A-Z]+)", &\[\('([A-Z])', '([A-Z])'\)\]/g)].map(([,name,alphabet,alias,target]) => [name,{alphabet,side:5,aliases:[`${alias}=${target}`]}]));
  if (Object.keys(squares).length !== 2) throw new Error('Canonical square definitions missing.');
  const units = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const encoded = sdk.execute({operation:'symbol.semaphore.encode',version:1,inputs:{input:units}}).output.split(' ');
  const semaphore = Array.from(units, (unit, i) => ({unit,token:encoded[i]}));
  const braille = Array.from(sdk.execute({operation:'symbol.braille.encode',version:1,inputs:{input:Uint8Array.from({length:256},(_,i)=>i)}}).output);
  const pigpen = JSON.parse(await readFile(join(source,'crates/cube-core/src/symbols/alphabet/pigpen_haverhill_pairs_v1.json'),'utf8'));
  const vectors = JSON.parse(await readFile(join(source, 'crates/cube-core/src/symbols/alphabet/vectors.json'), 'utf8'));
  const profileExamples = profileExamplesFor(sdk, vectors);
  await writeFile(join(output, 'instrument-data.json'), JSON.stringify({ source: sdk.build, layouts, squares, semaphore, braille, pigpen, profileExamples }));
  const catalog = JSON.parse(sdk.catalogJson());
  const matrix = instrumentSeries.map(row => ({kind:row.kind,profile:row.profile ?? null,operations:row.operations.map(id=> {
    const contract=catalog.operations.find(o=>o.operation===id);
    if(!contract || !row.versions.includes(contract.operation_version)) throw new Error(`Presentation identity mismatch ${id}`);
    const executor=sdk.executors.find(o=>o.operation===id);
    return {operation:id,version:contract.operation_version,inputs:contract.inputs.map(p=>[p.name,p.semantic_type]),outputs:contract.outputs.map(p=>[p.name,p.semantic_type]),executor:Boolean(executor),pipeline:sdk.pipelineAdapters.some(a=>a.operation===id),trace:contract.outputs.some(p=>p.name==='trace'||JSON.stringify(p.schema).includes('trace'))};
  })}));
  await writeFile(join(output,'instrument-matrix.json'),JSON.stringify(matrix,null,2)+'\n');
}

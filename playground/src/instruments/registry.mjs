// Presentation routing only. Versions, contracts, availability and algorithms
// continue to come from the installed SDK and the editorial tool catalog.
const family = (kind, module, operations, versions = [1], profile, primaryOutputs = {}) => ({ kind, module, operations, versions, profile, primaryOutputs });
export const instrumentSeries = [
  family('keyboard', 'workbench', ['text.keyboard.remap', 'text.keyboard.coordinates.encode', 'text.keyboard.coordinates.decode', 'text.keyboard.shift.encode', 'text.keyboard.shift.decode']),
  family('enigma', 'mechanisms', ['cipher.enigma']),
  family('solitaire', 'mechanisms', ['cipher.solitaire.encode', 'cipher.solitaire.decode']),
  family('scytale', 'symbols', ['cipher.scytale.encode', 'cipher.scytale.decode']),
  family('cardan', 'symbols', ['cipher.cardan.extract', 'cipher.cardan.overlay']),
  family('semaphore', 'symbols', ['symbol.semaphore.encode', 'symbol.semaphore.decode']),
  family('brainfuck', 'mechanisms', ['esolang.brainfuck.execute', 'esolang.brainfuck.report', 'esolang.brainfuck.compare'], [2]),
  family('bit-plane', 'media', ['image.bit_plane.extract']),
  family('alberti', 'mechanisms', ['cipher.alberti.encode', 'cipher.alberti.decode']),
  family('m138a', 'mechanisms', ['cipher.m138a.encode', 'cipher.m138a.decode']),
  family('pigpen', 'symbols', ['symbol.alphabet.encode', 'symbol.alphabet.decode'], [1], 'pigpen_haverhill_pairs_v1', {'symbol.alphabet.encode':'tokens', 'symbol.alphabet.decode':'readings'}),
  family('book', 'workbench', ['cipher.book.encode', 'cipher.book.decode'], [1], undefined, {'cipher.book.encode':'coordinates'}),
  family('audio', 'media', ['audio.wave.inspect', 'audio.pcm.extract', 'audio.waveform.envelope', 'audio.spectrum', 'audio.spectrogram']),
  family('graph', 'workbench', ['graph.shortest_path']),
  family('braille', 'symbols', ['symbol.braille.encode', 'symbol.braille.decode']),
  family('morse', 'symbols', ['symbol.morse.encode', 'symbol.morse.decode']),
  family('polybius', 'workbench', ['cipher.polybius.encode', 'cipher.polybius.decode']),
  family('hex', 'media', ['file.binary.compare', 'file.hex.inspect', 'file.range.extract']),
  family('colors', 'media', ['image.histogram', 'image.colors.extract', 'image.colors.export', 'image.pixels.read']),
  family('png', 'media', ['image.png.inspect']),
];
export function presentationFor(action, parameters = {}) {
  if (!action) return null;
  return instrumentSeries.find(row => row.operations.includes(action.id) && row.versions.includes(action.contract.operation_version) && (!row.profile || (parameters.profile ?? action.direct?.parameters?.profile ?? action.contract.parameters?.properties?.profile?.default) === row.profile)) ?? null;
}

export function primaryOutputName(descriptor, result) {
  const names = Object.keys(result.outputs);
  return [descriptor?.primaryOutputs[result.operation], 'output', 'text'].find(name => names.includes(name)) ?? names[0];
}

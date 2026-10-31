const KEY = 'cubearc.playground.pipelines.v1';
const size = value => new TextEncoder().encode(value).byteLength;
export function checkEnvelope(value) {
  if (!value || value.format !== 'cubearc.playground.pipeline' || value.version !== 1 ||
      typeof value.name !== 'string' || value.name.length > 120 || typeof value.definition_json !== 'string' ||
      size(value.definition_json) > 256 * 1024 || (value.input_data_json !== undefined && typeof value.input_data_json !== 'string') ||
      Object.keys(value).some(key => !['format', 'version', 'name', 'definition_json', 'input_data_json', 'needs_parameters', 'id'].includes(key)) ||
      (value.needs_parameters !== undefined && (!Array.isArray(value.needs_parameters) || value.needs_parameters.some(name => typeof name !== 'string')))) throw new Error('Use a supported Cube pipeline document.');
  return value;
}
export class PipelineLibrary {
  constructor(storage) { this.storage = storage; }
  recovery() { return this.storage.getItem(KEY); }
  entries() {
    const raw = this.recovery();
    if (raw === null) return [];
    if (size(raw) > 240 * 1024) throw new Error('Saved library exceeds the local storage budget. Export recovery data before resetting it.');
    let value;
    try { value = JSON.parse(raw); } catch { throw new Error('Saved pipelines could not be read. Export recovery data before resetting them.'); }
    if (value?.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 20) throw new Error('Unsupported saved pipeline library. Export it before resetting.');
    value.entries.forEach(checkEnvelope);
    if (value.entries.some(entry => typeof entry.id !== 'string') || new Set(value.entries.map(entry => entry.id)).size !== value.entries.length) throw new Error('Saved pipeline identifiers are invalid.');
    return value.entries;
  }
  #write(entries) {
    if (entries.length > 20) throw new Error('Save at most 20 pipelines in this browser. Export or remove a pipeline first.');
    const raw = JSON.stringify({ version: 1, entries });
    if (size(raw) > 240 * 1024) throw new Error('Saved pipelines exceed the 240-KiB local library budget. Export this pipeline instead.');
    this.storage.setItem(KEY, raw);
  }
  save(value) {
    checkEnvelope(value);
    const entries = this.entries();
    const entry = { ...value, id: crypto.randomUUID() };
    this.#write([...entries, entry]);
    return entry.id;
  }
  remove(id) { const entries = this.entries(); this.#write(entries.filter(entry => entry.id !== id)); }
  reset() { this.storage.removeItem(KEY); }
}

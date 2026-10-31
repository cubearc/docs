import { snapshot } from './data.mjs';

function failure(message) { const error = new Error(message); error.code = 'resource_limit'; return error; }
function bytes(value) {
  if (value instanceof Uint8Array) return value.byteLength;
  if (typeof value === 'string') return new TextEncoder().encode(value).byteLength;
  if (!value || typeof value !== 'object') return 8;
  return Object.entries(value).reduce((sum, [key, item]) => sum + 24 + key.length * 3 + bytes(item), 24);
}

/** Draft/provenance state; Core remains the only plan validator and executor. */
export class PipelineDraft {
  #input = { type: 'text', data: '' };
  #steps = [];
  #slot = 'input';
  #revision = 0;
  #run = 0;
  #result;
  #undo;
  #rawDefinition;
  #info;
  name = 'Untitled pipeline';
  bindingsJson = '{}';

  get input() { return snapshot(this.#input); }
  setSlot(name) { this.#slot = name; this.#touch(); }
  get steps() { return snapshot(this.#steps); }
  get revision() { return this.#revision; }
  get advanced() { return this.#rawDefinition !== undefined; }
  get info() { return snapshot(this.#info); }
  get result() { return this.#result ? { ...snapshot(this.#result), earlierSettings: this.#result.snapshot.revision !== this.#revision } : null; }
  get canUndo() { return Boolean(this.#undo); }

  #touch() { this.#revision++; this.#undo = undefined; }
  setInput(value) {
    if (!value || !['text', 'bytes'].includes(value.type)) throw new Error('The form editor starts with text or bytes.');
    if (bytes(value) > 128 * 1024 + 256) throw failure('Pipeline input exceeds the 128-KiB editor limit.');
    this.#input = snapshot(value); this.#touch();
  }
  add(step) {
    if (this.advanced) throw new Error('This exact definition is read-only in the form editor.');
    if (this.#steps.length >= 64) throw failure('A Core pipeline supports at most 64 steps.');
    this.#steps.push({ uiId: crypto.randomUUID(), operation: step.operation, version: step.version, raw: snapshot(step.raw ?? {}), original: snapshot(step.original ?? {}) });
    this.#touch();
  }
  update(index, name, value) {
    if (!this.#steps[index]) throw new Error('Choose a current step.');
    if (bytes(value) > 16384) throw failure('An option exceeds the editor field budget.');
    Object.defineProperty(this.#steps[index].raw, name, { value: snapshot(value), enumerable: true, writable: true, configurable: true });
    this.#touch();
  }
  move(index, direction) {
    const target = index + direction;
    if (!this.#steps[index] || !this.#steps[target] || ![-1, 1].includes(direction)) return;
    [this.#steps[index], this.#steps[target]] = [this.#steps[target], this.#steps[index]];
    this.#touch();
  }
  remove(index) {
    if (!this.#steps[index]) return;
    const previous = snapshot(this.#steps);
    this.#steps.splice(index, 1); this.#touch(); this.#undo = previous;
  }
  undoRemove() { if (this.#undo) { const previous = this.#undo; this.#touch(); this.#steps = previous; } }
  setAdvanced(definition, info) {
    if (new TextEncoder().encode(definition).byteLength > 256 * 1024) throw failure('Definition exceeds the Core document limit.');
    this.#rawDefinition = definition; this.#info = snapshot(info); this.#steps = []; this.#touch();
  }
  setBindings(value) { if (new TextEncoder().encode(value).byteLength > 256 * 1024) throw failure('Bindings exceed the Core document limit.'); this.bindingsJson = value; this.#touch(); }
  describe() {
    return snapshot({ id: this.#run, revision: this.#revision, input: this.#input, inputSlot: this.#slot, steps: this.#steps, rawDefinition: this.#rawDefinition, info: this.#info, bindingsJson: this.bindingsJson, name: this.name });
  }
  begin() { this.#run++; return this.describe(); }
  accept(run, execution, views, receipt = null) {
    if (run.id !== this.#run || run.revision !== this.#revision) return false;
    const result = { snapshot: run, execution, views, receipt };
    if (bytes(result) > 4 * 1024 * 1024) throw failure('Retained pipeline previews exceed four MiB. Capture fewer intermediate steps.');
    this.#result = snapshot(result); return true;
  }
}

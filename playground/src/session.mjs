import { snapshot as copy } from './data.mjs';
const textBytes = value => new TextEncoder().encode(value).byteLength;
function size(value, ancestors = new Set()) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'string') return 24 + textBytes(value);
  if (typeof value !== 'object') return 8;
  if (value instanceof Uint8Array) return 24 + value.byteLength;
  if (ancestors.has(value)) throw new Error('Session data cannot contain cycles.');
  const next = new Set([...ancestors, value]);
  return Object.entries(value).reduce((sum, [key, item]) => sum + 24 + textBytes(key) + size(item, next), 24);
}

function checkInput(value) {
  if (!value || !['text', 'bytes', 'json', 'forensic_report'].includes(value.type) ||
      (value.type === 'text' && (typeof value.data !== 'string' || !value.data.isWellFormed())) ||
      (value.type === 'bytes' && !(value.data instanceof Uint8Array)) || value.data === undefined) throw new Error('Choose an explicit supported typed input.');
  const bytes = value.type === 'bytes' ? value.data.byteLength : value.type === 'text' ? textBytes(value.data) : textBytes(JSON.stringify(value.data));
  if (bytes > 128 * 1024) throw limit('Input exceeds the Playground 128-KiB limit.');
}

function limit(message) { const error = new Error(message); error.code = 'resource_limit'; return error; }

/** UI provenance only. Algorithms, type conversion and execution belong to SDK/Core. */
export class Session {
  #input = { type: 'text', data: '' };
  #root;
  #path = [];
  #revision = 0;
  #rounds = [];
  #preview;
  #previewGeneration = 0;
  #previousInput;
  #pins = [];
  #nextRound = 0;
  #nextResult = 0;
  #limits;

  constructor({ maxPins = 16, maxRounds = 8, maxResults = 24, maxRetainedBytes = 4 * 1024 * 1024 } = {}) {
    this.#limits = { maxPins, maxRounds, maxResults, maxRetainedBytes };
  }
  get input() { return copy(this.#input); }
  get originalInput() { return copy(this.#root ?? this.#input); }
  get path() { return copy(this.#path); }
  get rounds() { return copy(this.#rounds); }
  get pins() { return copy(this.#pins); }
  get current() { return copy(this.#preview ?? this.#rounds.at(-1) ?? null); }
  get preview() { return copy(this.#preview ?? null); }
  get canRestoreInput() { return Boolean(this.#previousInput); }

  latest(operation) {
    const live = this.#preview?.results.findLast(row => row.operation === operation);
    if (live) return copy(live);
    for (let index=this.#rounds.length-1; index>=0; index--) {
      const result=this.#rounds[index].results.findLast(row=>row.operation===operation);
      if (result) return copy(result);
    }
    return null;
  }

  #check(...added) {
    const retained = size({ input: this.#input, root: this.#root, path: this.#path, rounds: this.#rounds, preview: this.#preview, previousInput: this.#previousInput, pins: this.#pins });
    if (retained + added.reduce((sum, value) => sum + size(value), 0) > this.#limits.maxRetainedBytes) throw limit('Retained session limit reached; export or clear this session.');
  }

  invalidate() {
    this.#revision++;
    for (const result of this.#preview?.results ?? []) result.earlierInput = true;
    for (const round of this.#rounds) for (const result of round.results) result.earlierInput = true;
    for (const pin of this.#pins) pin.earlierInput = true;
  }
  setInput(value) {
    checkInput(value);
    this.#check(value);
    this.invalidate();
    this.#input = copy(value);
    this.#path = [];
    this.#root = undefined;
  }
  begin() {
    if (this.#rounds.length >= this.#limits.maxRounds) throw limit('Round history limit reached; save the sequence or clear the session.');
    const root = this.#root ?? copy(this.#input);
    const round = { id: this.#nextRound + 1, kind: 'retained', revision: this.#revision, input: copy(this.#input), root: copy(root), path: copy(this.#path), results: [] };
    const previous = this.#preview;
    this.#preview = undefined;
    try { this.#check(round, this.#root === undefined ? root : undefined); }
    catch (error) { this.#preview = previous; throw error; }
    this.#root = root;
    this.#nextRound++;
    this.#rounds.push(round);
    return Object.freeze({ round: round.id, revision: round.revision });
  }
  beginPreview() {
    const round = { id: `preview-${++this.#previewGeneration}`, kind: 'preview', revision: this.#revision,
      input: copy(this.#input), root: copy(this.#root ?? this.#input), path: copy(this.#path), results: [] };
    const previous = this.#preview;
    this.#preview = undefined;
    try { this.#check(round); }
    catch (error) { this.#preview = previous; throw error; }
    this.#preview = round;
    return Object.freeze({ round: round.id, revision: round.revision, preview: true });
  }
  retainPreview() {
    if (!this.#preview?.results.length) throw new Error('Run a tool before retaining its preview.');
    if (this.#rounds.length >= this.#limits.maxRounds) throw limit('Round history limit reached; export or clear history before retaining another preview.');
    const round = this.#preview;
    round.id = ++this.#nextRound; round.kind = 'retained';
    for (const result of round.results) { result.round = round.id; result.kind = 'retained'; }
    this.#rounds.push(round); this.#preview = undefined;
    return copy(round);
  }
  #forToken(token) {
    return token.preview ? this.#preview?.id === token.round && this.#preview?.revision === token.revision ? this.#preview : null
      : this.#rounds.find(round => round.id === token.round && round.revision === token.revision);
  }
  inputFor(token) {
    const round = this.#forToken(token);
    if (!round) throw new Error('This round no longer exists.');
    return copy(round.input);
  }
  accept(token, result) {
    const round = token.preview ? this.#preview : this.#rounds.at(-1);
    if (!round || round.id !== token.round || round.revision !== token.revision || this.#revision !== token.revision) return false;
    if (round.results.length >= this.#limits.maxResults) throw limit('Result limit reached for this round.');
    const entry = { ...copy(result), id: this.#nextResult + 1, kind: round.kind, round: round.id, revision: round.revision, earlierInput: false };
    this.#check(entry);
    this.#nextResult++;
    round.results.push(entry);
    return true;
  }
  #find(id) {
    const live = this.#preview?.results.find(result => result.id === id);
    if (live) return { result: live, round: this.#preview };
    for (const round of this.#rounds) {
      const result = round.results.find(result => result.id === id);
      if (result) return { result, round };
    }
    throw new Error('Select a retained result.');
  }
  continue(id, outputName, conversion) {
    let { result, round } = this.#find(id);
    const value = result.outputs[outputName];
    if (!value) throw new Error('Choose an exact named output.');
    const next = conversion?.value ?? value;
    checkInput(next);
    const path = [...copy(round.path), ...copy(result.steps ?? [{ operation: result.operation, version: result.version, parameters: result.parameters, outputPort: outputName }]), ...copy(conversion?.steps ?? [])];
    const previous = copy({ input: this.#input, root: this.#root, path: this.#path });
    this.#check(next, round.root, path, previous);
    if (round.kind === 'preview') { this.retainPreview(); ({ result, round } = this.#find(id)); }
    this.#previousInput = previous;
    this.invalidate();
    this.#input = copy(next);
    this.#root = copy(round.root);
    this.#path = path;
  }
  restoreInput() {
    if (!this.#previousInput) throw new Error('There is no previous input to restore.');
    const previous = this.#previousInput;
    this.invalidate(); this.#input = previous.input; this.#root = previous.root; this.#path = previous.path;
    this.#previousInput = undefined;
  }
  pin(id) {
    const existing = this.#pins.findIndex(result => result.id === id);
    if (existing >= 0) { this.#pins.splice(existing, 1); return; }
    if (this.#pins.length >= this.#limits.maxPins) throw limit('Pin limit reached; unpin a retained result first.');
    let { result, round } = this.#find(id);
    const pin = copy({ ...result, input: round.input, root: round.root, path: round.path });
    this.#check(pin);
    if (round.kind === 'preview') { this.retainPreview(); ({ result, round } = this.#find(id)); }
    this.#pins.push(copy({ ...result, input: round.input, root: round.root, path: round.path }));
  }
}

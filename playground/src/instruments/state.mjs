/** Presentation lifetime only: it never edits data or starts a Core operation. */
export class PresentationState {
  #generation = 0;
  #token;
  #views = new Map();
  ui(kind) {
    if (!this.#views.has(kind)) this.#views.set(kind, {});
    return this.#views.get(kind);
  }
  open(kind, revision) { return this.#token = Object.freeze({ kind, revision, generation: ++this.#generation }); }
  current(token, revision) { return this.#token === token && token.revision === revision; }
  close() { this.#token = undefined; this.#generation++; }
}

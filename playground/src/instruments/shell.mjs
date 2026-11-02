import { h, button, replace } from '../dom.mjs';
import { fieldsFor } from '../controls.mjs';
import { snapshot } from '../data.mjs';
import { PresentationState } from './state.mjs';

/** Adapts existing Playground/session ownership to lazy, disposable renderers. */
export function instrumentShell({ page, action, descriptor, runtime, changed, setInput, parameters, extra, redrawForm, selectAction, loadExample, convertInput }) {
  page.presentation ??= new PresentationState();
  const state = page.presentation;
  const ui = state.ui(descriptor.kind);
  const host = h('div', { class: `instrument instrument-${descriptor.kind}`, 'data-instrument': descriptor.kind });
  const warning = h('p', { class: 'warning small' });
  const surface = h('section', { class: 'panel instrument-surface', 'aria-label': `${descriptor.kind} visual instrument` }, warning, host);
  let cleanup;
  let disposed = false;
  let module;
  let data;
  let evidence;
  function record() { return evidence; }
  function rememberScroll() {
    const inputRevision=page.inputRevision ?? 0;
    if (ui.scrollInputRevision !== inputRevision) {
      ui.scrollInputRevision=inputRevision; ui.scrollPositions={}; return;
    }
    if (surface.hidden) return;
    ui.scrollPositions ??= {};
    for (const node of host.querySelectorAll('[data-instrument-scroll]')) ui.scrollPositions[node.dataset.instrumentScroll]={left:node.scrollLeft,top:node.scrollTop};
  }
  function restoreScroll() {
    if (surface.hidden) return;
    for (const node of host.querySelectorAll('[data-instrument-scroll]')) {
      const position=ui.scrollPositions?.[node.dataset.instrumentScroll];
      if (position) { node.scrollLeft=position.left; node.scrollTop=position.top; }
    }
  }
  function refresh({ focusId, fallbackFocusId, captureScroll = true } = {}) {
    if (disposed) return;
    if (captureScroll) rememberScroll();
    cleanup?.(); cleanup = undefined;
    evidence=page.session.latest(action.id);
    redrawForm?.();
    warning.textContent = record()?.earlierInput ? 'This result belongs to earlier input or settings. The instrument retains its producing evidence.' : '';
    if (!module || !data) return;
    const active = host.contains(document.activeElement) ? document.activeElement : null;
    const focus = focusId ?? active?.id;
    const selection = active && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
    try {
      cleanup = module.mountInstrument(host, api);
      restoreScroll();
      if (focus) {
        let next = host.querySelector(`#${CSS.escape(focus)}`);
        if ((!next || next.disabled) && fallbackFocusId) next = host.querySelector(`#${CSS.escape(fallbackFocusId)}`);
        next?.focus({ preventScroll: true });
        if (selection && next?.id === active?.id && next?.setSelectionRange && (next.tagName === 'TEXTAREA' || ['text','search','url','tel','password'].includes(next.type))) next.setSelectionRange(...selection);
      }
    } catch (error) { replace(host, h('p', { role: 'alert', class: 'error' }, error.message), button('Retry visual view', refresh)); }
  }
  const api = {
    kind: descriptor.kind, action, ui,
    get data() { return data; },
    input: () => page.session.input,
    text: () => page.session.input.type === 'text' ? page.session.input.data : '',
    parameters: () => snapshot(parameters()),
    param: name => parameters()[name] ?? fieldsFor(action).find(field => field.name === name)?.default,
    extra: name => extra()[name] ?? '',
    setInput,
    setText: text => setInput({ type: 'text', data: text }, {preservePresentation:true}),
    setParam(name, value) { Object.defineProperty(parameters(), name, {value,enumerable:true,configurable:true,writable:true}); changed(); },
    setExtra(name, value) { Object.defineProperty(extra(), name, {value,enumerable:true,configurable:true,writable:true}); changed(); },
    revision: () => page.revision,
    isCurrent: (revision = page.revision) => !disposed && page.tool === action.id && revision === page.revision,
    choices: name => fieldsFor(action).find(field => field.name === name)?.constraints.choices ?? [],
    result: () => Object.fromEntries(Object.entries(record()?.outputs ?? {}).map(([name,value]) => [name,value.data])),
    stale: () => Boolean(record()?.earlierInput),
    snapshot: () => snapshot(record()?.snapshot ?? null),
    refresh,
    selectAction,
    loadExample,
    convertInput,
    inputReadCurrent: token => !disposed && page.tool === action.id && page.secondaryReading?.token === token,
    pendingInputRead(token, completedToken) {
      if (disposed || page.tool !== action.id) return;
      if (token) page.secondaryReading = { token, action:action.id };
      else if (page.secondaryReading?.action === action.id && (!completedToken || page.secondaryReading.token === completedToken)) page.secondaryReading = null;
      page.redraw?.();
    },
    async execute(id, inputs, options = {}) {
      const revision = page.revision;
      const controller = new AbortController();
      page.auxiliary?.abort(); page.auxiliary = controller;
      const current = runtime.action(id);
      if (!current?.direct) throw new Error('This analysis is not available in the installed SDK.');
      const result = await runtime.call('execute', [{operation:id,version:current.direct.version,inputs,parameters:options}], { signal:controller.signal,context:{section:'instrument',revision} });
      if (controller.signal.aborted || disposed || revision !== page.revision || page.tool !== action.id) throw new Error('The input or tool changed. This earlier analysis was not applied.');
      return result;
    },
  };
  const token = state.open(descriptor.kind, page.revision);
  Promise.all([import(`./${descriptor.module}.mjs`), runtime.instrumentData()]).then(([renderer, assets]) => {
    if (disposed || !state.current(token, token.revision) || page.tool !== action.id) return;
    module = renderer; data = assets; refresh();
  }).catch(error => { if (!disposed) replace(host, h('p', {role:'alert',class:'error'},error.message)); });
  host.append(h('p', {role:'status',class:'muted'},'Loading this instrument…'));
  return { surface, refresh, rememberScroll, dispose() { rememberScroll(); disposed = true; cleanup?.(); module?.disposeInstrument?.(api); page.auxiliary?.abort(); page.secondaryReading = null; state.close(); } };
}

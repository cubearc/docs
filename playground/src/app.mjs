import { h, button, notify } from './dom.mjs';
import { initializeRuntime } from './runtime.mjs';
import { Session } from './session.mjs';
import { PipelineDraft } from './pipeline.mjs';
import { PipelineLibrary } from './library.mjs';
import { loadPipeline } from './pipeline-document.mjs';
import { mountPlayground } from './playground-view.mjs';
import { mountPipelines } from './pipelines-view.mjs';
import { mountTools } from './tools-view.mjs';
import { resolveToolLink } from './tool-route.mjs';

const main = document.querySelector('#main');
const state = {
  playground: { session: new Session(), mode: 'Decode', tool: null, parameters: {}, extraInputs: {}, revision: 0,
    running: false, errors: [], status: 'Ready. Paste text or choose a file.', pendingNext: false, filter: 'all', showRound: null,
    outputChoices: {}, viewChoices: {}, utf8: true, auto: false, fast: new Map(), sourceName: null },
  catalog: { query: '', category: '', favoritesOnly: false, shown: 50, tool: null, action: null, detailOpen: false },
  favorites: [],
  pipeline: { draft: new PipelineDraft(), library: new PipelineLibrary({ getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value), removeItem: key => localStorage.removeItem(key) }), mode: 'library', capture: 'all',
    error: '', running: false, includeInput: false, includeKeys: false },
};
try {
  const favorites = JSON.parse(localStorage.getItem('cubearc.playground.favorites.v1') ?? '[]');
  if (!Array.isArray(favorites) || favorites.length > 400 || favorites.some(value => typeof value !== 'string' || value.length > 160)) throw new Error();
  state.favorites = favorites;
} catch { notify('Saved favorites could not be read. You can select favorites again.'); }
let runtime;
let activeController;
let section = 'playground';
function beginRun() { activeController?.abort(); activeController = new AbortController(); return activeController; }
function navigate(next) { if (location.hash === `#/${next}`) route(); else location.hash = `#/${next}`; }
function useTool(action) {
  state.playground.controller?.abort(); state.playground.readingFile = null;
  state.playground.session.invalidate(); state.playground.revision++;
  state.playground.tool = action.id; state.playground.running = false;
  state.playground.status = 'Tool selected. Review its options, then run with your current input.';
  if (action.id.endsWith('.encode')) state.playground.mode = 'Encode';
  if (action.id.endsWith('.decode')) state.playground.mode = 'Decode';
  navigate('playground');
}
function addStep(action) {
  try {
    if (!action.pipeline) throw new Error('This tool has no supported linear pipeline adapter.');
    if (state.pipeline.draft.advanced) throw new Error('Start a new pipeline to add editable steps. The imported exact definition is preserved.');
    state.pipeline.controller?.abort();
    state.pipeline.draft.add({ operation: action.id, version: action.pipeline.version });
    state.pipeline.mode = 'editor'; navigate('pipelines');
  } catch (error) { notify(error.message); }
}
async function fromSequence(steps, input, outputType) {
  try {
    for (const step of steps) {
      const action = runtime.action(step.operation);
      if (!action?.pipeline || action.pipeline.version !== step.version || (step.outputPort && step.outputPort !== 'output')) throw new Error('The selected sequence contains an individual tool or named output without a compatible linear pipeline adapter. It cannot be flattened into a pipeline.');
    }
    const definition = { format_version: 1, engine_api: 1, input: { source: 'inline', value: input }, output: { type: outputType },
      steps: steps.map(({ operation, version, parameters }) => ({ operation, version, ...(parameters ? { parameters } : {}) })) };
    const definitionJson = await runtime.call('recipeJson', [definition]);
    const { draft } = await loadPipeline(runtime, { format: 'cubearc.playground.pipeline', version: 1, name: 'Untitled pipeline', definition_json: definitionJson });
    state.pipeline.controller?.abort(); state.pipeline.draft = draft; state.pipeline.mode = 'editor'; state.pipeline.error = '';
    navigate('pipelines');
  } catch (error) { notify(error.message); }
}
function render() {
  if (!runtime) return;
  state.playground.redraw = null; state.pipeline.redraw = null;
  const mountedSection = section;
  const context = { runtime, state, render, navigate, beginRun, useTool, addStep, fromSequence, isCurrentView: () => section === mountedSection,
    saveFavorites() { try { localStorage.setItem('cubearc.playground.favorites.v1', JSON.stringify(state.favorites)); } catch { notify('Favorites could not be saved in this browser.'); } },
    clearSession() {
      if (!confirm('Clear the current Playground history and pins? Saved pipelines will remain.')) return;
      state.playground.controller?.abort(); clearTimeout(state.playground.autoTimer);
      state.playground.session = new Session(); state.playground.revision++; state.playground.running = false; state.playground.readingFile = null;
      state.playground.errors = []; state.playground.pendingNext = false; state.playground.sourceName = null;
      state.playground.outputChoices = {}; state.playground.viewChoices = {}; state.playground.status = 'Session cleared.'; render();
    },
  };
  ({ playground: mountPlayground, pipelines: mountPipelines, tools: mountTools }[section])(main, context);
  for (const link of document.querySelectorAll('nav a')) {
    if (link.hash === `#/${section}`) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
}
function route() {
  if (!runtime) return;
  if (location.hash && !location.hash.startsWith('#/')) return;
  const [, requested] = location.hash.split('/');
  section = ['playground', 'pipelines', 'tools'].includes(requested) ? requested : 'playground';
  if (section === 'tools') {
    Object.assign(state.catalog, resolveToolLink(location.hash, runtime.tools, state.playground.mode));
  }
  render();
  if (section === 'tools' && state.catalog.restoreList) {
    state.catalog.restoreList = false;
    const selected = document.querySelector(`[data-tool="${CSS.escape(state.catalog.listFocus ?? '')}"]`);
    (selected ?? document.querySelector('#tool-search'))?.focus({ preventScroll: true });
    scrollTo({ top: selected ? state.catalog.listScroll ?? 0 : 0, behavior: 'instant' });
  } else main.focus({ preventScroll: true });
}
window.addEventListener('hashchange', route);
async function start() {
  main.replaceChildren(h('h1', {}, 'Cube Playground'), h('p', { role: 'status' }, 'Loading the local tools…'));
  try {
    runtime = await initializeRuntime();
    document.querySelector('#runtime-details').textContent = JSON.stringify({ build: runtime.sdk.build, limits: runtime.sdk.limits,
      catalogOperations: runtime.catalog.operations.length, directExecutors: runtime.sdk.executors.length, pipelineAdapters: runtime.sdk.pipelineAdapters.length }, null, 2);
    route();
  } catch (error) {
    main.replaceChildren(h('h1', {}, 'Local tools could not start'), h('p', { class: 'warning', role: 'alert' }, error.message), button('Retry loading tools', start, { class: 'primary' }), button('Reload site', () => location.reload()));
  }
}
start();

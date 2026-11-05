import { h, button, notify } from './dom.mjs';
import { initializeRuntime } from './runtime.mjs';
import { migrateFavorites } from './catalog.mjs';
import { Session } from './session.mjs';
import { PipelineDraft, pipelineCompatibility } from './pipeline.mjs';
import { parametersFor } from './controls.mjs';
import { snapshot } from './data.mjs';
import { PreviewScheduler } from './execution-policy.mjs';
import { mountSidebar, navigationDrawer } from './sidebar.mjs';
import { PipelineLibrary } from './library.mjs';
import { loadPipeline } from './pipeline-document.mjs';
import { mountPlayground } from './playground-view.mjs';
import { mountPipelines } from './pipelines-view.mjs';
import { resolveWorkspaceRoute, toolLink } from './tool-route.mjs';

const main = document.querySelector('#main');
const state = {
  playground: { session: new Session(), mode: 'Decode', tool: null, parameters: {}, extraInputs: {}, revision: 0, inputRevision: 0,
    running: false, errors: [], status: 'Ready. Paste text or choose a file.', pendingNext: false, filter: 'all', showRound: null,
    outputChoices: {}, viewChoices: {}, utf8: true, auto: true, slow: new Set(), sourceName: null, scheduler: new PreviewScheduler(), lastActions: {}, inputTouched: false },
  catalog: { query: '', category: '', favoritesOnly: false, shown: 50, tool: null, action: null, detailOpen: false },
  activity: 'playground', favorites: [],
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
let sidebar; let drawer; let mountedKey;
let nextFocus;
const viewMemory=new Map();
let rendered = false;
function beginRun() { activeController?.abort(); activeController = new AbortController(); return activeController; }
function navigate(next) {
  if(next==='tools'){drawer?.open();sidebar?.focusSearch();return;}
  const hash=`#/${next}`;
  if(location.hash!==hash)history.pushState(null,'',hash);
  route();
}
function useTool(action,{focusId='playground-input'}={}) {
  // Revoke on the selection intent, before the browser's queued hashchange.
  // A file/import completion in that interval still belongs to the old tool.
  if(action.id!==state.playground.tool||state.catalog.routeError)revokePreview();
  nextFocus={action:action.id,id:focusId};
  const link=toolLink(action);
  if(location.hash!==link)history.pushState(null,'',link);
  route();
}
async function addStep(action) {
  const draft=state.pipeline.draft;
  const revision=draft.revision, editRevision=state.playground.revision;
  try {
    if(state.catalog.routeError)throw new Error('Open the current operation version before adding this step.');
    const compatibility=pipelineCompatibility(draft,action,runtime);
    if(!compatibility.compatible)throw new Error(compatibility.reason);
    const raw=snapshot(state.playground.parameters[action.id]??{});
    const parameters=await parametersFor(runtime,action,raw);
    if(state.pipeline.draft!==draft||draft.revision!==revision||state.playground.revision!==editRevision)throw new Error('The input or pipeline changed before the step was added. Try again.');
    state.pipeline.controller?.abort();
    draft.add({operation:action.id,version:action.pipeline.version,original:parameters});
    state.pipeline.mode='editor';navigate('pipelines');
  } catch(error){notify(error.message);}
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
function workspaceKey(){return section==='playground'?`playground:${state.playground.tool??'multidecoder'}`:'pipelines';}
function rememberView() {
  if(!mountedKey)return;
  const field=main.querySelector('#playground-input');
  viewMemory.set(mountedKey,{scroll:scrollY,selection:field?.selectionStart===undefined?null:[field.selectionStart,field.selectionEnd]});
}
function render({restore=true}={}) {
  if (!runtime) return;
  const focused=main.contains(document.activeElement)?document.activeElement?.id:null;
  rememberView();
  state.playground.dispose?.(); state.playground.dispose = null;
  state.playground.redraw = null; state.playground.redrawParameters = null; state.pipeline.redraw = null;
  const mountedSection = section, mountedTool=state.playground.tool;
  const context = { runtime, state, render, navigate, beginRun, useTool, addStep, fromSequence,
    isCurrentView: () => section === mountedSection && (section!=='playground'||state.playground.tool===mountedTool),
    saveFavorites() { try { localStorage.setItem('cubearc.playground.favorites.v1', JSON.stringify(state.favorites)); } catch { notify('Favorites could not be saved in this browser.'); } sidebar?.updateFavorites(); },
    clearSession() {
      if (!confirm('Clear the current Playground history and pins? Saved pipelines will remain.')) return;
      state.playground.controller?.abort(); state.playground.scheduler.cancel();
      state.playground.session = new Session(); state.playground.revision++; state.playground.inputRevision++; state.playground.running = false; state.playground.readingFile = null; state.playground.secondaryReading = null;
      state.playground.errors = []; state.playground.pendingNext = false; state.playground.sourceName = null;state.playground.inputTouched=false;
      state.playground.outputChoices = {}; state.playground.viewChoices = {}; state.playground.presentation = undefined; state.playground.status = 'Session cleared.'; render();
    },
  };
  ({ playground: mountPlayground, pipelines: mountPipelines }[section])(main, context);
  mountedKey=workspaceKey();rendered=true;
  const memory=viewMemory.get(mountedKey),field=main.querySelector('#playground-input');
  if(memory?.selection&&field?.setSelectionRange)field.setSelectionRange(...memory.selection);
  if(restore&&focused)main.querySelector(`#${CSS.escape(focused)}`)?.focus({preventScroll:true});
  sidebar?.updateSelection();
}
function revokePreview() {
  const page=state.playground;
  page.scheduler.cancel();page.controller?.abort();page.auxiliary?.abort();
  page.session.invalidate();page.revision++;page.readingFile=null;page.secondaryReading=null;page.running=false;page.errors=[];page.phase='selected';
}
function route() {
  if (!runtime) return;
  let next=resolveWorkspaceRoute(location.hash,runtime.tools,state.playground.mode);
  if(!next){
    if(!rendered){section=['#steps-section','#pipeline-result'].includes(location.hash)?'pipelines':'playground';state.activity=section;render();}
    return;
  }
  rememberView();
  const nextId=next.action?.id??null;
  if(section!==next.activity||state.playground.tool!==nextId||state.catalog.routeError!==next.routeError){revokePreview();}
  section=next.activity;state.activity=section;
  state.playground.tool=nextId;state.catalog.routeError=next.routeError;
  if(next.action){
    const family=runtime.tools.find(tool=>tool.actions.some(action=>action.id===nextId));
    state.playground.lastActions[family.key]=nextId;
    if(nextId.endsWith('.encode'))state.playground.mode='Encode';
    if(nextId.endsWith('.decode'))state.playground.mode='Decode';
  }
  state.playground.status=next.routeError||'Ready.';
  // A navigation replaces the operation view, while the app shell and sidebar
  // stay mounted. Result updates never call this route renderer.
  mountedKey=null;render({restore:false});
  const memory=viewMemory.get(workspaceKey());
  scrollTo({top:memory?.scroll??0,behavior:'instant'});
  drawer?.close();
  if(nextFocus?.action===nextId){
    const target=nextFocus.id==='playground-input'&&matchMedia('(max-width:760px)').matches?main:document.getElementById(nextFocus.id)??main;
    target.focus({preventScroll:true});nextFocus=undefined;
  }
  if(next.search){drawer?.open();sidebar.focusSearch();}
}
window.addEventListener('hashchange', route);
async function start() {
  rendered = false;
  main.replaceChildren(h('h1', {}, 'Cube Playground'), h('p', { role: 'status' }, 'Loading the local tools…'));
  try {
    runtime = await initializeRuntime();
    state.favorites = migrateFavorites(state.favorites, runtime.tools);
    document.querySelector('#runtime-details').textContent = JSON.stringify({ build: runtime.sdk.build, limits: runtime.sdk.limits,
      catalogOperations: runtime.catalog.operations.length, directExecutors: runtime.sdk.executors.length, pipelineAdapters: runtime.sdk.pipelineAdapters.length }, null, 2);
    sidebar=mountSidebar(document.querySelector('#tool-sidebar'),{runtime,state,useTool,navigate});
    drawer=navigationDrawer(document.querySelector('#tool-sidebar'),document.querySelector('#toggle-tools'),main);
    route();
  } catch (error) {
    main.replaceChildren(h('h1', {}, 'Local tools could not start'), h('p', { class: 'warning', role: 'alert' }, error.message), button('Retry loading tools', start, { class: 'primary' }), button('Reload site', () => location.reload()));
  }
}
start();

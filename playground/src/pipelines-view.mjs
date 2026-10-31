import { h, button, replace, notify, download } from './dom.mjs';
import { parametersForm, resultViewer } from './controls.mjs';
import { PipelineDraft } from './pipeline.mjs';
import { loadPipeline, recipeForDraft, exportPipeline, importPipeline } from './pipeline-document.mjs';

export function mountPipelines(container, context) {
  const { runtime, state, render, beginRun, navigate, isCurrentView } = context;
  const page = state.pipeline;
  const draft = page.draft;
  if (page.readingFile && (page.readingFile.draft !== draft || page.readingFile.revision !== draft.revision)) { page.readingFile = null; page.error = ''; }
  const safe = work => async () => { try { await work(); } catch (error) { page.error = error.message; notify(error.message); page.redraw?.(); } };
  const edit = change => { page.controller?.abort(); page.readingFile = null; change(); page.running = false; page.error = ''; page.redraw?.(); };
  const output = h('section', { id: 'pipeline-result', class: 'panel', 'aria-label': 'Pipeline result', tabindex: -1 });
  const errorBox = h('p', { class: 'warning', role: 'status' });
  const runButton = button('Run pipeline', safe(run), { class: 'primary', id: 'run-pipeline' });
  const stepsBox = h('section', { id: 'steps-section', 'aria-label': 'Steps', tabindex: -1 });

  async function run() {
    if (page.readingFile) return;
    const captured = { ...draft.begin(), capture: page.capture };
    const controller = beginRun(); page.controller = controller;
    page.running = true; page.error = ''; page.redraw?.();
    const options = { signal: controller.signal, context: { section: 'pipelines', revision: captured.revision, run: captured.id } };
    try {
      const { definition } = await recipeForDraft(runtime, captured, options);
      const info = await runtime.call('validateRecipe', [definition], options);
      const captures = captured.capture === 'final' ? [] : info.plan.steps.map((_, index) => index);
      const bindings = captured.rawDefinition === undefined ? {} : captured.bindingsJson;
      const receipt = await runtime.request('runRecipe', [definition, bindings, { captures }], options);
      const execution = receipt.value;
      const views = { final: await runtime.representations(execution.output, options), intermediates: {} };
      for (const [index, value] of Object.entries(execution.intermediates)) views.intermediates[index] = await runtime.representations(value, options);
      if (!controller.signal.aborted) draft.accept(captured, execution, views,
        { requestId: receipt.requestId, generation: receipt.generation, context: receipt.context, info, build: runtime.sdk.build.sourceSha256 });
    } catch (error) { if (!controller.signal.aborted) page.error = `${error.step !== undefined ? `Step ${error.step + 1}: ` : ''}${error.message}`; }
    finally { if (page.controller === controller) { page.running = false; page.redraw?.(); } }
  }

  const envelope = () => exportPipeline(runtime, draft, { includeInput: page.includeInput, includeKeys: page.includeKeys });

  function showLoaded(loaded) {
    page.controller?.abort(); page.readingFile = null; page.draft = loaded.draft; page.mode = 'editor';
    page.error = loaded.missing.length ? `Add the omitted options before running: ${loaded.missing.join('; ')}`
      : loaded.inputOmitted ? 'Definition loaded without input data. Add your starting input before running.' : '';
    if (isCurrentView()) render();
  }

  const currentSelection = selection => page.readingFile === selection && page.draft === selection.draft && selection.draft.revision === selection.revision;
  function beginSelection(message) {
    page.controller?.abort(); page.running = false;
    const selection = { draft, revision: draft.revision };
    page.readingFile = selection; page.error = message; page.redraw?.();
    return selection;
  }
  function selectionFailed(selection, error) {
    if (!currentSelection(selection)) return;
    page.readingFile = null; page.error = error.message; page.redraw?.();
    if (!isCurrentView()) notify(error.message);
  }
  async function selectDocument(read) {
    const selection = beginSelection('Loading the selected pipeline…');
    try {
      const loaded = await read(() => currentSelection(selection));
      if (currentSelection(selection)) showLoaded(loaded);
    } catch (error) { selectionFailed(selection, error); }
  }
  const load = document => selectDocument(() => loadPipeline(runtime, document));

  async function importFile(file) {
    if (!file) return;
    return selectDocument(async current => {
      if (file.size > 240 * 1024) throw new Error('Import at most 240 KiB. Definitions and included data must fit the editor budget.');
      const text = await file.text();
      if (!current()) return;
      return importPipeline(runtime, text, file.name);
    });
  }
  async function selectFile(file) {
    if (!file) return;
    const selection = beginSelection('Reading the selected input file…');
    try {
      if (file.size > 128 * 1024) throw new Error('Choose a file no larger than 128 KiB.');
      const data = new Uint8Array(await file.arrayBuffer());
      if (!currentSelection(selection)) return;
      edit(() => draft.setInput({ type: 'bytes', data }));
      if (isCurrentView() && page.mode === 'editor') render();
    } catch (error) { selectionFailed(selection, error); }
  }

  const importInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onChange: event => importFile(event.target.files[0]) });

  function libraryView() {
    let entries;
    try { entries = page.library.entries(); }
    catch (error) {
      let recovery;
      try { recovery = page.library.recovery(); } catch { /* Storage may be disabled by this browser. */ }
      return h('section', { class: 'panel' }, h('h2', {}, 'Recover saved pipelines'), h('p', { class: 'warning' }, error.message),
        typeof recovery === 'string' ? button('Download recovery data', () => download(recovery, 'cube-pipelines-recovery.json', 'application/json')) : null,
        button('Reset pipeline library', () => { if (confirm('Remove only the saved Cube pipeline library from this browser? Export recovery data first.')) { page.library.reset(); render(); } }));
    }
    return h('section', { class: 'panel' }, h('h2', {}, 'Saved in this browser'), h('p', { class: 'small muted' }, 'Definitions and optional input data are labeled separately. Loading never runs a pipeline.'),
      !entries.length ? h('p', {}, 'No saved pipelines yet. Build a sequence or import a Core recipe.') : null,
      entries.map(entry => h('article', { class: 'separator' }, h('h3', {}, entry.name), h('p', { class: 'small muted' }, `${entry.input_data_json !== undefined ? 'Includes input data' : 'Definition only'}${entry.needs_parameters?.length ? ' · options omitted' : ''}`),
        h('div', { class: 'toolbar' }, button('Open', safe(() => load(entry))),
          button('Export definition document', () => download(JSON.stringify(entry, null, 2), 'cube-pipeline.json', 'application/json')),
          button('Remove saved copy', safe(() => { page.library.remove(entry.id); render(); }))))));
  }
  const heading = h('div', { class: 'heading' }, h('h1', {}, 'Pipelines'), h('p', {}, 'Keep a useful sequence. See what each step changes.'));
  if (page.mode === 'library') {
    container.replaceChildren(heading, h('div', { class: 'toolbar spacer' }, button('New pipeline', () => { page.draft = new PipelineDraft(); page.mode = 'editor'; render(); }, { class: 'primary' }), button('Import pipeline', () => importInput.click()), importInput), libraryView(), errorBox);
    page.redraw = () => { errorBox.textContent = page.error; }; page.redraw(); return;
  }

  function renderOutput() {
    errorBox.textContent = page.error;
    runButton.disabled = page.running || Boolean(page.readingFile);
    const result = draft.result;
    replace(output, h('h2', {}, 'Result'), page.running ? h('p', { role: 'status' }, 'Running the real local pipeline…') : null,
      result?.earlierSettings ? h('p', { class: 'warning' }, 'Produced with earlier input or settings. Run again for the edited pipeline.') : null,
      !result ? h('div', { class: 'empty-state' }, 'Run your pipeline to see the final result and intermediate previews.') :
        resultViewer(result.execution.output, result.views.final, { title: 'Pipeline result', id: 'pipeline-final' }),
      result ? h('details', {}, h('summary', {}, 'See each produced step'),
        Object.entries(result.execution.intermediates).map(([index, value]) => h('section', { class: 'separator' },
          h('h3', {}, `${Number(index) + 1}. ${runtime.action(result.receipt.info.plan.steps[index].operation)?.title ?? result.receipt.info.plan.steps[index].operation}`),
          resultViewer(value, result.views.intermediates[index], { title: `Step ${Number(index) + 1}`, id: `captured-${index}` }))),
        !Object.keys(result.execution.intermediates).length ? h('p', {}, 'This run captured only the final result.') : null) : null,
      result ? h('details', {}, h('summary', {}, 'Produced from'), h('p', {}, `${result.snapshot.input.type} input · ${result.receipt.build.slice(0, 16)} runtime`),
        h('details', {}, h('summary', {}, 'Starting input from this run'), result.snapshot.rawDefinition !== undefined ? h('p', {}, 'Input comes from the retained exact definition and bindings.') : h('pre', {}, result.snapshot.input.type === 'text' ? result.snapshot.input.data : `${result.snapshot.input.data.byteLength} exact bytes`)),
        h('pre', {}, result.snapshot.rawDefinition !== undefined ? 'Exact imported definition retained for this run.' : result.snapshot.steps.map((step, index) => `${index + 1}. ${runtime.action(step.operation)?.title ?? step.operation}`).join('\n'))) : null);
  }
  function focusStep(uiId) { (document.getElementById(`step-${uiId}-heading`) ?? document.querySelector('#add-step'))?.focus(); }
  function renderSteps(focusId) {
    replace(stepsBox, h('h2', {}, 'Steps'), draft.advanced ? h('p', { class: 'muted' }, 'This imported Core definition is preserved exactly. The form editor does not rewrite its data, wide numbers or execution semantics.') : null,
      draft.advanced ? draft.info.plan.steps.map((step, index) => h('article', { class: 'panel step' }, h('h3', {}, `${index + 1}. ${runtime.action(step.operation)?.title ?? step.operation}`))) :
        draft.steps.map((step, index) => {
          const action = runtime.action(step.operation);
          const previousType = index ? runtime.action(draft.steps[index - 1].operation).pipeline.output_type : draft.input.type;
          return h('article', { class: 'panel step', 'data-step': index }, h('div', { class: 'row between' }, h('h3', { id: `step-${step.uiId}-heading`, tabindex: -1 }, `${index + 1}. ${action.title}`), h('span', { class: 'tag' }, `${action.pipeline.input_type} → ${action.pipeline.output_type}`)),
            previousType !== action.pipeline.input_type ? h('p', { class: 'warning' }, `This step needs ${action.pipeline.input_type}; the previous value is ${previousType}. Add and reorder an explicit conversion before running.`) : null,
            parametersForm(action, step.raw, (name, value) => edit(() => draft.update(index, name, value)), `step-${step.uiId}`, step.original),
            h('div', { class: 'toolbar' }, button('Move up', () => { edit(() => draft.move(index, -1)); renderSteps(step.uiId); }, { disabled: index === 0, 'aria-label': `Move up: step ${index + 1}` }),
              button('Move down', () => { edit(() => draft.move(index, 1)); renderSteps(step.uiId); }, { disabled: index === draft.steps.length - 1, 'aria-label': `Move down: step ${index + 1}` }),
              button('Remove', () => { edit(() => draft.remove(index)); renderSteps(); focusStep(draft.steps[Math.min(index, draft.steps.length - 1)]?.uiId); })));
        }),
      !draft.advanced && !draft.steps.length ? h('p', { class: 'empty-state' }, 'Add a tool to start your ordered sequence.') : null,
      draft.canUndo ? button('Undo removal', () => { const previous = new Set(draft.steps.map(step => step.uiId)); edit(() => draft.undoRemove()); renderSteps(draft.steps.find(step => !previous.has(step.uiId))?.uiId); }) : null);
    if (focusId) focusStep(focusId);
  }
  const currentInput = draft.input;
  const fileInput = h('input', { hidden: true, type: 'file', onChange: event => selectFile(event.target.files[0]) });
  const input = draft.advanced ? h('div', { class: 'panel' }, h('h2', {}, 'Exact imported definition'), h('details', {}, h('summary', {}, 'View preserved Core definition'), h('pre', {}, draft.describe().rawDefinition)),
    draft.info.input_slot ? h('div', { class: 'field' }, h('label', { for: 'pipeline-bindings' }, `Typed input bindings JSON (slot: ${draft.info.input_slot})`), h('textarea', { id: 'pipeline-bindings', rows: 6, value: draft.bindingsJson, onInput: event => safe(() => edit(() => draft.setBindings(event.target.value)))() }), h('p', { class: 'small muted' }, 'Use Core typed values: text data, or bytes with a Base64 data object. Bindings are parsed and validated by Core.')) : h('p', {}, 'This definition includes its own input data.')) :
    h('section', { class: 'panel', 'aria-label': 'Starting input' }, h('h2', {}, 'Starting input'), currentInput.type === 'text' ? h('textarea', { id: 'pipeline-input', 'aria-label': 'Starting input', class: 'input-text', value: currentInput.data, onInput: event => safe(() => edit(() => draft.setInput({ type: 'text', data: event.target.value })))() }) : h('p', {}, `${currentInput.data.byteLength} exact bytes selected.`),
      h('div', { class: 'toolbar' }, button('Open file', () => fileInput.click()), button('Use text input', () => { edit(() => draft.setInput({ type: 'text', data: '' })); render(); }), fileInput));
  const choices = runtime.tools.flatMap(tool => tool.actions).filter(action => action.pipeline).sort((a, b) => a.title.localeCompare(b.title));
  const addSelect = h('select', { id: 'add-step' }, choices.map(action => h('option', { value: action.id }, `${action.title} (${action.pipeline.input_type} → ${action.pipeline.output_type})`)));
  replace(container, heading, h('div', { class: 'toolbar' }, button('← Saved pipelines', () => { page.mode = 'library'; render(); }), button('Browse all tools', () => navigate('tools'))),
    h('div', { class: 'field spacer' }, h('label', { for: 'pipeline-name' }, 'Pipeline name'), h('input', { id: 'pipeline-name', maxlength: 120, value: draft.name, onInput: event => { draft.name = event.target.value; } })),
    h('div', { class: 'section-jumps toolbar' }, h('a', { class: 'button', href: '#steps-section' }, 'Steps'), h('a', { class: 'button', href: '#pipeline-result' }, 'Result')),
    h('div', { class: 'pipeline-grid' }, h('div', {}, input, stepsBox,
      !draft.advanced ? h('div', { class: 'panel spacer' }, h('label', { for: 'add-step' }, 'Add a step'), addSelect, button('Add selected step', () => safe(() => { const action = runtime.action(addSelect.value); edit(() => draft.add({ operation: action.id, version: action.pipeline.version })); renderSteps(); })(), { class: 'wide spacer' })) : null), output),
    h('section', { class: 'panel spacer' }, h('div', { class: 'toolbar' }, runButton, button('Stop', () => { page.controller?.abort(); page.running = false; page.readingFile = null; page.error = 'Pending input and worker work stopped. The previous input is retained.'; page.redraw?.(); }),
      h('label', { for: 'capture-mode' }, 'Previews'), h('select', { id: 'capture-mode', onChange: event => { page.capture = event.target.value; } }, h('option', { value: 'all', selected: page.capture !== 'final' }, 'Each step'), h('option', { value: 'final', selected: page.capture === 'final' }, 'Final result only'))), errorBox),
    h('section', { class: 'panel spacer' }, h('h2', {}, 'Save and export'), h('p', { class: 'small muted' }, 'Definitions are separate from input data. Keys and input data are omitted by default. Saved copies stay in this browser.'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: page.includeInput, onChange: event => { page.includeInput = event.target.checked; } }), 'Include input data'),
      h('label', { class: 'check spacer' }, h('input', { type: 'checkbox', checked: page.includeKeys, onChange: event => { page.includeKeys = event.target.checked; } }), 'Include keys and sensitive options'),
      h('div', { class: 'toolbar spacer' }, button('Save local copy', safe(async () => { const document = await envelope(); page.library.save(document); notify('Pipeline saved in this browser.'); })),
        button('Export pipeline', safe(async () => download(JSON.stringify(await envelope(), null, 2), 'cube-pipeline.json', 'application/json'))), button('Import pipeline', () => importInput.click()), importInput)));
  page.redraw = renderOutput; renderSteps(); renderOutput();
}

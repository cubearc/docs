import { h, button, replace, append, notify, download } from './dom.mjs';
import { labelFor, parametersForm, parametersFor, resultViewer } from './controls.mjs';
import { snapshot } from './data.mjs';
import { presentationFor } from './instruments/registry.mjs';
import { instrumentShell } from './instruments/shell.mjs';

const PRESETS = {
  Decode: ['encoding.base64.decode', 'encoding.hex.decode', 'encoding.base32.decode', 'encoding.base58.decode', 'cipher.rot13', 'cipher.atbash'],
  Encode: ['encoding.base64.encode', 'encoding.hex.encode', 'encoding.base32.encode', 'encoding.base58.encode', 'cipher.rot13'],
};
const bytesOf = value => value.type === 'bytes' ? value.data.byteLength : new TextEncoder().encode(value.type === 'text' ? value.data : JSON.stringify(value.data)).byteLength;

export function mountPlayground(container, context) {
  const { state, runtime, render, navigate, beginRun, fromSequence, isCurrentView } = context;
  const page = state.playground;
  const session = page.session;
  const results = h('section', { id: 'results-section', 'aria-label': 'Results', tabindex: -1 });
  const inputOptions = h('div', { class: 'input-options' });
  const runButton = button('Run tools', () => run(), { class: 'primary', id: 'run-tools' });
  const status = h('p', { role: 'status', class: 'small muted' }, page.status);
  const originalAction = page.tool ? runtime.action(page.tool) : null;
  const descriptor = presentationFor(originalAction, page.parameters[page.tool] ?? {});
  const selected = descriptor && originalAction?.direct ? { ...originalAction, pipeline: null } : originalAction;
  let instrument;
  const parameterRegion = h('div', { id: 'instrument-parameters' });
  const hasInput = !selected || selected.contract.inputs.length > 0;
  const inputLabel = selected?.direct && !selected.pipeline && hasInput ? selected.contract.inputs[0].name === 'input' ? 'Your input' : `${labelFor(selected.contract.inputs[0].name)} input` : 'Your input';

  function changed({ input, preservePresentation = false } = {}) {
    page.controller?.abort(); page.auxiliary?.abort();
    clearTimeout(page.autoTimer);
    page.revision++;
    page.readingFile = null; page.secondaryReading = null;
    page.running = false;
    page.errors = [];
    page.pendingNext = false;
    page.status = 'Input or settings changed. Run again to refresh results.';
    if (input) { session.setInput(input); if (!preservePresentation) page.inputRevision=(page.inputRevision ?? 0)+1; } else session.invalidate();
    page.redraw?.();
    if (page.auto && !page.tool && session.input.type === 'text' && session.input.data && bytesOf(session.input) <= 4096) {
      const qualified = PRESETS[page.mode].filter(id => (page.fast.get(id) ?? 0) >= bytesOf(session.input));
      if (qualified.length) page.autoTimer = setTimeout(() => run({ ids: qualified, automatic: true }), 300);
      else { page.status = 'Run once to measure fast tools before automatic updates.'; page.redraw?.(); }
    }
  }

  async function setFile(file) {
    if (!file) return;
    page.readingFile = null;
    let selection;
    try {
      if (file.size > 128 * 1024) throw new Error('Choose a file no larger than 128 KiB for this Playground.');
      changed(); clearTimeout(page.autoTimer);
      selection = { revision: page.revision, session };
      page.readingFile = selection;
      page.status = 'Reading the selected file…'; page.redraw?.();
      const value = { type: 'bytes', data: new Uint8Array(await file.arrayBuffer()) };
      if (page.readingFile !== selection || page.revision !== selection.revision || page.session !== session) return;
      changed({ input: value }); page.sourceName = file.name;
      page.status = 'File ready. Run tools with these exact bytes.';
      if (isCurrentView()) render();
    } catch (error) {
      if (selection && page.readingFile !== selection) return;
      page.readingFile = null; page.status = error.message; page.redraw?.(); if (!isCurrentView()) notify(error.message);
    }
  }

  async function run({ ids, automatic = false, continueAfter = false, keepTool = false } = {}) {
    if (page.readingFile || page.secondaryReading) return;
    const revision = page.revision;
    const rawParameters = snapshot(page.parameters);
    const rawExtras = snapshot(page.extraInputs);
    const utf8 = page.utf8;
    const controller = beginRun();
    page.auxiliary?.abort();
    page.controller = controller;
    let token;
    try { token = session.begin(); }
    catch (error) { notify(error.message); return; }
    page.running = true; page.errors = []; page.pendingNext = false; page.showRound = null;
    page.status = automatic ? 'Updating recently measured fast tools…' : 'Comparing independent alternatives…';
    page.redraw?.();
    const rootInput = session.inputFor(token);
    const sourceName = page.sourceName;
    const candidates = ids ?? (page.tool ? [page.tool] : rootInput.type === 'bytes' && page.mode === 'Decode' ? ['text.utf8.decode'] : PRESETS[page.mode]);
    const options = { signal: controller.signal, context: { section: 'playground', revision, round: token.round }, timeoutMs: automatic ? 1000 : 30000 };
    try {
      for (const id of candidates) {
        if (controller.signal.aborted || page.revision !== revision) break;
        const action = selected?.id === id ? selected : runtime.action(id);
        if (!action?.available) { page.errors.push({ title: action?.title ?? 'Tool', message: action?.unavailableReason ?? 'This operation is unavailable in this runtime.' }); continue; }
        const started = performance.now();
        try {
          const parameters = await parametersFor(runtime, action, rawParameters[id] ?? {}, options);
          const result = await runtime.perform(action, session.inputFor(token), parameters, { ...options, utf8, extraInputs: rawExtras[id] ?? {} });
          const views = {};
          for (const [name, value] of Object.entries(result.outputs)) views[name] = await runtime.representations(value, options);
          if (controller.signal.aborted || page.revision !== revision) break;
          session.accept(token, { ...result, snapshot: {input:rootInput, parameters, extraInputs:rawExtras[id] ?? {}, namedInputs:result.namedInputs}, views, sourceName, producingBuild: runtime.sdk.build.sourceSha256 });
          const elapsed = performance.now() - started;
          if (!page.tool && elapsed < 120 && bytesOf(rootInput) <= 4096) page.fast.set(id, Math.max(page.fast.get(id) ?? 0, bytesOf(rootInput)));
          else if (automatic) page.fast.delete(id);
          page.redraw?.(); instrument?.refresh();
          if (continueAfter) { const record = session.current.results.at(-1); continueWith(record, 'output', undefined, keepTool); break; }
        } catch (error) {
          if (controller.signal.aborted || page.revision !== revision) break;
          page.errors.push({ title: action.title, message: error.message, code: error.code, parameter: error.parameter });
          page.redraw?.();
        }
      }
    } finally {
      if (page.revision === revision) {
        page.running = false;
        page.status = controller.signal.aborted ? 'This attempt will add no further results. Worker termination does not confirm Core completion or cooperative cancellation.' : `${session.current?.results.length ?? 0} results ready from the same input.`;
        page.redraw?.();
      }
    }
  }

  function continueWith(result, output, conversion, keepTool = false) {
    try {
      page.controller?.abort();
      session.continue(result.id, output, conversion);
      page.revision++; page.inputRevision=(page.inputRevision ?? 0)+1; page.readingFile = null; page.running = false; page.pendingNext = true; page.errors = []; page.showRound = null;
      page.sourceName = `Result from ${runtime.action(result.operation)?.title ?? 'previous step'}`;
      page.status = 'Next input ready. Your original input and previous rounds are retained.';
      if (!keepTool) page.tool = null; render();
      document.querySelector('#input-section')?.focus();
    } catch (error) { notify(error.message); }
  }

  function chooseContinue(result, output) {
    const value = result.outputs[output];
    if (value.type !== 'bytes') { continueWith(result, output); return; }
    const dialog = h('dialog', { class: 'panel', 'aria-labelledby': 'continue-title' }, h('h2', { id: 'continue-title' }, 'Choose the next input'),
      h('p', {}, 'Keep the exact bytes, or explicitly convert valid UTF-8 to text.'),
      h('div', { class: 'toolbar' }, button('Continue with exact bytes', () => { dialog.close(); continueWith(result, output); }, { class: 'primary' }),
        result.views[output]['UTF-8 text'] !== undefined ? button('Continue as UTF-8 text', () => { dialog.close(); continueWith(result, output, { value: { type: 'text', data: result.views[output]['UTF-8 text'] }, steps: [{ operation: 'text.utf8.decode', version: 1 }] }); }) : null,
        button('Cancel', () => dialog.close())));
    dialog.addEventListener('close', () => dialog.remove()); document.body.append(dialog); dialog.showModal();
  }

  function card(result) {
    const action = runtime.action(result.operation);
    const names = Object.keys(result.outputs);
    const selectedName = names.length === 1 ? names[0] : page.outputChoices[result.id];
    const pinned = session.pins.some(row => row.id === result.id);
    const view = selectedName ? resultViewer(result.outputs[selectedName], result.views[selectedName], {
      title: action?.title ?? 'Result', id: `result-${result.id}`, pinned,
      choice: page.viewChoices[`${result.id}:${selectedName}`], onChoice: choice => { page.viewChoices[`${result.id}:${selectedName}`] = choice; },
      onPin: () => { try { session.pin(result.id); page.redraw?.(); } catch (error) { notify(error.message); } },
      onContinue: () => chooseContinue(result, selectedName),
    }) : h('p', { class: 'muted' }, 'Choose which named output to view, copy or continue.');
    const safeParameters = Object.fromEntries(Object.entries(result.parameters ?? {}).map(([name, value]) => [name, action?.contract.policy.sensitive_parameters.includes(name) ? '[provided; hidden]' : value]));
    return h('article', { class: 'panel result-card', 'data-result-operation': result.operation }, h('div', { class: 'row between' }, h('h3', {}, action?.title ?? 'Result'), h('span', { class: 'tag' }, `Round ${result.round}`)),
      result.earlierInput ? h('p', { class: 'warning small' }, 'From an earlier input or settings.') : null,
      names.length > 1 ? h('div', { class: 'field' }, h('label', { for: `output-${result.id}` }, 'Choose an output'), h('select', { id: `output-${result.id}`, onChange: event => { page.outputChoices[result.id] = event.target.value; page.redraw?.(); } }, h('option', { value: '' }, 'Choose an output'), names.map(name => h('option', { value: name, selected: name === selectedName }, `${labelFor(name)} (${result.outputs[name].type})`)))) : null,
      action?.contract.inputs.length === 0 ? h('p', { class: 'small muted' }, 'Generated from options; no starting input was used.') : null,
      view, h('details', {}, h('summary', {}, 'Used settings'), h('pre', {}, JSON.stringify({ operation: result.operation, version: result.version, parameters: safeParameters, conversions: result.steps?.slice(0, -1) ?? result.conversions ?? [] }, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2))));
  }

  function renderResults() {
    const current = session.current;
    const retained = !current?.results.length && page.tool ? session.rounds.findLast(round => round.results.some(result => result.operation === page.tool)) : null;
    const round = page.showRound ? session.rounds.find(round => round.id === page.showRound) : retained ?? current;
    const records = page.filter === 'pinned' ? session.pins : page.pendingNext ? [] : round?.results ?? [];
    const history = session.rounds;
    replace(results, h('div', { class: 'result-header' }, h('div', { class: 'row between' }, h('h2', {}, 'Results'), h('div', { class: 'segmented' },
      button('All', () => { page.filter = 'all'; renderResults(); }, { id: 'result-filter-all', 'aria-pressed': String(page.filter !== 'pinned') }),
      button('Pinned', () => { page.filter = 'pinned'; renderResults(); }, { id: 'result-filter-pinned', 'aria-pressed': String(page.filter === 'pinned') }))),
      h('p', { class: 'small muted' }, 'Every alternative starts from the same frozen round input.')),
      retained && !page.showRound ? h('p',{class:'small muted'},`Showing retained evidence from round ${retained.id}; the latest attempt has no accepted result.`) : null,
      records.length ? h('div', { class: 'result-grid' }, records.map(card)) : h('div', { class: 'empty-state' }, page.running ? 'Running the real local tools…' : page.pendingNext ? 'Next input ready. Run the next round when you are ready.' : 'Paste text or choose a file, then run tools to compare results.'),
      page.errors.length ? h('details', { class: 'panel spacer' }, h('summary', {}, `Not applicable or needs options (${page.errors.length})`), h('ul', { class: 'compact-list' }, page.errors.map(error => h('li', {}, h('strong', {}, error.title), h('p', { class: 'small' }, error.message))))) : null,
      history.length ? h('details', { class: 'panel spacer' }, h('summary', {}, `Previous rounds and original input (${history.length})`),
        history.map(item => h('div', {}, button(`Round ${item.id} · ${item.input.type} · ${item.results.length} results`, () => { page.showRound = item.id; page.pendingNext = false; page.filter = 'all'; renderResults(); }, { class: 'round-button' }), h('details', {}, h('summary', {}, `Retained input · round ${item.id}`), h('p', {class:'small muted'},`${item.input.type} · ${bytesOf(item.input).toLocaleString()} bytes. Original bytes and text are retained independently of later edits.`), button(`Download input from round ${item.id}`,()=>download(item.input.data instanceof Uint8Array ? item.input.data : item.input.type==='text'?item.input.data:JSON.stringify(item.input.data,null,2),`cube-round-${item.id}-input.${item.input.type==='bytes'?'bin':'txt'}`)), button(`Download original for round ${item.id}`,()=>download(item.root.data instanceof Uint8Array ? item.root.data : item.root.type==='text'?item.root.data:JSON.stringify(item.root.data,null,2),`cube-round-${item.id}-original.${item.root.type==='bytes'?'bin':'txt'}`))))),
        h('p', { class: 'small muted' }, `Original input: ${session.originalInput.type}, ${bytesOf(session.originalInput).toLocaleString()} bytes.`),
        button('Download original input', () => { const value = session.originalInput; download(value.data instanceof Uint8Array ? value.data : value.type === 'text' ? value.data : JSON.stringify(value.data, null, 2), value.type === 'bytes' ? 'cube-original.bin' : 'cube-original.txt'); })) : null);
  }

  const value = session.input;
  let inputControl;
  if (!hasInput) inputControl = null;
  else if (value.type === 'text') inputControl = h('textarea', { id: 'playground-input', class: 'input-text', value: value.data, spellcheck: false, 'aria-label': inputLabel, onInput: event => { try { changed({ input: { type: 'text', data: event.target.value }, preservePresentation: descriptor?.kind === 'keyboard' || descriptor?.kind === 'graph' }); instrument?.refresh(); } catch (error) { notify(error.message); runButton.disabled = true; } } });
  else inputControl = h('div', { class: 'byte-input' }, h('strong', {}, page.sourceName ?? `${labelFor(value.type)} input`), h('p', { class: 'muted' }, `${bytesOf(value).toLocaleString()} bytes · ${value.type}`),
    value.type === 'bytes' ? button('Use as UTF-8 text', () => run({ ids: ['text.utf8.decode'], continueAfter: true })) : h('pre', {}, JSON.stringify(value.data, null, 2).slice(0, 2048)));
  const fileInput = h('input', { type: 'file', id: 'playground-file', hidden: true, onChange: event => setFile(event.target.files[0]) });
  const inputMain = !hasInput ? h('div', { class: 'input-main' }, h('p', { class: 'muted' }, 'This tool uses the options below. No starting input is required.')) : h('div', { class: 'input-main' }, h('label', { for: 'playground-input' }, inputLabel), inputControl,
    h('div', { class: 'toolbar spacer' }, button('Paste', async () => { try { const text = await navigator.clipboard.readText(); changed({ input: { type: 'text', data: text } }); page.sourceName = null; render(); } catch { notify('Use your keyboard or system paste command in the text field.'); } }),
      button('Open file', () => fileInput.click()), button('Clear', () => { changed({ input: { type: 'text', data: '' } }); page.sourceName = null; render(); }), fileInput),
    h('p', { class: 'small muted' }, 'Up to 128 KiB. Choose a file to retain exact bytes, including line endings.'));
  if (selected) {
    page.parameters[selected.id] ??= {};
    function form() { return parametersForm(selected, page.parameters[selected.id], (name, value) => { page.parameters[selected.id][name] = value; changed(); if (presentationFor(originalAction,page.parameters[selected.id])?.kind !== descriptor?.kind) render(); else instrument?.refresh(); }, 'playground-options'); }
    const optionsForm = form();
    parameterRegion.append(...(optionsForm ? [optionsForm] : []));
    const extra = selected.direct && !selected.pipeline ? selected.contract.inputs.slice(1).map(port => {
      page.extraInputs[selected.id] ??= {};
      const representation = selected.direct.inputs[port.name];
      return h('div', { class: 'field' }, h('label', { for: `extra-${port.name}` }, `${labelFor(port.name)}${['bytes', 'byte_array'].includes(representation) ? ' (Base64 bytes)' : ['json', 'image_samples'].includes(representation) ? ' (JSON)' : ''}`),
        h('textarea', { id: `extra-${port.name}`, rows: 2, value: page.extraInputs[selected.id][port.name] ?? '', maxlength: 131072, onInput: event => { page.extraInputs[selected.id][port.name] = event.target.value; changed(); instrument?.refresh(); } }));
    }) : [];
    const namedFields = h('div', {}, ...extra);
    parameterRegion.prepend(namedFields);
    page.redrawParameters = () => {
      if (!parameterRegion.contains(document.activeElement)) { replace(parameterRegion, namedFields, form() ?? h('p',{class:'muted'},'No additional parameters.')); }
      if (inputControl?.tagName === 'TEXTAREA' && document.activeElement !== inputControl && session.input.type === 'text') inputControl.value = session.input.data;
      for (const port of selected.contract.inputs.slice(1)) { const field=document.getElementById(`extra-${port.name}`); if(field && field!==document.activeElement) field.value=page.extraInputs[selected.id]?.[port.name] ?? ''; }
    };
    append(inputOptions, descriptor ? null : h('h3', {}, selected.title), descriptor ? null : parameterRegion);
  }
  async function loadExample() {
    const revision = page.revision;
    const id = selected.id;
    try {
      const details = await runtime.toolDetails(selected);
      if (page.revision !== revision || page.tool !== id) return;
      const values = details.example;
      const names = selected.contract.inputs.map(port => port.name);
      const primary = names[0];
      const representation = selected.direct.inputs[primary];
      let input = {type:'text',data:values.inputs[primary] ?? ''};
      if (['bytes','byte_array'].includes(representation)) {
        const raw = JSON.parse(values.inputs[primary]);
        input = {type:'bytes',data:representation === 'byte_array' ? Uint8Array.from(raw) : (await runtime.call('execute',[{operation:'encoding.base64.decode',version:1,inputs:{input:raw.base64}}])).output};
      }
      if (page.revision !== revision || page.tool !== id) return;
      const raw = Object.fromEntries(Object.entries(values.parameters).map(([name,value]) => {
        const field = selected.contract.parameters.properties?.[name];
        return [name, field?.type === 'boolean' ? JSON.parse(value) : value];
      }));
      const extra = {};
      for (const name of names.slice(1)) {
        const kind=selected.direct.inputs[name];
        if (kind === 'bytes') extra[name] = JSON.parse(values.inputs[name]).base64;
        else if (kind === 'byte_array') extra[name] = (await runtime.call('execute',[{operation:'encoding.base64.encode',version:1,inputs:{input:Uint8Array.from(JSON.parse(values.inputs[name]))}}])).output;
        else extra[name] = values.inputs[name];
      }
      if (page.revision !== revision || page.tool !== id) return;
      page.parameters[id] = raw;
      page.extraInputs[id] = extra;
      changed({input}); page.sourceName = 'Core conformance example'; page.status = 'Synthetic Core example loaded. Run to produce your own result.'; render();
    } catch(error) { page.status=error.message; page.redraw?.(); }
  }
  function selectAction(id) {
    const next = runtime.action(id);
    if (!next?.available) return;
    if (!page.parameters[id]) page.parameters[id] = Object.fromEntries(Object.entries(page.parameters[selected.id] ?? {}).filter(([name])=>Object.hasOwn(next.contract.parameters.properties ?? {},name)));
    if (!page.extraInputs[id]) page.extraInputs[id] = snapshot(page.extraInputs[selected.id] ?? {});
    context.useTool(next);
  }
  if (descriptor) {
    page.extraInputs[selected.id] ??= {};
    instrument = instrumentShell({page,action:selected,descriptor,runtime,changed,
      setInput(value, options = {}) { const previous=session.input.type; changed({input:value,...options}); if (previous !== value.type) render(); },
      parameters:()=>page.parameters[selected.id], extra:()=>page.extraInputs[selected.id],
      redrawForm:()=>page.redrawParameters?.(),selectAction,loadExample,convertInput:id=>run({ids:[id],continueAfter:true,keepTool:true})});
    page.dispose = instrument.dispose;
  }
  append(inputOptions, hasInput && (!descriptor || selected.direct.inputs[selected.contract.inputs[0].name] === 'bytes' && value.type === 'text') ? h('label', { class: 'check spacer' }, h('input', { type: 'checkbox', checked: page.utf8, onChange: event => { page.utf8 = event.target.checked; changed(); } }), 'Use UTF-8 for text sent to byte tools') : null,
    hasInput && !descriptor ? h('label', { class: 'check spacer' }, h('input', { type: 'checkbox', checked: page.auto, onChange: event => { page.auto = event.target.checked; changed(); } }), 'Update recently fast tools as I type') : null,
    hasInput && !descriptor ? h('p', { class: 'small muted' }, 'Automatic updates require a measured fast run and an input of 4 KiB or less.') : null,
    h('div', { class: 'toolbar' }, runButton, button('Stop', () => { clearTimeout(page.autoTimer); page.controller?.abort(); page.auxiliary?.abort(); page.running = false; page.readingFile = null; page.secondaryReading = null; page.status = 'Stop requested; pending input and results are revoked. Core completion is not confirmed; the previous input is retained.'; page.redraw?.(); })), status,
    hasInput && !descriptor ? button('Try an example', () => { changed({ input: { type: 'text', data: page.mode === 'Decode' ? 'SGVsbG8sIEN1YmUh' : 'Hello, Cube!' } }); page.tool = null; render(); }) : null,
    descriptor ? button('Load Core example', loadExample, {id:'load-core-example'}) : null,
    selected ? button('Compare common tools', () => { page.tool = null; changed(); render(); }) : null);
  replace(container, h('div', { class: 'heading' }, h('h1', { id: 'playground-heading' }, selected ? selected.title : `${page.mode} text`), h('p', {}, selected ? selected.description : page.mode === 'Decode' ? 'Paste a message. Compare the possibilities.' : 'One message, several formats.'),
    session.path.length ? h('div', { class: 'row spacer' }, h('span', { class: 'tag' }, `${session.path.length} chosen steps`), button('Save chosen sequence', () => fromSequence(session.path, session.originalInput, session.input.type))) : null),
    h('div', { class: 'section-jumps toolbar' }, h('a', { class: 'button', href: '#input-section' }, 'Input'), h('a', { class: 'button', href: '#results-section' }, 'Results')),
    h('div', { class: descriptor ? 'play-grid visual-workspace' : 'play-grid' }, h('section', { class: 'panel input-panel', id: 'input-section', tabindex: -1, 'aria-label': 'Input and options' },
      descriptor ? h('div', {class:'field instrument-action'}, h('label',{for:'instrument-action'},'Action'), h('select',{id:'instrument-action',onChange:event=>selectAction(event.target.value)}, descriptor.operations.map(id=>runtime.action(id)).filter(Boolean).map(action=>h('option',{value:action.id,selected:action.id===selected.id},action.title)))) : h('div', { class: 'segmented mode-control' }, ['Decode', 'Encode'].map(mode => button(mode, () => { page.mode = mode; page.tool = null; changed(); render(); }, { 'aria-pressed': String(page.mode === mode) }))), inputMain, inputOptions), ...(descriptor ? [h('div', {class:'instrument-tabs segmented',role:'group','aria-label':'Editor view'}, ['Visual','Parameters'].map(tab=>button(tab,()=>{ page.instrumentTab=tab; updateTab(); },{id:`instrument-tab-${tab.toLowerCase()}`,'aria-pressed':String((page.instrumentTab ?? 'Visual')===tab)}))), instrument.surface, h('section',{class:'panel instrument-options',id:'instrument-parameter-panel','aria-label':'Operation parameters'},parameterRegion)] : []), results),
    h('div', { class: 'toolbar spacer' }, button('Browse all tools', () => navigate('tools')), button('Clear session history', () => context.clearSession())));
  function updateTab() {
    if (!instrument) return;
    const visual = (page.instrumentTab ?? 'Visual') === 'Visual';
    const wasHidden=instrument.surface.hidden;
    if (!visual) instrument.rememberScroll();
    instrument.surface.hidden = !visual;
    const options = container.querySelector('#instrument-parameter-panel'); if (options) options.hidden = visual;
    for (const tab of ['Visual','Parameters']) container.querySelector(`#instrument-tab-${tab.toLowerCase()}`)?.setAttribute('aria-pressed',String((page.instrumentTab ?? 'Visual') === tab));
    if (visual) instrument.refresh({captureScroll:!wasHidden});
  }
  updateTab();
  page.dispose = instrument?.dispose;
  page.redraw = () => { runButton.disabled = page.running || Boolean(page.readingFile) || Boolean(page.secondaryReading); status.textContent = page.status; renderResults(); };
  page.redraw();
}

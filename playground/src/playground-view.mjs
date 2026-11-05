import { h, button, replace, append, notify, download } from './dom.mjs';
import { labelFor, parametersForm, parametersFor, resultViewer } from './controls.mjs';
import { snapshot } from './data.mjs';
import { presentationFor, primaryOutputName } from './instruments/registry.mjs';
import { instrumentShell } from './instruments/shell.mjs';
import { isInstrumentStudy } from './instruments/study.mjs';
import { automaticPolicy, comparisonCandidates, manualComparisons, updateExecutionPolicy, inputBytes as bytesOf } from './execution-policy.mjs';
import { toolHelp } from './tools-view.mjs';
import { pipelineCompatibility } from './pipeline.mjs';

export function mountPlayground(container, context) {
  const { state, runtime, render, navigate, beginRun, fromSequence, isCurrentView } = context;
  const page = state.playground;
  const session = page.session;
  const results = h('section', { id: 'results-section', 'aria-label': 'Results', tabindex: -1 });
  const inputOptions = h('div', { class: 'input-options' });
  const runButton = button('Run', () => run(), { class: 'primary', id: 'run-tools' });
  const stopButton=button('Stop',()=>{
    page.scheduler.cancel();page.controller?.abort();page.auxiliary?.abort();session.invalidate();page.revision++;page.phase='stopped';
    page.running=false;page.readingFile=null;page.secondaryReading=null;page.status='Stop requested; pending updates are revoked. Core completion is not confirmed.';page.redraw?.();instrument?.refresh();
  });
  const status = h('p', { role: 'status', class: 'small muted' }, page.status);
  const originalAction = page.tool ? runtime.action(page.tool) : null;
  const descriptor = presentationFor(originalAction, page.parameters[page.tool] ?? {});
  const selected = descriptor && originalAction?.direct ? { ...originalAction, pipeline: null } : originalAction;
  const enigmaStudy = descriptor?.kind === 'enigma';
  const instrumentStudy = isInstrumentStudy(descriptor);
  let instrument;
  const parameterRegion = h('div', { id: 'instrument-parameters' });
  const hasInput = !selected || selected.contract.inputs.length > 0;
  const inputLabel = selected?.direct && !selected.pipeline && hasInput && !['input','text'].includes(selected.contract.inputs[0].name) ? `${labelFor(selected.contract.inputs[0].name)} input` : 'Input';
  const family = runtime.tools.find(tool=>tool.actions.some(action=>action.id===page.tool));
  page.editorTabs ??= {};page.inputActions??={};
  const inputActionKey=page.tool??'multidecoder';
  const editorTab=()=>page.editorTabs[selected?.id]??'Visual';
  const policyStatus=h('p',{class:'small muted auto-status',id:'automatic-status'});
  const routeError=state.catalog.routeError;page.routeError=routeError;
  function policy(){return selected?automaticPolicy(selected,session.input,{parameters:page.parameters[selected.id]??{},extraInputs:page.extraInputs[selected.id]??{},slow:page.slow.has(selected.id)}):{eligible:comparisonCandidates(runtime,page.mode,session.input,{slow:page.slow}).length>0,reason:bytesOf(session.input)>4096?'Input exceeds the 4-KiB automatic budget. Run explicitly.':'Automatic updates · up to 6 independent alternatives'};}
  function schedulePreview(delay=250) {
    page.scheduler.cancel();
    const eligibility=policy();
    if(page.phase==='stopped'){page.redraw?.();return;}
    if(!page.auto||!page.inputTouched||!eligibility.eligible||routeError||page.readingFile||page.secondaryReading||!isCurrentView()){
      if(!['file','example','continued','failure'].includes(page.phase))page.status=routeError||(!page.inputTouched?hasInput?'Add input to begin.':'Configure options, then run.':!page.auto?'Automatic updates paused. Run explicitly.':eligibility.reason);
      page.redraw?.();return;
    }
    const revision=page.revision,tool=page.tool;
    page.status='Updating…';page.phase='updating';page.redraw?.();
    page.scheduler.schedule(async()=>{if(page.revision===revision&&page.tool===tool&&isCurrentView())await run({automatic:true});},delay);
  }

  function rejectedInput(error) {
    page.scheduler.cancel();page.controller?.abort();page.auxiliary?.abort();session.invalidate();page.revision++;
    page.readingFile=null;page.secondaryReading=null;
    page.running=false;page.phase='invalid';page.errors=[{title:'Input not accepted',message:`${error.message} The previous input is retained.`,code:error.code??'invalid_input'}];
    page.status='Input not accepted. The previous input is retained.';page.redraw?.();instrument?.refresh();
  }

  function changed({ input, preservePresentation = false } = {}) {
    // Validate before revoking accepted work. A rejected edit cannot acquire
    // ownership of a later read or attach results to unaccepted input.
    if(input)session.setInput(input);else session.invalidate();
    page.controller?.abort(); page.auxiliary?.abort();page.scheduler.cancel();
    page.revision++;page.readingFile=null;page.secondaryReading=null;page.running=false;
    page.errors=[];page.pendingNext=false;page.phase='edited';
    if(input){page.sourceName=null;page.inputTouched=true;if(!preservePresentation)page.inputRevision=(page.inputRevision??0)+1;}
    schedulePreview();
  }

  async function setFile(file) {
    if (!file||!isCurrentView()) return;
    page.readingFile = null;
    let selection;
    try {
      if (file.size > 128 * 1024) throw new Error('Choose a file no larger than 128 KiB for this Playground.');
      changed(); page.scheduler.cancel();
      selection = { revision: page.revision, session };
      page.readingFile = selection;
      page.status = 'Reading the selected file…'; page.redraw?.();
      const value = { type: 'bytes', data: new Uint8Array(await file.arrayBuffer()) };
      if (page.readingFile !== selection || page.revision !== selection.revision || page.session !== session) return;
      changed({ input: value }); page.sourceName = file.name;
      page.phase='file';page.status = 'Exact file bytes loaded.';
      if (isCurrentView()) render();
    } catch (error) {
      if (selection && page.readingFile !== selection) return;
      page.readingFile = null; page.status = error.message; page.redraw?.(); if (!isCurrentView()) notify(error.message);
    }
  }

  async function pasteInput() {
    if(!isCurrentView())return;
    changed();page.scheduler.cancel();
    const request=page.readingFile={kind:'clipboard',revision:page.revision,session};
    page.status='Reading clipboard…';page.redraw?.();
    const current=()=>page.readingFile===request&&page.revision===request.revision&&page.session===session&&isCurrentView();
    try {
      const text=await navigator.clipboard.readText();
      if(!current())return;
      try {changed({input:{type:'text',data:text}});page.sourceName=null;render();document.querySelector('#playground-input')?.focus();}
      catch(error){rejectedInput(error);}
    }catch {
      if(current()){page.phase='failure';page.status='Paste in the Input field using your keyboard or system paste command.';page.redraw?.();}
    }finally{if(page.readingFile===request){page.readingFile=null;page.redraw?.();}}
  }

  async function run({ ids, automatic = false, continueAfter = false, keepTool = false } = {}) {
    if (page.readingFile || page.secondaryReading) return;
    if(routeError)return;
    const revision = page.revision;
    if(!automatic){page.scheduler.cancel();page.controller?.abort();await page.scheduler.idle();if(revision!==page.revision||!isCurrentView())return;}
    const utf8 = page.utf8;
    const controller = beginRun();
    page.auxiliary?.abort();
    page.controller = controller;
    let token;
    let acceptedCount = 0;
    try { token = automatic ? session.beginPreview() : session.begin(); }
    catch (error) { page.running=false;page.phase='failure';page.status=error.message;page.errors=[{title:'Session limit',message:error.message,code:error.code}];page.redraw?.();return; }
    page.running = true; page.errors = []; page.pendingNext = false; page.showRound = null;
    page.phase='updating';page.status=automatic?'Updating…':selected?'Running locally…':'Comparing independent alternatives…';
    page.redraw?.();
    const rootInput = session.inputFor(token);
    const sourceName = page.sourceName;
    const candidates = ids ?? (page.tool ? [page.tool] : automatic ? comparisonCandidates(runtime,page.mode,rootInput,{slow:page.slow}) : manualComparisons(page.mode,rootInput));
    const rawParameters=snapshot(Object.fromEntries(candidates.map(id=>[id,page.parameters[id]??{}])));
    const rawExtras=snapshot(Object.fromEntries(candidates.map(id=>[id,page.extraInputs[id]??{}])));
    const options = { signal: controller.signal, context: { section: 'playground', revision, round: token.round }, timeoutMs: automatic ? 2000 : 30000 };
    try {
      for (const id of candidates) {
        if (controller.signal.aborted || page.revision !== revision) break;
        const action = selected?.id === id ? selected : runtime.action(id);
        if (!action?.available) { page.errors.push({ title: action?.title ?? 'Tool', message: action?.unavailableReason ?? 'This operation is unavailable in this runtime.' }); continue; }
        const started = performance.now();
        try {
          let parameters;
          try {parameters=await parametersFor(runtime, action, rawParameters[id] ?? {}, options);}
          catch(error){error.code??='invalid_parameter';throw error;}
          const result = await runtime.perform(action, session.inputFor(token), parameters, { ...options, utf8, extraInputs: rawExtras[id] ?? {} });
          const views = {};
          for (const [name, value] of Object.entries(result.outputs)) views[name] = await runtime.representations(value, options);
          if (controller.signal.aborted || page.revision !== revision) break;
          const accepted=session.accept(token, { ...result, snapshot: {input:rootInput, parameters, extraInputs:rawExtras[id] ?? {}, namedInputs:result.namedInputs}, views, sourceName, producingBuild: runtime.sdk.build.sourceSha256, producingIdentity:runtime.sdk.build });
          if(!accepted)break;
          acceptedCount++;
          const elapsed = performance.now() - started;
          updateExecutionPolicy(page.slow,id,{automatic,elapsedMs:elapsed});
          if(!automatic){page.redraw?.(); instrument?.refresh();}
          if (continueAfter) { const record = session.current.results.at(-1); continueWith(record, 'output', undefined, keepTool); break; }
        } catch (error) {
          if (controller.signal.aborted || page.revision !== revision) break;
          page.errors.push({ title: action.title, message: error.message, code: error.code, parameter: error.parameter });
          updateExecutionPolicy(page.slow,id,{automatic,error});
          page.redraw?.();
        }
      }
    } finally {
      if (page.revision === revision && page.controller===controller) {
        page.running = false;
        if(automatic&&!controller.signal.aborted)session.completePreview(token);
        const count = acceptedCount;
        const invalid=page.errors.every(error=>['invalid_input','invalid_parameter','missing_parameter'].includes(error.code));
        page.phase=controller.signal.aborted?'stopped':count?'current':page.errors.length?invalid?'invalid':'failure':'empty';
        page.status=controller.signal.aborted?'Stop requested; no further results will be accepted. Core completion is not confirmed.':count?(automatic?'Up to date.': 'Result retained.') : page.errors.length?invalid?'Check input or parameters.':'Execution failed. Review the details and retry.':'No result.';
        page.redraw?.(); instrument?.refresh();
      }
    }
  }

  function continueWith(result, output, conversion, keepTool = false) {
    try {
      page.controller?.abort();page.scheduler.cancel();
      session.continue(result.id, output, conversion);
      page.revision++; page.inputRevision=(page.inputRevision ?? 0)+1; page.readingFile = null; page.running = false; page.pendingNext = true; page.errors = []; page.showRound = null;
      page.sourceName = `Result from ${runtime.action(result.operation)?.title ?? 'previous step'}`;
      page.status = 'Result is now input. Restore previous input to undo this action.';
      page.phase='continued';
      page.inputTouched=true;
      if (!keepTool) navigate('playground');else render();
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
    const defaultName = descriptor ? primaryOutputName(descriptor, result) : undefined;
    const viewKey=result.kind==='preview'?`live-${result.operation}`:result.id;
    const selectedName = names.length === 1 ? names[0] : page.outputChoices[viewKey] ?? result.selectedOutput ?? defaultName;
    const pinned = session.pins.some(row => row.id === result.id);
    const view = selectedName ? resultViewer(result.outputs[selectedName], result.views[selectedName], {
      title: action?.title ?? 'Result', id: `result-${viewKey}`, pinned,
      choice: page.viewChoices[`${viewKey}:${selectedName}`]??result.representation, onChoice: choice => { page.viewChoices[`${viewKey}:${selectedName}`] = choice; },
      onPin: () => { try { const representation=page.viewChoices[`${viewKey}:${selectedName}`]??Object.keys(result.views[selectedName])[0];page.outputChoices[result.id]=selectedName;page.viewChoices[`${result.id}:${selectedName}`]=representation;session.pin(result.id,{outputName:selectedName,representation}); page.redraw?.(); document.getElementById(`result-${result.id}-pin`)?.focus({preventScroll:true}); } catch (error) { notify(error.message); } },
      onContinue: () => chooseContinue(result, selectedName),
    }) : h('p', { class: 'muted' }, 'Choose which named output to view, copy or continue.');
    const safeParameters = Object.fromEntries(Object.entries(result.parameters ?? {}).map(([name, value]) => [name, action?.contract.policy.sensitive_parameters.includes(name) ? '[provided; hidden]' : value]));
    return h('article', { class: 'panel result-card', 'data-result-operation': result.operation, 'data-result-current':String(!result.earlierInput), 'data-result-kind':result.kind }, h('div', { class: 'row between' }, h('h3', {}, action?.title ?? 'Result'), h('span', { class: 'tag' }, result.kind==='preview'?'Live preview':`Retained · round ${result.round}`)),
      result.earlierInput ? h('p', { class: 'warning small' }, 'From an earlier input or settings.') : null,
      names.length > 1 ? h('div', { class: 'field' }, h('label', { for: `output-${viewKey}` }, 'Choose an output'), h('select', { id: `output-${viewKey}`, onChange: event => { page.outputChoices[viewKey] = event.target.value; page.redraw?.(); } }, h('option', { value: '' }, 'Choose an output'), names.map(name => h('option', { value: name, selected: name === selectedName }, `${labelFor(name)} (${result.outputs[name].type})`)))) : null,
      action?.contract.inputs.length === 0 ? h('p', { class: 'small muted' }, 'Generated from options; no starting input was used.') : null,
      view, result.outputs[selectedName]?.data===''||result.outputs[selectedName]?.data?.byteLength===0?h('p',{class:'small muted'},'Empty output · valid result'):null, h('details', {id:`result-${viewKey}-settings`}, h('summary', {id:`result-${viewKey}-settings-toggle`}, 'Used settings'), h('pre', {}, JSON.stringify({ operation: result.operation, version: result.version, parameters: safeParameters, conversions: result.steps?.slice(0, -1) ?? result.conversions ?? [] }, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2)), h('details',{id:`result-${viewKey}-inputs`},h('summary',{id:`result-${viewKey}-inputs-toggle`},'Inputs from this result'),h('pre',{},JSON.stringify({type:result.snapshot?.input?.type,secondaryInputs:result.snapshot?.extraInputs??{}},null,2).slice(0,4096))),button('Download run details (includes input and settings)',async()=>{try{const wire=await runtime.call('recipeJson',[{operation:result.operation,version:result.version,primary_input_name:action?.contract.inputs[0]?.name??null,input:result.snapshot?.input??null,parameters:result.parameters??{},secondary_inputs:result.snapshot?.extraInputs??{},steps:result.steps??result.conversions??[],selected_output:selectedName??null,source_name:result.sourceName??null,producing_build:result.producingIdentity??result.producingBuild??null,sdk_request:result.sdkRequest??null}]);download(wire,'cube-run-details.json','application/json');}catch(error){notify(error.message);}},{id:`result-${viewKey}-download-run`})));
  }

  function renderResults() {
    const focused=results.contains(document.activeElement)?document.activeElement.id:null;
    const openDetails=[...results.querySelectorAll('details[id][open]')].map(node=>node.id);
    results.dataset.state=page.phase??'empty';
    const current = session.current;
    const retained = !current?.results.length && page.tool ? session.rounds.findLast(round => round.results.some(result => result.operation === page.tool)) : null;
    const round = page.showRound ? session.rounds.find(round => round.id === page.showRound) : retained ?? current;
    const records = page.filter === 'pinned' ? session.pins : page.pendingNext ? [] : (round?.results ?? []).filter(result=>!page.tool||result.operation===page.tool);
    const history = session.rounds;
    replace(results, h('div', { class: 'result-header' }, h('div', { class: 'row between' }, h('h2', {}, selected?'Result':'Results'), h('div', { class: 'segmented' },
      button('All', () => { page.filter = 'all'; renderResults(); }, { id: 'result-filter-all', 'aria-pressed': String(page.filter !== 'pinned') }),
      button('Pinned', () => { page.filter = 'pinned'; renderResults(); }, { id: 'result-filter-pinned', 'aria-pressed': String(page.filter === 'pinned') }))),
      selected ? null : h('p', { class: 'small muted' }, 'Each alternative starts from the same input snapshot.')),
      retained && !page.showRound ? h('p',{class:'small muted'},`Showing retained evidence from round ${retained.id}; the latest attempt has no accepted result.`) : null,
      records.length ? h('div', { class: 'result-grid' }, records.map(card)) : h('div', { class: 'empty-state' }, page.running||page.phase==='updating'?'Updating…':page.errors.length?'Review the input or parameters below.':page.inputTouched?'No current result.':'Add input to see results.'),
      page.errors.length ? h('div', { class: 'execution-errors spacer', role:'alert' }, h('ul', { class: 'compact-list' }, page.errors.map(error => h('li', {}, h('strong', {}, error.title), h('p', { class: 'warning small' }, error.message))))) : null,
      records.some(result=>result.kind==='preview') ? button('Keep result',()=>{try{for(const row of session.preview.results){const key=`live-${row.operation}`;if(page.outputChoices[key])page.outputChoices[row.id]=page.outputChoices[key];for(const name of Object.keys(row.outputs)){const choice=page.viewChoices[`${key}:${name}`];if(choice)page.viewChoices[`${row.id}:${name}`]=choice;}}session.retainPreview();page.redraw?.();instrument?.refresh();results.focus({preventScroll:true});}catch(error){notify(error.message);}}) : null,
      history.length ? h('details', { class: 'panel spacer' }, h('summary', {}, `Previous rounds and original input (${history.length})`),
        history.map(item => h('div', {}, button(`Round ${item.id} · ${item.input.type} · ${item.results.length} results`, () => { page.showRound = item.id; page.pendingNext = false; page.filter = 'all'; renderResults(); }, { class: 'round-button' }), h('details', {}, h('summary', {}, `Retained input · round ${item.id}`), h('p', {class:'small muted'},`${item.input.type} · ${bytesOf(item.input).toLocaleString()} bytes. Original bytes and text are retained independently of later edits.`), button(`Download input from round ${item.id}`,()=>download(item.input.data instanceof Uint8Array ? item.input.data : item.input.type==='text'?item.input.data:JSON.stringify(item.input.data,null,2),`cube-round-${item.id}-input.${item.input.type==='bytes'?'bin':'txt'}`)), button(`Download original for round ${item.id}`,()=>download(item.root.data instanceof Uint8Array ? item.root.data : item.root.type==='text'?item.root.data:JSON.stringify(item.root.data,null,2),`cube-round-${item.id}-original.${item.root.type==='bytes'?'bin':'txt'}`))))),
        h('p', { class: 'small muted' }, `Original input: ${session.originalInput.type}, ${bytesOf(session.originalInput).toLocaleString()} bytes.`),
        button('Download original input', () => { const value = session.originalInput; download(value.data instanceof Uint8Array ? value.data : value.type === 'text' ? value.data : JSON.stringify(value.data, null, 2), value.type === 'bytes' ? 'cube-original.bin' : 'cube-original.txt'); })) : null);
    for(const id of openDetails){const node=results.querySelector(`#${CSS.escape(id)}`);if(node)node.open=true;}
    if(focused)results.querySelector(`#${CSS.escape(focused)}`)?.focus({preventScroll:true});
  }

  const value = session.input;
  let inputControl;
  if (!hasInput) inputControl = null;
  else if (value.type === 'text') inputControl = h('textarea', { id: 'playground-input', class: 'input-text', value: value.data, spellcheck: false, 'aria-label': inputLabel, onInput: event => { try { changed({ input: { type: 'text', data: event.target.value }, preservePresentation: descriptor?.kind === 'keyboard' || descriptor?.kind === 'graph' }); instrument?.refresh(); } catch (error) { event.target.value=session.input.type==='text'?session.input.data:'';rejectedInput(error); } } });
  else inputControl = h('div', { class: 'byte-input' }, h('strong', {}, page.sourceName ?? `${labelFor(value.type)} input`), h('p', { class: 'muted' }, `${bytesOf(value).toLocaleString()} bytes · ${value.type}`),
    value.type === 'bytes' ? button('Use as UTF-8 text', () => run({ ids: ['text.utf8.decode'], continueAfter: true })) : h('pre', {}, JSON.stringify(value.data, null, 2).slice(0, 2048)));
  const fileInput = h('input', { type: 'file', id: 'playground-file', hidden: true, onChange: event => setFile(event.target.files[0]) });
  const inputMain = !hasInput ? h('div', { class: 'input-main' }, h('p', { class: 'muted' }, 'This tool uses the options below. No starting input is required.')) : h('div', { class: 'input-main' }, h('label', { for: 'playground-input' }, inputLabel), inputControl,
    h('div', { class: 'toolbar spacer' }, button('Paste',pasteInput,{id:'input-paste'}),
      button('Open file', () => fileInput.click(),{id:'input-open-file'}), button('Clear', () => { changed({ input: { type: 'text', data: '' } }); page.sourceName = null; render(); document.querySelector('#playground-input')?.focus(); },{id:'input-clear'}), fileInput),
    h('p', { class: 'small muted' }, '128 KiB input limit. Files retain exact bytes.'));
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
    append(inputOptions, descriptor ? null : parameterRegion);
  }
  async function loadExample() {
    if(!isCurrentView()||routeError)return;
    const revision = page.revision;
    const id = selected.id;
    const profile = presentationFor(selected, page.parameters[id])?.profile;
    // Share primary-input read ownership so Stop and newer file selections
    // revoke a pending example without claiming that Core computation finished.
    const request = page.readingFile = { kind: 'example', revision, session };
    page.secondaryReading = null;
    page.status = 'Loading the Core example…'; page.redraw?.();
    const current = () => page.readingFile === request && page.revision === revision && page.tool === id;
    try {
      const details = await runtime.toolDetails(selected);
      const values = profile ? (await runtime.instrumentData()).profileExamples?.[id]?.[profile] : details.example;
      if (!current()) return;
      if (!values || profile && values.operation_version !== selected.contract.operation_version) throw new Error('The Core example for this profile is unavailable. Your input and settings are retained.');
      const names = selected.contract.inputs.map(port => port.name);
      const primary = names[0];
      const representation = selected.direct.inputs[primary];
      let input = {type:'text',data:values.inputs[primary] ?? ''};
      if (['bytes','byte_array'].includes(representation)) {
        const raw = JSON.parse(values.inputs[primary]);
        input = {type:'bytes',data:representation === 'byte_array' ? Uint8Array.from(raw) : (await runtime.call('execute',[{operation:'encoding.base64.decode',version:1,inputs:{input:raw.base64}}])).output};
      }
      if (!current()) return;
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
      if (!current()) return;
      page.parameters[id] = raw;
      page.extraInputs[id] = extra;
      changed({input}); page.sourceName = 'Core conformance example'; page.phase='example'; page.status = 'Core example loaded.'; render();
    } catch(error) { if (current()) { page.status=error.message; page.redraw?.(); } }
    finally { if (page.readingFile === request) { page.readingFile = null; page.redraw?.(); } }
  }
  function selectAction(id) {
    const next = runtime.action(id);
    if (!next?.available) return;
    const parameters=page.parameters[id]??={};
    for(const [name,value] of Object.entries(page.parameters[selected.id]??{}))if(!Object.hasOwn(parameters,name)&&Object.hasOwn(next.contract.parameters.properties??{},name))
      Object.defineProperty(parameters,name,{value:snapshot(value),enumerable:true,configurable:true,writable:true});
    const extra=page.extraInputs[id]??={};
    for(const [name,value] of Object.entries(page.extraInputs[selected.id]??{}))if(!Object.hasOwn(extra,name)&&next.contract.inputs.slice(1).some(port=>port.name===name))
      Object.defineProperty(extra,name,{value:snapshot(value),enumerable:true,configurable:true,writable:true});
    context.useTool(next,{focusId:descriptor?'instrument-action':'tool-action'});
  }
  if (descriptor) {
    page.extraInputs[selected.id] ??= {};
    instrument = instrumentShell({page,action:selected,descriptor,runtime,changed,
      setInput(value, options = {}) { try{const previous=session.input.type; changed({input:value,...options}); if (previous !== value.type) render();}catch(error){rejectedInput(error);} },
      parameters:()=>page.parameters[selected.id], extra:()=>page.extraInputs[selected.id],
      redrawForm:()=>page.redrawParameters?.(),selectAction,loadExample,convertInput:id=>run({ids:[id],continueAfter:true,keepTool:true}),continueOutput:chooseContinue});
    instrument.surface.inert=Boolean(routeError);if(routeError)instrument.surface.setAttribute('aria-disabled','true');
    page.dispose = instrument.dispose;
  }
  const autoControl=h('label',{class:'check auto-control'},h('input',{type:'checkbox',checked:page.auto,onChange:event=>{page.auto=event.target.checked;schedulePreview();}}),'Automatic updates');
  append(inputOptions, hasInput && value.type==='text' && (selected ? selected.pipeline?.input_type==='bytes'||['bytes','byte_array'].includes(selected.direct?.inputs[selected.contract.inputs[0].name]) : page.mode==='Encode') ? h('label', { class: 'check spacer' }, h('input', { type: 'checkbox', checked: page.utf8, onChange: event => { page.utf8 = event.target.checked; changed(); } }), 'Use UTF-8 for text sent to byte tools') : null,
    autoControl,
    policyStatus,h('div',{class:'toolbar'},runButton,stopButton),status,
    session.canRestoreInput?button('Restore previous input',()=>{page.scheduler.cancel();page.controller?.abort();session.restoreInput();page.revision++;page.inputRevision++;page.inputTouched=true;page.sourceName=null;render();}):null);
  const actions=descriptor?descriptor.operations.map(id=>runtime.action(id)).filter(Boolean):family?.actions??[];
  const actionControl=selected&&actions.length>1?h('div',{class:'field instrument-action'},h('label',{for:descriptor?'instrument-action':'tool-action'},'Action'),
    h('select',{id:descriptor?'instrument-action':'tool-action',onChange:event=>selectAction(event.target.value)},actions.map(action=>h('option',{value:action.id,selected:action.id===selected.id},!descriptor&&actions.length===2&&/\.(encode|decode)$/.test(action.id)?action.id.endsWith('.encode')?'Encode':'Decode':action.title)))):null;
  const editorTabs = descriptor ? h('div', {class:'instrument-tabs segmented',role:'group','aria-label':'Editor view'}, ['Visual','Parameters'].map(tab=>button(tab,()=>{ page.editorTabs[selected.id]=tab; updateTab(); },{id:`instrument-tab-${tab.toLowerCase()}`,'aria-pressed':String(editorTab()===tab)}))) : null;
  const inputPanel = h('section', { class: 'panel input-panel', id: 'input-section', tabindex: -1, 'aria-label': 'Input and options' },
    !selected?h('div',{class:'segmented mode-control'},['Decode','Encode'].map(mode=>button(mode,()=>{page.mode=mode;changed();render();},{'aria-pressed':String(page.mode===mode)}))):null, inputMain, inputOptions);
  if (hasInput) {
    const actions = inputMain.querySelector('.toolbar');
    const limit = inputMain.querySelector(':scope > p');
    inputMain.append(h('details', {class:`study-input-actions${enigmaStudy ? ' enigma-input-actions' : ''}`,open:Boolean(page.inputActions[inputActionKey]),onToggle:event=>{if(event.currentTarget.isConnected)page.inputActions[inputActionKey]=event.currentTarget.open;}}, h('summary', {onClick:event=>{page.inputActions[inputActionKey]=!event.currentTarget.parentElement.open;}}, 'Input actions'), actions, limit));
    if (inputControl?.tagName === 'TEXTAREA'&&instrumentStudy) inputControl.rows = 2;
  }
  const toolActions=selected?h('div',{class:'workspace-tool-actions toolbar'},button(state.favorites.includes(family.key)?'Unfavorite':'Favorite',event=>{const i=state.favorites.indexOf(family.key);if(i>=0)state.favorites.splice(i,1);else state.favorites.push(family.key);context.saveFavorites();event.currentTarget.textContent=i>=0?'Favorite':'Unfavorite';event.currentTarget.setAttribute('aria-pressed',String(i<0));},{'aria-pressed':String(state.favorites.includes(family.key))}),originalAction.pipeline?button('Add to pipeline',()=>context.addStep(originalAction),{disabled:Boolean(routeError)||!pipelineCompatibility(state.pipeline.draft,originalAction,runtime).compatible}):null,originalAction.pipeline&&!pipelineCompatibility(state.pipeline.draft,originalAction,runtime).compatible?h('span',{class:'small muted'},pipelineCompatibility(state.pipeline.draft,originalAction,runtime).reason):null):null;
  replace(container, h('div', { class: descriptor ? `heading instrument-heading${instrumentStudy ? ' instrument-study-heading' : ''}${enigmaStudy ? ' enigma-heading' : ''}` : 'heading' }, h('h1', { id: 'playground-heading' }, selected ? family?.title??selected.title : 'Multidecoder'), selected?toolHelp(selected,{runtime,loadExample:routeError?null:loadExample}):h('p',{class:'small muted'},'One input. Independent alternatives.'),toolActions,
    session.path.length ? h('div', { class: 'row spacer' }, h('span', { class: 'tag' }, `${session.path.length} chosen steps`), button('Save chosen sequence', () => fromSequence(session.path, session.originalInput, session.input.type))) : null),
    routeError?h('div',{class:'warning',role:'alert'},h('p',{},routeError),selected?button('Open current version',()=>context.useTool(originalAction)):button('Open Multidecoder',()=>navigate('playground'))):null,
    h('div', { class: descriptor ? 'section-jumps toolbar instrument-jumps' : 'section-jumps toolbar' }, h('a', { class: 'button', href: '#input-section',onClick:event=>{event.preventDefault();document.querySelector('#input-section').scrollIntoView({block:'start'});document.querySelector('#input-section').focus({preventScroll:true});} }, 'Input'), h('a', { class: 'button', href: '#results-section',onClick:event=>{event.preventDefault();document.querySelector('#results-section').scrollIntoView({block:'start'});document.querySelector('#results-section').focus({preventScroll:true});} }, 'Results')),
    h('div', { class: descriptor ? `play-grid visual-workspace${instrumentStudy ? ' instrument-study-workspace' : ''}${enigmaStudy ? ' enigma-workspace' : ''}` : 'play-grid text-workspace' },
      actionControl||editorTabs?h('div',{class:'instrument-command-bar'},actionControl,editorTabs):null,
      inputPanel,
      ...(descriptor ? [instrument.surface, h('section',{class:'panel instrument-options',id:'instrument-parameter-panel','aria-label':'Operation parameters'},parameterRegion)] : []), results),
    h('details',{class:'workspace-navigation'},h('summary',{},'Session history'),h('p',{class:'small muted'},'Live previews replace each other. Pin or keep a result to retain its exact input and settings.'),button('Clear session history', () => context.clearSession())));
  function updateTab() {
    if (!instrument) return;
    const visual = editorTab() === 'Visual';
    const wasHidden=instrument.surface.hidden;
    if (!visual) instrument.rememberScroll();
    instrument.surface.hidden = !visual;
    const options = container.querySelector('#instrument-parameter-panel'); if (options) options.hidden = visual;
    for (const tab of ['Visual','Parameters']) container.querySelector(`#instrument-tab-${tab.toLowerCase()}`)?.setAttribute('aria-pressed',String(editorTab() === tab));
    if (visual) instrument.refresh({captureScroll:!wasHidden});
  }
  updateTab();
  page.dispose = instrument?.dispose;
  page.redraw = () => { const eligibility=policy();runButton.hidden=page.auto&&eligibility.eligible&&!routeError;stopButton.hidden=!page.running&&!page.auxiliaryRunning&&!page.readingFile&&!page.secondaryReading&&page.phase!=='updating';runButton.disabled=page.running||Boolean(page.readingFile)||Boolean(page.secondaryReading)||Boolean(routeError)||Boolean(selected&&!selected.available);status.textContent=routeError?'Choose the current operation version.':page.status;policyStatus.textContent=eligibility.eligible?'':eligibility.reason;renderResults(); };
  page.schedulePreview=schedulePreview;
  page.redraw();
  const previous=page.tool?session.latest(page.tool):session.current?.results[0];
  if(!previous||previous.earlierInput)schedulePreview();
}

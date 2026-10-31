import { PipelineDraft } from './pipeline.mjs';
import { fieldsFor, parametersFor } from './controls.mjs';
import { checkEnvelope } from './library.mjs';

const byteLength = value => new TextEncoder().encode(value).byteLength;
const only = (value, names) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(name => names.includes(name));
const exactInteger = value => typeof value === 'number' && Number.isSafeInteger(value);
async function parseForForm(runtime, raw, mayPreserve) {
  try { return (await runtime.call('execute', [{ operation: 'json.parse', version: 1, inputs: { input: raw } }])).output; }
  catch (error) {
    // A valid Core Recipe can contain i64/u64 values beyond the general JSON
    // tool's exact-number ceiling. Keep its original wire instead of rounding.
    if (mayPreserve && error.code === 'resource_limit' && error.reason === 'input_limit') return null;
    throw error;
  }
}

function editableParameter(field, value) {
  if (byteLength(JSON.stringify(value)) > 16384) return false;
  switch (field.constraints.type) {
    case 'integer': case 'unsigned': case 'unsigned_choices': return exactInteger(value);
    case 'boolean': return typeof value === 'boolean';
    case 'text': return typeof value === 'string';
    case 'bytes': return only(value, ['base64']) && typeof value.base64 === 'string';
    case 'unsigned_list': return only(value, ['unsigned_list']) && Array.isArray(value.unsigned_list) && value.unsigned_list.every(exactInteger);
    case 'text_list': return only(value, ['text_list']) && Array.isArray(value.text_list) && value.text_list.every(item => typeof item === 'string');
    default: return false;
  }
}

function editableSteps(runtime, definition) {
  if (!Array.isArray(definition.steps) || definition.steps.length > 64) return false;
  return definition.steps.every(step => {
    if (!only(step, ['operation', 'version', 'parameters'])) return false;
    const action = runtime.action(step.operation);
    if (!action?.pipeline || step.version !== action.pipeline.version) return false;
    const fields = fieldsFor(action);
    return step.parameters === undefined || (only(step.parameters, fields.map(field => field.name)) &&
      Object.entries(step.parameters).every(([name, value]) => editableParameter(fields.find(field => field.name === name), value)));
  });
}

function editableShape(runtime, definition) {
  if (!only(definition, ['format_version', 'engine_api', 'input', 'output', 'steps']) ||
      definition.format_version !== 1 || definition.engine_api !== 1 || !only(definition.output, ['type']) || !editableSteps(runtime, definition)) return false;
  const input = definition.input;
  const slot = only(input, ['source', 'name', 'type']) && input.source === 'slot' &&
    typeof input.name === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(input.name) && ['text', 'bytes'].includes(input.type);
  const inline = only(input, ['source', 'value']) && input.source === 'inline' && ['text', 'bytes'].includes(input.value?.type);
  if (!slot && !inline) return false;
  const inputType = slot ? input.type : input.value.type;
  const last = runtime.action(definition.steps.at(-1)?.operation)?.pipeline;
  return definition.output.type === (last?.output_type ?? inputType);
}

async function editableValue(runtime, value) {
  if (only(value, ['type', 'data']) && value.type === 'text' && typeof value.data === 'string' && byteLength(value.data) <= 128 * 1024) return { type: 'text', data: value.data };
  if (!only(value, ['type', 'base64']) || value.type !== 'bytes' || typeof value.base64 !== 'string' || value.base64.length > 4 * Math.ceil(128 * 1024 / 3)) return null;
  const output = (await runtime.call('execute', [{ operation: 'encoding.base64.decode', version: 1, inputs: { input: value.base64 } }])).output;
  return output.byteLength <= 128 * 1024 ? { type: 'bytes', data: output } : null;
}

async function formInput(runtime, definition, bindings) {
  if (definition.input.source === 'inline') {
    if (bindings !== undefined && !only(bindings, [])) return null;
    return editableValue(runtime, definition.input.value);
  }
  const { name, type } = definition.input;
  if (bindings === undefined) return { type, data: type === 'text' ? '' : new Uint8Array() };
  if (!only(bindings, [name]) || !Object.hasOwn(bindings, name) || bindings[name]?.type !== type) return null;
  return editableValue(runtime, bindings[name]);
}

async function validateImportedRecipe(runtime, raw) {
  try { return await runtime.call('validateRecipe', [raw]); }
  catch (error) {
    if (['invalid_input', 'invalid_parameter', 'unsupported_operation', 'incompatible_version'].includes(error.code)) {
      error.message += '. Import an ordered Core Recipe; Play graphs are not supported.';
    }
    throw error;
  }
}

/** Core validates complete recipes; this adapter only decides faithful form representation. */
export async function loadPipeline(runtime, document) {
  checkEnvelope(document);
  const incomplete = Boolean(document.needs_parameters?.length);
  const info = incomplete ? null : await validateImportedRecipe(runtime, document.definition_json);
  const definition = await parseForForm(runtime, document.definition_json, !incomplete);
  const bindings = document.input_data_json === undefined ? undefined : await parseForForm(runtime, document.input_data_json, !incomplete);
  const draft = new PipelineDraft(); draft.name = document.name;
  if (editableShape(runtime, definition)) {
    const input = await formInput(runtime, definition, bindings);
    if (input) {
      draft.setInput(input);
      if (definition.input.source === 'slot') draft.setSlot(definition.input.name);
      for (const step of definition.steps) draft.add({ operation: step.operation, version: step.version, original: step.parameters });
      return { draft, inputOmitted: definition.input.source === 'slot' && bindings === undefined, missing: document.needs_parameters ?? [] };
    }
  }
  if (incomplete) throw new Error('This incomplete definition cannot be represented faithfully in the form editor. Restore its omitted options in the exact Core document before importing it. Play graphs are not supported.');
  draft.setAdvanced(document.definition_json, info);
  if (document.input_data_json !== undefined) draft.setBindings(document.input_data_json);
  return { draft, preserved: true, missing: [] };
}

export async function recipeForDraft(runtime, run, options = {}, { includeInput = true, includeKeys = true, allowMissing = false } = {}) {
  if (run.rawDefinition !== undefined) return { definition: run.rawDefinition, missing: [] };
  const steps = []; const missing = [];
  for (const step of run.steps) {
    const action = runtime.action(step.operation);
    if (!action?.pipeline || action.pipeline.version !== step.version) throw new Error('A step is unavailable in this installed pipeline runtime.');
    const parameters = await parametersFor(runtime, action, step.raw, { ...options, allowMissing }, step.original);
    if (!includeKeys) for (const name of action.contract.policy.sensitive_parameters) {
      if (Object.hasOwn(parameters, name)) { delete parameters[name]; missing.push(`${steps.length + 1}: ${action.title} / ${name}`); }
    }
    steps.push({ operation: step.operation, version: step.version, parameters });
  }
  const last = runtime.action(steps.at(-1)?.operation)?.pipeline;
  return { definition: { format_version: 1, engine_api: 1,
    input: includeInput ? { source: 'inline', value: run.input } : { source: 'slot', name: run.inputSlot, type: run.input.type },
    output: { type: last?.output_type ?? run.input.type }, steps }, missing };
}

export async function exportPipeline(runtime, draft, { includeInput = false, includeKeys = false } = {}) {
  const run = draft.describe();
  if (run.rawDefinition !== undefined) {
    if (!includeInput || !includeKeys) throw new Error('An exact imported definition can include inline data and keys. Select both inclusion options to export it unchanged.');
    await runtime.call('validateRecipe', [run.rawDefinition]);
    return { format: 'cubearc.playground.pipeline', version: 1, name: run.name, definition_json: run.rawDefinition, input_data_json: run.bindingsJson };
  }
  const { definition, missing } = await recipeForDraft(runtime, run, {}, { includeInput: false, includeKeys, allowMissing: true });
  const document = { format: 'cubearc.playground.pipeline', version: 1, name: run.name,
    definition_json: await runtime.call('recipeJson', [definition]), needs_parameters: missing };
  if (!missing.length) await runtime.call('validateRecipe', [document.definition_json]);
  if (includeInput) document.input_data_json = await runtime.call('recipeJson', [{ [run.inputSlot]: run.input }]);
  if (draft.revision !== run.revision) throw new Error('Settings changed during export. Try again with the current settings.');
  return document;
}

/** Accept our export envelope or a complete bare Core Recipe; neither runs on import. */
export async function importPipeline(runtime, raw, name) {
  const parsed = await parseForForm(runtime, raw, true);
  return loadPipeline(runtime, parsed?.format === 'cubearc.playground.pipeline' ? parsed : {
    format: 'cubearc.playground.pipeline', version: 1, name: name.slice(0, 120), definition_json: raw,
  });
}

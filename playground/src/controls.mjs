import { h, button, copyText, download } from './dom.mjs';
import { snapshot } from './data.mjs';

export const labelFor = name => name.replaceAll('_', ' ').replace(/^./, value => value.toUpperCase());

export function fieldsFor(action) {
  if (action.pipeline) return action.pipeline.parameters;
  return Object.entries(action.contract.parameters.properties ?? {}).map(([name, schema]) => ({
    name, description: schema.description ?? '', required: action.contract.parameters.required?.includes(name) ?? false,
    default: action.direct?.parameters?.[name] ?? schema.default ?? null,
    constraints: { type: schema.type === 'boolean' ? 'boolean' : schema.enum?.every(Number.isInteger) ? 'unsigned_choices' : schema.enum ? 'text' : schema.type === 'integer' ? 'integer' : schema.type === 'string' ? 'text' : 'json', choices: schema.enum ?? [] },
  }));
}

function displayValue(value, kind) {
  if (value === undefined || value === null) return kind === 'boolean' ? false : '';
  if (kind === 'json' || (kind === 'text_list' && Array.isArray(value))) return JSON.stringify(value, null, 2);
  if (Array.isArray(value)) return value.join(', ');
  return value;
}

export function parametersForm(action, raw, onChange, prefix = 'options', original = {}) {
  const fields = fieldsFor(action);
  if (!fields.length) return null;
  return h('div', { class: 'params' }, fields.map(field => {
    const id = `${prefix}-${field.name}`;
    const kind = field.constraints.type;
    const old = original[field.name];
    const originalDisplay = kind === 'bytes' ? old?.base64 : kind === 'unsigned_list' ? old?.unsigned_list : kind === 'text_list' ? old?.text_list : old;
    const current = displayValue(Object.hasOwn(raw, field.name) ? raw[field.name] : originalDisplay ?? field.default, kind);
    const changed = value => onChange(field.name, value);
    let control;
    if (kind === 'boolean') control = h('input', { id, type: 'checkbox', checked: Boolean(current), onChange: event => changed(event.target.checked) });
    else if ((field.constraints.choices ?? []).length) control = h('select', { id, value: String(current), onChange: event => changed(event.target.value) },
      h('option', { value: '' }, field.required ? 'Choose an option' : 'Use the tool default'),
      field.constraints.choices.map(choice => h('option', { value: String(choice), selected: String(current) === String(choice) }, String(choice))));
    else control = h(['unsigned_list', 'text_list', 'text', 'bytes', 'json'].includes(kind) ? 'textarea' : 'input', {
      id, value: String(current), rows: 2, maxlength: 16384,
      type: kind === 'bytes' ? 'password' : 'text',
      autocomplete: field.name === 'key' || kind === 'bytes' ? 'off' : undefined,
      inputmode: ['integer', 'unsigned', 'unsigned_choices'].includes(kind) ? 'numeric' : undefined,
      onInput: event => changed(event.target.value),
    });
    return h('div', { class: 'field' }, h('label', { for: id }, labelFor(field.name), field.required ? ' *' : '', kind === 'bytes' ? ' (Base64 bytes)' : ''), control,
      ['unsigned_list', 'text_list'].includes(kind) ? h('p', { class: 'small muted' }, kind === 'unsigned_list' ? 'Separate positions with commas.' : 'Use a JSON list of text entries, preserving spaces and escaped line endings.') : null,
      field.description ? h('details', {}, h('summary', {}, 'Help'), h('p', { class: 'small muted' }, field.description)) : null);
  }));
}

function integer(value) {
  const text = String(value).trim();
  if (!/^-?(0|[1-9][0-9]*)$/.test(text)) throw new Error('Enter a whole number.');
  const result = Number(text);
  if (!Number.isSafeInteger(result)) throw new Error('That number exceeds this editor’s exact integer range.');
  return result;
}

export async function parametersFor(runtime, action, raw, options = {}, original = {}) {
  const result = {};
  for (const field of fieldsFor(action)) {
    if (!Object.hasOwn(raw, field.name) && Object.hasOwn(original, field.name)) { result[field.name] = snapshot(original[field.name]); continue; }
    const value = Object.hasOwn(raw, field.name) ? raw[field.name] : field.default;
    const kind = field.constraints.type;
    if (value === null || value === undefined || (value === '' && !['unsigned_list', 'text_list', 'boolean'].includes(kind))) {
      if (field.required && !options.allowMissing) { const error = new Error(`Add ${labelFor(field.name).toLowerCase()} to use this tool.`); error.code = 'missing_parameter'; error.parameter = field.name; throw error; }
      continue;
    }
    if (['integer', 'unsigned', 'unsigned_choices'].includes(kind)) result[field.name] = integer(value);
    else if (kind === 'boolean') result[field.name] = Boolean(value);
    else if (kind === 'unsigned_list') result[field.name] = { unsigned_list: Array.isArray(value) ? value : String(value).trim() ? String(value).split(',').map(integer) : [] };
    else if (kind === 'text_list') {
      const list = Array.isArray(value) ? value : String(value).trim() ? (await runtime.call('execute', [{ operation: 'json.parse', version: 1, inputs: { input: String(value) } }], options)).output : [];
      if (!Array.isArray(list) || list.some(item => typeof item !== 'string')) throw new Error('Use a JSON list containing only text entries.');
      result[field.name] = { text_list: list };
    }
    else if (kind === 'bytes') result[field.name] = (await runtime.call('execute', [{ operation: 'encoding.base64.decode', version: 1, inputs: { input: String(value) } }], options)).output;
    else if (kind === 'json') result[field.name] = (await runtime.call('execute', [{ operation: 'json.parse', version: 1, inputs: { input: typeof value === 'string' ? value : JSON.stringify(value) } }], options)).output;
    else result[field.name] = String(value);
  }
  return result;
}

export function resultViewer(value, representations, { title = 'Result', id = 'viewer', onContinue, onPin, pinned = false, choice, onChoice } = {}) {
  const names = Object.keys(representations);
  let selected = names.includes(choice) ? choice : names[0];
  const text = h('pre', { role: 'region', tabindex: 0, 'aria-label': `${title} contents` }, representations[selected].slice(0, 4096));
  const truncation = h('p', { class: 'small muted' });
  const update = () => {
    text.textContent = representations[selected].slice(0, 4096);
    truncation.textContent = representations[selected].length > 4096 ? 'Showing the first 4,096 characters. Copy and download use the complete selected representation.' : '';
  };
  update();
  return h('div', {}, names.length > 1 ? h('div', { class: 'field' }, h('label', { for: `${id}-representation` }, 'View and copy as'), h('select', { id: `${id}-representation`, onChange: event => { selected = event.target.value; onChoice?.(selected); update(); } }, names.map(name => h('option', { value: name, selected: name === selected }, name)))) : h('span', { class: 'tag' }, selected),
    h('div', { class: 'viewer' }, text), truncation,
    h('div', { class: 'toolbar' },
      button('Copy', () => copyText(representations[selected]), { 'aria-label': `Copy ${title}` }),
      onPin ? button(pinned ? 'Unpin' : 'Pin', onPin, { id: `${id}-pin`, 'aria-pressed': String(pinned), 'aria-label': `${pinned ? 'Unpin' : 'Pin'} ${title}` }) : null,
      onContinue ? button('Continue', onContinue, { id: `${id}-continue`, 'aria-label': `Continue with ${title}` }) : null),
    h('details', {}, h('summary', {}, 'Export'), h('div', { class: 'toolbar' },
      button('Download selected view', () => download(representations[selected], `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.txt`, 'text/plain;charset=utf-8')),
      value.type === 'bytes' ? button('Download exact bytes', () => download(value.data, 'cube-result.bin')) : null)));
}

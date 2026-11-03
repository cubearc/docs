import { h, button, replace, copyText } from '../dom.mjs';

// Exact display alphabets from Cube ciphers/mechanical/alberti.rs at the locked revision.
// These arrange the instrument; all enciphering and advancement remain in Core.
export const ALBERTI_RINGS = Object.freeze({ outer: 'ABCDEFGILMNOPQRSTVXZ1234', inner: 'c&bmdgpfznxyutoskerlhaiq' });
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ROTORS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const ENIGMA_ROWS = ['QWERTZUIO', 'ASDFGHJK', 'PYXCVBNML'];
const CARD_DRAG = 'application/x-cubearc-solitaire-card';
const parse = (value, fallback) => { if (typeof value !== 'string') return value ?? fallback; try { return JSON.parse(value); } catch { return fallback; } };
const list = value => { const parsed = parse(value, []); return Array.isArray(parsed) ? parsed : []; };
const setting = api => {
  const value = parse(api.extra('settings'), null);
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  const draft = activeSettingsDraft(api);
  return draft ? {...parse(draft.base, {}), [draft.name]: null} : {};
};
const output = api => api.result() ?? {};
const int = value => /^(0|[1-9]\d*)$/.test(String(value)) ? Number(value) : NaN;
const change = (api, run) => { run(); api.refresh(); };
const note = text => h('p', { class: 'small muted' }, text);
const warning = problems => problems.length ? h('div', { class: 'warning', role: 'status' }, h('strong', {}, 'Review configuration'), h('ul', {}, problems.map(message => h('li', {}, message)))) : null;
const jsonParam = (api, name, value) => api.setParam(name, JSON.stringify(value));
function field(label, id, control) { return h('div', { class: 'field' }, h('label', { for: id }, label), control); }
function disclosure(api, key, title, ...contents) {
  api.ui.disclosures ??= {};
  return h('details', {open: Boolean(api.ui.disclosures[key]), onToggle: event => {
    if (event.currentTarget.isConnected) api.ui.disclosures[key] = event.currentTarget.open;
  }}, h('summary', {id: `mechanism-${key}`, onClick: event => {
    // Native toggle is queued. Retain this activation before a setting edit can
    // redraw the details element, including keyboard-generated clicks.
    if (event.currentTarget.isConnected && !event.defaultPrevented) api.ui.disclosures[key] = !event.currentTarget.parentElement.open;
  }}, title), ...contents);
}
function select(id, value, options, onChange, label) {
  const missing = value === undefined || value === null || value === '';
  const all = !missing && !options.includes(value) ? [value, ...options] : options;
  return h('select', { id, 'aria-label': label, onChange: event => onChange(event.target.value) }, h('option', { value: '', selected: missing }, 'Choose…'), all.map(row => h('option', { value: row, selected: row === value }, row)));
}
export function settingsForEdit(raw) {
  const source = typeof raw === 'string' ? raw : JSON.stringify(raw ?? {});
  for (const token of source.matchAll(/"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g)) {
    if (token[0].startsWith('"')) continue;
    if (!/^-?(0|[1-9]\d*)$/.test(token[0]) || !Number.isSafeInteger(Number(token[0]))) throw new Error('Use Parameters to edit these exact JSON numbers. Visual edits preserve the original document.');
  }
  return JSON.parse(source || '{}');
}

/** Slice top-level JSON values; parsing checks syntax but never supplies edited data. */
export function rawJsonMembers(raw, kind) {
  const source = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const parsed = JSON.parse(source);
  const object = kind === 'object';
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) === object) throw new Error(`Use a JSON ${object ? 'object' : 'array'}.`);
  const members = [];
  let depth = 0;
  let key = null;
  let start = null;
  const close = object ? '}' : ']';
  for (const token of source.matchAll(/"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\]:,]/g)) {
    const value = token[0];
    if (depth === 1) {
      if (value === ',' || value === close) {
        if (start !== null) members.push({key: object ? key : members.length, source: source.slice(start, token.index).trim()});
        key = null; start = null;
      } else if (object && key === null && value.startsWith('"')) key = JSON.parse(value);
      else if (object && value === ':') start = token.index + 1;
      else if (!object && start === null) start = token.index;
    }
    if (value === '{' || value === '[') depth++;
    if (value === '}' || value === ']') depth--;
  }
  return members;
}

export function replaceSettingsFieldJson(raw, name, value) {
  JSON.parse(value);
  return settingsDocumentWithField(raw, name, value);
}
function settingsDocumentWithField(raw, name, value) {
  const fields = rawJsonMembers(raw?.trim() ? raw : '{}', 'object');
  const next = fields.filter(field => field.key !== name);
  next.push({key: name, source: value});
  return `{${next.map(field => `${JSON.stringify(field.key)}:${field.source}`).join(',')}}`;
}

function activeSettingsDraft(api) {
  const drafts = api.ui.settingsDrafts ??= {};
  const raw = api.extra('settings');
  const existing = drafts[api.action.id];
  if (existing?.document === raw) return existing;
  if (existing) { delete drafts[api.action.id]; if (api.ui.importError === existing.error) api.ui.importError = ''; }
  const matching = Object.values(drafts).find(draft => draft.document === raw);
  if (matching) { drafts[api.action.id] = {...matching}; return drafts[api.action.id]; }
  return null;
}
function settingsField(api, name, fallback = '[]') {
  const draft = activeSettingsDraft(api);
  if (draft?.name === name) return draft.source;
  if (draft) return rawJsonMembers(draft.base?.trim() ? draft.base : '{}', 'object').findLast(field => field.key === name)?.source ?? fallback;
  try { return rawJsonMembers(api.extra('settings'), 'object').findLast(field => field.key === name)?.source ?? fallback; }
  catch { return fallback; }
}

function patchSettings(api, patch) {
  const draft = activeSettingsDraft(api);
  if (draft) { api.ui.settingsError = `Repair the ${draft.name.replaceAll('_', ' ')} JSON field before editing other settings.`; api.ui.settingsErrorField = 'settings'; api.ui.settingsErrorRaw = api.extra('settings'); return; }
  let next = api.extra('settings');
  try {
    for (const [name, value] of Object.entries(patch)) {
      const source = JSON.stringify(value);
      settingsForEdit(source);
      next = replaceSettingsFieldJson(next, name, source);
    }
  } catch (error) { api.ui.settingsError = error.message; api.ui.settingsErrorField = 'settings'; api.ui.settingsErrorRaw = api.extra('settings'); return; }
  api.ui.settingsError = '';
  api.setExtra('settings', next);
}
function patchSettingsArray(api, name, source) {
  const draft = activeSettingsDraft(api);
  if (draft && draft.name !== name) { api.ui.importError = `Repair the ${draft.name.replaceAll('_', ' ')} JSON field first.`; api.refresh(); return; }
  try {
    const base = draft?.base ?? api.extra('settings');
    const document = settingsDocumentWithField(base, name, source);
    let error = '';
    try { rawJsonMembers(source, 'array'); } catch { error = `Use a JSON array for ${name.replaceAll('_', ' ')}. The entered text is retained until you repair this field.`; }
    if (error) api.ui.settingsDrafts[api.action.id] = {name, source, base, document, error};
    else delete api.ui.settingsDrafts[api.action.id];
    api.ui.importError = error;
    api.setExtra('settings', document);
  } catch (error) { api.ui.importError = error.message; }
  api.refresh();
}
function settingsWarning(api) {
  const raw = api.ui.settingsErrorField === 'settings' ? api.extra('settings') : api.param(api.ui.settingsErrorField);
  if (raw !== api.ui.settingsErrorRaw) { api.ui.settingsError = ''; delete api.ui.settingsErrorRaw; delete api.ui.settingsErrorField; }
  return api.ui.settingsError ? h('p', {class:'warning',role:'status'},api.ui.settingsError) : null;
}
function setListItem(api, name, index, value, length = 3) {
  let values;
  const source = name === 'rings' ? String(value).trim() || 'null' : JSON.stringify(value);
  try {
    JSON.parse(source);
    values = rawJsonMembers(api.param(name) ?? [], 'array').map(row => row.source);
  } catch(error) { api.ui.settingsError = error.message; api.ui.settingsErrorField = name; api.ui.settingsErrorRaw = api.param(name); return; }
  api.ui.settingsError = '';
  const next = Array.from({ length }, (_, i) => values[i] ?? (name === 'rings' ? 'null' : '""'));
  next[index] = source;
  api.setParam(name, `[${next.join(',')}]`);
}

export function deckStatus(deck) {
  return Array.isArray(deck) && deck.length === 54 && new Set(deck).size === 54 && deck.every(card => Number.isInteger(card) && card >= 1 && card <= 54)
    ? [] : ['Use every card 1–54 exactly once. Joker A is 53; Joker B is 54.'];
}
export function moveCard(deck, from, to) {
  const result = [...deck];
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= deck.length || to < 0 || to >= deck.length) return result;
  result.splice(to, 0, ...result.splice(from, 1));
  return result;
}
export function enigmaProblems(p) {
  const problems = [];
  if (!['enigma_i', 'm3'].includes(p.profile)) problems.push('Choose Enigma I or M3.');
  if (!Array.isArray(p.rotors) || p.rotors.length !== 3 || new Set(p.rotors).size !== 3 || p.rotors.some(r => !ROTORS.includes(r))) problems.push('Choose three distinct rotors, ordered left to right.');
  if (p.profile === 'enigma_i' && p.rotors?.some(r => ROTORS.indexOf(r) > 4)) problems.push('Enigma I accepts rotors I–V only.');
  if (!Array.isArray(p.rings) || p.rings.length !== 3 || p.rings.some(r => !Number.isInteger(r) || r < 1 || r > 26)) problems.push('Set all three rings to integers 1–26.');
  if (!/^[A-Z]{3}$/.test(p.windows ?? '')) problems.push('Choose three initial window letters A–Z.');
  if (!['B', 'C'].includes(p.reflector)) problems.push('Choose wide reflector B or C.');
  const pairs = p.plugboard;
  if (!Array.isArray(pairs) || pairs.length > 10 || pairs.some(pair => !/^[A-Z]{2}$/.test(pair) || pair[0] === pair[1])) problems.push('Use up to ten pairs of two different uppercase letters.');
  else if (new Set(pairs.join('')).size !== pairs.length * 2) problems.push('A plugboard letter appears in more than one pair.');
  return problems;
}
export function stripProblems(p, textLength) {
  const problems = [];
  if (p.profile !== 'm138a_configured_v1') problems.push('Select profile m138a_configured_v1.');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(p.strip_series ?? '')) problems.push('Supply an explicit series identifier (1–128 ASCII characters).');
  if (!Array.isArray(p.strips) || p.strips.length !== 100) problems.push('Supply all 100 numbered strip alphabets.');
  else if (p.strips.some(alphabet => typeof alphabet !== 'string' || [...alphabet].sort().join('') !== LETTERS)) problems.push('Each strip must contain A–Z exactly once.');
  if (!Array.isArray(p.order) || p.order.length !== 30 || new Set(p.order).size !== 30 || p.order.some(id => !Number.isInteger(id) || id < 1 || id > 100)) problems.push('Select 30 distinct strip IDs from 1–100.');
  const blocks = Math.ceil(textLength / 30);
  if (!Array.isArray(p.row_offsets) || p.row_offsets.length !== blocks || p.row_offsets.some(offset => !Number.isInteger(offset) || offset < 1 || offset > 25)) problems.push(`Supply one row offset 1–25 for each of the ${blocks} block${blocks === 1 ? '' : 's'}.`);
  return problems;
}
export function traceWindow(trace, cursor) { return Number.isInteger(cursor) && cursor >= 0 && cursor < trace.length ? trace[cursor] : null; }
export function tapePage(tape, start, count = 32) { return tape.slice(Math.max(0, start), Math.max(0, start) + count); }

function traceCursor(api, trace) {
  const cursor = Number.isInteger(api.ui.traceCursor) ? api.ui.traceCursor : -1;
  api.ui.traceCursor = Math.max(-1, Math.min(trace.length - 1, cursor));
  return api.ui.traceCursor;
}
function traceControls(api, trace, describe, noSelection = 'No recorded step selected. Editable initial settings are shown above.') {
  if (!trace.length) return note('No recorded trace. Enable trace before running to inspect actual Core states.');
  const cursor = Math.max(-1, Math.min(trace.length - 1, api.ui.traceCursor ?? -1));
  const step = direction => change(api, () => { api.ui.playing = false; api.ui.traceCursor = Math.max(-1, Math.min(trace.length - 1, cursor + direction)); });
  return h('div', { class: 'mechanism-trace' },
    h('div', { class: 'toolbar' }, button('Previous state', () => step(-1), { id: 'mechanism-trace-previous', disabled: cursor < 0 }), button('Next state', () => step(1), { id: 'mechanism-trace-next', disabled: cursor >= trace.length - 1 }),
      button(api.ui.playing ? 'Pause playback' : 'Play recorded trace', () => change(api, () => { api.ui.playing = !api.ui.playing; if (cursor >= trace.length - 1) api.ui.traceCursor = -1; }), { id: 'mechanism-trace-play', 'aria-pressed': String(Boolean(api.ui.playing)) })),
    field('Recorded state', 'mechanism-trace-cursor', h('input', { id: 'mechanism-trace-cursor', type: 'range', min: -1, max: trace.length - 1, value: cursor, onInput: event => change(api, () => { api.ui.traceCursor = Number(event.target.value); api.ui.playing = false; }) })),
    note(cursor < 0 ? noSelection : `${cursor + 1} / ${trace.length} · ${describe(trace[cursor])}`));
}
function playback(host, api, trace) {
  if (!api.ui.playing || !trace.length) return () => {};
  const timer = setTimeout(() => {
    if (!host.isConnected) { api.ui.playing = false; return; }
    const next = (api.ui.traceCursor ?? -1) + 1;
    api.ui.traceCursor = Math.min(next, trace.length - 1);
    if (next >= trace.length - 1) api.ui.playing = false;
    api.refresh();
  }, 450);
  return () => clearTimeout(timer);
}
function byteCharacter(text, offset) {
  if (typeof text !== 'string' || !Number.isInteger(offset)) return '';
  return new TextDecoder().decode(new TextEncoder().encode(text).slice(offset)).slice(0, 1);
}
function snapshotText(api) { return api.snapshot?.()?.input?.data ?? ''; }
function enigmaConfig(api) {
  const plugs = parse(api.param('plugboard'), null);
  return { profile: api.param('profile'), rotors: list(api.param('rotors')), rings: list(api.param('rings')), windows: api.param('windows'), reflector: api.param('reflector'), plugboard: Array.isArray(plugs) ? plugs : undefined };
}
function rotorPanel(api, config, index, inspected) {
  const windows = String(config.windows ?? '').padEnd(3, ' ');
  let ring;
  try { ring = rawJsonMembers(api.param('rings') ?? [], 'array')[index]?.source; } catch { ring = ''; }
  const setWindow = letter => {
    const next = [...windows]; next[index] = letter;
    api.setParam('windows', next.join(''));
  };
  const stepWindow = direction => change(api, () => {
    // Turning a wheel explicitly returns its display to initial settings.
    // Editing the separate form keeps any retained trace inspection selected.
    api.ui.traceCursor = -1; api.ui.playing = false;
    setWindow(LETTERS[(LETTERS.indexOf(windows[index]) + direction + 26) % 26]);
  });
  const invalidWindows = !/^[A-Z]{3}$/.test(config.windows ?? '');
  return h('section', { class: 'enigma-rotor', 'aria-label': `${['Left', 'Middle', 'Right'][index]} rotor` },
    h('span', { class: 'small muted' }, `${index + 1} · ${['Left', 'Middle', 'Right · fast'][index]}`),
    select(`enigma-rotor-${index}`, config.rotors[index], config.profile === 'enigma_i' ? ROTORS.slice(0, 5) : ROTORS, value => change(api, () => setListItem(api, 'rotors', index, value)), `Rotor ${index + 1} type`),
    h('div', { class: 'rotor-wheel' },
      h('div', { class: 'rotor-drum', 'aria-hidden': 'true' }, h('span', {class:'rotor-marker'}, '▼'), h('strong', {}, inspected?.[index] ?? windows[index]?.trim() ?? '—'), h('span', {class:'rotor-hub'})),
      h('div', {class:'rotor-step-controls'},
        button('−', () => stepWindow(-1), {id:`enigma-rewind-${index}`, 'aria-label':`Rewind rotor ${index + 1} initial window`, disabled:invalidWindows}),
        h('span', {}, inspected ? 'Recorded' : 'Initial'),
        button('+', () => stepWindow(1), {id:`enigma-advance-${index}`, 'aria-label':`Advance rotor ${index + 1} initial window`, disabled:invalidWindows}))),
    h('div', {class: 'enigma-rotor-adjustments'},
      field('Initial window', `enigma-window-${index}`, select(`enigma-window-${index}`, windows[index].trim(), [...LETTERS], value => change(api, () => setWindow(value)), `Initial window ${index + 1}`)),
      field('Ring setting', `enigma-ring-${index}`, h('input', { id: `enigma-ring-${index}`, type: 'number', min: 1, max: 26, value: ring === 'null' ? '' : ring ?? '', onChange: event => change(api, () => setListItem(api, 'rings', index, event.target.value)) }))));
}
const enigmaRows = render => ENIGMA_ROWS.map(row => h('div', {class: 'enigma-keyrow'}, [...row].map(render)));
function enigma(host, api) {
  const p = enigmaConfig(api); const result = output(api); const trace = Array.isArray(result.trace) ? result.trace : [];
  const producing = api.snapshot?.()?.parameters;
  const selected = traceWindow(trace, traceCursor(api, trace));
  const source = snapshotText(api); const sourceChar = selected ? byteCharacter(source, selected.offset) : '';
  const targetChar = selected ? byteCharacter(result.text, selected.offset).toUpperCase() : '';
  const plugId = 'enigma-plugs';
  replace(host, h('div', { class: 'mechanism enigma-machine' },
    h('div', {class: 'enigma-console'},
      h('section', {class:'enigma-output-strip', 'aria-label':'Retained text output'},
        h('div', {class:'enigma-output-label'}, h('span', {}, 'Output'), h('small', {}, api.stale() ? 'Previous configuration' : typeof result.text === 'string' ? 'Result ready' : 'Run to produce output')),
        h('pre', {id:'enigma-output', tabindex:0}, typeof result.text === 'string' ? result.text : '—'),
        button('Copy', () => copyText(result.text), {'aria-label':'Copy output text', disabled:typeof result.text !== 'string'})),
      h('div', {class: 'enigma-rotor-seat'}, h('h3', {}, 'Rotors'), h('div', { class: 'enigma-rotors' }, [0, 1, 2].map(index => rotorPanel(api, p, index, selected?.windows)))),
      h('p', { class: 'mechanism-reading' }, h('span', {}, `Initial windows: ${p.windows || '—'}`), selected ? h('span', {}, `Inspected post-step windows: ${selected.windows}`) : null, result.final_windows ? h('span', {}, `Final windows: ${result.final_windows}`) : null),
      h('section', {class: 'enigma-signal-bank'}, h('h3', {}, 'Output lamps'),
        h('div', {class: 'enigma-keyfield', role: 'region', tabindex: 0, 'aria-label': 'Output lampboard', 'data-instrument-scroll': 'enigma-lamps'},
          h('div', { class: 'enigma-keyboard lampboard' }, enigmaRows(letter => h('span', { class: `lamp${targetChar === letter ? ' lit' : ''}` }, letter))))),
      h('section', {class: 'enigma-composer'}, h('h3', {}, 'Compose input'),
        h('div', {class: 'enigma-keyfield', role: 'region', tabindex: 0, 'aria-label': 'Input keyboard', 'data-instrument-scroll': 'enigma-keys'},
          h('div', { class: 'enigma-keyboard' }, enigmaRows(letter => button(letter, () => change(api, () => { api.setText(api.text() + letter); }), { id: `enigma-insert-${letter}`, 'aria-label': `Insert ${letter}`, 'aria-pressed': String(sourceChar.toUpperCase() === letter) }))))),
      selected ? note(`Input byte offset ${selected.offset}: ${sourceChar || 'unavailable'} → ${targetChar || 'unavailable'}. State belongs to the retained run${api.stale() ? ' with earlier settings' : ''}.`) : null),
    h('aside', {class: 'enigma-adjustments', 'aria-label': 'Machine setup'}, h('h3', {}, 'Machine setup'),
      h('div', { class: 'mechanism-settings' }, field('Machine profile', 'enigma-profile', select('enigma-profile', p.profile, ['enigma_i', 'm3'], value => change(api, () => api.setParam('profile', value)))),
      field('Reflector', 'enigma-reflector', select('enigma-reflector', p.reflector, ['B', 'C'], value => change(api, () => api.setParam('reflector', value)))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: Boolean(api.param('trace')), onChange: event => change(api, () => api.setParam('trace', event.target.checked)) }), 'Record post-step windows')),
      field('Plugboard pairs (for example AB CD)', plugId, h('input', { id: plugId, value: p.plugboard?.join(' ') ?? '', spellcheck: false, onChange: event => change(api, () => jsonParam(api, 'plugboard', event.target.value.trim() ? event.target.value.trim().split(/\s+/) : [])) })),
      p.plugboard === undefined ? note(api.param('plugboard')?.trim?.() ? 'Repair the plugboard JSON in Parameters, or explicitly choose no pairs.' : 'No plugboard configuration supplied. Enter pairs or explicitly choose no pairs.') : null,
      button('Use no plugboard pairs', () => change(api, () => jsonParam(api, 'plugboard', [])), {id: 'enigma-no-plugs', 'aria-pressed': String(Array.isArray(p.plugboard) && p.plugboard.length === 0)}),
      producing?.windows ? disclosure(api, 'recorded-initial', 'Recorded initial settings', note(`Windows: ${producing.windows}. Rotors: ${list(producing.rotors).join(' / ')}. Ring settings: ${list(producing.rings).join(' / ')}.`)) : null,
      warning(enigmaProblems(p)), settingsWarning(api)),
    h('div', {class: 'enigma-trace'}, traceControls(api, trace, row => `input byte ${row.offset} · post-step ${row.windows}`), note('Windows are the actual post-step Core trace. Electrical paths are not exposed.'))));
  return playback(host, api, trace);
}

function solitaire(host, api) {
  const deck = list(api.param('deck')); const selected = Math.max(0, Math.min(deck.length - 1, api.ui.card ?? 0));
  const move = to => change(api, () => { jsonParam(api, 'deck', moveCard(deck, selected, to)); api.ui.card = to; });
  const cardName = card => card === 53 ? 'Joker A' : card === 54 ? 'Joker B' : `Card ${card}`;
  const card = (value, index) => button(h('span', {}, h('small', {}, `#${index + 1}`), ' ', h('strong', {}, value > 52 ? value === 53 ? 'A' : 'B' : value), ' ', h('span', {}, value > 52 ? 'JOKER' : 'CARD')), () => change(api, () => { api.ui.card = index; }), {
    id: `solitaire-card-${index}`, class: `solitaire-card${index === selected ? ' selected' : ''}${value > 52 ? ' joker' : ''}`, draggable: deckStatus(deck).length ? 'false' : 'true', 'aria-label': `#${index + 1} ${value > 52 ? value === 53 ? 'A JOKER' : 'B JOKER' : `${value} CARD`}. Position ${index + 1}: ${cardName(value)}. Select to move.`, 'aria-pressed': String(index === selected),
    onDragstart: event => {
      if (deckStatus(deck).length || !event.dataTransfer) { event.preventDefault(); return; }
      const token = crypto.randomUUID();
      api.ui.dragCard = {index, token, revision: api.revision?.()};
      event.dataTransfer.setData(CARD_DRAG, token); event.dataTransfer.effectAllowed = 'move';
    },
    onDragend: () => { delete api.ui.dragCard; },
    onDragover: event => { if (event.dataTransfer?.types.includes(CARD_DRAG)) event.preventDefault(); },
    onDrop: event => {
      const drag = api.ui.dragCard; delete api.ui.dragCard;
      if (!drag || drag.revision !== api.revision?.() || event.dataTransfer?.getData(CARD_DRAG) !== drag.token || deckStatus(deck).length) return;
      event.preventDefault();
      change(api, () => { jsonParam(api, 'deck', moveCard(deck, drag.index, index)); api.ui.card = index; });
    } });
  replace(host, h('div', { class: 'mechanism solitaire-table' }, h('div', { class: 'row between solitaire-header' }, h('h3', {}, 'Initial deck · 54 cards'), button('Use ordered deck 1–54', () => change(api, () => jsonParam(api, 'deck', Array.from({ length: 54 }, (_, i) => i + 1))))),
    note('Select a card to move it, or drag it onto a position. This is the initial deck; no intermediate shuffle states are returned.'), warning(deckStatus(deck)),
    h('div', { class: 'solitaire-deck', 'data-instrument-scroll': 'initial-deck', 'aria-label': 'Initial deck in position order' }, deck.slice(0, 54).map(card)),
    deck.length ? h('div', {class: 'solitaire-selection'}, h('p', {}, `Selected: position ${selected + 1} · ${cardName(deck[selected])}`), h('div', { class: 'toolbar' }, button('Move earlier', () => move(selected - 1), { id: 'solitaire-move-earlier', disabled: selected <= 0 || Boolean(deckStatus(deck).length) }), button('Move later', () => move(selected + 1), { id: 'solitaire-move-later', disabled: selected >= deck.length - 1 || Boolean(deckStatus(deck).length) })),
      field('Move selected card to position (1–54)', 'solitaire-move-position', h('input', { id: 'solitaire-move-position', type: 'number', min: 1, max: 54, disabled: Boolean(deckStatus(deck).length), value: selected + 1, onChange: event => { const to = int(event.target.value) - 1; if (to >= 0 && to < deck.length) move(to); } }))) : null,
    h('div', {class: 'mechanism-settings solitaire-options'}, field('Passphrase (ASCII letters; ordered deck required)', 'solitaire-passphrase', h('input', { id: 'solitaire-passphrase', type: 'password', autocomplete: 'off', value: api.param('passphrase') ?? '', maxlength: 65536, onChange: event => change(api, () => api.setParam('passphrase', event.target.value)) })),
      field('Deck-round budget', 'solitaire-max-steps', h('input', { id: 'solitaire-max-steps', type: 'number', min: 0, max: 1048576, value: api.param('max_steps') ?? 1048576, onChange: event => change(api, () => api.setParam('max_steps', event.target.value)) }))),
    disclosure(api, 'deck-list', 'Accessible deck list and import', field('Card order JSON', 'solitaire-deck-json', h('textarea', { id: 'solitaire-deck-json', rows: 4, value: typeof api.param('deck') === 'string' ? api.param('deck') : JSON.stringify(deck), onChange: event => change(api, () => api.setParam('deck', event.target.value)) })), h('ol', { class: 'deck-list' }, deck.map((value, index) => h('li', {}, `Position ${index + 1}: ${cardName(value)}`))))));
}

function svg(tag, attrs = {}, children = []) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  for (const child of children) element.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return element;
}
function ringGlyphs(alphabet, radius, shift, cls) {
  return [...alphabet].map((letter, index) => {
    const angle = (index - shift) * Math.PI / 12 - Math.PI / 2;
    return svg('text', { x: 220 + radius * Math.cos(angle), y: 220 + radius * Math.sin(angle), class: cls, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, [letter]);
  });
}
function ringGraduations() {
  return Array.from({length: 24}, (_, index) => {
    const angle = (index + .5) * Math.PI / 12 - Math.PI / 2;
    return svg('line', {x1: 220 + 157 * Math.cos(angle), y1: 220 + 157 * Math.sin(angle), x2: 220 + 202 * Math.cos(angle), y2: 220 + 202 * Math.sin(angle), class: 'alberti-graduation'});
  });
}
function albertiDisk(api, index, editable = true) {
  const alignment = Math.max(0, index);
  const ring = svg('g', {}, ringGlyphs(ALBERTI_RINGS.inner, 126, alignment, 'alberti-inner-letter'));
  const disk = svg('svg', { viewBox: '0 0 440 440', role: 'img', 'aria-label': index < 0 ? 'Alberti 24-position rings. No initial alignment configured.' : `Alberti 24-position rings. Inner ${ALBERTI_RINGS.inner[index]} aligned under outer A.`, class: `alberti-disk${editable ? '' : ' inspecting'}` }, [
    svg('circle', { cx: 220, cy: 220, r: 207, class: 'alberti-outer' }), ...ringGraduations(), svg('circle', { cx: 220, cy: 220, r: 150, class: 'alberti-inner' }),
    ...ringGlyphs(ALBERTI_RINGS.outer, 180, 0, 'alberti-outer-letter'), ring,
    svg('path', { d: 'M214 56 L226 56 L220 66 Z', class: 'alberti-marker' }), svg('circle', { cx: 220, cy: 220, r: 20, class: 'alberti-hub' })]);
  if (!editable) return disk;
  let start;
  const angle = event => { const bounds = disk.getBoundingClientRect(); return Math.atan2(event.clientY - bounds.top - bounds.height / 2, event.clientX - bounds.left - bounds.width / 2); };
  disk.addEventListener('pointerdown', event => { start = angle(event); disk.setPointerCapture(event.pointerId); });
  disk.addEventListener('pointermove', event => { if (start === undefined) return; ring.setAttribute('transform', `rotate(${(angle(event) - start) * 180 / Math.PI} 220 220)`); });
  disk.addEventListener('pointerup', event => {
    if (start === undefined) return;
    const shift = Math.round((angle(event) - start) / (Math.PI / 12)); start = undefined;
    const next = (alignment - shift % 24 + 24) % 24;
    if (next === alignment) { ring.removeAttribute('transform'); return; }
    change(api, () => { api.ui.traceCursor = -1; api.ui.playing = false; patchSettings(api, { profile: setting(api).profile ?? 'alberti_di_palma_2009_v1', initial_index: ALBERTI_RINGS.inner[next] }); });
  });
  disk.addEventListener('pointercancel', () => { start = undefined; ring.removeAttribute('transform'); });
  return disk;
}
function alberti(host, api) {
  const p = setting(api); const result = output(api); const trace = Array.isArray(result.trace) ? result.trace : [];
  const producing = api.snapshot?.();
  const recorded = producing?.namedInputs?.settings ?? parse(producing?.extraInputs?.settings, {});
  const selected = traceWindow(trace, traceCursor(api, trace));
  const initial = ALBERTI_RINGS.inner.indexOf(p.initial_index); const displayed = ALBERTI_RINGS.inner.indexOf(selected?.index ?? p.initial_index);
  const rotate = delta => change(api, () => { api.ui.traceCursor = -1; api.ui.playing = false; patchSettings(api, { profile: p.profile ?? 'alberti_di_palma_2009_v1', initial_index: ALBERTI_RINGS.inner[((initial < 0 ? 0 : initial) + delta + 24) % 24] }); });
  replace(host, h('div', { class: 'mechanism alberti-instrument' },
    h('div', {class: 'alberti-stage'}, albertiDisk(api, displayed, !selected), note(selected ? `Inspected alignment: ${selected.index} · input byte ${selected.offset}` : initial < 0 ? 'No initial index configured. Choose an inner symbol, or rotate the geometry preview to set the alignment.' : 'Initial alignment. Drag the inner disk to choose an initial index.'),
      h('div', { class: 'toolbar' }, button('Rotate initial index left', () => rotate(-1), {id:'alberti-rotate-left'}), button('Rotate initial index right', () => rotate(1), {id:'alberti-rotate-right'}))),
    h('div', {class: 'alberti-controls'}, h('h3', {}, 'Alignment'), note('24 positions · alberti_di_palma_2009_v1. Di Palma 2009, pp. 11–13; digits 1–4 are control symbols.'),
      initial < 0 || p.profile !== 'alberti_di_palma_2009_v1' ? warning(['Load the Core example or supply settings with an explicit initial index and profile.']) : null, settingsWarning(api),
      field('Inner symbol under outer A (initial)', 'alberti-initial', select('alberti-initial', p.initial_index, [...ALBERTI_RINGS.inner], value => change(api, () => { api.ui.traceCursor = -1; api.ui.playing = false; patchSettings(api, { profile: p.profile ?? 'alberti_di_palma_2009_v1', initial_index: value }); }))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: Boolean(p.trace), onChange: event => change(api, () => patchSettings(api, { trace: event.target.checked })) }), 'Record alignment trace'),
      result.final_index !== undefined ? h('p', { class: 'mechanism-reading' }, `Final index: ${result.final_index}`) : null,
      recorded?.initial_index ? disclosure(api, 'recorded-initial', 'Recorded initial settings', note(`Initial index: ${recorded.initial_index}. Profile: ${recorded.profile}.`)) : null,
      selected ? note(`Recorded input byte ${selected.offset}: ${byteCharacter(producing?.input?.data, selected.offset)} → ${byteCharacter(result.text, selected.offset)}.`) : null,
      note('Prepared text is the exact text input; the engine does not insert indicators, spaces, or fold U/V.'),
      traceControls(api, trace, row => `input byte ${row.offset} · alignment ${row.index}`))));
  return playback(host, api, trace);
}

function importSettings(api, file) {
  if (!file) return;
  const token = { revision: api.revision?.() };
  api.ui.settingsRead = token;
  api.pendingInputRead?.(token);
  api.ui.importError = '';
  const current = () => api.ui.settingsRead === token && api.revision?.() === token.revision && (api.inputReadCurrent?.(token) ?? true);
  const finish = () => {
    if (api.ui.settingsRead !== token) return;
    api.ui.settingsRead = null;
    api.pendingInputRead?.(null, token);
    api.refresh();
  };
  if (file.size > 128 * 1024) { api.ui.importError = 'Choose a settings file no larger than 128 KiB.'; finish(); return; }
  api.refresh();
  file.text().then(text => {
    if (!current()) return;
    const parsed = parse(text, null);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Use one settings JSON object.');
    api.setExtra('settings', text);
    api.ui.importError = '';
  }).catch(error => { if (current()) api.ui.importError = error.message; }).finally(finish);
}

function m138Strip(api, p, id, index, block, selected, label) {
  const alphabet = typeof p.strips?.[id - 1] === 'string' ? p.strips[id - 1] : '';
  const input = [...api.text()][block * 30 + index]; const aligned = alphabet.indexOf(input);
  const letters = aligned < 0 ? [...alphabet] : [...alphabet.slice(aligned), ...alphabet.slice(0, aligned)];
  return h('div', { class: `m138-strip${index === selected ? ' selected' : ''}` }, button(h('span', {}, `#${label}`, ' ', h('small', {}, `Track ${index + 1}`)), () => change(api, () => { api.ui.strip = index; }), { id: `m138-strip-${index}`, class: 'm138-strip-label', 'aria-label': `#${label} Track ${index + 1}. Inspect strip ${label}`, 'aria-pressed': String(index === selected) }),
    letters.map((letter, row) => h('div', { class: `m138-cell${row === 0 && aligned >= 0 ? ' source-row' : ''}${row === p.row_offsets?.[block] ? ' offset-row' : ''}` }, letter)));
}
function m138a(host, api) {
  const p = setting(api); const order = Array.isArray(p.order) ? p.order : [];
  let labels;
  try { labels = rawJsonMembers(settingsField(api, 'order'), 'array').map(row => row.source); } catch { labels = []; }
  const blocks = Math.max(1, Math.ceil([...api.text()].length / 30)); const block = Math.max(0, Math.min(blocks - 1, api.ui.block ?? 0));
  const selected = Math.max(0, Math.min(order.length - 1, api.ui.strip ?? 0));
  const move = delta => { const to = selected + delta; if (to < 0 || to >= order.length) return; change(api, () => { patchSettings(api, { order: moveCard(order, selected, to) }); api.ui.strip = to; }); };
  const uploader = h('input', { type: 'file', accept: '.json,application/json', id: 'm138-import', onChange: event => importSettings(api, event.target.files[0]) });
  replace(host, h('div', { class: 'mechanism m138-instrument' },
    h('div', { class: 'row between m138-header' }, h('h3', {}, '30-track strip holder'), h('span', { class: 'tag' }, p.strip_series ?? 'No series loaded')),
    note('Caller-supplied strip alphabets. Examples are synthetic, not a default historical series.'),
    api.ui.settingsRead ? h('p',{role:'status'},'Reading the selected strip settings…') : null, warning(stripProblems(p, [...api.text()].length)), settingsWarning(api), api.ui.importError ? h('p', { class: 'error', role: 'alert' }, api.ui.importError) : null,
    h('div', { class: 'mechanism-settings m138-configuration' }, field('Inspect block (1-based)', 'm138-block', h('input', { id: 'm138-block', type: 'number', min: 1, max: blocks, value: block + 1, onChange: event => change(api, () => { api.ui.block = Math.max(0, Math.min(blocks - 1, int(event.target.value) - 1)); }) })),
      field('Row offsets by 30-character block (JSON)', 'm138-offsets', h('input', { id: 'm138-offsets', value: settingsField(api, 'row_offsets'), onChange: event => patchSettingsArray(api, 'row_offsets', event.target.value) }))),
    h('div', { class: 'm138-holder', 'data-instrument-scroll': 'strip-holder', role: 'region', tabindex: 0, 'aria-label': 'Strip alphabets aligned to current input block. Horizontal and vertical scroll.' }, h('div', { class: 'm138-strips' }, order.slice(0, 30).map((id, index) => m138Strip(api, p, id, index, block, selected, labels[index] ?? String(id))))),
    note('Blue outlined row: source alignment. Shaded row: configured clockwise offset. This is a configuration view, not an execution trace.'),
    order.length ? h('div', { class: 'toolbar m138-selection' }, h('strong', {}, `Track ${selected + 1} · strip #${labels[selected] ?? order[selected]}`), button('Move track left', () => move(-1), { id:'m138-move-left', disabled: selected === 0 }), button('Move track right', () => move(1), { id:'m138-move-right', disabled: selected === order.length - 1 })) : null,
    disclosure(api, 'strip-list', 'Series import and accessible track list', field('Import complete settings JSON', 'm138-import', uploader),
      field('Series identifier', 'm138-series', h('input', { id: 'm138-series', value: p.strip_series ?? '', onChange: event => change(api, () => patchSettings(api, { strip_series: event.target.value })) })),
      field('Strip order (30 IDs as JSON)', 'm138-order', h('textarea', { id: 'm138-order', rows: 3, value: settingsField(api, 'order'), onChange: event => patchSettingsArray(api, 'order', event.target.value) })),
      h('ol', { class: 'strip-list' }, order.map((id, index) => h('li', {}, `Track ${index + 1} · #${labels[index] ?? id}: ${p.strips?.[id - 1] ?? 'missing definition'}`))))));
}

function reportOf(api) {
  const result = output(api).output;
  if (result?.runs) return result.runs[api.ui.runIndex ?? 0] ?? result.runs[0];
  return result && typeof result === 'object' && 'final_pointer' in result ? result : null;
}
function brainfuckOptions(api) {
  return h('div', { class: 'mechanism-settings' },
    field('Cell width (unsigned wrapping)', 'bf-width', select('bf-width', Number(api.param('cell_bits') ?? 8), [8, 16, 32], value => change(api, () => api.setParam('cell_bits', value)))),
    field('Instruction budget', 'bf-budget', h('input', { id: 'bf-budget', type: 'number', min: 0, max: 1000000, value: api.param('max_instructions') ?? 1000000, onChange: event => change(api, () => api.setParam('max_instructions', event.target.value)) })),
    field('EOF policy', 'bf-eof', select('bf-eof', api.param('eof') ?? 'error', ['error', 'zero', 'unchanged'], value => change(api, () => api.setParam('eof', value)))));
}
function brainfuckTape(report, api) {
  const cells = Array.isArray(report?.tape) ? report.tape : [];
  const start = Math.max(0, Math.min(Math.max(0, cells.length - 1), api.ui.tapePage ?? 0));
  const shown = tapePage(cells, start);
  return h('section', {class: 'bf-tape-section'}, h('div', { class: 'row between' }, h('h3', {}, 'Final tape · exact requested range'), h('span', { class: 'tag' }, `Pointer ${report?.final_pointer ?? '—'}`)),
    cells.length ? h('div', { class: 'bf-tape', 'aria-label': 'Final recorded tape cells' }, shown.map(cell => h('div', { class: `bf-cell${cell.index === report.final_pointer ? ' pointed' : ''}` }, h('small', {}, `#${cell.index}`), h('strong', {}, cell.value), cell.index === report.final_pointer ? h('span', {}, '▲ pointer') : null))) : note('Run the report action with a positive tape length to request final tape cells.'),
    cells.length > 32 ? h('div', { class: 'toolbar' }, button('Previous tape cells', () => change(api, () => { api.ui.tapePage = Math.max(0, start - 32); }), { id:'bf-tape-previous', disabled: start === 0 }), button('Next tape cells', () => change(api, () => { api.ui.tapePage = Math.min(cells.length - 1, start + 32); }), { id:'bf-tape-next', disabled: start + 32 >= cells.length }), note(`Showing ${start + 1}–${Math.min(cells.length, start + 32)} of ${cells.length} retained cells.`)) : null);
}
function sourceSelection(api, selected) {
  const source = selected ? snapshotText(api) : api.text();
  if (typeof source !== 'string') return note('Choose a text source.');
  if (!selected) return source ? h('div', {}, h('pre', {class: 'bf-source-inspection', 'aria-label': 'Program source preview'}, source.slice(0, 2048)), note(source.length > 2048 ? 'Source preview: first 2,048 characters. The complete program is retained in the input editor.' : 'Edit the program in the input editor. A recorded dispatch selects its actual UTF-8 source offset.')) : note('Empty program. Add instructions in the input editor.');
  const bytes = new TextEncoder().encode(source); const offset = selected.source_offset;
  const before = new TextDecoder().decode(bytes.slice(Math.max(0, offset - 120), offset));
  const command = new TextDecoder().decode(bytes.slice(offset, offset + 1));
  const after = new TextDecoder().decode(bytes.slice(offset + 1, offset + 121));
  return h('pre', { class: 'bf-source-inspection', 'aria-label': `Recorded instruction ${selected.instruction} at source byte ${offset}` }, before, h('mark', {}, command), after);
}
function brainfuck(host, api) {
  const result = output(api).output; const report = reportOf(api); const trace = report?.trace ?? [];
  const selected = traceWindow(trace, traceCursor(api, trace));
  const isCompare = api.action.id.endsWith('.compare'); const isReport = api.action.id.endsWith('.report');
  const byteOutput = report?.output ?? (result instanceof Uint8Array ? result : []);
  replace(host, h('div', { class: 'mechanism brainfuck-instrument' },
    h('div', { class: 'row between' }, h('h3', {}, 'Program and recorded machine state'), h('span', { class: 'tag' }, '30,000-cell tape · wrapping arithmetic')),
    h('div', {class: 'bf-configuration'}, !isCompare ? brainfuckOptions(api) : field('Compare cell widths (JSON)', 'bf-widths', h('input', { id: 'bf-widths', value: typeof api.param('widths') === 'string' ? api.param('widths') : JSON.stringify(api.param('widths') ?? []), onChange: event => change(api, () => api.setParam('widths', event.target.value)) })),
      field('stdin · exact bytes as Base64', 'bf-stdin', h('input', { id: 'bf-stdin', value: api.extra('input'), spellcheck: false, onChange: event => change(api, () => api.setExtra('input', event.target.value)) }))),
    isReport ? h('div', {class: 'bf-report-settings'}, h('div', { class: 'mechanism-settings' }, field('Final tape start (zero-based)', 'bf-tape-start', h('input', { id: 'bf-tape-start', type: 'number', min: 0, max: 30000, value: api.param('tape_start') ?? 0, onChange: event => change(api, () => api.setParam('tape_start', event.target.value)) })),
      field('Final tape length', 'bf-tape-length', h('input', { id: 'bf-tape-length', type: 'number', min: 0, max: 30000, value: api.param('tape_len') ?? 0, onChange: event => change(api, () => api.setParam('tape_len', event.target.value)) }))),
      button('Request tape cells 0–31 and recorded dispatches', () => change(api, () => { api.setParam('tape_start', '0'); api.setParam('tape_len', '32'); api.setParam('max_trace_records', '4096'); api.setParam('max_trace_bytes', '1048576'); })), note('Trace budget: at most 4,096 records / 1 MiB. Reaching it truncates the trace, not the execution. Run explicitly after changing options.')) : note('Select the report action to request tape ranges and recorded dispatches. Execute returns exact output bytes; compare retains one report per width.'),
    result?.runs ? field('Inspect completed comparison run', 'bf-run', select('bf-run', api.ui.runIndex ?? 0, result.runs.map((_, i) => i), value => change(api, () => { api.ui.runIndex = Number(value); api.ui.traceCursor = -1; }), 'Comparison run index')) : null,
    report ? h('p', { class: report.completed ? 'mechanism-reading' : 'warning', role: 'status' }, `${report.completed ? 'Program completed' : `Execution stopped · ${report.stop_reason}`} · ${report.instructions} dispatched instructions · ${report.options.cell_bits}-bit cells`, report.trace_complete === false ? h('strong', {}, ' · Trace truncated; execution status is separate.') : null) : null,
    h('section', {class: 'bf-recorded', 'aria-label': 'Program and recorded dispatch'}, sourceSelection(api, selected),
      selected ? h('div', { class: 'bf-dispatch' }, h('h3', {}, `Recorded dispatch ${selected.instruction} · ${selected.command}`), h('p', {}, `Source byte ${selected.source_offset}; pointer ${selected.pointer_before} → ${selected.pointer_after}; cell at pointer before ${selected.cell_before}; cell at pointer after ${selected.cell_after}.`), note('Only these observed cells belong to this dispatch; the final tape is a separate state.')) : null,
      isReport || report ? traceControls(api, trace, row => `instruction ${row.instruction} · source byte ${row.source_offset} · ${row.command}`, 'No recorded dispatch selected. The tape shown is the final recorded range.') : null),
    h('div', {class: `bf-evidence-grid${isReport || report ? '' : ' output-only'}`}, isReport || report ? brainfuckTape(report, api) : null,
    h('section', { class: 'bf-output' }, h('h3', {}, 'Output bytes'), h('p', { class: 'small muted' }, result === undefined ? 'No execution output retained. Run the selected action.' : `${byteOutput.length} bytes · full output is retained by the result export`),
      h('div', {class: 'bf-output-preview'}, h('h4', {}, 'Hex'), h('pre', { 'aria-label': 'Output byte preview in hexadecimal' }, Array.from(byteOutput.slice(0, 1024), byte => byte.toString(16).padStart(2, '0').toUpperCase()).join(' '))),
      h('div', {class: 'bf-output-preview'}, h('h4', {}, 'UTF-8 preview'), h('pre', { 'aria-label': 'Output text preview decoded as UTF-8' }, new TextDecoder().decode(Uint8Array.from(byteOutput.slice(0, 1024)))))))));
  return playback(host, api, trace);
}

const renderers = { enigma, solitaire, alberti, m138a, brainfuck };
export function mountInstrument(host, api) {
  const renderer = renderers[api.kind];
  if (!renderer) throw new Error('Unknown mechanical presentation.');
  return renderer(host, api) ?? (() => {});
}

export function disposeInstrument(api) {
  const token = api.ui.settingsRead;
  api.ui.settingsRead = null;
  api.ui.playing = false;
  delete api.ui.dragCard;
  api.ui.settingsError = ''; delete api.ui.settingsErrorRaw; delete api.ui.settingsErrorField;
  if (token) api.pendingInputRead?.(null, token);
}

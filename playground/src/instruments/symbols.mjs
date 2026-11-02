import { h, button as domButton, replace } from '../dom.mjs';

// Stable control identities let the shared shell restore focus after a redraw.
function button(content, action, attributes = {}) {
  const name = attributes['aria-label'] ?? (typeof content === 'string' ? content : content?.textContent ?? 'control');
  return domButton(content, action, { id: `visual-symbol-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`, ...attributes });
}

const PIGPEN = 'pigpen_haverhill_pairs_v1';
const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const DOT_ORDER = [1, 4, 2, 5, 3, 6, 7, 8];
const brailleIndices = new WeakMap();
const note = text => h('p', { class: 'small muted' }, text);
const warn = text => h('p', { class: 'warning', role: 'status' }, text);
const label = (id, title, control) => h('div', { class: 'field' }, h('label', { for: id }, title), control);
const isDecode = api => api.action.id.endsWith('.decode');

function parseArray(raw) {
  try { const value = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(value) ? value : null; }
  catch { return null; }
}
function smallInteger(raw, min, max) {
  if (typeof raw === 'string' && !/^(0|[1-9]\d*)$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}
function holeArray(raw) {
  const value = parseArray(raw);
  return value && value.every((n, i) => Number.isSafeInteger(n) && n >= 0 && (!i || n > value[i - 1])) ? value : null;
}

/** An explicit UI mask edit; never coerces or drops an imported wide index. */
export function editMask(raw, index) {
  const holes = holeArray(raw);
  if (!holes || !Number.isSafeInteger(index) || index < 0) return null;
  return holes.includes(index) ? holes.filter(n => n !== index) : [...holes, index].sort((a, b) => a - b);
}
export function editSequence(sequence, value, index = null) {
  const next = sequence.slice();
  if (index === null) { if (value !== null) next.push(value); }
  else if (Number.isSafeInteger(index) && index >= 0 && index < next.length) {
    if (value === null) next.splice(index, 1); else next[index] = value;
  }
  return next;
}
export function displayWindow(items, start = 0, count = 96) {
  const position = Number.isSafeInteger(start) ? Math.max(0, Math.min(start, Math.max(0, items.length - 1))) : 0;
  return { start: position, items: items.slice(position, position + count) };
}
export const brailleDots = mask => DOT_ORDER.map(number => ({ number, active: Boolean(mask & (1 << (number - 1))) }));

export function glyphSegments(token) {
  const [kind, shape, marker] = String(token).split(':');
  const sides = { N: [6, 6, 34, 6], E: [34, 6, 34, 34], S: [6, 34, 34, 34], W: [6, 6, 6, 34] };
  // A wedge names its occupied X sector, not its apex (Core profile guide).
  const wedges = {
    north: [[6, 6, 20, 34], [20, 34, 34, 6]], south: [[6, 34, 20, 6], [20, 6, 34, 34]],
    west: [[6, 6, 34, 20], [34, 20, 6, 34]], east: [[34, 6, 6, 20], [6, 20, 34, 34]],
  };
  const dotAt = { north: [20, 14], south: [20, 26], west: [14, 20], east: [26, 20] };
  return { lines: kind === 'grid' ? [...(shape ?? '')].flatMap(side => sides[side] ? [sides[side]] : []) : wedges[shape] ?? [], dot: marker === 'dot', dotAt: kind === 'wedge' ? dotAt[shape] : [20, 20] };
}
function svg(tag, attributes, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, String(value));
  }
  for (const child of children.flat()) if (child) el.append(child);
  return el;
}
function pigpenGlyph(token) {
  const drawing = glyphSegments(token);
  return svg('svg', { viewBox: '0 0 40 40', class: 'pigpen-glyph', 'aria-hidden': 'true' },
    ...drawing.lines.map(([x1, y1, x2, y2]) => svg('line', { x1, y1, x2, y2, stroke: 'currentColor', 'stroke-width': 3, 'stroke-linecap': 'square' })),
    drawing.dot ? svg('circle', { cx: drawing.dotAt[0], cy: drawing.dotAt[1], r: 2.8, fill: 'currentColor' }) : null);
}
function textParam(api, name, title, { min, max } = {}) {
  const id = `visual-${api.kind}-${name}`;
  return label(id, title, h('input', { id, type: 'text', inputmode: 'numeric', value: api.param(name) ?? '',
    onChange: event => { api.setParam(name, event.target.value); api.refresh(); }, ...(min !== undefined ? { 'aria-description': `Integer from ${min} to ${max}.` } : {}) }));
}
function windowControls(api, key, length, size = 96) {
  const start = api.ui[key] ?? 0;
  return h('div', { class: 'toolbar symbol-window-controls' },
    button('Previous page', () => { api.ui[key] = Math.max(0, start - size); api.refresh(); }, { disabled: start <= 0 }),
    note(length ? `${Math.min(start + 1, length)}–${Math.min(start + size, length)} of ${length}` : 'Empty sequence'),
    button('Next page', () => { api.ui[key] = start + size; api.refresh(); }, { disabled: start + size >= length }));
}
function positionField(api, max, key = 'selection') {
  const id = `visual-${api.kind}-position`;
  return label(id, 'Inspect position (zero-based)', h('input', { id, type: 'number', min: 0, max: Math.max(0, max - 1), value: api.ui[key] ?? 0,
    onChange: event => { const n = smallInteger(event.target.value, 0, Math.max(0, max - 1)); if (n !== null) { api.ui[key] = n; api.refresh(); } } }));
}
function gridWindow(api, chars, columns, { rows, holes, onToggle, output } = {}) {
  const totalRows = rows ?? Math.ceil(chars.length / columns);
  const rowStart = Math.min(api.ui.rowStart ?? 0, Math.max(0, totalRows - 1));
  const colStart = Math.min(api.ui.colStart ?? 0, Math.max(0, columns - 1));
  const visibleRows = Math.min(10, totalRows - rowStart);
  const visibleCols = Math.min(16, columns - colStart);
  const cells = Array.from({ length: Math.max(0, visibleRows * visibleCols) }, (_, local) => {
    const row = rowStart + Math.floor(local / visibleCols); const col = colStart + local % visibleCols;
    const index = row * columns + col; const ch = chars[index]; const open = holes?.includes(index);
    const selected = api.ui.selection === index;
    const display = ch === undefined ? '·' : ch === ' ' ? '␠' : ch;
    const replacement = output && output[index] !== ch ? `→ ${output[index] ?? '·'}` : '';
    const visibleLabel = `${display}${row},${col}${replacement}`;
    const action = () => { api.ui.selection = index; if (onToggle) onToggle(index); else api.refresh(); };
    return button(h('span', {}, h('span', { class: 'symbol-cell-value' }, display), h('small', {}, `${row},${col}`),
      output && output[index] !== ch ? h('span', { class: 'symbol-overlay-value' }, `→ ${output[index] ?? '·'}`) : null), action,
    { id: `visual-${api.kind}-cell-${index}`, class: `symbol-cell${open ? ' is-hole' : ''}${selected ? ' is-inspected' : ''}${ch === undefined ? ' is-empty' : ''}`,
      'aria-label': `${visibleLabel}. ${onToggle ? open ? 'Close hole' : 'Open hole' : 'Inspect'} row ${row}, column ${col}, position ${index}, ${ch ?? 'empty'}${open ? ', open' : ''}`, 'aria-pressed': String(onToggle ? Boolean(open) : selected), disabled: ch === undefined && !onToggle });
  });
  return h('div', {}, h('div', { class: 'toolbar' },
    button('Rows ↑', () => { api.ui.rowStart = Math.max(0, rowStart - 10); api.refresh(); }, { disabled: !rowStart }),
    button('Rows ↓', () => { api.ui.rowStart = rowStart + 10; api.refresh(); }, { disabled: rowStart + 10 >= totalRows }),
    button('Columns ←', () => { api.ui.colStart = Math.max(0, colStart - 16); api.refresh(); }, { disabled: !colStart }),
    button('Columns →', () => { api.ui.colStart = colStart + 16; api.refresh(); }, { disabled: colStart + 16 >= columns })),
  h('div', { class: 'symbol-grid-scroll', role: 'region', tabindex: 0, 'aria-label': 'Character grid' }, h('div', { class: 'symbol-grid', style: `grid-template-columns:repeat(${Math.max(1, visibleCols)},minmax(48px,1fr))` }, cells)),
  note(`Rows ${rowStart}–${Math.max(rowStart, rowStart + visibleRows - 1)}, columns ${colStart}–${Math.max(colStart, colStart + visibleCols - 1)}. Coordinate labels are zero-based. Empty cells are unfilled; no padding is added.`));
}

function scytale(host, api) {
  const columns = smallInteger(api.param('columns'), 1, 4096);
  const chars = [...api.text()];
  const output = api.result()?.text;
  const gridChars = isDecode(api) && !api.stale() && typeof output === 'string' ? [...output] : chars;
  const selection = api.ui.selection ?? 0;
  const ribbon = displayWindow(chars, Math.floor(selection / 96) * 96);
  replace(host, h('div', { class: 'symbol-settings row' }, textParam(api, 'columns', 'Columns', { min: 1, max: 4096 }),
    h('div', { class: 'segmented' }, button('Wrapped strip', () => { api.ui.wrapped = true; api.refresh(); }, { 'aria-pressed': String(api.ui.wrapped !== false) }),
      button('Flat grid', () => { api.ui.wrapped = false; api.refresh(); }, { 'aria-pressed': String(api.ui.wrapped === false) }))),
  note('Row-major fill, column-major read. The strip uses the same discrete columns setting as Parameters; opening the view changes presentation only.'),
  api.ui.wrapped !== false ? h('div', { class: 'scytale-cylinder', role: 'region', tabindex: 0, 'aria-label': 'Input strip around cylinder' }, h('div', { class: 'scytale-ribbon' }, ribbon.items.map((ch, n) => button(ch === ' ' ? '␠' : ch, () => { api.ui.selection = ribbon.start + n; api.refresh(); }, { 'aria-label': `${ch === ' ' ? '␠' : ch}. Inspect input character ${ribbon.start + n}: ${ch}`, 'aria-pressed': String(selection === ribbon.start + n) })))) : null,
  columns ? gridWindow(api, gridChars, columns) : warn('Set Columns to an integer from 1 to 4096. The exact value in Parameters is preserved.'),
  note(isDecode(api) ? 'The flat grid shows decoded text only after a current Core execution; until then it shows the untransformed input. No source-to-output mapping is inferred.' : 'The grid is the original input in row-major order. Reading columns is the Core operation; the result below remains separate.'),
  positionField(api, chars.length), chars.length ? note(`Input position ${selection}: ${chars[selection] ?? '(outside input)'}`) : note('Enter text or load the example to populate the strip.'));
}

function cardan(host, api) {
  const rows = smallInteger(api.param('rows'), 1, 65536); const columns = smallInteger(api.param('columns'), 1, 65536);
  const holes = holeArray(api.param('holes')); const chars = [...api.text()];
  const valid = rows && columns && rows * columns <= 65536;
  const change = index => {
    const next = editMask(api.param('holes'), index);
    if (next) api.setParam('holes', JSON.stringify(next));
    api.refresh();
  };
  const pos = api.ui.selection ?? 0;
  const output = !api.stale() && typeof api.result()?.text === 'string' && api.action.id.endsWith('.overlay') ? [...api.result().text] : null;
  replace(host, h('div', { class: 'symbol-settings row' }, textParam(api, 'rows', 'Rows', { min: 1, max: 65536 }), textParam(api, 'columns', 'Columns', { min: 1, max: 65536 })),
    note('Fixed row-major mask. Click a cell or use Space/Enter to open or close a hole. Changing the inspection position does not edit the mask.'),
    h('div', { class: 'row between' }, note(`${holes?.length ?? 'Invalid'} holes · ${chars.length} original characters${valid ? ` · ${rows * columns} cells` : ''}`),
      button('Set empty mask', () => { api.setParam('holes', '[]'); api.refresh(); })),
    !holes ? warn('Holes must be a strictly increasing list of distinct nonnegative integer positions. Repair the exact list in Parameters before editing visually.') : null,
    valid ? gridWindow(api, chars, columns, { rows, holes, output, onToggle: holes ? change : null }) : warn('Set positive Rows and Columns whose product is at most 65,536; values are preserved until you repair them.'),
    h('div', { class: 'symbol-settings row' }, positionField(api, valid ? rows * columns : chars.length), button(holes?.includes(pos) ? 'Close inspected hole' : 'Open inspected hole', () => change(pos), { disabled: !holes || !valid || pos >= rows * columns })),
    note(`Inspected position ${pos}: original ${JSON.stringify(chars[pos] ?? '')}${holes?.includes(pos) ? ' · Open hole' : ' · Covered'}${output && output[pos] !== chars[pos] ? ` · Replacement ${JSON.stringify(output[pos] ?? '')}` : ''}`),
    api.action.id.endsWith('.overlay') ? label('visual-cardan-replacements', 'Replacement text', h('input', { id: 'visual-cardan-replacements', value: api.param('replacements') ?? '', onChange: event => { api.setParam('replacements', event.target.value); api.refresh(); } })) : null,
    note('The original text stays in the input. Extract and overlay use their own named outputs; no rotation is applied.'));
}

function directionPoint(direction, radius = 84) {
  const angle = DIRECTIONS.indexOf(direction) * Math.PI / 4 - Math.PI / 2;
  return [150 + Math.cos(angle) * radius, 120 + Math.sin(angle) * radius];
}
function flagFigure(api, left, right) {
  const drawArm = (direction, side) => {
    const [x, y] = directionPoint(direction);
    const setDirection = event => {
      const rect = event.currentTarget.ownerSVGElement.getBoundingClientRect();
      const dx = (event.clientX - rect.left) * 300 / rect.width - 150;
      const dy = (event.clientY - rect.top) * 260 / rect.height - 120;
      const sector = (Math.round((Math.atan2(dy, dx) + Math.PI / 2) / (Math.PI / 4)) + 8) % 8;
      api.ui[side] = DIRECTIONS[sector]; api.ui.pairResult = null; api.ui.pairError = ''; api.refresh();
    };
    return svg('g', {}, svg('line', { x1: 150, y1: 120, x2: x, y2: y, stroke: side === 'left' ? '#005fcc' : '#142033', 'stroke-width': 9, 'stroke-linecap': 'round' }),
      svg('rect', { x: x - 13, y: y - 13, width: 26, height: 26, fill: side === 'left' ? '#005fcc' : '#fff', stroke: '#142033', 'stroke-width': 2 }),
      svg('path', { d: `M${x - 13},${y - 13} L${x + 13},${y + 13} L${x - 13},${y + 13} Z`, fill: '#c43b36' }),
      svg('circle', { cx: x, cy: y, r: 22, fill: 'transparent', class: 'semaphore-handle', 'aria-hidden': 'true',
        onPointerdown: event => event.currentTarget.setPointerCapture(event.pointerId), onPointerup: setDirection }));
  };
  return svg('svg', { viewBox: '0 0 300 260', class: 'semaphore-figure', role: 'img', 'aria-label': `Facing sender. Anatomical left arm ${left}, right arm ${right}. Adjust with the direction selectors.` },
    ...DIRECTIONS.map(d => { const [x, y] = directionPoint(d, 113); const el = svg('text', { x, y: y + 4, 'text-anchor': 'middle', fill: '#59677b', 'font-size': 13 }); el.textContent = d; return el; }),
    svg('circle', { cx: 150, cy: 77, r: 18, fill: '#d9e0e9', stroke: '#142033', 'stroke-width': 2 }),
    svg('path', { d: 'M150 100 L150 190 M150 190 L125 240 M150 190 L175 240', stroke: '#142033', 'stroke-width': 10, fill: 'none', 'stroke-linecap': 'round' }), drawArm(left, 'left'), drawArm(right, 'right'));
}
function semaphore(host, api) {
  const left = api.ui.left ?? 'S'; const right = api.ui.right ?? 'SW'; const pair = `${left},${right}`;
  const alphabet = Array.isArray(api.data?.semaphore) ? api.data.semaphore : [];
  const canonical = alphabet.find(entry => entry.token === pair)?.unit;
  const unit = api.ui.pairResult?.pair === pair ? api.ui.pairResult.unit : canonical;
  const selector = (side, value, title) => label(`visual-semaphore-${side}`, title, h('select', { id: `visual-semaphore-${side}`, onChange: event => { api.ui[side] = event.target.value; api.ui.pairResult = null; api.ui.pairError = ''; api.refresh(); } }, DIRECTIONS.map(d => h('option', { value: d, selected: d === value }, d))));
  const sequence = isDecode(api) ? api.text().split(' ').filter((_, i, all) => all.length !== 1 || all[0] !== '') : [...api.text()];
  const visible = displayWindow(sequence, api.ui.sequenceStart ?? 0);
  const selected = api.ui.selection;
  const add = value => { api.setText(api.text() + (isDecode(api) && api.text() ? ' ' : '') + value); api.refresh(); };
  async function interpret() {
    const revision = api.revision?.();
    try {
      const result = await api.execute('symbol.semaphore.decode', { input: pair }, {});
      if (api.revision && api.revision() !== revision) return;
      api.ui.pairResult = { pair, unit: result.output }; api.ui.pairError = ''; api.refresh();
    } catch (error) { if (!api.revision || api.revision() === revision) { api.ui.pairError = error.message; api.refresh(); } }
  }
  replace(host, note('Receiver-facing view. LH and RH are the sender’s anatomical left and right arms, not screen order. Blue flag = LH; outlined flag = RH.'),
    h('div', { class: 'semaphore-workbench' }, flagFigure(api, left, right), h('div', {}, selector('left', left, 'Sender left hand (LH)'), selector('right', right, 'Sender right hand (RH)'),
      h('p', { class: 'symbol-pair' }, h('code', {}, pair), h('strong', {}, unit ?? 'Uninterpreted pair')),
      h('div', { class: 'toolbar' }, button('Interpret pair', interpret), button('Add symbol', () => add(isDecode(api) ? pair : unit), { disabled: !unit }), button('Add space', () => add(isDecode(api) ? '/' : ' '))),
      api.ui.pairError ? warn(api.ui.pairError) : null, note('Drag a flag to a direction, or use the selectors. Interpret checks the pair with Core; adding explicitly edits the input.'))),
    h('div', { class: 'symbol-sequence', role: 'group', 'aria-label': 'Semaphore input sequence' }, visible.items.map((token, n) => button(token === ' ' ? 'Space' : token, () => {
      const index = visible.start + n; api.ui.selection = index;
      const actual = isDecode(api) ? token : alphabet.find(entry => entry.unit === token.toUpperCase())?.token;
      if (actual?.includes(',')) [api.ui.left, api.ui.right] = actual.split(',');
      api.ui.pairResult = null; api.ui.pairError = ''; api.refresh();
    }, { 'aria-pressed': String(selected === visible.start + n), 'aria-label': `${token === ' ' ? 'Space' : token}. Inspect position ${visible.start + n}: ${token}` }))),
    windowControls(api, 'sequenceStart', sequence.length), note(selected === undefined ? 'Select an input symbol to inspect its arms. Selection never executes the sequence.' : `Selected input position ${selected}.`));
}

function jsonSequence(api) {
  const input = api.input();
  const sequence = input.type === 'json' ? input.data : parseArray(api.text() || '[]');
  return Array.isArray(sequence) && sequence.every(value => typeof value === 'string') ? sequence : null;
}
function pigpen(host, api) {
  const profile = api.data?.pigpen;
  const entries = profile?.definition?.entries ?? [];
  const active = api.param('profile') === PIGPEN;
  const sequence = jsonSequence(api);
  const entry = entries[api.ui.palette ?? 0];
  const token = entry?.codes?.[0];
  const unit = entry?.alternatives?.[0];
  const visible = displayWindow(sequence ?? [], api.ui.sequenceStart ?? 0);
  const update = (value, index = null) => {
    if (!sequence || !active) return;
    api.setText(JSON.stringify(editSequence(sequence, value, index))); api.refresh();
  };
  const chooseDot = checked => {
    const base = token?.replace(/:dot$/, '');
    const next = entries.findIndex(item => item.codes[0] === base + (checked ? ':dot' : ''));
    if (next >= 0) api.ui.palette = next; api.refresh();
  };
  const tokenFor = value => isDecode(api) ? value : entries.find(item => item.alternatives.includes(value))?.codes?.[0];
  replace(host, h('div', { class: 'row between' }, h('p', {}, h('strong', {}, 'Pigpen · Haverhill paired cells')), profile?.source_url ? h('a', { href: profile.source_url, target: '_blank', rel: 'noreferrer' }, 'Profile reference') : null),
    note(PIGPEN), !active ? h('div', {}, warn('This visual palette uses the Haverhill paired profile. Select it explicitly before composing with this palette.'), button('Use Haverhill profile', () => { api.setParam('profile', PIGPEN); api.refresh(); })) : null,
    h('div', { class: 'pigpen-palette', role: 'group', 'aria-label': 'Haverhill glyph palette' }, entries.map((item, index) => button(h('span', {}, pigpenGlyph(item.codes[0]), h('span', { class: 'pigpen-unit' }, item.alternatives[0] === ' ' ? 'Space' : item.alternatives[0])), () => { api.ui.palette = index; api.refresh(); },
      { 'aria-pressed': String((api.ui.palette ?? 0) === index), 'aria-label': `${item.alternatives.join(' or ')}: ${item.codes.join(', ')}`, title: item.codes[0] }))),
    token ? h('div', { class: 'symbol-selected' }, pigpenGlyph(token), h('div', {}, h('strong', {}, unit === ' ' ? 'Space' : unit), h('code', {}, token),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: token.endsWith(':dot'), disabled: token === ' ', onChange: event => chooseDot(event.target.checked) }), 'With dot'))) : warn('Canonical Pigpen profile data is unavailable.'),
    h('div', { class: 'toolbar' }, button('Add glyph', () => update(isDecode(api) ? token : unit), { disabled: !sequence || !active || !entry }),
      button('Replace selected', () => update(isDecode(api) ? token : unit, api.ui.selection), { disabled: !sequence || !active || !Number.isInteger(api.ui.selection) || api.ui.selection >= sequence.length }),
      button('Delete selected', () => update(null, api.ui.selection), { disabled: !sequence || !Number.isInteger(api.ui.selection) || api.ui.selection >= sequence.length })),
    !sequence ? warn('Use a JSON list of exact units or tokens in the input. Invalid input is preserved until you repair it; composing will not replace it.') : null,
    h('div', { class: 'symbol-sequence pigpen-sequence', role: 'group', 'aria-label': 'Pigpen input sequence' }, visible.items.map((value, local) => button(h('span', {}, pigpenGlyph(tokenFor(value) ?? ''), h('code', {}, value === ' ' ? 'Space' : value)), () => {
      api.ui.selection = visible.start + local;
      const idx = entries.findIndex(item => item.codes[0] === tokenFor(value)); if (idx >= 0) api.ui.palette = idx;
      api.refresh();
    }, { 'aria-pressed': String(api.ui.selection === visible.start + local), 'aria-label': `Inspect input position ${visible.start + local}: ${value}` }))),
    windowControls(api, 'sequenceStart', sequence?.length ?? 0),
    note('Selection inspects; Add and Replace edit the exact input list. Grid sides follow N/E/S/W walls; wedge names identify the occupied sector of the X. The Core result retains profile provenance.'));
}

function brailleValues(api) {
  const input = api.input();
  if (!isDecode(api)) return input.type === 'bytes' ? Array.from(input.data) : null;
  const chart = api.data?.braille ?? [];
  const chars = [...api.text()];
  if (!brailleIndices.has(chart)) brailleIndices.set(chart, new Map(chart.map((char, mask) => [char, mask])));
  const lookup = brailleIndices.get(chart);
  const values = chars.map(char => lookup.get(char) ?? -1);
  return values.every(n => n >= 0) ? values : null;
}
function braille(host, api) {
  const chart = api.data?.braille ?? [];
  const values = brailleValues(api);
  const selection = Math.min(api.ui.selection ?? 0, Math.max(0, (values?.length ?? 1) - 1));
  const mask = values?.[selection] ?? api.ui.emptyMask ?? 0;
  const edit = value => {
    if (!values) return;
    const next = values.length ? values.slice() : [value]; next[selection] = value;
    if (isDecode(api)) api.setText(next.map(n => chart[n]).join('')); else api.setInput({ type: 'bytes', data: Uint8Array.from(next) });
    api.ui.emptyMask = value; api.refresh();
  };
  const add = () => {
    if (!values) return;
    if (isDecode(api)) api.setText(api.text() + chart[mask]); else api.setInput({ type: 'bytes', data: Uint8Array.from([...values, mask]) });
    api.ui.selection = values.length; api.refresh();
  };
  const numberField = (base, title, value) => label(`visual-braille-${base}`, title, h('input', { id: `visual-braille-${base}`, value,
    spellcheck: false, disabled: !values || chart.length !== 256, maxlength: base === 16 ? 2 : 8, onChange: event => {
      const raw = event.target.value; const valid = base === 16 ? /^[0-9a-f]{1,2}$/i.test(raw) : /^[01]{1,8}$/.test(raw);
      if (valid) { api.ui.maskError = ''; edit(parseInt(raw, base)); } else { api.ui.maskError = `Use ${base === 16 ? 'two hexadecimal digits' : 'up to eight binary digits'}.`; api.refresh(); }
    } }));
  const visible = displayWindow(values ?? [], api.ui.sequenceStart ?? 0);
  replace(host, note('Byte masks, not language transcription. Dot numbers follow rows 1–4 / 2–5 / 3–6 / 7–8; bit n−1 controls dot n.'),
    h('div', { class: 'braille-workbench' }, h('div', { class: 'braille-cell', role: 'group', 'aria-label': 'Eight-dot byte editor' }, brailleDots(mask).map(dot => button(h('span', {}, h('span', { class: 'braille-dot', 'aria-hidden': 'true' }), h('small', {}, dot.number)), () => edit(mask ^ (1 << (dot.number - 1))),
      { id: `visual-braille-dot-${dot.number}`, 'aria-pressed': String(dot.active), 'aria-label': `Dot ${dot.number}, ${dot.active ? 'on' : 'off'}`, disabled: !values || chart.length !== 256 }))),
      h('div', {}, h('div', { class: 'braille-unicode', 'aria-label': 'Unicode cell' }, chart[mask] ?? 'Run to inspect'), h('p', {}, `U+${chart[mask]?.codePointAt(0).toString(16).toUpperCase() ?? '—'}`),
        numberField(16, 'Byte (hexadecimal)', mask.toString(16).toUpperCase().padStart(2, '0')), numberField(2, 'Byte (binary, most significant bit first)', mask.toString(2).padStart(8, '0')),
        note(`Active dots: ${brailleDots(mask).filter(dot => dot.active).map(dot => dot.number).sort((a, b) => a - b).join(', ') || 'none'}`))),
    api.ui.maskError ? warn(api.ui.maskError) : null,
    !values ? h('div', {}, warn(isDecode(api) ? 'The input includes a character outside the canonical Braille cells. Repair it in Parameters; the original input is preserved.' : 'Choose exact bytes for Encode, or explicitly start a byte sequence.'),
      !isDecode(api) ? button('Start empty byte sequence', () => { api.setInput({ type: 'bytes', data: new Uint8Array() }); api.refresh(); }) : null) : null,
    h('div', { class: 'toolbar' }, button('Append cell', add, { disabled: !values || chart.length !== 256 }), button('Delete selected cell', () => {
      const next = values.filter((_, index) => index !== selection);
      if (isDecode(api)) api.setText(next.map(n => chart[n]).join('')); else api.setInput({ type: 'bytes', data: Uint8Array.from(next) });
      api.ui.selection = Math.max(0, selection - 1); api.refresh();
    }, { disabled: !values?.length })),
    h('div', { class: 'symbol-sequence braille-sequence', role: 'group', 'aria-label': 'Braille input cells' }, visible.items.map((value, local) => button(h('span', {}, h('span', { class: 'braille-sequence-glyph' }, chart[value]), h('code', {}, value.toString(16).toUpperCase().padStart(2, '0'))), () => { api.ui.selection = visible.start + local; api.refresh(); }, { 'aria-pressed': String(selection === visible.start + local), 'aria-label': `${chart[value]}${value.toString(16).toUpperCase().padStart(2, '0')}. Inspect cell ${visible.start + local}, mask ${value}` }))),
    windowControls(api, 'sequenceStart', values?.length ?? 0), note('Unicode previews use the 256-entry table generated by the installed Core SDK. Selecting a cell does not execute or edit it.'));
}

function morseEdit(api, operation) {
  const value = api.text();
  const edits = { dot: () => value + '.', dash: () => value + '-', letter: () => value && !value.endsWith(' ') ? value + ' ' : value,
    word: () => value ? value + (value.endsWith(' ') ? '/ ' : ' / ') : '/ ', delete: () => [...value].slice(0, -1).join('') };
  api.setText(edits[operation]()); api.refresh();
}
function morse(host, api) {
  const decode = isDecode(api);
  const raw = decode ? api.text() : typeof api.result()?.output === 'string' ? api.result().output : '';
  const groups = raw === '' ? [] : raw.split(' ');
  const visible = displayWindow(groups, api.ui.sequenceStart ?? 0);
  const switchMode = mode => {
    api.ui[decode ? 'signalsDraft' : 'textDraft'] = api.text();
    api.setText(api.ui[mode === 'signals' ? 'signalsDraft' : 'textDraft'] ?? '');
    api.selectAction?.(`symbol.morse.${mode === 'signals' ? 'decode' : 'encode'}`);
  };
  replace(host, h('div', { class: 'segmented' }, button('Compose signals', () => switchMode('signals'), { 'aria-pressed': String(decode), disabled: !api.selectAction }),
    button('Enter text', () => switchMode('text'), { 'aria-pressed': String(!decode), disabled: !api.selectAction })),
    decode ? h('div', { class: 'morse-composer toolbar', role: 'group', 'aria-label': 'Morse signal composer' },
      button(h('span', {}, h('span', { class: 'morse-mark' }, '•'), 'Dot'), () => morseEdit(api, 'dot')),
      button(h('span', {}, h('span', { class: 'morse-mark' }, '━'), 'Dash'), () => morseEdit(api, 'dash')),
      button('Next letter', () => morseEdit(api, 'letter')), button('Next word', () => morseEdit(api, 'word')), button('Delete', () => morseEdit(api, 'delete'))) : note('Enter letters and digits in the source input, then run Encode to get the exact dot/dash groups.'),
    h('div', { class: 'morse-sequence symbol-sequence', role: 'group', 'aria-label': decode ? 'Input Morse letter groups' : 'Recorded output Morse letter groups' }, visible.items.map((group, local) => button(h('span', {},
      h('span', { class: 'morse-group', 'aria-hidden': 'true' }, group === '/' ? '／' : [...group].map(mark => mark === '.' ? '•' : mark === '-' ? '━' : mark).join(' ')), h('code', {}, group || '(empty token)')),
    () => { api.ui.selection = visible.start + local; api.refresh(); }, { 'aria-pressed': String(api.ui.selection === visible.start + local), 'aria-label': `Inspect letter group ${visible.start + local}: ${group || 'empty token'}` }))),
    windowControls(api, 'sequenceStart', groups.length),
    raw ? h('div', { class: 'viewer' }, h('pre', { role: 'region', tabindex: 0, 'aria-label': 'Exact Morse text preview' }, raw.slice(0, 4096))) : note(decode ? 'Start with Dot or Dash. Next letter inserts one ASCII space; Next word inserts a slash word separator.' : 'No recorded Morse output yet.'),
    note('Selection inspects a recorded or composed group. It never executes. Symbol editing is explicit; this composer does not infer key timing or analyze sound.'),
    raw.length > 4096 ? note('Preview limited to 4,096 characters; the full input and exported Core result are retained.') : null);
}

const instruments = { scytale, cardan, semaphore, pigpen, braille, morse };
export function mountInstrument(host, api) {
  host.classList.add('symbol-instrument', `symbol-${api.kind}`);
  instruments[api.kind](host, api);
}

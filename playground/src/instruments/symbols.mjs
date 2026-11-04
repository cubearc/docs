import { h, button as domButton, replace, copyText } from '../dom.mjs';
import { flagFigure } from './semaphore-figure.mjs';

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
const details = (api, title, ...content) => h('details', { class: 'symbol-notes', open: Boolean(api.ui[`notes:${title}`]), onToggle: event => { if (event.currentTarget.isConnected) api.ui[`notes:${title}`] = event.currentTarget.open; } }, h('summary', { onClick: event => { if (event.currentTarget.isConnected && !event.defaultPrevented) api.ui[`notes:${title}`] = !event.currentTarget.parentElement.open; } }, title), ...content);
const sectionTitle = (title, detail) => h('div', { class: 'symbol-section-title' }, h('h3', {}, title), detail ? h('span', { class: 'small muted' }, detail) : null);

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
  return h('div', { class: 'symbol-grid-view' },
    h('div', { class: 'symbol-grid-scroll', role: 'region', tabindex: 0, 'aria-label': 'Character grid' }, h('div', { class: 'symbol-grid', style: `grid-template-columns:repeat(${Math.max(1, visibleCols)},minmax(3.5rem,var(--symbol-cell-size,4.6rem)))` }, cells)),
    h('div', { class: 'symbol-grid-caption' }, h('span', {}, `${totalRows} rows × ${columns} columns`), h('span', {}, 'Row / column · zero-based')),
    h('details', { class: 'symbol-grid-navigation', open: api.ui.gridNavigation ?? (totalRows > 10 || columns > 16), onToggle: event => { if (event.currentTarget.isConnected) api.ui.gridNavigation = event.currentTarget.open; } }, h('summary', { onClick: event => { if (event.currentTarget.isConnected && !event.defaultPrevented) api.ui.gridNavigation = !event.currentTarget.parentElement.open; } }, 'Grid navigation'),
      h('div', { class: 'toolbar' },
        button('Rows ↑', () => { api.ui.rowStart = Math.max(0, rowStart - 10); api.refresh(); }, { disabled: !rowStart }),
        button('Rows ↓', () => { api.ui.rowStart = rowStart + 10; api.refresh(); }, { disabled: rowStart + 10 >= totalRows }),
        button('Columns ←', () => { api.ui.colStart = Math.max(0, colStart - 16); api.refresh(); }, { disabled: !colStart }),
        button('Columns →', () => { api.ui.colStart = colStart + 16; api.refresh(); }, { disabled: colStart + 16 >= columns })),
      note(`Visible rows ${rowStart}–${Math.max(rowStart, rowStart + visibleRows - 1)}, columns ${colStart}–${Math.max(colStart, colStart + visibleCols - 1)}. Empty cells are unfilled; no padding is added.`)));
}

function scytale(host, api) {
  const columns = smallInteger(api.param('columns'), 1, 4096);
  const chars = [...api.text()];
  const output = api.result()?.text;
  const gridChars = isDecode(api) && !api.stale() && typeof output === 'string' ? [...output] : chars;
  const selection = api.ui.selection ?? 0;
  const ribbon = displayWindow(chars, Math.floor(selection / 96) * 96);
  const wrapped = api.ui.wrapped !== false;
  const strip = h('div', { class: 'scytale-drum-stage' }, sectionTitle('Wrapped strip', 'Original input'),
    h('div', { class: 'scytale-cylinder', role: 'region', tabindex: 0, 'aria-label': 'Input strip around cylinder' },
      h('div', { class: 'scytale-ribbon' }, ribbon.items.map((ch, n) => button(ch === ' ' ? '␠' : ch, () => { api.ui.selection = ribbon.start + n; api.refresh(); },
        { 'aria-label': `${ch === ' ' ? '␠' : ch}. Inspect input character ${ribbon.start + n}: ${ch}`, 'aria-pressed': String(selection === ribbon.start + n) })))),
    note(chars.length ? `Input positions ${ribbon.start}–${ribbon.start + ribbon.items.length - 1}` : 'Enter text to fill the strip.'));
  replace(host,
    h('div', { class: 'symbol-settings symbol-control-bar' }, textParam(api, 'columns', 'Columns', { min: 1, max: 4096 }),
      h('div', { class: 'segmented' }, button('Wrapped strip', () => { api.ui.wrapped = true; api.refresh(); }, { 'aria-pressed': String(wrapped) }),
        button('Flat grid', () => { api.ui.wrapped = false; api.refresh(); }, { 'aria-pressed': String(!wrapped) }))),
    h('div', { class: `scytale-layout${wrapped ? ' is-wrapped' : ' is-flat'}` }, wrapped ? strip : null,
      h('section', { class: 'scytale-flat-stage' }, sectionTitle('Flat grid', 'Row-major fill'), columns ? gridWindow(api, gridChars, columns) : warn('Set Columns to an integer from 1 to 4096. The exact value in Parameters is preserved.'))),
    h('div', { class: 'symbol-inspector' }, positionField(api, chars.length), h('p', {}, h('span', { class: 'small muted' }, 'Original character'), h('strong', { class: 'symbol-inspected-character' }, chars[selection] === ' ' ? '␠' : chars[selection] ?? '—'))),
    details(api, 'Reading order', note('Row-major fill, column-major read. Columns is the operation setting; opening the strip changes presentation only. The final row stays incomplete, without padding.'),
      note(isDecode(api) ? 'The flat grid uses decoded text after a current run. Until then it shows the untransformed input. Source and result are inspected independently.' : 'The grid shows your original input. Run the operation to read its columns; the result remains separate.')));
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
  replace(host,
    h('div', { class: 'symbol-settings symbol-control-bar' }, textParam(api, 'rows', 'Rows', { min: 1, max: 65536 }), textParam(api, 'columns', 'Columns', { min: 1, max: 65536 }),
      h('div', { class: 'cardan-mask-count' }, h('strong', {}, holes?.length ?? '—'), h('span', {}, 'open holes')),
      button('Set empty mask', () => { api.setParam('holes', '[]'); api.refresh(); })),
    h('div', { class: 'cardan-stage-heading' }, sectionTitle('Grille', 'Click a character to open or close a hole'),
      h('div', { class: 'cardan-legend' }, h('span', {}, h('i', { class: 'cardan-swatch open', 'aria-hidden': 'true' }), 'Open'), h('span', {}, h('i', { class: 'cardan-swatch', 'aria-hidden': 'true' }), 'Covered'))),
    !holes ? warn('Holes must be a strictly increasing list of distinct nonnegative integer positions. Repair the exact list in Parameters before editing visually.') : null,
    valid ? gridWindow(api, chars, columns, { rows, holes, output, onToggle: holes ? change : null }) : warn('Set positive Rows and Columns whose product is at most 65,536; values are preserved until you repair them.'),
    h('div', { class: 'symbol-inspector' }, positionField(api, valid ? rows * columns : chars.length),
      h('p', {}, h('span', { class: 'small muted' }, holes?.includes(pos) ? 'Open hole' : 'Covered position'), h('strong', { class: 'symbol-inspected-character' }, chars[pos] === ' ' ? '␠' : chars[pos] ?? '—')),
      button(holes?.includes(pos) ? 'Close inspected hole' : 'Open inspected hole', () => change(pos), { disabled: !holes || !valid || pos >= rows * columns })),
    output && output[pos] !== chars[pos] ? note(`Replacement at ${pos}: ${JSON.stringify(output[pos] ?? '')}. Original: ${JSON.stringify(chars[pos] ?? '')}.`) : null,
    api.action.id.endsWith('.overlay') ? label('visual-cardan-replacements', 'Replacement text', h('input', { id: 'visual-cardan-replacements', value: api.param('replacements') ?? '', onChange: event => { api.setParam('replacements', event.target.value); api.refresh(); } })) : null,
    details(api, 'Mask and source details', note(`${chars.length} original characters${valid ? ` · ${rows * columns} cells` : ''}. The original text stays in the input.`),
      note('This is a fixed row-major mask. Space or Enter toggles a focused cell. The inspection position does not edit the mask. Extract and overlay keep their own named outputs; no rotation is applied.')));
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
  const retained = api.result();
  const resultText = typeof retained?.output === 'string' ? retained.output : typeof retained?.text === 'string' ? retained.text : undefined;
  const sequenceItems = visible.items.map((token, n) => {
    const canonicalPair = isDecode(api) ? token : alphabet.find(entry => entry.unit === token.toUpperCase())?.token;
    return button(h('span', {}, h('strong', {}, token === ' ' ? 'Space' : token), canonicalPair?.includes(',') ? h('small', {}, ' ' + canonicalPair) : null), () => {
      const index = visible.start + n; api.ui.selection = index;
      if (canonicalPair?.includes(',')) [api.ui.left, api.ui.right] = canonicalPair.split(',');
      api.ui.pairResult = null; api.ui.pairError = ''; api.refresh();
    }, { 'aria-pressed': String(selected === visible.start + n), 'aria-label': `${token === ' ' ? 'Space' : token}${canonicalPair?.includes(',') ? ' ' + canonicalPair : ''}. Inspect position ${visible.start + n}: ${token}` });
  });
  replace(host,
    h('div', { class: 'semaphore-workbench' },
      h('section', { class: 'semaphore-stage' }, flagFigure(api, left, right),
        h('div', { class: 'semaphore-arm-legend' }, h('span', {}, h('i', { class: 'left', 'aria-hidden': 'true' }), 'LH · sender left'), h('span', {}, h('i', { class: 'right', 'aria-hidden': 'true' }), 'RH · sender right'))),
      h('div', { class: 'semaphore-side' },
        h('section', { class: 'semaphore-controls' }, sectionTitle('Selected symbol'),
          h('div', { class: 'semaphore-selection' },
            h('p', { class: 'symbol-pair' }, h('strong', {}, unit ?? '—'), h('code', {}, pair)),
            h('div', { class: 'semaphore-directions' }, selector('left', left, 'Sender left hand (LH)'), selector('right', right, 'Sender right hand (RH)'))),
          h('div', { class: 'semaphore-viewpoint' }, h('strong', {}, 'Facing the sender'), note('Sender’s left is on your right.')),
          h('div', { class: 'toolbar semaphore-compose-actions' }, button('Add symbol', () => add(isDecode(api) ? pair : unit), { disabled: !unit, class: 'primary' }), button('Add space', () => add(isDecode(api) ? '/' : ' ')), button('Interpret pair', interpret)),
          api.ui.pairError ? warn(api.ui.pairError) : null,
          note('Drag a flag or choose directions. Add symbol edits the input.')),
        h('section', { class: 'semaphore-composition' },
          sectionTitle('Sequence', selected === undefined ? 'Select to inspect' : `Position ${selected} selected`),
          h('div', { class: 'symbol-sequence semaphore-sequence', role: 'group', 'aria-label': 'Semaphore input sequence' }, sequenceItems.length ? sequenceItems : note('Add a symbol to start the sequence.')),
          sequence.length > 96 ? windowControls(api, 'sequenceStart', sequence.length) : null,
          h('div', { class: 'semaphore-output' }, h('div', {class:'row between'}, h('strong', {}, 'Output'), h('small', {class:'muted'}, api.stale() ? 'Previous configuration' : resultText === undefined ? 'Run to produce a result' : 'Text')),
            h('pre', {tabindex:0, 'aria-label':'Semaphore output preview'}, resultText?.slice(0,4096) ?? '—'),
            h('div', {class:'toolbar'}, button('Copy', () => copyText(resultText), {disabled:resultText === undefined, 'aria-label':'Copy semaphore output'}), button('Use as input', () => api.useOutput?.(Object.hasOwn(retained ?? {}, 'output') ? 'output' : 'text'), {disabled:resultText === undefined || !api.useOutput})),
            resultText?.length > 4096 ? note('Preview: 4,096 characters. Copy retains the complete output.') : null)))),
    details(api, 'Viewpoint and direction convention', note('Directions are viewed facing the sender. LH and RH refer to the sender’s anatomical left and right arms, not screen order. The red/yellow flag marks LH; the blue/white flag marks RH.'),
      note('Interpret pair validates the selected directions. Selecting a sequence position inspects without editing or executing. Spaces and exact separators remain in the input.')));

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
  const paletteKey = ({ item, index }) => button(h('span', {}, pigpenGlyph(item.codes[0]), h('span', { class: 'pigpen-unit' }, item.alternatives[0] === ' ' ? 'Space' : item.alternatives[0])), () => { api.ui.palette = index; api.refresh(); },
    { class: item.codes[0] === ' ' ? 'pigpen-space-key' : 'pigpen-key', 'aria-pressed': String((api.ui.palette ?? 0) === index), 'aria-label': `${item.alternatives.map(value => value === ' ' ? 'Space' : value).join(' or ')}: ${item.codes.map(value => value === ' ' ? 'space token' : value).join(', ')}`, title: item.codes[0] });
  const pairs = prefix => {
    const grouped = new Map();
    entries.forEach((item, index) => {
      const code = item.codes[0]; if (!code.startsWith(prefix)) return;
      const base = code.replace(/:dot$/, '');
      if (!grouped.has(base)) grouped.set(base, []);
      grouped.get(base).push({ item, index });
    });
    return [...grouped].map(([base, pair]) => h('div', { class: 'pigpen-letter-pair', 'data-sector': base.split(':')[1] }, pair.map(paletteKey)));
  };
  const space = entries.findIndex(item => item.codes[0] === ' ');
  replace(host,
    h('div', { class: 'symbol-section-title pigpen-profile' }, h('h3', {}, 'Haverhill paired alphabet'), profile?.source_url ? h('a', { href: profile.source_url, target: '_blank', rel: 'noreferrer' }, 'Profile reference') : null),
    !active ? h('div', {}, warn('This visual palette uses the Haverhill paired profile. Select it explicitly before composing with this palette.'), button('Use Haverhill profile', () => { api.setParam('profile', PIGPEN); api.refresh(); })) : null,
    h('div', { class: 'pigpen-workbench' },
      h('div', { class: 'pigpen-palette', role: 'group', 'aria-label': 'Haverhill glyph palette' },
        h('section', { class: 'pigpen-bank' }, sectionTitle('Nine cells', 'A–R'), h('div', { class: 'pigpen-grid-bank' }, pairs('grid:'))),
        h('section', { class: 'pigpen-bank' }, sectionTitle('Four sectors', 'S–Z'), h('div', { class: 'pigpen-cross-bank' }, pairs('wedge:')), space >= 0 ? paletteKey({ item: entries[space], index: space }) : null)),
      h('div', { class: 'pigpen-compose-station' }, token ? h('div', { class: 'symbol-selected' }, pigpenGlyph(token), h('div', {}, h('strong', {}, unit === ' ' ? 'Space' : unit), h('code', {}, token),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: token.endsWith(':dot'), disabled: token === ' ', onChange: event => chooseDot(event.target.checked) }), 'With dot'))) : warn('Canonical Pigpen profile data is unavailable.'),
        h('div', { class: 'toolbar pigpen-compose-actions' }, button('Add glyph', () => update(isDecode(api) ? token : unit), { disabled: !sequence || !active || !entry, class: 'primary' }),
          button('Replace selected', () => update(isDecode(api) ? token : unit, api.ui.selection), { disabled: !sequence || !active || !Number.isInteger(api.ui.selection) || api.ui.selection >= sequence.length }),
          button('Delete selected', () => update(null, api.ui.selection), { disabled: !sequence || !Number.isInteger(api.ui.selection) || api.ui.selection >= sequence.length })))),
    !sequence ? warn('Use a JSON list of exact units or tokens in the input. Invalid input is preserved until you repair it; composing will not replace it.') : null,
    sectionTitle('Composed sequence', 'Select to inspect · Add or Replace to edit'),
    h('div', { class: 'symbol-sequence pigpen-sequence', role: 'group', 'aria-label': 'Pigpen input sequence' }, visible.items.map((value, local) => button(h('span', {}, pigpenGlyph(tokenFor(value) ?? ''), h('code', {}, value === ' ' ? 'Space' : value)), () => {
      api.ui.selection = visible.start + local;
      const idx = entries.findIndex(item => item.codes[0] === tokenFor(value)); if (idx >= 0) api.ui.palette = idx;
      api.refresh();
    }, { 'aria-pressed': String(api.ui.selection === visible.start + local), 'aria-label': `Inspect input position ${visible.start + local}: ${value === ' ' ? 'Space' : value}` }))),
    windowControls(api, 'sequenceStart', sequence?.length ?? 0),
    details(api, 'Profile and glyph convention', note(PIGPEN), note('Grid walls use N/E/S/W sides. A wedge names the occupied sector of the X; its point faces inward. Each Haverhill cell pairs an unmarked letter with a dotted letter. The result retains the selected profile’s provenance.')));

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
  const numberField = (base, title, value) => label(`visual-braille-${base}`, title, h('input', { id: `visual-braille-${base}`, class: 'braille-mask-input', value,
    spellcheck: false, disabled: !values || chart.length !== 256, maxlength: base === 16 ? 2 : 8, onChange: event => {
      const raw = event.target.value; const valid = base === 16 ? /^[0-9a-f]{1,2}$/i.test(raw) : /^[01]{1,8}$/.test(raw);
      if (valid) { api.ui.maskError = ''; edit(parseInt(raw, base)); } else { api.ui.maskError = `Use ${base === 16 ? 'two hexadecimal digits' : 'up to eight binary digits'}.`; api.refresh(); }
    } }));
  const visible = displayWindow(values ?? [], api.ui.sequenceStart ?? 0);
  replace(host,
    sectionTitle('Eight-dot cell', 'Tap a dot to edit the selected byte'),
    h('div', { class: 'braille-workbench' },
      h('div', { class: 'braille-cell', role: 'group', 'aria-label': 'Eight-dot byte editor' }, brailleDots(mask).map(dot => button(h('span', {}, h('span', { class: 'braille-dot', 'aria-hidden': 'true' }), h('small', {}, dot.number)), () => edit(mask ^ (1 << (dot.number - 1))),
        { id: `visual-braille-dot-${dot.number}`, 'aria-pressed': String(dot.active), 'aria-label': `Dot ${dot.number}, ${dot.active ? 'on' : 'off'}`, disabled: !values || chart.length !== 256 }))),
      h('div', { class: 'braille-readout' },
        h('div', { class: 'braille-unicode-sample' }, h('div', { class: 'braille-unicode', role: 'img', 'aria-label': chart[mask] ? `Unicode cell U+${chart[mask].codePointAt(0).toString(16).toUpperCase()}` : 'Unicode cell unavailable' }, chart[mask] ?? '—'),
          h('code', {}, `U+${chart[mask]?.codePointAt(0).toString(16).toUpperCase() ?? '—'}`)),
        h('div', { class: 'braille-values' }, numberField(16, 'Byte (hexadecimal)', mask.toString(16).toUpperCase().padStart(2, '0')), numberField(2, 'Byte (binary, most significant bit first)', mask.toString(2).padStart(8, '0'))),
        h('p', { class: 'braille-active-dots' }, h('span', { class: 'small muted' }, 'Active dots'), h('strong', {}, brailleDots(mask).filter(dot => dot.active).map(dot => dot.number).sort((a, b) => a - b).join(' · ') || 'None')))),
    api.ui.maskError ? warn(api.ui.maskError) : null,
    !values ? h('div', {}, warn(isDecode(api) ? 'The input includes a character outside the canonical Braille cells. Repair it in Parameters; the original input is preserved.' : 'Choose exact bytes for Encode, or explicitly start a byte sequence.'),
      !isDecode(api) ? button('Start empty byte sequence', () => { api.setInput({ type: 'bytes', data: new Uint8Array() }); api.refresh(); }) : null) : null,
    h('div', { class: 'symbol-section-title braille-sequence-header' }, h('h3', {}, 'Byte sequence'),
      h('div', { class: 'toolbar' }, button('Append cell', add, { disabled: !values || chart.length !== 256, class: 'primary' }), button('Delete selected cell', () => {
        const next = values.filter((_, index) => index !== selection);
        if (isDecode(api)) api.setText(next.map(n => chart[n]).join('')); else api.setInput({ type: 'bytes', data: Uint8Array.from(next) });
        api.ui.selection = Math.max(0, selection - 1); api.refresh();
      }, { disabled: !values?.length }))),
    h('div', { class: 'symbol-sequence braille-sequence', role: 'group', 'aria-label': 'Braille input cells' }, visible.items.map((value, local) => button(h('span', {}, h('span', { class: 'braille-sequence-glyph' }, chart[value]), h('code', {}, value.toString(16).toUpperCase().padStart(2, '0'))), () => { api.ui.selection = visible.start + local; api.refresh(); }, { 'aria-pressed': String(selection === visible.start + local), 'aria-label': `${chart[value]}${value.toString(16).toUpperCase().padStart(2, '0')}. Inspect cell ${visible.start + local}, mask ${value}` }))),
    windowControls(api, 'sequenceStart', values?.length ?? 0),
    details(api, 'Byte and dot convention', note('These are byte masks, not language transcription. Physical rows are 1–4 / 2–5 / 3–6 / 7–8; bit n−1 controls dot n.'),
      note('Unicode previews follow the canonical byte-mask table. Selecting a sequence cell inspects it; toggling a dot edits the selected byte. No execution is triggered.')));

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
  const marks = group => group === '/' ? h('span', { class: 'morse-word-gap' }, '/') : [...group].map(mark =>
    mark === '.' || mark === '-' ? h('span', { class: mark === '.' ? 'morse-dot-shape' : 'morse-dash-shape' }) : h('span', {}, mark));
  replace(host,
    h('div', { class: 'symbol-control-bar morse-mode' }, h('div', { class: 'segmented' }, button('Compose signals', () => switchMode('signals'), { 'aria-pressed': String(decode), disabled: !api.selectAction }),
      button('Enter text', () => switchMode('text'), { 'aria-pressed': String(!decode), disabled: !api.selectAction }))),
    sectionTitle('Signal sequence', decode ? 'Your composed symbols' : 'Recorded Encode output'),
    h('div', { class: 'morse-sequence symbol-sequence', role: 'group', 'aria-label': decode ? 'Input Morse letter groups' : 'Recorded output Morse letter groups' },
      visible.items.length ? visible.items.map((group, local) => button(h('span', {},
        h('span', { class: 'morse-group', 'aria-hidden': 'true' }, marks(group)), h('code', {}, group || '(empty token)')),
      () => { api.ui.selection = visible.start + local; api.refresh(); }, { 'aria-pressed': String(api.ui.selection === visible.start + local), 'aria-label': `Inspect letter group ${visible.start + local}: ${group || 'empty token'}` })) : h('p', { class: 'morse-empty muted' }, decode ? 'Start a letter with Dot or Dash.' : 'Enter text in the input and run Encode.')),
    windowControls(api, 'sequenceStart', groups.length),
    decode ? h('div', { class: 'morse-composer', role: 'group', 'aria-label': 'Morse signal composer' },
      h('div', { class: 'morse-key-pair' },
        button(h('span', {}, h('span', { class: 'morse-mark' }, '•'), 'Dot'), () => morseEdit(api, 'dot')),
        button(h('span', {}, h('span', { class: 'morse-mark' }, '━'), 'Dash'), () => morseEdit(api, 'dash'))),
      h('div', { class: 'morse-navigation' }, button('Next letter', () => morseEdit(api, 'letter')), button('Next word', () => morseEdit(api, 'word')), button('Delete', () => morseEdit(api, 'delete')))) : null,
    raw ? h('section', { class: 'morse-exact' }, h('span', { class: 'small muted' }, 'Exact symbols'), h('pre', { role: 'region', tabindex: 0, 'aria-label': 'Exact Morse text preview' }, raw.slice(0, 4096))) : null,
    raw.length > 4096 ? note('Preview limited to 4,096 characters; the full input and exported result are retained.') : null,
    details(api, 'Letter and word separators', note('Next letter adds one ASCII space. Next word adds a slash separator. Delete removes the last input character. Selecting a group inspects without editing or executing.'),
      note('This is explicit symbol composition. It does not infer key timing or analyze sound.')));

}

const instruments = { scytale, cardan, semaphore, pigpen, braille, morse };
export function mountInstrument(host, api) {
  host.classList.add('symbol-instrument', `symbol-${api.kind}`);
  instruments[api.kind](host, api);
}

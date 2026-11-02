import { h, button as domButton, download, copyText } from '../dom.mjs';

const button = (label, action, attrs = {}) => domButton(label, action, { id: typeof label === 'string' ? `media-action-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined, ...attrs });
const HEX = value => value === null || value === undefined ? '––' : Number(value).toString(16).padStart(2, '0').toUpperCase();
const bytes = value => value instanceof Uint8Array ? value : value?.base64 !== undefined ? Uint8Array.from(atob(value.base64), c => c.charCodeAt(0)) : null;
const base64 = value => btoa(Array.from(value, v => String.fromCharCode(v)).join(''));
const channels = { gray: ['gray'], gray_alpha: ['gray', 'alpha'], rgb: ['red', 'green', 'blue'], rgba: ['red', 'green', 'blue', 'alpha'], indexed: ['index'] };
const text = (label, value, change, attrs = {}) => h('label', { class: 'media-field' }, label, h('input', { id: `media-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, value, onChange: e => change(e.target.value), ...attrs }));
const number = (label, value, change, attrs = {}) => text(label, value, change, { type: 'number', ...attrs });
const select = (label, value, options, change) => {
  const id = `media-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const current = value ?? '';
  const pending = !options.includes(current) ? h('option', { value: current, selected: true }, current === '' ? 'Choose an option' : `${current} (unavailable for these samples)`) : null;
  return h('div', { class: 'media-field' }, h('label', { for: id }, label), h('select', { id, value: current, onChange: e => change(e.target.value) }, pending, options.map(option => h('option', { value: option, selected: option === current }, option))));
};
const note = message => h('p', { class: 'small muted' }, message);
const table = (labels, rows, label) => h('div', { class: 'media-scroll', role: 'region', tabindex: 0, 'aria-label': label }, h('table', { class: 'media-table' }, h('thead', {}, h('tr', {}, labels.map(title => h('th', { scope: 'col' }, title)))), h('tbody', {}, rows)));
const row = cells => h('tr', {}, cells.map(cell => h('td', {}, cell)));

/** Cache identity is exact data plus application revision, never file size alone. */
export function sourceKey(input, revision = 0) {
  return `${revision}:${input.type}:${input.data instanceof Uint8Array ? base64(input.data) : typeof input.data === 'string' ? input.data : JSON.stringify(input.data)}`;
}
export function viewportRows(rows, start = 0, count = 24) { return rows.slice(Math.max(0, start), Math.max(0, start) + count); }
export function pngSegments(report) {
  return [{ label: 'Signature', offset: 0, length: 8 }, ...(report?.chunks ?? []).map((chunk, index) => ({ label: chunk.kind, offset: chunk.offset, length: chunk.length + 12, index })), ...(report?.boundary?.trailing_bytes ? [{ label: 'Trailing bytes', offset: report.boundary.trailing_offset, length: report.boundary.trailing_bytes }] : [])];
}
/** Unpack the engine's MSB-first result for drawing. This never reads source bits. */
export function planeSamples(packed, validBits) {
  const data = bytes(packed);
  if (!data || !Number.isSafeInteger(validBits) || validBits < 0 || validBits > data.length * 8) throw new Error('The packed plane does not contain its declared valid bits.');
  return Uint8Array.from({ length: validBits }, (_, i) => ((data[i >> 3] >> (7 - (i % 8))) & 1) * 255);
}
/** Display conversion only. Analysis and sampling always use original Core values. */
export function imageForDrawing(image) {
  const data = bytes(image.samples);
  const count = image.width * image.height;
  const names = channels[image.color_model];
  if (!names || !data || !Number.isSafeInteger(count) || count < 1 || count > 1048576 || data.length !== count * names.length) throw new Error('Image sample count does not match its dimensions and color model.');
  const rgba = new Uint8ClampedArray(count * 4);
  const transparency = bytes(image.transparency) ?? [];
  for (let i = 0; i < count; i++) {
    const offset = i * names.length;
    let color;
    if (image.color_model === 'indexed') {
      const value = image.palette[data[i]];
      color = Array.isArray(value) ? [...value.slice(0, 3), transparency[data[i]] ?? 255] : [data[i], data[i], data[i], 255];
    } else if (names[0] === 'gray') color = [data[offset], data[offset], data[offset], names.length === 2 ? data[offset + 1] : 255];
    else color = [data[offset], data[offset + 1], data[offset + 2], names.length === 4 ? data[offset + 3] : 255];
    rgba.set(color, i * 4);
  }
  return rgba;
}
function sourceImage(api) {
  const source = api.input();
  if (source.type === 'bytes') return null;
  const value = source.type === 'text' ? JSON.parse(source.data) : source.data;
  if (!value?.width || !value?.height || !value?.samples) return null;
  return value;
}
function rawResult(api) { return api.result?.() ?? {}; }
function ownParameters(api, names) {
  return Object.fromEntries(names.filter(name => api.param(name) !== undefined && api.param(name) !== '' && api.param(name) !== null).map(name => {
    const value = api.param(name);
    if (typeof value === 'string' && ['region', 'channels', 'colors'].includes(name)) return [name, JSON.parse(value)];
    if (typeof value === 'string' && ['max_colors', 'max_outputs', 'bit', 'x', 'y'].includes(name)) return [name, Number(value)];
    return [name, value];
  }));
}
const CACHE_FIELDS = ['pixel', 'thumbnails', 'mask', 'layer', 'histogram', 'exports', 'pngRows', 'pngRange', 'originalBytes', 'leftRows', 'rightRows', 'comparison', 'wave', 'waveform', 'pcm', 'spectrum', 'spectrogram', 'analysisConfiguration', 'maskSelection', 'exportSelection', 'evidence', 'key', 'thumbnailsKey'];
export function auxiliaryBytes(value, seen = new Set()) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'string') return 24 + new TextEncoder().encode(value).byteLength;
  if (typeof value !== 'object') return 8;
  if (value instanceof Uint8Array) return 24 + value.byteLength;
  if (seen.has(value)) return 0;
  seen.add(value);
  return Object.entries(value).reduce((sum, [key, item]) => sum + 24 + key.length * 2 + auxiliaryBytes(item, seen), 24);
}
function releaseCache(state) {
  for (const name of CACHE_FIELDS) delete state[name];
  state.request = (state.request ?? 0) + 1;
  state.busy = false;
}
function cache(api) {
  const state = api.ui.media ??= {};
  const inputKey = sourceKey(api.input());
  if (state.inputKey !== undefined && state.inputKey !== inputKey) releaseCache(state);
  state.inputKey = inputKey;
  return state;
}
/** Shell calls this only on leaving this tool, never on a presentation redraw. */
export function disposeInstrument(api) {
  const state = api.ui.media;
  if (!state) return;
  releaseCache(state);
  delete state.inputKey;
  delete state.rightRead;
  state.rightReading = false;
}

function currentKey(api) { return sourceKey(api.input(), api.revision?.() ?? 0); }
function evidenceLabel(api, state, names, selectionChanged = false) {
  const earlier = names.some(name => state[name] !== undefined && state.evidence?.[name]?.key !== undefined && state.evidence[name].key !== currentKey(api));
  return earlier || selectionChanged ? h('p', { class: 'warning', role: 'status' }, 'These analysis views belong to earlier input, settings or color selection. Analyze again to refresh them.') : null;
}
function producingView(api, primary, auxiliary) { return !api.stale() && primary !== undefined ? primary : auxiliary ?? primary; }

function asyncAction(api, name, work, attributes = {}) {
  const state = cache(api);
  return button(name, async () => {
    const key = currentKey(api);
    const request = state.request = (state.request ?? 0) + 1;
    state.busy = true; state.error = ''; api.refresh();
    try {
      const value = await work();
      if (state.request !== request || key !== currentKey(api)) return;
      const evidence = { ...state.evidence };
      for (const name of Object.keys(value)) if (CACHE_FIELDS.includes(name)) evidence[name] = { key };
      if (auxiliaryBytes({ ...state, ...value, evidence }) > 4 * 1024 * 1024) throw new Error('These auxiliary views exceed the 4-MiB retained-data budget. Select fewer frames or a smaller image region, then retry.');
      Object.assign(state, value, { evidence });
    } catch (error) { if (state.request === request && key === currentKey(api)) state.error = error.message; }
    finally { if (state.request === request) { state.busy = false; api.refresh(); } }
  }, { ...attributes, disabled: state.busy || Boolean(attributes.disabled) });
}
function status(api) {
  const state = cache(api);
  return h('div', {}, state.busy ? h('p', { role: 'status' }, 'Computing these views in the local Core worker…') : null, state.error ? h('p', { class: 'error', role: 'alert' }, state.error) : null);
}
function decodeControl(api) {
  if (api.input().type !== 'bytes') return null;
  return h('div', {}, note('The selected file is preserved as exact encoded bytes. Decode it with Core to edit image samples.'), asyncAction(api, 'Decode file to exact samples', async () => {
    await api.convertInput('image.decode');
    return {};
  }));
}
function imageCoordinates(api, image) {
  const state = cache(api);
  state.x ??= 0; state.y ??= 0;
  return h('div', { class: 'toolbar media-coordinates' }, number('Pixel x', state.x, v => { state.x = Number(v); api.refresh(); }, { min: 0, max: image.width - 1 }), number('Pixel y', state.y, v => { state.y = Number(v); api.refresh(); }, { min: 0, max: image.height - 1 }),
    asyncAction(api, 'Inspect exact pixel', async () => {
      const x = state.x, y = state.y;
      const result = await api.execute('image.pixels.read', { input: image }, { x, y, expand_palette: Boolean(api.param('expand_palette')) });
      return { pixel: { x, y, values: bytes(result.output), key: currentKey(api) } };
    }), state.pixel ? note(`Read (${state.pixel.x}, ${state.pixel.y}): ${Array.from(state.pixel.values ?? []).map(HEX).join(' ')}${state.pixel.key !== currentKey(api) ? ' · previous input/settings' : ''}`) : null);
}
function imageSurface(api, image, title, { plane = false, point = true, origin = { x: 0, y: 0 } } = {}) {
  if (!image) return h('section', { class: 'media-image-panel' }, h('h3', {}, title), note('Run the operation to inspect this output.'));
  const state = cache(api);
  const width = Math.min(2048, image.width), height = Math.min(2048, image.height);
  const canvas = h('canvas', { width, height, class: 'media-raster', role: 'img', 'aria-label': `${title}: ${image.width} by ${image.height} pixels. Use the pixel coordinate controls for exact inspection.` });
  const cssWidth = Math.min(32768, image.width * (state.zoom ?? 24));
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssWidth / image.width * image.height}px`;
  canvas.style.maxWidth = 'none';
  try {
    const original = imageForDrawing(image);
    let drawing = original;
    if (width !== image.width || height !== image.height) {
      drawing = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const offset = (Math.floor(y / height * image.height) * image.width + Math.floor(x / width * image.width)) * 4; drawing.set(original.subarray(offset, offset + 4), (y * width + x) * 4); }
    }
    const ctx = canvas.getContext('2d');
    ctx.putImageData(new ImageData(drawing, width, height), 0, 0);
  } catch (error) { return h('section', {}, h('h3', {}, title), h('p', { class: 'warning' }, error.message)); }
  const frame = h('span', { class: 'media-raster-frame', style: `width:${cssWidth}px;height:${cssWidth / image.width * image.height}px` }, canvas);
  if (state.x >= origin.x && state.x < origin.x + image.width && state.y >= origin.y && state.y < origin.y + image.height) frame.append(h('span', { class: 'media-pixel-marker', 'aria-hidden': true, style: `left:${(state.x-origin.x)/image.width*100}%;top:${(state.y-origin.y)/image.height*100}%;width:${100/image.width}%;height:${100/image.height}%` }));
  const scroll = h('div', { class: 'media-image-scroll', 'data-instrument-scroll': plane ? 'image-plane' : `image-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, tabindex: 0, role: 'region', 'aria-label': `${title} image viewport`, onScroll: e => {
    const source = e.target;
    const x = source.scrollLeft, y = source.scrollTop;
    for (const peer of source.closest('.instrument')?.querySelectorAll('.media-image-scroll') ?? []) { if (peer !== source && (peer.scrollLeft !== x || peer.scrollTop !== y)) { peer.scrollLeft = x; peer.scrollTop = y; } }
  } }, frame);
  if (point) canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    state.x = origin.x + Math.min(image.width - 1, Math.floor((e.clientX - rect.left) / rect.width * image.width));
    state.y = origin.y + Math.min(image.height - 1, Math.floor((e.clientY - rect.top) / rect.height * image.height));
    api.refresh();
  });
  const full = image.width * image.height;
  return h('section', { class: 'media-image-panel' }, h('h3', {}, title), scroll, note(`${image.width} × ${image.height} · ${image.color_model}${plane ? ' · raw 0/1 displayed as 0/255' : ' · original sample values'}${width !== image.width || height !== image.height ? ' · reduced only for drawing; exact samples retained' : ''}`),
    h('details', {}, h('summary', {}, 'Accessible sample values'), h('pre', { tabindex: 0 }, `${JSON.stringify(image).slice(0, 8192)}${full > 1024 ? '\nPreview limited to 8,192 characters. Export retains the complete image.' : ''}`)));
}
function imageZoom(api) {
  const state = cache(api);
  return number('Synchronized zoom (CSS pixels per sample)', state.zoom ?? 24, value => { state.zoom = Math.max(1, Math.min(64, Number(value))); api.refresh(); }, { min: 1, max: 64 });
}
function planeImage(result) {
  if (!result?.output?.pixels || !result.data) return null;
  const { width, height } = result.output.pixels.region;
  return { width, height, color_model: 'gray', samples: { base64: base64(planeSamples(result.data, result.output.valid_bits)) }, palette: [], transparency: { base64: '' } };
}
/** Inspect an already-returned packed plane; coordinates use the Core region. */
export function inspectedPlaneBit(result, x, y) {
  const region = result?.output?.pixels?.region;
  if (!region || x < region.x || y < region.y || x >= region.x + region.width || y >= region.y + region.height) return null;
  const index = (y - region.y) * region.width + x - region.x;
  const packed = bytes(result.data);
  if (!packed || index >= result.output.valid_bits || index >= packed.length * 8) return null;
  return (packed[index >> 3] >> (7 - (index % 8))) & 1;
}
function bitPlane(host, api) {
  const state = cache(api);
  let source;
  try { source = sourceImage(api); } catch { /* Exact source text remains editable in Parameters. */ }
  const result = rawResult(api);
  const channelOptions = source ? channels[source.color_model === 'indexed' && api.param('expand_palette') ? 'rgba' : source.color_model] ?? [] : ['red', 'green', 'blue', 'alpha', 'gray', 'index'];
  const selectedChannel = api.param('channel') ?? '';
  const controls = h('div', { class: 'toolbar' }, select('Channel', selectedChannel, channelOptions, value => { api.setParam('channel', value); api.refresh(); }),
    h('div', { class: 'media-bits', role: 'group', 'aria-label': 'Bit plane' }, Array.from({ length: 8 }, (_, bit) => button(String(bit), () => { api.setParam('bit', bit); api.refresh(); }, { id: `media-bit-${bit}`, 'aria-pressed': String(Number(api.param('bit')) === bit), 'aria-label': `Bit ${bit}${bit === 0 ? ', least significant' : ''}` }))), imageZoom(api));
  let output;
  try { output = planeImage(result); } catch (error) { state.error = error.message; }
  const thumbnailControls = source ? asyncAction(api, 'Load selected plane thumbnail', async () => {
    const bit = Number(api.param('bit') ?? 0);
    const params = { ...ownParameters(api, ['region', 'expand_palette']), bit, channel: selectedChannel };
    const value = await api.execute('image.bit_plane.extract', { input: source }, params);
    const thumbnailKey = sourceKey(api.input()) + JSON.stringify({ ...params, bit: undefined });
    const next = state.thumbnailsKey === thumbnailKey ? state.thumbnails ?? {} : {};
    return { thumbnails: { ...next, [bit]: value }, thumbnailsKey: thumbnailKey };
  }) : null;
  host.replaceChildren(h('div', { class: 'media-workspace' }, controls, decodeControl(api),
    source ? h('div', { class: 'media-image-pair' }, imageSurface(api, source, 'Original samples'), imageSurface(api, output, `Plane ${result.output?.bit ?? api.param('bit') ?? '—'}${api.stale() ? ' · previous settings' : ''}`, { plane: true, origin: result.output?.pixels?.region ?? { x: 0, y: 0 } })) : note('Load an image-samples example, enter exact sample JSON, or open a file and decode it with Core.'),
    source ? imageCoordinates(api, source) : null,
    inspectedPlaneBit(result, state.x ?? 0, state.y ?? 0) !== null ? note(`Plane inspection (${state.x ?? 0}, ${state.y ?? 0}): bit ${result.output.bit} = ${inspectedPlaneBit(result, state.x ?? 0, state.y ?? 0)} (raw); display ${inspectedPlaneBit(result, state.x ?? 0, state.y ?? 0) * 255}${api.stale() ? ' · previous settings' : ''}.`) : null,
    result.output ? note(`Row-major, MSB-first packed output · ${result.output.valid_bits} valid bits · region ${JSON.stringify(result.output.pixels.region)}. Padding bits are excluded from inspection.`) : null,
    h('section', { class: 'media-thumbnail-section' }, h('h3', {}, 'Plane thumbnails'), note('Loaded only on request; at most eight planes are retained. Changing input or settings labels earlier previews.'), thumbnailControls,
      state.thumbnails ? h('div', { class: 'media-thumbnails' }, Object.entries(state.thumbnails).map(([bit, value]) => button(h('span', {}, `Bit ${bit}`, h('span', { class: 'media-mini-bits' }, Array.from(planeSamples(value.data, Math.min(value.output.valid_bits, 64)), v => h('i', { style: `background:${v ? '#fff' : '#142033'}` })))), () => { api.setParam('bit', Number(bit)); api.refresh(); }, { 'aria-label': `Select bit ${bit}`, 'aria-pressed': String(Number(api.param('bit')) === Number(bit)) }))) : null),
    status(api)));
}
function arrayParameter(api, name, fallback) {
  const value = api.param(name);
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) { try { return JSON.parse(value); } catch { return fallback; } }
  return fallback;
}
function colorSelection(api) {
  const canonical = Object.hasOwn(api.action.contract.parameters.properties ?? {}, 'colors');
  return arrayParameter(api, 'colors', canonical ? [] : cache(api).selectedColors ?? []);
}
function exportFilterOmitted(api) {
  const colors = api.param('colors');
  return api.action.id === 'image.colors.export' && (colors === undefined || colors === null || colors === '');
}
function colorConfiguration(api, exportImage = false) {
  return { ...(exportImage && exportFilterOmitted(api) ? {} : { colors: colorSelection(api) }), expand_palette: Boolean(api.param('expand_palette')), ...(exportImage ? { representation: api.param('representation') ?? 'mask' } : {}) };
}
function sameColorConfiguration(before, after) { return JSON.stringify(before) === JSON.stringify(after); }

function changeColors(api, selected) {
  cache(api).selectedColors = selected;
  if (api.action.contract.parameters.properties.colors) api.setParam('colors', selected);
  api.refresh();
}
function colorPalette(api, histogram) {
  const selected = colorSelection(api);
  return h('section', {}, h('h3', {}, 'Exact palette'), histogram ? h('div', { class: 'media-palette' }, histogram.colors.map(color => {
    const hex = color.values.map(HEX).join('');
    const active = selected.includes(hex) || selected.includes(hex.toLowerCase());
    return button(h('span', {}, h('span', { class: 'media-swatch', style: `background:${color.values.length >= 3 ? `#${hex.slice(0, 6)}` : `rgb(${color.values[0]} ${color.values[0]} ${color.values[0]})`}`, 'aria-hidden': true }), h('strong', {}, hex), h('span', {}, ` ${color.count} pixels`)), () => changeColors(api, active ? selected.filter(v => v.toLowerCase() !== hex.toLowerCase()) : [...selected, hex]), { id: `media-color-${hex}`, 'aria-pressed': String(active), 'aria-label': `${hex}, ${color.count} pixels${active ? ', selected' : ''}` });
  })) : note('Run Histogram or Analyze palette to count exact native tuples.'));
}
function colorOutputs(api, exports) {
  if (!exports?.images) return null;
  return h('section', {}, h('h3', {}, 'PNG exports from Core'), exports.output.outputs.map((item, i) => button(`Download ${item.name} · ${item.selected_pixels} pixels`, () => download(bytes(exports.images[i]), item.name, 'image/png'))));
}
function colors(host, api) {
  const state = cache(api);
  let source;
  try { source = sourceImage(api); } catch { /* Canonical text remains editable. */ }
  const result = rawResult(api);
  const histogram = producingView(api, result.output?.colors ? result.output : undefined, state.histogram);
  const mask = producingView(api, result.output?.representation === 'mask' ? result : undefined, state.mask);
  const layer = producingView(api, result.output?.representation === 'layer' ? result : undefined, state.layer);
  const exports = producingView(api, result.images ? result : undefined, state.exports);
  const colorChanged = state.maskSelection && !sameColorConfiguration(state.maskSelection, colorConfiguration(api)) || state.exportSelection && !sameColorConfiguration(state.exportSelection, colorConfiguration(api, true));
  const sourceControls = source ? h('div', { class: 'toolbar' }, asyncAction(api, 'Analyze palette', async () => ({ histogram: (await api.execute('image.histogram', { input: source }, { ...ownParameters(api, ['region', 'channels', 'expand_palette', 'max_colors']) })).output })),
    asyncAction(api, 'Build mask and transparent layer', async () => {
      const parameters = colorConfiguration(api);
      const mask = await api.execute('image.colors.extract', { input: source }, { ...parameters, representation: 'mask' });
      const layer = await api.execute('image.colors.extract', { input: source }, { ...parameters, representation: 'layer' });
      if (!sameColorConfiguration(parameters, colorConfiguration(api))) throw new Error('The selected colors changed during this analysis. Its earlier output was not applied.');
      return { mask, layer, maskSelection: parameters };
    }), asyncAction(api, 'Prepare selected PNG exports', async () => {
      const parameters = colorConfiguration(api, true);
      const exports = await api.execute('image.colors.export', { input: source }, { ...parameters, max_colors: 64, max_outputs: 64 });
      if (!sameColorConfiguration(parameters, colorConfiguration(api, true))) throw new Error('The selected colors changed while preparing exports. Its earlier output was not applied.');
      return { exports, exportSelection: parameters };
    }), imageZoom(api)) : null;
  const sample = state.pixel?.key === currentKey(api) ? state.pixel.values : null;
  host.replaceChildren(h('div', { class: 'media-workspace' }, decodeControl(api), sourceControls, evidenceLabel(api, state, ['histogram', 'mask', 'layer', 'exports'], colorChanged), colorPalette(api, histogram),
    source ? h('div', { class: 'media-image-triple' }, imageSurface(api, source, 'Original samples'), imageSurface(api, mask?.image, 'Selection mask'), imageSurface(api, layer?.image, 'Transparent layer')) : note('Enter exact image samples or decode a selected file with Core.'),
    source ? imageCoordinates(api, source) : null,
    sample ? button(`Select sampled exact tuple ${Array.from(sample).map(HEX).join('')}`, () => changeColors(api, [Array.from(sample).map(HEX).join('')])) : null,
    note(`Selected native tuples: ${colorSelection(api).join(', ') || 'none'}. ${mask?.output ? `Retained mask: ${mask.output.selected_pixels} selected pixels.` : ''} Exact matching includes alpha when present; indexed samples remain indices unless expansion is explicit.`),
    exportFilterOmitted(api) ? note('No color filter is configured. PNG export includes all exact native colors.') : null,
    colorOutputs(api, exports), state.mask?.image ? asyncAction(api, 'Download exact mask PNG', async () => { const value = await api.execute('image.encode', { input: state.mask.image }, {}); download(bytes(value.output), 'cube-mask.png', 'image/png'); return {}; }) : null,
    state.layer?.image ? asyncAction(api, 'Download exact layer PNG', async () => { const value = await api.execute('image.encode', { input: state.layer.image }, {}); download(bytes(value.output), 'cube-layer.png', 'image/png'); return {}; }) : null, status(api)));
}
function inputBytes(api) {
  const value = api.input();
  if (value.type === 'bytes') return value.data;
  throw new Error('Open a file to retain exact source bytes. Text is not treated as encoded file data.');
}
export function bytesForEvidence(api) {
  const snapshot = api.stale() ? api.snapshot?.() : null;
  return snapshot?.input?.type === 'bytes' ? snapshot.input.data : inputBytes(api);
}
function png(host, api) {
  const state = cache(api);
  const report = rawResult(api).output;
  const chunks = report?.chunks ?? [];
  const segments = pngSegments(report);
  const selected = segments[state.segment ?? 0];
  const page = state.chunkPage ?? 0;
  const map = h('div', { class: 'media-png-map', role: 'group', 'aria-label': 'PNG byte structure' }, segments.map((segment, i) => button(h('span', {}, h('strong', {}, segment.label), ' ', h('span', {}, `${segment.offset} + ${segment.length} bytes`)), () => { state.segment = i; api.refresh(); }, { id: `media-png-segment-${segment.offset}`, 'aria-pressed': String((state.segment ?? 0) === i), style: `flex-grow:${Math.max(1, Math.log2(segment.length + 1))}`, 'aria-label': `${segment.label} ${segment.offset} + ${segment.length} bytes, zero-based offset and total size` })));
  const selectedChunk = selected?.index !== undefined ? chunks[selected.index] : null;
  const extraction = (label, offset, length, filename) => asyncAction(api, label, async () => {
    const source = bytesForEvidence(api);
    const value = await api.execute('file.range.extract', { input: source }, { offset, length });
    download(bytes(value.output), filename); return {};
  });
  host.replaceChildren(h('div', { class: 'media-workspace' }, h('div', { class: 'toolbar' },
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: Boolean(api.param('strict') ?? true), onChange: e => { api.setParam('strict', e.target.checked); api.refresh(); } }), 'Reject CRC mismatches'),
    number('Payload export budget (bytes)', api.param('payload_budget') ?? 0, value => { api.setParam('payload_budget', value); api.refresh(); }, { min: 0, max: 1048576 })),
    report ? h('div', {}, map,
      note(`Signature: ${Array.from(bytesForEvidence(api).slice(0, 8)).map(HEX).join(' ')}. CRC ${report.crc_valid ? 'matches for every chunk' : 'mismatch reported'}.`),
      table(['Chunk', 'Offset', 'Payload bytes', 'Total bytes', 'Stored CRC', 'Calculated CRC', 'CRC'], viewportRows(chunks, page * 40, 40).map((chunk, i) => row([
        button(chunk.kind, () => { state.segment = i + page * 40 + 1; api.refresh(); }, { id: `media-png-chunk-${chunk.offset}`, 'aria-pressed': String(selected?.index === i + page * 40) }), chunk.offset, chunk.length, chunk.length + 12, `0x${Number(chunk.stored_crc).toString(16).padStart(8, '0').toUpperCase()}`, `0x${Number(chunk.calculated_crc).toString(16).padStart(8, '0').toUpperCase()}`, chunk.valid ? 'Match' : 'Mismatch',
      ])), 'PNG chunk offsets, lengths and CRC values'),
      chunks.length > 40 ? h('div', { class: 'toolbar' }, button('Previous chunks', () => { state.chunkPage = Math.max(0, page - 1); api.refresh(); }, { disabled: page === 0 }), note(`Showing ${page * 40 + 1}–${Math.min(chunks.length, (page + 1) * 40)} of ${chunks.length}`), button('Next chunks', () => { state.chunkPage = page + 1; api.refresh(); }, { disabled: (page + 1) * 40 >= chunks.length })) : null,
      h('section', { class: 'media-selection' }, h('h3', {}, selected?.label ?? 'Selection'), selected ? note(`Zero-based offset ${selected.offset}; ${selected.length} total bytes${selectedChunk ? ` = 4 length + 4 type + ${selectedChunk.length} payload + 4 CRC` : ''}. Selection is inspection only.`) : null,
        selected ? h('div', { class: 'toolbar' }, asyncAction(api, 'Inspect selected bytes', async () => {
          const source = bytesForEvidence(api);
          return { pngRows: (await api.execute('file.hex.inspect', { input: source }, { offset: selected.offset, length: selected.length, width: 16 })).output, pngRange: selected };
        }), extraction('Download selected bytes', selected.offset, selected.length, `${selected.label}.bin`), selectedChunk ? extraction('Download chunk payload', selectedChunk.offset + 8, selectedChunk.length, `${selectedChunk.kind}-payload.bin`) : null) : null,
        selectedChunk ? note(selectedChunk.payload_hex === null ? 'Payload hex was not returned (payload budget is zero or exhausted). Original bytes remain available through explicit range extraction.' : `Returned payload hex: ${selectedChunk.payload_hex}`) : null,
        state.pngRows ? h('div', {}, note(`Byte inspection: ${state.pngRange.label}, offset ${state.pngRange.offset}. First 32 rows shown; download uses the complete selected range.`), hexTable(state.pngRows.slice(0, 32), null, new Map(), null, () => {})) : null),
      h('details', {}, h('summary', {}, 'Validated boundary'), h('pre', {}, JSON.stringify(report.boundary, null, 2))),
      report.boundary?.trailing_bytes ? extraction('Download trailing bytes', report.boundary.trailing_offset, report.boundary.trailing_bytes, 'png-trailing.bin') : null,
      note('Structural inspection and CRC validation do not decode pixels or establish file safety. The original bytes are preserved.')) : h('div', { class: 'empty-state' }, 'Open a PNG file or load the canonical example, then Run. The map and CRC values come from Core inspection.'), status(api)));
}
function hexTable(leftRows, rightRows, differences, selection, choose) {
  const aligned = rightRows?.length > leftRows.length ? rightRows.map((right, i) => leftRows[i] ?? { offset: right.offset, hex: '', ascii: '' }) : leftRows;
  return table(rightRows ? ['Offset', 'Left hex', 'Left ASCII', 'Right hex', 'Right ASCII'] : ['Offset', 'Hex', 'ASCII'], aligned.map((left, index) => {
    const right = rightRows?.[index];
    const values = (record, side) => {
      const cells = record?.hex.match(/.{1,2}/g) ?? [];
      return h('div', { class: 'media-hex-cells' }, cells.map((value, position) => {
        const offset = Number(record.offset) + position;
        const changed = differences.has(String(offset));
        const selected = selection && offset >= Number(selection.offset) && offset < Number(selection.offset) + Number(selection.length);
        return button(value.toUpperCase(), e => choose(offset, e.shiftKey, side), { id: `media-byte-${side}-${offset}`, class: `${changed ? 'media-byte-changed ' : ''}${selected ? 'media-byte-selected' : ''}`, 'aria-pressed': String(Boolean(selected)), 'aria-label': `${side} byte 0x${offset.toString(16).toUpperCase()}: ${value.toUpperCase()}${changed ? ', changed' : ''}` });
      }));
    };
    const cells = [`0x${BigInt(left.offset).toString(16).padStart(8, '0').toUpperCase()}`, values(left, 'Left'), h('code', {}, left.ascii)];
    if (rightRows) cells.push(values(right, 'Right'), h('code', {}, right?.ascii ?? ''));
    return row(cells);
  }), 'Exact hexadecimal and printable ASCII bytes by offset');
}
function rightBytes(api) {
  const snapshot = api.snapshot?.();
  if (snapshot?.namedInputs?.right instanceof Uint8Array && api.stale()) return snapshot.namedInputs.right;
  const raw = api.extra('right');
  if (!raw) return null;
  return bytes({ base64: raw });
}
async function byteRows(api, page, compare) {
  const left = bytesForEvidence(api), right = compare ? rightBytes(api) : null;
  const offset = page * 256;
  const inspect = async source => offset >= source.length ? [] : (await api.execute('file.hex.inspect', { input: source }, { offset, length: Math.min(256, source.length - offset), width: 16 })).output;
  const leftRows = await inspect(left), rightRows = right ? await inspect(right) : null;
  return { leftRows, rightRows, viewOffset: offset };
}
function hex(host, api) {
  const state = cache(api);
  const result = rawResult(api).output;
  const isCompare = api.action.id === 'file.binary.compare';
  const compare = result?.differences ? result : state.comparison;
  const differences = new Map((compare?.differences ?? []).map(item => [String(item.offset), item]));
  state.range ??= { offset: '0', length: '16' };
  state.bytePage ??= 0;
  const selectByte = (offset, extend) => {
    if (extend) {
      const anchor = state.rangeAnchor ?? Number(state.range.offset);
      state.range = { offset: String(Math.min(anchor, offset)), length: String(Math.abs(offset - anchor) + 1) };
    } else { state.rangeAnchor = offset; state.range = { offset: String(offset), length: '1' }; }
    state.selectedOffset = offset; api.refresh();
  };
  function currentBytes() {
    return bytesForEvidence(api);
  }
  const inspect = asyncAction(api, 'Load aligned byte rows', () => byteRows(api, state.bytePage, isCompare));
  const previousDifference = compare?.differences.findLast(item => Number(item.offset) < (state.selectedOffset ?? Infinity));
  const nextDifference = compare?.differences.find(item => Number(item.offset) > (state.selectedOffset ?? -1));
  const navigateDifference = (label, difference) => asyncAction(api, label, async () => {
    const offset = Number(difference.offset);
    state.bytePage = Math.floor(offset / 256);
    state.rangeAnchor = offset; state.range = { offset: String(offset), length: '1' };
    state.selectedOffset = offset; state.revealOffset = offset;
    return byteRows(api, state.bytePage, true);
  }, { disabled: !difference });
  const rows = !isCompare && Array.isArray(result) ? viewportRows(result, state.bytePage * 16, 16) : state.leftRows ?? [];
  const selectedDiff = differences.get(String(state.selectedOffset));
  const exportRange = (side, copy) => asyncAction(api, `${copy ? 'Copy hex' : 'Download bytes'} · ${side}`, async () => {
    const source = side === 'Left' ? currentBytes() : rightBytes(api);
    if (!source) throw new Error('Choose the corresponding file first.');
    const output = await api.execute('file.range.extract', { input: source }, { offset: state.range.offset, length: Number(state.range.length) });
    if (copy) { const result = await api.execute('encoding.hex.encode', { input: bytes(output.output) }, {}); await copyText(result.output); }
    else download(bytes(output.output), `cube-${side.toLowerCase()}-selection.bin`);
    return {};
  });
  host.replaceChildren(h('div', { class: 'media-workspace' },
    h('div', { class: 'toolbar' }, number('Start offset (zero-based)', api.param('offset') ?? 0, value => { if (api.action.contract.parameters.properties.offset) api.setParam('offset', value); api.refresh(); }, { min: 0 }),
      api.action.contract.parameters.properties.length ? number('Comparison / inspection length', api.param('length') ?? '', value => { api.setParam('length', value); api.refresh(); }, { min: 0 }) : null,
      api.action.contract.parameters.properties.max_results ? number('Difference listing limit', api.param('max_results') ?? 1000, value => { api.setParam('max_results', value); api.refresh(); }, { min: 1, max: 10000 }) : null),
    isCompare ? h('div', {}, h('label', { class: 'media-field' }, 'Right file (exact bytes)', h('input', { type: 'file', onChange: async e => {
      const file = e.target.files[0]; if (!file) return;
      const revision = api.revision?.();
      const token = state.rightRead = {};
      state.rightReading = true; api.pendingInputRead?.(token); api.refresh();
      try { if (file.size > 131072) throw new Error('Choose a file no larger than 128 KiB.'); const data = new Uint8Array(await file.arrayBuffer()); if (api.revision?.() !== revision || state.rightRead !== token || (api.inputReadCurrent && !api.inputReadCurrent(token))) return; api.setExtra('right', base64(data)); state.rightName = file.name; state.error = ''; api.refresh(); }
      catch (error) { if (api.revision?.() === revision && state.rightRead === token) { state.error = error.message; api.refresh(); } }
      finally { if (state.rightRead === token) { state.rightReading = false; api.pendingInputRead?.(null, token); api.refresh(); } }
    } })), state.rightReading ? h('p', { role: 'status' }, 'Reading the right file… Run will wait for the accepted selection.') : state.rightName ? note(`Right source: ${state.rightName}`) : null) : null,
    h('div', { class: 'toolbar' }, inspect, button('Previous byte page', () => { state.bytePage = Math.max(0, state.bytePage - 1); api.refresh(); }, { disabled: state.bytePage === 0 }), number('Byte page (256 bytes)', state.bytePage, value => { state.bytePage = Math.max(0, Number(value)); api.refresh(); }, { min: 0 }), button('Next byte page', () => { state.bytePage++; api.refresh(); })),
    compare ? note(`${compare.differing_bytes} differing bytes in total · listing ${compare.complete ? 'complete' : 'incomplete'} (${compare.differences.length} retained differences). Left ${compare.left_size} bytes · right ${compare.right_size} bytes. Comparison is by position.`) : null,
    rows.length ? hexTable(rows, state.rightRows, differences, state.range, selectByte) : h('div', { class: 'empty-state' }, 'Open exact bytes, run the operation, then load aligned byte rows. No textual realignment is applied.'),
    state.leftRows ? h('div', {}, note(`Loaded byte viewport starts at offset ${state.viewOffset}.`), evidenceLabel(api, state, ['leftRows', 'rightRows'])) : null,
    compare?.differences.length ? h('div', { class: 'toolbar' }, navigateDifference('Previous difference', previousDifference), navigateDifference('Next difference', nextDifference), selectedDiff ? note(`Offset 0x${BigInt(selectedDiff.offset).toString(16).toUpperCase()}: ${HEX(selectedDiff.left)} → ${HEX(selectedDiff.right)}. Missing bytes are null (––), distinct from 00.`) : null) : null,
    h('section', { class: 'media-selection' }, h('h3', {}, 'Exact byte selection'), h('div', { class: 'toolbar' }, text('Selection start', state.range.offset, value => { state.range.offset = value; api.refresh(); }), number('Selection length', state.range.length, value => { state.range.length = value; api.refresh(); }, { min: 0 })),
      note('Selected bytes use a blue outline. Changed bytes use an amber background and an underline. Shift-click extends a selection. Download/copy asks Core for the complete range, independent of this viewport.'),
      h('div', { class: 'toolbar' }, exportRange('Left'), exportRange('Left', true), isCompare ? exportRange('Right') : null, isCompare ? exportRange('Right', true) : null)), status(api)));
  if (state.revealOffset !== undefined) {
    const offset = state.revealOffset; delete state.revealOffset;
    queueMicrotask(() => { if (host.isConnected) host.querySelector(`#media-byte-Left-${offset}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); });
  }
}
/** An explicitly labelled example signal, never an analysis of user audio. */
export function syntheticWave() {
  const frames = 1024, sampleRate = 8000;
  const data = new Uint8Array(44 + frames * 2);
  const view = new DataView(data.buffer);
  for (const [offset, value] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']]) for (let i = 0; i < value.length; i++) data[offset + i] = value.charCodeAt(i);
  view.setUint32(4, data.length - 8, true); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); view.setUint32(40, frames * 2, true);
  for (let frame = 0; frame < frames; frame++) view.setInt16(44 + frame * 2, Math.round(20000 * Math.sin(2 * Math.PI * 1000 * frame / sampleRate)), true);
  return data;
}
function pcmSource(api) {
  const value = api.input();
  if (value.type === 'bytes') return null;
  try { const data = value.type === 'text' ? JSON.parse(value.data) : value.data; return data?.format && data?.data && data?.channels ? data : null; } catch { return null; }
}
function audioValue(api, name, fallback) {
  const value = api.param(name);
  if (value !== undefined && value !== null && value !== '') return value;
  return cache(api)[`audio_${name}`] ?? fallback;
}
function editAudio(api, name, value) {
  cache(api)[`audio_${name}`] = value;
  if (api.action.contract.parameters.properties[name]) api.setParam(name, value);
  api.refresh();
}
function audioPanel(title, draw, description) {
  const canvas = h('canvas', { width: 960, height: 210, class: 'media-plot', role: 'img', 'aria-label': description });
  draw(canvas);
  return h('section', { class: 'media-audio-panel' }, h('h3', {}, title), canvas);
}
function plotAxes(ctx, label) {
  ctx.clearRect(0, 0, 960, 210); ctx.fillStyle = '#f7f9fc'; ctx.fillRect(0, 0, 960, 210);
  ctx.strokeStyle = '#c8d2df'; ctx.beginPath(); ctx.moveTo(55, 12); ctx.lineTo(55, 177); ctx.lineTo(940, 177); ctx.stroke();
  // Readable axes and units are rendered as DOM labels beside the canvas.
}
function frameInteger(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  const text = String(value);
  return /^[0-9]+$/.test(text) ? BigInt(text) : null;
}
/** Exact frame identities; only bounded differences become drawing coordinates. */
export function frameFraction(frame, from, to) {
  const point = frameInteger(frame), start = frameInteger(from), end = frameInteger(to);
  if (point === null || start === null || end === null || end <= start) return -1;
  if (point < start) return -1;
  if (point > end) return 2;
  return Number(point - start) / Number(end - start);
}
export function frameAtFraction(from, to, fraction) {
  const start = frameInteger(from), end = frameInteger(to);
  if (start === null || end === null || end <= start || end - start > 1048576n) return String(from);
  const offset = Math.round(Number(end - start) * Math.max(0, Math.min(1, fraction)));
  return String(start + BigInt(offset));
}
export function frameSeconds(frame, sampleRate, places = 6) {
  const point = frameInteger(frame), rate = frameInteger(sampleRate);
  if (point === null || rate === null || rate === 0n) return '—';
  const scale = 10n ** BigInt(places);
  const rounded = (point * scale + rate / 2n) / rate;
  return `${rounded / scale}.${String(rounded % scale).padStart(places, '0')}`;
}
function frameExtent(state, report) {
  const origin = frameInteger(report.start_frame ?? 0) ?? 0n;
  const frames = frameInteger(report.frames ?? 0) ?? 0n;
  const from = String(state.timeFrom ?? origin), to = String(state.timeTo ?? origin + (frames || 1n));
  const start = frameInteger(from), end = frameInteger(to);
  return { from, to, valid: start !== null && end !== null && end > start && end - start <= 1048576n };
}
function selectedChannel(api, report) {
  return Math.max(0, report.channels.indexOf(Number(audioValue(api, 'channel', report.channels[0]))));
}
function waveformPanel(api, waveform) {
  if (!waveform) return h('section', { class: 'media-audio-panel' }, h('h3', {}, 'Waveform'), note('Analyze a WAVE source to obtain exact Core min/max envelopes.'));
  const state = cache(api);
  const { from, to, valid } = frameExtent(state, waveform);
  if (!valid) return h('section', { class: 'media-audio-panel' }, h('h3', {}, 'Waveform'), note('Set a valid whole-frame time viewport to inspect the retained waveform.'));
  const channel = selectedChannel(api, waveform);
  const maximum = 2 ** (waveform.bits_per_sample - 1);
  const panel = audioPanel('Waveform · integer sample amplitude', canvas => {
    const ctx = canvas.getContext('2d'); plotAxes(ctx, `Time (s), frames ${from}–${to}`);
    ctx.strokeStyle = '#005fcc';
    for (const bucket of waveform.buckets) {
      const position = frameFraction(bucket.start_frame, from, to);
      if (position < 0 || position > 1) continue;
      const x = 55 + position * 885;
      ctx.beginPath(); ctx.moveTo(x, 94 - bucket.maximum[channel] / maximum * 78); ctx.lineTo(x, 94 - bucket.minimum[channel] / maximum * 78); ctx.stroke();
    }
    const cursor = state.cursor ?? from;
    ctx.strokeStyle = '#142033'; ctx.setLineDash([4, 4]); ctx.beginPath(); const x = 55 + frameFraction(cursor, from, to) * 885; ctx.moveTo(x, 12); ctx.lineTo(x, 177); ctx.stroke(); ctx.setLineDash([]);

  }, `Waveform envelope, channel ${waveform.channels[channel]}. Integer amplitude; ${waveform.buckets.length} buckets. Exact values are in the table.`);
  panel.querySelector('canvas').addEventListener('click', e => {
    const rect = e.target.getBoundingClientRect(); state.cursor = frameAtFraction(from, to, ((e.clientX - rect.left) / rect.width * 960 - 55) / 885); api.refresh();
  });
  panel.append(h('div', { class: 'media-axis-scale', role: 'group', 'aria-label': 'Waveform time axis' }, h('span', {}, `${frameSeconds(from, waveform.sample_rate, 4)} s`), h('span', {}, `${frameSeconds(to, waveform.sample_rate, 4)} s`)), note(`Time in seconds · signed ${waveform.bits_per_sample}-bit amplitude range −${maximum} to ${maximum - 1}.`), h('details', {}, h('summary', {}, 'Envelope values (first 80 buckets)'), table(['Start frame', 'Frames', 'Minimum', 'Maximum'], waveform.buckets.slice(0, 80).map(bucket => row([bucket.start_frame, bucket.frames, bucket.minimum.join(', '), bucket.maximum.join(', ')])), 'Exact waveform envelope values')));
  return panel;
}
function spectrumPanel(api, spectrum) {
  if (!spectrum) return h('section', { class: 'media-audio-panel' }, h('h3', {}, 'Spectrum'), note('Analyze an exact power-of-two PCM window.'));
  const state = cache(api);
  const channel = selectedChannel(api, spectrum);
  const values = spectrum.amplitudes[channel] ?? [];
  const panel = audioPanel('Spectrum · one-sided peak / full scale', canvas => {
    const ctx = canvas.getContext('2d'); plotAxes(ctx, 'Frequency (Hz)');
    ctx.strokeStyle = '#005fcc'; ctx.beginPath();
    for (let i = 0; i < values.length; i++) {
      const x = 55 + i / Math.max(1, values.length - 1) * 885; const y = 177 - Math.min(1, values[i]) * 160;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, `Spectrum amplitudes in ${spectrum.amplitude_units}; ${values.length} bins. Exact values are in the frequency table.`);
  panel.querySelector('canvas').addEventListener('click', e => { const rect = e.target.getBoundingClientRect(); state.frequency = Math.round(Math.max(0, Math.min(1, ((e.clientX - rect.left) / rect.width * 960 - 55) / 885)) * (values.length - 1)); api.refresh(); });
  const index = Math.max(0, Math.min(values.length - 1, state.frequency ?? 0));
  panel.append(h('div', { class: 'media-axis-scale', role: 'group', 'aria-label': 'Spectrum frequency axis' }, h('span', {}, '0 Hz'), h('span', {}, `${spectrum.sample_rate / 2} Hz`)), note(`Channel ${spectrum.channels[channel]} · Inspected bin ${index}: ${spectrum.frequencies_hz[index]} Hz · amplitude ${values[index]} (${spectrum.amplitude_units}). Window starts at frame ${spectrum.start_frame}, ${spectrum.frames} frames, ${spectrum.window}.`),
    number('Frequency bin', index, value => { state.frequency = Number(value); api.refresh(); }, { min: 0, max: values.length - 1 }), h('details', {}, h('summary', {}, 'Frequency values (first 100 bins)'), table(['Bin', 'Hz', 'Amplitude'], values.slice(0, 100).map((amplitude, i) => row([i, spectrum.frequencies_hz[i], amplitude])), 'Exact spectrum values')));
  return panel;
}
function spectrogramPanel(api, report) {
  if (!report) return h('section', { class: 'media-audio-panel' }, h('h3', {}, 'Spectrogram'), note('Analyze PCM to draw returned time/frequency amplitudes.'));
  const state = cache(api);
  const channel = selectedChannel(api, report);
  const amplitudes = report.amplitudes[channel] ?? [];
  const source = { start_frame: report.start_frame, frames: report.frames };
  const { from, to, valid } = frameExtent(state, source);
  if (!valid) return h('section', { class: 'media-audio-panel' }, h('h3', {}, 'Spectrogram'), note('Set a valid whole-frame time viewport to inspect the retained spectrogram.'));
  const panel = audioPanel('Spectrogram · linear peak amplitude', canvas => {
    const ctx = canvas.getContext('2d'); plotAxes(ctx, 'Time (s) · frequency (Hz)');
    for (let window = 0; window < amplitudes.length; window++) {
      const position = frameFraction(report.frame_starts[window], from, to);
      if (position < 0 || position > 1) continue;
      const x = 55 + position * 885;
      const width = Math.max(1, report.hop_size / Number(BigInt(to) - BigInt(from)) * 885);
      const frequencies = amplitudes[window];
      const step = Math.max(1, Math.ceil(frequencies.length / 160));
      for (let bin = 0; bin < frequencies.length; bin += step) {
        const strength = Math.max(0, Math.min(1, frequencies[bin]));
        ctx.fillStyle = `rgb(${Math.round(239 - strength * 230)},${Math.round(245 - strength * 150)},${Math.round(255 - strength * 60)})`;
        ctx.fillRect(x, 177 - bin / frequencies.length * 160, width, Math.max(1, step / frequencies.length * 160));
      }
    }
    const x = 55 + frameFraction(state.cursor ?? from, from, to) * 885;
    ctx.strokeStyle = '#142033'; ctx.beginPath(); ctx.moveTo(x, 12); ctx.lineTo(x, 177); ctx.stroke();

  }, `Spectrogram, ${amplitudes.length} windows, ${report.frequencies_hz.length} frequencies. Linear ${report.amplitude_units}; drawing may reduce frequency rows. Full numeric output is retained.`);
  panel.querySelector('canvas').addEventListener('click', e => { const rect = e.target.getBoundingClientRect(); state.cursor = frameAtFraction(from, to, ((e.clientX - rect.left) / rect.width * 960 - 55) / 885); api.refresh(); });
  const cursor = frameInteger(state.cursor ?? from) ?? BigInt(from);
  const window = Math.max(0, report.frame_starts.findLastIndex(frame => (frameInteger(frame) ?? 0n) <= cursor));
  panel.append(h('div', { class: 'media-axis-scale', role: 'group', 'aria-label': 'Spectrogram time axis' }, h('span', {}, `${frameSeconds(from, report.sample_rate, 4)} s`), h('span', {}, `${frameSeconds(to, report.sample_rate, 4)} s`)), note(`Channel ${report.channels[channel]} · Frequency: 0–${report.sample_rate / 2} Hz; linear peak/full-scale amplitude.`), note(`Inspected window ${window}, frame ${report.frame_starts[window] ?? '—'} · ${report.times_seconds[window] ?? '—'} s · valid frames ${report.valid_frames[window] ?? '—'} · dropped tail ${report.dropped_frames}.`), h('details', {}, h('summary', {}, 'Inspected window values (first 100 bins)'), table(['Hz', 'Amplitude'], (amplitudes[window] ?? []).slice(0, 100).map((value, i) => row([report.frequencies_hz[i], value])), 'Exact spectrogram window values')));
  return panel;
}
function auxiliaryExport(api, name, value) {
  return value ? button(`Export complete ${name} JSON`, () => download(JSON.stringify(value, null, 2), `cube-${name}.json`, 'application/json')) : null;
}
export function sameAnalysisConfiguration(produced, current) {
  return ['start_frame', 'frames', 'channel', 'fft_size', 'window'].every(name => produced?.[name] === current?.[name]) && JSON.stringify(produced?.channels) === JSON.stringify(current?.channels);
}
function analysisConfiguration(api, frameCount, pcm) {
  return { start_frame: String(pcm?.start_frame ?? audioValue(api, 'start_frame', 0)), frames: Number(pcm?.frames ?? audioValue(api, 'frames', frameCount)), ...(pcm ? { channels: pcm.channels } : { channel: Number(audioValue(api, 'channel', 0)) }), fft_size: Number(audioValue(api, 'fft_size', 256)), window: audioValue(api, 'window', 'hann') };
}
function audio(host, api) {
  const state = cache(api);
  const output = rawResult(api).output;
  const wave = producingView(api, output?.container === 'RIFF/WAVE' ? output : undefined, state.wave);
  const waveform = producingView(api, output?.buckets ? output : undefined, state.waveform);
  const spectrum = producingView(api, output?.window_definition ? output : undefined, state.spectrum);
  const spectrogram = producingView(api, output?.times_seconds ? output : undefined, state.spectrogram);
  const suppliedPcm = pcmSource(api);
  const frameCount = suppliedPcm?.frames ?? wave?.frames ?? 1024;
  const sampleRate = suppliedPcm?.format.sample_rate ?? wave?.format.sample_rate ?? 8000;
  const start = suppliedPcm?.start_frame ?? audioValue(api, 'start_frame', 0);
  const frames = suppliedPcm?.frames ?? audioValue(api, 'frames', frameCount);
  const fft = Number(audioValue(api, 'fft_size', 256));
  const channel = Number(audioValue(api, 'channel', suppliedPcm?.channels[0] ?? 0));
  const configuration = analysisConfiguration(api, frameCount, suppliedPcm);
  const channelControl = suppliedPcm ? select('Channel (zero-based)', String(channel), suppliedPcm.channels.map(String), value => { state.audio_channel = Number(value); api.refresh(); }) : number('Channel (zero-based)', channel, value => { editAudio(api, 'channel', Number(value)); if (api.action.contract.parameters.properties.channels) api.setParam('channels', [Number(value)]); }, { min: 0, max: 31 });
  const controls = h('div', { class: 'media-audio-controls toolbar' }, channelControl,
    text('Start frame', start, value => editAudio(api, 'start_frame', value), { inputmode: 'numeric', readOnly: Boolean(suppliedPcm) }), number('Selected frames', frames, value => editAudio(api, 'frames', value), { min: 0, max: 1048576, readOnly: Boolean(suppliedPcm) }),
    select('FFT size', String(fft), ['8', '16', '32', '64', '128', '256', '512', '1024', '2048', '4096', '8192', '16384'], value => editAudio(api, 'fft_size', Number(value))),
    select('Window', audioValue(api, 'window', 'hann'), ['rectangular', 'hann', 'hamming'], value => editAudio(api, 'window', value)));
  const analyze = asyncAction(api, 'Analyze waveform, spectrum and spectrogram', async () => {
    const selection = { start_frame: start, frames: Number(frames), channels: [channel] };
    const fftSize = Number(audioValue(api, 'fft_size', 256));
    const window = audioValue(api, 'window', 'hann');
    let pcm = pcmSource(api), waveInfo, envelope, spectrumPcm;
    if (!pcm) {
      const input = inputBytes(api);
      waveInfo = (await api.execute('audio.wave.inspect', { input }, {})).output;
      envelope = (await api.execute('audio.waveform.envelope', { input }, { ...selection, bucket_frames: Math.max(1, Math.ceil(Number(frames) / 512)), max_buckets: 1000 })).output;
      pcm = (await api.execute('audio.pcm.extract', { input }, selection)).output;
      spectrumPcm = (await api.execute('audio.pcm.extract', { input }, { ...selection, frames: fftSize })).output;
    } else {
      spectrumPcm = pcm;
      if (Number(pcm.frames) !== fftSize) throw new Error('Spectrum requires the exact selected PCM frame count to equal FFT size. Choose that FFT size, or select a WAVE source for bounded frame extraction.');
    }
    const spectrum = (await api.execute('audio.spectrum', { input: spectrumPcm }, { fft_size: fftSize, window })).output;
    const spectrogram = (await api.execute('audio.spectrogram', { input: pcm }, { fft_size: fftSize, hop_size: Math.max(1, Math.floor(fftSize / 2)), window, final_window: 'drop' })).output;
    if (!sameAnalysisConfiguration(configuration, analysisConfiguration(api, frameCount, suppliedPcm))) throw new Error('Audio analysis settings changed while this request was running. The earlier response was not applied; analyze again for the current settings.');
    return { wave: waveInfo, waveform: envelope, pcm, spectrum, spectrogram, analysisConfiguration: configuration };
  });
  const extent = frameExtent(state, waveform ?? { start_frame: start, frames });
  host.replaceChildren(h('div', { class: 'media-workspace media-audio' }, controls,
    h('div', { class: 'toolbar' }, analyze, button('Load synthetic 1 kHz WAVE example', () => { api.setInput({ type: 'bytes', data: syntheticWave() }); state.example = true; state.audio_frames = 1024; state.audio_start_frame = 0; state.audio_fft_size = 256; api.refresh(); })),
    suppliedPcm ? note('For supplied PCM, start frame, frame count and available channels come from the named input. Channel selection inspects stored results; choose a WAVE source for frame extraction.') : null,
    state.example ? note('Example: synthetic 1 kHz sine, mono signed PCM16, 8,000 Hz, 1,024 frames. This is generated example data; analysis below comes from Core.') : null,
    wave ? note(`${wave.container} · ${wave.format.sample_rate} Hz · ${wave.format.channels} channels · ${wave.format.bits_per_sample}-bit · ${wave.frames} frames · ${wave.data_bytes} original PCM bytes.`) : note('Analysis accepts WAVE PCM supported by Core. Metadata for other formats does not imply audio decoding. Browser playback is not used for numerical analysis.'),
    evidenceLabel(api, state, ['wave', 'waveform', 'pcm', 'spectrum', 'spectrogram']),
    state.analysisConfiguration && !sameAnalysisConfiguration(state.analysisConfiguration, configuration) ? h('p', { class: 'warning' }, 'The audio views belong to earlier analysis settings. Analyze again to refresh them.') : null,
    state.analysisConfiguration ? h('details', {}, h('summary', {}, 'Analysis settings used by these views'), h('pre', {}, JSON.stringify(state.analysisConfiguration, null, 2))) : null,
    h('div', { class: 'toolbar media-selection' }, text('Shared cursor (absolute frame)', state.cursor ?? start, value => { state.cursor = value; api.refresh(); }, { inputmode: 'numeric' }),
      text('Time viewport start (frame)', extent.from, value => { state.timeFrom = value; api.refresh(); }, { inputmode: 'numeric' }), text('Time viewport end (frame)', extent.to, value => { state.timeTo = value; api.refresh(); }, { inputmode: 'numeric' }), note(`Cursor ${frameSeconds(state.cursor ?? start, sampleRate, 6)} s. Viewport and cursor inspect stored results; analysis runs only on explicit request.`)),
    !extent.valid ? h('p', { class: 'error', role: 'alert' }, 'Use whole non-negative frame positions and a time viewport of 1–1,048,576 frames.') : null,
    waveformPanel(api, waveform), h('div', { class: 'media-audio-frequency' }, spectrumPanel(api, spectrum), spectrogramPanel(api, spectrogram)),
    h('div', { class: 'toolbar' }, auxiliaryExport(api, 'waveform', waveform), auxiliaryExport(api, 'spectrum', spectrum), auxiliaryExport(api, 'spectrogram', spectrogram),
      state.pcm ? button('Download exact extracted PCM bytes', () => download(bytes(state.pcm.data), 'cube-original-pcm.bin')) : null), status(api)));
}

export function mountInstrument(host, api) {
  const renderers = { 'bit-plane': bitPlane, colors, png, audio, hex };
  renderers[api.kind]?.(host, api);
}

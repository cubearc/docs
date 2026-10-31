import { sdkRoot, expectedBuild } from './runtime-config.mjs';
import { toolsFor } from './catalog.mjs';
import { snapshot } from './data.mjs';

async function metadata(path, maxBytes) {
  const response = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!response.ok || !response.body) throw new Error('The local tool metadata could not be loaded. Retry after restoring the complete site assets.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error('Tool metadata exceeds its asset budget.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export async function initializeRuntime() {
  const { createWorkerCube } = await import(new URL(`${sdkRoot}worker-client.mjs`, import.meta.url));
  const sdk = await createWorkerCube();
  try {
    for (const key of ['sourceSha256', 'wasmSha256', 'catalogSha256', 'sdkVersion']) {
      if (sdk.build[key] !== expectedBuild[key]) throw new Error('The site and local SDK assets have different versions. Reload the complete site.');
    }
    const rawCatalog = await metadata('./catalog.json', 4 * 1024 * 1024);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawCatalog.trim())));
    const hash = Array.from(digest, value => value.toString(16).padStart(2, '0')).join('');
    if (hash !== sdk.build.catalogSha256) throw new Error('The catalog does not match this runtime. Reload the complete site.');
    const catalog = JSON.parse(rawCatalog);
    const presentation = JSON.parse(await metadata('./presentation.json', 256 * 1024));
    const tools = toolsFor(catalog.operations, presentation, sdk);
    if (tools.flatMap(tool => tool.actions).length !== catalog.operations.length) throw new Error('The complete tool catalog could not be represented.');
    return new Runtime(sdk, catalog, presentation, tools);
  } catch (error) { sdk.terminate(); throw error; }
}

export class Runtime {
  #queue = Promise.resolve();
  #pending = 0;
  constructor(sdk, catalog, presentation, tools) { Object.assign(this, { sdk, catalog, presentation, tools }); }
  async toolDetails(action) {
    const detail = JSON.parse(await metadata(`./tool-details/${encodeURIComponent(action.id)}.json`, 1024 * 1024));
    if (detail.operation !== action.id || detail.operation_version !== action.contract.operation_version || detail.catalog_sha256 !== this.sdk.build.catalogSha256) throw new Error('Tool detail identity differs from the selected operation. Reload the complete site.');
    return detail;
  }
  action(id) { return this.tools.flatMap(tool => tool.actions).find(action => action.id === id); }
  request(method, args = [], options = {}) {
    if (this.#pending >= 2) return Promise.reject(new Error('A run is already pending. Stop it before starting another.'));
    this.#pending++;
    const result = this.#queue.then(() => this.sdk[method](...args, options));
    this.#queue = result.catch(() => {});
    return result.finally(() => { this.#pending--; });
  }
  call(method, args = [], options = {}) { return this.request(method, args, options).then(result => result.value); }
  async perform(action, input, parameters, { utf8 = true, signal, context, timeoutMs, extraInputs = {} } = {}) {
    input = snapshot(input);
    parameters = snapshot(parameters);
    extraInputs = snapshot(extraInputs);
    const options = { signal, context, ...(timeoutMs !== undefined ? { timeoutMs } : {}) };
    if (action.pipeline) {
      const adapter = action.pipeline;
      const steps = [];
      if (adapter.input_type !== input.type) {
        if (utf8 && input.type === 'text' && adapter.input_type === 'bytes') steps.push({ operation: 'text.utf8.encode', version: 1 });
        else throw new Error('This tool needs a different input type. Choose an explicit conversion.');
      }
      steps.push({ operation: action.id, version: adapter.version, parameters });
      const definition = { format_version: 1, engine_api: 1, input: { source: 'inline', value: input }, output: { type: adapter.output_type }, steps };
      const response = await this.request('runRecipe', [definition, {}, {}], options);
      return { outputs: { output: response.value.output }, steps, parameters, operation: action.id, version: adapter.version,
        operationVersion: action.contract.operation_version, adapterVersion: adapter.version,
        sdkRequest: { requestId: response.requestId, generation: response.generation, context: response.context } };
    }
    if (!action.direct) throw new Error(action.unavailableReason);
    const names = action.contract.inputs.map(port => port.name);
    const primary = names[0];
    if (Object.keys(extraInputs).some(name => !names.includes(name))) throw new Error('An unknown named input was supplied.');
    const inputs = {};
    const conversions = [];
    for (const name of names) {
      const value = name === primary ? input : { type: 'text', data: extraInputs[name] ?? '' };
      const representation = action.direct.inputs[name];
      if (representation === 'text' && value.type === 'text') inputs[name] = value.data;
      else if (['bytes', 'byte_array'].includes(representation)) {
        if (value.type === 'bytes') inputs[name] = value.data;
        else if (value.type === 'text' && name !== primary) {
          inputs[name] = (await this.call('execute', [{ operation: 'encoding.base64.decode', version: 1, inputs: { input: value.data } }], options)).output;
          conversions.push({ input: name, operation: 'encoding.base64.decode', version: 1 });
        } else if (value.type === 'text' && utf8) {
          inputs[name] = (await this.call('execute', [{ operation: 'text.utf8.encode', version: 1, inputs: { input: value.data } }], options)).output;
          conversions.push({ input: name, operation: 'text.utf8.encode', version: 1 });
        }
        else throw new Error('Choose exact bytes or an explicit UTF-8 input conversion.');
      } else if (['json', 'image_samples'].includes(representation)) {
        if (value.type === 'json') inputs[name] = value.data;
        else if (value.type === 'text') {
          inputs[name] = (await this.call('execute', [{ operation: 'json.parse', version: 1, inputs: { input: value.data } }], options)).output;
          conversions.push({ input: name, operation: 'json.parse', version: 1 });
        }
        else throw new Error('This named input needs explicit JSON data.');
      } else throw new Error('This tool needs another input representation. See its input controls.');
    }
    parameters = { ...snapshot(action.direct.parameters), ...parameters };
    const response = await this.request('execute', [{ operation: action.id, version: action.direct.version, inputs, parameters }], options);
    const raw = response.value;
    return {
      operation: action.id, version: action.direct.version, parameters, namedInputs: inputs, conversions,
      sdkRequest: { requestId: response.requestId, generation: response.generation, context: response.context },
      outputs: Object.fromEntries(Object.entries(raw).map(([name, value]) => [name,
        value instanceof Uint8Array ? { type: 'bytes', data: value }
          : typeof value === 'string' && action.direct.outputs[name] === 'text' ? { type: 'text', data: value } : { type: 'json', data: value },
      ])),
    };
  }
  async representations(value, options = {}) {
    if (value.type === 'text') return { Text: value.data };
    if (value.type !== 'bytes') return { JSON: JSON.stringify(value.data ?? value, null, 2) };
    const base64 = await this.call('execute', [{ operation: 'encoding.base64.encode', version: 1, inputs: { input: value.data } }], options);
    const hex = await this.call('runRecipe', [{ format_version: 1, engine_api: 1, input: { source: 'inline', value }, output: { type: 'text' }, steps: [{ operation: 'encoding.hex.encode', version: 1 }] }, {}, {}], options);
    const views = { Hex: hex.output.data, Base64: base64.output };
    try {
      const text = await this.call('execute', [{ operation: 'text.utf8.decode', version: 1, inputs: { input: value.data } }], options);
      return { 'UTF-8 text': text.output, ...views };
    } catch (error) {
      if (error.code === 'invalid_input' && error.reason === 'invalid_encoding') return views;
      throw error;
    }
  }
}

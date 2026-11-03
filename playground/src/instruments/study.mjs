import {h, button, copyText} from '../dom.mjs';
import {primaryOutputName} from './registry.mjs';

const studies = new Set(['enigma', 'keyboard', 'polybius', 'alberti', 'solitaire']);
export const isInstrumentStudy = descriptor => studies.has(descriptor?.kind);

/** Uses the already-produced, exact representation; never interprets outputs. */
export function studyOutput(descriptor, evidence) {
  const name = evidence ? primaryOutputName(descriptor, evidence) : undefined;
  const representations = evidence?.views?.[name];
  const representation = representations ? Object.keys(representations)[0] : undefined;
  const text = representations?.[representation];
  return h('section', {class:'study-output-strip', 'aria-label':'Instrument output'},
    h('div', {class:'study-output-label'}, h('strong', {}, name && !['text','output'].includes(name) ? `Output · ${name}` : 'Output'),
      h('small', {class:'study-output-status'}, evidence?.earlierInput ? 'Previous configuration' : text === undefined ? 'Run to produce a result' : representation)),
    h('pre', {id:'instrument-study-output',tabindex:0,'aria-label':'Instrument output preview'}, text?.slice(0,4096) ?? '—'),
    button('Copy', () => copyText(text), {'aria-label':'Copy instrument output',disabled:text===undefined}),
    text?.length > 4096 ? h('p', {class:'study-output-limit'}, 'Showing 4,096 characters. Copy keeps the complete output; export and named outputs are in Results.') : null);
}

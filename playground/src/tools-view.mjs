import { h, button, replace } from './dom.mjs';

/** Contextual documentation, independent of selection and execution. */
export function toolHelp(action,{runtime,loadExample}) {
  const example=h('section',{'aria-label':'Core reference example'});
  const contract=h('pre',{'aria-label':'Exact operation contract',role:'region',tabindex:0});
  const identity=h('p',{class:'small muted'});
  let loaded=false,loading=false;
  const details=h('details',{class:'tool-help'},h('summary',{},'About this tool'),
    h('p',{},action.description),
    h('p',{},h('a',{href:`../cube/reference/operations/${encodeURIComponent(action.contract.category)}/${encodeURIComponent(action.id)}.html`},'Documentation')),
    loadExample?button('Load Core example',loadExample,{id:'load-core-example'}):null,
    example,
    h('details',{},h('summary',{},'Technical details'),h('p',{},h('code',{},action.id),` · version ${action.contract.operation_version}`),
      h('p',{},action.contract.description),
      h('p',{class:'small muted'},`Inputs: ${action.contract.inputs.map(x=>x.name).join(', ')}. Outputs: ${action.contract.outputs.map(x=>x.name).join(', ')}.`),
      identity,h('div',{class:'viewer'},contract),
      h('a',{href:`./tool-details/${encodeURIComponent(action.id)}.json`,download:`${action.id}.json`},'Download contract and example'),
      h('p',{},h('a',{href:'./catalog.json',download:'cube-catalog.json'},'Download complete catalog'))));
  async function load() {
    if(loaded||loading)return;
    loading=true;replace(example,h('p',{class:'small muted',role:'status'},'Loading reference example…'));
    try {
      const data=await runtime.toolDetails(action);
      if(!details.isConnected)return;
      const values=(field,title)=>Object.entries(data.example[field]).map(([name,value])=>h('div',{},h('p',{class:'small muted'},`${title} · ${name}`),h('div',{class:'viewer'},h('pre',{'aria-label':`Example ${field==='inputs'?'input':field==='outputs'?'output':'parameter'} ${name}`,role:'region',tabindex:0},value))));
      replace(example,h('h3',{},'Example'),values('inputs','Input'),
        h('details',{},h('summary',{},'Example options'),values('parameters','Option')),values('outputs','Expected output'),
        h('p',{class:'small muted'},'Synthetic Core reference values. Load explicitly to replace your input; these are not execution results.'));
      contract.textContent=data.contract_json;identity.textContent=`Contract SHA-256: ${data.contract_sha256}`;loaded=true;
    }catch(error){if(details.isConnected)replace(example,h('p',{class:'warning',role:'alert'},error.message),button('Retry reference details',load));}
    finally{loading=false;}
  }
  details.addEventListener('toggle',()=>{if(details.open)load();});
  return details;
}

import { h, button, replace } from '../dom.mjs';
import { labelFor } from '../controls.mjs';

const note = text => h('p', {class:'small muted'},text);
const field = (id,title,control) => h('div',{class:'field'},h('label',{for:id},title),control);
const parse = value => { if(typeof value !== 'string') return value; try{return JSON.parse(value);}catch{return null;} };
const integer = (value,min,max) => { if (!['string','number'].includes(typeof value)) return null; const n=Number(value); return String(value).trim()!=='' && Number.isSafeInteger(n) && n>=min && n<=max ? n : null; };
function choice(id,value,values,change) {
  const known=values.some(option=>String(option)===String(value));
  const empty=value === undefined || value === null || value === '';
  const editorialLabels = /^(keyboard-|polybius-|book-)/.test(id) || id === 'graph-directed';
  const label = value => !editorialLabels ? String(value) : ['qwerty','qwertz','dvorak','colemak'].includes(value) ? value.toUpperCase() : labelFor(String(value));
  return h('select',{id,onChange:event=>change(event.target.value)}, !known ? h('option',{value:empty?'':String(value),selected:true},empty?'Choose…':`Unavailable: ${value}`) : null, values.map(v=>h('option',{value:v,selected:String(v)===String(value)},label(v))));
}
function patch(api,name,value) {api.setParam(name,value);api.refresh();}
function addText(api,text,separator='') {api.setText(api.text()+(api.text()?separator:'')+text);api.refresh();}
export function graphDraft(text) {
  try {
    const data=JSON.parse(text);
    if (!data || Object.keys(data).some(key=>!['vertices','edges','directed'].includes(key)) || !Array.isArray(data.vertices)||!Array.isArray(data.edges)||typeof data.directed!=='boolean') return null;
    if(data.vertices.some(v=>typeof v!=='string') || data.edges.some(e=>!e||Object.keys(e).some(key=>!['id','from','to'].includes(key))||typeof e.id!=='string'||typeof e.from!=='string'||typeof e.to!=='string')) return null;
    return data;
  }catch{return null;}
}
export function editGraphEdge(graph,from,to,id) {
  if(!graph.vertices.includes(from)||!graph.vertices.includes(to)||!id||graph.edges.some(edge=>edge.id===id)) throw new Error('Choose existing endpoints and a distinct edge ID.');
  return {...graph,edges:[...graph.edges,{id,from,to}]};
}
/** Append an explicitly chosen coordinate while preserving every existing wire
 * token, including invalid wide integers for Core to diagnose without rounding. */
export function appendCoordinate(raw,coordinate) {
  let values;
  try { values=JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(values)) return null;
  const end=raw.lastIndexOf(']');
  return raw.slice(0,end)+(values.length?', ':'')+JSON.stringify(coordinate)+raw.slice(end);
}
function customLayout(name) {
  document.getElementById('instrument-tab-parameters')?.click();
  document.getElementById(`playground-options-${name}`)?.focus();
}
function geometry(api,value) {return api.data.layouts[value] ?? parse(value);}
function keyLayout(api,layout,title,selectedKey,target=false,layoutControl=null) {
  const entries=layout?.entries;
  const header=h('div',{class:'keyboard-case-label'},h('div',{class:'keyboard-nameplate'},h('h3',{},title),layoutControl),h('span',{class:'keyboard-case-detail'},'Physical key positions'));
  if(!Array.isArray(entries)||entries.length>512) return h('section',{class:'key-layout','aria-label':title},header,h('p',{class:'warning'},'Choose a canonical layout or a valid custom definition in Parameters.'));
  const layer=api.ui.layer ?? 'base';
  const visible=entries.filter(e=>e.layer===layer);
  const rows=[...new Set(visible.map(e=>e.row ?? 0))];
  return h('section',{class:'key-layout','aria-label':title},instrumentFasteners(),header,h('div',{class:'instrument-scroll','data-instrument-scroll':target?'keyboard-destination':'keyboard-source'},h('div',{class:'keyboard-board'},rows.map(row=>h('div',{class:'keyboard-row',style:`padding-left:${row*10}px`},visible.filter(e=>(e.row??0)===row).map(entry=>button(h('span',{},h('strong',{},entry.symbol)),()=>{
    api.ui.key=entry.key;api.ui.layer=entry.layer;
    const offset=api.text().indexOf(entry.symbol);
    api.ui.textPosition=offset<0?null:Array.from(api.text().slice(0,offset)).length;
    const composer=document.getElementById('playground-input');
    if(offset>=0&&composer?.setSelectionRange)composer.setSelectionRange(offset,offset+entry.symbol.length);
    if(api.ui.keyMode==='insert'&&!target) {
      if(api.action.id==='text.keyboard.coordinates.decode') {
        const old=parse(api.text());
        if(!Array.isArray(old)){api.ui.error='Use a JSON coordinate array in the input first.';api.refresh();return;}
        const base=integer(api.param('index_base'),0,1);
        if(base===null || entry.row===undefined){api.ui.error='Set a valid coordinate origin and geometry.';api.refresh();return;}
        api.ui.error='';
        api.setText(appendCoordinate(api.text(),[entry.row+base,entry.column+base,entry.layer]));
      }else api.setText(api.text()+entry.symbol);
    }
    api.refresh();
  },{id:`keyboard-${target?'target':'source'}-${entry.layer}-${entry.key}`,class:`keycap${entry.key===selectedKey?' inspected':''}`,title:entry.key,'aria-pressed':String(entry.key===selectedKey),'aria-label':`${entry.symbol} · ${entry.key}: ${target?'Inspect target':'Inspect or insert'}, ${entry.layer}`})))))));
}
function keyboard(host,api) {
  const remap=api.action.id==='text.keyboard.remap';
  const source=geometry(api,api.param(remap?'source':'layout'));
  const target=remap?geometry(api,api.param('target')):source;
  const layer=api.ui.layer ?? 'base';
  const sourceEntry=source?.entries?.find(e=>e.key===api.ui.key&&e.layer===layer);
  const targetEntry=target?.entries?.find(e=>e.key===api.ui.key&&e.layer===layer);
  const setLayout=(name,value)=>patch(api,name,remap?value:JSON.stringify(api.data.layouts[value]));
  const selector=(name,title)=>field(`keyboard-${name}`,title,choice(`keyboard-${name}`,!api.param(name)?'':remap?api.param(name):Object.keys(api.data.layouts).find(key=>JSON.stringify(api.data.layouts[key])===JSON.stringify(parse(api.param(name))))??'custom',['custom',...Object.keys(api.data.layouts)],value=>{if(value==='custom')customLayout(name);else setLayout(name,value);}));
  const result=api.result();
  const sourceSymbols=Array.from(api.text());
  const textSelection=h('div',{class:'keyboard-text-inspection'},h('h3',{},'Source text positions'),note(`First ${Math.min(64,sourceSymbols.length)} of ${sourceSymbols.length} scalars. Select a position to inspect its key; the complete text remains in the input.`),h('div',{class:'keyboard-text-strip'},sourceSymbols.slice(0,64).map((symbol,index)=>button(symbol===' '?'␠':symbol,()=>{const key=source?.entries?.find(e=>e.symbol===symbol);api.ui.textPosition=index;if(key){api.ui.key=key.key;api.ui.layer=key.layer;}api.refresh();},{id:`keyboard-text-${index}`,'aria-label':`${symbol===' '?'␠':symbol}, source scalar ${index}`,'aria-pressed':String(api.ui.textPosition===index),class:api.ui.textPosition===index?'inspected':''}))));
  const positions=result.positions ?? [];
  const cursor=integer(api.ui.position ?? 0,0,Math.max(0,positions.length-1)) ?? 0;
  const controls=h('div',{class:'toolbar keyboard-touch-controls'},
    field('keyboard-layer','Layer',choice('keyboard-layer',layer,[...new Set(source?.entries?.map(e=>e.layer)??['base','shift'])],value=>{api.ui.layer=value;api.refresh();})),
    field('keyboard-mode','Key action',choice('keyboard-mode',api.ui.keyMode??'inspect',['inspect','insert'],value=>{api.ui.keyMode=value;api.refresh();})));
  const correspondence=h('div',{id:'keyboard-correspondence',class:'keyboard-correspondence','aria-label':'Selected physical key correspondence'},
    h('div',{class:'keyboard-correspondence-glyphs'},h('strong',{id:'keyboard-correspondence-source'},sourceEntry?.symbol??'—'),remap?[h('span',{'aria-hidden':'true'},'→'),h('strong',{id:'keyboard-correspondence-target'},targetEntry?.symbol??'—')]:null),
    h('span',{},sourceEntry?`Physical key ${sourceEntry.key} · ${layer}`:'Select a key to inspect its position'));
  replace(host,controls,
    !remap? h('div',{class:'toolbar'},api.action.id.includes('coordinates')?field('keyboard-origin','Index origin',choice('keyboard-origin',api.param('index_base'),[0,1],v=>patch(api,'index_base',v))):[
      field('keyboard-dx','Horizontal displacement',h('input',{id:'keyboard-dx',value:api.param('dx')??'',onChange:e=>patch(api,'dx',e.target.value)})),
      field('keyboard-dy','Vertical displacement',h('input',{id:'keyboard-dy',value:api.param('dy')??'',onChange:e=>patch(api,'dy',e.target.value)})),
      field('keyboard-edge','Edge policy',choice('keyboard-edge',api.param('edge'),['reject','wrap'],v=>patch(api,'edge',v))) ]):null,
    h('div',{class:'keyboard-pair'},keyLayout(api,source,'Source',api.ui.key,false,selector(remap?'source':'layout',remap?'Source layout':'Layout')),correspondence,remap?keyLayout(api,target,'Destination',api.ui.key,true,selector('target','Target layout')):null),
    textSelection,
    h('p',{class:'selection-caption'},sourceEntry?`Selected physical key ${sourceEntry.key}: ${sourceEntry.symbol}${targetEntry?` → ${targetEntry.symbol}`:''}. Layer ${layer}.`:'Inspect a key, or choose Insert to compose input.'),
    note('QWERTZ uses the canonical Y/Z swap on US ANSI geometry. Physical typing is handled only by the focused input field.'),
    api.ui.error?h('p',{class:'warning'},api.ui.error):null,
    positions.length?h('section',{},field('keyboard-position','Recorded text position',h('input',{id:'keyboard-position',type:'range',min:0,max:positions.length-1,value:cursor,onInput:e=>{api.ui.position=Number(e.target.value);const c=result.source_coordinates?.[api.ui.position]??result.coordinates?.[api.ui.position];if(c&&!api.stale()){const b=Number(api.snapshot()?.parameters?.index_base??0);const k=source?.entries?.find(k=>k.row===c[0]-b&&k.column===c[1]-b&&k.layer===c[2]);if(k){api.ui.key=k.key;api.ui.layer=k.layer;}}api.refresh();}})),note(`Recorded position ${cursor+1}/${positions.length}: UTF-8 byte ${positions[cursor][0]}, scalar ${positions[cursor][1]}. ${result.source_coordinates?JSON.stringify(result.source_coordinates[cursor])+' → '+JSON.stringify(result.target_coordinates[cursor]):JSON.stringify(result.coordinates?.[cursor]??'Decoded position')}`),api.stale()?note('Recorded coordinates belong to earlier settings. The keyboard above remains the editable current geometry.'):null):null);
  const input=document.getElementById('playground-input');
  const inspect=()=>{const text=input.value.slice(0,input.selectionStart);const symbol=Array.from(text).at(-1);const entry=source?.entries?.find(e=>e.symbol===symbol);if(entry){api.ui.key=entry.key;api.ui.layer=entry.layer;api.refresh();}};
  input?.addEventListener('keyup',inspect); input?.addEventListener('click',inspect);
  return ()=>{input?.removeEventListener('keyup',inspect);input?.removeEventListener('click',inspect);};
}
function polybiusNavigate(api,event,index,side) {
  const row=Math.floor(index/side), column=index%side;
  const next={ArrowLeft:row*side+Math.max(0,column-1),ArrowRight:row*side+Math.min(side-1,column+1),ArrowUp:Math.max(0,row-1)*side+column,ArrowDown:Math.min(side-1,row+1)*side+column,Home:row*side,End:row*side+side-1}[event.key];
  if(next===undefined)return;
  event.preventDefault();
  api.ui.cell=next;
  api.ui.rowPage=Math.floor(Math.floor(next/side)/8)*8;
  api.refresh({focusId:`polybius-cell-${next}`});
}
function polybiusCell(api,alphabet,index,side,base,selected) {
  const row=Math.floor(index/side),column=index%side;
  const onAxis=selected!==undefined&&(Math.floor(selected/side)===row||selected%side===column);
  return h('td',{class:onAxis?'axis-highlight':''},button(alphabet[index],()=>{
    api.ui.cell=index;
    if(api.ui.cellAction==='insert')addText(api,api.action.id.endsWith('.decode')?`${row+base},${column+base}`:alphabet[index],api.action.id.endsWith('.decode')?' ':'');
    else api.refresh();
  },{id:`polybius-cell-${index}`,'aria-label':`${alphabet[index]}, row ${row+base}, column ${column+base}`,'aria-pressed':String(index===selected),class:index===selected?'inspected':'',onKeydown:event=>polybiusNavigate(api,event,index,side)}));
}
function polybiusRules(api) {
  return h('details',{class:'polybius-rules',open:api.ui.polybiusRules===true,onToggle:event=>{
    if(event.currentTarget.isConnected)api.ui.polybiusRules=event.currentTarget.open;
  }},h('summary',{id:'polybius-rules-summary',onClick:event=>{
    // Native toggle is queued; remember activation before inspection redraws.
    if(event.currentTarget.isConnected&&!event.defaultPrevented)api.ui.polybiusRules=!event.currentTarget.parentElement.open;
  }},'Matching and spaces'),note('Presets fold ASCII case. Each literal space is retained as / (a null token). Custom squares match exact scalars.'));
}
// Decorative fasteners and coordinate dials are presentation only. They never
// change configuration or infer an operation result.
function instrumentFasteners() {
  return ['top-left','top-right','bottom-left','bottom-right'].map(corner=>h('span',{class:`instrument-fastener ${corner}`,'aria-hidden':'true'}));
}
function coordinateDial(side,base,index) {
  if (!side || base===null) return null;
  const angle=value=>(side===1?0:-140+value*280/(side-1))*Math.PI/180;
  const point=(value,radius)=>[50+Math.sin(angle(value))*radius,50-Math.cos(angle(value))*radius];
  const marks=Array.from({length:side},(_,value)=>{
    const [x1,y1]=point(value,36),[x2,y2]=point(value,40),[x,y]=point(value,28);
    const labeled=side<=8 || value%Math.ceil(side/8)===0 || value===side-1;
    return [svg('line',{x1,y1,x2,y2,class:'dial-tick'}),labeled?svg('text',{x,y:y+3,'text-anchor':'middle',class:'dial-number'},value+base):null];
  });
  return svg('svg',{viewBox:'0 0 100 100',class:'polybius-dial','aria-hidden':'true',focusable:'false'},
    svg('circle',{cx:50,cy:50,r:47,class:'dial-rim'}),svg('circle',{cx:50,cy:50,r:43,class:'dial-face'}),marks,
    index===undefined?null:svg('g',{transform:`rotate(${side===1?0:-140+index*280/(side-1)} 50 50)`},svg('path',{d:'M47 54 L50 30 L53 54 Z',class:'dial-needle'})),
    svg('circle',{cx:50,cy:50,r:5,class:'dial-hub'}));
}
function polybius(host,api) {
  const custom=api.param('alphabet');
  const preset=api.data.squares[api.param('preset')??'polybius'];
  const alphabet=Array.from(custom||preset?.alphabet||'');
  const side=integer(custom?api.param('side'):preset?.side,1,64);
  const base=integer(api.param('index_base')??1,0,1);
  const aliases=custom?parse(api.param('aliases'))??[]:preset?.aliases??[];
  const valid=side&&base!==null&&alphabet.length===side*side;
  const selected=valid&&Number.isInteger(api.ui.cell)&&api.ui.cell>=0&&api.ui.cell<alphabet.length?api.ui.cell:undefined;
  const start=Math.min(Math.floor((api.ui.rowPage??0)/8)*8,Math.max(0,Math.floor(((side??1)-1)/8)*8));
  const controls=h('div',{class:'polybius-settings'},field('polybius-preset','Square',choice('polybius-preset',custom?'custom':api.param('preset')??'polybius',['polybius','tap','custom'],v=>{
    if(v==='custom'){const initial=preset??api.data.squares.polybius;api.setParam('preset',undefined);api.setParam('alphabet',initial.alphabet);api.setParam('side',String(initial.side));api.setParam('aliases',JSON.stringify(initial.aliases));}
    else {api.setParam('alphabet',undefined);api.setParam('side',undefined);api.setParam('aliases',undefined);api.setParam('preset',v);}
    api.ui.rowPage=0;api.refresh();})),
    field('polybius-base','Index origin',choice('polybius-base',base,[0,1],v=>patch(api,'index_base',v))));
  const grid=valid?h('div',{class:'instrument-scroll polybius-board','data-instrument-scroll':'polybius-square'},h('table',{class:'polybius-square'},h('caption',{},'Row, column — exact square'),h('thead',{},h('tr',{},h('th',{scope:'col'},'r/c'),Array.from({length:side},(_,c)=>h('th',{scope:'col',class:selected!==undefined&&selected%side===c?'coordinate-highlight':''},c+base)))),h('tbody',{},Array.from({length:Math.min(8,side-start)},(_,r)=>h('tr',{},h('th',{scope:'row',class:selected!==undefined&&Math.floor(selected/side)===r+start?'coordinate-highlight':''},r+start+base),Array.from({length:side},(_,c)=>polybiusCell(api,alphabet,(r+start)*side+c,side,base,selected))))))):h('p',{class:'warning'},'A custom square requires side² unique scalars and valid aliases. Review Parameters.');
  const reading=h('div',{class:'polybius-reading'},instrumentFasteners(),h('h3',{},'Selected cell'),
    h('div',{class:'polybius-coordinate-readout'},h('strong',{id:'polybius-selected-symbol'},selected===undefined?'—':alphabet[selected]),
      h('dl',{},h('div',{},h('dt',{},'Row'),coordinateDial(side,base,selected===undefined?undefined:Math.floor(selected/side)),h('dd',{id:'polybius-selected-row'},selected===undefined?'—':Math.floor(selected/side)+base)),h('div',{},h('dt',{},'Column'),coordinateDial(side,base,selected===undefined?undefined:selected%side),h('dd',{id:'polybius-selected-column'},selected===undefined?'—':selected%side+base)))));
  const inspection=h('aside',{class:'polybius-inspection','aria-label':'Selected cell coordinates'},reading,
    h('p',{class:'polybius-aliases'},h('span',{},'Aliases'),h('strong',{},Array.isArray(aliases)?aliases.join(', ')||'none':'Review Parameters')),
    field('polybius-action','Cell action',choice('polybius-action',api.ui.cellAction??'inspect',['inspect','insert'],v=>{api.ui.cellAction=v;api.refresh();})),
    note('Arrow keys inspect adjacent cells. Choose Insert, then activate a cell to compose.'),controls,
    polybiusRules(api));
  replace(host,h('div',{class:'polybius-instrument'},h('div',{class:'polybius-stage'},h('div',{class:'polybius-case'},instrumentFasteners(),h('h3',{class:'polybius-case-title'},custom?'Custom square':api.param('preset')==='tap'?'Tap square':'Polybius square'),grid,h('p',{class:'polybius-case-foot'},'Coordinate instrument')),side>8?h('div',{class:'toolbar'},button('Previous rows',()=>{api.ui.rowPage=Math.max(0,start-8);api.refresh({fallbackFocusId:`polybius-cell-${api.ui.rowPage*side}`});},{id:'polybius-previous-rows',disabled:start===0}),button('Next rows',()=>{api.ui.rowPage=Math.min(side-1,start+8);api.refresh({fallbackFocusId:`polybius-cell-${api.ui.rowPage*side}`});},{id:'polybius-next-rows',disabled:start+8>=side}),note(`Rows ${start+1}–${Math.min(start+8,side)} of ${side}. All ${side*side} cells remain in the configuration.`)):null),inspection),
    custom?h('div',{class:'toolbar polybius-custom'},field('polybius-alphabet','Custom alphabet',h('textarea',{id:'polybius-alphabet',rows:2,value:custom,onChange:e=>patch(api,'alphabet',e.target.value)})),field('polybius-side','Side',h('input',{id:'polybius-side',type:'number',min:1,max:64,value:api.param('side'),onChange:e=>patch(api,'side',e.target.value)}))):null,
    h('p',{class:'selection-caption'},selected!==undefined?`Selected ${alphabet[selected]} ↔ ${Math.floor(selected/side)+base},${selected%side+base}. Inspection does not edit or run.`:'Select a cell to inspect its coordinates.'));
}

function svg(tag,attributes={},...children) {
  const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [name,value]of Object.entries(attributes)){if(name.startsWith('on'))node.addEventListener(name.slice(2).toLowerCase(),value);else node.setAttribute(name,String(value));}
  for(const child of children.flat(Infinity))if(child!==null&&child!==undefined)node.append(child instanceof Node?child:document.createTextNode(String(child)));
  return node;
}
function graph(host,api) {
  const data=graphDraft(api.text());
  const controls=h('div',{class:'toolbar'});
  if(!data){replace(host,note('Load the Core example or enter a graph with directed, vertices and edges in the input. All graph edits are also available as JSON.'),controls);return;}
  const save=(next,focusId)=>{api.setText(JSON.stringify(next,null,2));api.refresh({focusId});};
  const vertices=data.vertices;
  const selected=api.ui.node;
  if (!api.ui.positions || Object.getPrototypeOf(api.ui.positions)!==null) api.ui.positions=Object.assign(Object.create(null),api.ui.positions ?? {});
  const positions=api.ui.positions;
  const currentNodes=new Set(vertices);
  for (const name of Object.keys(positions)) if (!currentNodes.has(name)) delete positions[name];
  vertices.slice(0,100).forEach((name,index)=>{
    if (Object.hasOwn(positions,name)) return;
    const preferred={x:350+230*Math.cos(index/vertices.length*2*Math.PI),y:230+165*Math.sin(index/vertices.length*2*Math.PI)};
    const occupied=Object.values(positions);
    const free=point=>occupied.every(other=>Math.hypot(point.x-other.x,point.y-other.y)>=52);
    // Adding a node retains existing layout. Reuse an unoccupied drawing slot
    // when the circular seed would conceal a node from an earlier source.
    const slots=free(preferred)?[]:Array.from({length:104},(_,slot)=>({x:35+(slot%13)*52.5,y:35+Math.floor(slot/13)*(390/7)}));
    positions[name]=free(preferred)?preferred:slots.find(free)??preferred;
  });
  const canvas=svg('svg',{viewBox:'0 0 700 460',class:'graph-canvas',role:'img','aria-label':'Editable graph layout. Equivalent node and edge actions follow below.'});
  const result=api.result().output?.result;
  for(const edge of data.edges.slice(0,200)) {
    const a=positions[edge.from],b=positions[edge.to];if(!a||!b)continue;
    const active=result?.edges?.includes(edge.id);
    canvas.append(svg('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:active?'#005fcc':'#8998aa','stroke-width':active?5:2,'stroke-dasharray':active?'':'5 3'}));
    canvas.append(svg('text',{x:(a.x+b.x)/2,y:(a.y+b.y)/2-6,'text-anchor':'middle',class:'graph-edge-label'},`${edge.id}${data.directed?` (${edge.from} → ${edge.to})`:''}`));
  }
  for(const name of vertices.slice(0,100)) {
    const pos=positions[name];
    const node=svg('g',{transform:`translate(${pos.x} ${pos.y})`,class:'graph-node'});
    node.append(svg('circle',{r:25,fill:result?.vertices?.includes(name)?'#d9eaff':'#fff',stroke:name===selected?'#005fcc':'#59677b','stroke-width':name===selected?4:2}),svg('text',{'text-anchor':'middle',y:6},name));
    node.addEventListener('pointerdown',event=>{
      event.preventDefault();node.setPointerCapture(event.pointerId);let moved=false;
      const move=e=>{const r=canvas.getBoundingClientRect();positions[name]={x:Math.min(665,Math.max(35,(e.clientX-r.left)/r.width*700)),y:Math.min(425,Math.max(35,(e.clientY-r.top)/r.height*460))};moved=true;node.setAttribute('transform',`translate(${positions[name].x} ${positions[name].y})`);};
      const end=()=>{node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',end);node.removeEventListener('pointercancel',end);api.ui.node=name;api.refresh();};
      node.addEventListener('pointermove',move);node.addEventListener('pointerup',end);node.addEventListener('pointercancel',end);
    });canvas.append(node);
  }
  const vertexInput=h('input',{id:'graph-new-node',value:api.ui.newNode??'',onInput:e=>{api.ui.newNode=e.target.value;}});
  const endpoint=(id,key)=>field(id,labelFor(key),choice(id,api.ui[key]??vertices[0],vertices,value=>{api.ui[key]=value;}));
  const edgeId=h('input',{id:'graph-edge-id',value:api.ui.edgeId??'',onInput:e=>{api.ui.edgeId=e.target.value;}});
  const attempt=run=>{try{run();api.ui.error='';}catch(error){api.ui.error=error.message;api.refresh();}};
  const nodeStart=integer(api.ui.nodeStart??0,0,vertices.length)??0;
  const edgeStart=integer(api.ui.edgeStart??0,0,data.edges.length)??0;
  const pager=(title,key,start,length)=>h('div',{class:'toolbar'},button(`Previous ${title}`,()=>{api.ui[key]=Math.max(0,start-40);api.refresh({fallbackFocusId:title==='nodes'?'graph-new-node':'graph-edge-id'});},{id:`graph-previous-${title}`,disabled:!start}),note(`${start+1}–${Math.min(length,start+40)} of ${length}`),button(`Next ${title}`,()=>{api.ui[key]=start+40;api.refresh({fallbackFocusId:title==='nodes'?'graph-new-node':'graph-edge-id'});},{id:`graph-next-${title}`,disabled:start+40>=length}));
  replace(host,h('div',{class:'toolbar'},field('graph-directed','Graph direction',choice('graph-directed',data.directed?'directed':'undirected',['undirected','directed'],v=>save({...data,directed:v==='directed'}))),
    field('graph-source','Source',choice('graph-source',api.param('source'),vertices,v=>patch(api,'source',v))),field('graph-target','Target',choice('graph-target',api.param('target'),vertices,v=>patch(api,'target',v)))),
    h('div',{class:'instrument-scroll','data-instrument-scroll':'graph-layout',tabindex:0,role:'region','aria-label':'Graph layout viewport'},canvas),note(`Drag nodes to change layout only. ${Math.min(vertices.length,100)} nodes and ${Math.min(data.edges.length,200)} edges drawn; the lists retain all graph entries.`),
    result?h('p',{class:'selection-caption'},`${result.vertices.join(' → ')} · ${result.edges.length} edges${api.stale()?' · earlier input':''}`):note('Run to find a path. The graph has no weights or search trace.'),
    h('div',{class:'toolbar'},field('graph-new-node','New node ID',vertexInput),button('Add node',()=>attempt(()=>{const name=vertexInput.value;if(!name||vertices.includes(name))throw new Error('Use a nonempty distinct node ID.');save({...data,vertices:[...vertices,name]});}),{id:'graph-add-node'})),
    h('div',{class:'toolbar'},endpoint('graph-edge-from','from'),endpoint('graph-edge-to','to'),field('graph-edge-id','New edge ID',edgeId),button('Add edge',()=>attempt(()=>save(editGraphEdge(data,api.ui.from??vertices[0],api.ui.to??vertices[0],edgeId.value))),{id:'graph-add-edge'})),
    api.ui.error?h('p',{role:'alert',class:'error'},api.ui.error):null,
    h('details',{open:api.ui.nodesOpen??true,onToggle:event=>{api.ui.nodesOpen=event.target.open;}},h('summary',{},'Nodes and layout controls'),h('div',{class:'graph-node-list'},vertices.slice(nodeStart,nodeStart+40).map(name=>h('div',{class:'row'},button(name,()=>{api.ui.node=name;api.refresh();},{id:`graph-inspect-${encodeURIComponent(name)}`,'aria-pressed':String(name===selected)}),...['left','right','up','down'].map(direction=>button(direction,()=>{positions[name]??={x:350,y:230};positions[name].x+=direction==='left'?-15:direction==='right'?15:0;positions[name].y+=direction==='up'?-15:direction==='down'?15:0;api.refresh();},{id:`graph-move-${encodeURIComponent(name)}-${direction}`,'aria-label':`Move ${name} ${direction}`})),button(`Remove ${name}`,()=>save({...data,vertices:vertices.filter(v=>v!==name),edges:data.edges.filter(e=>e.from!==name&&e.to!==name)},'graph-new-node'),{id:`graph-remove-${encodeURIComponent(name)}`})))),vertices.length>40?pager('nodes','nodeStart',nodeStart,vertices.length):null),
    h('details',{open:api.ui.edgesOpen??false,onToggle:event=>{api.ui.edgesOpen=event.target.open;}},h('summary',{},`Edges (${data.edges.length})`),h('ul',{class:'compact-list'},data.edges.slice(edgeStart,edgeStart+40).map(edge=>h('li',{class:'row'},`${edge.id}: ${edge.from} ${data.directed?'→':'—'} ${edge.to}`,button(`Remove edge ${edge.id}`,()=>save({...data,edges:data.edges.filter(e=>e.id!==edge.id)},'graph-edge-id'),{id:`graph-remove-edge-${encodeURIComponent(edge.id)}`})))),data.edges.length>40?pager('edges','edgeStart',edgeStart,data.edges.length):null));
}

/** Layout coordinates use Core word spans; a subsequent Core decode validates
 * every inspectable coordinate before this drawing is offered to the user. */
export function sourceCells(source,words,scheme,base) {
  const scalars=Array.from(source);
  const lines=[];let line=0,within=0;
  for(let i=0;i<scalars.length;i++) {
    lines[i]={line,within};
    if(scalars[i]==='\n'){line++;within=0;}else within++;
  }
  if(scheme==='line_character')return scalars.flatMap((symbol,i)=>symbol==='\n'||symbol==='\r'&&scalars[i+1]==='\n'?[]:[{symbol,scalar:i,coordinate:`${lines[i].line+base}:${lines[i].within+base}`}]);
  const lineWords=new Map();
  return words.flatMap(word=>{
    const row=lines[word.scalar_index]?.line??0;
    const wordInLine=lineWords.get(row)??0;lineWords.set(row,wordInLine+1);
    return scalars.slice(word.scalar_index,word.scalar_index+word.scalar_length).map((symbol,index)=>({symbol,scalar:word.scalar_index+index,coordinate:scheme==='word_character'?`${word.word_index+base}:${index+base}`:`${row+base}:${wordInLine+base}:${index+base}`}));
  });
}
function book(host,api) {
  const encode=api.action.id.endsWith('.encode');
  const source=encode?api.text():String(api.param('source')??'');
  const scheme=api.param('scheme');
  const base=integer(api.param('index_base'),0,1);
  const currentKey=JSON.stringify([source,scheme,base]);
  const index=api.ui.bookIndex;
  const stale=index&&index.key!==currentKey;
  const textField=encode?field('book-message','Message',h('textarea',{id:'book-message',rows:2,value:api.extra('text'),onInput:e=>{api.setExtra('text',e.target.value);api.refresh();}})):
    field('book-source','Reference text (exact)',h('textarea',{id:'book-source',rows:4,value:source,onInput:e=>{api.setParam('source',e.target.value);api.refresh();}}));
  const indexSource=async()=>{
    if (api.ui.bookRequest) return;
    api.ui.bookError='';const revision=api.revision();
    const request=api.ui.bookRequest={revision};
    api.refresh();
    try{
      if(base===null)throw new Error('Choose origin 0 or 1.');
      if(!api.choices('scheme').includes(scheme))throw new Error('Choose a coordinate scheme.');
      const words=(await api.execute('text.word.lengths',{input:source})).output;
      const all=sourceCells(source,words,scheme,base);
      const cells=all.slice(0,4096);
      const decoded=await api.execute('cipher.book.decode',{input:cells.map(c=>c.coordinate).join(',')},{source,scheme,index_base:base});
      if(decoded.output!==cells.map(c=>c.symbol).join(''))throw new Error('The source layout does not match Core coordinates. Keep using the exact Parameters input.');
      const hash=(await api.execute('hash.sha256',{input:new TextEncoder().encode(source)})).output;
      if(!api.isCurrent(revision))return;
      api.ui.bookIndex={key:currentKey,source,cells,total:all.length,hash};api.ui.bookPage=0;
    }catch(error){if(api.ui.bookRequest===request && api.isCurrent(revision))api.ui.bookError=error.message;}
    finally {
      if (api.ui.bookRequest===request) { api.ui.bookRequest=null; if(api.isCurrent())api.refresh(); }
    }
  };
  const start=integer(api.ui.bookPage??0,0,index?.cells.length??0)??0;
  const identity = index || api.result().source_sha256 ? h('details', {
    open: Boolean(api.ui.bookIdentity),
    onToggle: event => { if (event.currentTarget.isConnected) api.ui.bookIdentity = event.currentTarget.open; },
  }, h('summary', {onClick: event => {
    if (event.currentTarget.isConnected && !event.defaultPrevented) api.ui.bookIdentity = !event.currentTarget.parentElement.open;
  }}, 'Source identity and inspection limits'),
    index ? note(`Source SHA-256 ${index.hash}. Visual inspection retains at most 4,096 scalars; the complete source and results remain exact.`) : null,
    api.result().source_sha256 ? note(`Execution source SHA-256: ${api.result().source_sha256}`) : null) : null;
  replace(host,h('div',{class:'toolbar'},field('book-scheme','Coordinate scheme',choice('book-scheme',scheme,api.choices('scheme'),v=>patch(api,'scheme',v))),field('book-base','Index origin',choice('book-base',base,[0,1],v=>patch(api,'index_base',v))), encode ? field('book-matching','Matching policy',choice('book-matching',api.param('matching'),api.choices('matching'),v=>patch(api,'matching',v))) : null),textField,
    h('section',{class:'book-reference'},h('h3',{},'Reference text'),h('pre',{class:'book-source-preview'},source||'No reference text yet.')),
    h('div',{class:'toolbar'},button('Index reference text',indexSource,{id:'book-index','aria-disabled':String(Boolean(api.ui.bookRequest)),'aria-busy':String(Boolean(api.ui.bookRequest))}),button('Insert selected coordinate',()=>{const cell=index?.cells[api.ui.bookCell];if(!cell||stale)return;if(encode){api.setExtra('text',api.extra('text')+cell.symbol);api.refresh();}else addText(api,cell.coordinate,',');},{id:'book-insert-coordinate',disabled:!index||stale||api.ui.bookCell===undefined})),
    api.ui.bookRequest?h('p',{class:'small muted',role:'status'},'Indexing reference text in Core…'):null,
    api.ui.bookError?h('p',{class:'error',role:'alert'},api.ui.bookError):null,
    stale?h('p',{class:'warning'},'The indexed source or coordinates changed. Index the reference text again; the previous source is retained below.'):null,
    index?h('section',{},note(`${index.cells.length} of ${index.total} indexed scalars · select a character to inspect its coordinate.`),
      h('div',{class:'book-source-grid'},index.cells.slice(start,start+160).map((cell,i)=>button(h('span',{},h('strong',{},cell.symbol===' '?'␠':cell.symbol),h('small',{},cell.coordinate)),()=>{api.ui.bookCell=start+i;api.refresh();},{id:`book-cell-${start+i}`,'aria-pressed':String(api.ui.bookCell===start+i),'aria-label':`${cell.symbol===' '?'␠':cell.symbol}${cell.coordinate}: coordinate ${cell.coordinate}`}))),
      h('div',{class:'toolbar'},button('Previous source cells',()=>{api.ui.bookPage=Math.max(0,start-160);api.refresh({fallbackFocusId:`book-cell-${api.ui.bookPage}`});},{id:'book-previous-source',disabled:!start}),note(`${start+1}–${Math.min(start+160,index.cells.length)}`),button('Next source cells',()=>{api.ui.bookPage=start+160;api.refresh({fallbackFocusId:`book-cell-${api.ui.bookPage}`});},{id:'book-next-source',disabled:start+160>=index.cells.length})),
      api.ui.bookCell!==undefined? h('p',{class:'selection-caption'},`Selected ${index.cells[api.ui.bookCell]?.coordinate}: ${index.cells[api.ui.bookCell]?.symbol}. Source selection inspects; Insert explicitly composes the message/coordinates.`):null):note('Index the reference text to inspect Core-validated coordinates. Visual wrapping never changes source lines.'),
    identity);
}

const renderers={keyboard,polybius,graph,book};
export function mountInstrument(host,api) {return renderers[api.kind](host,api);}

export function disposeInstrument(api) { if (api.kind==='book') api.ui.bookRequest=null; }

import {h,button,replace} from './dom.mjs';
import {searchTools} from './catalog.mjs';

/** Mounted once. Workspace updates only change selection attributes. */
export function mountSidebar(host,{runtime,state,useTool,navigate}) {
  const page=state.catalog;
  page.expanded??=new Set();
  const list=h('div',{class:'sidebar-categories'});
  const favorites=h('div',{class:'sidebar-favorites'});
  const count=h('p',{class:'small muted',role:'status'});
  const query=h('input',{id:'tool-search',type:'search',value:page.query,placeholder:'Search tools',onInput:event=>{page.query=event.target.value;renderList();}});
  const multi=h('a',{href:'#/playground','data-activity':'playground'},'Multidecoder');
  const pipelines=h('a',{href:'#/pipelines','data-activity':'pipelines'},'Pipelines');
  const browse=h('a',{href:'#/tools'},'All tools');
  const choose=tool=>{const remembered=state.playground.lastActions?.[tool.key];useTool(tool.actions.find(a=>a.id===remembered)??tool.actions.find(a=>a.id.endsWith(`.${state.playground.mode.toLowerCase()}`))??tool.actions[0]);};
  let activeKey;
  function row(tool,attributes={}) {
    return button(tool.title,()=>choose(tool),{class:'sidebar-tool',...attributes,'data-family':tool.key});
  }
  function renderList() {
    const tools=searchTools(runtime.tools,{query:page.query});
    const groups=new Map();
    for(const tool of tools){if(!groups.has(tool.category))groups.set(tool.category,[]);groups.get(tool.category).push(tool);}
    replace(list,...[...groups.entries()].sort((a,b)=>a[1][0].categoryTitle.localeCompare(b[1][0].categoryTitle)).map(([key,items])=>h('details',{
      'data-category':key,open:Boolean(page.query.trim())||page.expanded.has(key),
      onToggle:event=>{if(event.currentTarget.isConnected&&!page.query.trim()){if(event.target.open)page.expanded.add(key);else page.expanded.delete(key);}},
    },h('summary',{},items[0].categoryTitle),items.map(tool=>row(tool,{'data-tool':tool.key})))));
    count.textContent=page.query.trim()?`${tools.length} matching tools`:'';
    if(!tools.length)list.append(h('p',{class:'small muted'},'No matching tools. Try another name.'));
    updateSelection({reveal:true});
  }
  function updateSelection({reveal=false}={}) {
    const tool=runtime.tools.find(tool=>tool.actions.some(a=>a.id===state.playground.tool));
    for(const node of host.querySelectorAll('[data-family]')){
      const selected=state.activity==='playground'&&tool?.key===node.dataset.family;
      node.classList.toggle('selected',selected);
      if(selected)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current');
    }
    multi.toggleAttribute('data-selected',state.activity==='playground'&&!tool);
    pipelines.toggleAttribute('data-selected',state.activity==='pipelines');
    for(const link of [multi,pipelines]){if(link.hasAttribute('data-selected'))link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
    if(tool?.key!==activeKey||reveal){
      activeKey=tool?.key;
      const category=[...host.querySelectorAll('[data-category]')].find(node=>node.dataset.category===tool?.category);
      if(category&&!page.query.trim())category.open=true;
    }
  }
  function updateFavorites() {
    const saved=runtime.tools.filter(tool=>state.favorites.includes(tool.key)||tool.actions.some(a=>state.favorites.includes(a.id)));
    replace(favorites,h('h2',{class:'sidebar-section-title'},'Favorites'),saved.length?saved.map(tool=>row(tool,{'data-favorite-tool':tool.key})):h('p',{class:'small muted'},'No favorites yet.'));
    updateSelection();
  }
  replace(host,h('div',{class:'sidebar-search'},h('label',{for:'tool-search'},'Search tools'),query,count),
    h('nav',{'aria-label':'Primary',class:'sidebar-activities'},multi,pipelines,browse),favorites,list);
  renderList();updateFavorites();
  for(const [link,activity] of [[multi,'playground'],[pipelines,'pipelines']])link.addEventListener('click',event=>{
    if(event.button||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
    event.preventDefault();navigate(activity);
  });
  browse.addEventListener('click',event=>{event.preventDefault();navigate('tools');query.focus();});
  return {updateSelection,updateFavorites,focusSearch:()=>query.focus()};
}

export function navigationDrawer(sidebar,trigger,workspace) {
  const header=document.querySelector('.site-header');
  const footer=document.querySelector('footer');
  const close=button('Close tools',()=>setOpen(false),{class:'drawer-close'});
  sidebar.prepend(close);
  const backdrop=button('',()=>setOpen(false),{class:'drawer-backdrop',tabindex:-1,'aria-hidden':'true',hidden:true});
  document.body.append(backdrop);
  const narrow=matchMedia('(max-width: 760px)');
  let open=false;
  function setOpen(value,{focusWorkspace=false}={}) {
    open=Boolean(value&&narrow.matches);sidebar.classList.toggle('drawer-open',open);
    trigger.setAttribute('aria-expanded',String(open));backdrop.hidden=!open;
    workspace.inert=open;header.inert=open;footer.inert=open;
    document.body.classList.toggle('drawer-visible',open);
    if(open){sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');close.focus();}
    else {sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal');if(narrow.matches)(focusWorkspace?workspace:trigger).focus({preventScroll:true});}
  }
  trigger.addEventListener('click',()=>setOpen(!open));
  sidebar.addEventListener('keydown',event=>{
    if(!open)return;
    if(event.key==='Escape'){event.preventDefault();setOpen(false);return;}
    if(event.key!=='Tab')return;
    const nodes=[...sidebar.querySelectorAll('button,a,input,summary')].filter(node=>!node.disabled&&node.getClientRects().length);
    const first=nodes[0],last=nodes.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
  narrow.addEventListener('change',()=>{if(!narrow.matches)setOpen(false);});
  return {close:()=>{if(open)setOpen(false,{focusWorkspace:true});},open:()=>setOpen(true)};
}

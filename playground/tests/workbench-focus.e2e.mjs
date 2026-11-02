import test from 'node:test';
import assert from 'node:assert/strict';
import { instrumentBrowser } from './support/instrument-browser.mjs';
async function holdBookResponses(context) {
 await context.addInitScript(()=>{
  const proto=Worker.prototype, receive=Object.getOwnPropertyDescriptor(proto,'onmessage'),send=proto.postMessage;
  proto.postMessage=function(message,...args){if(message.method==='execute'&&message.args?.[0]?.operation===window.holdBookOperation){window.heldBookId=message.id;window.holdBookOperation=null;}return send.call(this,message,...args);};
  Object.defineProperty(proto,'onmessage',{configurable:true,get:receive.get,set(handler){receive.set.call(this,event=>{if(event.data.id===window.heldBookId)window.releaseBookReply=()=>handler.call(this,event);else handler.call(this,event);});}});
 });
}
const sourceFiles=process.env.INSTRUMENT_SOURCE==='1'?['app.mjs','playground-view.mjs','instruments/shell.mjs','instruments/workbench.mjs']:[];

test('graph redraw, removal and paged reference inspection retain usable keyboard focus',{timeout:120000},async t=>{
 const {open}=await instrumentBrowser(t,{sourceFiles});
 const graph=await open('graph.shortest_path','graph');
 const original=await graph.locator('#playground-input').inputValue();
 const calls=await graph.evaluate(()=>window.instrumentCalls);
 await graph.getByRole('button',{name:'Move A left',exact:true}).focus();await graph.keyboard.press('Enter');
 assert.equal(await graph.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Move A left');
 assert.equal(await graph.locator('#playground-input').inputValue(),original);
 assert.equal(await graph.evaluate(()=>window.instrumentCalls),calls);
 await graph.getByRole('button',{name:'Remove A',exact:true}).focus();await graph.keyboard.press('Enter');
 assert.equal(await graph.evaluate(()=>document.activeElement?.id),'graph-new-node');
 await graph.close();

 const book=await open('cipher.book.decode','book');
 await book.locator('#book-source').fill(Array(400).fill('A').join(' '));
 await book.locator('#book-index').click();await book.locator('#book-cell-0').waitFor();
 const indexed=await book.evaluate(()=>window.instrumentCalls);
 await book.getByRole('button',{name:'Next source cells',exact:true}).focus();await book.keyboard.press('Enter');
 assert.equal(await book.evaluate(()=>document.activeElement?.textContent),'Next source cells');
 await book.keyboard.press('Enter');
 assert.equal(await book.evaluate(()=>document.activeElement?.id),'book-cell-320','A last page offers its first cell when Next becomes disabled.');
 assert.equal(await book.evaluate(()=>window.instrumentCalls),indexed,'Paging inspects the existing Core index.');
 await book.close();
});

test('graph layout treats prototype-like vertex IDs as ordinary Core labels',{timeout:60000},async t=>{
 const {open}=await instrumentBrowser(t,{sourceFiles});
 const page=await open('graph.shortest_path','graph');
 const data={directed:false,vertices:['__proto__','constructor','toString'],edges:[]};
 await page.locator('#playground-input').fill(JSON.stringify(data));
 const transforms=await page.locator('.graph-node').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('transform')));
 assert.equal(transforms.length,3);assert.ok(transforms.every(s=>!s.includes('undefined')&&!s.includes('NaN')),transforms.join(','));
 const calls=await page.evaluate(()=>window.instrumentCalls);
 await page.getByRole('button',{name:'Move __proto__ left',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.instrumentCalls),calls);
 assert.equal(await page.locator('#playground-input').inputValue(),JSON.stringify(data));
 await page.close();
});

test('coordinate insert and custom-layout editing preserve exact wire data',{timeout:60000},async t=>{
 const {open}=await instrumentBrowser(t,{sourceFiles});
 const page=await open('text.keyboard.coordinates.decode','keyboard');
 await page.locator('#keyboard-layout').selectOption('qwerty');
 const original='[[9007199254740993,0,"base"]]';
 await page.locator('#playground-input').fill(original);
 await page.locator('#keyboard-mode').selectOption('insert');
 await page.locator('#keyboard-source-base-ansi00').click();
 const composed=await page.locator('#playground-input').inputValue();
 assert.ok(composed.includes('9007199254740993'),composed);
 assert.ok(!composed.includes('9007199254740992'),composed);
 const calls=await page.evaluate(()=>window.instrumentCalls);
 await page.locator('#keyboard-layout').selectOption('custom');
 assert.equal(await page.locator('#instrument-parameter-panel').isVisible(),true);
 assert.equal(await page.evaluate(()=>document.activeElement?.id),'playground-options-layout');
 assert.equal(await page.evaluate(()=>window.instrumentCalls),calls);
 assert.equal(await page.locator('#playground-input').inputValue(),composed);
 await page.close();
});

test('leaving an indexing request does not write an old error into the next book view',{timeout:60000},async t=>{
 const {open,context}=await instrumentBrowser(t,{sourceFiles});
 await holdBookResponses(context);
 const page=await open('cipher.book.decode','book');
 const input=await page.locator('#book-source').inputValue();
 await page.evaluate(()=>{window.holdBookOperation='text.word.lengths';});
 await page.locator('#book-index').click();await page.waitForFunction(()=>typeof window.releaseBookReply==='function');
 await page.getByRole('navigation',{name:'Primary'}).getByRole('link',{name:'All tools',exact:true}).click();await page.locator('#tool-search').waitFor();
 await page.evaluate(()=>window.releaseBookReply());
 await page.getByRole('navigation',{name:'Primary'}).getByRole('link',{name:'Playground',exact:true}).click();await page.locator('#book-source').waitFor();
 assert.equal(await page.locator('.instrument .error').count(),0,'A disposed index request must not leave an error on the replacement view.');
 assert.equal(await page.locator('#book-source').inputValue(),input);
 await page.locator('#book-index').click();await page.locator('#book-cell-0').waitFor();
 await page.close();
});

test('keyboard viewport survives inspection and editor tabs but resets for replacement input',{timeout:60000},async t=>{
 const {open}=await instrumentBrowser(t,{sourceFiles});
 const page=await open('text.keyboard.remap','keyboard');
 await page.setViewportSize({width:390,height:1000});
 const source=page.locator('.key-layout').first().locator('.instrument-scroll');
 await source.evaluate(node=>{node.scrollLeft=150;});
 await page.locator('#keyboard-source-base-ansi18').click();
 assert.equal(await source.evaluate(node=>node.scrollLeft),150,'Inspecting a visible key must preserve the local viewport.');
 await page.locator('#instrument-tab-parameters').click();await page.locator('#instrument-tab-visual').click();
 assert.equal(await source.evaluate(node=>node.scrollLeft),150,'Tabs retain the current local viewport.');
 await page.locator('#playground-file').setInputFiles({name:'replacement.txt',buffer:Buffer.from('replacement')});
 await page.getByText('File ready. Run tools with these exact bytes.',{exact:true}).waitFor();
 assert.equal(await source.evaluate(node=>node.scrollLeft),0,'A replacement source starts its own viewport.');
 await page.close();
});

test('required book and graph choices never imply missing canonical values are configured',{timeout:60000},async t=>{
 const {context,base}=await instrumentBrowser(t,{sourceFiles});
 const page=await context.newPage();
 await page.goto(base+'#/tools/cipher.book.encode/1');
 await page.getByRole('button',{name:'Use tool',exact:true}).click({timeout:45000});await page.locator('#book-scheme').waitFor();
 assert.equal(await page.locator('#book-scheme').inputValue(),'');
 assert.equal(await page.locator('#book-base').inputValue(),'');
 assert.equal(await page.locator('#book-matching').inputValue(),'');
 await page.goto(base+'#/tools/graph.shortest_path/1');
 await page.getByRole('button',{name:'Use tool',exact:true}).click();
 await page.locator('#playground-input').fill(JSON.stringify({directed:false,vertices:['A','B'],edges:[]}));
 assert.equal(await page.locator('#graph-source').inputValue(),'');
 assert.equal(await page.locator('#graph-target').inputValue(),'');
 await page.close();
});


test('repeated book indexing does not apply canceled errors or duplicate the same analysis',{timeout:60000},async t=>{
 const {open,context}=await instrumentBrowser(t,{sourceFiles});
 await holdBookResponses(context);
 const page=await open('cipher.book.decode','book');
 const before=await page.evaluate(()=>window.instrumentCalls);
 await page.evaluate(()=>{window.holdBookOperation='text.word.lengths';});
 await page.locator('#book-index').click();await page.waitForFunction(()=>typeof window.releaseBookReply==='function');
 await page.locator('#book-index').focus();await page.keyboard.press('Enter');
 await page.evaluate(()=>window.releaseBookReply());
 await page.locator('#book-cell-0').waitFor();
 assert.equal(await page.locator('.instrument .error').count(),0);
 assert.equal(await page.evaluate(()=>window.instrumentCalls),before+3,'One index uses Core word spans, coordinate verification and source hashing exactly once.');
 await page.close();
});

test('earlier coordinate reports do not reselect keys in an edited geometry',{timeout:60000},async t=>{
 const {open}=await instrumentBrowser(t,{sourceFiles});
 const page=await open('text.keyboard.shift.encode','keyboard');
 await page.locator('#run-tools').click();await page.locator('#keyboard-position').waitFor();
 await page.locator('#keyboard-layout').selectOption('qwerty');
 await page.locator('#keyboard-source-base-ansi18').click();
 const calls=await page.evaluate(()=>window.instrumentCalls);
 await page.locator('#keyboard-position').focus();await page.keyboard.press('ArrowRight');
 assert.match(await page.locator('.keyboard-text-inspection + .selection-caption').textContent(),/physical key ansi18/,'An earlier report must not interpret its coordinates through the edited geometry.');
 assert.equal(await page.evaluate(()=>window.instrumentCalls),calls);
 await page.close();
});

test('new graph nodes do not conceal existing nodes when a source grows',{timeout:120000},async t=>{
 const {open}=await instrumentBrowser(t,{sourceFiles});
 const page=await open('graph.shortest_path','graph');
 const graph={directed:false,vertices:['A','B','C','D','E','F'],edges:[]};
 await page.locator('#playground-input').fill(JSON.stringify(graph));
 const before=await page.evaluate(()=>window.instrumentCalls);
 async function separated(){
  const nodes=await page.locator('.graph-node').evaluateAll(items=>items.map(node=>{const m=node.transform.baseVal.consolidate().matrix;return{name:node.textContent,x:m.e,y:m.f};}));
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)assert.ok(Math.hypot(nodes[i].x-nodes[j].x,nodes[i].y-nodes[j].y)>=50,`${nodes[i].name} and ${nodes[j].name} must remain individually visible`);
 }
 await separated();
 const a=await page.locator('.graph-node').first().getAttribute('transform');
 await page.locator('#graph-new-node').fill('G');await page.locator('#graph-add-node').click();
 await separated();
 assert.equal(await page.locator('.graph-node').first().getAttribute('transform'),a,'Adding a node retains existing layout');
 assert.equal(await page.evaluate(()=>window.instrumentCalls),before,'Layout allocation does not execute Core');
 await page.close();
});

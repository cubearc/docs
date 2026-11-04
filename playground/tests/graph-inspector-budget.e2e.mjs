import test from 'node:test';
import assert from 'node:assert/strict';
import {instrumentBrowser} from './support/instrument-browser.mjs';

test('selected-node inspector bounds incident edges without changing graph data or running Core',{timeout:60000},async t=>{
 const sourceFiles=process.env.INSTRUMENT_SOURCE==='1'?['instruments/workbench.mjs']:[];
 const {open}=await instrumentBrowser(t,{sourceFiles});
 const page=await open('graph.shortest_path','graph');
 const leaves=Array.from({length:150},(_,i)=>`Leaf${i}`);
 const data={directed:false,vertices:['Hub',...leaves],edges:leaves.map((to,i)=>({id:`edge${i}`,from:'Hub',to}))};
 const input=JSON.stringify(data);
 await page.locator('#playground-input').fill(input);
 await page.locator('#graph-inspect-Hub').waitFor();
 const calls=await page.evaluate(()=>window.instrumentCalls);
 await page.locator('#graph-inspect-Hub').click();
 const inspector=page.locator('.graph-node-inspector');
 assert.equal(await inspector.locator('li').count(),96,'The inspector must keep at most96 incident edge rows in the DOM.');
 assert.match(await inspector.textContent(),/Showing 96 of 150 incident edges/);
 assert.equal(await inspector.locator('li').first().textContent(),'edge0: Hub — Leaf0');
 assert.equal(await inspector.locator('li').last().textContent(),'edge95: Hub — Leaf95');
 assert.equal(await page.locator('#playground-input').inputValue(),input,'The complete graph remains exact.');
 assert.equal(await page.evaluate(()=>window.instrumentCalls),calls,'Selection is inspection only.');
 await page.close();
});

test('long incident edge labels stay within the narrow inspector without changing their values',{timeout:60000},async t=>{
 const sourceFiles=process.env.INSTRUMENT_SOURCE==='1'?['instruments/workbench.mjs','instruments/workbench.css']:[];
 const {open}=await instrumentBrowser(t,{sourceFiles});
 const page=await open('graph.shortest_path','graph');
 await page.setViewportSize({width:390,height:1000});
 const edge='edge_'+ 'unbroken'.repeat(80);
 const input=JSON.stringify({directed:false,vertices:['Hub','Leaf'],edges:[{id:edge,from:'Hub',to:'Leaf'}]});
 await page.locator('#playground-input').fill(input);
 await page.locator('#graph-inspect-Hub').click();
 assert.equal(await page.locator('.graph-node-inspector li').textContent(),`${edge}: Hub — Leaf`);
 const viewport=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
 assert.ok(viewport.scroll<=viewport.width,`Long edge labels must reflow: ${JSON.stringify(viewport)}`);
 assert.equal(await page.locator('#playground-input').inputValue(),input);
 await page.close();
});

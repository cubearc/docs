import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {instrumentBrowser} from './support/instrument-browser.mjs';
import {instrumentSeries} from '../src/instruments/registry.mjs';

// Actual browser geometry complements the gesture/keyboard tests. It does not
// qualify a physical touch device, native browser zoom or assistive technology.
test('all visual launchers retain their profile examples and usable narrow controls',{timeout:180000},async t=>{
 const {context,browser,base}=await instrumentBrowser(t);
 const report={browser:process.env.BROWSER_ENGINE??'chromium',version:browser.version(),scope:'Visible enabled HTML control geometry after loading canonical examples; no native-device or full accessibility conformance claim',checks:[]};
 t.after(async()=>{
  if(!process.env.PLAYGROUND_A11Y_REPORT)return;
  await mkdir(dirname(process.env.PLAYGROUND_A11Y_REPORT),{recursive:true});
  await writeFile(process.env.PLAYGROUND_A11Y_REPORT,JSON.stringify(report,null,2)+'\n');
 });
 for(const {kind} of instrumentSeries)await t.test(kind,async()=>{
  const page=await context.newPage();
  try{
   await page.goto(base+'#/tools');
   await page.getByText('Visual instruments · 20 workbenches',{exact:true}).click({timeout:45000});
   await page.locator(`[data-open-instrument="${kind}"]`).click();
   await page.locator('#load-core-example').click();
   await page.getByText('Synthetic Core example loaded. Run to produce your own result.',{exact:true}).waitFor();
   const view=page.locator(`[data-instrument="${kind}"]`);
   await view.locator('button,input,select,textarea').first().waitFor();
   const calls=await page.evaluate(()=>window.instrumentCalls);
   for(const width of [390,320]){
    await page.setViewportSize({width,height:1000});
    const measured=await view.evaluate(host=>{
     const controls=[...host.querySelectorAll('button,input:not([type="hidden"]),select,textarea,a[href],summary')].flatMap(node=>{
      if(node.disabled)return[];
      const target=node.matches('input[type="checkbox"],input[type="radio"]')?node.closest('label')??node:node;
      const rect=target.getBoundingClientRect(),style=getComputedStyle(target);
      if(!rect.width||!rect.height||style.visibility==='hidden'||style.display==='none'||node.closest('[hidden]'))return[];
      if(node.closest('details:not([open])')&&!node.matches('summary'))return[];
      return[{id:node.id,tag:node.tagName,label:node.getAttribute('aria-label')??node.textContent?.trim().slice(0,90),width:rect.width,height:rect.height,x:rect.x,y:rect.y}];
     });
     // SC2.5.8 permits an undersized target with sufficient separation:
     // https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
     const undersized=controls.filter(c=>c.width<24||c.height<24).map(target=>{
      const cx=target.x+target.width/2,cy=target.y+target.height/2;
      const conflicts=controls.filter(other=>other!==target).filter(other=>{
       if(other.width<24||other.height<24)return Math.hypot(cx-other.x-other.width/2,cy-other.y-other.height/2)<24;
       const x=Math.max(other.x,Math.min(cx,other.x+other.width)),y=Math.max(other.y,Math.min(cy,other.y+other.height));
       return Math.hypot(cx-x,cy-y)<12;
      }).map(other=>other.id||other.label);
      return{...target,conflicts};
     });
     return{controls:controls.length,minimumWidth:Math.min(...controls.map(c=>c.width)),minimumHeight:Math.min(...controls.map(c=>c.height)),undersized,applicationWidth:document.documentElement.scrollWidth,viewport:innerWidth};
    });
    report.checks.push({kind,width,...measured});
    assert.ok(measured.controls>0,`${kind}: visual controls remain available`);
    assert.deepEqual(measured.undersized.filter(target=>target.conflicts.length),[],`${kind}: enabled controls need24px targets or sufficient separation`);
    assert.ok(measured.applicationWidth<=width,`${kind}: application reflows at${width}px`);
   }
   assert.equal(await page.evaluate(()=>window.instrumentCalls),calls,'Viewport inspection does not execute Core');
  }finally{await page.close();}
 });
});

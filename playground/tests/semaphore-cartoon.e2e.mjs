import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {instrumentBrowser} from './support/instrument-browser.mjs';
import {armGeometry} from '../src/instruments/semaphore-figure.mjs';

test('illustrated semaphore retains controls, fits every direction and continues its exact output', {timeout:120000}, async t => {
  const {open}=await instrumentBrowser(t);
  const page=await open('symbol.semaphore.encode','semaphore');
  await page.locator('#playground-input').fill('AB');
  await page.locator('#run-tools').click();
  await page.locator('.semaphore-output pre').filter({hasText:'S,SW S,W'}).waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.semaphore-figure image')].length===3);
  await page.evaluate(async()=>Promise.all([...document.querySelectorAll('.semaphore-figure image')].map(node=>new Promise((resolve,reject)=>{
    const image=new Image();image.onload=resolve;image.onerror=()=>reject(new Error('Semaphore illustration failed to load'));image.src=node.getAttribute('href');
  }))));
  const calls=await page.evaluate(()=>window.instrumentCalls);
  const handle=await page.locator('.semaphore-handle').first().boundingBox();
  const target=await page.locator('.semaphore-figure').evaluate((drawing,[x,y])=>{
    const point=new DOMPoint(x,y).matrixTransform(drawing.getScreenCTM());
    return {x:point.x,y:point.y};
  },armGeometry('right','E').end);
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);
  await page.mouse.down();await page.mouse.move(target.x,target.y);await page.mouse.up();
  assert.equal(await page.locator('#visual-semaphore-right').inputValue(),'E','Dragging a flag uses the fitted artwork coordinates.');
  await page.locator('#visual-semaphore-right').selectOption('SW');
  assert.equal(await page.evaluate(()=>window.instrumentCalls),calls,'Dragging edits the draft pair without executing.');
  const folder=process.env.PLAYGROUND_EVIDENCE;
  if(folder)await mkdir(folder,{recursive:true});
  for(const side of ['left','right']){
    for(const value of ['N','NE','E','SE','S','SW','W','NW']){
      await page.locator(`#visual-semaphore-${side}`).selectOption(value);
      const clipped=await page.evaluate(()=>{
        const drawing=document.querySelector('.semaphore-figure');const box=drawing.getBoundingClientRect();
        return [...drawing.querySelectorAll('image')].flatMap(node=>{
          const b=node.getBBox(),matrix=node.getScreenCTM();
          const corners=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]];
          return corners.map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix)).filter(p=>p.x<box.left-1||p.x>box.right+1||p.y<box.top-1||p.y>box.bottom+1);
        }).length;
      });
      assert.equal(clipped,0,`${side} ${value}: all artwork fits`);
      if(folder)await page.locator('.semaphore-stage').screenshot({path:`${folder}/semaphore-${side}-${value}.png`});
    }
    await page.locator(`#visual-semaphore-${side}`).selectOption(side==='left'?'S':'SW');
  }
  assert.equal(await page.evaluate(()=>window.instrumentCalls),calls,'Inspections and direction edits do not execute');
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1100});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No application overflow');
    if(folder)await page.screenshot({path:`${folder}/semaphore-detailed-${width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1100});
  await page.locator('.semaphore-output button').filter({hasText:'Use as input'}).click();
  assert.equal(await page.locator('#playground-input').inputValue(),'S,SW S,W');
  assert.equal(await page.evaluate(()=>window.instrumentCalls),calls,'Continue does not execute');
});

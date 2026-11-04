// Presentation geometry only. Symbol correspondence and execution stay in Core.
export const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const origins = { left: [399, 181], right: [279, 181] };
const sprites = {
  left: { width:1024, height:1536, shoulder:[435,85], scale:.22, length:309 },
  right: { width:724, height:2172, shoulder:[245,140], scale:.17, length:335 },
};
const body = {x:170,y:65,width:340,height:510};
export function armGeometry(side, direction) {
  const origin=origins[side];
  const angle=directions.indexOf(direction)*Math.PI/4-Math.PI/2;
  return {origin,rotation:directions.indexOf(direction)*45-180,
    end:[origin[0]+Math.cos(angle)*sprites[side].length,origin[1]+Math.sin(angle)*sprites[side].length]};
}
export function directionAt(x,y,side) {
  const [ox,oy]=origins[side];
  const sector=(Math.round((Math.atan2(y-oy,x-ox)+Math.PI/2)/(Math.PI/4))+8)%8;
  return directions[sector];
}
function spriteCorners(side,direction) {
  const art=sprites[side];const {origin,rotation}=armGeometry(side,direction);const a=rotation*Math.PI/180;
  return [[0,0],[art.width,0],[0,art.height],[art.width,art.height]].map(([x,y])=>{
    const dx=(x-art.shoulder[0])*art.scale;const dy=(y-art.shoulder[1])*art.scale;
    return [origin[0]+dx*Math.cos(a)-dy*Math.sin(a),origin[1]+dx*Math.sin(a)+dy*Math.cos(a)];
  });
}
// Fit the current artwork, including a raised flag. A direction change never crops it.
export function figureBounds(left,right) {
  const points=[[body.x,body.y],[body.x+body.width,body.y+body.height],...spriteCorners('left',left),...spriteCorners('right',right),[20,35],[660,600]];
  const xs=points.map(p=>p[0]);const ys=points.map(p=>p[1]);
  const x=Math.min(...xs)-12;const y=Math.min(...ys)-12;
  return {x,y,width:Math.max(...xs)-x+12,height:Math.max(...ys)-y+12};
}
function svg(tag,attributes={},...children) {
  const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [key,value] of Object.entries(attributes)){
    if(key.startsWith('on'))node.addEventListener(key.slice(2).toLowerCase(),value);
    else node.setAttribute(key,String(value));
  }
  for(const child of children.flat())if(child)node.append(child);
  return node;
}
function artwork(name,attributes={}) {
  return svg('image',{href:new URL(`./assets/semaphore-${name}.png`,import.meta.url).href,...attributes,'aria-hidden':'true',style:'pointer-events:none'});
}
function arm(side,direction,onDirection) {
  const art=sprites[side];const {origin:[x,y],rotation,end}=armGeometry(side,direction);
  const setDirection=event=>{
    const drawing=event.currentTarget.ownerSVGElement;const transform=drawing.getScreenCTM();
    if(!transform)return;
    const point=drawing.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
    const local=point.matrixTransform(transform.inverse());
    onDirection(side,directionAt(local.x,local.y,side));
  };
  return svg('g',{},svg('g',{transform:`translate(${x} ${y}) rotate(${rotation})`},
    artwork(`${side}-arm`,{x:-art.shoulder[0]*art.scale,y:-art.shoulder[1]*art.scale,width:art.width*art.scale,height:art.height*art.scale})),
    svg('circle',{cx:end[0],cy:end[1],r:30,fill:'transparent',class:'semaphore-handle','aria-hidden':'true',
      onPointerdown:event=>event.currentTarget.setPointerCapture(event.pointerId),onPointerup:setDirection}));
}
export function flagFigure(api,left,right) {
  const setDirection=(side,value)=>{api.ui[side]=value;api.ui.pairResult=null;api.ui.pairError='';api.refresh();};
  const bounds=figureBounds(left,right);
  return svg('svg',{viewBox:`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`,class:'semaphore-figure',role:'img',
    style:`aspect-ratio:${bounds.width}/${bounds.height}`,
    'aria-label':`Facing sender. Anatomical left arm ${left}, right arm ${right}. Adjust with the direction selectors.`},
    svg('circle',{cx:340,cy:300,r:235,fill:'#f7f9fc',stroke:'#b5cbe3','stroke-dasharray':'5 7','stroke-width':1}),
    ...directions.map((direction,i)=>{
      const angle=i*Math.PI/4-Math.PI/2;const x=340+Math.cos(angle)*267;const y=300+Math.sin(angle)*267;
      const text=svg('text',{x,y:direction==='S'?598:y+5,'text-anchor':'middle',fill:'#344c69','font-size':16,'font-family':'Inter,system-ui,sans-serif'});
      text.textContent=direction;return text;
    }),
    artwork('body',body),arm('right',right,setDirection),arm('left',left,setDirection));
}

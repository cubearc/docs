/** Scheduling policy only. All transformations and validation stay in Core.
 * Unknown/new operations remain deliberate until their bounded behavior is reviewed. */
const lightweight = new Set([
  ...['base64','base32','base58','hex'].flatMap(name=>[`encoding.${name}.encode`,`encoding.${name}.decode`]),
  'text.utf8.encode','text.utf8.decode','text.reverse','text.lowercase','text.uppercase',
  'cipher.rot13','cipher.atbash','cipher.enigma',
  ...['caesar','affine','vigenere','scytale','polybius','book','alberti'].flatMap(name=>[`cipher.${name}.encode`,`cipher.${name}.decode`]),
  'cipher.cardan.extract','cipher.cardan.overlay','text.keyboard.remap',
  ...['coordinates','shift'].flatMap(name=>[`text.keyboard.${name}.encode`,`text.keyboard.${name}.decode`]),
  ...['morse','braille','semaphore','alphabet','a1z26'].flatMap(name=>[`symbol.${name}.encode`,`symbol.${name}.decode`]),
]);
const presets = {
  Decode:['encoding.base64.decode','encoding.hex.decode','encoding.base32.decode','encoding.base58.decode','cipher.rot13','cipher.atbash'],
  Encode:['encoding.base64.encode','encoding.hex.encode','encoding.base32.encode','encoding.base58.encode','cipher.rot13'],
};
export const inputBytes = value => value.type==='bytes' ? value.data.byteLength : new TextEncoder().encode(value.type==='text' ? value.data : JSON.stringify(value.data)).byteLength;
export function automaticPolicy(action,input,{parameters={},extraInputs={},slow=false}={}) {
  if(!action?.available)return {eligible:false,reason:action?.unavailableReason??'This operation is unavailable in this runtime.'};
  if(!lightweight.has(action.id)||action.contract.operation_version!==1||action.contract.policy?.grants_filesystem_access||action.contract.policy?.grants_network_access)
    return {eligible:false,reason:'Run explicitly for this operation. Searches, programs, media analysis and generation use deliberate execution.'};
  if(inputBytes(input)>4096)return {eligible:false,reason:'Input exceeds the 4-KiB automatic budget. Run explicitly with the original input.'};
  if(new TextEncoder().encode(JSON.stringify({parameters,extraInputs},(_,v)=>typeof v==='bigint'?v.toString():v)).byteLength>8192)
    return {eligible:false,reason:'Settings and secondary inputs exceed the 8-KiB automatic budget. Run explicitly.'};
  if(slow)return {eligible:false,reason:'This operation exceeded the live-update time budget. Run explicitly.'};
  return {eligible:true,reason:'Automatic updates · input up to 4 KiB'};
}
export function comparisonCandidates(runtime,mode,input) {
  const ids=input.type==='bytes'&&mode==='Decode'?['text.utf8.decode']:presets[mode]??presets.Decode;
  return ids.filter(id=>automaticPolicy(runtime.action(id),input).eligible);
}
export function manualComparisons(mode,input) {
  return input.type==='bytes'&&mode==='Decode'?['text.utf8.decode']:presets[mode]??presets.Decode;
}

/** One active preview and one replaceable pending edit, shared across mounts. */
export class PreviewScheduler {
  #pending;
  #timer;
  #active;
  schedule(task,delay=250) {
    this.cancel();this.#pending={task,ready:false};
    this.#timer=setTimeout(()=>{if(this.#pending){this.#pending.ready=true;this.#drain();}},delay);
  }
  cancel() { clearTimeout(this.#timer);this.#pending=undefined; }
  idle() { return this.#active??Promise.resolve(); }
  #drain() {
    if(this.#active||!this.#pending?.ready)return;
    const {task}=this.#pending;this.#pending=undefined;
    this.#active=Promise.resolve().then(task).finally(()=>{this.#active=undefined;this.#drain();});
    // The task reports its own execution failure to its workspace. Keep an
    // unexpected callback rejection from becoming an unhandled global error.
    this.#active.catch(()=>{});
  }
}

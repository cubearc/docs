export function h(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (name.startsWith('on')) element.addEventListener(name.slice(2).toLowerCase(), value);
    else if (name === 'class') element.className = value;
    else if (['value', 'checked', 'disabled', 'hidden', 'open', 'readOnly'].includes(name)) element[name] = value;
    else element.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}
export const button = (label, action, attributes = {}) => h('button', { type: 'button', onClick: action, ...attributes }, label);
export function append(element, ...children) {
  element.append(...children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false));
}
export function replace(element, ...children) {
  const activeId = element.contains(document.activeElement) ? document.activeElement.id : null;
  element.replaceChildren(...children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false));
  if (activeId) element.querySelector(`#${CSS.escape(activeId)}`)?.focus({ preventScroll: true });
}
export function notify(message) {
  const notice = document.querySelector('#notice');
  notice.textContent = message;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { notice.textContent = ''; }, 6000);
}
export function download(data, name, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = h('a', { href: url, download: name });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); notify('Copied the complete selected representation.'); }
  catch { notify('Clipboard access is unavailable. Download the result or select its text to copy.'); }
}

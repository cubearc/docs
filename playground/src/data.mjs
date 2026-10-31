/** Own each byte buffer, including views backed by SharedArrayBuffer. */
export function snapshot(value, seen = new Map()) {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  const result = Array.isArray(value) ? [] : {};
  seen.set(value, result);
  for (const [key, item] of Object.entries(value)) Object.defineProperty(result, key, { value: snapshot(item, seen), enumerable: true, writable: true, configurable: true });
  return result;
}

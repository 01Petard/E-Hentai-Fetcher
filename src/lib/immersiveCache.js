const entries = new Map();
const listeners = new Set();

function notify() {
  const stats = getImmersiveCacheStats();
  for (const listener of listeners) listener(stats);
}

export function getImmersiveCacheStats() {
  let ready = 0;
  for (const entry of entries.values()) if (entry.objectUrl) ready++;
  return {ready, loading: entries.size - ready};
}

export function subscribeImmersiveCache(listener) {
  listeners.add(listener);
  listener(getImmersiveCacheStats());
  return () => listeners.delete(listener);
}

export function cachedImmersiveImage(number) {
  return entries.get(number)?.objectUrl || '';
}

export function waitForImmersiveImage(number) {
  return entries.get(number)?.promise || Promise.resolve('');
}

export async function preloadImmersiveImage(number, url) {
  const existing = entries.get(number);
  if (existing) return existing.promise;
  const controller = new AbortController();
  const entry = {controller, objectUrl: '', promise: null};
  const params = new URLSearchParams({url, page: String(number), variant: 'preview'});
  entry.promise = fetch(`/api/image-download?${params}`, {signal: controller.signal}).then(async response => {
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('预载入图片失败');
    const blob = await response.blob();
    if (entries.get(number) !== entry) return '';
    entry.objectUrl = URL.createObjectURL(blob);
    notify();
    return entry.objectUrl;
  }).catch(() => {
    if (entries.get(number) === entry) {
      entries.delete(number);
      notify();
    }
    return '';
  });
  entries.set(number, entry);
  notify();
  return entry.promise;
}

export function clearImmersiveCache(keep = null) {
  for (const [number, entry] of entries) {
    if (keep?.has(number)) continue;
    entry.controller.abort();
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
    entries.delete(number);
  }
  notify();
}

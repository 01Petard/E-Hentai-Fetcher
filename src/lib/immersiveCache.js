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

export function immersivePreloadWindow(first, pageCount, total, beforeCount, afterCount) {
  const afterStart = first + pageCount;
  const afterEnd = Math.min(total, afterStart + afterCount - 1);
  const beforeStart = Math.max(1, first - beforeCount);
  const keep = new Set();
  for (let number = beforeStart; number < afterStart; number++) keep.add(number);
  for (let number = afterStart; number <= afterEnd; number++) keep.add(number);
  const queue = [];
  for (let offset = 0; offset < Math.max(afterCount, beforeCount); offset++) {
    if (afterStart + offset <= afterEnd) queue.push(afterStart + offset);
    if (first - 1 - offset >= beforeStart) queue.push(first - 1 - offset);
  }
  return {keep, queue};
}

export function cancelPendingImmersiveImages() {
  for (const [number, entry] of entries) {
    if (entry.objectUrl) continue;
    entry.controller.abort();
    entries.delete(number);
  }
  notify();
}

export async function preloadImmersiveImage(number, url) {
  const existing = entries.get(number);
  if (existing) return existing.promise;
  const controller = new AbortController();
  const entry = {controller, objectUrl: '', promise: null};
  const params = new URLSearchParams({url, page: String(number), variant: 'preview'});
  entry.promise = fetch(`/api/image-download?${params}`, {signal: controller.signal, priority: 'low'}).then(async response => {
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

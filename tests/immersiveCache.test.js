import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {
  cachedImmersiveImage,
  cancelPendingImmersiveImages,
  clearImmersiveCache,
  getImmersiveCacheStats,
  immersivePreloadWindow,
  preloadImmersiveImage,
} from '../src/lib/immersiveCache.js';

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
  clearImmersiveCache();
});

test('navigation cancels unfinished preloads while keeping completed images usable', async () => {
  let pendingSignal;
  globalThis.fetch = async (_url, options) => {
    if (!pendingSignal) {
      pendingSignal = options.signal;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }
    return new Response(new Blob(['image'], {type: 'image/png'}));
  };

  const pending = preloadImmersiveImage(1, 'https://example.com/1.png');
  const ready = await preloadImmersiveImage(2, 'https://example.com/2.png');
  assert.equal(cachedImmersiveImage(2), ready);

  cancelPendingImmersiveImages();
  assert.equal(pendingSignal.aborted, true);
  assert.equal(await pending, '');
  assert.equal(cachedImmersiveImage(2), ready);
  assert.deepEqual(getImmersiveCacheStats(), {ready: 1, loading: 0});
});

test('preload window keeps both sides and schedules nearby pages first', () => {
  const middle = immersivePreloadWindow(10, 2, 30, 3, 4);
  assert.deepEqual(middle.queue, [12, 9, 13, 8, 14, 7, 15]);
  assert.deepEqual([...middle.keep], [7, 8, 9, 10, 11, 12, 13, 14, 15]);

  const start = immersivePreloadWindow(1, 2, 5, 3, 4);
  assert.deepEqual(start.queue, [3, 4, 5]);
  assert.deepEqual([...start.keep], [1, 2, 3, 4, 5]);

  const end = immersivePreloadWindow(5, 1, 5, 3, 4);
  assert.deepEqual(end.queue, [4, 3, 2]);
  assert.deepEqual([...end.keep], [2, 3, 4, 5]);
});

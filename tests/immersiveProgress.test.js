import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';
import {clearImmersiveProgress, readImmersiveProgress, saveImmersiveProgress} from '../src/lib/immersiveProgress.js';

const originalStorage = globalThis.localStorage;
const values = new Map();
before(() => {
  globalThis.localStorage = {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
});
after(() => { globalThis.localStorage = originalStorage; });

test('progress resumes within one tab and persists only when enabled', () => {
  const first = 'https://e-hentai.org/g/123/token/?p=2';
  const second = 'https://e-hentai.org/g/456/other/';
  clearImmersiveProgress();
  saveImmersiveProgress(first, 17, false);
  assert.equal(readImmersiveProgress('https://e-hentai.org/g/123/token/', 50, false), 17);
  assert.equal(readImmersiveProgress(second, 50, false), 1);
  assert.equal(values.size, 0);
  saveImmersiveProgress(first, 19, true);
  assert.equal(readImmersiveProgress(first, 50, true), 19);
  assert.equal(values.size, 1);
  assert.equal(readImmersiveProgress(first, 10, true), 1);
});

test('reset clears gallery progress without deleting unrelated configuration', () => {
  values.set('gallery-lens.preferences', '{}');
  saveImmersiveProgress('https://e-hentai.org/g/1/a/', 4, true);
  saveImmersiveProgress('https://e-hentai.org/g/2/b/', 6, true);
  clearImmersiveProgress();
  assert.equal(readImmersiveProgress('https://e-hentai.org/g/1/a/', 10, true), 1);
  assert.deepEqual([...values.keys()], ['gallery-lens.preferences']);
});

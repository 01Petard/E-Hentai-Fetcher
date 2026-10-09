import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeConfiguration, readConfiguration, writeConfiguration, normalizeConfiguration, defaultPreferences, defaultSearchDisplay, preferencesKey} from '../src/lib/configuration.js';

function storage() {
  const data = new Map();
  return {getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key)};
}
function snapshot(store) { return readConfiguration(store, JSON.parse(store.getItem('gallery-lens.quick-links') || '[]'), structuredClone(defaultSearchDisplay)); }

test('new installation creates complete defaults and fills older preferences without resetting choices', () => {
  const store = storage();
  initializeConfiguration(store);
  assert.deepEqual(snapshot(store).preferences, defaultPreferences);
  assert.deepEqual(snapshot(store).gallery, {pageSize: 20, columns: 10, commentsCollapsed: false});
  store.setItem(preferencesKey, JSON.stringify({useEx: true, translateTags: false}));
  store.setItem('gallery-lens.gallery-page-size', '80');
  initializeConfiguration(store);
  assert.equal(snapshot(store).preferences.useEx, true);
  assert.equal(snapshot(store).preferences.translateTags, false);
  assert.equal(snapshot(store).preferences.privacyMode, false);
  assert.equal(snapshot(store).gallery.pageSize, 80);
});

test('complete configuration round trips across computers, excluding credentials, caches and progress', () => {
  const source = storage();
  initializeConfiguration(source);
  source.setItem(preferencesKey, JSON.stringify({...defaultPreferences, immersiveImageSnap: true, immersiveSaveProgress: true, useLowFidelityPreview: true, cookie: 'excluded'}));
  source.setItem('gallery-lens.gallery-page-size', '60');
  source.setItem('gallery-lens.gallery-columns', '4');
  source.setItem('gallery-lens.comments-collapsed', '1');
  source.setItem('gallery-lens.quick-links', JSON.stringify([{label: 'Second', url: 'https://exhentai.org/?f_search=test', sortOrder: 2}, {label: 'First', url: '/uploader/test', sortOrder: 1}]));
  const exported = snapshot(source);
  assert.equal(JSON.stringify(exported).includes('cookie'), false);
  const target = storage();
  target.setItem('gallery-lens.immersive-progress:/g/1/a', 'keep progress');
  target.setItem('gallery-lens.cache-scope', 'keep cache');
  writeConfiguration(target, {...exported, cookie: 'ignore', cache: 'ignore', history: 'ignore'});
  assert.deepEqual(snapshot(target), exported);
  assert.equal(target.getItem('gallery-lens.immersive-progress:/g/1/a'), 'keep progress');
  assert.equal(target.getItem('gallery-lens.cache-scope'), 'keep cache');
  assert.equal(target.getItem('cookie'), null);
  assert.equal(exported.quickLinks[1].url, '/?f_search=test');
});

test('invalid files are rejected before any settings are written', () => {
  const store = storage();
  initializeConfiguration(store);
  const original = snapshot(store);
  for (const mutate of [c => c.version = 99, c => c.gallery.pageSize = 21, c => c.gallery.columns = 0, c => c.preferences.privacyMode = 'true', c => c.preferences.loadingStyle = 'unknown', c => c.quickLinks = [{label: 'Bad', url: 'https://evil.example/'}], c => c.search.filters.f_sh = 'false']) {
    const config = structuredClone(original);
    mutate(config);
    assert.throws(() => writeConfiguration(store, config));
    assert.deepEqual(snapshot(store), original);
  }
  assert.throws(() => normalizeConfiguration(null));
});

test('storage failure rolls back settings rather than leaving a partially restored configuration', () => {
  const store = storage();
  initializeConfiguration(store);
  const original = snapshot(store);
  const config = structuredClone(original);
  config.preferences.useEx = true;
  const set = store.setItem;
  let fail = true;
  store.setItem = (key, value) => {
    if (key === 'gallery-lens.gallery-columns' && fail) { fail = false; throw new Error('storage full'); }
    set(key, value);
  };
  assert.throws(() => writeConfiguration(store, config), /storage full/);
  assert.deepEqual(snapshot(store), original);
});

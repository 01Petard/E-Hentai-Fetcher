import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';

// Execute the search orchestration with controlled requests, without mounting unrelated UI.
const source = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
const search = source.slice(source.indexOf('async function runSearch('), source.indexOf('\nasync function onCacheScopeChange('));
const oldResult = {items: [{title: 'Previous gallery'}], pages: {}, total: 1};
function setup() {
  const requests = [];
  const state = {
    searchVersion: 0, disposed: false, preferences: {useEx: false},
    sourceUrl: url => url, URL,
    searchLoader: {load: () => new Promise((resolve, reject) => requests.push({resolve, reject}))},
    enrichPostedTimes() {},
  };
  for (const [key, value] of Object.entries({result: oldResult, loading: false, loadedUrl: 'https://e-hentai.org/?f_search=old',
    error: '', rawResponse: '', requestUrl: '', cookieConfigured: true, pageIndex: 0, pageSize: 1})) {
    state[key] = {value};
  }
  return {state, requests, runSearch: runInNewContext(`${search}\nrunSearch`, state)};
}

test('a pending new search clears previous results immediately and stays clear on failure', async () => {
  const {state, requests, runSearch} = setup();
  const pending = runSearch('https://e-hentai.org/?f_search=new', 0);
  const cleared = state.result.value;
  const loading = state.loading.value;
  requests[0].reject(new Error('offline'));
  await pending;
  assert.equal(cleared, null);
  assert.equal(loading, true);
  assert.equal(state.result.value, null);
  assert.equal(state.error.value, 'offline');
  assert.equal(state.loading.value, false);
});

test('an older search response cannot replace the latest empty search result', async () => {
  const {state, requests, runSearch} = setup();
  const first = runSearch('https://e-hentai.org/?f_search=first', 0);
  const second = runSearch('https://e-hentai.org/?f_search=empty', 0);
  const empty = {items: [], pages: {}, total: 0};
  requests[1].resolve({result: empty});
  await second;
  requests[0].resolve({result: oldResult});
  await first;
  assert.equal(state.result.value, empty);
  assert.equal(state.error.value, '');
  assert.equal(state.loading.value, false);
});

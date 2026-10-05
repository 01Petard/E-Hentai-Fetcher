import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createSearchResultsLoader} from '../src/lib/searchResults.js';
import {buildTagSearchIndex} from '../src/lib/tagSearchIndex.js';

const url = 'https://e-hentai.org/?f_search=test';
const parsed = () => ({hasTable: true, items: [{title: 'Gallery', published: '2026-10-01', tagGroups: []}], pages: {}, total: 1});
function setup(options = {}) {
  const values = new Map();
  const storage = options.storage || {getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value)};
  const calls = [];
  const loader = createSearchResultsLoader({storage, scope: options.scope || (() => ''), now: options.now || (() => 0), fetchPage: async target => {
    calls.push(target);
    return options.fetchPage ? options.fetchPage(target) : parsed();
  }});
  return {loader, calls, storage};
}

test('repeat searches, cursor pages and return navigation reuse cached results', async () => {
  const {loader, calls, storage} = setup();
  await loader.load(url);
  await loader.load(`${url}&next=100`);
  assert.equal((await loader.load(url)).fromCache, true);
  assert.equal(calls.length, 2);
  const returnedDocument = setup({storage});
  assert.equal((await returnedDocument.loader.load(`${url}&next=100`)).fromCache, true);
  assert.equal(returnedDocument.calls.length, 0);
});

test('same pending searches share one request and failures are retryable', async () => {
  let resolve;
  const pending = new Promise(ok => {resolve = ok;});
  const {loader, calls} = setup({fetchPage: () => pending});
  const first = loader.load(url);
  const second = loader.load(url);
  assert.equal(calls.length, 1);
  resolve(parsed());
  assert.deepEqual(await first, await second);
  let fail = true;
  const retry = setup({fetchPage: () => {if (fail) throw new Error('offline'); return parsed();}});
  await assert.rejects(retry.loader.load(url), /offline/);
  fail = false;
  await retry.loader.load(url);
  assert.equal(retry.calls.length, 2);
});

test('expiry and explicit reload fetch fresh data without mixing source sites', async () => {
  let clock = 0;
  const {loader, calls} = setup({now: () => clock});
  await loader.load(url);
  await loader.load(url, {force: true});
  clock = 2 * 60 * 1000;
  await loader.load(url);
  await loader.load(url.replace('e-hentai.org', 'exhentai.org'));
  assert.equal(calls.length, 4);
});

test('Cookie changes invalidate persisted pages and prevent old requests from populating new caches', async () => {
  let scope = 'a';
  let resolve;
  const pending = new Promise(ok => {resolve = ok;});
  const first = setup({scope: () => scope, fetchPage: () => pending});
  const request = first.loader.load(url);
  scope = 'b';
  resolve(parsed());
  await request;
  const next = setup({storage: first.storage, scope: () => scope});
  await next.loader.load(url);
  assert.equal(next.calls.length, 1);
  scope = 'c';
  await next.loader.load(url);
  assert.equal(next.calls.length, 2);
});

test('view mutations are isolated and enriched dates survive return navigation', async () => {
  const {loader, storage} = setup();
  const first = await loader.load(url);
  first.result.items[0].title = 'Local mutation';
  assert.equal((await loader.load(url)).result.items[0].title, 'Gallery');
  const enriched = (await loader.load(url)).result;
  enriched.items[0].published = '2026-10-01 12:00:00';
  enriched.postedEnriched = true;
  loader.update(url, enriched);
  const next = setup({storage});
  const cached = await next.loader.load(url);
  assert.equal(cached.result.items[0].published, '2026-10-01 12:00:00');
  assert.equal(cached.result.postedEnriched, true);
});

test('disabled storage does not prevent cache hits or normal searching', async () => {
  const {loader, calls} = setup({storage: {getItem() {throw new Error('blocked');}, setItem() {throw new Error('full');}}});
  await loader.load(url);
  await loader.load(url);
  assert.equal(calls.length, 1);
});

test('translation indexing yields before processing and between batches, retaining lookup semantics', async () => {
  const translations = Object.fromEntries(Array.from({length: 450}, (_, i) => [`F:TAG${i}`, `中文${i}`]));
  let processed = 0;
  const pauses = [];
  const index = await buildTagSearchIndex(translations, {plainText: value => {processed++; return value;}, yieldControl: async () => {pauses.push(processed);}});
  assert.equal(pauses[0], 0);
  assert.ok(pauses.length >= 3);
  assert.equal(index.length, 450);
  assert.deepEqual(index[0], {key: 'F:TAG0', keyLower: 'f:tag0', name: '中文0', nameLower: '中文0'});
});

test('superseded or disposed tag indexing stops without replacing the current index', async () => {
  let current = true;
  let processed = 0;
  let pauses = 0;
  const translations = Object.fromEntries(Array.from({length: 450}, (_, i) => [`tag${i}`, `name${i}`]));
  const index = await buildTagSearchIndex(translations, {plainText: value => {processed++; return value;}, isCurrent: () => current, yieldControl: async () => {if (++pauses === 2) current = false;}});
  assert.equal(index, null);
  assert.ok(processed > 0 && processed < 450);
});

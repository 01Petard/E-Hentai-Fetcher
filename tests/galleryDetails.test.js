import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createGalleryDetailsLoader} from '../src/lib/galleryDetails.js';

const base = 'https://e-hentai.org/g/123/abc/';
function storage() {
  const values = new Map();
  return {getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value)};
}
function fixture(index, total = 100) {
  return {
    title: 'Gallery', metadata: [], sourcePageSize: 20, sourcePageCount: Math.ceil(total / 20), totalImages: total,
    images: Array.from({length: Math.min(20, total - index * 20)}, (_, offset) => ({number: index * 20 + offset + 1, url: `image-${index * 20 + offset + 1}`})),
  };
}
function setup({store = storage(), scope = () => '', now = () => 0, fetchPage} = {}) {
  const calls = [];
  const loader = createGalleryDetailsLoader({storage: store, scope, now, parsePage: page => page, fetchPage: async url => {
    const index = Number(new URL(url).searchParams.get('p'));
    calls.push(url);
    return fetchPage ? fetchPage(index) : fixture(index);
  }});
  const load = (options = {}) => {
    let overview;
    let images;
    return loader.load({target: base, pageSize: 20, onOverview: (value, index) => {overview = {...value, index};}, onImages: value => {images = value;}, ...options}).then(() => ({overview, images}));
  };
  return {calls, load, store};
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => {resolve = ok; reject = fail;});
  return {promise, resolve, reject};
}

test('warm pagination skips page zero and a new loader reuses tab storage', async () => {
  const first = setup();
  await first.load();
  const secondPage = await first.load({requestedPage: 1});
  assert.equal(first.calls.length, 2);
  assert.equal(secondPage.images[0].number, 21);
  await first.load();
  assert.equal(first.calls.length, 2);
  const nextDocument = setup({store: first.store});
  assert.equal((await nextDocument.load({requestedPage: 1})).images.at(-1).number, 40);
  assert.equal(nextDocument.calls.length, 0);
});

test('overview and first images arrive before slow pages, with stable ordering', async () => {
  const slow = deferred();
  const last = deferred();
  const ready = deferred();
  const batches = [];
  let overview;
  const {load} = setup({fetchPage: index => index === 1 ? slow.promise : index === 2 ? last.promise : fixture(index)});
  const loading = load({pageSize: 60, onOverview: value => {overview = value;}, onImages: value => {batches.push(value); ready.resolve();}});
  await ready.promise;
  assert.equal(overview.totalImages, 100);
  assert.equal(batches[0].length, 20);
  last.resolve(fixture(2));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(batches.at(-1).map(image => image.number), [...Array.from({length: 20}, (_, i) => i + 1), ...Array.from({length: 20}, (_, i) => i + 41)]);
  slow.resolve(fixture(1));
  await loading;
  assert.deepEqual(batches.at(-1).map(image => image.number), Array.from({length: 60}, (_, i) => i + 1));
});

test('concurrent loads share the same upstream request', async () => {
  const first = deferred();
  const {calls, load} = setup({fetchPage: () => first.promise});
  const loads = [load(), load()];
  assert.equal(calls.length, 1);
  first.resolve(fixture(0));
  await Promise.all(loads);
  assert.equal(calls.length, 1);
});

test('partial failure retains successful pages and retries only the missing page', async () => {
  let failed = true;
  const {calls, load} = setup({fetchPage: index => {
    if (index === 1 && failed) throw new Error('upstream failed');
    return fixture(index);
  }});
  let images;
  await assert.rejects(load({pageSize: 40, onImages: value => {images = value;}}), /upstream failed/);
  assert.equal(images.length, 20);
  failed = false;
  assert.equal((await load({pageSize: 40})).images.length, 40);
  assert.equal(calls.length, 3);
});

test('expired and changed-account caches are refetched, including stored pages', async () => {
  let clock = 0;
  let account = 'a';
  const first = setup({now: () => clock, scope: () => account});
  await first.load();
  clock = 5 * 60 * 1000;
  await first.load();
  assert.equal(first.calls.length, 2);
  account = 'b';
  await first.load();
  assert.equal(first.calls.length, 3);
  const otherAccount = setup({store: first.store, scope: () => 'c'});
  await otherAccount.load();
  assert.equal(otherAccount.calls.length, 1);
});

test('a response from before a Cookie change cannot populate the new cache', async () => {
  let account = 'a';
  const old = deferred();
  const store = storage();
  const first = setup({store, scope: () => account, fetchPage: () => old.promise});
  const request = first.load();
  account = 'b';
  old.resolve(fixture(0));
  await request;
  const next = setup({store, scope: () => account});
  await next.load();
  assert.equal(next.calls.length, 1);
});

test('deep links, last-page limits and source sites preserve pagination semantics', async () => {
  const {load, calls} = setup({fetchPage: index => fixture(index, 45)});
  const deep = await load({target: `${base}?p=2`, pageSize: 40});
  assert.equal(deep.overview.index, 1);
  assert.deepEqual(deep.images.map(image => image.number), [41, 42, 43, 44, 45]);
  const invalid = await load({requestedPage: -1});
  assert.equal(invalid.overview.index, 0);
  const end = await load({requestedPage: 999});
  assert.equal(end.overview.index, 2);
  await load({target: base.replace('e-hentai.org', 'exhentai.org')});
  assert.equal(calls.filter(url => url.includes('exhentai.org')).length, 1);
});

test('blocked storage still permits loading and memory cache hits', async () => {
  const {calls, load} = setup({store: {getItem() {throw new Error('blocked');}, setItem() {throw new Error('full');}}});
  await load();
  await load();
  assert.equal(calls.length, 1);
});

test('missing catalog entries produce a retryable failure rather than permanent silent placeholders', async () => {
  let missing = true;
  const {load, calls} = setup({fetchPage: index => missing ? {...fixture(index), images: []} : fixture(index)});
  let overview;
  await assert.rejects(load({onOverview: value => {overview = value;}}), /部分图片目录未能加载/);
  assert.equal(overview.title, 'Gallery');
  missing = false;
  assert.equal((await load()).images.length, 20);
  assert.equal(calls.length, 2);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {archiveImageName, collectGalleryImages, downloadGalleryImage, failedPagesText, selectedRange} from '../src/lib/galleryDownload.js';

test('selectedRange validates whole gallery and inclusive image numbers', () => {
  assert.deepEqual(selectedRange('all', '', '', 45), {start: 1, end: 45});
  assert.deepEqual(selectedRange('range', '19', '42', 45), {start: 19, end: 42});
  assert.throws(() => selectedRange('range', '0', '3', 45), /页码范围/);
  assert.throws(() => selectedRange('range', '4', '46', 45), /页码范围/);
  assert.throws(() => selectedRange('range', '8', '7', 45), /页码范围/);
});

test('collectGalleryImages crosses source pages and rejects missing images', async () => {
  const gallery = {source: 'https://e-hentai.org/g/1/abcdef/', totalImages: 6, sourcePageSize: 2, sourcePageCount: 3};
  const requested = [];
  const fetchSource = async url => { requested.push(url); return url; };
  const parsePage = (_html, url) => {
    const index = Number(new URL(url).searchParams.get('p') || 0);
    return {totalImages: 6, sourcePageSize: 2, images: [1, 2].map(offset => ({number: index * 2 + offset, url: `${url}#${offset}`}))};
  };
  const images = await collectGalleryImages(gallery, 2, 5, fetchSource, parsePage);
  assert.deepEqual(images.map(image => image.number), [2, 3, 4, 5]);
  assert.equal(requested.length, 3);
  await assert.rejects(collectGalleryImages(gallery, 2, 5, fetchSource, (html, url) => {
    const page = parsePage(html, url);
    page.images = page.images.filter(image => image.number !== 4);
    return page;
  }), /缺少第 4 页/);
});

test('collectGalleryImages accepts a shorter final source page', async () => {
  const gallery = {source: 'https://e-hentai.org/g/1/abcdef/', totalImages: 5, sourcePageSize: 2, sourcePageCount: 3};
  const images = await collectGalleryImages(gallery, 4, 5, async url => url, (_html, url) => {
    const index = Number(new URL(url).searchParams.get('p') || 0);
    return {totalImages: 5, sourcePageSize: index === 2 ? 1 : 2,
      images: index === 1 ? [{number: 3, url: '3'}, {number: 4, url: '4'}] : [{number: 5, url: '5'}]};
  });
  assert.deepEqual(images.map(image => image.number), [4, 5]);
});

test('downloadGalleryImage retries original then falls back only in preferred mode', async () => {
  const calls = [];
  const deps = {
    fetchSource: async () => '<html/>',
    parseImageDetail: () => ({original: 'https://e-hentai.org/fullimg.php?x=1', image: 'https://a.hath.network/a.jpg'}),
    fetchBinary: async (url, number, variant) => {
      calls.push(variant);
      if (variant === 'original') throw new Error('original unavailable');
      return {blob: new Blob(['image'], {type: 'image/jpeg'}), mime: 'image/jpeg'};
    },
  };
  const item = {number: 3, url: 'https://e-hentai.org/s/a/1-3'};
  const preferred = await downloadGalleryImage(item, 'preferred', deps);
  assert.equal(preferred.quality, 'preview');
  assert.deepEqual(calls, ['original', 'original', 'original', 'original', 'preview']);
  calls.length = 0;
  await assert.rejects(downloadGalleryImage(item, 'original', deps), /original unavailable/);
  assert.deepEqual(calls, ['original', 'original', 'original', 'original']);
});

test('downloadGalleryImage keeps the original when it succeeds after a retry', async () => {
  const calls = [];
  const image = await downloadGalleryImage({number: 2, url: 'https://e-hentai.org/s/a/1-2'}, 'preferred', {
    fetchSource: async () => '<html/>',
    parseImageDetail: () => ({original: 'https://e-hentai.org/fullimg.php?x=2', image: 'https://a.hath.network/a.jpg'}),
    fetchBinary: async (_url, _number, variant) => {
      calls.push(variant);
      if (calls.length === 1) throw new Error('temporary failure');
      return {blob: new Blob(['original'], {type: 'image/png'}), mime: 'image/png'};
    },
  });
  assert.equal(image.quality, 'original');
  assert.deepEqual(calls, ['original', 'original']);
});

test('forced original fails when the source page has no original link', async () => {
  const item = {number: 1, url: 'https://e-hentai.org/s/a/1-1'};
  await assert.rejects(downloadGalleryImage(item, 'original', {
    fetchSource: async () => '<html/>',
    parseImageDetail: () => ({image: 'https://a.hath.network/a.jpg'}),
    fetchBinary: async () => { throw new Error('should not fetch'); },
  }), /未提供原图/);
});

test('archive names preserve gallery page numbers and missing page list', () => {
  assert.equal(archiveImageName(120, 7, 'image/png'), '007.png');
  assert.equal(archiveImageName(1200, 7, 'image/jpeg'), '0007.jpg');
  assert.match(failedPagesText([{number: 4, error: '下载失败'}, {number: 9, error: '未提供原图'}]), /4: 下载失败\n9: 未提供原图/);
});

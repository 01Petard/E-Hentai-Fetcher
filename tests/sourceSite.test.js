import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {test} from 'node:test';
import {handleApiRequest} from '../server/api.js';
import {buildSearchUrl} from '../src/lib/search.js';
import {displayImageUrl, sourceUrl} from '../src/lib/sourceSite.js';

test('EX preference switches search, saved links, and pagination to the selected source', () => {
  assert.equal(buildSearchUrl('artist:test', {advanced: false}), 'https://e-hentai.org/?f_search=artist:test');
  assert.equal(buildSearchUrl('artist:test', {advanced: false}, true), 'https://exhentai.org/?f_search=artist:test');
  assert.equal(sourceUrl('https://e-hentai.org/g/123/abc/?p=2', true), 'https://exhentai.org/g/123/abc/?p=2');
  assert.equal(sourceUrl('/?f_search=AHY', true), 'https://exhentai.org/?f_search=AHY');
  assert.equal(sourceUrl('https://exhentai.org/s/abc/123-1', false), 'https://e-hentai.org/s/abc/123-1');
  assert.equal(sourceUrl('https://exhentai.org.evil.example/g/1/a', true), '');
  assert.equal(displayImageUrl('https://s.exhentai.org/w/02/647/89280-q2yabshj.webp'),
    '/api/ex-cover?url=https%3A%2F%2Fs.exhentai.org%2Fw%2F02%2F647%2F89280-q2yabshj.webp');
  assert.equal(displayImageUrl('https://ehgt.org/w/01/636/72010-6squz2dd.webp'),
    'https://ehgt.org/w/01/636/72010-6squz2dd.webp');
});

test('proxy accepts EX addresses while rejecting other hosts', async () => {
  const server = createServer((request, response) => handleApiRequest(request, response));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const send = url => fetch(`http://127.0.0.1:${server.address().port}/fetch`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({url, cookie: 'test=1', userAgent: 'bad\nagent', extended: true}),
    });
    const allowed = await send('https://exhentai.org/g/123/abc/');
    assert.equal(allowed.status, 400);
    assert.deepEqual(await allowed.json(), {error: 'User-Agent 无效'});
    const blocked = await send('https://exhentai.org.evil.example/g/123/abc/');
    assert.equal(blocked.status, 400);
    assert.deepEqual(await blocked.json(), {error: '仅允许请求 E-Hentai 或 ExHentai 的 HTTPS 地址'});
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('torrent endpoint accepts EX torrent links from the response HTML', async () => {
  const server = createServer((request, response) => handleApiRequest(request, response));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/torrent-download`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        url: 'https://exhentai.org/torrent/3828032/5693174-rsvlej9ujmo2pz23845/f0453c949bd247c87e3cc8eadbf9b471f23be36b.torrent',
        userAgent: 'bad\nagent', site: 'exhentai.org',
      }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {error: 'User-Agent 无效'});
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

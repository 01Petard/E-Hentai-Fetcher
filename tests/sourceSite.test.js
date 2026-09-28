import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {test} from 'node:test';
import {handleApiRequest} from '../server/api.js';
import {buildSearchUrl} from '../src/lib/search.js';
import {sourceUrl} from '../src/lib/sourceSite.js';

test('EX preference switches search, saved links, and pagination to the selected source', () => {
  assert.equal(buildSearchUrl('artist:test', {advanced: false}), 'https://e-hentai.org/?f_search=artist:test');
  assert.equal(buildSearchUrl('artist:test', {advanced: false}, true), 'https://exhentai.org/?f_search=artist:test');
  assert.equal(sourceUrl('https://e-hentai.org/g/123/abc/?p=2', true), 'https://exhentai.org/g/123/abc/?p=2');
  assert.equal(sourceUrl('/?f_search=AHY', true), 'https://exhentai.org/?f_search=AHY');
  assert.equal(sourceUrl('https://exhentai.org/s/abc/123-1', false), 'https://e-hentai.org/s/abc/123-1');
  assert.equal(sourceUrl('https://exhentai.org.evil.example/g/1/a', true), '');
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

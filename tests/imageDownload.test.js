import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createServer} from 'node:http';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
import {test} from 'node:test';
import {PassThrough} from 'node:stream';
import {handleApiRequest} from '../server/api.js';

test('image download accepts e-hentai fullimg paths before checking page number', async () => {
  const server = createServer((request, response) => handleApiRequest(request, response));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const original = 'https://e-hentai.org/fullimg/4208121/4/p6djx1qans3/belfast06_4.jpg';
    const params = new URLSearchParams({url: original, page: '0', variant: 'original'});
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/image-download?${params}`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {error: '图片页码无效'});
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('image download keeps the original filename from its URL', async () => {
  const originalRequest = https.request;
  https.request = (_url, _options, callback) => {
    const upstream = new EventEmitter();
    upstream.end = () => {
      const incoming = new PassThrough();
      incoming.statusCode = 200;
      incoming.headers = {'content-type': 'image/jpeg'};
      callback(incoming);
      incoming.end('image');
    };
    return upstream;
  };
  syncBuiltinESMExports();
  const server = createServer((request, response) => handleApiRequest(request, response));
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    for (const [original, expected] of [
      ['https://e-hentai.org/fullimg/4208121/4/p6djx1qans3/belfast06_4.jpg', 'filename="belfast06_4.jpg"'],
      ['https://e-hentai.org/fullimg/4208121/4/p6djx1qans3/%E5%9B%BE%E7%89%87.jpg', "filename*=UTF-8''%E5%9B%BE%E7%89%87.jpg"],
    ]) {
      const params = new URLSearchParams({url: original, page: '4', variant: 'original'});
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/image-download?${params}`);
      assert.equal(response.status, 200);
      assert.ok(response.headers.get('content-disposition').includes(expected));
      assert.equal(await response.text(), 'image');
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    https.request = originalRequest;
    syncBuiltinESMExports();
  }
});

test('aborting the browser request closes the upstream image request', async () => {
  const originalRequest = https.request;
  let upstream;
  https.request = (_url, _options, callback) => {
    upstream = new EventEmitter();
    upstream.end = () => {
      const incoming = new PassThrough();
      incoming.statusCode = 200;
      incoming.headers = {'content-type': 'image/jpeg'};
      callback(incoming);
      incoming.write('first chunk');
    };
    upstream.destroy = () => { upstream.destroyed = true; upstream.emit('error', new Error('aborted')); };
    return upstream;
  };
  syncBuiltinESMExports();
  const server = createServer((request, response) => handleApiRequest(request, response));
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const controller = new AbortController();
    const params = new URLSearchParams({url: 'https://e-hentai.org/fullimg/1/1/abc/a.jpg', page: '1', variant: 'original'});
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/image-download?${params}`, {signal: controller.signal});
    assert.equal(response.status, 200);
    controller.abort();
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(upstream.destroyed, true);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    https.request = originalRequest;
    syncBuiltinESMExports();
  }
});

test('image proxy rejects non-image upstream content', async () => {
  const originalRequest = https.request;
  https.request = (_url, _options, callback) => {
    const upstream = new EventEmitter();
    upstream.end = () => {
      const incoming = new PassThrough();
      incoming.statusCode = 200;
      incoming.headers = {'content-type': 'text/html'};
      callback(incoming);
      incoming.end('<html>quota exceeded</html>');
    };
    return upstream;
  };
  syncBuiltinESMExports();
  const server = createServer((request, response) => handleApiRequest(request, response));
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const params = new URLSearchParams({url: 'https://e-hentai.org/fullimg/1/1/abc/a.jpg', page: '1', variant: 'original'});
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/image-download?${params}`);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {error: '请求失败或目标站点不可用'});
  } finally {
    await new Promise(resolve => server.close(resolve));
    https.request = originalRequest;
    syncBuiltinESMExports();
  }
});

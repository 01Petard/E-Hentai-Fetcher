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

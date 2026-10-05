import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createServer} from 'node:http';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
import {PassThrough} from 'node:stream';
import {test} from 'node:test';
import {handleApiRequest} from '../server/api.js';

test('gallery fetch reuses a bounded proxy agent and adds timings without changing its JSON contract', async () => {
  const originalRequest = https.request;
  const originalProxy = process.env.HTTPS_PROXY;
  process.env.HTTPS_PROXY = 'http://127.0.0.1:12345';
  const agents = [];
  https.request = (_url, options, callback) => {
    agents.push(options.agent);
    const request = new EventEmitter();
    request.end = () => {
      const response = new PassThrough();
      response.statusCode = 200;
      response.statusMessage = 'OK';
      response.headers = {'content-type': 'text/html; charset=utf-8'};
      callback(response);
      response.end('<html>Gallery</html>');
    };
    return request;
  };
  syncBuiltinESMExports();
  const server = createServer((request, response) => handleApiRequest(request, response));
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    for (let i = 0; i < 2; i++) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/fetch`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({url:'https://e-hentai.org/g/123/abc/', cookie:'test=1', userAgent:'Gallery-Test', extended:true}),
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('server-timing'), /^upstream_headers;dur=\d+\.\d, upstream_body;dur=\d+\.\d$/);
      assert.deepEqual(await response.json(), {status:200, reason:'OK', headers:{'content-type':'text/html; charset=utf-8'}, body:'<html>Gallery</html>'});
    }
    assert.equal(agents[0], agents[1]);
    assert.equal(agents[0].keepAlive, true);
    assert.equal(agents[0].maxSockets, 8);
  } finally {
    await new Promise(resolve => server.close(resolve));
    https.request = originalRequest;
    syncBuiltinESMExports();
    if (originalProxy === undefined) delete process.env.HTTPS_PROXY;
    else process.env.HTTPS_PROXY = originalProxy;
    agents[0]?.destroy();
  }
});

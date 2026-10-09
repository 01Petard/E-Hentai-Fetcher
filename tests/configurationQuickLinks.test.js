import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('shared navigation accepts a full configuration-sized list and persists it for another computer', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gallery-config-'));
  const previous = process.env.QUICK_LINKS_FILE;
  process.env.QUICK_LINKS_FILE = join(directory, 'links.json');
  const {handleApiRequest} = await import(`../server/api.js?configuration-test=${Date.now()}`);
  if (previous === undefined) delete process.env.QUICK_LINKS_FILE;
  else process.env.QUICK_LINKS_FILE = previous;
  const server = createServer((request, response) => handleApiRequest(request, response));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const endpoint = `http://127.0.0.1:${server.address().port}/api/quick-links`;
    const links = Array.from({length: 500}, (_, index) => ({label: `Link ${index}`, url: `/?f_search=tag${index}`, sortOrder: index + 1}));
    assert.ok(Buffer.byteLength(JSON.stringify(links)) > 16 * 1024);
    const saved = await fetch(endpoint, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(links)});
    assert.equal(saved.status, 200);
    const loaded = await fetch(endpoint);
    assert.deepEqual((await loaded.json()).links, links);
    const invalid = await fetch(endpoint, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify([{label: 'invalid', url: 'https://example.com/'}])});
    assert.equal(invalid.status, 400);
    assert.deepEqual((await (await fetch(endpoint)).json()).links, links);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, {recursive: true, force: true});
  }
});

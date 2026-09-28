import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { handleApiRequest } from './api.js';

const root = resolve('dist');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname !== '/debug' && handleApiRequest(request, response)) return;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405); response.end(); return;
  }
  const route = ['/gallery', '/image'].includes(pathname) ? '/index.html'
    : pathname === '/development-log' ? '/development-log.html'
    : pathname === '/debug' ? '/debug.html'
    : pathname === '/' ? '/index.html' : pathname;
  let file;
  try { file = resolve(root, `.${decodeURIComponent(route)}`); }
  catch { response.writeHead(400); response.end(); return; }
  if (!file.startsWith(root + sep)) { response.writeHead(404); response.end(); return; }
  try {
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Content-Length': content.length, 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 500);
    response.end();
  }
}).listen(8765, '0.0.0.0');

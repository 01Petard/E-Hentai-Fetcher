import { handleApiRequest } from '../server/api.js';

export function apiHandler(path) {
  return (request, response) => {
    const search = new URL(request.url, 'http://localhost').search;
    request.url = path + search;
    if (!handleApiRequest(request, response)) {
      response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: '接口不存在' }));
    }
  };
}

import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { request as httpsRequest } from 'node:https';
import { HttpsProxyAgent } from 'https-proxy-agent';
const cookieFile = new URL('../.env.local', import.meta.url);
const debugFile = new URL('../debug.html', import.meta.url);
const maxRequestBytes = 16 * 1024;
const maxResponseBytes = 25 * 1024 * 1024;
const maxTorrentBytes = 12 * 1024 * 1024;
const maxTagDatabaseBytes = 32 * 1024 * 1024;
const tagDatabaseUrl = 'https://github.com/EhTagTranslation/Database/releases/latest/download/db.html.json';
const tagDatabaseCacheTtl = 6 * 60 * 60 * 1000;
let tagDatabaseCache;
let tagDatabaseRequest;

function proxyAgent() {
  const configured = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (configured) return new HttpsProxyAgent(configured);
  if (process.platform !== 'darwin') return undefined;
  try {
    const settings = execFileSync('scutil', ['--proxy'], { encoding: 'utf8', timeout: 2000 });
    if (!/^\s*HTTPSEnable\s*:\s*1\s*$/m.test(settings)) return undefined;
    const host = /^\s*HTTPSProxy\s*:\s*(\S+)\s*$/m.exec(settings)?.[1];
    const port = /^\s*HTTPSPort\s*:\s*(\d+)\s*$/m.exec(settings)?.[1];
    if (host && port) return new HttpsProxyAgent(`http://${host}:${port}`);
  } catch { /* Direct connection remains available when system proxy lookup fails. */ }
  return undefined;
}

function sendJson(response, status, data) {
  const body = JSON.stringify(data);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

async function readJson(request) {
  if (request.body !== undefined) {
    const body = JSON.stringify(request.body);
    if (Buffer.byteLength(body) > maxRequestBytes) throw new Error('请求参数过长');
    return request.body;
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxRequestBytes) throw new Error('请求参数过长');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('请求 JSON 无效');
  }
}

async function readLocalCookie() {
  try {
    const content = await readFile(cookieFile, 'utf8');
    return content.split(/\r?\n/).find(line => line.startsWith('EH_COOKIE='))?.slice('EH_COOKIE='.length) || '';
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

async function readCookie(request) {
  const header = request.headers.cookie || '';
  const stored = header.split(';').map(part => part.trim()).find(part => part.startsWith('eh_cookie='));
  if (stored) {
    try {
      const cookie = decodeURIComponent(stored.slice('eh_cookie='.length));
      return validCookie(cookie) ? cookie : '';
    } catch { return ''; }
  }
  return readLocalCookie();
}

function validCookie(value) {
  return typeof value === 'string' && value.trim() && !/[\r\n]/.test(value);
}

function validTorrentUrl(value) {
  try {
    const url = new URL(value);
    const tracker = url.hostname === 'ehtracker.org' && /^\/get\/[a-zA-Z0-9/_-]+\.torrent$/.test(url.pathname);
    const ex = url.hostname === 'exhentai.org' && /^\/torrent\/\d+\/(?:[a-zA-Z0-9_-]+\/)?[a-f0-9]{40}\.torrent$/i.test(url.pathname);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password &&
      !url.search && !url.hash && (tracker || ex) ? url : null;
  } catch {
    return null;
  }
}

function validImageDownloadUrl(value) {
  try {
    const url = new URL(value);
    const imageHost = url.hostname.endsWith('.hath.network') || url.hostname === 'hath.network';
    const originalLink = ['e-hentai.org', 'exhentai.org'].includes(url.hostname) &&
      (url.pathname === '/fullimg.php' || /^\/fullimg\/\d+\/\d+\/[^/]+\/[^/]+$/.test(url.pathname));
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash &&
      (imageHost || originalLink) ? url : null;
  } catch { return null; }
}

function validExCoverUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 's.exhentai.org' && !url.port &&
      !url.username && !url.password && !url.search && !url.hash &&
      /^\/w\/\d{2}\/\d+\/[a-zA-Z0-9_-]+\.(?:webp|jpe?g|png|gif|avif)$/i.test(url.pathname) ? url : null;
  } catch { return null; }
}

function imageFilenameFromUrl(url) {
  try {
    const name = decodeURIComponent(url.pathname.split('/').pop()).replace(/[\\/"\x00-\x1f\x7f]/g, '_');
    return name !== 'fullimg.php' && /\.[a-z0-9]{2,8}$/i.test(name) ? name : '';
  } catch { return ''; }
}

async function streamImageDownload(url, response, cookie, userAgent, fallbackName, site = 'e-hentai.org', redirects = 0, originalName = '', inline = false) {
  const sourceName = originalName || imageFilenameFromUrl(url);
  return new Promise((resolve, reject) => {
    const upstream = httpsRequest(url, {
      method: 'GET', agent: proxyAgent(), timeout: 60000,
      headers: {Accept: 'image/*', Cookie: cookie, Referer: `https://${site}/`, 'User-Agent': userAgent},
    }, incoming => {
      if (incoming.statusCode >= 300 && incoming.statusCode < 400 && incoming.headers.location && redirects < 5) {
        const next = (inline ? validExCoverUrl : validImageDownloadUrl)(new URL(incoming.headers.location, url).href);
        incoming.resume();
        if (next) settle(resolve, streamImageDownload(next, response, cookie, userAgent, fallbackName, site, redirects + 1, sourceName, inline));
        else settle(reject, new Error('图片跳转地址无效'));
        return;
      }
      if (incoming.statusCode !== 200 || !/^image\//i.test(incoming.headers['content-type'] || '')) {
        incoming.resume();
        settle(reject, new Error('图片下载失败'));
        return;
      }
      const mime = incoming.headers['content-type'].split(';', 1)[0].toLowerCase();
      const extension = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif'}[mime] || 'img';
      const filename = sourceName || `${fallbackName}.${extension}`;
      const encodedFilename = encodeURIComponent(filename).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
      response.writeHead(200, {
        'Content-Type': incoming.headers['content-type'],
        ...(!inline ? {'Content-Disposition': `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodedFilename}`} : {}),
        'Cache-Control': inline ? 'private, max-age=3600' : 'no-store',
      });
      incoming.pipe(response);
      incoming.on('end', () => settle(resolve));
      incoming.on('error', error => settle(reject, error));
    });
    function onResponseClose() {
      if (!response.writableEnded) upstream.destroy(new Error('客户端取消下载'));
    }
    function settle(callback, value) {
      response.off('close', onResponseClose);
      callback(value);
    }
    response.once('close', onResponseClose);
    upstream.on('timeout', () => upstream.destroy(new Error('图片下载超时')));
    upstream.on('error', error => settle(reject, error));
    upstream.end();
  });
}

function fetchTorrent(url, userAgent, site = 'e-hentai.org', cookie = '', redirects = 0) {
  return new Promise((resolve, reject) => {
    const headers = { Accept: 'application/x-bittorrent,application/octet-stream,*/*', Referer: `https://${site}/`, 'User-Agent': userAgent };
    if (url.hostname === 'exhentai.org' && cookie) headers.Cookie = cookie;
    const upstream = httpsRequest(url, {
      method: 'GET',
      agent: proxyAgent(),
      timeout: 25000,
      headers,
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects < 2) {
        let next;
        try { next = validTorrentUrl(new URL(response.headers.location, url).href); } catch { /* Reject malformed redirects. */ }
        response.resume();
        if (next) resolve(fetchTorrent(next, userAgent, site, cookie, redirects + 1));
        else reject(new Error('种子下载地址无效'));
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error('种子文件下载失败'));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > maxTorrentBytes) {
          reject(new Error('种子文件过大'));
          upstream.destroy();
        }
        else chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    upstream.on('timeout', () => upstream.destroy(new Error('种子下载超时')));
    upstream.on('error', reject);
    upstream.end();
  });
}

function fetchHtml(url, headers, body = null) {
  return new Promise((resolve, reject) => {
    const upstream = httpsRequest(url, { method: body === null ? 'GET' : 'POST', headers, timeout: 25000, agent: proxyAgent() }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > maxResponseBytes) {
          upstream.destroy(new Error('响应内容过大'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const contentType = response.headers['content-type'] || '';
        const charset = /charset=([\w-]+)/i.exec(contentType)?.[1] || 'utf-8';
        let body;
        try {
          body = new TextDecoder(charset).decode(Buffer.concat(chunks));
        } catch {
          body = new TextDecoder('utf-8').decode(Buffer.concat(chunks));
        }
        resolve({
          status: response.statusCode,
          reason: response.statusMessage,
          headers: response.headers,
          body,
        });
      });
    });
    upstream.on('timeout', () => upstream.destroy(new Error('目标站点请求超时')));
    upstream.on('error', reject);
    if (body === null) upstream.end();
    else upstream.end(body);
  });
}

function fetchTagDatabase(url = tagDatabaseUrl, redirects = 0) {
  return new Promise((resolve, reject) => {
    const upstream = httpsRequest(url, {
      method: 'GET',
      agent: proxyAgent(),
      timeout: 30000,
      headers: { Accept: 'application/json', 'User-Agent': 'Gallery-Lens' },
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects < 5) {
        let next;
        try {
          next = new URL(response.headers.location, url);
          if (next.protocol !== 'https:' || !(next.hostname === 'github.com' || next.hostname.endsWith('.githubusercontent.com'))) next = null;
        } catch { /* Reject malformed redirects. */ }
        response.resume();
        if (next) resolve(fetchTagDatabase(next.href, redirects + 1));
        else reject(new Error('标签数据库下载地址无效'));
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`标签数据库返回 HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > maxTagDatabaseBytes) {
          upstream.destroy(new Error('标签数据库文件过大'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        try {
          const database = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (typeof database?.head?.sha !== 'string' || !Array.isArray(database.data)) throw new Error('标签数据库格式无效');
          const namespaceAliases = {
            artist: 'a', cosplayer: 'cos', parody: 'p', character: 'c', group: 'g',
            language: 'l', male: 'm', female: 'f', mixed: 'x', other: 'o',
            location: 'loc', reclass: 'r', rows: '', temp: '',
          };
          const translations = {};
          const details = {};
          for (const group of database.data) {
            const namespace = String(group.namespace || '').trim().toLowerCase();
            if (!group.data || namespace === 'rows') continue;
            const shortNamespace = namespaceAliases[namespace] ?? (namespace ? namespace[0] : '');
            for (const [rawKey, tag] of Object.entries(group.data)) {
              if (typeof tag?.name !== 'string') continue;
              const key = rawKey.replaceAll('_', ' ').trim().toLowerCase();
              if (!key) continue;
              const fullKey = shortNamespace ? `${shortNamespace}:${key}` : key;
              translations[fullKey] = tag.name;
              if (tag.intro || tag.links) {
                details[fullKey] = {
                  intro: typeof tag.intro === 'string' ? tag.intro : '',
                  links: typeof tag.links === 'string' ? tag.links : '',
                };
              }
            }
          }
          resolve({ sha: database.head.sha, translations, details });
        } catch (error) {
          reject(error);
        }
      });
    });
    upstream.on('timeout', () => upstream.destroy(new Error('标签数据库下载超时')));
    upstream.on('error', reject);
    upstream.end();
  });
}

async function getTagDatabase(force = false) {
  if (!force && tagDatabaseCache && Date.now() - tagDatabaseCache.loadedAt < tagDatabaseCacheTtl) return tagDatabaseCache;
  if (!tagDatabaseRequest) {
    tagDatabaseRequest = fetchTagDatabase().then(data => {
      tagDatabaseCache = { ...data, loadedAt: Date.now() };
      return tagDatabaseCache;
    }).finally(() => { tagDatabaseRequest = undefined; });
  }
  return tagDatabaseRequest;
}

async function route(request, response) {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  if (path === '/debug' && request.method === 'GET') {
    const html = await readFile(debugFile);
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': html.length });
    response.end(html);
    return;
  }
  if (path === '/api/config' && request.method === 'GET') {
    sendJson(response, 200, { configured: Boolean(await readCookie(request)) });
    return;
  }
  if (path === '/api/gallery-posted' && request.method === 'POST') {
    const payload = await readJson(request);
    if (!Array.isArray(payload.galleries) || payload.galleries.length < 1 || payload.galleries.length > 25 ||
        payload.galleries.some(entry => !Array.isArray(entry) || entry.length !== 2 ||
          !Number.isSafeInteger(entry[0]) || entry[0] < 1 ||
          typeof entry[1] !== 'string' || !/^[a-f0-9]{10}$/i.test(entry[1]))) {
      throw new Error('图库参数无效');
    }
    if (typeof payload.userAgent !== 'string' || !payload.userAgent || payload.userAgent.length > 512 || /[\r\n]/.test(payload.userAgent)) {
      throw new Error('User-Agent 无效');
    }
    const cookie = await readCookie(request);
    if (!validCookie(cookie)) throw new Error('请先在配置菜单中保存 Cookie');
    const body = JSON.stringify({ method: 'gdata', gidlist: payload.galleries });
    const upstream = await fetchHtml('https://api.e-hentai.org/api.php', {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      Cookie: cookie,
      'User-Agent': payload.userAgent,
    }, body);
    if (upstream.status !== 200) throw new Error('图库时间请求失败');
    const metadata = JSON.parse(upstream.body).gmetadata;
    if (!Array.isArray(metadata)) throw new Error('图库时间响应无效');
    const requested = new Set(payload.galleries.map(([gid]) => gid));
    const posted = {};
    for (const entry of metadata) {
      const gid = Number(entry?.gid);
      const timestamp = Number(entry?.posted);
      if (requested.has(gid) && Number.isSafeInteger(timestamp) && timestamp > 0) posted[gid] = timestamp;
    }
    sendJson(response, 200, { posted });
    return;
  }
  if (path === '/api/tag-translations' && request.method === 'GET') {
    const params = new URL(request.url, 'http://127.0.0.1').searchParams;
    const database = await getTagDatabase(params.get('force') === '1');
    const knownSha = params.get('sha');
    sendJson(response, 200, {
      sha: database.sha,
      translations: knownSha === database.sha ? null : database.translations,
      details: knownSha === database.sha ? null : database.details,
    });
    return;
  }
  if (path === '/api/config/cookie' && request.method === 'PUT') {
    const payload = await readJson(request);
    if (!validCookie(payload.cookie)) throw new Error('Cookie 无效');
    const secure = request.socket.encrypted || request.headers['x-forwarded-proto'] === 'https';
    response.setHeader('Set-Cookie', `eh_cookie=${encodeURIComponent(payload.cookie.trim())}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
    sendJson(response, 200, { configured: true });
    return;
  }
  if (path === '/api/config/cookie' && request.method === 'DELETE') {
    const secure = request.socket.encrypted || request.headers['x-forwarded-proto'] === 'https';
    response.setHeader('Set-Cookie', `eh_cookie=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
    sendJson(response, 200, { configured: Boolean(await readLocalCookie()) });
    return;
  }
  if (path === '/api/torrent-download' && request.method === 'POST') {
    const payload = await readJson(request);
    const target = validTorrentUrl(payload.url);
    if (!target) throw new Error('种子下载地址无效');
    if (typeof payload.userAgent !== 'string' || !payload.userAgent || payload.userAgent.length > 512 || /[\r\n]/.test(payload.userAgent)) {
      throw new Error('User-Agent 无效');
    }
    const site = payload.site === 'exhentai.org' ? 'exhentai.org' : 'e-hentai.org';
    const torrent = await fetchTorrent(target, payload.userAgent, site, await readCookie(request));
    if (!torrent.length || torrent[0] !== 0x64) throw new Error('种子文件下载失败');
    const filename = target.pathname.split('/').pop();
    response.writeHead(200, {
      'Content-Type': 'application/x-bittorrent',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': torrent.length,
      'Cache-Control': 'no-store',
    });
    response.end(torrent);
    return;
  }
  if (path === '/api/image-download' && request.method === 'GET') {
    const params = new URL(request.url, 'http://127.0.0.1').searchParams;
    const target = validImageDownloadUrl(params.get('url'));
    if (!target) throw new Error('图片下载地址无效');
    const number = Number(params.get('page'));
    if (!Number.isSafeInteger(number) || number < 1) throw new Error('图片页码无效');
    const variant = params.get('variant');
    if (!['preview', 'original'].includes(variant)) throw new Error('图片类型无效');
    const cookie = await readCookie(request);
    const site = params.get('site') === 'exhentai.org' ? 'exhentai.org' : 'e-hentai.org';
    await streamImageDownload(target, response, cookie, request.headers['user-agent'] || 'Gallery-Lens', `page-${number}-${variant}`, site);
    return;
  }
  if (path === '/api/ex-cover' && request.method === 'GET') {
    const params = new URL(request.url, 'http://127.0.0.1').searchParams;
    const target = validExCoverUrl(params.get('url'));
    if (!target) throw new Error('EX 缩略图地址无效');
    await streamImageDownload(target, response, '', request.headers['user-agent'] || 'Gallery-Lens', 'cover', 'exhentai.org', 0, '', true);
    return;
  }
  if (path === '/fetch' && request.method === 'POST') {
    const payload = await readJson(request);
    if (typeof payload.url !== 'string') throw new Error('请求地址无效');
    let target;
    try { target = new URL(payload.url); } catch { throw new Error('请求地址无效'); }
    if (target.protocol !== 'https:' || !['e-hentai.org', 'exhentai.org'].includes(target.hostname) ||
        (target.port && target.port !== '443') || target.username || target.password || target.hash) {
      throw new Error('仅允许请求 E-Hentai 或 ExHentai 的 HTTPS 地址');
    }
    if (payload.cookie !== undefined && payload.cookie !== '' && !validCookie(payload.cookie)) throw new Error('Cookie 无效');
    let cookie = payload.cookie || await readCookie(request);
    if (!validCookie(cookie)) throw new Error('请先在配置菜单中保存 Cookie');
    if (typeof payload.userAgent !== 'string' || !payload.userAgent || payload.userAgent.length > 512 || /[\r\n]/.test(payload.userAgent)) {
      throw new Error('User-Agent 无效');
    }
    if (typeof payload.extended !== 'boolean') throw new Error('展示模式无效');
    if (payload.extended) {
      cookie = cookie.split(';').map(part => part.trim()).filter(part => part && part.split('=', 1)[0].trim().toLowerCase() !== 'sl').join('; ');
      cookie += '; sl=dm_2';
    }
    const result = await fetchHtml(target, {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
      Priority: 'u=0, i',
      'Upgrade-Insecure-Requests': '1',
      Cookie: cookie,
      Referer: target.href,
      'User-Agent': payload.userAgent,
    });
    sendJson(response, 200, result);
    return;
  }
  sendJson(response, 405, { error: '请求方法不受支持' });
}

export function handleApiRequest(request, response) {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  if (!['/debug', '/api/config', '/api/config/cookie', '/api/gallery-posted', '/api/tag-translations', '/api/torrent-download', '/api/image-download', '/api/ex-cover', '/fetch'].includes(path)) return false;
  route(request, response).catch(error => {
    if (response.writableEnded) return;
    if (response.headersSent) { response.destroy(error); return; }
    const userError = ['请求参数过长', '请求 JSON 无效', 'Cookie 无效', '图库参数无效', '请求地址无效',
      '仅允许请求 E-Hentai 或 ExHentai 的 HTTPS 地址', '请先在配置菜单中保存 Cookie',
      'User-Agent 无效', '展示模式无效', '种子下载地址无效', '图片下载地址无效', 'EX 缩略图地址无效', '图片页码无效', '图片类型无效'].includes(error.message);
    sendJson(response, userError ? 400 : 502, { error: userError ? error.message : '请求失败或目标站点不可用' });
  });
  return true;
}

import {galleryCacheScopeKey} from './galleryDetails.js';

const storageKey = 'gallery-lens.search-results';
const ttl = 2 * 60 * 1000;
const maxPages = 10;

export function createSearchResultsLoader({fetchPage, storage, scope, now = Date.now}) {
  const pages = new Map();
  const pending = new Map();
  let activeScope;

  function syncScope() {
    const next = scope();
    if (activeScope === next) return;
    activeScope = next;
    pages.clear();
    pending.clear();
    try {
      const saved = JSON.parse(storage?.getItem(storageKey) || 'null');
      if (saved?.scope === next && Array.isArray(saved.pages)) {
        for (const [url, entry] of saved.pages.slice(-maxPages)) {
          if (entry?.expiresAt > now() && (entry.data?.hasTable || entry.data?.noResults) && Array.isArray(entry.data.items)) pages.set(url, entry);
        }
      }
    } catch { /* Search still works without persistent caching. */ }
  }

  function update(url, data) {
    syncScope();
    const entry = pages.get(url);
    if (!entry || entry.expiresAt <= now()) return;
    pages.delete(url);
    pages.set(url, {...entry, data: JSON.parse(JSON.stringify(data))});
    try { storage?.setItem(storageKey, JSON.stringify({scope: activeScope, pages: [...pages]})); }
    catch { /* Keep the memory cache when storage is full. */ }
  }

  async function load(url, {force = false} = {}) {
    syncScope();
    const cached = pages.get(url);
    if (!force && cached?.expiresAt > now()) return {result: JSON.parse(JSON.stringify(cached.data)), fromCache: true};
    pages.delete(url);
    const requestScope = activeScope;
    if (!pending.has(url)) {
      const request = fetchPage(url).then(data => {
        if (requestScope === scope()) {
          pages.set(url, {data, expiresAt: now() + ttl});
          while (pages.size > maxPages) pages.delete(pages.keys().next().value);
          update(url, data);
        }
        return data;
      });
      pending.set(url, request);
      request.finally(() => {if (pending.get(url) === request) pending.delete(url);}).catch(() => {});
    }
    return {result: JSON.parse(JSON.stringify(await pending.get(url))), fromCache: false};
  }

  return {load, update};
}

export function browserSearchResultsLoader(fetchPage) {
  let storage;
  try { storage = sessionStorage; } catch { /* Private browsing may disable storage. */ }
  return createSearchResultsLoader({fetchPage, storage, scope: () => {
    try { return localStorage.getItem(galleryCacheScopeKey) || ''; } catch { return ''; }
  }});
}

const storageKey = 'gallery-lens.gallery-details';
export const galleryCacheScopeKey = 'gallery-lens.gallery-cache-scope';
const cacheTtl = 5 * 60 * 1000;
const maxPages = 40;

function browserStorage(name) {
  try { return globalThis[name]; } catch { return null; }
}

function currentScope() {
  try { return browserStorage('localStorage')?.getItem(galleryCacheScopeKey) || ''; }
  catch { return ''; }
}

export function invalidateGalleryDetails() {
  try { browserStorage('localStorage')?.setItem(galleryCacheScopeKey, crypto.randomUUID()); } catch { /* Storage may be disabled. */ }
  try { browserStorage('sessionStorage')?.removeItem(storageKey); } catch { /* Memory caches check the scope too. */ }
}

export function gallerySourcePageUrl(base, index) {
  const url = new URL(base);
  if (index) url.searchParams.set('p', String(index));
  else url.searchParams.delete('p');
  return url.href;
}

// Parsed gallery pages survive full-page navigation in this tab, without caching credentials or image download links.
export function createGalleryDetailsLoader({fetchPage, parsePage, storage = browserStorage('sessionStorage'), scope = currentScope, now = Date.now}) {
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
          if (entry?.expiresAt > now() && entry.data?.title && Array.isArray(entry.data.images)) pages.set(url, entry);
        }
      }
    } catch { /* A failed cache read must not prevent browsing. */ }
  }

  async function page(url) {
    syncScope();
    const cached = pages.get(url);
    if (cached?.expiresAt > now()) {
      pages.delete(url);
      pages.set(url, cached);
      return cached.data;
    }
    pages.delete(url);
    if (pending.has(url)) return pending.get(url);
    const requestScope = activeScope;
    const request = (async () => {
      const parsed = parsePage(await fetchPage(url), url);
      if (requestScope === scope()) {
        pages.set(url, {data: parsed, expiresAt: now() + cacheTtl});
        while (pages.size > maxPages) pages.delete(pages.keys().next().value);
        try { storage?.setItem(storageKey, JSON.stringify({scope: requestScope, pages: [...pages]})); }
        catch { /* Browsing and memory caching still work if storage is full. */ }
      }
      return parsed;
    })();
    pending.set(url, request);
    try { return await request; }
    finally { if (pending.get(url) === request) pending.delete(url); }
  }

  async function load({target, pageSize, requestedPage = null, onOverview, onImages}) {
    const loadScope = scope();
    const base = gallerySourcePageUrl(target, 0);
    const first = await page(base);
    if (loadScope !== scope()) return;
    const sourceSize = first.sourcePageSize || first.images.length || 20;
    const sourceIndex = Number(new URL(target).searchParams.get('p'));
    const requested = requestedPage === null
      ? Number.isSafeInteger(sourceIndex) && sourceIndex > 0 ? Math.floor(sourceIndex * sourceSize / pageSize) : 0
      : requestedPage;
    const total = first.totalImages || Number(first.metadata.find(item => item.label === 'Length')?.value.match(/\d+/)?.[0]) || first.images.length;
    const index = Math.min(Number.isSafeInteger(requested) && requested >= 0 ? requested : 0, Math.max(0, Math.ceil(total / pageSize) - 1));
    const start = index * pageSize;
    const end = Math.min(total, start + pageSize);
    onOverview({...first, source: base, images: [], totalImages: total, imageStart: start + 1, imageRange: total ? `第 ${start + 1} 张到第 ${end} 张 · 共 ${total} 张` : '共 0 张'}, index);
    const firstPage = Math.floor(start / sourceSize);
    const lastPage = Math.floor(Math.max(start, end - 1) / sourceSize);
    if (lastPage >= first.sourcePageCount) throw new Error('源站分页页码与图片总数不一致');
    const images = new Map();
    const results = await Promise.allSettled(Array.from({length: lastPage - firstPage + 1}, async (_, offset) => {
      const sourcePage = firstPage + offset;
      const parsed = sourcePage === 0 ? first : await page(gallerySourcePageUrl(base, sourcePage));
      if (loadScope !== scope()) return;
      for (const image of parsed.images) {
        if (image.number > start && image.number <= end) images.set(image.number, image);
      }
      onImages([...images.values()].sort((a, b) => a.number - b.number));
    }));
    if (loadScope !== scope()) return;
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    if (images.size !== end - start) {
      for (let sourcePage = firstPage; sourcePage <= lastPage; sourcePage++) pages.delete(gallerySourcePageUrl(base, sourcePage));
      try { storage?.setItem(storageKey, JSON.stringify({scope: activeScope, pages: [...pages]})); }
      catch { /* Retry can still bypass the incomplete memory entries. */ }
      throw new Error('部分图片目录未能加载，请重试');
    }
  }

  return {load};
}

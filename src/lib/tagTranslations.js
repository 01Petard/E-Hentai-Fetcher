const databaseName = 'gallery-lens-cache';
const storeName = 'cache';
const cacheKey = 'tag-translations';

function openCache() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCache() {
  const database = await openCache();
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName).objectStore(storeName).get(cacheKey);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    database.close();
  });
}

async function writeCache(value) {
  const database = await openCache();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value, cacheKey);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
    transaction.onabort = () => { database.close(); reject(transaction.error); };
  });
}

export async function readTagCache() {
  try {
    const cached = await readCache();
    return cached?.translations && typeof cached.translations === 'object' ? cached : null;
  } catch {
    return null;
  }
}

export async function refreshTagTranslations({ force = false } = {}) {
  const cached = await readTagCache();
  const params = new URLSearchParams();
  if (cached?.sha && cached.details && typeof cached.details === 'object') params.set('sha', cached.sha);
  if (force) params.set('force', '1');
  const response = await fetch(`/api/tag-translations${params.size ? `?${params}` : ''}`);
  if (!response.ok) throw new Error('标签数据库更新失败，请稍后重试');
  const data = await response.json();
  if (typeof data.sha !== 'string' || (data.translations && typeof data.translations !== 'object')) {
    throw new Error('标签数据库格式无效');
  }
  const translations = data.translations || cached?.translations;
  const details = data.details || cached?.details;
  if (!translations || !details) throw new Error('标签数据库内容不完整');
  const now = Date.now();
  const value = {
    sha: data.sha,
    translations,
    details,
    checkedAt: now,
    updatedAt: data.translations ? now : cached?.updatedAt || now,
  };
  try { await writeCache(value); } catch { /* The current session can still use the downloaded data. */ }
  return { ...value, changed: Boolean(data.translations) };
}

import {readExEnabled} from './sourceSite.js';

const imageExtensions = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/avif': 'avif', 'image/bmp': 'bmp',
};

export function selectedRange(scope, first, last, total) {
  if (!Number.isSafeInteger(total) || total < 1) throw new Error('画廊图片总数无效');
  if (scope === 'all') return {start: 1, end: total};
  const start = Number(first);
  const end = Number(last);
  if (scope !== 'range' || !/^\d+$/.test(String(first)) || !/^\d+$/.test(String(last)) ||
      !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > total) {
    throw new Error(`页码范围应在 1 到 ${total} 之间，且起始页不大于结束页`);
  }
  return {start, end};
}

export async function collectGalleryImages(gallery, start, end, fetchSource, parsePage, signal) {
  const size = gallery.sourcePageSize;
  if (!Number.isSafeInteger(size) || size < 1 || !Number.isSafeInteger(gallery.totalImages) ||
      start < 1 || end > gallery.totalImages) throw new Error('源站分页数据无效');
  const firstIndex = Math.floor((start - 1) / size);
  const lastIndex = Math.floor((end - 1) / size);
  if (lastIndex >= gallery.sourcePageCount) throw new Error('源站分页页码与图片总数不一致');
  const found = new Map();
  for (let index = firstIndex; index <= lastIndex; index++) {
    signal?.throwIfAborted();
    const url = new URL(gallery.source);
    if (index) url.searchParams.set('p', String(index));
    else url.searchParams.delete('p');
    const page = parsePage(await fetchSource(url.href, signal), url.href);
    const expectedSize = Math.min(size, gallery.totalImages - index * size);
    if (page.totalImages !== gallery.totalImages || page.sourcePageSize !== expectedSize) {
      throw new Error('源站分页数据与当前画廊不一致');
    }
    for (const image of page.images) {
      if (image.number < start || image.number > end) continue;
      if (found.has(image.number)) throw new Error(`第 ${image.number} 页重复出现`);
      found.set(image.number, image);
    }
  }
  return Array.from({length: end - start + 1}, (_, offset) => {
    const number = start + offset;
    const image = found.get(number);
    if (!image) throw new Error(`目录缺少第 ${number} 页`);
    return image;
  });
}

async function retry(operation, signal, onAttempt) {
  let failure;
  for (let attempt = 1; attempt <= 4; attempt++) {
    signal?.throwIfAborted();
    onAttempt?.(attempt);
    try { return await operation(); }
    catch (error) {
      if (signal?.aborted) throw error;
      failure = error;
    }
  }
  throw failure;
}

export async function fetchImageBlob(url, number, variant, signal) {
  const params = new URLSearchParams({url, page: String(number), variant, site: readExEnabled() ? 'exhentai.org' : 'e-hentai.org'});
  const response = await fetch(`/api/image-download?${params}`, {signal});
  const mime = response.headers.get('content-type')?.split(';', 1)[0].toLowerCase();
  if (!response.ok || !imageExtensions[mime]) throw new Error(`${variant === 'original' ? '原图' : '展示图'}下载失败`);
  const blob = await response.blob();
  if (!blob.size) throw new Error('图片内容为空');
  return {blob, mime};
}

export async function downloadGalleryImage(item, mode, deps) {
  const {fetchSource, parseImageDetail, fetchBinary = fetchImageBlob, signal, onAttempt} = deps;
  const html = await retry(() => fetchSource(item.url, signal), signal, attempt => onAttempt?.('page', attempt));
  const detail = parseImageDetail(html, item.url);
  if (mode !== 'preferred' && mode !== 'original') throw new Error('图片策略无效');
  if (!detail.original && mode === 'original') throw new Error('源站未提供原图');
  if (detail.original) {
    try {
      const image = await retry(() => fetchBinary(detail.original, item.number, 'original', signal), signal,
        attempt => onAttempt?.('original', attempt));
      return {...image, number: item.number, quality: 'original'};
    } catch (error) {
      if (signal?.aborted || mode === 'original') throw error;
    }
  }
  const image = await retry(() => fetchBinary(detail.image, item.number, 'preview', signal), signal,
    attempt => onAttempt?.('preview', attempt));
  return {...image, number: item.number, quality: 'preview'};
}

export function archiveImageName(total, number, mime) {
  const extension = imageExtensions[mime];
  if (!extension) throw new Error('不支持的图片格式');
  return `${String(number).padStart(Math.max(3, String(total).length), '0')}.${extension}`;
}

export function failedPagesText(pages) {
  return `下载失败的原始页码：\n${pages.map(page => `${page.number}: ${page.error}`).join('\n')}\n`;
}

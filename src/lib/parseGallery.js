function safeUrl(value, hosts, baseUrl) {
  if (!value) return '';
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === 'https:' && hosts.includes(url.hostname) ? url.href : '';
  } catch {
    return '';
  }
}

const namespaceAliases = {
  artist: 'a', a: 'a', cosplayer: 'cos', cos: 'cos', parody: 'p', p: 'p',
  character: 'c', c: 'c', group: 'g', g: 'g', language: 'l', l: 'l',
  male: 'm', m: 'm', female: 'f', f: 'f', mixed: 'x', x: 'x', other: 'o', o: 'o',
  location: 'loc', loc: 'loc', reclass: 'r', r: 'r', temp: '',
};

function normalizeTagKey(tag) {
  const title = tag.getAttribute('title')?.trim() || '';
  const href = tag.getAttribute('href') || '';
  let raw = title;
  if (!raw.includes(':')) {
    try {
      const path = new URL(href, 'https://e-hentai.org').pathname;
      const match = path.match(/\/tag\/([^/]+)\/?$/i);
      if (match) raw = decodeURIComponent(match[1].replaceAll('+', ' '));
    } catch { /* Tags without a recognizable URL remain untranslated. */ }
  }
  const separator = raw.indexOf(':');
  const namespace = separator < 0 ? '' : raw.slice(0, separator).trim().toLowerCase();
  const key = (separator < 0 ? raw : raw.slice(separator + 1)).replaceAll('_', ' ').trim().toLowerCase();
  if (!key) return '';
  const shortNamespace = namespaceAliases[namespace] ?? (namespace ? namespace[0] : '');
  return shortNamespace ? `${shortNamespace}:${key}` : key;
}

export function parseGallery(html, requestUrl) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const totalText = document.querySelector('.searchtext p')?.textContent || '';
  const match = totalText.match(/\bFound\s+(about\s+)?([\d,]+)\s+results?\b/i);
  const total = match ? Number(match[2].replaceAll(',', '')) : null;
  const approximate = Boolean(match?.[1]);
  const nav = document.querySelector('.searchnav');
  const pages = {};
  for (const [key, id] of Object.entries({ first: 'ufirst', prev: 'uprev', next: 'unext', last: 'ulast' })) {
    const anchor = nav?.querySelector(`a#${id}`);
    pages[key] = safeUrl(anchor?.getAttribute('href'), ['e-hentai.org'], requestUrl);
  }
  const table = document.querySelector('table.itg.glte');
  if (!table) return { items: [], total, approximate, pages, hasTable: false };

  const items = [];
  for (const row of table.rows) {
    if (row.cells.length < 2) continue;
    const coverCell = row.cells[0];
    const detailCell = row.cells[1];
    const titleNode = detailCell.querySelector('.gl4e .glink');
    if (!titleNode) continue;
    const metadata = detailCell.querySelector('.gl3e');
    const rating = metadata?.querySelector('.ir');
    const ratingPosition = rating?.style.backgroundPosition || '';
    const ratingSprite = rating?.classList.contains('irr') ? 'rtr.png'
      : rating?.classList.contains('irb') ? 'rtb.png'
      : rating?.classList.contains('irg') ? 'rtg.png' : 'rt.png';
    const published = metadata?.querySelector('[id^="posted_"]')?.textContent.trim() || '';
    const uploader = metadata?.querySelector('a[href*="/uploader/"]');
    const tagGroups = [...detailCell.querySelectorAll('.gl4e table tr')].map(tagRow => ({
      label: tagRow.querySelector('.tc')?.textContent.trim() || '标签',
      values: [...tagRow.querySelectorAll('.gt, .gtl')].map(tag => ({
        key: normalizeTagKey(tag),
        original: tag.textContent.trim(),
      })),
    })).filter(group => group.values.length);
    items.push({
      title: titleNode.textContent.trim(),
      url: safeUrl(titleNode.closest('a')?.getAttribute('href'), ['e-hentai.org'], requestUrl),
      image: safeUrl(coverCell.querySelector('img')?.getAttribute('data-src') || coverCell.querySelector('img')?.getAttribute('src'), ['ehgt.org', 'e-hentai.org'], requestUrl),
      category: metadata?.querySelector('.cn')?.textContent.trim() || '未分类',
      ratingPosition: /^-?\d+px\s+-?\d+px$/.test(ratingPosition) ? ratingPosition : '',
      ratingSprite,
      published,
      pages: [...(metadata?.children || [])].find(node => /\bpages?\b/i.test(node.textContent.trim()))?.textContent.trim() || '',
      uploader: uploader?.textContent.trim() || '',
      uploaderUrl: safeUrl(uploader?.getAttribute('href'), ['e-hentai.org'], requestUrl),
      torrentUrl: safeUrl(metadata?.querySelector('.gldown a')?.getAttribute('href'), ['e-hentai.org'], requestUrl),
      tagGroups,
    });
  }
  return { items, total, approximate, pages, hasTable: true };
}

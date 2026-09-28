export const sourceHosts = ['e-hentai.org', 'exhentai.org'];

export function sourceOrigin(useEx = false) {
  return useEx ? 'https://exhentai.org' : 'https://e-hentai.org';
}

export function readExEnabled() {
  try { return JSON.parse(localStorage.getItem('gallery-lens.preferences'))?.useEx === true; }
  catch { return false; }
}

export function sourceUrl(value, useEx = readExEnabled(), base = sourceOrigin(useEx)) {
  if (!value) return '';
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'https:' || !sourceHosts.includes(url.hostname) ||
        (url.port && url.port !== '443') || url.username || url.password || url.hash) return '';
    url.hostname = useEx ? 'exhentai.org' : 'e-hentai.org';
    return url.href;
  } catch { return ''; }
}

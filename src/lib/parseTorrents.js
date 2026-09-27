function safeTorrentUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'ehtracker.org' &&
      !url.port && !url.username && !url.password && !url.search && !url.hash &&
      /^\/get\/[a-zA-Z0-9/_-]+\.torrent$/.test(url.pathname) ? url.href : '';
  } catch {
    return '';
  }
}

function field(form, label) {
  const cell = [...form.querySelectorAll('td')].find(td =>
    td.querySelector('span')?.textContent.trim().toLowerCase() === `${label.toLowerCase()}:`);
  return cell?.textContent.replace(new RegExp(`^\\s*${label}:\\s*`, 'i'), '').trim() || '';
}

export function parseTorrents(html) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const container = document.querySelector('#torrentinfo');
  if (!container) return { hasList: false, title: '', items: [] };

  const items = [];
  let outdated = false;
  for (const node of container.querySelectorAll('p, form')) {
    if (node.tagName === 'P') {
      if (/Outdated Torrents/i.test(node.textContent)) outdated = true;
      continue;
    }
    const link = node.querySelector('a[href*=".torrent"]');
    if (!link) continue;
    const scripted = /document\.location\s*=\s*(['"])(https:\/\/ehtracker\.org\/get\/[^'"\s]+\.torrent)\1/.exec(link.getAttribute('onclick') || '');
    const downloadUrl = safeTorrentUrl(scripted?.[2]) || safeTorrentUrl(link.getAttribute('href'));
    if (!downloadUrl) continue;
    items.push({
      name: link.textContent.trim(),
      downloadUrl,
      filename: new URL(downloadUrl).pathname.split('/').pop(),
      posted: field(node, 'Posted'),
      size: field(node, 'Size'),
      seeds: field(node, 'Seeds'),
      peers: field(node, 'Peers'),
      downloads: field(node, 'Downloads'),
      uploader: field(node, 'Uploader'),
      outdated,
    });
  }
  return { hasList: true, title: container.querySelector('h1')?.textContent.trim() || '', items };
}

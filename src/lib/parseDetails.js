function sourceUrl(value, path) {
    try {
        const url = new URL(value, 'https://e-hentai.org');
        return url.protocol === 'https:' && url.hostname === 'e-hentai.org' && path.test(url.pathname) ? url.href : '';
    } catch {
        return '';
    }
}

function imageUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch {
        return '';
    }
}

const tagNamespaces = {
    artist: 'a', cosplayer: 'cos', parody: 'p', character: 'c', group: 'g',
    language: 'l', male: 'm', female: 'f', mixed: 'x', other: 'o',
    location: 'loc', reclass: 'r', temp: '',
};

function translationKey(value) {
    const [namespace, ...parts] = value.replaceAll('_', ' ').toLowerCase().split(':');
    if (!parts.length) return namespace.trim();
    const prefix = tagNamespaces[namespace] ?? namespace;
    return prefix ? `${prefix}:${parts.join(':').trim()}` : parts.join(':').trim();
}

export function galleryLink(value) {
    return sourceUrl(value, /^\/g\/\d+\/[a-f0-9]+\/?$/i);
}

export function imageLink(value) {
    return sourceUrl(value, /^\/s\/[a-f0-9]+\/\d+-\d+\/?$/i);
}

export function uploaderLink(value) {
    return sourceUrl(value, /^\/uploader\/[^/]+\/?$/i);
}

export function localGalleryUrl(url) {
    return `/gallery?url=${encodeURIComponent(url)}`;
}

export function localImageUrl(url) {
    return `/image?url=${encodeURIComponent(url)}`;
}

export function parseGalleryDetail(html, requestUrl) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const title = doc.querySelector('#gn')?.textContent.trim();
    if (!title || !doc.querySelector('#gdd')) throw new Error('响应中没有画廊详情内容');
    const coverStyle = doc.querySelector('#gd1 div')?.style.backgroundImage || '';
    const cover = imageUrl(/url\(["']?([^"')]+)/.exec(coverStyle)?.[1]);
    const metadata = [...doc.querySelectorAll('#gdd tr')].map(row => ({
        label: row.querySelector('.gdt1')?.textContent.trim().replace(/:$/, '') || '',
        value: row.querySelector('.gdt2')?.textContent.trim() || '',
        url: galleryLink(row.querySelector('.gdt2 a')?.href),
    })).filter(row => row.label && row.value);
    const rating = doc.querySelector('#rating_label')?.textContent.trim().replace(/^Average:\s*/i, '') || '';
    const torrentAnchor = doc.querySelector('#gd5 a[onclick*="gallerytorrents.php"], #gd5 a[href*="gallerytorrents.php"]');
    const torrentUrl = sourceUrl(/https:\/\/e-hentai\.org\/gallerytorrents\.php\?gid=\d+&t=[a-f0-9]+/i.exec(
        torrentAnchor?.getAttribute('onclick') || torrentAnchor?.href || '')?.[0], /^\/gallerytorrents\.php$/);
    const tags = [...doc.querySelectorAll('#taglist tr')].map(row => ({
        label: row.querySelector('.tc')?.textContent.trim().replace(/:$/, '') || '',
        values: [...row.querySelectorAll('.gt, .gtl')].map(node => ({
            name: node.querySelector('a')?.textContent.trim() || node.textContent.trim(),
            key: node.id.startsWith('td_') ? translationKey(node.id.slice(3)) : '',
        })).filter(tag => tag.name),
    })).filter(group => group.values.length);
    const images = [...doc.querySelectorAll('#gdt > a')].map(anchor => {
        const cell = anchor.querySelector('div');
        const style = cell?.style;
        const src = imageUrl(/url\(["']?([^"')]+)/.exec(style?.backgroundImage || '')?.[1]);
        const number = Number(/\/\d+-(\d+)\/?$/.exec(anchor.href)?.[1]);
        return {
            url: imageLink(anchor.href), number, name: cell?.title.replace(/^Page \d+:\s*/, '') || '',
            sprite: src, position: style?.backgroundPosition || '0 0',
            width: style?.width || '200px', height: style?.height || '280px',
        };
    }).filter(item => item.url && item.sprite && Number.isInteger(item.number));
    const rangeText = doc.querySelector('.gpc')?.textContent.trim() || '';
    const range = /Showing\s+([\d,]+)\s*-\s*([\d,]+)\s+of\s+([\d,]+)\s+images/i.exec(rangeText);
    const sourcePageNumbers = [...doc.querySelectorAll('.ptt a')]
        .map(anchor => Number(anchor.textContent.trim()))
        .filter(number => Number.isSafeInteger(number) && number > 0);
    const totalImages = Number(range?.[3]?.replaceAll(',', '')) || 0;
    const sourcePageSize = range ? Number(range[2].replaceAll(',', '')) - Number(range[1].replaceAll(',', '')) + 1 : images.length;
    const comments = [...doc.querySelectorAll('#cdiv > .c1')].map(node => {
        const body = node.querySelector('.c6')?.cloneNode(true);
        body?.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        body?.querySelectorAll('script, style').forEach(element => element.remove());
        return {
            author: node.querySelector('.c3 a')?.textContent.trim() || '匿名用户',
            posted: node.querySelector('.c3')?.textContent.replace(/\s+/g, ' ').trim().replace(/\s*by:\s*.*$/i, '') || '',
            score: node.querySelector('.c5 span')?.textContent.trim() || '',
            body: body?.textContent.trim() || '',
        };
    }).filter(comment => comment.body);
    return {
        title, japaneseTitle: doc.querySelector('#gj')?.textContent.trim() || '', cover,
        category: doc.querySelector('#gdc .cs')?.textContent.trim() || '',
        uploader: doc.querySelector('#gdn a')?.textContent.trim() || '',
        uploaderUrl: uploaderLink(doc.querySelector('#gdn a')?.href),
        metadata, rating, torrentUrl, tags, images, comments,
        imageRange: rangeText, totalImages,
        sourcePageSize,
        sourcePageCount: Math.max(...sourcePageNumbers, sourcePageSize ? Math.ceil(totalImages / sourcePageSize) : 1),
        source: galleryLink(requestUrl),
    };
}

export function parseImageDetail(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const imageNode = doc.querySelector('#img');
    const image = imageUrl(imageNode?.getAttribute('src'));
    if (!image) throw new Error('响应中没有单页图片');
    const originalNode = doc.querySelector('a[href*="fullimg"]');
    const original = imageUrl(originalNode?.href);
    const originalText = originalNode?.textContent || '';
    const imageInfo = doc.querySelector('#i4 > div')?.textContent || '';
    const originalDimensions = /([\d,]+)\s*x\s*([\d,]+)/i.exec(originalText) || /([\d,]+)\s*x\s*([\d,]+)/i.exec(imageInfo);
    const originalSize = /[\d,.]+\s*(?:[KMGT]i?B|B)\b/i.exec(originalText)?.[0] ||
        /[\d,.]+\s*(?:[KMGT]i?B|B)\b/i.exec(imageInfo)?.[0] || '';
    const counter = doc.querySelector('#i2 .sn > div')?.textContent || '';
    const numbers = [...counter.matchAll(/\d+/g)].map(match => Number(match[0]));
    const dimensions = /([\d,]+)\s*x\s*([\d,]+)/i.exec(imageInfo);
    const width = parseInt(imageNode?.style.width, 10) || Number(dimensions?.[1]?.replaceAll(',', '')) || 0;
    const height = parseInt(imageNode?.style.height, 10) || Number(dimensions?.[2]?.replaceAll(',', '')) || 0;
    return {
        title: doc.querySelector('#i1 h1')?.textContent.trim() || '画廊单页',
        info: doc.querySelector('#i2 > div:last-child')?.textContent.trim() || '',
        image, original,
        originalResolution: originalDimensions ? `${originalDimensions[1]} × ${originalDimensions[2]}` : '', originalSize,
        width, height, number: numbers[0] || 1, total: numbers[1] || 0,
        prev: numbers[0] > 1 ? imageLink(doc.querySelector('#i2 #prev')?.href) : '',
        next: numbers[1] && numbers[0] >= numbers[1] ? '' : imageLink(doc.querySelector('#i2 #next')?.href),
        gallery: galleryLink(doc.querySelector('#i5 a[href*="/g/"]')?.href),
    };
}

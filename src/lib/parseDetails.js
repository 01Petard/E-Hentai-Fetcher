import {readExEnabled, sourceOrigin, sourceUrl} from './sourceSite.js';

function detailSourceUrl(value, path, base = sourceOrigin(readExEnabled())) {
    const url = sourceUrl(value, new URL(base).hostname === 'exhentai.org', base);
    return url && path.test(new URL(url).pathname) ? url : '';
}

function imageUrl(value, base) {
    if (!value) return '';
    try {
        const url = new URL(value, base);
        if (['e-hentai.org', 'exhentai.org'].includes(url.hostname)) url.hostname = new URL(base).hostname;
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

export function galleryLink(value, base) {
    return detailSourceUrl(value, /^\/g\/\d+\/[a-f0-9]+\/?$/i, base);
}

export function imageLink(value, base) {
    return detailSourceUrl(value, /^\/s\/[a-f0-9]+\/\d+-\d+\/?$/i, base);
}

export function uploaderLink(value, base) {
    return detailSourceUrl(value, /^\/uploader\/[^/]+\/?$/i, base);
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
    const cover = imageUrl(/url\(["']?([^"')]+)/.exec(coverStyle)?.[1], requestUrl);
    const metadata = [...doc.querySelectorAll('#gdd tr')].map(row => ({
        label: row.querySelector('.gdt1')?.textContent.trim().replace(/:$/, '') || '',
        value: row.querySelector('.gdt2')?.textContent.trim() || '',
        url: galleryLink(row.querySelector('.gdt2 a')?.getAttribute('href'), requestUrl),
    })).filter(row => row.label && row.value);
    const rating = doc.querySelector('#rating_label')?.textContent.trim().replace(/^Average:\s*/i, '') || '';
    const torrentAnchor = [...doc.querySelectorAll('#gd5 a')].find(anchor => /Torrent Download/i.test(anchor.textContent));
    const torrentTarget = torrentAnchor?.getAttribute('href') === '#'
        ? /popUp\(['"]([^'"]+)/.exec(torrentAnchor.getAttribute('onclick') || '')?.[1]
        : torrentAnchor?.getAttribute('href');
    const torrentUrl = detailSourceUrl(torrentTarget, /^\/gallerytorrents\.php$/, requestUrl);
    const tags = [...doc.querySelectorAll('#taglist tr')].map(row => ({
        label: row.querySelector('.tc')?.textContent.trim().replace(/:$/, '') || '',
        values: [...row.querySelectorAll('.gt, .gtl')].map(node => ({
            name: node.querySelector('a')?.textContent.trim() || node.textContent.trim(),
            key: node.id.startsWith('td_') ? translationKey(node.id.slice(3)) : '',
        })).filter(tag => tag.name),
    })).filter(group => group.values.length);
    const rangeText = doc.querySelector('.gpc')?.textContent.trim() || '';
    const range = /Showing\s+([\d,]+)\s*-\s*([\d,]+)\s+of\s+([\d,]+)\s+images/i.exec(rangeText);
    const firstImageNumber = Number(range?.[1]?.replaceAll(',', '')) || 1;
    const images = [...doc.querySelectorAll('#gdt > a')].map((anchor, index) => {
        const cell = anchor.querySelector('div');
        const style = cell?.style;
        const src = imageUrl(/url\(["']?([^"')]+)/.exec(style?.backgroundImage || '')?.[1], requestUrl);
        const title = cell?.getAttribute('title') || '';
        const number = Number(/^Page\s+(\d+):/i.exec(title)?.[1]) || firstImageNumber + index;
        return {
            url: imageLink(anchor.getAttribute('href'), requestUrl), number, name: title.replace(/^Page\s+\d+:\s*/i, ''),
            sprite: src, position: style?.backgroundPosition || '0 0',
            width: style?.width || '200px', height: style?.height || '280px',
        };
    }).filter(item => item.url && item.sprite && Number.isInteger(item.number));
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
        uploaderUrl: uploaderLink(doc.querySelector('#gdn a')?.getAttribute('href'), requestUrl),
        metadata, rating, torrentUrl, tags, images, comments,
        imageRange: rangeText, totalImages,
        sourcePageSize,
        sourcePageCount: Math.max(...sourcePageNumbers, sourcePageSize ? Math.ceil(totalImages / sourcePageSize) : 1),
        source: galleryLink(requestUrl, requestUrl),
    };
}

export function parseImageDetail(html, requestUrl = sourceOrigin(readExEnabled())) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const imageNode = doc.querySelector('#img');
    const image = imageUrl(imageNode?.getAttribute('src'), requestUrl);
    if (!image) throw new Error('响应中没有单页图片');
    const originalNode = [...doc.querySelectorAll('#i6 a')].find(anchor => /^Download original\b/i.test(anchor.textContent.trim()));
    const original = imageUrl(originalNode?.getAttribute('href'), requestUrl);
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
        prev: numbers[0] > 1 ? imageLink(doc.querySelector('#i2 #prev')?.getAttribute('href'), requestUrl) : '',
        next: numbers[1] && numbers[0] >= numbers[1] ? '' : imageLink(doc.querySelector('#i2 #next')?.getAttribute('href'), requestUrl),
        gallery: galleryLink(doc.querySelector('#i5 .sb a')?.getAttribute('href'), requestUrl),
    };
}

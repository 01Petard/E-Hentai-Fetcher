<script setup>
import {computed, nextTick, onMounted, onUnmounted, ref} from 'vue';
import {galleryLink, imageLink, localGalleryUrl, localImageUrl, parseGalleryDetail, parseImageDetail} from '../lib/parseDetails.js';
import {readTagCache, refreshTagTranslations} from '../lib/tagTranslations.js';
import ImmersiveReader from './ImmersiveReader.vue';
import UiIcon from './UiIcon.vue';

const kind = window.location.pathname === '/image' ? 'image' : 'gallery';
const data = ref(null);
const loading = ref(true);
const error = ref('');
const source = ref('');
const translations = ref({});
const pageSize = ref(20);
const columns = ref(10);
const commentsCollapsed = ref(false);
const pageIndex = ref(0);
const jumpOpen = ref(false);
const jumpValue = ref('');
const jumpError = ref('');
const jumpInput = ref(null);
const immersiveOpen = ref(false);
let requestVersion = 0;
const spriteObserver = new ResizeObserver(entries => {
  for (const entry of entries) {
    const sprite = entry.target.firstElementChild;
    if (sprite?.offsetWidth && sprite.offsetHeight) {
      const scale = Math.min(entry.contentRect.width / sprite.offsetWidth, entry.contentRect.height / sprite.offsetHeight);
      sprite.style.transform = `scale(${scale})`;
    }
  }
});
const metadataObserver = new ResizeObserver(entries => {
  for (const entry of entries) {
    entry.target.parentElement?.style.setProperty('--metadata-height', `${entry.target.getBoundingClientRect().height}px`);
  }
});
function observeMetadata(element) {
  metadataObserver.disconnect();
  if (element) metadataObserver.observe(element);
}
const vFitSprite = {
  mounted(element) { spriteObserver.observe(element); },
  unmounted(element) { spriteObserver.unobserve(element); },
};
const metadataLabels = {Posted: '发布于', Parent: '上级画廊', Visible: '可见状态', Language: '语言', 'File Size': '文件大小', Length: '总页数', Favorited: '收藏次数'};
const categoryLabels = {
  Doujinshi: '同人志',
  Manga: '漫画',
  'Artist CG': '画师 CG',
  'Game CG': '游戏 CG',
  Western: '西方作品',
  'Non-H': '非成人',
  'Image Set': '图集',
  Cosplay: '角色扮演',
  'Asian Porn': '亚洲写真',
  Misc: '其他'
};
const namespaceLabels = {
  artist: '画师',
  cosplayer: '角色扮演',
  parody: '原作',
  character: '角色',
  group: '社团',
  language: '语言',
  male: '男性',
  female: '女性',
  mixed: '混合',
  other: '其他',
  location: '场景',
  reclass: '分类',
  temp: '临时'
};
const totalPages = computed(() => data.value?.totalImages ? Math.ceil(data.value.totalImages / pageSize.value) : 1);
const tagCount = computed(() => data.value?.tags.reduce((sum, group) => sum + group.values.length, 0) || 0);

function translatedTag(tag) {
  const translated = translations.value[tag.key];
  return translated ? new DOMParser().parseFromString(translated, 'text/html').body.textContent.trim() || tag.name : tag.name;
}

function metadataValue(item) {
  if (item.label === 'Visible') return {Yes: '是', No: '否'}[item.value] || item.value;
  if (item.label === 'Language') return {Japanese: '日语', English: '英语', Chinese: '中文', Korean: '韩语'}[item.value] || item.value;
  if (item.label === 'Length') return item.value.replace(/\bpages?\b/i, '页');
  if (item.label === 'Favorited') return item.value.replace(/\btimes?\b/i, '次');
  return item.value;
}

function pageUrl(base, index) {
  const url = new URL(base);
  if (index) url.searchParams.set('p', String(index));
  else url.searchParams.delete('p');
  return url.href;
}

async function fetchSource(url) {
  const response = await fetch('/fetch', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({url, userAgent: navigator.userAgent, extended: true}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '本地请求失败');
  if (result.status !== 200) throw new Error(`目标站点返回 HTTP ${result.status}`);
  return result.body;
}

async function load() {
  const version = ++requestVersion;
  const params = new URLSearchParams(window.location.search);
  const target = kind === 'gallery' ? galleryLink(params.get('url')) : imageLink(params.get('url'));
  data.value = null;
  error.value = '';
  source.value = target;
  if (!target) {
    error.value = '详情地址无效，请从搜索结果进入。';
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    if (kind === 'image') {
      const parsed = parseImageDetail(await fetchSource(target));
      if (version === requestVersion) {
        data.value = parsed;
        document.title = `${parsed.title} · Gallery Lens`;
      }
    } else {
      const base = pageUrl(target, 0);
      const first = parseGalleryDetail(await fetchSource(base), base);
      const sourceSize = first.sourcePageSize || first.images.length || 20;
      const sourceIndex = Number(new URL(target).searchParams.get('p'));
      const requested = params.has('page') ? Number(params.get('page'))
          : Number.isSafeInteger(sourceIndex) && sourceIndex > 0 ? Math.floor(sourceIndex * sourceSize / pageSize.value) : 0;
      pageIndex.value = Number.isSafeInteger(requested) && requested >= 0 ? requested : 0;
      const total = first.totalImages || Number(first.metadata.find(item => item.label === 'Length')?.value.match(/\d+/)?.[0]) || first.images.length;
      pageIndex.value = Math.min(pageIndex.value, Math.max(0, Math.ceil(total / pageSize.value) - 1));
      const start = pageIndex.value * pageSize.value;
      const end = Math.min(total, start + pageSize.value);
      const firstSourcePage = Math.floor(start / sourceSize);
      const lastSourcePage = Math.floor(Math.max(start, end - 1) / sourceSize);
      if (lastSourcePage >= first.sourcePageCount) throw new Error('源站分页页码与图片总数不一致');
      const pages = await Promise.all(Array.from({length: lastSourcePage - firstSourcePage + 1}, (_, offset) => {
        const index = firstSourcePage + offset;
        return index === 0 ? Promise.resolve(first) : fetchSource(pageUrl(base, index)).then(html => parseGalleryDetail(html, pageUrl(base, index)));
      }));
      const images = pages.flatMap(page => page.images).filter(image => image.number > start && image.number <= end);
      if (version === requestVersion) {
        const firstImage = images[0]?.number;
        const lastImage = images.at(-1)?.number;
        data.value = {
          ...first, images, totalImages: total,
          imageRange: firstImage && lastImage ? `第 ${firstImage} 张到第 ${lastImage} 张 · 共 ${total} 张` : `共 ${total} 张`
        };
        document.title = `${first.title} · Gallery Lens`;
      }
    }
  } catch (failure) {
    if (version === requestVersion) error.value = failure.message || '详情加载失败';
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

function navigate(url) {
  if (!url) return;
  window.history.pushState(null, '', localImageUrl(url));
  window.scrollTo(0, 0);
  load();
}

function navigateGallery(index) {
  if (!data.value || index < 0 || index >= totalPages.value) return;
  jumpOpen.value = false;
  jumpError.value = '';
  window.history.pushState(null, '', galleryPageHref(index));
  window.scrollTo(0, 0);
  load();
}

async function openPageJump() {
  jumpValue.value = String(pageIndex.value + 1);
  jumpError.value = '';
  jumpOpen.value = true;
  await nextTick();
  jumpInput.value?.select();
}

function submitPageJump() {
  const raw = String(jumpValue.value).trim();
  const number = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(number) || number < 1 || number > totalPages.value) {
    jumpError.value = `请输入 1 到 ${totalPages.value} 之间的页码`;
    return;
  }
  navigateGallery(number - 1);
}

function galleryPageHref(index) {
  const url = new URL(localGalleryUrl(data.value.source), window.location.origin);
  if (index) url.searchParams.set('page', String(index));
  return url.pathname + url.search;
}

function imageDownloadHref(url, variant) {
  return `/api/image-download?${new URLSearchParams({url, page: String(data.value.number), variant})}`;
}

function changePageSize() {
  if (![20, 40, 60, 80, 100].includes(pageSize.value)) return;
  try {
    localStorage.setItem('gallery-lens.gallery-page-size', String(pageSize.value));
  } catch { /* Keep this setting for the current tab. */
  }
  const firstImage = data.value?.images[0]?.number || 1;
  navigateGallery(Math.floor((firstImage - 1) / pageSize.value));
}

function changeColumns() {
  if (!Number.isInteger(columns.value) || columns.value < 2 || columns.value > 10) return;
  try {
    localStorage.setItem('gallery-lens.gallery-columns', String(columns.value));
  } catch { /* Keep this setting for the current tab. */
  }
}

function updateCommentsCollapsed(event) {
  commentsCollapsed.value = !event.currentTarget.open;
  try {
    localStorage.setItem('gallery-lens.comments-collapsed', commentsCollapsed.value ? '1' : '0');
  } catch { /* Keep the current state for this page. */
  }
}

function onPopState() {
  immersiveOpen.value = false;
  load();
}

function onKeydown(event) {
  if (kind !== 'image' || !data.value || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  if (event.key === 'ArrowLeft' && data.value.prev) navigate(data.value.prev);
  if (event.key === 'ArrowRight' && data.value.next) navigate(data.value.next);
}

onMounted(async () => {
  try {
    const cached = Number(localStorage.getItem('gallery-lens.gallery-page-size'));
    if ([20, 40, 60, 80, 100].includes(cached)) pageSize.value = cached;
    localStorage.setItem('gallery-lens.gallery-page-size', String(pageSize.value));
    const cachedColumns = Number(localStorage.getItem('gallery-lens.gallery-columns'));
    if (Number.isInteger(cachedColumns) && cachedColumns >= 2 && cachedColumns <= 10) columns.value = cachedColumns;
    localStorage.setItem('gallery-lens.gallery-columns', String(columns.value));
    commentsCollapsed.value = localStorage.getItem('gallery-lens.comments-collapsed') === '1';
  } catch { /* Keep the default page size. */
  }
  load();
  const cached = await readTagCache();
  if (cached?.translations) translations.value = cached.translations;
  else {
    try {
      translations.value = (await refreshTagTranslations()).translations;
    } catch { /* Show source names while translations are unavailable. */
    }
  }
  window.addEventListener('popstate', onPopState);
  window.addEventListener('keydown', onKeydown);
});
onUnmounted(() => {
  spriteObserver.disconnect();
  metadataObserver.disconnect();
  window.removeEventListener('popstate', onPopState);
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="detail-shell" :class="{'gallery-page': kind === 'gallery'}">
    <header class="site-header"><a class="brand" href="/"><span class="brand-mark">E<span>·</span></span><span><strong>Gallery Lens</strong><small>在线图库检索</small></span></a>
      <nav class="header-actions"><a href="/">返回搜索</a><a v-if="source" :href="source" target="_blank" rel="noopener noreferrer">原站页面 ↗</a></nav>
    </header>
    <main class="detail-main">
      <div v-if="loading" class="detail-state" role="status"><span class="spinner"></span>
        <h1>正在整理{{ kind === 'gallery' ? '画廊' : '图片' }}内容…</h1></div>
      <div v-else-if="error" class="detail-state" role="alert"><h1>无法显示详情</h1>
        <p>{{ error }}</p><a href="/">返回搜索页</a></div>
      <template v-else-if="kind === 'gallery' && data">
        <section class="detail-overview">
          <div class="detail-overview-heading">
            <div class="immersive-entry-wrap"><button type="button" class="immersive-entry" @click="immersiveOpen = true"><UiIcon name="book" :size="20"/>沉浸式浏览<UiIcon name="next" :size="17"/></button><span>全屏阅读，享受更好的浏览体验</span></div>
            <div class="detail-title-row"><span class="category">{{ categoryLabels[data.category] || data.category || '未分类' }}</span><span v-if="data.rating" class="detail-rating">★ {{
                data.rating
              }}</span></div>
            <h1>{{ data.title }}</h1>
            <p v-if="data.japaneseTitle" class="detail-subtitle">{{ data.japaneseTitle }}</p>
          </div>
          <div class="detail-overview-body">
            <div v-if="data.cover" class="detail-cover"><img :src="data.cover" :alt="data.title"/></div>
            <div :ref="observeMetadata" class="detail-metadata-panel"><h2><UiIcon name="info" :size="20"/>基本信息</h2><dl class="detail-metadata">
              <div v-if="data.uploader">
                <dt>上传者</dt>
                <dd><a v-if="data.uploaderUrl" :href="`/?url=${encodeURIComponent(data.uploaderUrl)}`">{{ data.uploader }}</a><span v-else>{{ data.uploader }}</span></dd>
              </div>
              <div v-for="item in data.metadata" :key="item.label">
                <dt>{{ metadataLabels[item.label] || item.label }}</dt>
                <dd><a v-if="item.url" :href="localGalleryUrl(item.url)">{{ metadataValue(item) }}</a><span v-else>{{ metadataValue(item) }}</span></dd>
              </div>
            </dl></div>
            <div v-if="data.tags.length" class="detail-tags-panel"><h2><UiIcon name="tag" :size="20"/>标签 <small>{{ tagCount }} 项</small></h2>
              <div class="detail-tag-groups" tabindex="0" aria-label="画廊标签，可滚动查看更多">
                <div v-for="group in data.tags" :key="group.label" class="detail-tag-row"><strong>{{ namespaceLabels[group.label] || group.label }}</strong>
                  <div><span v-for="tag in group.values" :key="tag.key || tag.name" :title="tag.name">{{ translatedTag(tag) }}</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section class="detail-section detail-catalog">
          <div class="detail-section-heading">
            <div><h2><UiIcon name="image" :size="23"/>图片目录 <small>{{ data.imageRange }}</small></h2></div>
            <div class="detail-gallery-controls">
              <div class="detail-gallery-settings"><label for="gallery-page-size">每页数量 <select id="gallery-page-size" v-model.number="pageSize" @change="changePageSize">
                <option v-for="size in [20, 40, 60, 80, 100]" :key="size" :value="size">{{ size }}</option>
              </select></label><label for="gallery-columns">每行数量 <select id="gallery-columns" v-model.number="columns" @change="changeColumns">
                <option v-for="count in [5, 6, 7, 8, 9, 10]" :key="count" :value="count">{{ count }}</option>
              </select></label></div>
              <nav v-if="totalPages > 1" class="detail-pages" aria-label="图片目录分页">
                <button type="button" :disabled="pageIndex === 0" @click="navigateGallery(0)">第一页</button>
                <button type="button" :disabled="pageIndex === 0" @click="navigateGallery(pageIndex - 1)">上一页</button>
                <div class="detail-page-jump">
                  <button v-if="!jumpOpen" type="button" :aria-label="`跳转页码，当前第 ${pageIndex + 1} 页，共 ${totalPages} 页`" @click="openPageJump">…</button>
                  <form v-else @submit.prevent="submitPageJump"><label class="sr-only" for="gallery-jump-page">跳转到第几页</label><input id="gallery-jump-page" ref="jumpInput" v-model="jumpValue"
                                                                                                                                          type="number" min="1" :max="totalPages" inputmode="numeric"
                                                                                                                                          @keydown.esc="jumpOpen = false"/>
                    <button type="submit">跳转</button>
                    <span v-if="jumpError" class="detail-page-error" role="alert">{{ jumpError }}</span></form>
                </div>
                <button type="button" :disabled="pageIndex >= totalPages - 1" @click="navigateGallery(pageIndex + 1)">下一页</button>
                <button type="button" :disabled="pageIndex >= totalPages - 1" @click="navigateGallery(totalPages - 1)">末页</button>
                <span class="detail-page-status">{{ pageIndex + 1 }} / {{ totalPages }}</span>
              </nav>
            </div>
          </div>
          <div v-if="data.images.length" class="detail-image-grid" :style="{ '--gallery-columns': columns }"><a v-for="item in data.images" :key="item.url" :href="localImageUrl(item.url)"
                                                                                                                class="detail-image-card">
            <div v-fit-sprite class="detail-sprite-frame">
              <div class="detail-sprite" :style="{ width: item.width, height: item.height, backgroundImage: `url('${item.sprite}')`, backgroundPosition: item.position }"></div>
            </div>
            <span class="detail-image-number">{{ item.number }}</span><span class="detail-image-name" :title="item.name">{{ item.name }}</span></a></div>
          <p v-else>本页没有可显示的图片缩略图。</p></section>
        <details class="detail-section detail-comments" :open="!commentsCollapsed" @toggle="updateCommentsCollapsed">
          <summary><span class="detail-comments-title">评论 <small>{{ data.comments.length }} 条</small></span><span class="detail-comments-toggle">{{ commentsCollapsed ? '展开' : '收起' }}</span>
          </summary>
          <div v-if="data.comments.length" class="detail-comment-list">
            <article v-for="(comment, index) in data.comments" :key="index" class="detail-comment">
              <div class="detail-comment-header"><strong>{{ comment.author }}</strong><span>{{ comment.posted }}</span><span v-if="comment.score">评分 {{ comment.score }}</span></div>
              <p>{{ comment.body }}</p></article>
          </div>
          <p v-else class="detail-comment-empty">暂无评论。</p></details>
      </template>
      <template v-else-if="data">
        <nav class="detail-breadcrumb" aria-label="当前位置"><a href="/">搜索结果</a><span>/</span><a v-if="data.gallery" :href="localGalleryUrl(data.gallery)">画廊详情</a><span>/</span><span>第 {{
            data.number
          }} 页</span></nav>
        <div class="reader-heading">
          <div><h1>{{ data.title }}</h1>
            <p>{{ data.info }}</p></div>
          <strong>{{ data.number }} <span>/ {{ data.total || '?' }}</span></strong></div>
        <nav class="reader-controls" aria-label="图片导航">
          <button type="button" :disabled="!data.prev" @click="navigate(data.prev)">← 上一页</button>
          <a v-if="data.gallery" :href="localGalleryUrl(data.gallery)">返回图片目录</a>
          <button type="button" :disabled="!data.next" @click="navigate(data.next)">下一页 →</button>
        </nav>
        <div class="reader-downloads" aria-label="下载图片">
          <a :href="imageDownloadHref(data.image, 'preview')"><UiIcon name="download" :size="16"/>下载低保真图</a>
          <a v-if="data.original" :href="imageDownloadHref(data.original, 'original')"><UiIcon name="download" :size="16"/>下载原图</a>
          <span v-else>此页未提供原图下载地址</span>
        </div>
        <div class="reader-image"><img :src="data.image" :alt="`${data.title} 第 ${data.number} 页`" referrerpolicy="no-referrer"/></div>
        <nav class="reader-controls reader-controls-bottom" aria-label="底部图片导航">
          <button type="button" :disabled="!data.prev" @click="navigate(data.prev)">← 上一页</button>
          <a v-if="data.gallery" :href="localGalleryUrl(data.gallery)">返回图片目录</a>
          <button type="button" :disabled="!data.next" @click="navigate(data.next)">下一页 →</button>
        </nav>
      </template>
    </main>
    <ImmersiveReader v-if="immersiveOpen && kind === 'gallery' && data" :gallery="data" :fetch-source="fetchSource" @close="immersiveOpen = false"/>
  </div>
</template>

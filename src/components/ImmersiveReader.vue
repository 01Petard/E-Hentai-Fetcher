<script setup>
import {computed, nextTick, onMounted, onUnmounted, ref} from 'vue';
import {parseGalleryDetail, parseImageDetail} from '../lib/parseDetails.js';
import {clearImmersiveCache, getImmersiveCacheStats, preloadImmersiveImage, subscribeImmersiveCache, waitForImmersiveImage} from '../lib/immersiveCache.js';

const props = defineProps({gallery: {type: Object, required: true}, fetchSource: {type: Function, required: true}});
const emit = defineEmits(['close']);
const dialog = ref(null);
const first = ref(1);
const pages = ref([]);
const pending = ref(false);
const error = ref('');
const fullscreen = ref(false);
const controlsVisible = ref(true);
const hintVisible = ref(true);
const settingsOpen = ref(false);
const preloadEnabled = ref(false);
const preloadCount = ref(5);
const cacheStats = ref(getImmersiveCacheStats());
const total = computed(() => props.gallery.totalImages);
const pageCount = computed(() => pages.value.length || 1);
const sourcePages = new Map();
const imagePages = new Map();
const backStack = [];
let version = 0;
let previousOverflow = '';
let jumpTimer;
let hintTimer;
let controlsTimer;
let progressDragging = false;
let preloadVersion = 0;
let unsubscribeCache;
let queuedTurns = 0;

function sourcePageUrl(index) {
  const url = new URL(props.gallery.source);
  if (index) url.searchParams.set('p', String(index));
  else url.searchParams.delete('p');
  return url.href;
}

async function imageAt(number) {
  if (number > total.value) return null;
  const sourceIndex = Math.floor((number - 1) / props.gallery.sourcePageSize);
  if (!sourcePages.has(sourceIndex)) {
    const known = props.gallery.images.find(image => image.number === number);
    if (!known) {
      const url = sourcePageUrl(sourceIndex);
      sourcePages.set(sourceIndex, props.fetchSource(url).then(html => parseGalleryDetail(html, url).images).catch(failure => {
        sourcePages.delete(sourceIndex);
        throw failure;
      }));
    }
  }
  const image = props.gallery.images.find(item => item.number === number)
      || (await sourcePages.get(sourceIndex)).find(item => item.number === number);
  if (!image) throw new Error(`找不到第 ${number} 页的图片地址`);
  if (!imagePages.has(number)) {
    imagePages.set(number, props.fetchSource(image.url).then(html => parseImageDetail(html)).catch(failure => {
      imagePages.delete(number);
      throw failure;
    }));
  }
  return imagePages.get(number);
}

function decodeImage(url) {
  const image = new Image();
  image.referrerPolicy = 'no-referrer';
  image.src = url;
  return image.decode();
}

async function show(number, navigation = '') {
  const current = ++version;
  const target = Math.max(1, Math.min(total.value, number));
  error.value = '';
  pending.value = true;
  let changed = false;
  try {
    const [left, right] = await Promise.all([imageAt(target), target < total.value ? imageAt(target + 1).catch(() => null) : Promise.resolve(null)]);
    if (current !== version) return;
    const spread = right && !isWide(left) && !isWide(right) ? [left, right] : [left];
    const prepared = await Promise.all(spread.map(async (page, offset) => {
      const cached = await waitForImmersiveImage(target + offset);
      return {...page, displayUrl: cached || page.image};
    }));
    if (current !== version) return;
    await Promise.all(prepared.map(page => decodeImage(page.displayUrl)));
    if (current !== version) return;
    if (navigation === 'forward') backStack.push(first.value);
    else if (navigation === 'back') backStack.pop();
    else if (navigation === 'jump') backStack.length = 0;
    first.value = target;
    pages.value = prepared;
    changed = true;
  } catch (failure) {
    if (current === version) error.value = failure.message || '图片加载失败';
  } finally {
    if (current === version) {
      pending.value = false;
      if (changed) void warmAhead();
      if (changed && queuedTurns) {
        const direction = Math.sign(queuedTurns);
        queuedTurns -= direction;
        await nextTick();
        requestAnimationFrame(() => {
          if (version !== current || pending.value || jumpTimer) return;
          if (direction > 0) nextPage();
          else previousPage();
        });
      } else if (!changed) queuedTurns = 0;
    }
  }
}

async function warmAhead() {
  const current = ++preloadVersion;
  if (!preloadEnabled.value || !pages.value.length) return;
  const start = first.value + pages.value.length;
  const end = Math.min(total.value, start + preloadCount.value - 1);
  const keep = new Set(Array.from({length: Math.min(total.value, end) - first.value + 1}, (_, index) => first.value + index));
  await nextTick();
  if (current !== preloadVersion) return;
  clearImmersiveCache(keep);
  let next = start;
  async function worker() {
    while (current === preloadVersion && next <= end) {
      const number = next++;
      try {
        const detail = await imageAt(number);
        if (current !== preloadVersion) return;
        await preloadImmersiveImage(number, detail.image);
      } catch { /* An unavailable preview can still be opened normally. */ }
    }
  }
  void Promise.all([worker(), worker()]);
}

function savePreloadSettings() {
  try {
    const preferences = JSON.parse(localStorage.getItem('gallery-lens.preferences')) || {};
    localStorage.setItem('gallery-lens.preferences', JSON.stringify({...preferences, immersivePreload: preloadEnabled.value, immersivePreloadCount: preloadCount.value}));
  } catch { /* Settings still work for this session. */ }
  if (preloadEnabled.value) void warmAhead();
  else void clearReaderCache();
}

async function clearReaderCache() {
  const current = ++preloadVersion;
  pages.value = pages.value.map(page => ({...page, displayUrl: page.image}));
  await nextTick();
  if (current === preloadVersion) clearImmersiveCache();
}

function isWide(page) {
  return page.width > 0 && page.height > 0 && page.width / page.height >= 1.2;
}

function nextPage() {
  clearTimeout(jumpTimer);
  jumpTimer = null;
  if (pending.value) { queuedTurns = Math.min(8, queuedTurns + 1); return; }
  if (first.value + pageCount.value > total.value) { queuedTurns = 0; return; }
  show(first.value + pageCount.value, 'forward');
}

function previousPage() {
  clearTimeout(jumpTimer);
  jumpTimer = null;
  if (pending.value) { queuedTurns = Math.max(-8, queuedTurns - 1); return; }
  if (first.value === 1) { queuedTurns = 0; return; }
  show(backStack.at(-1) || Math.max(1, first.value - 1), 'back');
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (settingsOpen.value) closeSettings();
    else if (fullscreen.value) document.exitFullscreen();
    else emit('close');
    return;
  }
  if (event.key === 'Tab') {
    const controls = [...dialog.value.querySelectorAll('button:not(:disabled), input')];
    const edge = event.shiftKey ? controls[0] : controls.at(-1);
    if (document.activeElement === edge || document.activeElement === dialog.value) {
      event.preventDefault();
      (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
    }
    return;
  }
  if (event.target instanceof Element && event.target.closest('button, input, select, textarea, [contenteditable]')) return;
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    previousPage();
  }
  if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
    nextPage();
  }
}

function jump(event) {
  clearTimeout(jumpTimer);
  queuedTurns = 0;
  const number = Number(event.target.value);
  jumpTimer = setTimeout(() => {
    jumpTimer = null;
    show(number, 'jump');
  }, 140);
}

async function toggleFullscreen() {
  if (document.fullscreenElement === dialog.value) await document.exitFullscreen();
  else await dialog.value?.requestFullscreen();
}

function hideControls() {
  if (progressDragging || settingsOpen.value) return;
  controlsVisible.value = false;
  if (dialog.value?.contains(document.activeElement)) dialog.value.focus();
}

function revealControls() {
  if (!fullscreen.value) return;
  controlsVisible.value = true;
  clearTimeout(controlsTimer);
  controlsTimer = setTimeout(hideControls, 1000);
}

function onProgressPointerDown() {
  progressDragging = true;
  clearTimeout(controlsTimer);
}

function onProgressPointerUp() {
  progressDragging = false;
  revealControls();
}

function closeSettings() {
  settingsOpen.value = false;
  revealControls();
}

function onFullscreenChange() {
  fullscreen.value = document.fullscreenElement === dialog.value;
  clearTimeout(controlsTimer);
  controlsVisible.value = !fullscreen.value;
  if (fullscreen.value) hintVisible.value = false;
}

function onPageHide() { clearImmersiveCache(); }

onMounted(async () => {
  try {
    const saved = JSON.parse(localStorage.getItem('gallery-lens.preferences'));
    preloadEnabled.value = saved?.immersivePreload === true;
    if ([5, 10, 20].includes(Number(saved?.immersivePreloadCount))) preloadCount.value = Number(saved.immersivePreloadCount);
  } catch { /* Use default preload settings. */ }
  unsubscribeCache = subscribeImmersiveCache(stats => { cacheStats.value = stats; });
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  window.addEventListener('keydown', onKeydown, true);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  window.addEventListener('pagehide', onPageHide);
  await nextTick();
  dialog.value?.focus();
  hintTimer = setTimeout(() => {
    hintVisible.value = false;
  }, 3000);
  await show(1);
});
onUnmounted(() => {
  version++;
  preloadVersion++;
  clearImmersiveCache();
  unsubscribeCache?.();
  clearTimeout(jumpTimer);
  clearTimeout(hintTimer);
  clearTimeout(controlsTimer);
  document.body.style.overflow = previousOverflow;
  window.removeEventListener('keydown', onKeydown, true);
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  window.removeEventListener('pagehide', onPageHide);
  if (document.fullscreenElement === dialog.value) document.exitFullscreen();
});
</script>

<template>
  <Teleport to="body">
    <div class="immersive-backdrop" @click.self="emit('close')">
      <section ref="dialog" class="immersive-reader" :class="{'immersive-controls-visible': controlsVisible}" role="dialog" aria-modal="true" aria-label="沉浸式浏览" tabindex="-1"
               @mousemove="revealControls">
        <header class="immersive-header" :inert="fullscreen && !controlsVisible">
          <div class="immersive-actions">
            <button type="button" aria-label="预载入配置" @click="settingsOpen = true; controlsVisible = true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2.8-2.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H2.8v-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1L7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>
            </button>
            <button type="button" :aria-label="fullscreen ? '退出全屏' : '全屏浏览'" @click="toggleFullscreen">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>
              </svg>
            </button>
            <button type="button" aria-label="关闭沉浸式浏览" @click="emit('close')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <path d="M5 5 19 19M19 5 5 19"/>
              </svg>
            </button>
          </div>
        </header>
        <div class="immersive-stage">
          <button class="immersive-turn" type="button" aria-label="向左翻页" :disabled="first === 1" :inert="fullscreen && !controlsVisible" @click="previousPage">‹</button>
          <div class="immersive-spread" :class="{'immersive-spread-single': pageCount === 1}">
            <div v-for="(page, slot) in pages" :key="first + slot" class="immersive-page">
              <img :src="page.displayUrl" :alt="`第 ${first + slot} 页`" referrerpolicy="no-referrer"/>
              <span class="immersive-page-number">{{ first + slot }} / {{ total }}</span>
            </div>
            <span v-if="pending && !pages.length" class="immersive-page-state">正在加载…</span>
          </div>
          <button class="immersive-turn" type="button" aria-label="向右翻页" :disabled="first + pageCount > total" :inert="fullscreen && !controlsVisible" @click="nextPage">›</button>
        </div>
        <Transition name="immersive-hint">
          <div v-if="hintVisible" class="immersive-hint" role="status">
            <span><kbd>←</kbd> 上一页</span><span><kbd>→</kbd> / <kbd>空格</kbd> 下一页</span><span><kbd>Esc</kbd> 关闭</span><span>拖动进度条跳转</span></div>
        </Transition>
        <footer class="immersive-footer" :inert="fullscreen && !controlsVisible">
          <p v-if="error" class="immersive-error" role="alert">{{ error }}
            <button type="button" @click="show(first)">重试</button>
          </p>
          <div class="immersive-progress"><strong>{{ first }} <span>/ {{ total }}</span></strong><input type="range" min="1" :max="total" :value="first"
                                                                                                        :style="{'--progress': `${(first - 1) / Math.max(1, total - 1) * 100}%`}"
                                                                                                        aria-label="跳转到图片页" @input="jump" @pointerdown="onProgressPointerDown"
                                                                                                        @pointerup="onProgressPointerUp" @pointercancel="onProgressPointerUp"/></div>
        </footer>
        <div v-if="settingsOpen" class="immersive-settings-backdrop" @click.self="closeSettings">
          <section class="immersive-settings-panel" role="dialog" aria-modal="true" aria-label="沉浸式预载入配置">
            <div class="immersive-settings-heading"><h2>沉浸式预载入</h2><button type="button" aria-label="关闭配置" @click="closeSettings">×</button></div>
            <label class="immersive-settings-option"><input v-model="preloadEnabled" type="checkbox" @change="savePreloadSettings"/> 启用预载入</label>
            <label class="immersive-settings-option" for="reader-preload-count">向前预载入 <select id="reader-preload-count" v-model.number="preloadCount" :disabled="!preloadEnabled" @change="savePreloadSettings"><option v-for="count in [5, 10, 20]" :key="count" :value="count">{{ count }} 张</option></select></label>
            <div class="immersive-settings-cache"><span>已缓存 {{ cacheStats.ready }} 张<span v-if="cacheStats.loading"> · 加载中 {{ cacheStats.loading }} 张</span></span><button type="button" :disabled="!cacheStats.ready && !cacheStats.loading" @click="clearReaderCache">清理缓存</button></div>
            <p>仅缓存预览图；关闭阅读窗后自动清空。</p>
          </section>
        </div>
      </section>
    </div>
  </Teleport>
</template>

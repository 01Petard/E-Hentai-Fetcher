<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from 'vue';
import {privacyMode} from '../lib/privacyMode.js';
import {parseImageDetail} from '../lib/parseDetails.js';
import {displayImageUrl} from '../lib/sourceSite.js';
import LoadingIndicator from './LoadingIndicator.vue';

const props = defineProps({fetchSource: {type: Function, required: true}, loadingStyle: {type: String, required: true}});
const preview = ref(null);
const cache = new Map();
let timer;
let revealTimer;
let controller;
let version = 0;

const previewStyle = computed(() => {
  if (!preview.value) return {};
  const {item, detail, rect} = preview.value;
  const margin = 16;
  const gap = 16;
  const availableRight = window.innerWidth - rect.right - gap - margin;
  const availableLeft = rect.left - gap - margin;
  const sideWidth = Math.max(availableRight, availableLeft);
  const enlargement = 1.5;
  const maxWidth = Math.min(420 * enlargement, window.innerWidth - margin * 2 - 24, sideWidth >= 240 ? sideWidth - 24 : 420 * enlargement);
  const maxHeight = Math.min(680 * enlargement, window.innerHeight - margin * 2 - 64);
  const width = detail?.width || parseFloat(item.width) || 200;
  const height = detail?.height || parseFloat(item.height) || 280;
  const scale = Math.min(maxWidth / width, maxHeight / height);
  const panelWidth = Math.round(width * scale) + 24;
  const panelHeight = Math.round(height * scale) + 64;
  const left = availableRight >= panelWidth ? rect.right + gap : rect.left - gap - panelWidth;
  return {
    width: `${panelWidth}px`,
    '--preview-image-height': `${Math.round(height * scale)}px`,
    '--preview-image-scale': scale,
    left: `${Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin))}px`,
    top: `${Math.max(margin, Math.min(rect.top, window.innerHeight - panelHeight - margin))}px`,
  };
});

function close() {
  version++;
  clearTimeout(timer);
  clearTimeout(revealTimer);
  controller?.abort();
  controller = null;
  preview.value = null;
}

function open(item, event) {
  if (event.type !== 'focus' && (event.pointerType === 'touch' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches)) return;
  close();
  const current = version;
  const rect = event.currentTarget.getBoundingClientRect();
  let useLowFidelity = false;
  try {
    useLowFidelity = JSON.parse(localStorage.getItem('gallery-lens.preferences'))?.useLowFidelityPreview === true;
  } catch { /* Keep the fast thumbnail preview when storage is unavailable. */ }
  preview.value = {item, rect, useLowFidelity, detail: null, src: '', status: 'loading', revealed: !privacyMode.value};
  if (privacyMode.value && event.type !== 'focus') {
    revealTimer = setTimeout(() => {
      if (current === version && preview.value) preview.value.revealed = true;
    }, 500);
  }
  // Thumbnail mode reuses the loaded sprite immediately; only the clearer mode requests a single-image page.
  if (!useLowFidelity) return;
  timer = setTimeout(async () => {
    const request = new AbortController();
    controller = request;
    try {
      let detail = cache.get(item.url);
      if (!detail) {
        detail = parseImageDetail(await props.fetchSource(item.url, request.signal), item.url);
        if (current !== version) return;
        if (cache.size >= 40) cache.delete(cache.keys().next().value);
        cache.set(item.url, detail);
      }
      if (current !== version) return;
      preview.value = {...preview.value, detail, src: displayImageUrl(detail.image)};
    } catch {
      if (current === version) preview.value.status = 'error';
    } finally {
      if (controller === request) controller = null;
    }
  }, 250);
}

function imageLoaded(src) {
  if (preview.value?.src === src) preview.value.status = 'ready';
}

function imageFailed(src) {
  if (preview.value?.src !== src) return;
  cache.delete(preview.value.item.url);
  preview.value.status = 'error';
}

function onPreferencesChange(event) {
  if (event.key === 'gallery-lens.preferences' || event.key === null) close();
}

function onKeydown(event) {
  if (event.key === 'Escape') close();
}

watch(privacyMode, close, {flush: 'sync'});

onMounted(() => {
  window.addEventListener('scroll', close, true);
  window.addEventListener('resize', close);
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('storage', onPreferencesChange);
});
onUnmounted(() => {
  close();
  window.removeEventListener('scroll', close, true);
  window.removeEventListener('resize', close);
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('storage', onPreferencesChange);
});
defineExpose({open, close});
</script>

<template>
  <Teleport to="body">
    <aside v-if="preview" class="catalog-image-preview" :style="previewStyle" aria-label="单图预览">
      <div class="catalog-preview-image">
        <div v-if="!preview.useLowFidelity" class="catalog-preview-sprite detail-sprite" :style="{ width: preview.item.width, height: preview.item.height, backgroundImage: `url('${preview.item.sprite}')`, backgroundPosition: preview.item.position }" role="img" :aria-label="`第 ${preview.item.number} 张图片预览`" :data-privacy-revealed="preview.revealed || undefined"></div>
        <template v-else>
          <img v-if="preview.src && preview.status !== 'error'" :key="preview.src" :src="preview.src" :alt="`第 ${preview.item.number} 张图片预览`" :class="{'is-ready': preview.status === 'ready'}" :data-privacy-revealed="preview.revealed || undefined" referrerpolicy="no-referrer" @load="imageLoaded($event.target.getAttribute('src'))" @error="imageFailed($event.target.getAttribute('src'))"/>
          <div v-if="preview.status === 'loading'" class="catalog-preview-state" role="status"><LoadingIndicator :variant="loadingStyle"/><span>正在加载预览…</span></div>
          <div v-else-if="preview.status === 'error'" class="catalog-preview-state" role="status"><strong>暂时无法预览</strong><span>点击缩略图查看单图</span></div>
        </template>
      </div>
      <div class="catalog-preview-caption"><strong>第 {{ preview.item.number }} 张</strong><span>{{ preview.useLowFidelity ? '低保真预览' : '缩略图放大' }}</span></div>
    </aside>
  </Teleport>
</template>

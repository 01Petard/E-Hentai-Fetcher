<script setup>
import {computed, onMounted, onUnmounted, ref} from 'vue';
import {parseImageDetail} from '../lib/parseDetails.js';
import {displayImageUrl} from '../lib/sourceSite.js';
import LoadingIndicator from './LoadingIndicator.vue';

const props = defineProps({fetchSource: {type: Function, required: true}, loadingStyle: {type: String, required: true}});
const preview = ref(null);
const cache = new Map();
let timer;
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
  const maxWidth = Math.min(420, window.innerWidth - margin * 2 - 24, sideWidth >= 240 ? sideWidth - 24 : 420);
  const maxHeight = Math.min(680, window.innerHeight - margin * 2 - 64);
  const width = detail?.width || parseFloat(item.width) || 200;
  const height = detail?.height || parseFloat(item.height) || 280;
  const scale = Math.min(maxWidth / width, maxHeight / height);
  const panelWidth = Math.round(width * scale) + 24;
  const panelHeight = Math.round(height * scale) + 64;
  const left = availableRight >= panelWidth ? rect.right + gap : rect.left - gap - panelWidth;
  return {
    width: `${panelWidth}px`,
    '--preview-image-height': `${Math.round(height * scale)}px`,
    left: `${Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin))}px`,
    top: `${Math.max(margin, Math.min(rect.top, window.innerHeight - panelHeight - margin))}px`,
  };
});

function close() {
  version++;
  clearTimeout(timer);
  controller?.abort();
  controller = null;
  preview.value = null;
}

function open(item, event) {
  if (event.type !== 'focus' && (event.pointerType === 'touch' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches)) return;
  close();
  const current = version;
  const rect = event.currentTarget.getBoundingClientRect();
  // A brief dwell avoids requesting image pages while the pointer crosses the catalog.
  timer = setTimeout(async () => {
    preview.value = {item, rect, detail: null, src: '', status: 'loading'};
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
      preview.value = {item, rect, detail, src: displayImageUrl(detail.image), status: 'loading'};
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

function onKeydown(event) {
  if (event.key === 'Escape') close();
}

onMounted(() => {
  window.addEventListener('scroll', close, true);
  window.addEventListener('resize', close);
  window.addEventListener('keydown', onKeydown);
});
onUnmounted(() => {
  close();
  window.removeEventListener('scroll', close, true);
  window.removeEventListener('resize', close);
  window.removeEventListener('keydown', onKeydown);
});
defineExpose({open, close});
</script>

<template>
  <Teleport to="body">
    <aside v-if="preview" class="catalog-image-preview" :style="previewStyle" aria-label="单图预览">
      <div class="catalog-preview-image">
        <img v-if="preview.src && preview.status !== 'error'" :key="preview.src" :src="preview.src" :alt="`第 ${preview.item.number} 张图片预览`" :class="{'is-ready': preview.status === 'ready'}" referrerpolicy="no-referrer" @load="imageLoaded($event.target.getAttribute('src'))" @error="imageFailed($event.target.getAttribute('src'))"/>
        <div v-if="preview.status === 'loading'" class="catalog-preview-state" role="status"><LoadingIndicator :variant="loadingStyle"/><span>正在加载预览…</span></div>
        <div v-else-if="preview.status === 'error'" class="catalog-preview-state" role="status"><strong>暂时无法预览</strong><span>点击缩略图查看单图</span></div>
      </div>
      <div class="catalog-preview-caption"><strong>第 {{ preview.item.number }} 张</strong><span>低保真预览</span></div>
    </aside>
  </Teleport>
</template>

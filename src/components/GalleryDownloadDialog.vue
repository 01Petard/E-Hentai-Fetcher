<script setup>
import {computed, onUnmounted, ref} from 'vue';
import {BlobReader, BlobWriter, TextReader, ZipWriter} from '@zip.js/zip.js';
import {parseGalleryDetail, parseImageDetail} from '../lib/parseDetails.js';
import {archiveImageName, collectGalleryImages, downloadGalleryImage, failedPagesText, selectedRange} from '../lib/galleryDownload.js';
import UiIcon from './UiIcon.vue';

const props = defineProps({fetchSource: {type: Function, required: true}});
const dialog = ref(null);
const gallery = ref(null);
const scope = ref('all');
const startPage = ref('1');
const endPage = ref('1');
const mode = ref('preferred');
const phase = ref('idle');
const error = ref('');
const pages = ref([]);
const usingBlob = ref(false);
const completed = computed(() => pages.value.filter(page => page.status === 'done').length);
const failed = computed(() => pages.value.filter(page => page.status === 'failed'));
const fallbackCount = computed(() => pages.value.filter(page => page.quality === 'preview').length);
let session = null;
let closeAfterCancel = false;

function open(item) {
  gallery.value = item;
  scope.value = 'all';
  startPage.value = '1';
  endPage.value = String(item.totalImages);
  mode.value = 'preferred';
  phase.value = 'idle';
  error.value = '';
  pages.value = [];
  closeAfterCancel = false;
  usingBlob.value = !window.showSaveFilePicker;
  dialog.value.showModal();
}

function archiveFilename() {
  const id = /\/g\/(\d+)\//.exec(gallery.value.source)?.[1] || 'gallery';
  const title = gallery.value.title.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 80) || 'gallery';
  return `${title}-${id}.zip`;
}

async function discard() {
  const current = session;
  session = null;
  if (!current) return;
  current.controller.abort();
  if (current.writable) {
    try { await current.writable.abort(); } catch { /* The stream may already be closed. */ }
  }
}

function cancelDownload() {
  session?.controller.abort();
  if (phase.value === 'ready') {
    phase.value = 'idle';
    pages.value = [];
    void discard();
  }
}

async function close() {
  if (['collecting', 'downloading', 'saving'].includes(phase.value)) {
    closeAfterCancel = true;
    cancelDownload();
    return;
  }
  await discard();
  dialog.value?.close();
}

async function processPages(targets) {
  const current = session;
  let cursor = 0;
  let writeQueue = Promise.resolve();
  const workers = Array.from({length: Math.min(3, targets.length)}, async () => {
    while (cursor < targets.length) {
      const page = targets[cursor++];
      current.controller.signal.throwIfAborted();
      page.status = 'loading';
      page.error = '';
      page.attempt = '';
      let image;
      try {
        image = await downloadGalleryImage(page, mode.value, {
          fetchSource: props.fetchSource, parseImageDetail,
          signal: current.controller.signal,
          onAttempt: (stage, attempt) => {
            page.attempt = `${{page: '读取页面', original: '原图', preview: '展示图'}[stage]}第 ${attempt} 次`;
          },
        });
      } catch (failure) {
        if (current.controller.signal.aborted) throw failure;
        page.status = 'failed';
        page.error = failure.message || '图片下载失败';
        continue;
      }
      writeQueue = writeQueue.then(() => current.writer.add(
        archiveImageName(gallery.value.totalImages, page.number, image.mime),
        new BlobReader(image.blob), {level: 0, signal: current.controller.signal},
      ));
      await writeQueue;
      page.quality = image.quality;
      page.status = 'done';
      page.attempt = '';
    }
  });
  const results = await Promise.allSettled(workers);
  const failedWorker = results.find(result => result.status === 'rejected');
  if (failedWorker) throw failedWorker.reason;
}

async function finish() {
  phase.value = 'saving';
  if (failed.value.length) {
    await session.writer.add('failed-pages.txt', new TextReader(failedPagesText(failed.value)), {level: 0});
  }
  const blob = await session.writer.close();
  if (session.writable) {
    session = null;
  } else {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = archiveFilename();
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    session = null;
  }
  phase.value = 'done';
}

async function run(targets) {
  phase.value = 'downloading';
  try {
    await processPages(targets);
    if (failed.value.length) phase.value = 'ready';
    else await finish();
  } catch (failure) {
    if (session?.controller.signal.aborted) {
      phase.value = 'idle';
      pages.value = [];
    } else {
      phase.value = 'error';
      error.value = failure.message || '批量下载失败';
    }
    await discard();
  } finally {
    if (closeAfterCancel && !session) {
      dialog.value?.close();
      closeAfterCancel = false;
    }
  }
}

async function start() {
  if (session || phase.value !== 'idle') return;
  error.value = '';
  let range;
  try { range = selectedRange(scope.value, startPage.value, endPage.value, gallery.value.totalImages); }
  catch (failure) { error.value = failure.message; return; }

  // The picker must be opened during the button's user activation.
  const handlePromise = window.showSaveFilePicker?.({
    suggestedName: archiveFilename(),
    types: [{description: 'ZIP archive', accept: {'application/zip': ['.zip']}}],
  });
  phase.value = 'collecting';
  try {
    const handle = await handlePromise;
    const writable = handle ? await handle.createWritable() : null;
    const writer = new ZipWriter(writable || new BlobWriter('application/zip'), {level: 0});
    session = {controller: new AbortController(), writer, writable};
    const images = await collectGalleryImages(gallery.value, range.start, range.end,
      props.fetchSource, parseGalleryDetail, session.controller.signal);
    pages.value = images.map(image => ({...image, status: 'pending', error: '', quality: '', attempt: ''}));
    await run(pages.value);
  } catch (failure) {
    if (failure.name === 'AbortError' && !session) {
      phase.value = 'idle';
      return;
    }
    if (session?.controller.signal.aborted) {
      phase.value = 'idle';
      pages.value = [];
    } else {
      phase.value = 'error';
      error.value = failure.message || '批量下载失败';
    }
    await discard();
  } finally {
    if (closeAfterCancel && !session) {
      dialog.value?.close();
      closeAfterCancel = false;
    }
  }
}

function retryFailed() {
  if (phase.value !== 'ready' || !session) return;
  void run(failed.value);
}

async function exportPartial() {
  if (phase.value !== 'ready' || !session) return;
  try { await finish(); }
  catch (failure) {
    phase.value = 'error';
    error.value = failure.message || 'ZIP 保存失败';
    await discard();
  }
}

onUnmounted(() => { session?.controller.abort(); void discard(); });
defineExpose({open});
</script>

<template>
  <dialog ref="dialog" class="gallery-download-dialog" aria-labelledby="gallery-download-title" @cancel.prevent="close">
    <div class="gallery-download-content">
      <header class="gallery-download-heading"><div><span>画廊下载</span><h2 id="gallery-download-title">{{ gallery?.title }}</h2></div><button type="button" class="close-button" aria-label="关闭批量下载" @click="close"><UiIcon name="x" :size="20"/></button></header>
      <template v-if="gallery">
        <div class="gallery-download-form">
          <fieldset :disabled="phase !== 'idle'"><legend>下载范围</legend><label><input v-model="scope" type="radio" value="all"/>整本（{{ gallery.totalImages }} 页）</label><label><input v-model="scope" type="radio" value="range"/>指定页码</label><div v-if="scope === 'range'" class="gallery-download-range"><input v-model="startPage" type="number" min="1" :max="gallery.totalImages" aria-label="起始页码"/><span>至</span><input v-model="endPage" type="number" min="1" :max="gallery.totalImages" aria-label="结束页码"/></div></fieldset>
          <fieldset :disabled="phase !== 'idle'"><legend>图片质量</legend><label><input v-model="mode" type="radio" value="preferred"/>优先原图</label><label><input v-model="mode" type="radio" value="original"/>强制原图</label></fieldset>
        </div>
        <p class="gallery-download-note">原图请求可能消耗源站配额，整本下载需要较长时间。优先原图会在原图重试失败后改用展示图；强制原图不会回退。</p>
        <p v-if="usingBlob" class="gallery-download-note">当前浏览器将 ZIP 保存在内存中再下载；大画廊可能因内存不足而失败。</p>
        <p v-if="error" class="gallery-download-error" role="alert">{{ error }}</p>
        <div v-if="pages.length" class="gallery-download-progress" role="status"><strong>{{ completed }} / {{ pages.length }} 页</strong><span v-if="fallbackCount">{{ fallbackCount }} 页使用展示图</span><span v-if="failed.length">{{ failed.length }} 页失败</span><progress :value="completed + failed.length" :max="pages.length"/></div>
        <div v-if="pages.length" class="gallery-download-list" aria-label="逐页下载状态"><div v-for="page in pages" :key="page.number"><strong>{{ page.number }}</strong><span v-if="page.status === 'done'">{{ page.quality === 'preview' ? '展示图' : '原图' }}完成</span><span v-else-if="page.status === 'failed'" class="gallery-download-error">{{ page.error }}</span><span v-else-if="page.status === 'loading'">下载中{{ page.attempt ? `（${page.attempt}）` : '' }}</span><span v-else>等待中</span></div></div>
        <div class="gallery-download-actions"><button v-if="phase === 'idle'" type="button" class="gallery-download-primary" @click="start"><UiIcon name="download" :size="16"/>开始下载</button><span v-else-if="phase === 'collecting'">正在读取目录…</span><span v-else-if="phase === 'saving'">正在保存 ZIP…</span><span v-else-if="phase === 'done'">ZIP 已保存</span><button v-if="phase === 'ready'" type="button" @click="retryFailed">重试失败页</button><button v-if="phase === 'ready'" type="button" class="gallery-download-primary" @click="exportPartial">导出缺页 ZIP</button><button v-if="['collecting', 'downloading', 'ready'].includes(phase)" type="button" @click="cancelDownload">取消下载</button></div>
      </template>
    </div>
  </dialog>
</template>

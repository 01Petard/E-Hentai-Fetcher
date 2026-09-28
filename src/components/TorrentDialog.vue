<script setup>
import {ref} from 'vue';
import {parseTorrents} from '../lib/parseTorrents.js';
import UiIcon from './UiIcon.vue';
import LoadingIndicator from './LoadingIndicator.vue';
import {readLoadingStyle} from '../lib/loadingStyle.js';
import {readExEnabled, sourceUrl} from '../lib/sourceSite.js';

const dialog = ref(null);
const data = ref(null);
const title = ref('');
const loading = ref(false);
const loadingStyle = ref(readLoadingStyle());
const error = ref('');
const downloadError = ref('');
const downloading = ref('');
let requestVersion = 0;

async function open(item) {
  loadingStyle.value = readLoadingStyle();
  const version = ++requestVersion;
  title.value = item.title;
  data.value = null;
  error.value = '';
  downloadError.value = '';
  loading.value = true;
  dialog.value.showModal();
  try {
    const response = await fetch('/fetch', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({url: sourceUrl(item.torrentUrl), userAgent: navigator.userAgent, extended: false}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '本地请求失败');
    if (result.status !== 200) throw new Error(`种子页返回 HTTP ${result.status}`);
    const parsed = parseTorrents(result.body);
    if (!parsed.hasList) throw new Error('响应中没有找到种子列表');
    if (version !== requestVersion) return;
    title.value = parsed.title || item.title;
    data.value = parsed;
  } catch (failure) {
    if (version === requestVersion) error.value = failure.message || '获取种子失败';
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

function close() {
  dialog.value.close();
}

async function downloadTorrent(torrent) {
  downloading.value = torrent.downloadUrl;
  downloadError.value = '';
  try {
    const response = await fetch('/api/torrent-download', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({url: torrent.downloadUrl, userAgent: navigator.userAgent, site: readExEnabled() ? 'exhentai.org' : 'e-hentai.org'}),
    });
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || '种子文件下载失败');
    }
    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = torrent.filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
  } catch (failure) {
    downloadError.value = failure.message || '种子文件下载失败';
  } finally {
    downloading.value = '';
  }
}

defineExpose({open});
</script>

<template>
  <dialog ref="dialog" class="torrent-dialog" aria-labelledby="torrent-dialog-title" @click="event => { if (event.target === dialog) close(); }" @close="requestVersion++">
    <div class="torrent-dialog-content">
      <div class="torrent-dialog-heading"><div><span class="torrent-dialog-kicker">图库种子</span><h2 id="torrent-dialog-title">{{ title }}</h2></div><button type="button" class="close-button" aria-label="关闭种子列表" @click="close"><UiIcon name="x" :size="20" /></button></div>
      <div v-if="loading" class="torrent-dialog-state" role="status"><LoadingIndicator :variant="loadingStyle"/>正在读取种子列表…</div>
      <p v-else-if="error" class="torrent-dialog-state torrent-dialog-error" role="alert">{{ error }}</p>
      <p v-else-if="!data?.items.length" class="torrent-dialog-state">这个图库当前没有可下载的种子。</p>
      <template v-else><p class="torrent-dialog-count">共 {{ data.items.length }} 个种子</p><div class="torrent-list"><article v-for="torrent in data.items" :key="torrent.downloadUrl" class="torrent-entry"><div class="torrent-entry-heading"><strong :title="torrent.name">{{ torrent.name }}</strong><span v-if="torrent.outdated" class="torrent-outdated">已过期</span></div><div class="torrent-facts"><span>发布 {{ torrent.posted || '未知' }}</span><span>大小 {{ torrent.size || '未知' }}</span><span>做种 {{ torrent.seeds || '0' }}</span><span>连接 {{ torrent.peers || '0' }}</span><span>下载 {{ torrent.downloads || '0' }}</span><span v-if="torrent.uploader">上传者 {{ torrent.uploader }}</span></div><button type="button" class="torrent-download" :disabled="Boolean(downloading)" @click="downloadTorrent(torrent)"><UiIcon name="download" :size="15" />{{ downloading === torrent.downloadUrl ? '下载中…' : '下载种子' }}</button></article></div></template>
      <p v-if="downloadError" class="torrent-download-error" role="alert">{{ downloadError }}</p>
    </div>
  </dialog>
</template>

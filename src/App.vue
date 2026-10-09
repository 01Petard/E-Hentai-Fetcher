<script setup>
import {computed, nextTick, onMounted, onUnmounted, reactive, ref, shallowRef, watch} from 'vue';
import {buildSearchUrl} from './lib/search.js';
import {parseGallery} from './lib/parseGallery.js';
import {browserSearchResultsLoader} from './lib/searchResults.js';
import {buildTagSearchIndex} from './lib/tagSearchIndex.js';
import SearchSkeleton from './components/SearchSkeleton.vue';
import {localGalleryUrl} from './lib/parseDetails.js';
import {galleryCacheScopeKey, invalidateGalleryDetails} from './lib/galleryDetails.js';
import {readTagCache, refreshTagTranslations} from './lib/tagTranslations.js';
import UiIcon from './components/UiIcon.vue';
import SettingsSelect from './components/SettingsSelect.vue';
import TorrentDialog from './components/TorrentDialog.vue';
import {clearImmersiveCache, getImmersiveCacheStats, subscribeImmersiveCache} from './lib/immersiveCache.js';
import {clearImmersiveProgress} from './lib/immersiveProgress.js';
import {loadingStyleOptions, normalizeLoadingStyle} from './lib/loadingStyle.js';
import {displayImageUrl, sourceHosts, sourceOrigin, sourceUrl} from './lib/sourceSite.js';
import {privacyMode} from './lib/privacyMode.js';
import {defaultPreferences, defaultSearchDisplay, preferencesKey, searchDisplayKey, normalizeConfiguration, readConfiguration, writeConfiguration} from './lib/configuration.js';

const searchText = ref('');
const quickLinks = ref([]);
const quickLinkDrafts = ref([]);
const quickLinkError = ref('');
const quickLinkMessage = ref('');
const quickLinkImportInput = ref(null);
const settingsView = ref('settings');
const quickLinkManageButton = ref(null);
const configurationInput = ref(null);
const configurationBusy = ref(false);
const configurationError = ref('');
const configurationMessage = ref('');
const settingsCategory = ref('connection');
const settingsPanels = ref(null);
const settingsSections = [
  { key: 'connection', label: '连接与账号', scope: '全站', icon: 'lock', description: '确认访问站点和 Cookie，开始浏览前先完成连接配置。' },
  { key: 'search', label: '搜索与显示', scope: '首页搜索', icon: 'search', description: '管理标签显示、搜索联想和常用快捷导航。' },
  { key: 'gallery', label: '画廊浏览', scope: '详情与阅读窗', icon: 'image', description: '设置悬浮预览、阅读操作、浏览进度和图片预载入。' },
  { key: 'general', label: '系统设置', scope: '所有页面', icon: 'settings', description: '调整隐私保护和加载反馈。' },
  { key: 'maintenance', label: '数据维护', scope: '本机配置', icon: 'reset', description: '迁移使用偏好、管理标签数据库，或恢复默认配置。' },
];
const activeSettingsSection = computed(() => settingsSections.find(section => section.key === settingsCategory.value));
const draggingQuickLink = ref(null);
let quickLinksLoaded = Promise.resolve(true);
let quickLinkDraftId = 0;
let quickLinkDragPreview = null;
let quickLinkDragStartY = 0;
let quickLinkDragGrabY = 0;
let quickLinkDragHeight = 0;
let quickLinkDragPointerId = null;
const activeQuickLink = ref('');
const quickLinksStorageKey = 'gallery-lens.quick-links';
const serverQuickLinks = import.meta.env.VITE_SERVER_QUICK_LINKS === '1';
const searchSessionKey = 'gallery-lens.search-session';
const filters = reactive({...defaultSearchDisplay.filters});
const view = ref(defaultSearchDisplay.view);
const loading = ref(true);
const result = ref(null);
const tagTranslations = shallowRef({});
const tagDetails = shallowRef({});
const tagSearchIndex = shallowRef([]);
let tagIndexVersion = 0;
let disposed = false;
const loadedUrl = ref('');
let tagTextCache = new Map();
const tagPopover = ref(null);
const tagUpdate = reactive({ sha: '', checkedAt: 0, updatedAt: 0, busy: false, message: '', error: '' });
const preferences = reactive({...defaultPreferences, privacyMode: privacyMode.value});
watch(() => preferences.privacyMode, value => { privacyMode.value = value; }, {flush: 'sync'});
const immersiveCacheStats = ref(getImmersiveCacheStats());
let unsubscribeImmersiveCache;
const suggestionOpen = ref(false);
const selectedSuggestion = ref(-1);
const searchCaret = ref(0);
const clock = ref(Date.now());
let maintenanceTimer;
let preferencesReady = false;
let searchSessionReady = false;
const tagPopoverElement = ref(null);
function closeTagPopover() { tagPopover.value = null; }
const pageIndex = ref(null);
const pageSize = ref(0);
const error = ref('');
const rawResponse = ref('');
const inputError = ref('');
const requestUrl = ref('');
const cookieConfigured = ref(false);
const cookieDraft = ref('');
const configError = ref('');
const configMessage = ref('');
const savingCookie = ref(false);
const clearingCookie = ref(false);
const resettingSettings = ref(false);
const resetConfirmation = ref(null);
const resetCountdown = ref(3);
const resetMessage = ref('');
let resetDeadline = 0;
let resetCountdownTimer;
const settingsDialog = ref(null);
const previewSourceOptions = [{value: false, label: '缩略图'}, {value: true, label: '低保真图'}];
const resultsHeading = ref(null);
const searchInput = ref(null);
const torrentDialog = ref(null);
let searchVersion = 0;
let configVersion = 0;
const postedFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const paginationOptions = [
  { key: 'first', label: '首页', icon: 'first' },
  { key: 'prev', label: '上一页', icon: 'previous' },
  { key: 'next', label: '下一页', icon: 'next' },
  { key: 'last', label: '末页', icon: 'last' },
];
const activeFilterCount = computed(() => [filters.f_sh, filters.f_sto, filters.f_sfl, filters.f_sfu, filters.f_sft,
  filters.f_spf.trim(), filters.f_spt.trim(), filters.f_srdd].filter(Boolean).length);
const pagePosition = computed(() => {
  if (!result.value?.items.length || !result.value.total || !pageSize.value) return null;
  const last = !result.value.pages.next;
  const first = !result.value.pages.prev;
  const index = first ? 0 : last ? Math.ceil(result.value.total / pageSize.value) - 1 : pageIndex.value;
  if (index === null) return null;
  const start = last && !first
    ? Math.max(0, 100 - result.value.items.length / result.value.total * 100)
    : Math.min(100, index * pageSize.value / result.value.total * 100);
  const end = last ? 100 : Math.min(100, (index * pageSize.value + result.value.items.length) / result.value.total * 100);
  return {
    start: Math.round(start * 10) / 10,
    end: Math.round(end * 10) / 10,
    label: first ? '首页' : last ? '末页' : `约第 ${index + 1} 页`,
  };
});

function resetFilters() {
  for (const key of ['f_sh', 'f_sto', 'f_sfl', 'f_sfu', 'f_sft']) filters[key] = false;
  for (const key of ['f_spf', 'f_spt', 'f_srdd']) filters[key] = '';
  inputError.value = '';
}

const siteHomeUrl = computed(() => `${sourceOrigin(preferences.useEx)}/`);

function tagText(tag) {
  if (!preferences.translateTags) return tag.original;
  const translated = tagTranslations.value[tag.key];
  if (!translated) return tag.original;
  if (!tagTextCache.has(tag.key)) {
    const document = new DOMParser().parseFromString(translated, 'text/html');
    tagTextCache.set(tag.key, document.body.textContent.trim() || tag.original);
  }
  return tagTextCache.get(tag.key);
}

async function enrichPostedTimes(parsed, version, target) {
  const galleries = parsed.items.flatMap((item, index) => {
    const match = item.url && new URL(item.url).pathname.match(/^\/g\/(\d+)\/([a-f0-9]{10})\/?$/i);
    return match ? [{ gid: Number(match[1]), token: match[2], index }] : [];
  });
  for (let offset = 0; offset < galleries.length; offset += 25) {
    try {
      const batch = galleries.slice(offset, offset + 25);
      const response = await fetch('/api/gallery-posted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ galleries: batch.map(({ gid, token }) => [gid, token]), userAgent: navigator.userAgent }),
      });
      if (!response.ok) return;
      const { posted } = await response.json();
      if (version !== searchVersion || !result.value) return;
      for (const { gid, index } of batch) {
        const timestamp = Number(posted?.[gid]);
        if (!Number.isSafeInteger(timestamp) || timestamp <= 0) continue;
        const parts = Object.fromEntries(postedFormatter.formatToParts(new Date(timestamp * 1000))
          .map(({ type, value }) => [type, value]));
        result.value.items[index].published = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
      }
    } catch { return; }
  }
  if (version === searchVersion && !disposed && result.value) {
    result.value.postedEnriched = true;
    searchLoader.update(target, result.value);
  }
}

function plainText(html) {
  const text = String(html || '');
  if (!/[<&]/.test(text)) return text.replace(/\s+/g, ' ').trim();
  return new DOMParser().parseFromString(text, 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
}

function applyTagData(data) {
  if (disposed) return;
  tagTranslations.value = data.translations || {};
  tagDetails.value = data.details || {};
  tagTextCache = new Map();
  const version = ++tagIndexVersion;
  tagSearchIndex.value = [];
  void buildTagSearchIndex(tagTranslations.value, {plainText, isCurrent: () => !disposed && version === tagIndexVersion}).then(index => {
    if (index && !disposed && version === tagIndexVersion) tagSearchIndex.value = index;
  });
  tagUpdate.sha = data.sha || '';
  tagUpdate.checkedAt = data.checkedAt || 0;
  tagUpdate.updatedAt = data.updatedAt || 0;
}

async function updateTagData(force = false) {
  if (tagUpdate.busy) return;
  if (!force && tagUpdate.checkedAt && Date.now() - tagUpdate.checkedAt < preferences.updateHours * 60 * 60 * 1000) return;
  tagUpdate.busy = true;
  tagUpdate.error = '';
  tagUpdate.message = force ? '正在检查更新…' : '正在加载标签数据库…';
  try {
    const data = await refreshTagTranslations({ force });
    applyTagData(data);
    tagUpdate.message = data.changed ? '数据库已更新' : '已是最新版本';
  } catch (failure) {
    tagUpdate.error = failure.message || '更新失败';
    tagUpdate.message = '';
  } finally {
    tagUpdate.busy = false;
  }
}

function relativePublished(published) {
  if (!published || !preferences.relativeTime) return published || '时间未知';
  const date = new Date(published.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return published;
  const minutes = Math.floor((clock.value - date.getTime()) / 60000);
  if (minutes < -5 || minutes >= 30 * 24 * 60) return published.slice(0, 10);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
  return `${Math.floor(minutes / 1440)} 天前`;
}

function tagLinks(html) {
  if (!html) return [];
  const document = new DOMParser().parseFromString(html, 'text/html');
  return [...document.querySelectorAll('a[href]')].flatMap(anchor => {
    try {
      const url = new URL(anchor.getAttribute('href'));
      return ['http:', 'https:'].includes(url.protocol) ? [{ label: anchor.textContent.trim() || url.hostname, url: url.href }] : [];
    } catch { return []; }
  });
}

function openTagDetails(tag, event) {
  if (!preferences.tagDetails || !tag.key) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const width = Math.min(340, window.innerWidth - 24);
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
  const top = rect.bottom + 8 + 280 < window.innerHeight ? rect.bottom + 8 : Math.max(12, rect.top - 280);
  const details = tagDetails.value[tag.key] || {};
  tagPopover.value = {
    key: tag.key,
    name: plainText(tagTranslations.value[tag.key]) || tag.original,
    intro: plainText(details.intro),
    links: tagLinks(details.links),
    style: { left: `${left}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${Math.max(120, window.innerHeight - top - 12)}px` },
  };
}

function closeTagPopoverOnOutsideClick(event) {
  if (tagPopover.value && !tagPopoverElement.value?.contains(event.target) && !event.target.closest?.('.tag-detail-trigger')) {
    tagPopover.value = null;
  }
}

function activeSearchTerm() {
  const before = searchText.value.slice(0, searchCaret.value);
  const segmentStart = Math.max(before.lastIndexOf(';'), before.lastIndexOf(',')) + 1;
  const segment = before.slice(segmentStart);
  const namespaced = /(?:^|\s)([a-z]{1,4}:(?:"[^"]*|[^;]*))$/i.exec(segment);
  const token = namespaced?.[1] || /\S+$/.exec(segment)?.[0] || '';
  const start = before.length - token.length;
  return { start, text: token.replace(/^([a-z]{1,4}):"?/i, '$1:').replace(/^"/, '').trim() };
}

const suggestions = computed(() => {
  if (!preferences.tagSuggestions || !suggestionOpen.value) return [];
  const { text } = activeSearchTerm();
  const query = text.toLowerCase();
  if (query.length < 2) return [];
  const separator = query.indexOf(':');
  const namespace = separator >= 0 ? query.slice(0, separator + 1) : '';
  const needle = separator >= 0 ? query.slice(separator + 1) : query;
  if (!needle) return [];
  const matches = [];
  for (const entry of tagSearchIndex.value) {
    if (namespace && !entry.keyLower.startsWith(namespace)) continue;
    const english = namespace ? entry.keyLower.slice(namespace.length) : entry.keyLower;
    const englishIndex = english.indexOf(needle);
    const chineseIndex = entry.nameLower.indexOf(needle);
    if (englishIndex < 0 && chineseIndex < 0) continue;
    const score = englishIndex === 0 ? 0 : chineseIndex === 0 ? 1 : englishIndex >= 0 ? 2 : 3;
    matches.push({ ...entry, score });
    if (matches.length > 160) {
      matches.sort((a, b) => a.score - b.score || a.key.length - b.key.length);
      matches.length = 40;
    }
  }
  return matches.sort((a, b) => a.score - b.score || a.key.length - b.key.length).slice(0, 8);
});

function highlighted(text, query) {
  const needle = query.toLowerCase();
  const at = text.toLowerCase().indexOf(needle);
  if (!needle || at < 0) return [{ text, match: false }];
  return [
    { text: text.slice(0, at), match: false },
    { text: text.slice(at, at + needle.length), match: true },
    { text: text.slice(at + needle.length), match: false },
  ].filter(part => part.text);
}

function suggestionQuery() {
  const text = activeSearchTerm().text;
  return text.includes(':') ? text.slice(text.indexOf(':') + 1) : text;
}

async function acceptSuggestion(entry) {
  const { start } = activeSearchTerm();
  const colon = entry.key.indexOf(':');
  const replacement = entry.key.includes(' ') && colon >= 0
    ? `${entry.key.slice(0, colon + 1)}"${entry.key.slice(colon + 1)}"`
    : entry.key.includes(' ') ? `"${entry.key}"` : entry.key;
  searchText.value = `${searchText.value.slice(0, start)}${replacement}${searchText.value.slice(searchCaret.value)}`;
  searchCaret.value = start + replacement.length;
  suggestionOpen.value = false;
  await nextTick();
  searchInput.value?.focus();
  searchInput.value?.setSelectionRange(searchCaret.value, searchCaret.value);
}

function searchInputChanged(event) {
  inputError.value = '';
  searchCaret.value = event.target.selectionStart ?? searchText.value.length;
  suggestionOpen.value = true;
  selectedSuggestion.value = -1;
}

function searchInputKeydown(event) {
  if (!suggestions.value.length) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    selectedSuggestion.value = (selectedSuggestion.value + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.value.length) % suggestions.value.length;
  } else if (event.key === 'Enter' && selectedSuggestion.value >= 0) {
    event.preventDefault();
    acceptSuggestion(suggestions.value[selectedSuggestion.value]);
  } else if (event.key === 'Escape') {
    suggestionOpen.value = false;
  }
}

watch(preferences, value => {
  if (!preferencesReady) return;
  try { localStorage.setItem(preferencesKey, JSON.stringify(value)); } catch { /* Settings still work for this session. */ }
  if (!value.tagDetails) tagPopover.value = null;
  if (!value.tagSuggestions) suggestionOpen.value = false;
  if (value.autoUpdate) updateTagData();
}, { deep: true });

watch(() => preferences.useEx, () => {
  if (!preferencesReady) return;
  pageSize.value = 0;
  void runSearch(requestUrl.value || `${sourceOrigin(preferences.useEx)}/`, 0);
});

function saveSearchSession() {
  if (!searchSessionReady) return;
  try {
    sessionStorage.setItem(searchSessionKey, JSON.stringify({
      searchText: searchText.value,
      filters: { ...filters },
      view: view.value,
      requestUrl: requestUrl.value,
      activeQuickLink: activeQuickLink.value,
      pageIndex: pageIndex.value,
      pageSize: pageSize.value,
    }));
  } catch { /* Search remains usable when session storage is unavailable. */ }
}

watch([filters, view], () => {
  if (!searchSessionReady) return;
  try { localStorage.setItem(searchDisplayKey, JSON.stringify({view: view.value, filters: {...filters}})); } catch { /* Display settings remain usable for this session. */ }
}, {deep: true});

watch([searchText, filters, view, requestUrl, activeQuickLink, pageIndex, pageSize], saveSearchSession,
  { deep: true });

async function loadConfig() {
  const version = ++configVersion;
  try {
    const response = await fetch('/api/config');
    const data = await response.json();
    if (!disposed && version === configVersion) cookieConfigured.value = Boolean(data.configured);
  } catch {
    if (!disposed && version === configVersion) cookieConfigured.value = false;
  }
}

function openSettings(view = 'settings') {
  settingsCategory.value = view === 'quick-links' ? 'search' : settingsSections[0].key;
  settingsView.value = view === 'quick-links' ? 'quick-links' : 'settings';
  configError.value = '';
  configMessage.value = '';
  cookieDraft.value = '';
  quickLinkError.value = '';
  quickLinkMessage.value = '';
  quickLinkDrafts.value = quickLinks.value.map(item => ({ ...item, dragId: ++quickLinkDraftId }));
  try {
    const saved = JSON.parse(localStorage.getItem(preferencesKey));
    if (typeof saved?.immersivePreload === 'boolean') preferences.immersivePreload = saved.immersivePreload;
    if ([10, 20, 40, 60].includes(Number(saved?.immersivePreloadCount))) preferences.immersivePreloadCount = Number(saved.immersivePreloadCount);
    if ([0, 5, 10, 20].includes(Number(saved?.immersivePreloadBeforeCount))) preferences.immersivePreloadBeforeCount = Number(saved.immersivePreloadBeforeCount);
  } catch { /* Keep the current settings if storage is unavailable. */ }
  settingsDialog.value.showModal();
}

function openQuickLinksManagement() {
  quickLinkError.value = '';
  quickLinkMessage.value = '';
  settingsView.value = 'quick-links';
}

async function returnToSettings() {
  stopQuickLinkDrag();
  settingsView.value = 'settings';
  await nextTick();
  quickLinkManageButton.value?.focus();
}

function closeSettingsOnBackdrop(event) {
  if (event.target !== settingsDialog.value) return;
  const rect = settingsDialog.value.getBoundingClientRect();
  // Pointer capture can target the dialog after dragging; only close outside its bounds.
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
    settingsDialog.value.close();
  }
}

function normalizeQuickLink(item) {
  const label = typeof item?.label === 'string' ? item.label.trim() : '';
  const address = typeof item?.url === 'string' ? item.url.trim() : '';
  if (!label || !address) throw new Error('每个快捷链接都需要名称和地址');
  let url;
  try { url = /^(?:\/(?!\/)|\?)/.test(address) ? new URL(address, sourceOrigin()) : new URL(address); } catch { throw new Error(`“${label}”的地址无效`); }
  if (url.protocol !== 'https:' || !sourceHosts.includes(url.hostname) || url.username || url.password || url.hash || (url.port && url.port !== '443')) {
    throw new Error(`“${label}”请填写路径和查询参数，或 E-Hentai / ExHentai 的 HTTPS 完整地址`);
  }
  return { label, url: url.pathname + url.search };
}

function normalizeQuickLinks(items, useSortOrder = false) {
  const links = items.map((item, index) => {
    const link = normalizeQuickLink(item);
    if (item.sortOrder !== undefined && (!Number.isSafeInteger(item.sortOrder) || item.sortOrder < 1)) {
      throw new Error(`“${link.label}”的排序值无效`);
    }
    return { ...link, sortOrder: useSortOrder ? item.sortOrder ?? index + 1 : index + 1 };
  });
  if (useSortOrder) links.sort((a, b) => a.sortOrder - b.sortOrder);
  return links.map((link, index) => ({ ...link, sortOrder: index + 1 }));
}

function moveQuickLink(from, to) {
  if (from === to || from < 0 || to < 0 || to >= quickLinkDrafts.value.length) return;
  quickLinkDrafts.value.splice(to, 0, quickLinkDrafts.value.splice(from, 1)[0]);
}

async function addQuickLink() {
  quickLinkDrafts.value.push({ label: '', url: '', dragId: ++quickLinkDraftId });
  await nextTick();
  settingsDialog.value.querySelector('.quick-link-editor:last-child .quick-link-name')?.focus();
}

function startQuickLinkDrag(event, index) {
  if (event.button !== 0) return;
  draggingQuickLink.value = quickLinkDrafts.value[index];
  quickLinkDragPointerId = event.pointerId;
  quickLinkDragStartY = event.clientY;
  const row = event.currentTarget.closest('.quick-link-editor');
  const bounds = row.getBoundingClientRect();
  quickLinkDragGrabY = event.clientY - bounds.top;
  quickLinkDragHeight = bounds.height;
  quickLinkDragPreview = row.cloneNode(true);
  const inputs = row.querySelectorAll('input');
  quickLinkDragPreview.querySelectorAll('input').forEach((input, inputIndex) => { input.value = inputs[inputIndex].value; });
  quickLinkDragPreview.classList.remove('is-dragging');
  quickLinkDragPreview.classList.add('quick-link-preview');
  Object.assign(quickLinkDragPreview.style, { left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px` });
  document.body.appendChild(quickLinkDragPreview);
  settingsDialog.value.setPointerCapture(event.pointerId);
}

function dragQuickLink(event) {
  if (!draggingQuickLink.value || event.pointerId !== quickLinkDragPointerId) return;
  quickLinkDragPreview.style.transform = `translateY(${event.clientY - quickLinkDragStartY}px)`;
  const container = settingsDialog.value.querySelector('.quick-link-items');
  const currentIndex = quickLinkDrafts.value.indexOf(draggingQuickLink.value);
  const dragCenterY = event.clientY - quickLinkDragGrabY + quickLinkDragHeight / 2 - container.getBoundingClientRect().top;
  let targetIndex = 0;
  for (const row of container.children) {
    if (Number(row.dataset.index) !== currentIndex && dragCenterY > row.offsetTop + row.offsetHeight / 2) targetIndex++;
  }
  moveQuickLink(currentIndex, targetIndex);
}

function stopQuickLinkDrag(event) {
  if (event?.pointerId !== undefined && event.pointerId !== quickLinkDragPointerId) return;
  quickLinkDragPreview?.remove();
  quickLinkDragPreview = null;
  draggingQuickLink.value = null;
  quickLinkDragPointerId = null;
}

async function saveQuickLinks() {
  quickLinkError.value = '';
  quickLinkMessage.value = '';
  try {
    const links = normalizeQuickLinks(quickLinkDrafts.value);
    if (serverQuickLinks) {
      const response = await fetch('/api/quick-links', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(links),
      });
      if (!response.ok) throw new Error((await response.json()).error || '保存快捷链接失败');
    } else localStorage.setItem(quickLinksStorageKey, JSON.stringify(links));
    quickLinks.value = links;
    quickLinkMessage.value = '快捷导航已保存。';
  } catch (failure) {
    quickLinkError.value = failure.message || '保存快捷链接失败';
  }
}

async function importQuickLinks(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  quickLinkError.value = '';
  quickLinkMessage.value = '';
  try {
    if (file.size > 1024 * 1024) throw new Error('JSON 文件不能超过 1 MB');
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported) || imported.length > 500) throw new Error('请选择包含最多 500 条快捷链接的 JSON 数组');
    const links = normalizeQuickLinks(imported, true);
    quickLinkDrafts.value = links.map(item => ({ ...item, dragId: ++quickLinkDraftId }));
    quickLinkMessage.value = `已导入 ${links.length} 条链接，请点击“保存快捷链接”生效。`;
  } catch (failure) {
    quickLinkError.value = failure instanceof SyntaxError ? 'JSON 文件格式无效' : failure.message || '导入失败';
  }
}

function exportQuickLinks() {
  quickLinkError.value = '';
  try {
    const links = normalizeQuickLinks(quickLinkDrafts.value);
    const url = URL.createObjectURL(new Blob([JSON.stringify(links, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'quick-navigation.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (failure) {
    quickLinkError.value = failure.message || '导出失败';
  }
}

async function exportConfiguration() {
  if (configurationBusy.value) return;
  configurationBusy.value = true;
  configurationError.value = '';
  configurationMessage.value = '';
  try {
    if (!(await quickLinksLoaded)) throw new Error('快捷导航尚未加载，请刷新后重试。');
    await nextTick();
    const config = readConfiguration(localStorage, quickLinks.value, {view: view.value, filters: {...filters}});
    const url = URL.createObjectURL(new Blob([JSON.stringify({...config, exportedAt: new Date().toISOString()}, null, 2)], {type: 'application/json'}));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'gallery-lens-configuration.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    configurationMessage.value = '配置已导出。';
  } catch {
    configurationError.value = '导出失败，请检查快捷导航连接、浏览器存储权限及已保存的配置。';
  } finally {
    configurationBusy.value = false;
  }
}

async function importConfiguration(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file || configurationBusy.value) return;
  configurationBusy.value = true;
  configurationError.value = '';
  configurationMessage.value = '';
  try {
    if (file.size > 1024 * 1024) throw new Error('配置文件不能超过 1 MB。');
    let parsed;
    try { parsed = JSON.parse(await file.text()); } catch { throw new Error('配置文件不是有效的 JSON。'); }
    const config = normalizeConfiguration(parsed);
    if (!(await quickLinksLoaded)) throw new Error('快捷导航尚未加载，请刷新后重试。');
    // Validate and persist locally before changing reactive state or shared navigation.
    const previous = readConfiguration(localStorage, quickLinks.value, {view: view.value, filters: {...filters}});
    writeConfiguration(localStorage, config);
    if (serverQuickLinks) {
      try {
        const response = await fetch('/api/quick-links', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(config.quickLinks)});
        if (!response.ok) throw new Error('快捷导航保存失败，配置未导入。');
      } catch (failure) {
        writeConfiguration(localStorage, previous);
        throw failure;
      }
    }
    Object.assign(preferences, config.preferences);
    quickLinks.value = config.quickLinks;
    quickLinkDrafts.value = config.quickLinks.map(item => ({...item, dragId: ++quickLinkDraftId}));
    view.value = config.search.view;
    Object.assign(filters, config.search.filters);
    quickLinkError.value = '';
    quickLinkMessage.value = '';
    configurationMessage.value = '配置已导入，画廊偏好将在下次打开画廊时生效。';
  } catch (failure) {
    configurationError.value = failure instanceof SyntaxError ? '已保存的配置无法读取。' : failure.message || '导入失败，请检查浏览器存储权限。';
  } finally {
    configurationBusy.value = false;
  }
}

async function saveCookie() {
  if (!cookieDraft.value.trim()) {
    configError.value = '请输入 Cookie 请求头的值';
    return;
  }
  savingCookie.value = true;
  configError.value = '';
  configMessage.value = '';
  try {
    const response = await fetch('/api/config/cookie', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: cookieDraft.value }),
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Cookie 保存接口返回了非 JSON 响应（HTTP ${response.status}）。请检查线上 /api/config/cookie 是否转发到 Node 服务。`);
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '保存失败');
    invalidateGalleryDetails();
    ++configVersion;
    result.value = null;
    loadedUrl.value = '';
    cookieConfigured.value = true;
    cookieDraft.value = '';
    settingsDialog.value.close();
    void runSearch(requestUrl.value || defaultGalleryUrl, pageIndex.value);
  } catch (failure) {
    configError.value = failure.message;
  } finally {
    savingCookie.value = false;
  }
}

async function clearCookie() {
  clearingCookie.value = true;
  configError.value = '';
  configMessage.value = '';
  try {
    const response = await fetch('/api/config/cookie', { method: 'DELETE' });
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error(`Cookie 清理接口返回了非 JSON 响应（HTTP ${response.status}）。`);
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '清理失败');
    invalidateGalleryDetails();
    ++configVersion;
    ++searchVersion;
    loading.value = false;
    loadedUrl.value = '';
    cookieConfigured.value = Boolean(data.configured);
    cookieDraft.value = '';
    result.value = null;
    rawResponse.value = '';
    clearImmersiveCache();
    configMessage.value = data.configured ? '浏览器 Cookie 已清理，当前使用本地备用配置。' : '浏览器 Cookie 已清理。';
    return true;
  } catch (failure) {
    configError.value = failure.message || '清理失败';
    return false;
  } finally {
    clearingCookie.value = false;
  }
}

function closeResetConfirmation() {
  window.clearInterval(resetCountdownTimer);
  resetCountdownTimer = undefined;
  resetDeadline = 0;
}

function requestSettingsReset() {
  if (resettingSettings.value || clearingCookie.value || savingCookie.value) return;
  closeResetConfirmation();
  resetMessage.value = '';
  configError.value = '';
  resetCountdown.value = 3;
  resetDeadline = performance.now() + 3000;
  resetConfirmation.value.showModal();
  resetCountdownTimer = window.setInterval(() => {
    resetCountdown.value = Math.max(0, Math.ceil((resetDeadline - performance.now()) / 1000));
    if (!resetCountdown.value) window.clearInterval(resetCountdownTimer);
  }, 100);
}

async function confirmSettingsReset() {
  if (!resetConfirmation.value?.open || resetCountdown.value > 0 || performance.now() < resetDeadline
      || resettingSettings.value || clearingCookie.value || savingCookie.value) return;
  if (await resetSettings()) {
    resetMessage.value = configMessage.value;
    resetConfirmation.value.close();
  }
}

async function resetSettings() {
  resettingSettings.value = true;
  if (!(await clearCookie())) {
    resettingSettings.value = false;
    return false;
  }
  if (serverQuickLinks) {
    try {
      const response = await fetch('/api/quick-links', { method: 'DELETE' });
      if (!response.ok) throw new Error('清除快捷链接失败');
    } catch {
      configError.value = '清除快捷链接失败，请稍后重试';
      resettingSettings.value = false;
      return false;
    }
  }
  preferencesReady = false;
  Object.assign(preferences, defaultPreferences);
  view.value = defaultSearchDisplay.view;
  Object.assign(filters, defaultSearchDisplay.filters);
  quickLinks.value = [];
  quickLinkDrafts.value = [];
  quickLinkError.value = '';
  quickLinkMessage.value = '';
  clearImmersiveProgress();
  clearImmersiveCache();
  await nextTick();
  try {
    for (const key of [preferencesKey, quickLinksStorageKey, 'gallery-lens.gallery-page-size', 'gallery-lens.gallery-columns', 'gallery-lens.comments-collapsed', searchDisplayKey]) localStorage.removeItem(key);
  } catch { /* The current page still uses the default settings. */ }
  preferencesReady = true;
  configMessage.value = '已恢复默认配置，并清除浏览器 Cookie 和已保存的浏览进度。';
  resettingSettings.value = false;
  return true;
}

const searchLoader = browserSearchResultsLoader(async target => {
  const response = await fetch('/fetch', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({url: target, userAgent: navigator.userAgent, extended: true}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '本地请求失败');
  const html = typeof data.body === 'string' ? data.body : '';
  if (data.status !== 200) {
    const failure = new Error(`目标站点返回 HTTP ${data.status} ${data.reason || ''}。可在下方查看原始 HTML。`);
    failure.rawResponse = html;
    throw failure;
  }
  const parsed = parseGallery(html, target);
  if (!parsed.hasTable) {
    const failure = new Error('响应中没有 Extended 结果表格，可在下方查看原始 HTML。');
    failure.rawResponse = html;
    throw failure;
  }
  return parsed;
});

async function runSearch(url, targetIndex = null, options = {}) {
  const version = ++searchVersion;
  const target = sourceUrl(url, preferences.useEx);
  error.value = '';
  rawResponse.value = '';
  requestUrl.value = target;
  if (!target || !cookieConfigured.value) {
    result.value = null;
    loading.value = false;
    error.value = target ? '请先在配置菜单中保存 Cookie。' : '请求地址无效';
    return;
  }
  if (loadedUrl.value && new URL(loadedUrl.value).hostname !== new URL(target).hostname) result.value = null;
  loading.value = true;
  try {
    const {result: parsed} = await searchLoader.load(target, options);
    if (version !== searchVersion || disposed) return;
    result.value = parsed;
    loadedUrl.value = target;
    if (!parsed.pages.prev || !pageSize.value) pageSize.value = parsed.items.length;
    pageIndex.value = !parsed.pages.prev ? 0 : !parsed.pages.next && parsed.total && pageSize.value
      ? Math.ceil(parsed.total / pageSize.value) - 1 : targetIndex;
    if (!parsed.postedEnriched) void enrichPostedTimes(parsed, version, target);
  } catch (failure) {
    if (version === searchVersion && !disposed) {
      error.value = failure.message || '请求失败';
      rawResponse.value = failure.rawResponse || '';
    }
  } finally {
    if (version === searchVersion && !disposed) loading.value = false;
  }
}

async function onCacheScopeChange(event) {
  if (event.key !== galleryCacheScopeKey && event.key !== null) return;
  ++searchVersion;
  result.value = null;
  loadedUrl.value = '';
  loading.value = true;
  await loadConfig();
  if (!disposed) void runSearch(requestUrl.value || siteHomeUrl.value, pageIndex.value);
}

function goHome() {
  try { sessionStorage.removeItem(searchSessionKey); } catch { /* The in-memory reset below still applies. */ }
  searchText.value = '';
  suggestionOpen.value = false;
  tagPopover.value = null;
  activeQuickLink.value = '';
  resetFilters();
  requestUrl.value = '';
  pageIndex.value = 0;
  pageSize.value = 0;
  void runSearch(siteHomeUrl.value, 0);
}

function handleHomeClick(event) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  goHome();
}

function isPageReload() {
  try {
    const type = performance.getEntriesByType?.('navigation')?.[0]?.type;
    if (typeof type === 'string') return type === 'reload';
    return performance.navigation?.type === 1;
  } catch { return false; }
}

function submitSearch() {
  inputError.value = '';
  suggestionOpen.value = false;
  tagPopover.value = null;
  activeQuickLink.value = '';
  try {
    const url = buildSearchUrl(searchText.value, filters, preferences.useEx);
    pageSize.value = 0;
    runSearch(url, 0);
  } catch (failure) {
    inputError.value = failure.message;
    searchInput.value?.focus();
  }
}

function openQuickLink(item) {
  if (loading.value) return;
  const target = sourceUrl(item.url, preferences.useEx);
  if (!target) return;
  activeQuickLink.value = item.label;
  pageSize.value = 0;
  const url = new URL(target);
  runSearch(target, url.searchParams.has('next') || url.searchParams.has('prev') ? null : 0);
}

function navigate(page) {
  const url = result.value?.pages[page];
  if (!url || loading.value) return;
  resultsHeading.value?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  const targetIndex = page === 'first' ? 0 : page === 'last' ? null
    : pageIndex.value === null ? null : Math.max(0, pageIndex.value + (page === 'next' ? 1 : -1));
  runSearch(url, targetIndex);
}

onMounted(async () => {
  try {
    const saved = JSON.parse(localStorage.getItem(searchDisplayKey));
    if (['thumbnail', 'extended', 'minimal'].includes(saved?.view)) view.value = saved.view;
    for (const key of Object.keys(filters)) if (typeof saved?.filters?.[key] === typeof filters[key]) filters[key] = saved.filters[key];
  } catch { /* Keep default display settings when storage is unavailable. */ }
  const configRequest = loadConfig();
  const pageReload = isPageReload();
  if (pageReload) {
    try { sessionStorage.removeItem(searchSessionKey); } catch { /* The reload still starts from the site home. */ }
  }
  try {
    const saved = pageReload ? null : JSON.parse(sessionStorage.getItem(searchSessionKey));
    if (saved && typeof saved === 'object') {
      if (typeof saved.searchText === 'string') searchText.value = saved.searchText;
      if (['thumbnail', 'extended', 'minimal'].includes(saved.view)) view.value = saved.view;
      if (saved.filters && typeof saved.filters === 'object') {
        for (const key of ['advanced', 'f_sh', 'f_sto', 'f_sfl', 'f_sfu', 'f_sft']) {
          if (typeof saved.filters[key] === 'boolean') filters[key] = saved.filters[key];
        }
        for (const key of ['f_spf', 'f_spt', 'f_srdd']) {
          if (typeof saved.filters[key] === 'string') filters[key] = saved.filters[key];
        }
      }
      if (typeof saved.requestUrl === 'string') {
        const url = new URL(saved.requestUrl);
        if (url.protocol === 'https:' && sourceHosts.includes(url.hostname) &&
            (!url.port || url.port === '443') && !url.username && !url.password && !url.hash) requestUrl.value = url.href;
      }
      if (typeof saved.activeQuickLink === 'string') activeQuickLink.value = saved.activeQuickLink;
      if (Number.isInteger(saved.pageIndex) && saved.pageIndex >= 0) pageIndex.value = saved.pageIndex;
      if (Number.isInteger(saved.pageSize) && saved.pageSize > 0) pageSize.value = saved.pageSize;
    }
  } catch { /* Invalid saved state falls back to the default gallery page. */ }
  searchSessionReady = true;
  window.addEventListener('pagehide', saveSearchSession);
  window.addEventListener('storage', onCacheScopeChange);
  if (serverQuickLinks) {
    quickLinksLoaded = fetch('/api/quick-links').then(response => {
      if (!response.ok) throw new Error('快捷导航加载失败');
      return response.json();
    }).then(data => {
      if (!disposed && Array.isArray(data.links)) quickLinks.value = normalizeQuickLinks(data.links, true);
      return true;
    }).catch(() => false);
  } else {
    try {
      const saved = JSON.parse(localStorage.getItem(quickLinksStorageKey));
      if (Array.isArray(saved)) quickLinks.value = normalizeQuickLinks(saved, true);
    } catch { /* Keep the quick links empty if local configuration is invalid. */ }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(preferencesKey));
    if (saved && typeof saved === 'object') {
      for (const key of ['translateTags', 'tagDetails', 'tagSuggestions', 'relativeTime', 'autoUpdate', 'immersivePreload', 'immersiveSaveProgress', 'immersiveImageSnap', 'useEx', 'privacyMode', 'useLowFidelityPreview']) {
        if (typeof saved[key] === 'boolean') preferences[key] = saved[key];
      }
      if ([6, 24, 168].includes(Number(saved.updateHours))) preferences.updateHours = Number(saved.updateHours);
      if ([10, 20, 40, 60].includes(Number(saved.immersivePreloadCount))) preferences.immersivePreloadCount = Number(saved.immersivePreloadCount);
      if ([0, 5, 10, 20].includes(Number(saved.immersivePreloadBeforeCount))) preferences.immersivePreloadBeforeCount = Number(saved.immersivePreloadBeforeCount);
      preferences.loadingStyle = normalizeLoadingStyle(saved.loadingStyle);
    }
  } catch { /* Keep default preferences when storage is unavailable. */ }
  preferencesReady = true;
  unsubscribeImmersiveCache = subscribeImmersiveCache(stats => { immersiveCacheStats.value = stats; });
  const currentUrl = new URL(window.location.href);
  const linkedUploader = currentUrl.searchParams.get('url');
  if (linkedUploader) {
    try {
      const url = new URL(linkedUploader);
      if (url.protocol === 'https:' && sourceHosts.includes(url.hostname) && /^\/uploader\/[^/]+\/?$/i.test(url.pathname) &&
          (!url.port || url.port === '443') && !url.username && !url.password && !url.hash) {
        requestUrl.value = sourceUrl(url.href, preferences.useEx);
        pageIndex.value = 0;
      }
    } catch { /* Ignore invalid uploader links. */
    }
  }
  void configRequest.then(() => {
    if (!disposed) void runSearch(requestUrl.value || `${sourceOrigin(preferences.useEx)}/`, pageIndex.value, {force: pageReload});
  });
  if (currentUrl.searchParams.get('settings') === '1') {
    openSettings();
    currentUrl.searchParams.delete('settings');
    window.history.replaceState(null, '', currentUrl.pathname + currentUrl.search + currentUrl.hash);
  }
  const cached = await readTagCache();
  if (disposed) return;
  if (cached) applyTagData(cached);
  if (preferences.autoUpdate || !cached) updateTagData();
  maintenanceTimer = window.setInterval(() => {
    clock.value = Date.now();
    if (preferences.autoUpdate) updateTagData();
  }, 60000);
  document.addEventListener('pointerdown', closeTagPopoverOnOutsideClick);
  window.addEventListener('resize', closeTagPopover);
});

onUnmounted(() => {
  closeResetConfirmation();
  disposed = true;
  ++searchVersion;
  ++tagIndexVersion;
  unsubscribeImmersiveCache?.();
  window.clearInterval(maintenanceTimer);
  document.removeEventListener('pointerdown', closeTagPopoverOnOutsideClick);
  window.removeEventListener('resize', closeTagPopover);
  window.removeEventListener('pagehide', saveSearchSession);
  window.removeEventListener('storage', onCacheScopeChange);
});
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <a class="brand" :href="siteHomeUrl" aria-label="Gallery Lens，访问站点首页" @click="handleHomeClick">
        <span class="brand-mark">E<span>·</span></span>
        <div><strong>Gallery Lens</strong><small>在线图库检索</small></div>
      </a>
      <nav class="header-actions" aria-label="页面导航">
        <a :href="siteHomeUrl" @click="handleHomeClick"><UiIcon name="home" :size="15" /> 主页</a>
        <a href="/debug"><UiIcon name="terminal" :size="15" /> 调试控制台</a>
        <button type="button" class="settings-trigger" @click="openSettings"><UiIcon name="settings" :size="16" /> 配置 <span class="settings-dot" :class="{ active: cookieConfigured }"></span></button>
      </nav>
    </header>

    <main>
      <section class="search-hero" aria-labelledby="search-title">
        <h1 id="search-title" class="hero-statement">E-Hentai Fetcher：一个E-Hentai第三方代理工具</h1>
        <p class="hero-subtitle">快速检索、浏览与发现来自 E-Hentai 的内容</p>
        <form class="search-form" @submit.prevent="submitSearch">
          <label class="sr-only" for="search-input">搜索内容</label>
          <UiIcon class="search-icon" name="search" :size="20" />
          <input id="search-input" ref="searchInput" v-model="searchText" role="combobox" aria-autocomplete="list" type="text" autocomplete="off" spellcheck="false" :aria-invalid="Boolean(inputError)" :aria-describedby="inputError ? 'search-validation search-help' : 'search-help'" :aria-expanded="Boolean(suggestions.length)" aria-controls="tag-suggestions" placeholder="输入标题、关键词或标签组合…" @input="searchInputChanged" @focus="event => { searchCaret = event.target.selectionStart ?? searchText.length; suggestionOpen = true; }" @click="event => { searchCaret = event.target.selectionStart ?? searchText.length; }" @keydown="searchInputKeydown" @blur="suggestionOpen = false" />
          <div class="search-actions">
            <button class="advanced-toggle" type="button" :aria-expanded="filters.advanced" aria-controls="advanced-panel" @click="filters.advanced = !filters.advanced">
              <UiIcon name="filter" :size="16" /> 高级筛选 <span v-if="activeFilterCount" class="filter-count">{{ activeFilterCount }}</span><UiIcon class="advanced-chevron" :class="{ open: filters.advanced }" name="chevron-down" :size="14" />
            </button>
            <button type="submit" class="primary-button" :disabled="loading">{{ loading ? '搜索中…' : '开始搜索' }} <UiIcon name="arrow-right" :size="17" /></button>
          </div>
          <div v-if="suggestions.length" id="tag-suggestions" class="tag-suggestions" role="listbox" aria-label="标签联想">
            <button v-for="(entry, index) in suggestions" :key="entry.key" type="button" role="option" :aria-selected="selectedSuggestion === index" :class="{ selected: selectedSuggestion === index }" @pointerdown.prevent="acceptSuggestion(entry)" @click="suggestionOpen && acceptSuggestion(entry)">
              <span class="suggestion-name"><template v-for="(part, partIndex) in highlighted(entry.name, suggestionQuery())" :key="partIndex"><mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
              <span class="suggestion-key"><template v-for="(part, partIndex) in highlighted(entry.key, activeSearchTerm().text)" :key="partIndex"><mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
            </button>
          </div>
        </form>
        <p v-if="inputError" id="search-validation" class="search-validation" role="alert"><UiIcon name="alert" :size="15" />{{ inputError }}</p>
        <nav class="quick-searches" aria-label="快速导航">
          <span class="quick-search-label"><UiIcon name="bookmark" :size="15" /> 快速导航</span>
          <div class="quick-search-list">
            <button v-for="(item, index) in quickLinks" :key="`${item.url}-${index}`" type="button" :disabled="loading" :title="sourceUrl(item.url, preferences.useEx)" :aria-pressed="activeQuickLink === item.label" @click="openQuickLink(item)">{{ item.label }}<UiIcon name="arrow-right" :size="12" /></button>
          </div>
          <button class="quick-search-edit" type="button" @click="openSettings('quick-links')">编辑</button>
          <span id="search-help" class="cookie-state"><span class="status-light" :class="{ active: cookieConfigured }"></span>{{ cookieConfigured ? 'Cookie 已配置' : 'Cookie 未配置' }}</span>
        </nav>
        <div v-show="filters.advanced" id="advanced-panel" class="advanced-panel">
          <div class="filter-group">
            <h2>内容条件</h2>
            <label class="check-row"><input v-model="filters.f_sh" type="checkbox" /> 只显示已删除图库</label>
            <label class="check-row"><input v-model="filters.f_sto" type="checkbox" /> 只显示有种子的图库</label>
          </div>
          <div class="filter-group">
            <h2>页数与评分</h2>
            <div class="field-row">
              <label>最少页数 <input v-model="filters.f_spf" type="text" inputmode="numeric" maxlength="4" placeholder="不限" /></label>
              <span class="range-divider">—</span>
              <label>最多页数 <input v-model="filters.f_spt" type="text" inputmode="numeric" maxlength="4" placeholder="不限" /></label>
            </div>
            <p class="filter-hint">同时填写时，需相差至少 20 页，最小值不超过最大值的 80%。</p>
            <label class="rating-field">最低评分 <select v-model="filters.f_srdd"><option value="">无限制</option><option value="2">2 星</option><option value="3">3 星</option><option value="4">4 星</option><option value="5">5 星</option></select></label>
          </div>
          <div class="filter-group">
            <h2>禁用自定义过滤器</h2>
            <label class="check-row"><input v-model="filters.f_sfl" type="checkbox" /> 语言</label>
            <label class="check-row"><input v-model="filters.f_sfu" type="checkbox" /> 上传者</label>
            <label class="check-row"><input v-model="filters.f_sft" type="checkbox" /> 标签</label>
          </div>
          <div class="filter-actions"><span>{{ activeFilterCount ? `已选 ${activeFilterCount} 项筛选` : '尚未设置额外筛选' }}</span><button type="button" :disabled="!activeFilterCount" @click="resetFilters"><UiIcon name="reset" :size="14" /> 清空筛选</button></div>
        </div>
      </section>

      <section class="results-section" aria-labelledby="results-title" :aria-busy="loading">
        <div ref="resultsHeading" class="results-heading">
          <div><h2 id="results-title">搜索结果 <span v-if="result?.total !== null && result" class="total-pill">{{ result.approximate ? '约 ' : '' }}{{ result.total.toLocaleString() }} 条</span></h2><small v-if="result" class="page-count">本页 {{ result.items.length }} 个条目<span v-if="activeQuickLink"> · {{ activeQuickLink }}</span></small></div>
          <nav v-if="result" class="pagination" aria-label="上方分页"><button v-for="page in paginationOptions.slice(0, 2)" :key="page.key" type="button" :disabled="loading || !result.pages[page.key]" :aria-label="page.label" :title="page.label" @click="navigate(page.key)"><UiIcon :name="page.icon" :size="15" /></button><span class="pagination-current" aria-live="polite">{{ pageIndex === null ? '–' : pageIndex + 1 }}<template v-if="result.total && pageSize"> / {{ Math.ceil(result.total / pageSize) }}</template></span><button v-for="page in paginationOptions.slice(2)" :key="page.key" type="button" :disabled="loading || !result.pages[page.key]" :aria-label="page.label" :title="page.label" @click="navigate(page.key)"><UiIcon :name="page.icon" :size="15" /></button></nav>
          <div class="view-switch" role="group" aria-label="展示形式">
              <button type="button" :aria-pressed="view === 'thumbnail'" aria-label="缩略图模式" @click="view = 'thumbnail'"><UiIcon name="grid" :size="16" /> <span>缩略图</span></button>
              <button type="button" :aria-pressed="view === 'extended'" aria-label="扩展模式" @click="view = 'extended'"><UiIcon name="list" :size="17" /> <span>扩展</span></button>
              <button type="button" :aria-pressed="view === 'minimal'" aria-label="最小化模式" @click="view = 'minimal'"><UiIcon name="rows" :size="16" /> <span>最小化</span></button>
          </div>
        </div>

        <div v-if="pagePosition" class="page-position" role="group" :aria-label="`浏览进度约 ${pagePosition.start}% 到 ${pagePosition.end}%`">
          <span class="page-position-label">浏览进度 <strong>{{ pagePosition.start }}%–{{ pagePosition.end }}%</strong></span>
          <div class="page-position-track" role="progressbar" :aria-valuenow="pagePosition.end" aria-valuemin="0" aria-valuemax="100" :aria-valuetext="`约 ${pagePosition.start}% 到 ${pagePosition.end}%`" aria-label="浏览进度"><span :style="{ left: `${pagePosition.start}%`, width: `${pagePosition.end - pagePosition.start}%` }"></span></div>
          <span class="page-position-note">{{ pagePosition.label }} · 按结果总数估算</span>
        </div>

        <div v-if="error" class="message error-message" role="alert"><span class="message-icon error-icon"><UiIcon name="alert" :size="25" /></span><strong>{{ result ? '新结果加载失败，仍显示上次结果' : '暂时无法展示结果' }}</strong><p>{{ error }}</p><details v-if="rawResponse" class="response-source"><summary>查看原始 HTML 响应</summary><textarea readonly :value="rawResponse" aria-label="原始 HTML 响应"></textarea></details><div class="message-actions"><button v-if="!cookieConfigured" type="button" @click="openSettings"><UiIcon name="settings" :size="16" /> 打开配置</button><button v-if="cookieConfigured" type="button" @click="runSearch(requestUrl, pageIndex, {force: true})">重试</button><a href="/debug"><UiIcon name="external" :size="15" /> 前往调试页</a></div></div>
        <p v-if="loading && result" class="search-loading-note" role="status">正在加载新结果，当前显示上次结果…</p>
        <SearchSkeleton v-if="loading && !result" :view="view"/>
        <div v-else-if="!result && !error" class="message empty-state"><span class="message-icon"><UiIcon name="search" :size="29" /></span><strong>从一次搜索开始</strong><p>输入关键词，按需调整高级筛选，结果会显示在这里。</p></div>
        <template v-else-if="result">
          <div v-if="!result.items.length" class="message empty-state"><span class="message-icon"><UiIcon name="search" :size="29" /></span><strong>没有找到匹配的图库</strong><p>换个关键词或放宽筛选条件试试。</p></div>
          <div v-else class="gallery" :class="view">
            <div v-if="view === 'minimal'" class="minimal-header" aria-hidden="true"><span>类型</span><span>日期</span><span>评分 / 种子</span><span>标题 / 关键信息</span><span>页数</span></div>
            <article v-for="(item, index) in result.items" :key="item.url || index" class="gallery-item">
              <template v-if="view === 'minimal'">
                <div class="minimal-category"><span class="category">{{ item.category }}</span></div>
                <time :datetime="item.published.replace(' ', 'T')" :title="item.published" class="minimal-date">{{ relativePublished(item.published) }}</time>
                <div class="minimal-meta"><span v-if="item.ratingPosition" :style="{ backgroundImage: `url(https://ehgt.org/g/${item.ratingSprite})`, backgroundPosition: item.ratingPosition }"
                                                aria-label="站点星级" class="rating-stars"
                                                role="img"></span>
                  <button v-if="item.torrentUrl" class="torrent-link" type="button" @click="torrentDialog.open(item)">
                    <UiIcon :size="13" name="download"/>
                    种子
                  </button>
                  <span v-else class="no-torrent">暂无种子</span></div>
                <div class="minimal-content"><h3 class="item-title"><a :href="item.url ? localGalleryUrl(item.url) : undefined" :title="item.title">{{ item.title }}</a></h3>
                  <div v-if="item.tagGroups.length" class="minimal-tags"><span v-for="group in item.tagGroups" :key="group.label"><b>{{ group.label }}：</b><template
                      v-for="(tag, tagIndex) in group.values" :key="tag.key || tag.original"><button v-if="preferences.tagDetails && tag.key" type="button" class="tag-detail-trigger" :title="tag.key"
                                                                                                     @click="openTagDetails(tag, $event)">{{ tagText(tag) }}</button><span v-else
                                                                                                                                                                           :title="tag.key || tag.original">{{
                      tagText(tag)
                    }}</span><template v-if="tagIndex < group.values.length - 1"> · </template></template></span></div>
                  <div class="minimal-preview" aria-hidden="true"><img v-if="item.image" :src="displayImageUrl(item.image)" alt="" loading="lazy" decoding="async"/><span v-else>无封面</span></div>
                </div>
                <div class="minimal-pages">{{ item.pages || '页数未知' }}</div>
              </template>
              <template v-else>
                <a class="item-image" :href="item.url ? localGalleryUrl(item.url) : undefined">
                <img v-if="item.image" :src="displayImageUrl(item.image)" :alt="item.title" loading="lazy" decoding="async" />
                <span v-else class="missing-image"><UiIcon name="image" :size="24" /> 无封面</span>
              </a>
              <h3 class="item-title"><a :href="item.url ? localGalleryUrl(item.url) : undefined" :title="item.title">{{ item.title }}</a></h3>
              <div class="item-main"><span class="category">{{ item.category }}</span><span v-if="item.ratingPosition" class="rating-stars" role="img" aria-label="站点星级" :style="{ backgroundImage: `url(https://ehgt.org/g/${item.ratingSprite})`, backgroundPosition: item.ratingPosition }"></span></div>
                <div class="item-details">
                  <time :datetime="item.published.replace(' ', 'T')" :title="item.published">
                    <UiIcon :size="14" name="calendar"/>
                    {{ view === 'extended' ? (item.published || '时间未知') : relativePublished(item.published) }}
                  </time>
                  <span :title="item.pages"><UiIcon :size="14" name="book"/>{{ view === 'thumbnail' ? `${item.pages.match(/^\d+/)?.[0] || '?'}页` : item.pages || '页数未知' }}</span>
                  <button v-if="item.torrentUrl" class="torrent-link" type="button" @click="torrentDialog.open(item)">
                    <UiIcon :size="14" name="download"/>
                    种子
                  </button>
                  <span v-else class="no-torrent"><UiIcon :size="14" name="download"/>暂无种子</span></div>
              <div class="item-extra"><a v-if="item.uploaderUrl" :href="item.uploaderUrl" target="_blank" rel="noopener noreferrer">上传者：{{ item.uploader }}</a><div v-for="group in item.tagGroups" :key="group.label" class="tag-group"><span>{{ group.label }}</span><div><template v-for="tag in group.values" :key="tag.key || tag.original"><button v-if="preferences.tagDetails && tag.key" type="button" class="tag tag-detail-trigger" :title="tag.key" @click="openTagDetails(tag, $event)">{{ tagText(tag) }}</button><span v-else class="tag" :title="tag.key || tag.original">{{ tagText(tag) }}</span></template></div></div></div>
              </template>
            </article>
          </div>
        </template>
      </section>
    </main>

    <Teleport to="body">
      <aside v-if="tagPopover" ref="tagPopoverElement" class="tag-detail-popover" :style="tagPopover.style" :aria-label="`${tagPopover.key} 标签详情`">
        <div class="tag-detail-heading"><div><strong>{{ tagPopover.name }}</strong><small>{{ tagPopover.key }}</small></div><button type="button" aria-label="关闭标签详情" @click="tagPopover = null"><UiIcon name="x" :size="16" /></button></div>
        <p>{{ tagPopover.intro || '暂无标签介绍。' }}</p>
        <div v-if="tagPopover.links.length" class="tag-detail-links"><a v-for="link in tagPopover.links" :key="link.url" :href="link.url" target="_blank" rel="noopener noreferrer">{{ link.label }}<UiIcon name="external" :size="12" /></a></div>
      </aside>
    </Teleport>

    <footer class="site-footer">
      <span>E-HENTAI FETCHER <span class="footer-dot">·</span> INTEGRATION TOOL</span>
      <nav class="footer-links" aria-label="页脚导航">
        <a href="/development-log">
          <UiIcon name="book" :size="13" style="margin-right:4px"/> 开发日志
        </a>
        <span aria-hidden="true">·</span>
        <a href="https://www.bugstack.top" target="_blank" rel="noopener noreferrer">
          <UiIcon name="blog" :size="13" style="margin-right:4px"/> 作者主页
        </a>
      </nav>
    </footer>

    <TorrentDialog ref="torrentDialog"/>

    <dialog ref="settingsDialog" class="settings-dialog" :class="{ 'quick-links-dialog': settingsView === 'quick-links' }" aria-labelledby="settings-title" @click="closeSettingsOnBackdrop" @pointermove="dragQuickLink" @pointerup="stopQuickLinkDrag" @pointercancel="stopQuickLinkDrag" @close="stopQuickLinkDrag()">
      <div class="dialog-content"><div class="dialog-heading"><div><h2 id="settings-title">{{ settingsView === 'quick-links' ? '快捷导航管理' : '配置中心' }}</h2><p class="settings-heading-description">{{ settingsView === 'quick-links' ? '编辑常用链接及顺序，保存后生效' : '站点连接、页面偏好与数据维护' }}</p></div><button type="button" class="close-button" aria-label="关闭配置" @click="settingsDialog.close()"><UiIcon name="x" :size="20" /></button></div>
          <div v-show="settingsView === 'settings'" class="settings-layout">
            <nav class="settings-navigation" aria-label="配置分类">
              <button v-for="section in settingsSections" :key="section.key" type="button" :aria-pressed="settingsCategory === section.key" @click="stopQuickLinkDrag(); settingsCategory = section.key; if (settingsPanels) settingsPanels.scrollTop = 0">
                <UiIcon :name="section.icon" :size="18" /><span>{{ section.label }}</span><span v-if="section.key === 'connection'" class="settings-nav-status" :class="{ active: cookieConfigured }" :aria-label="cookieConfigured ? 'Cookie 已配置' : 'Cookie 未配置'"></span>
              </button>
            </nav>
            <div ref="settingsPanels" class="settings-panels">
              <div class="settings-section-heading"><div><h3>{{ activeSettingsSection.label }}</h3><span class="settings-scope">{{ activeSettingsSection.scope }}</span></div><p>{{ activeSettingsSection.description }}</p></div>
              <section v-show="settingsCategory === 'connection'" class="settings-category" aria-label="连接与账号设置">
                <div class="settings-site-row"><div><h4>访问站点</h4><p>关闭时使用 E-Hentai，开启后使用 ExHentai。</p></div><label class="source-site-setting"><input v-model="preferences.useEx" type="checkbox"/> 启用 EX（ExHentai）</label></div>
                        <section class="cookie-settings" aria-labelledby="cookie-settings-title"><h3 id="cookie-settings-title">Cookie</h3>
        <p>Cookie 保存在当前浏览器中，仅供此浏览器的请求使用。未配置时，本地服务可从 <code>.env.local</code> 读取备用值。页面不会显示已保存的值。</p>
        <form @submit.prevent="saveCookie"><label for="cookie-value">Cookie 请求头的值</label><textarea id="cookie-value" v-model="cookieDraft" spellcheck="false" autocomplete="off" placeholder="cf_clearance=...; ipb_member_id=...; ipb_pass_hash=..."></textarea><p class="form-hint"><UiIcon name="lock" :size="14" /> 保存后不会在输入框中回显；再次填写会覆盖旧值。</p><p v-if="configError" class="form-error" role="alert">{{ configError }}</p><p v-else-if="configMessage" class="settings-message" role="status">{{ configMessage }}</p><div class="dialog-actions"><span><span class="status-light" :class="{ active: cookieConfigured }"></span>{{ cookieConfigured ? '已配置' : '尚未配置' }}</span><div><button class="settings-action-button" type="button" :disabled="clearingCookie || savingCookie || !cookieConfigured" @click="clearCookie">{{ clearingCookie ? '清理中…' : '清理 Cookie' }}</button><button class="settings-action-button" type="submit" :disabled="savingCookie || clearingCookie">{{ savingCookie ? '保存中…' : '保存 Cookie' }}</button></div></div></form>

        </section>

              </section>
              <section v-show="settingsCategory === 'general'" class="settings-category" aria-label="系统设置">
                <div class="settings-preference-group"><h4>隐私保护</h4>            <div class="feature-switch-setting">
              <label><input v-model="preferences.privacyMode" type="checkbox" /> 隐私模式</label>
              <span class="setting-hint"><button type="button" aria-label="隐私模式说明" aria-describedby="privacy-mode-hint" @click="$event.currentTarget.focus()" @keydown.esc.stop.prevent="$event.currentTarget.blur()"><UiIcon name="info-circle" :size="15" /></button><span id="privacy-mode-hint" class="setting-hint-tooltip" role="tooltip">隐私模式下所有图片默认模糊，悬停 500ms 后显示清晰图片，移开后恢复模糊；悬浮预览额外等待 500ms。</span></span>
            </div>
</div>
                <div class="settings-preference-group"><h4>加载反馈</h4>          <div class="loading-style-setting">
            <label id="loading-style-label" for="loading-style">加载动画</label>
            <SettingsSelect v-if="settingsCategory === 'general'" id="loading-style" v-model="preferences.loadingStyle" :options="loadingStyleOptions" />
          </div>
</div>
              </section>
              <section v-show="settingsCategory === 'search'" class="settings-category" aria-label="搜索与显示设置">
                <div class="settings-preference-group">
                  <h4>标签与结果显示</h4>
                  <div class="feature-switches">
                    <div class="feature-switch-setting">
                      <label><input v-model="preferences.translateTags" type="checkbox" /> 标签汉化</label>
                      <span class="setting-hint"><button type="button" aria-label="标签汉化说明" aria-describedby="translate-tags-hint" @click="$event.currentTarget.focus()" @keydown.esc.stop.prevent="$event.currentTarget.blur()"><UiIcon name="info-circle" :size="15" /></button><span id="translate-tags-hint" class="setting-hint-tooltip" role="tooltip">将有译名的标签显示为中文，暂无译名时保留原文。</span></span>
                    </div>
                    <div class="feature-switch-setting">
                      <label><input v-model="preferences.tagDetails" type="checkbox" /> 标签详情</label>
                      <span class="setting-hint"><button type="button" aria-label="标签详情说明" aria-describedby="tag-details-hint" @click="$event.currentTarget.focus()" @keydown.esc.stop.prevent="$event.currentTarget.blur()"><UiIcon name="info-circle" :size="15" /></button><span id="tag-details-hint" class="setting-hint-tooltip" role="tooltip">点击标签可查看介绍和相关链接。</span></span>
                    </div>
                    <div class="feature-switch-setting">
                      <label><input v-model="preferences.tagSuggestions" type="checkbox" /> 搜索联想</label>
                      <span class="setting-hint"><button type="button" aria-label="搜索联想说明" aria-describedby="tag-suggestions-hint" @click="$event.currentTarget.focus()" @keydown.esc.stop.prevent="$event.currentTarget.blur()"><UiIcon name="info-circle" :size="15" /></button><span id="tag-suggestions-hint" class="setting-hint-tooltip" role="tooltip">输入关键词时推荐匹配的标签，选择后填入搜索框。</span></span>
                    </div>
                    <div class="feature-switch-setting">
                      <label><input v-model="preferences.relativeTime" type="checkbox" /> 相对时间</label>
                      <span class="setting-hint"><button type="button" aria-label="相对时间说明" aria-describedby="relative-time-hint" @click="$event.currentTarget.focus()" @keydown.esc.stop.prevent="$event.currentTarget.blur()"><UiIcon name="info-circle" :size="15" /></button><span id="relative-time-hint" class="setting-hint-tooltip" role="tooltip">将近期发布时间显示为“几分钟前”“几天前”等，较早的内容显示日期。</span></span>
                    </div>
                  </div>
                </div>
                <section class="quick-link-settings" aria-label="快捷导航设置">
                  <div class="quick-link-settings-summary"><div><h4>快捷导航</h4><p class="settings-detail-note">已保存 {{ quickLinks.length }} 项，管理常用的搜索与画廊链接。</p></div><button ref="quickLinkManageButton" class="settings-action-button" type="button" @click="openQuickLinksManagement">管理</button></div>
                </section>

              </section>
              <section v-show="settingsCategory === 'gallery'" class="settings-category" aria-label="画廊浏览设置">
                <div class="settings-preference-group">
                  <h4>悬浮预览</h4>
                  <div class="loading-style-setting">
                    <div class="feature-switch-setting preview-source-setting">
                      <label id="preview-source-label" for="preview-source">预览图来源</label>
                      <span class="setting-hint"><button type="button" aria-label="预览图来源说明" aria-describedby="preview-source-hint" @click="$event.currentTarget.focus()" @keydown.esc.stop.prevent="$event.currentTarget.blur()"><UiIcon name="info-circle" :size="15" /></button><span id="preview-source-hint" class="setting-hint-tooltip" role="tooltip">使用缩略图加载较快，使用低保真图清晰度较高</span></span>
                    </div>
                    <SettingsSelect v-if="settingsCategory === 'gallery'" id="preview-source" v-model="preferences.useLowFidelityPreview" :options="previewSourceOptions" />
                  </div>
                  <p class="settings-detail-note">缩略图直接放大页面上已加载的图片；低保真图需从单图页面加载。</p>
                </div>
                <div class="settings-preference-group">
                  <h4>阅读与预载入</h4>
                  <div class="immersive-cache-settings">
                    <div class="feature-switch-setting">
                      <label><input v-model="preferences.immersiveSaveProgress" type="checkbox"/> 保存浏览进度</label>
                      <span class="setting-hint"><button type="button" aria-label="保存浏览进度说明" aria-describedby="immersive-progress-hint" @click="$event.currentTarget.focus()" @keydown.esc.stop.prevent="$event.currentTarget.blur()"><UiIcon name="info-circle" :size="15" /></button><span id="immersive-progress-hint" class="setting-hint-tooltip" role="tooltip">将画廊阅读位置保存在本浏览器，下次打开阅读窗时继续阅读。</span></span>
                    </div>
                    <div class="feature-switch-setting">
                      <label><input v-model="preferences.immersiveImageSnap" type="checkbox"/> 图片吸附</label>
                      <span class="setting-hint"><button type="button" aria-label="图片吸附说明" aria-describedby="immersive-snap-hint" @click="$event.currentTarget.focus()" @keydown.esc.stop.prevent="$event.currentTarget.blur()"><UiIcon name="info-circle" :size="15" /></button><span id="immersive-snap-hint" class="setting-hint-tooltip" role="tooltip">双页阅读时让两张图片贴合，消除中间的间隙。</span></span>
                    </div>
                    <div class="feature-switch-setting">
                      <label><input v-model="preferences.immersivePreload" type="checkbox"/> 启用预载入</label>
                      <span class="setting-hint"><button type="button" aria-label="启用预载入说明" aria-describedby="immersive-preload-hint" @click="$event.currentTarget.focus()" @keydown.esc.stop.prevent="$event.currentTarget.blur()"><UiIcon name="info-circle" :size="15" /></button><span id="immersive-preload-hint" class="setting-hint-tooltip" role="tooltip">提前加载阅读位置前后的预览图，减少翻页等待；会增加网络和内存占用。</span></span>
                    </div>
                    <div class="feature-switch-setting">
                      <label for="immersive-preload-count">向后预载入</label>
                      <span class="setting-hint"><button type="button" aria-label="向后预载入说明" aria-describedby="immersive-preload-after-hint" @click="$event.currentTarget.focus()" @keydown.esc.stop.prevent="$event.currentTarget.blur()"><UiIcon name="info-circle" :size="15" /></button><span id="immersive-preload-after-hint" class="setting-hint-tooltip" role="tooltip">设置提前加载后续图片的张数，启用预载入后生效。</span></span>
                    </div>
                    <select id="immersive-preload-count" v-model.number="preferences.immersivePreloadCount" :disabled="!preferences.immersivePreload"><option v-for="count in [10, 20, 40, 60]" :key="count" :value="count">{{ count }} 张</option></select>
                    <div class="feature-switch-setting">
                      <label for="immersive-preload-before-count">向前预载入</label>
                      <span class="setting-hint"><button type="button" aria-label="向前预载入说明" aria-describedby="immersive-preload-before-hint" @click="$event.currentTarget.focus()" @keydown.esc.stop.prevent="$event.currentTarget.blur()"><UiIcon name="info-circle" :size="15" /></button><span id="immersive-preload-before-hint" class="setting-hint-tooltip" role="tooltip">设置提前加载前面图片的张数，方便回看；选择“关闭”则不向前预载入。</span></span>
                    </div>
                    <select id="immersive-preload-before-count" v-model.number="preferences.immersivePreloadBeforeCount" :disabled="!preferences.immersivePreload"><option v-for="count in [0, 5, 10, 20]" :key="count" :value="count">{{ count ? `${count} 张` : '关闭' }}</option></select>
                  </div>
                  <div class="immersive-cache-status">
                    <span>当前页面缓存 {{ immersiveCacheStats.ready }} 张<span v-if="immersiveCacheStats.loading"> · 加载中 {{ immersiveCacheStats.loading }} 张</span></span>
                    <div class="feature-switch-setting">
                      <button class="settings-action-button" type="button" :disabled="!immersiveCacheStats.ready && !immersiveCacheStats.loading" @click="clearImmersiveCache()">清理缓存</button>
                      <span class="setting-hint"><button type="button" aria-label="清理缓存说明" aria-describedby="immersive-cache-hint" @click="$event.currentTarget.focus()" @keydown.esc.stop.prevent="$event.currentTarget.blur()"><UiIcon name="info-circle" :size="15" /></button><span id="immersive-cache-hint" class="setting-hint-tooltip" role="tooltip">释放已预载入的图片缓存并停止正在进行的图片预载入，保留已保存的阅读进度。</span></span>
                    </div>
                  </div>
                  <p class="settings-detail-note">只缓存图片详情页预览图；关闭阅读窗时自动清空。</p>
                </div>
              </section>
              <section v-show="settingsCategory === 'maintenance'" class="settings-category" aria-label="数据维护设置">
                <div class="settings-preference-group"><h4>配置迁移</h4>
                  <p class="settings-detail-note">在多台电脑间恢复使用体验，包含配置中心偏好、已保存的快捷导航、搜索显示及画廊分页等设置。不包含 Cookie、缓存和浏览记录；导入将覆盖当前配置。</p>
                  <div class="configuration-actions"><button class="settings-action-button" type="button" :disabled="configurationBusy || resettingSettings" @click="exportConfiguration">导出配置</button><button class="settings-action-button" type="button" :disabled="configurationBusy || resettingSettings" @click="configurationInput.click()">{{ configurationBusy ? '处理中…' : '导入配置' }}</button></div>
                  <input ref="configurationInput" class="sr-only" tabindex="-1" type="file" accept=".json,application/json" aria-label="选择配置文件" @change="importConfiguration" />
                  <p v-if="configurationError" class="form-error" role="alert">{{ configurationError }}</p><p v-else-if="configurationMessage" class="settings-message" role="status">{{ configurationMessage }}</p>
                </div>
                <div class="settings-preference-group settings-tag-maintenance">          <h4>标签数据库</h4>
          <p>本机缓存标签译名与介绍；自动更新在页面打开期间按设置的间隔检查。</p>
          <div class="tag-update-controls"><label><input v-model="preferences.autoUpdate" type="checkbox" /> 自动更新</label><label for="tag-update-interval">检查间隔</label><select id="tag-update-interval" v-model.number="preferences.updateHours" :disabled="!preferences.autoUpdate"><option :value="6">6 小时</option><option :value="24">24 小时</option><option :value="168">7 天</option></select></div>
          <div class="tag-update-status">
            <div><span>当前版本：{{
                tagUpdate.sha ? tagUpdate.sha.slice(0, 8) : '尚未加载'
              }}</span><span>上次检查：{{ tagUpdate.checkedAt ? new Date(tagUpdate.checkedAt).toLocaleString('zh-CN') : '尚未检查' }}</span></div>
            <button class="settings-action-button" :disabled="tagUpdate.busy" type="button" @click="updateTagData(true)">{{ tagUpdate.busy ? '检查中…' : '检查更新' }}</button>
          </div>
          <p v-if="tagUpdate.error" class="form-error" role="alert">{{ tagUpdate.error }}{{ tagUpdate.sha ? '；已缓存的标签仍可使用。' : '；请稍后重试。' }}</p><p v-else-if="tagUpdate.message" class="tag-update-message" role="status">{{ tagUpdate.message }}</p>
</div>
                <div class="settings-preference-group settings-danger-zone"><h4>恢复默认配置</h4>        <div class="settings-reset"><button class="settings-action-button" type="button" :disabled="resettingSettings || clearingCookie || savingCookie || configurationBusy" @click="requestSettingsReset">{{ resettingSettings ? '恢复中…' : '恢复默认配置' }}</button><span>同时清除浏览器 Cookie、快捷链接及已保存的画廊进度。</span></div><p v-if="resetMessage" class="settings-message" role="status">{{ resetMessage }}</p></div>
              </section>
            </div>
          </div>
          <form v-if="settingsView === 'quick-links'" id="quick-link-manager" class="quick-link-manager" @submit.prevent="saveQuickLinks">
            <div class="quick-link-toolbar">
              <div><button class="settings-action-button" type="button" @click="addQuickLink">添加链接</button><button class="settings-action-button" type="button" @click="quickLinkImportInput.click()">导入 JSON</button><button class="settings-action-button" type="button" @click="exportQuickLinks">导出 JSON</button></div>
            </div>
            <p class="quick-link-manager-note">填写路径和查询参数，完整链接会自动去掉域名。访问时跟随 EX 模式切换站点。</p>
            <div class="quick-link-scroll">
              <TransitionGroup name="quick-link" tag="div" class="quick-link-items">
                <div v-for="(item, index) in quickLinkDrafts" :key="item.dragId" class="quick-link-editor" :class="{ 'is-dragging': draggingQuickLink === item }" :data-index="index">
                  <div class="quick-link-row">
                    <button class="quick-link-drag" type="button" :aria-label="`调整第 ${index + 1} 项位置，上下方向键排序`" title="按住拖动调整顺序" @pointerdown.prevent="startQuickLinkDrag($event, index)" @keydown.up.prevent="moveQuickLink(index, index - 1)" @keydown.down.prevent="moveQuickLink(index, index + 1)"><UiIcon name="list" :size="16" /></button>
                    <input v-model="item.label" class="quick-link-name" type="text" :aria-label="`第 ${index + 1} 项名称`" :title="item.label" placeholder="名称" />
                    <div class="quick-link-url"><span class="quick-link-base">{{ sourceOrigin(preferences.useEx) }}</span><input v-model="item.url" class="quick-link-address" type="text" :aria-label="`第 ${index + 1} 项地址`" :title="item.url" placeholder="/?f_search=AHY" /></div>
                    <button class="quick-link-delete" type="button" :aria-label="`删除第 ${index + 1} 项`" @click="quickLinkDrafts.splice(index, 1)"><UiIcon name="x" :size="16" /></button>
                  </div>

                </div>
              </TransitionGroup>
              <p v-if="!quickLinkDrafts.length" class="quick-link-empty">暂无快捷导航，添加链接或导入 JSON 开始配置。</p>
            </div>
            <div class="quick-link-manager-footer">
              <p v-if="quickLinkError" class="form-error" role="alert">{{ quickLinkError }}</p><p v-else-if="quickLinkMessage" class="settings-message" role="status">{{ quickLinkMessage }}</p>
              <div><span>{{ quickLinkDrafts.length }} 项 · 修改后需保存生效</span><button class="settings-action-button" type="submit">保存快捷链接</button></div>
            </div>
            <input ref="quickLinkImportInput" class="sr-only" type="file" accept=".json,application/json" aria-label="选择快捷链接 JSON 文件" @change="importQuickLinks" />
          </form>
          <div v-if="settingsView === 'quick-links'" class="quick-links-return"><button class="settings-action-button" type="button" @click="returnToSettings">返回配置中心</button></div>
          <div v-show="settingsView === 'settings'" class="settings-save-note"><UiIcon name="check" :size="15" /><span>偏好设置自动保存，Cookie 与快捷导航需单独保存。</span></div>

      </div>
    </dialog>
    <dialog ref="resetConfirmation" class="reset-confirmation-dialog" aria-labelledby="reset-confirmation-title" aria-describedby="reset-confirmation-description" @cancel="event => { if (resettingSettings) event.preventDefault(); }" @close="closeResetConfirmation">
      <h2 id="reset-confirmation-title">恢复默认配置？</h2>
      <p id="reset-confirmation-description">将恢复所有偏好设置，并清除浏览器 Cookie、快捷导航及已保存的画廊阅读进度。</p>
      <p v-if="configError" class="form-error" role="alert">{{ configError }}</p>
      <div class="reset-confirmation-actions">
        <button class="settings-action-button" type="button" autofocus :disabled="resettingSettings" @click="resetConfirmation.close()">取消</button>
        <button class="settings-action-button reset-confirmation-confirm" type="button" :disabled="resetCountdown > 0 || resettingSettings || clearingCookie || savingCookie" @click="confirmSettingsReset">{{ resettingSettings ? '恢复中…' : resetCountdown > 0 ? `确定（${resetCountdown} 秒）` : '确定' }}</button>
      </div>
    </dialog>
  </div>
</template>

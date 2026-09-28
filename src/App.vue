<script setup>
import {computed, nextTick, onMounted, onUnmounted, reactive, ref, watch} from 'vue';
import {buildSearchUrl} from './lib/search.js';
import {parseGallery} from './lib/parseGallery.js';
import {localGalleryUrl} from './lib/parseDetails.js';
import {readTagCache, refreshTagTranslations} from './lib/tagTranslations.js';
import UiIcon from './components/UiIcon.vue';
import TorrentDialog from './components/TorrentDialog.vue';
import {clearImmersiveCache, getImmersiveCacheStats, subscribeImmersiveCache} from './lib/immersiveCache.js';
import {clearImmersiveProgress} from './lib/immersiveProgress.js';
import {loadingStyleOptions, normalizeLoadingStyle} from './lib/loadingStyle.js';
import LoadingIndicator from './components/LoadingIndicator.vue';
import {sourceHosts, sourceOrigin, sourceUrl} from './lib/sourceSite.js';

const searchText = ref('');
const defaultQuickLinks = [
  { label: 'AHY', url: 'https://e-hentai.org/?f_search=AHY' },
  { label: 'Yeeting', url: 'https://e-hentai.org/?f_search=yeeting' },
  { label: '神奇牛子', url: 'https://e-hentai.org/?f_search=神奇牛子' },
  { label: '转生在巨乳太太隔壁的牛头人', url: 'https://e-hentai.org/?f_search=转生在巨乳太太隔壁的牛头人' },
  { label: '上传者 bb2333', url: 'https://e-hentai.org/uploader/bb2333' },
  { label: '自定义', url: 'https://e-hentai.org/?f_search=f:%22big+ass%24%22%3Bf:stockings%24%3Bf:%22big+breasts%24%22%3Bf:blowjob%24%3Bo:%22ai+generated%24%E2%80%9D&f_srdd=4&advsearch=1' },
];
const quickLinks = ref(defaultQuickLinks);
const quickLinkDrafts = ref([]);
const quickLinkError = ref('');
const quickLinkMessage = ref('');
const quickLinkImportInput = ref(null);
const activeQuickLink = ref('');
const quickLinksStorageKey = 'gallery-lens.quick-links';
const searchSessionKey = 'gallery-lens.search-session';
const filters = reactive({
  advanced: false,
  f_sh: false,
  f_sto: false,
  f_spf: '',
  f_spt: '',
  f_srdd: '',
  f_sfl: false,
  f_sfu: false,
  f_sft: false,
});
const view = ref('thumbnail');
const loading = ref(false);
const result = ref(null);
const tagTranslations = ref({});
const tagDetails = ref({});
const tagSearchIndex = ref([]);
let tagTextCache = new Map();
const tagPopover = ref(null);
const tagUpdate = reactive({ sha: '', checkedAt: 0, updatedAt: 0, busy: false, message: '', error: '' });
const preferencesKey = 'gallery-lens.preferences';
const defaultPreferences = { translateTags: true, tagDetails: true, tagSuggestions: true, relativeTime: true, autoUpdate: true, updateHours: 24, immersivePreload: true, immersivePreloadCount: 20, immersivePreloadBeforeCount: 10, immersiveSaveProgress: false, immersiveImageSnap: false, loadingStyle: 'spinner', useEx: false };
const preferences = reactive({...defaultPreferences});
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
const settingsDialog = ref(null);
const resultsHeading = ref(null);
const searchInput = ref(null);
const torrentDialog = ref(null);
let searchVersion = 0;
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

async function enrichPostedTimes(parsed, version) {
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
}

function plainText(html) {
  return new DOMParser().parseFromString(html || '', 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
}

function applyTagData(data) {
  tagTranslations.value = data.translations || {};
  tagDetails.value = data.details || {};
  tagTextCache = new Map();
  tagSearchIndex.value = Object.entries(tagTranslations.value).map(([key, value]) => {
    const name = plainText(value);
    return { key, name, keyLower: key.toLowerCase(), nameLower: name.toLowerCase() };
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

watch([searchText, filters, view, requestUrl, activeQuickLink, pageIndex, pageSize], saveSearchSession,
  { deep: true, flush: 'sync' });

async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    const data = await response.json();
    cookieConfigured.value = Boolean(data.configured);
  } catch {
    cookieConfigured.value = false;
  }
}

function openSettings() {
  configError.value = '';
  configMessage.value = '';
  cookieDraft.value = '';
  quickLinkError.value = '';
  quickLinkMessage.value = '';
  quickLinkDrafts.value = quickLinks.value.map(item => ({ ...item }));
  try {
    const saved = JSON.parse(localStorage.getItem(preferencesKey));
    if (typeof saved?.immersivePreload === 'boolean') preferences.immersivePreload = saved.immersivePreload;
    if ([10, 20, 40, 60].includes(Number(saved?.immersivePreloadCount))) preferences.immersivePreloadCount = Number(saved.immersivePreloadCount);
    if ([0, 5, 10, 20].includes(Number(saved?.immersivePreloadBeforeCount))) preferences.immersivePreloadBeforeCount = Number(saved.immersivePreloadBeforeCount);
  } catch { /* Keep the current settings if storage is unavailable. */ }
  settingsDialog.value.showModal();
}

function normalizeQuickLink(item) {
  const label = typeof item?.label === 'string' ? item.label.trim() : '';
  const address = typeof item?.url === 'string' ? item.url.trim() : '';
  if (!label || !address) throw new Error('每个快捷链接都需要名称和完整地址');
  let url;
  try { url = new URL(address); } catch { throw new Error(`“${label}”的地址无效`); }
  if (url.protocol !== 'https:' || !sourceHosts.includes(url.hostname) || url.username || url.password || url.hash || (url.port && url.port !== '443')) {
    throw new Error(`“${label}”只能使用 E-Hentai 或 ExHentai 的 HTTPS 地址`);
  }
  return { label, url: url.href };
}

function saveQuickLinks() {
  quickLinkError.value = '';
  quickLinkMessage.value = '';
  try {
    const links = quickLinkDrafts.value.map(normalizeQuickLink);
    localStorage.setItem(quickLinksStorageKey, JSON.stringify(links));
    quickLinks.value = links;
    settingsDialog.value.close();
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
    const links = imported.map(normalizeQuickLink);
    const known = new Set(quickLinkDrafts.value.map(item => item.url));
    let added = 0;
    for (const link of links) {
      if (known.has(link.url)) continue;
      quickLinkDrafts.value.push(link);
      known.add(link.url);
      added++;
    }
    quickLinkMessage.value = `已导入 ${added} 条链接，请点击“保存快捷链接”生效。`;
  } catch (failure) {
    quickLinkError.value = failure instanceof SyntaxError ? 'JSON 文件格式无效' : failure.message || '导入失败';
  }
}

function exportQuickLinks() {
  quickLinkError.value = '';
  try {
    const links = quickLinkDrafts.value.map(normalizeQuickLink);
    const url = URL.createObjectURL(new Blob([JSON.stringify(links, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'gallery-lens-quick-links.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (failure) {
    quickLinkError.value = failure.message || '导出失败';
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

async function resetSettings() {
  resettingSettings.value = true;
  if (!(await clearCookie())) {
    resettingSettings.value = false;
    return;
  }
  preferencesReady = false;
  Object.assign(preferences, defaultPreferences);
  quickLinks.value = defaultQuickLinks;
  quickLinkDrafts.value = defaultQuickLinks.map(item => ({...item}));
  quickLinkError.value = '';
  quickLinkMessage.value = '';
  clearImmersiveProgress();
  clearImmersiveCache();
  await nextTick();
  try {
    for (const key of [preferencesKey, quickLinksStorageKey, 'gallery-lens.gallery-page-size', 'gallery-lens.gallery-columns', 'gallery-lens.comments-collapsed']) localStorage.removeItem(key);
  } catch { /* The current page still uses the default settings. */ }
  preferencesReady = true;
  configMessage.value = '已恢复默认配置，并清除浏览器 Cookie 和已保存的浏览进度。';
  resettingSettings.value = false;
}

async function runSearch(url, targetIndex = null) {
  const version = ++searchVersion;
  const target = sourceUrl(url, preferences.useEx);
  error.value = '';
  result.value = null;
  rawResponse.value = '';
  requestUrl.value = target;
  if (!target) {
    error.value = '请求地址无效';
    return;
  }
  if (!cookieConfigured.value) {
    error.value = '请先在配置菜单中保存 Cookie。';
    return;
  }
  loading.value = true;
  try {
    const response = await fetch('/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: target, userAgent: navigator.userAgent, extended: true }),
    });
    const data = await response.json();
    if (version !== searchVersion) return;
    if (!response.ok) throw new Error(data.error || '本地请求失败');
    rawResponse.value = typeof data.body === 'string' ? data.body : '';
    if (data.status !== 200) throw new Error(`目标站点返回 HTTP ${data.status} ${data.reason || ''}。可在下方查看原始 HTML。`);
    const parsed = parseGallery(data.body, target);
    if (!parsed.hasTable) throw new Error('响应中没有 Extended 结果表格，可在下方查看原始 HTML。');
    result.value = parsed;
    if (!parsed.pages.prev || !pageSize.value) pageSize.value = parsed.items.length;
    pageIndex.value = !parsed.pages.prev ? 0 : !parsed.pages.next && parsed.total && pageSize.value
      ? Math.ceil(parsed.total / pageSize.value) - 1 : targetIndex;
    rawResponse.value = '';
    void enrichPostedTimes(parsed, version);
  } catch (failure) {
    if (version === searchVersion) error.value = failure.message || '请求失败';
  } finally {
    if (version === searchVersion) loading.value = false;
  }
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
  activeQuickLink.value = item.label;
  pageSize.value = 0;
  const url = new URL(item.url);
  runSearch(item.url, url.searchParams.has('next') || url.searchParams.has('prev') ? null : 0);
  resultsHeading.value?.scrollIntoView({ block: 'start', behavior: 'smooth' });
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
    const saved = JSON.parse(sessionStorage.getItem(searchSessionKey));
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
  try {
    const saved = JSON.parse(localStorage.getItem(quickLinksStorageKey));
    if (Array.isArray(saved)) quickLinks.value = saved.map(normalizeQuickLink);
  } catch { /* Keep the built-in links if local configuration is invalid. */ }
  try {
    const saved = JSON.parse(localStorage.getItem(preferencesKey));
    if (saved && typeof saved === 'object') {
      for (const key of ['translateTags', 'tagDetails', 'tagSuggestions', 'relativeTime', 'autoUpdate', 'immersivePreload', 'immersiveSaveProgress', 'immersiveImageSnap', 'useEx']) {
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
  await loadConfig();
  void runSearch(requestUrl.value || `${sourceOrigin(preferences.useEx)}/`, pageIndex.value);
  if (currentUrl.searchParams.get('settings') === '1') {
    openSettings();
    currentUrl.searchParams.delete('settings');
    window.history.replaceState(null, '', currentUrl.pathname + currentUrl.search + currentUrl.hash);
  }
  const cached = await readTagCache();
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
  unsubscribeImmersiveCache?.();
  window.clearInterval(maintenanceTimer);
  document.removeEventListener('pointerdown', closeTagPopoverOnOutsideClick);
  window.removeEventListener('resize', closeTagPopover);
  window.removeEventListener('pagehide', saveSearchSession);
});
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <a class="brand" href="/" aria-label="Gallery Lens，返回主页">
        <span class="brand-mark">E<span>·</span></span>
        <div><strong>Gallery Lens</strong><small>在线图库检索</small></div>
      </a>
      <nav class="header-actions" aria-label="页面导航">
        <a href="/" aria-current="page"><UiIcon name="home" :size="15" /> 主页</a>
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
            <button v-for="(item, index) in quickLinks" :key="`${item.url}-${index}`" type="button" :disabled="loading" :title="item.url" :aria-pressed="activeQuickLink === item.label" @click="openQuickLink(item)">{{ item.label }}<UiIcon name="arrow-right" :size="12" /></button>
          </div>
          <button class="quick-search-edit" type="button" @click="openSettings">编辑</button>
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

      <section class="results-section" aria-labelledby="results-title">
        <div ref="resultsHeading" class="results-heading">
          <div><h2 id="results-title">搜索结果 <span v-if="result?.total !== null && result" class="total-pill">{{ result.approximate ? '约 ' : '' }}{{ result.total.toLocaleString() }} 条</span></h2><small v-if="result" class="page-count">本页 {{ result.items.length }} 个条目<span v-if="activeQuickLink"> · {{ activeQuickLink }}</span></small></div>
          <nav v-if="result" class="pagination" aria-label="上方分页"><button v-for="page in paginationOptions.slice(0, 2)" :key="page.key" type="button" :disabled="!result.pages[page.key]" :aria-label="page.label" :title="page.label" @click="navigate(page.key)"><UiIcon :name="page.icon" :size="15" /></button><span class="pagination-current" aria-live="polite">{{ pageIndex === null ? '–' : pageIndex + 1 }}<template v-if="result.total && pageSize"> / {{ Math.ceil(result.total / pageSize) }}</template></span><button v-for="page in paginationOptions.slice(2)" :key="page.key" type="button" :disabled="!result.pages[page.key]" :aria-label="page.label" :title="page.label" @click="navigate(page.key)"><UiIcon :name="page.icon" :size="15" /></button></nav>
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

        <div v-if="error" class="message error-message" role="alert"><span class="message-icon error-icon"><UiIcon name="alert" :size="25" /></span><strong>暂时无法展示结果</strong><p>{{ error }}</p><details v-if="rawResponse" class="response-source"><summary>查看原始 HTML 响应</summary><textarea readonly :value="rawResponse" aria-label="原始 HTML 响应"></textarea></details><div class="message-actions"><button v-if="!cookieConfigured" type="button" @click="openSettings"><UiIcon name="settings" :size="16" /> 打开配置</button><a href="/debug"><UiIcon name="external" :size="15" /> 前往调试页</a></div></div>
        <div v-else-if="loading" class="message loading-message" role="status"><LoadingIndicator :variant="preferences.loadingStyle"/><strong>正在获取并解析图库…</strong><p class="request-address">{{ requestUrl }}</p></div>
        <div v-else-if="!result" class="message empty-state"><span class="message-icon"><UiIcon name="search" :size="29" /></span><strong>从一次搜索开始</strong><p>输入关键词，按需调整高级筛选，结果会显示在这里。</p></div>
        <template v-else>
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
                  <span v-else class="no-torrent">无种子</span></div>
                <div class="minimal-content"><h3 class="item-title"><a :href="item.url ? localGalleryUrl(item.url) : undefined" :title="item.title">{{ item.title }}</a></h3>
                  <div v-if="item.tagGroups.length" class="minimal-tags"><span v-for="group in item.tagGroups" :key="group.label"><b>{{ group.label }}：</b><template
                      v-for="(tag, tagIndex) in group.values" :key="tag.key || tag.original"><button v-if="preferences.tagDetails && tag.key" type="button" class="tag-detail-trigger" :title="tag.key"
                                                                                                     @click="openTagDetails(tag, $event)">{{ tagText(tag) }}</button><span v-else
                                                                                                                                                                           :title="tag.key || tag.original">{{
                      tagText(tag)
                    }}</span><template v-if="tagIndex < group.values.length - 1"> · </template></template></span></div>
                  <div class="minimal-preview" aria-hidden="true"><img v-if="item.image" :src="item.image" alt="" loading="lazy" decoding="async"/><span v-else>无封面</span></div>
                </div>
                <div class="minimal-pages">{{ item.pages || '页数未知' }}</div>
              </template>
              <template v-else>
                <a class="item-image" :href="item.url ? localGalleryUrl(item.url) : undefined">
                <img v-if="item.image" :src="item.image" :alt="item.title" loading="lazy" decoding="async" />
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
                  <span v-else class="no-torrent"><UiIcon :size="14" name="download"/>无种子</span></div>
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

    <dialog ref="settingsDialog" class="settings-dialog" @click="event => { if (event.target === settingsDialog) settingsDialog.close(); }">
      <div class="dialog-content"><div class="dialog-heading"><h2>配置中心</h2><button type="button" class="close-button" aria-label="关闭配置" @click="settingsDialog.close()"><UiIcon name="x" :size="20" /></button></div>
        <section class="feature-settings" aria-labelledby="feature-settings-title"><h3 id="feature-settings-title">浏览体验</h3>
          <div class="feature-switches">
            <label><input v-model="preferences.translateTags" type="checkbox" /> 标签汉化</label>
            <label><input v-model="preferences.tagDetails" type="checkbox" /> 标签详情</label>
            <label><input v-model="preferences.tagSuggestions" type="checkbox" /> 搜索联想</label>
            <label><input v-model="preferences.relativeTime" type="checkbox" /> 相对时间</label>
          </div>
          <div class="loading-style-setting"><label for="loading-style">加载动画</label><select id="loading-style" v-model="preferences.loadingStyle"><option v-for="option in loadingStyleOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></div>
          <label class="source-site-setting"><input v-model="preferences.useEx" type="checkbox"/> 启用 EX（ExHentai）</label>
          <h3>沉浸式浏览</h3>
          <div class="immersive-cache-settings"><label><input v-model="preferences.immersiveSaveProgress" type="checkbox"/> 保存浏览进度</label><label><input v-model="preferences.immersiveImageSnap" type="checkbox"/> 图片吸附</label><label><input v-model="preferences.immersivePreload" type="checkbox"/> 启用预载入</label><label for="immersive-preload-count">向后预载入</label><select id="immersive-preload-count" v-model.number="preferences.immersivePreloadCount" :disabled="!preferences.immersivePreload"><option v-for="count in [10, 20, 40, 60]" :key="count" :value="count">{{ count }} 张</option></select><label for="immersive-preload-before-count">向前预载入</label><select id="immersive-preload-before-count" v-model.number="preferences.immersivePreloadBeforeCount" :disabled="!preferences.immersivePreload"><option v-for="count in [0, 5, 10, 20]" :key="count" :value="count">{{ count ? `${count} 张` : '关闭' }}</option></select></div>
          <div class="immersive-cache-status"><span>当前页面缓存 {{ immersiveCacheStats.ready }} 张<span v-if="immersiveCacheStats.loading"> · 加载中 {{ immersiveCacheStats.loading }} 张</span></span><button class="settings-action-button" type="button" :disabled="!immersiveCacheStats.ready && !immersiveCacheStats.loading" @click="clearImmersiveCache()">清理缓存</button></div>
          <p class="immersive-cache-note">只缓存图片详情页预览图；关闭阅读窗时自动清空。</p>
          <h3>标签数据库</h3>
          <p>本机缓存标签译名与介绍；自动更新在页面打开期间按设置的间隔检查。</p>
          <div class="tag-update-controls"><label><input v-model="preferences.autoUpdate" type="checkbox" /> 自动更新</label><label for="tag-update-interval">检查间隔</label><select id="tag-update-interval" v-model.number="preferences.updateHours" :disabled="!preferences.autoUpdate"><option :value="6">6 小时</option><option :value="24">24 小时</option><option :value="168">7 天</option></select></div>
          <div class="tag-update-status">
            <div><span>当前版本：{{
                tagUpdate.sha ? tagUpdate.sha.slice(0, 8) : '尚未加载'
              }}</span><span>上次检查：{{ tagUpdate.checkedAt ? new Date(tagUpdate.checkedAt).toLocaleString('zh-CN') : '尚未检查' }}</span></div>
            <button class="settings-action-button" :disabled="tagUpdate.busy" type="button" @click="updateTagData(true)">{{ tagUpdate.busy ? '检查中…' : '检查更新' }}</button>
          </div>
          <p v-if="tagUpdate.error" class="form-error" role="alert">{{ tagUpdate.error }}{{ tagUpdate.sha ? '；已缓存的标签仍可使用。' : '；请稍后重试。' }}</p><p v-else-if="tagUpdate.message" class="tag-update-message" role="status">{{ tagUpdate.message }}</p>
        </section>
        <section class="quick-link-settings" aria-labelledby="quick-link-settings-title"><h3 id="quick-link-settings-title">快捷链接</h3><p>保存完整地址，点击快捷项时由本地服务请求并解析。</p>
          <form @submit.prevent="saveQuickLinks"><div v-for="(item, index) in quickLinkDrafts" :key="index" class="quick-link-editor"><input v-model="item.label" type="text" :aria-label="`第 ${index + 1} 项名称`" placeholder="名称" /><input v-model="item.url" type="url" :aria-label="`第 ${index + 1} 项地址`" placeholder="https://e-hentai.org/..." /><button type="button" :aria-label="`删除第 ${index + 1} 项`" @click="quickLinkDrafts.splice(index, 1)"><UiIcon name="x" :size="16" /></button></div><p v-if="quickLinkError" class="form-error" role="alert">{{ quickLinkError }}</p><p v-else-if="quickLinkMessage" class="settings-message" role="status">{{ quickLinkMessage }}</p><input ref="quickLinkImportInput" class="sr-only" type="file" accept=".json,application/json" aria-label="选择快捷链接 JSON 文件" @change="importQuickLinks" /><div class="quick-link-actions"><div><button class="settings-action-button" type="button" @click="quickLinkDrafts.push({ label: '', url: '' })">添加链接</button><button class="settings-action-button" type="button" @click="quickLinkImportInput.click()">导入 JSON</button><button class="settings-action-button" type="button" @click="exportQuickLinks">导出 JSON</button></div><button class="settings-action-button" type="submit">保存快捷链接</button></div></form>
        </section>
        <section class="cookie-settings" aria-labelledby="cookie-settings-title"><h3 id="cookie-settings-title">Cookie</h3>
        <p>Cookie 保存在当前浏览器中，仅供此浏览器的请求使用。未配置时，本地服务可从 <code>.env.local</code> 读取备用值。页面不会显示已保存的值。</p>
        <form @submit.prevent="saveCookie"><label for="cookie-value">Cookie 请求头的值</label><textarea id="cookie-value" v-model="cookieDraft" spellcheck="false" autocomplete="off" placeholder="cf_clearance=...; ipb_member_id=...; ipb_pass_hash=..."></textarea><p class="form-hint"><UiIcon name="lock" :size="14" /> 保存后不会在输入框中回显；再次填写会覆盖旧值。</p><p v-if="configError" class="form-error" role="alert">{{ configError }}</p><p v-else-if="configMessage" class="settings-message" role="status">{{ configMessage }}</p><div class="dialog-actions"><span><span class="status-light" :class="{ active: cookieConfigured }"></span>{{ cookieConfigured ? '已配置' : '尚未配置' }}</span><div><button class="settings-action-button" type="button" :disabled="clearingCookie || savingCookie || !cookieConfigured" @click="clearCookie">{{ clearingCookie ? '清理中…' : '清理 Cookie' }}</button><button class="settings-action-button" type="submit" :disabled="savingCookie || clearingCookie">{{ savingCookie ? '保存中…' : '保存 Cookie' }}</button></div></div></form>
        <div class="settings-reset"><button class="settings-action-button" type="button" :disabled="resettingSettings || clearingCookie || savingCookie" @click="resetSettings">{{ resettingSettings ? '恢复中…' : '恢复默认配置' }}</button><span>同时清除浏览器 Cookie、快捷链接及已保存的画廊进度。</span></div>
        </section>
      </div>
    </dialog>
  </div>
</template>

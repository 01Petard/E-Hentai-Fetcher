import {sourceHosts, sourceOrigin} from './sourceSite.js';

export const preferencesKey = 'gallery-lens.preferences';
export const searchDisplayKey = 'gallery-lens.search-display';
export const defaultPreferences = { translateTags: true, tagDetails: true, tagSuggestions: true, relativeTime: true, autoUpdate: true, updateHours: 24, immersivePreload: true, immersivePreloadCount: 20, immersivePreloadBeforeCount: 10, immersiveSaveProgress: false, immersiveImageSnap: false, loadingStyle: 'spinner', theme: 'system', useEx: false, privacyMode: false, useLowFidelityPreview: false };
export const defaultSearchDisplay = {view: 'thumbnail', filters: {advanced: false, f_sh: false, f_sto: false, f_spf: '', f_spt: '', f_srdd: '', f_sfl: false, f_sfu: false, f_sft: false}};
const galleryKeys = {pageSize: 'gallery-lens.gallery-page-size', columns: 'gallery-lens.gallery-columns', commentsCollapsed: 'gallery-lens.comments-collapsed'};

// Initialize only missing configuration; never copy session state, credentials or caches.
export function initializeConfiguration(storage) {
  const saved = JSON.parse(storage.getItem(preferencesKey) || '{}');
  storage.setItem(preferencesKey, JSON.stringify({...defaultPreferences, ...saved}));
  const defaults = {'gallery-lens.quick-links': '[]', [searchDisplayKey]: JSON.stringify(defaultSearchDisplay), [galleryKeys.pageSize]: '20', [galleryKeys.columns]: '10', [galleryKeys.commentsCollapsed]: '0'};
  for (const [key, value] of Object.entries(defaults)) if (storage.getItem(key) === null) storage.setItem(key, value);
}

export function normalizeConfiguration(input) {
  const invalid = () => { throw new Error('配置文件格式或选项无效，请选择本系统导出的配置文件。'); };
  if (input?.format !== 'gallery-lens.configuration' || input.version !== 1) invalid();
  const preferences = {};
  const options = {updateHours: [6, 24, 168], immersivePreloadCount: [10, 20, 40, 60], immersivePreloadBeforeCount: [0, 5, 10, 20], loadingStyle: ['spinner', 'skeleton', 'progress', 'dots'], theme: ['system', 'light', 'dark']};
  for (const [key, fallback] of Object.entries(defaultPreferences)) {
    const value = key === 'theme' && input.preferences?.theme === undefined ? fallback : input.preferences?.[key];
    if (options[key] ? !options[key].includes(value) : typeof value !== typeof fallback) invalid();
    preferences[key] = value;
  }
  if (!Array.isArray(input.quickLinks) || input.quickLinks.length > 500) invalid();
  const quickLinks = input.quickLinks.map((item, index) => {
    if (typeof item?.label !== 'string' || !item.label.trim() || item.label.length > 200 || typeof item.url !== 'string') invalid();
    let url;
    try { url = /^(?:\/(?!\/)|\?)/.test(item.url) ? new URL(item.url, sourceOrigin()) : new URL(item.url); } catch { invalid(); }
    if (url.protocol !== 'https:' || !sourceHosts.includes(url.hostname) || url.username || url.password || url.hash || (url.port && url.port !== '443')) invalid();
    if (item.sortOrder !== undefined && (!Number.isSafeInteger(item.sortOrder) || item.sortOrder < 1)) invalid();
    return {label: item.label.trim(), url: url.pathname + url.search, sortOrder: item.sortOrder ?? index + 1};
  }).sort((a, b) => a.sortOrder - b.sortOrder).map((item, index) => ({...item, sortOrder: index + 1}));
  const gallery = input.gallery;
  if (!gallery || ![20, 40, 60, 80, 100].includes(gallery.pageSize) || !Number.isInteger(gallery.columns) || gallery.columns < 2 || gallery.columns > 10 || typeof gallery.commentsCollapsed !== 'boolean') invalid();
  const search = input.search;
  if (!['thumbnail', 'extended', 'minimal'].includes(search?.view)) invalid();
  const filters = {};
  for (const [key, fallback] of Object.entries(defaultSearchDisplay.filters)) {
    const value = search.filters?.[key];
    if (typeof value !== typeof fallback || (typeof value === 'string' && value.length > 100)) invalid();
    filters[key] = value;
  }
  return {format: 'gallery-lens.configuration', version: 1, preferences, quickLinks, gallery: {pageSize: gallery.pageSize, columns: gallery.columns, commentsCollapsed: gallery.commentsCollapsed}, search: {view: search.view, filters}};
}

export function readConfiguration(storage, quickLinks, search) {
  return normalizeConfiguration({format: 'gallery-lens.configuration', version: 1,
    preferences: {...defaultPreferences, ...JSON.parse(storage.getItem(preferencesKey) || '{}')}, quickLinks, search,
    gallery: {pageSize: Number(storage.getItem(galleryKeys.pageSize) ?? 20), columns: Number(storage.getItem(galleryKeys.columns) ?? 10), commentsCollapsed: storage.getItem(galleryKeys.commentsCollapsed) === '1'}});
}

export function writeConfiguration(storage, configuration) {
  const config = normalizeConfiguration(configuration);
  const entries = {[preferencesKey]: JSON.stringify(config.preferences), 'gallery-lens.quick-links': JSON.stringify(config.quickLinks), [searchDisplayKey]: JSON.stringify(config.search), [galleryKeys.pageSize]: String(config.gallery.pageSize), [galleryKeys.columns]: String(config.gallery.columns), [galleryKeys.commentsCollapsed]: config.gallery.commentsCollapsed ? '1' : '0'};
  const previous = Object.fromEntries(Object.keys(entries).map(key => [key, storage.getItem(key)]));
  try {
    for (const [key, value] of Object.entries(entries)) storage.setItem(key, value);
  } catch (failure) {
    for (const [key, value] of Object.entries(previous)) {
      try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); } catch { /* Preserve the original storage error. */ }
    }
    throw failure;
  }
  return config;
}

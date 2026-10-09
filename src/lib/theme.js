import {preferencesKey} from './configuration.js';
import {normalizePalette, paletteOptions} from './palettes.js';

export const themeOptions = [
  {value: 'system', label: '跟随系统'},
  {value: 'light', label: '浅色'},
  {value: 'dark', label: '深色'},
];

export function normalizeTheme(value) {
  return themeOptions.some(option => option.value === value) ? value : 'system';
}

export function readTheme(environment = globalThis) {
  try { return normalizeTheme(JSON.parse(environment.localStorage.getItem(preferencesKey))?.theme); }
  catch { return 'system'; }
}

export function readPalette(environment = globalThis) {
  try { return normalizePalette(JSON.parse(environment.localStorage.getItem(preferencesKey))?.palette); }
  catch { return 'emerald'; }
}

export function resolveTheme(preference, systemDark) {
  const value = normalizeTheme(preference);
  return value === 'system' ? (systemDark ? 'dark' : 'light') : value;
}

export function createThemeController(environment) {
  const media = environment.matchMedia?.('(prefers-color-scheme: dark)');
  const subscribers = new Set();
  let preference = readTheme(environment);
  let palette = readPalette(environment);

  function apply() {
    const theme = resolveTheme(preference, media?.matches);
    const root = environment.document.documentElement;
    root.dataset.theme = theme;
    root.dataset.palette = palette;
    root.style.colorScheme = theme;
    environment.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', paletteOptions.find(option => option.value === palette)[theme]);
  }

  function setPreference(value) {
    const next = normalizeTheme(value);
    if (next === preference) return;
    preference = next;
    apply();
    for (const notify of subscribers) notify(preference, palette);
  }

  function setPalette(value) {
    const next = normalizePalette(value);
    if (next === palette) return;
    palette = next;
    apply();
    for (const notify of subscribers) notify(preference, palette);
  }

  function onSystemChange() { if (preference === 'system') apply(); }
  function onStorage(event) {
    if (event.key !== preferencesKey && event.key !== null) return;
    try { if (event.storageArea && event.storageArea !== environment.localStorage) return; } catch { return; }
    setPreference(readTheme(environment));
    setPalette(readPalette(environment));
  }

  apply();
  media?.addEventListener('change', onSystemChange);
  environment.addEventListener('storage', onStorage);
  return {
    get preference() { return preference; },
    get palette() { return palette; },
    setPreference,
    setPalette,
    subscribe(notify) { subscribers.add(notify); return () => subscribers.delete(notify); },
    dispose() {
      media?.removeEventListener('change', onSystemChange);
      environment.removeEventListener('storage', onStorage);
      subscribers.clear();
    },
  };
}

let controller;
export function initializeTheme() {
  return controller ??= createThemeController(window);
}

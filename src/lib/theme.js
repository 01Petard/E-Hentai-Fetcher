import {preferencesKey} from './configuration.js';

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

export function resolveTheme(preference, systemDark) {
  const value = normalizeTheme(preference);
  return value === 'system' ? (systemDark ? 'dark' : 'light') : value;
}

export function createThemeController(environment) {
  const media = environment.matchMedia?.('(prefers-color-scheme: dark)');
  const subscribers = new Set();
  let preference = readTheme(environment);

  function apply() {
    const theme = resolveTheme(preference, media?.matches);
    const root = environment.document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    environment.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#151b18' : '#f5f5f1');
  }

  function setPreference(value) {
    const next = normalizeTheme(value);
    if (next === preference) return;
    preference = next;
    apply();
    for (const notify of subscribers) notify(preference);
  }

  function onSystemChange() { if (preference === 'system') apply(); }
  function onStorage(event) {
    if (event.key !== preferencesKey && event.key !== null) return;
    try { if (event.storageArea && event.storageArea !== environment.localStorage) return; } catch { return; }
    setPreference(readTheme(environment));
  }

  apply();
  media?.addEventListener('change', onSystemChange);
  environment.addEventListener('storage', onStorage);
  return {
    get preference() { return preference; },
    setPreference,
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

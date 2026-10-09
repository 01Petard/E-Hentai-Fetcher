import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createThemeController, normalizeTheme, readTheme, resolveTheme} from '../src/lib/theme.js';
import {preferencesKey} from '../src/lib/configuration.js';

function browser({theme, palette, dark = false, blocked = false} = {}) {
  const events = new EventTarget();
  const media = new EventTarget();
  media.matches = dark;
  const values = new Map(theme === undefined && palette === undefined ? [] : [[preferencesKey, JSON.stringify({theme, palette, useEx: true})]]);
  const meta = {content: '', setAttribute(name, value) { this[name] = value; }};
  const environment = {
    document: {documentElement: {dataset: {}, style: {}}, querySelector: () => meta},
    matchMedia: () => media,
    localStorage: {getItem: key => values.get(key) ?? null},
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  if (blocked) Object.defineProperty(environment, 'localStorage', {get() { throw new Error('storage blocked'); }});
  return {
    environment, values, meta,
    systemDark(value) { media.matches = value; media.dispatchEvent(new Event('change')); },
    storageChange(key = preferencesKey, storageArea) {
      const event = new Event('storage');
      Object.assign(event, {key, storageArea});
      events.dispatchEvent(event);
    },
    get theme() { return environment.document.documentElement.dataset.theme; },
    get palette() { return environment.document.documentElement.dataset.palette; },
  };
}

test('theme preferences default safely for old, malformed and inaccessible storage', () => {
  for (const value of [undefined, null, 'unknown', true, {}, 0]) assert.equal(normalizeTheme(value), 'system');
  assert.equal(readTheme(browser().environment), 'system');
  assert.equal(readTheme(browser({blocked: true}).environment), 'system');
  const state = browser({theme: 'dark'});
  assert.equal(readTheme(state.environment), 'dark');
  state.values.set(preferencesKey, '{');
  assert.equal(readTheme(state.environment), 'system');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('invalid', false), 'light');
});

test('palette selection persists through system appearance changes and synchronizes across tabs', () => {
  const state = browser({palette: 'blue'});
  const controller = createThemeController(state.environment);
  assert.equal(state.palette, 'blue');
  state.systemDark(true);
  assert.equal(state.theme, 'dark');
  assert.equal(state.palette, 'blue');
  controller.setPalette('purple');
  assert.equal(state.palette, 'purple');
  const changes = [];
  controller.subscribe((theme, palette) => changes.push([theme, palette]));
  const saved = JSON.stringify({theme: 'light', palette: 'gray', useEx: true, translateTags: false});
  state.values.set(preferencesKey, saved);
  state.storageChange(preferencesKey);
  assert.equal(state.theme, 'light');
  assert.equal(state.palette, 'gray');
  assert.equal(state.values.get(preferencesKey), saved);
  assert.deepEqual(changes.at(-1), ['light', 'gray']);
  state.values.delete(preferencesKey);
  state.storageChange(null);
  assert.equal(state.palette, 'emerald');
  assert.equal(state.theme, 'dark');
  controller.dispose();
});

test('invalid and inaccessible palette storage falls back while in-memory switching remains usable', () => {
  for (const palette of [undefined, 'invalid', null, true, {}]) {
    const state = browser({palette});
    const controller = createThemeController(state.environment);
    assert.equal(state.palette, 'emerald');
    controller.dispose();
  }
  const state = browser({blocked: true});
  const controller = createThemeController(state.environment);
  controller.setPalette('rainbow');
  assert.equal(state.palette, 'rainbow');
  controller.setPalette('invalid');
  assert.equal(state.palette, 'emerald');
  controller.dispose();
});

test('the pre-paint bootstrap agrees with the runtime for every palette and appearance', () => {
  const source = readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8');
  for (const palette of ['emerald', 'red', 'orange', 'amber', 'cyan', 'blue', 'purple', 'gray', 'rainbow', 'invalid']) {
    for (const theme of ['system', 'light', 'dark']) {
      for (const dark of [false, true]) {
        const state = browser({theme, palette, dark});
        runInNewContext(source, {...state.environment, window: state.environment});
        const initial = {theme: state.theme, palette: state.palette, color: state.meta.content};
        const controller = createThemeController(state.environment);
        assert.deepEqual({theme: state.theme, palette: state.palette, color: state.meta.content}, initial);
        assert.equal(state.palette, palette === 'invalid' ? 'emerald' : palette);
        controller.dispose();
      }
    }
  }
});

test('system theme updates live; manual choices take precedence until switched back', () => {
  const state = browser();
  const controller = createThemeController(state.environment);
  assert.equal(state.theme, 'light');
  state.systemDark(true);
  assert.equal(state.theme, 'dark');
  assert.equal(state.meta.content, '#111a18');
  assert.equal(state.environment.document.documentElement.style.colorScheme, 'dark');
  controller.setPreference('light');
  state.systemDark(false);
  state.systemDark(true);
  assert.equal(state.theme, 'light');
  controller.setPreference('dark');
  state.systemDark(false);
  assert.equal(state.theme, 'dark');
  controller.setPreference('system');
  assert.equal(state.theme, 'light');
  assert.equal(state.meta.content, '#f5f8f7');
  controller.dispose();
});

test('storage updates synchronize themes without writing or changing unrelated preferences', () => {
  const state = browser({theme: 'light', dark: true});
  const controller = createThemeController(state.environment);
  const changes = [];
  const stop = controller.subscribe(value => changes.push(value));
  const saved = JSON.stringify({theme: 'dark', useEx: true, translateTags: false});
  state.values.set(preferencesKey, saved);
  state.storageChange('unrelated');
  assert.equal(state.theme, 'light');
  state.storageChange(preferencesKey, {});
  assert.equal(state.theme, 'light');
  state.storageChange(preferencesKey, state.environment.localStorage);
  assert.equal(state.theme, 'dark');
  assert.equal(state.values.get(preferencesKey), saved);
  assert.deepEqual(changes, ['dark']);
  stop();
  state.values.delete(preferencesKey);
  state.storageChange(null);
  assert.equal(controller.preference, 'system');
  assert.equal(state.theme, 'dark');
  assert.deepEqual(changes, ['dark']);
  state.systemDark(false);
  assert.equal(state.theme, 'light');
  controller.dispose();
  state.systemDark(true);
  assert.equal(state.theme, 'light');
});

test('appearance still switches in memory when storage or system detection is unavailable', () => {
  const state = browser({blocked: true, dark: true});
  const controller = createThemeController(state.environment);
  assert.equal(state.theme, 'dark');
  controller.setPreference('light');
  assert.equal(state.theme, 'light');
  controller.dispose();
  delete state.environment.matchMedia;
  const fallback = createThemeController(state.environment);
  assert.equal(state.theme, 'light');
  fallback.dispose();
});

test('the synchronous bootstrap matches runtime resolution on every HTML entry', () => {
  const source = readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8');
  for (const theme of [undefined, 'system', 'light', 'dark', 'invalid']) {
    for (const dark of [false, true]) {
      const state = browser({theme, dark});
      runInNewContext(source, {...state.environment, window: state.environment});
      assert.equal(state.theme, resolveTheme(theme, dark));
      assert.equal(state.meta.content, state.theme === 'dark' ? '#111a18' : '#f5f8f7');
    }
  }
  const blocked = browser({blocked: true, dark: true});
  runInNewContext(source, {document: blocked.environment.document, window: blocked.environment});
  assert.equal(blocked.theme, 'dark');
  for (const entry of ['index.html', 'development-log.html', 'debug.html']) {
    const html = readFileSync(new URL(`../${entry}`, import.meta.url), 'utf8');
    assert.ok(html.indexOf('/theme-init.js') < html.indexOf('<body>'));
    assert.ok(html.includes('/src/styles/theme.css'));
  }
});

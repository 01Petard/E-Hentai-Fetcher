import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createThemeController, normalizeTheme, readTheme, resolveTheme} from '../src/lib/theme.js';
import {preferencesKey} from '../src/lib/configuration.js';

function browser({theme, dark = false, blocked = false} = {}) {
  const events = new EventTarget();
  const media = new EventTarget();
  media.matches = dark;
  const values = new Map(theme === undefined ? [] : [[preferencesKey, JSON.stringify({theme, useEx: true})]]);
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

test('system theme updates live; manual choices take precedence until switched back', () => {
  const state = browser();
  const controller = createThemeController(state.environment);
  assert.equal(state.theme, 'light');
  state.systemDark(true);
  assert.equal(state.theme, 'dark');
  assert.equal(state.meta.content, '#151b18');
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
  assert.equal(state.meta.content, '#f5f5f1');
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
      assert.equal(state.meta.content, state.theme === 'dark' ? '#151b18' : '#f5f5f1');
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

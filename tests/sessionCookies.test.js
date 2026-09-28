import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createSessionCookieJar, isExSessionRejected} from '../server/sessionCookies.js';

const cookie = 'ipb_member_id=42; ipb_pass_hash=abc';
const issued = value => ({'set-cookie': [`igneous=${value}; expires=Mon, 28-Sep-2026 09:07:54 GMT; Max-Age=900; path=/; domain=.exhentai.org`]});

test('session cookies are only added once the site has issued one', () => {
  const jar = createSessionCookieJar();
  assert.equal(jar.mergeCookie('exhentai.org', cookie), cookie);
  jar.rememberCookies('exhentai.org', cookie, issued('token1'));
  assert.equal(jar.mergeCookie('exhentai.org', cookie), `${cookie}; igneous=token1`);
});

test('a refreshed token replaces the stale one from the request', () => {
  const jar = createSessionCookieJar();
  jar.rememberCookies('exhentai.org', cookie, issued('token1'));
  assert.equal(jar.mergeCookie('exhentai.org', `${cookie}; igneous=stale`), `${cookie}; igneous=token1`);
});

test('rejected credentials are never stored', () => {
  const jar = createSessionCookieJar();
  jar.rememberCookies('exhentai.org', cookie, issued('mystery'));
  assert.equal(jar.mergeCookie('exhentai.org', cookie), cookie);
});

test('a rejected token is dropped so the configured cookie takes over again', () => {
  const jar = createSessionCookieJar();
  jar.rememberCookies('exhentai.org', cookie, issued('token1'));
  jar.rememberCookies('exhentai.org', cookie, issued('mystery'));
  assert.equal(jar.mergeCookie('exhentai.org', `${cookie}; igneous=own`), `${cookie}; igneous=own`);
});

test('a stored token is dropped once the site expires it', () => {
  const jar = createSessionCookieJar();
  jar.rememberCookies('exhentai.org', cookie, issued('token1'));
  jar.rememberCookies('exhentai.org', cookie, {'set-cookie': ['igneous=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; domain=.exhentai.org']});
  assert.equal(jar.mergeCookie('exhentai.org', cookie), cookie);
});

test('tokens stay scoped to their account and their host', () => {
  const jar = createSessionCookieJar();
  jar.rememberCookies('exhentai.org', cookie, issued('token1'));
  assert.equal(jar.mergeCookie('exhentai.org', 'ipb_member_id=7; ipb_pass_hash=other'), 'ipb_member_id=7; ipb_pass_hash=other');
  assert.equal(jar.mergeCookie('e-hentai.org', cookie), cookie);
});

test('an empty or rejected EX response is reported as a lost session', () => {
  assert.equal(isExSessionRejected('exhentai.org', {status: 200, body: '', headers: {}}), true);
  assert.equal(isExSessionRejected('exhentai.org', {status: 200, body: '  \n ', headers: {}}), true);
  assert.equal(isExSessionRejected('exhentai.org', {status: 200, body: '<html>ok</html>', headers: {'set-cookie': ['igneous=mystery; Max-Age=900']}}), true);
  assert.equal(isExSessionRejected('exhentai.org', {status: 200, body: '<html>ok</html>', headers: {}}), false);
  assert.equal(isExSessionRejected('e-hentai.org', {status: 200, body: '', headers: {}}), false);
});

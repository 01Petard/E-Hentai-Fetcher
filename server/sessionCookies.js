// ExHentai 在每次响应里用 Set-Cookie 下发会话令牌 igneous（有效期约 15 分钟）。
// 代理本身不留存 Cookie，若不在这里续期，里站请求会在令牌过期后突然返回空响应。

const storedNames = new Set(['igneous']);
const maxSessions = 50;

export const exSessionMessage = 'ExHentai 拒绝了当前会话（igneous 失效或出口 IP 被里站风控）。请在配置中更新 Cookie，或更换网络节点后重试。';

function splitCookie(cookie) {
  return String(cookie ?? '').split(';').map(part => part.trim()).filter(Boolean);
}

function cookiePair(part) {
  const separator = part.indexOf('=');
  if (separator < 1) return null;
  const name = part.slice(0, separator).trim();
  return name ? {name, key: name.toLowerCase(), value: part.slice(separator + 1).trim()} : null;
}

// 会话按账号（ipb_member_id）隔离，多用户部署下不会互相取用对方的登录令牌。
function sessionKey(domain, cookie) {
  const member = splitCookie(cookie).map(cookiePair).find(pair => pair?.key === 'ipb_member_id');
  return `${domain}\n${member?.value || ''}`;
}

export function createSessionCookieJar() {
  const sessions = new Map();

  function mergeCookie(hostname, cookie) {
    const session = sessions.get(sessionKey(hostname, cookie));
    if (!session?.size) return cookie;
    const parts = splitCookie(cookie).filter(part => !session.has(cookiePair(part)?.key));
    for (const {name, value} of session.values()) parts.push(`${name}=${value}`);
    return parts.join('; ');
  }

  function rememberCookies(hostname, cookie, headers) {
    const header = headers?.['set-cookie'];
    if (!header) return;
    for (const line of Array.isArray(header) ? header : [header]) {
      const [pair] = String(line).split(';');
      const parsed = cookiePair(String(pair).trim());
      if (!parsed || !storedNames.has(parsed.key)) continue;
      const domain = (/;\s*domain=([^;\s]+)/i.exec(String(line))?.[1] || hostname).replace(/^\./, '').toLowerCase();
      const key = sessionKey(domain, cookie);
      const session = sessions.get(key) || new Map();
      // “mystery” 表示凭据被拒绝：丢掉已存令牌，让后续请求回退到用户配置的 Cookie。
      if (!parsed.value || parsed.value === 'mystery' || /(?:^|;)\s*max-age=0\s*(?:;|$)/i.test(String(line))) {
        session.delete(parsed.key);
      } else {
        session.set(parsed.key, parsed);
        while (sessions.size >= maxSessions && !sessions.has(key)) sessions.delete(sessions.keys().next().value);
      }
      if (session.size) sessions.set(key, session);
      else sessions.delete(key);
    }
  }

  return {mergeCookie, rememberCookies};
}

export function isExSessionRejected(hostname, result) {
  if (hostname !== 'exhentai.org') return false;
  const header = result?.headers?.['set-cookie'];
  const lines = header ? (Array.isArray(header) ? header : [header]) : [];
  if (lines.some(line => /^\s*igneous=mystery\s*(?:;|$)/i.test(String(line)))) return true;
  return result?.status === 200 && !String(result?.body ?? '').trim();
}

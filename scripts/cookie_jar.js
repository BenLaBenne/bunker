// scripts/cookie_jar.js — Petit jar de cookies pour les tests (Set-Cookie multiples).
export function getCookieJar() {
  const cookies = new Map();
  return {
    absorb(res) {
      const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
      for (const sc of setCookies) {
        const [pair] = sc.split(';');
        const idx = pair.indexOf('=');
        if (idx === -1) continue;
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (value === '' || /Expires=Thu, 01 Jan 1970/.test(sc)) cookies.delete(name);
        else cookies.set(name, value);
      }
    },
    header() {
      if (!cookies.size) return {};
      return { Cookie: [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ') };
    }
  };
}

// src/ui/api.js — Client HTTP (fetch, cookies httpOnly gérés par le navigateur).
import { t } from './i18n.js';

async function request(method, url, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin'
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw { code: 'NETWORK', message: t('server_error') };
  }
  let data = {};
  try { data = await res.json(); } catch { /* réponse vide */ }
  if (!res.ok) {
    const code = data.error || 'SERVER_ERROR';
    throw { code, status: res.status, message: humanize(code) };
  }
  return data;
}

function humanize(code) {
  const map = {
    BAD_UNAME: t('auth_bad_uname'), BAD_PWORD: t('auth_bad_pword'), UNAME_TAKEN: t('auth_taken'),
    BAD_CREDENTIALS: t('auth_bad'), BANNED: t('auth_banned'), SUSPENDED: t('auth_suspended'),
    NOT_ENOUGH: t('not_enough'), ALREADY_OWNED: t('owned'), RATE_LIMITED: t('rate_limited'),
    AUTH_REQUIRED: t('auth_login'), ADMIN_REQUIRED: t('admin')
  };
  return map[code] || (code === 'SERVER_ERROR' || code === 'NETWORK' ? t('server_error') : code);
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body ?? {}),
  put: (url, body) => request('PUT', url, body ?? {}),
  del: (url) => request('DELETE', url)
};

/** Lit une image distante (texture admin) en <img> URL. */
export function textureUrl(id) { return `/api/textures/${id}/raw`; }

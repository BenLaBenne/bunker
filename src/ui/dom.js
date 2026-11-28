// src/ui/dom.js — Helpers DOM (textContent partout : jamais d'innerHTML pour des données joueur).
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, String(v));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el) {
  if (!el) return el; // garde-fou : conteneur absent → ne rien faire
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function icon(name) {
  // Petites icônes emoji cohérentes (pas d'emoji dans les données joueur)
  const map = {
    play: '▶', shop: '🛒', fighters: '🥊', friends: '👥', clans: '🛡', pass: '🎟',
    quests: '📜', news: '📰', gifts: '🎁', leaderboard: '🏆', settings: '⚙', admin: '🛠',
    bell: '🔔', logout: '⏻', coins: '🔩', cores: '💠', heart: '❤', armor: '🛡',
    attack: '⚔', interact: '🔧', special: '⚡', map: '🗺', emote: '💬', back: '←',
    stairs_up: '▲', stairs_down: '▼', danger: '☢', alive: '👤', timer: '⏱', win: '🏆',
    edit: '✏', trash: '🗑', plus: '＋', play_sound: '🔊', upload: '📤', game: '🎮', key: '⌨'
  };
  return h('span', { class: 'icon' }, map[name] || '•');
}

export function bar(fillRatio, cls = '') {
  const el = h('div', { class: `progressbar ${cls}` });
  const fill = h('div');
  fill.style.width = `${Math.max(0, Math.min(1, fillRatio)) * 100}%`;
  el.append(fill);
  return el;
}

/** Toast global. */
export function toast(msg, cls = '') {
  let zone = document.getElementById('toast-zone');
  if (!zone) {
    zone = h('div', { id: 'toast-zone' });
    document.getElementById('app').append(zone);
  }
  const el = h('div', { class: `toast ${cls}` }, msg);
  zone.append(el);
  setTimeout(() => el.remove(), 3400);
}

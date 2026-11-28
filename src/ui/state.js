// src/ui/state.js — État global du client (session, méta-données, réglages).

import { api } from './api.js';
import { setLang } from './i18n.js';

export const state = {
  user: null,
  meta: null,          // fighters, maps, shop, quests, pass, sounds, config
  inventory: null,
  keybinds: null,
  settings: { master: 1, music: 0.6, sfx: 1, zoom: 1.25 },
  currentMapId: 'bunker_a7'
};

const DEFAULT_BINDS = {
  up: ['KeyW', 'ArrowUp', 'KeyZ'], down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft', 'KeyQ'], right: ['KeyD', 'ArrowRight'],
  attack: ['Space'], interact: ['KeyE'], special: ['KeyF'], map: ['KeyM', 'Tab'], emote: ['KeyB']
};

function loadLocal() {
  try {
    const binds = localStorage.getItem('bunker_keybinds');
    state.keybinds = binds ? { ...DEFAULT_BINDS, ...JSON.parse(binds) } : { ...DEFAULT_BINDS };
    const s = localStorage.getItem('bunker_settings');
    if (s) Object.assign(state.settings, JSON.parse(s));
    const lang = localStorage.getItem('bunker_lang');
    if (lang) setLang(lang);
  } catch { state.keybinds = { ...DEFAULT_BINDS }; }
}

function saveLocal() {
  try {
    localStorage.setItem('bunker_keybinds', JSON.stringify(state.keybinds));
    localStorage.setItem('bunker_settings', JSON.stringify(state.settings));
    localStorage.setItem('bunker_lang', state.user?.lang || localStorage.getItem('bunker_lang') || 'fr');
  } catch { /* stockage indisponible */ }
}

export function setKeybind(action, code) {
  state.keybinds[action] = [code];
  saveLocal();
}
export function resetKeybinds() {
  state.keybinds = { ...DEFAULT_BINDS };
  saveLocal();
}

export function isBound(action, code) {
  return (state.keybinds[action] || []).includes(code);
}

export async function loadSession() {
  loadLocal();
  try {
    const me = await api.get('/api/me');
    state.user = me.user;
    setLang(me.user.lang || 'fr');
    if (me.user.settings) Object.assign(state.settings, me.user.settings);
    return true;
  } catch {
    state.user = null;
    return false;
  }
}

export async function loadMeta() {
  state.meta = await api.get('/api/meta');
  return state.meta;
}

export async function loadInventory() {
  state.inventory = await api.get('/api/inventory');
  return state.inventory;
}

export function persistSettings() {
  saveLocal();
  if (state.user) {
    api.post('/api/me/settings', { settings: state.settings }).catch(() => {});
  }
}

export function owns(type, id) {
  return !!state.inventory?.items?.some(i => i.type === type && i.id === id);
}

export function refreshUser() {
  return api.get('/api/me').then(d => { state.user = d.user; }).catch(() => {});
}

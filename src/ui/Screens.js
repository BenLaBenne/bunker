// src/ui/Screens.js — Écrans du lobby : authentification, accueil Play et tous
// les systèmes méta (shop, fighters, amis, clans, pass, quêtes, news, cadeaux,
// classements, réglages). Toutes les données proviennent des API serveur.
import { h, clear, icon, toast } from './dom.js';
import { t, setLang } from './i18n.js';
import { api } from './api.js';
import { state, loadMeta, loadInventory, persistSettings, setKeybind, resetKeybinds, owns, refreshUser } from './state.js';
import { audio } from '../audio/AudioManager.js';

let screenRenderers = {};

export class Screens {
  constructor(root, { onPlay, onAdmin, onLogout }) {
    this.root = root;
    this.onPlay = onPlay;
    this.onAdmin = onAdmin;
    this.onLogout = onLogout;
    this.current = 'play';
  }

  /* ---------------- auth ---------------- */

  showAuth() {
    clear(this.root);
    let mode = 'login';
    const wrap = h('div', { class: 'scene' },
      h('div', { class: 'lobby-bg' }),
      h('div', { class: 'auth-wrap' },
        this.authCard = h('div', { class: 'auth-card' })
      )
    );
    this.root.append(wrap);

    const render = () => {
      clear(this.authCard);
      this.authCard.append(
        h('div', { class: 'auth-logo' }, '☣ BUNKER'),
        h('div', { class: 'auth-sub' }, 'Survival multijoueur — bunker A-7'),
        h('div', { class: 'auth-tabs' },
          h('button', {
            class: mode === 'login' ? 'active' : '',
            onclick: () => { mode = 'login'; render(); }
          }, t('auth_login')),
          h('button', {
            class: mode === 'register' ? 'active' : '',
            onclick: () => { mode = 'register'; render(); }
          }, t('auth_register'))
        )
      );
      const unameInput = h('input', { placeholder: t('auth_uname'), maxlength: 16, autocomplete: 'username' });
      const pwordInput = h('input', { placeholder: t('auth_pword'), type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password' });
      const errEl = h('div', { class: 'form-error' });
      const submit = async () => {
        errEl.textContent = '';
        submitBtn.disabled = true;
        audio.resume(); audio.play('click');
        try {
          const res = await api.post(`/api/auth/${mode}`, { uname: unameInput.value, pword: pwordInput.value });
          state.user = res.user;
          setLang(res.user.lang || 'fr');
          await loadMeta();
          await loadInventory();
          this.showLobby('play');
        } catch (e) {
          errEl.textContent = e.message || t('server_error');
          audio.play('hit');
        } finally {
          submitBtn.disabled = false;
        }
      };
      const submitBtn = h('button', { class: 'btn primary large', style: { width: '100%', marginTop: '6px' }, onclick: submit }, t('auth_go'));
      const form = h('div', {},
        h('div', { class: 'field' }, h('label', {}, t('auth_uname')), unameInput),
        h('div', { class: 'field' },
          h('label', {}, t('auth_pword')),
          pwordInput,
          mode === 'register' ? h('div', { class: 'muted' }, t('auth_pword_hint')) : null
        ),
        errEl, submitBtn
      );
      if (mode === 'register') form.append(h('div', { class: 'muted', style: { marginTop: '8px' } }, '★ ', t('auth_first_admin')));
      form.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      this.authCard.append(form);
    };
    render();
  }

  /* ---------------- lobby shell ---------------- */

  showLobby(tab = 'play') {
    this.current = tab;
    clear(this.root);
    const lang = state.user?.lang || 'fr';
    const u = state.user;
    const NAV = [
      ['play', '▶', t('play')], ['shop', '🛒', t('shop')], ['fighters', '🥊', t('fighters')],
      ['friends', '👥', t('friends')], ['clans', '🛡', t('clans')], ['pass', '🎟', t('pass')],
      ['quests', '📜', t('quests')], ['leaderboard', '🏆', t('leaderboard')],
      ['news', '📰', t('news')], ['gifts', '🎁', t('gifts')], ['settings', '⚙', t('settings')]
    ];
    const nav = h('div', { class: 'sidenav' });
    for (const [id, ic, label] of NAV) {
      nav.append(h('a', {
        href: '#', class: this.current === id ? 'active' : '',
        dataset: { tab: id },
        onclick: (e) => { e.preventDefault(); audio.play('click'); this.showLobby(id); }
      }, h('span', { class: 'ic' }, ic), h('span', { class: 'lbl' }, label)));
    }
    if (u.is_admin) {
      nav.append(h('div', { class: 'nav-admin' }));
      nav.append(h('a', {
        href: '#', class: this.current === 'admin' ? 'active' : '',
        onclick: (e) => { e.preventDefault(); audio.play('click'); this.onAdmin(); }
      }, h('span', { class: 'ic' }, '🛠'), h('span', { class: 'lbl' }, t('admin'))));
    }

    // barre du haut
    const bellWrap = h('div', { style: { position: 'relative' } });
    const bell = h('div', { class: 'chip clickable', onclick: () => this.toggleNotifs(bellWrap) },
      '🔔', this.notifBadge = h('span', { class: 'badge-dot hidden' }, '0'));
    bellWrap.append(bell);

    const topbar = h('div', { class: 'topbar' },
      h('div', { class: 'logo' }, '☣ BUNKER'),
      h('div', { class: 'spacer' }),
      h('div', { class: 'chip' }, '🔩 ', h('span', { class: 'cur-coins' }, String(u.coins))),
      h('div', { class: 'chip' }, '💠 ', h('span', { class: 'cur-cores' }, String(u.cores))),
      h('div', { class: 'chip' }, `🏆 ${u.trophies}`),
      h('div', { class: 'chip clickable', onclick: () => this.showLobby('settings') },
        `${u.uname} · ${t('level')} ${u.level}`),
      bellWrap,
      h('div', {
        class: 'chip clickable', onclick: async () => {
          await api.post('/api/auth/logout');
          this.onLogout?.();
        }
      }, '⏻')
    );

    const content = h('div', { class: 'content' });
    const body = h('div', { class: 'lobby-body' }, nav, content);
    const scene = h('div', { class: 'scene' }, h('div', { class: 'lobby-bg' }), topbar, body);
    this.root.append(scene);
    (screenRenderers[this.current] || screenRenderers.play).call(this, content);
    this.refreshNotifBadge();
  }

  /* ---------------- notifications ---------------- */

  async refreshNotifBadge() {
    try {
      const d = await api.get('/api/notifications');
      const unread = d.notifications.filter(n => !n.read).length;
      if (this.notifBadge) {
        this.notifBadge.textContent = String(unread);
        this.notifBadge.classList.toggle('hidden', unread === 0);
      }
    } catch { /* noop */ }
  }

  async toggleNotifs(anchorWrap) {
    const existing = document.querySelector('.notif-panel');
    if (existing) { existing.remove(); return; }
    try {
      const d = await api.get('/api/notifications');
      const panel = h('div', { class: 'notif-panel' });
      for (const n of d.notifications.slice(0, 15)) {
        panel.append(h('div', { class: `notif-item ${n.read ? '' : 'unread'}` },
          h('div', { class: 'n-title' }, n.title),
          h('div', { class: 'n-body' }, n.body),
          h('div', { class: 'muted' }, new Date(n.created_at).toLocaleString())
        ));
      }
      if (!d.notifications.length) panel.append(h('div', { class: 'notif-item' }, t('none')));
      anchorWrap.append(panel);
      const unread = d.notifications.filter(n => !n.read).map(n => n.id);
      if (unread.length) {
        await api.post('/api/notifications/read', { ids: unread });
        this.notifBadge?.classList.add('hidden');
      }
      audio.play('notification');
    } catch { /* noop */ }
  }

  /* ================= écran PLAY ================= */

  async renderPlay(content) {
    clear(content);
    await loadMeta();
    const u = state.user;
    const fighter = state.meta.fighters.find(f => f.id === u.selected_fighter) || state.meta.fighters[0];
    const skinName = u.selected_skin ? state.meta.shop.find(s => s.payload?.skinId === u.selected_skin)?.name : null;

    content.append(
      h('div', { class: 'panel', style: { textAlign: 'center' } },
        h('h2', {}, '▶ ', t('play')),
        h('div', { class: 'muted', style: { marginBottom: '14px' } }, t('play_desc')),
        h('div', { class: 'row', style: { justifyContent: 'center' } },
          h('div', { class: 'chip' }, `🥊 ${state.user.lang === 'en' ? fighter.name_en : fighter.name}`),
          skinName ? h('div', { class: 'chip' }, `🎨 ${skinName}`) : null,
          h('div', { class: 'chip' }, `🗺 ${t('map_select')}: ${this.mapName()}`),
          h('div', { class: 'chip' }, `👥 ${state.meta.config.maxPlayers}/10`)
        ),
        h('div', { style: { marginTop: '16px' } },
          h('button', {
            class: 'btn primary large', style: { minWidth: '220px' },
            onclick: () => { audio.play('purchase'); this.onPlay(); }
          }, '▶ ', t('launch'))
        ),
        this.queueStatus = h('div', { class: 'muted', style: { marginTop: '10px' } }, '')
      ),
      h('div', { class: 'cards' },
        (state.meta.maps || []).map(m => {
          const name = state.user.lang === 'en' ? m.name_en : m.name;
          return h('div', { class: `card ${state.currentMapId === m.id ? 'selected' : ''}` },
            h('canvas', { width: 200, height: 100, 'data-mapcard': m.id }),
            h('div', { class: 'card-title' }, '🗺 ', name),
            h('div', { class: 'card-desc' }, state.user.lang === 'en' ? m.description_en : m.description),
            h('button', {
              class: 'btn small',
              onclick: () => { state.currentMapId = m.id; this.showLobby('play'); }
            }, state.currentMapId === m.id ? '✓ ' + t('selected') : t('select'))
          );
        })
      )
    );
    // mini aperçu des maps
    for (const cv of content.querySelectorAll('canvas[data-mapcard]')) {
      this.drawMapCard(cv, cv.dataset.mapcard);
    }
  }

  drawMapCard(canvas, mapId) {
    const mapMeta = state.meta.maps.find(m => m.id === mapId);
    if (!mapMeta) return;
    // aperçu : charge la map depuis l'API publique si publiée
    api.get(`/api/map-preview/${mapId}`).then(d => {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#050705'; ctx.fillRect(0, 0, 200, 100);
      const data = d.data;
      const fl = data.floors[0];
      const sx = 200 / data.w, sy = 100 / data.h;
      fl.grid.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const ch = row[x];
          if (ch === ' ') continue;
          ctx.fillStyle = ch === '#' ? '#1c241e' : ch === 'e' ? '#1f4a2a' : '#2b332c';
          ctx.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
        }
      });
      for (const tk of data.tasks) {
        ctx.fillStyle = '#ff5d5d';
        ctx.fillRect(tk.x * sx - 2, tk.y * sy - 2, 4, 4);
      }
    }).catch(() => {});
  }

  mapName() {
    const m = state.meta.maps.find(mm => mm.id === state.currentMapId);
    return m ? (state.user.lang === 'en' ? m.name_en : m.name) : state.currentMapId;
  }

  /* ================= BOUTIQUE ================= */

  async renderShop(content) {
    clear(content);
    await loadMeta();
    const u = state.user;
    let category = 'all';
    const CATS = [['all', t('category_all')], ['skins', t('cat_skins')], ['emotes', t('cat_emotes')],
      ['tags', t('cat_tags')], ['effects', t('cat_effects')], ['cosmetics', t('cat_cosmetics')]];
    const tabRow = h('div', { class: 'row', style: { marginBottom: '12px' } });
    const grid = h('div', { class: 'cards' });
    const renderGrid = () => {
      clear(tabRow);
      for (const [id, label] of CATS) {
        tabRow.append(h('button', {
          class: `btn small ${category === id ? 'primary' : ''}`,
          onclick: () => { category = id; audio.play('click'); renderGrid(); }
        }, label));
      }
      clear(grid);
      const items = state.meta.shop.filter(it => category === 'all' || it.category === category);
      for (const it of items) {
        const owned = it.payload?.skinId ? owns('skin', it.payload.skinId) : owns({ skins: 'skin', emotes: 'emote', tags: 'tag', effects: 'fx' }[it.category], it.id);
        grid.append(h('div', { class: 'card' },
          h('div', { class: 'row' },
            h('span', { class: `rarity ${it.rarity}` }, it.rarity),
            h('span', { class: 'muted' }, it.category)
          ),
          h('div', { class: 'card-title' }, it.name),
          h('div', { class: 'card-desc' }, it.description),
          it.image ? h('img', { src: `/api/textures/${it.image}/raw`, style: { width: '100%', imageRendering: 'pixelated', borderRadius: '8px' } }) : null,
          h('div', { class: 'row' },
            h('span', { class: `price ${it.currency === 'cores' ? 'cores' : ''}` },
              it.currency === 'cores' ? '💠 ' : '🔩 ', String(it.price)),
            h('span', { class: 'right' }),
            owned
              ? h('span', { class: 'muted' }, '✓ ', t('owned'))
              : h('button', {
                class: 'btn small primary',
                onclick: async () => {
                  try {
                    const res = await api.post('/api/shop/buy', { itemId: it.id });
                    state.user.coins = res.coins; state.user.cores = res.cores;
                    await loadInventory();
                    audio.play('purchase');
                    toast(`🛒 ${it.name}`, 'rew');
                    this.showLobby('shop');
                  } catch (e) { toast(e.message, 'error'); audio.play('hit'); }
                }
              }, t('buy'))
          )
        ));
      }
    };
    renderGrid();
    content.append(
      h('div', { class: 'panel' }, h('h2', {}, '🛒 ', t('shop')),
        h('div', { class: 'row' },
          h('div', { class: 'chip' }, `🔩 ${u.coins}`), h('div', { class: 'chip' }, `💠 ${u.cores}`)
        ), tabRow, grid)
    );
  }

  /* ================= FIGHTERS ================= */

  async renderFighters(content) {
    clear(content);
    await loadMeta();
    await loadInventory();
    const grid = h('div', { class: 'cards' });
    for (const f of state.meta.fighters) {
      const lang = state.user.lang;
      const owned = f.price === 0 || owns('fighter', f.id);
      const selected = state.user.selected_fighter === f.id;
      grid.append(h('div', { class: `card ${selected ? 'selected' : ''}` },
        h('canvas', { width: 128, height: 64, 'data-fighter': f.id, style: { height: '64px', objectFit: 'contain' } }),
        h('div', { class: 'row' },
          h('span', { class: `rarity ${f.rarity}` }, f.rarity),
          h('span', { class: 'card-title' }, lang === 'en' ? f.name_en : f.name)
        ),
        h('div', { class: 'card-desc' }, lang === 'en' ? f.description_en : f.description),
        h('div', { class: 'row', style: { fontSize: '12px', color: 'var(--muted)' } },
          `❤ ${f.hp} · ⚔ ${f.damage} · 👟 ${f.speed} · 🎯 ${f.attack_range}`),
        h('div', { class: 'muted' }, `${t('special')}: ${t('sp_' + f.special)} · ⏱ ${f.special_cd}s`),
        h('div', { class: 'row' },
          owned
            ? h('button', {
              class: `btn small ${selected ? 'primary' : ''}`,
              onclick: async () => {
                await api.post('/api/me/select', { fighter: f.id });
                state.user.selected_fighter = f.id;
                audio.play('click');
                this.showLobby('fighters');
              }
            }, selected ? '✓ ' + t('selected') : t('select'))
            : h('button', {
              class: 'btn small',
              onclick: async () => {
                try {
                  const res = await api.post('/api/fighters/buy', { fighterId: f.id });
                  state.user.coins = res.coins; state.user.cores = res.cores;
                  await loadInventory();
                  audio.play('purchase');
                  toast(`🥊 ${f.name}`, 'rew');
                  this.showLobby('fighters');
                } catch (e) { toast(e.message, 'error'); }
              }
            }, `${f.currency === 'cores' ? '💠' : '🔩'} ${f.price}`)
        )
      ));
    }
    content.append(h('div', { class: 'panel' },
      h('h2', {}, '🥊 ', t('choose_fighter')),
      grid
    ));
    // aperçus animés
    for (const cv of content.querySelectorAll('canvas[data-fighter]')) {
      const f = cv.dataset.fighter;
      const factory = this.cachedFactory || (this.cachedFactory = new TextureFactory(state.meta.fighters, {}));
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const sheetCanvas = factory.charCanvases[f];
      if (!sheetCanvas) continue;
      let frame = 0;
      const draw = () => {
        if (!cv.isConnected) { clearInterval(iv); return; }
        ctx.clearRect(0, 0, 128, 64);
        ctx.fillStyle = '#0d130f';
        ctx.fillRect(0, 0, 128, 64);
        const fx = (frame % 4) * 32;
        const row = Math.floor(frame / 4) % 2;
        ctx.drawImage(sheetCanvas, fx, row * 32, 32, 32, 48, 16, 32, 32);
        frame++;
      };
      draw();
      const iv = setInterval(draw, 450);
    }
  }

  /* ================= AMIS ================= */

  async renderFriends(content) {
    clear(content);
    const d = await api.get('/api/friends');
    const panel = h('div', { class: 'panel' }, h('h2', {}, '👥 ', t('friends')));
    // ajout
    const unameInput = h('input', { placeholder: t('friend_uname'), maxlength: 16 });
    panel.append(h('div', { class: 'row' },
      unameInput,
      h('button', {
        class: 'btn small primary', onclick: async () => {
          try {
            await api.post('/api/friends/request', { uname: unameInput.value });
            toast('✉ ' + t('sent'));
            unameInput.value = '';
          } catch (e) { toast(e.message, 'error'); }
        }
      }, t('send'))
    ));
    if (d.requests.length) {
      panel.append(h('h3', {}, '✉ ', t('requests'), ` (${d.requests.length})`));
      for (const rq of d.requests) {
        panel.append(h('div', { class: 'row', style: { marginBottom: '6px' } },
          h('div', { class: 'chip' }, `${rq.uname} · ${t('level')} ${rq.level}`),
          h('button', {
            class: 'btn small primary', onclick: async () => {
              await api.post('/api/friends/respond', { requestId: rq.id, accept: true });
              this.showLobby('friends');
            }
          }, '✓ ', t('accept')),
          h('button', {
            class: 'btn small', onclick: async () => {
              await api.post('/api/friends/respond', { requestId: rq.id, accept: false });
              this.showLobby('friends');
            }
          }, '✕ ', t('refuse'))
        ));
      }
    }
    panel.append(h('h3', {}, t('friends'), ` (${d.friends.length})`));
    if (!d.friends.length) panel.append(h('div', { class: 'muted' }, t('no_friends')));
    for (const f of d.friends) {
      panel.append(h('div', { class: 'row', style: { marginBottom: '6px' } },
        h('div', { class: 'chip' },
          h('span', { style: { color: f.online ? '#7fff6a' : '#8fa392' } }, '●'),
          ` ${f.uname} · ${t('level')} ${f.level} · 🏆 ${f.trophies}`),
        h('span', { class: 'muted' }, f.online ? t('online') : t('offline')),
        h('button', {
          class: 'btn small right', onclick: async () => {
            const roomId = window.__currentRoomId;
            if (!roomId) { toast('▶ ' + t('play') + ' ' + t('send')); return; }
            try {
              await api.post('/api/friends/invite-match', { userId: f.id, roomId });
              toast('✉ ' + t('sent'));
            } catch (e) { toast(e.message, 'error'); }
          }
        }, '🎮 ', t('invite_match')),
        h('button', {
          class: 'btn small danger', onclick: async () => {
            await api.post('/api/friends/remove', { userId: f.id });
            this.showLobby('friends');
          }
        }, '🗑')
      ));
    }
    content.append(panel);
  }

  /* ================= CLANS ================= */

  async renderClans(content) {
    clear(content);
    const mine = await api.get('/api/clans/mine');
    const list = await api.get('/api/clans');
    if (mine.clan) {
      const c = mine.clan;
      const panel = h('div', { class: 'panel' },
        h('h2', {}, h('span', { style: { color: c.emblem_color } }, c.emblem), ` ${c.name} [${c.tag}]`),
        h('div', { class: 'row' },
          h('div', { class: 'chip' }, `🏆 ${c.trophies}`),
          h('div', { class: 'chip' }, `${t('wins')}: ${c.wins}`),
          h('div', { class: 'chip' }, `${t('members')}: ${c.members}`),
          h('div', { class: 'chip' }, `${t('level')} ${c.level}`),
          h('span', { class: 'muted' }, `${t('leader' === c.my_role ? 'leader' : c.my_role)} · vous`)
        ),
        c.description ? h('div', { class: 'muted', style: { marginTop: '6px' } }, c.description) : null
      );
      // membres
      panel.append(h('h3', {}, t('members')));
      for (const m of mine.members) {
        panel.append(h('div', { class: 'row', style: { marginBottom: '4px' } },
          h('div', { class: 'chip' }, `${m.uname} · ${t('level')} ${m.level} · 🏆 ${m.trophies}`),
          h('span', { class: `muted ${m.role === 'leader' ? '' : ''}` },
            m.role === 'leader' ? '👑 ' + t('leader') : m.role === 'officer' ? t('officer') : t('member')),
          (c.my_role === 'leader' || c.my_role === 'officer') && m.role === 'member' && m.id !== state.user.id
            ? h('button', {
              class: 'btn small danger right', onclick: async () => {
                await api.post('/api/clans/kick', { userId: m.id });
                this.showLobby('clans');
              }
            }, t('kick')) : null
        ));
      }
      // chat de clan (polling)
      panel.append(h('h3', {}, '💬 ', t('chat')));
      const chatBox = h('div', { style: { maxHeight: '160px', overflowY: 'auto', background: '#0d130f', borderRadius: '8px', padding: '8px', marginBottom: '8px', fontSize: '13px' } });
      const chatInput = h('input', { placeholder: t('clan_chat_hint'), maxlength: 240, style: { flex: 1 } });
      const sendChat = async () => {
        const text = chatInput.value.trim();
        if (!text) return;
        chatInput.value = '';
        api.post(`/api/clans/${c.id}/chat`, { text }).catch(() => {});
        // affichage optimiste + diffusion via ws si connecté
        window.__net?.clanChat?.(text);
      };
      const pollChat = async () => {
        try {
          const d = await api.get(`/api/clans/${c.id}/chat`);
          if (!chatBox.isConnected) return;
          clear(chatBox);
          for (const m of d.messages) {
            chatBox.append(h('div', {}, h('b', {}, m.uname), ` : ${m.message}`));
          }
          chatBox.scrollTop = chatBox.scrollHeight;
        } catch { /* noop */ }
      };
      pollChat();
      const chatIv = setInterval(() => { if (!chatBox.isConnected) clearInterval(chatIv); else pollChat(); }, 4000);
      panel.append(chatBox, h('div', { class: 'row' }, chatInput,
        h('button', { class: 'btn small primary', onclick: sendChat }, t('send_msg'))));
      panel.append(h('div', { class: 'row', style: { marginTop: '10px' } },
        h('button', {
          class: 'btn danger', onclick: async () => {
            await api.post('/api/clans/leave');
            this.showLobby('clans');
          }
        }, t('leave_clan'))
      ));
      content.append(panel);
    } else {
      // création
      const panel = h('div', { class: 'panel' }, h('h2', {}, '🛡 ', t('create_clan')));
      const nameInput = h('input', { placeholder: t('clan_name'), maxlength: 24 });
      const tagInput = h('input', { placeholder: t('clan_tag'), maxlength: 6 });
      const emblemInput = h('input', { value: '☢', maxlength: 4, style: { width: '60px', textAlign: 'center' } });
      const colorInput = h('input', { type: 'color', value: '#7fff6a', style: { width: '50px', height: '34px', border: 'none', background: 'transparent' } });
      panel.append(
        h('div', { class: 'row' },
          h('div', { class: 'field grow' }, h('label', {}, t('clan_name')), nameInput),
          h('div', { class: 'field' }, h('label', {}, t('clan_tag')), tagInput)
        ),
        h('div', { class: 'row' },
          h('div', { class: 'field' }, h('label', {}, t('clan_emblem')), emblemInput),
          h('div', { class: 'field' }, h('label', {}, 'Couleur'), colorInput)
        ),
        h('button', {
          class: 'btn primary', onclick: async () => {
            try {
              await api.post('/api/clans', { name: nameInput.value, tag: tagInput.value, emblem: emblemInput.value, color: colorInput.value });
              this.showLobby('clans');
            } catch (e) { toast(e.message, 'error'); }
          }
        }, '🛡 ', t('create_clan'))
      );
      content.append(panel);
    }
    // invitations reçues
    if (mine.clan === null && mine.invites?.length) {
      const invPanel = h('div', { class: 'panel' }, h('h3', {}, '✉ ', t('clan_invites_you')));
      for (const inv of mine.invites) {
        invPanel.append(h('div', { class: 'row' },
          h('div', { class: 'chip' }, `${inv.uname} · ${t('level')} ${inv.level}`),
          h('button', {
            class: 'btn small primary', onclick: async () => {
              await api.post('/api/clans/respond', { inviteId: inv.id, accept: true });
              this.showLobby('clans');
            }
          }, '✓'), h('button', {
            class: 'btn small', onclick: async () => {
              await api.post('/api/clans/respond', { inviteId: inv.id, accept: false });
              this.showLobby('clans');
            }
          }, '✕')
        ));
      }
      content.append(invPanel);
    }
    // liste globale
    const listPanel = h('div', { class: 'panel' }, h('h2', {}, '🏆 ', t('clans')));
    for (const c of list.clans) {
      if (c.id === mine.clan?.id) continue;
      listPanel.append(h('div', { class: 'row', style: { marginBottom: '6px' } },
        h('div', { class: 'chip' },
          h('span', { style: { color: c.emblem_color } }, c.emblem), ` ${c.name} [${c.tag}]`),
        h('span', { class: 'muted' }, `🏆 ${c.trophies} · ${t('members')} ${c.members}`),
        h('button', {
          class: 'btn small right', onclick: async () => {
            try {
              await api.post('/api/clans/join', { clanId: c.id });
              this.showLobby('clans');
            } catch (e) { toast(e.message, 'error'); }
          }
        }, t('join_clan'))
      ));
    }
    content.append(listPanel);
  }

  /* ================= PASS ================= */

  async renderPass(content) {
    clear(content);
    const d = await api.get('/api/pass');
    const panel = h('div', { class: 'panel' },
      h('h2', {}, '🎟 ', t('pass')),
      h('div', { class: 'muted', style: { marginBottom: '10px' } }, t('pass_desc')),
      h('div', { class: 'row', style: { marginBottom: '12px' } },
        h('div', { class: 'chip' }, `⭐ ${t('pass_level')} ${d.level}/50`),
        h('div', { class: 'chip' }, `${d.xp} XP`)
      ),
      h('div', { class: 'pass-track' })
    );
    const track = panel.querySelector('.pass-track');
    for (const rw of d.rewards) {
      const label = this.rewardLabel(rw);
      track.append(h('div', { class: `pass-row ${rw.claimed ? 'claimed' : ''}` },
        h('div', { class: 'lvl' }, `${rw.level}`),
        h('div', { class: 'grow' }, label),
        rw.claimed ? h('span', { class: 'muted' }, '✓ ', t('claimed'))
          : h('button', {
            class: `btn small ${rw.claimable ? 'primary' : ''}`, disabled: !rw.claimable,
            onclick: async () => {
              try {
                await api.post('/api/pass/claim', { level: rw.level });
                audio.play('reward');
                toast('🎁 ' + label, 'rew');
                await refreshUser();
                this.showLobby('pass');
              } catch (e) { toast(e.message, 'error'); }
            }
          }, t('claim'))
      ));
    }
    content.append(panel);
  }

  rewardLabel(rw) {
    const n = rw.qty || 1;
    switch (rw.type) {
      case 'coins': return `🔩 ${n} ${t('coins')}`;
      case 'cores': return `💠 ${n} ${t('cores')}`;
      case 'xp': return `⭐ ${n} XP`;
      case 'skin': return `🎨 Skin ${rw.id}`;
      case 'emote': return `💬 Emote ${rw.id}`;
      case 'tag': return `🏷 Tag ${rw.id}`;
      case 'fx': return `✨ Effet ${rw.id}`;
      default: return `🎁 ${rw.type} ${rw.id} ×${n}`;
    }
  }

  /* ================= QUÊTES ================= */

  async renderQuests(content) {
    clear(content);
    const d = await api.get('/api/quests');
    const lang = state.user.lang;
    const groups = { daily: t('daily'), weekly: t('weekly'), seasonal: t('seasonal') };
    for (const [type, label] of Object.entries(groups)) {
      const panel = h('div', { class: 'panel' }, h('h2', {}, label));
      const quests = d.quests.filter(q => q.type === type);
      if (!quests.length) panel.append(h('div', { class: 'muted' }, t('none')));
      for (const q of quests) {
        const statLabel = t('q_stat_' + q.stat) || q.stat;
        panel.append(h('div', { class: 'quest-card' },
          h('div', { class: 'quest-icon' }, q.icon),
          h('div', { class: 'grow' },
            h('div', { style: { fontWeight: 700 } }, lang === 'en' ? q.name_en : q.name),
            h('div', { class: 'muted' }, `⭐ ${q.reward_xp} XP · 🔩 ${q.reward_coins}${q.reward_cores ? ` · 💠 ${q.reward_cores}` : ''}`),
            h('div', { class: 'quest-progress', style: { marginTop: '6px' } },
              h('div', { style: { width: `${Math.min(100, q.progress / q.goal * 100)}%`, height: '100%', background: '#7fff6a' } }))
          ),
          h('div', { style: { textAlign: 'right' } },
            h('div', { class: 'muted' }, `${q.progress}/${q.goal} ${statLabel}`),
            q.claimed ? h('span', { class: 'muted' }, '✓')
              : h('button', {
                class: `btn small ${q.claimable ? 'primary' : ''}`, disabled: !q.claimable,
                onclick: async () => {
                  try {
                    await api.post('/api/quests/claim', { questId: q.id });
                    audio.play('reward');
                    await refreshUser();
                    this.showLobby('quests');
                  } catch (e) { toast(e.message, 'error'); }
                }
              }, t('claim'))
          )
        ));
      }
      content.append(panel);
    }
  }

  /* ================= NOUVEAUTÉS ================= */

  async renderNews(content) {
    clear(content);
    const d = await api.get('/api/news');
    const lang = state.user.lang;
    for (const n of d.news) {
      content.append(h('div', { class: 'panel' },
        n.image ? h('img', { src: `/api/textures/${n.image}/raw`, style: { width: '100%', maxHeight: '180px', objectFit: 'cover', borderRadius: '8px', marginBottom: '10px' } }) : null,
        h('h2', {}, lang === 'en' && n.title_en ? n.title_en : n.title),
        h('div', { style: { lineHeight: '1.5' } }, lang === 'en' && n.body_en ? n.body_en : n.body),
        h('div', { class: 'muted', style: { marginTop: '8px' } }, `✍ ${n.author} · ${new Date(n.created_at).toLocaleDateString()}`)
      ));
    }
    if (!d.news.length) content.append(h('div', { class: 'panel muted' }, t('none')));
  }

  /* ================= CADEAUX ================= */

  async renderGifts(content) {
    clear(content);
    const d = await api.get('/api/gifts');
    const panel = h('div', { class: 'panel' }, h('h2', {}, '🎁 ', t('gifts')));
    if (!d.gifts.length) panel.append(h('div', { class: 'muted' }, t('no_gifts')));
    for (const g of d.gifts) {
      panel.append(h('div', { class: 'card', style: { marginBottom: '10px' } },
        h('div', { class: 'card-title' }, `🎁 ${g.title}`),
        g.message ? h('div', { class: 'card-desc' }, g.message) : null,
        h('div', { class: 'row' },
          h('span', { class: 'muted' }, t('gift_from')),
          g.claimed ? h('span', { class: 'muted' }, '✓ ', t('claimed'))
            : h('button', {
              class: 'btn small primary right', disabled: !g.claimable,
              onclick: async () => {
                try {
                  const res = await api.post('/api/gifts/claim', { giftId: g.id });
                  audio.play('reward');
                  toast(`🎁 +${res.reward.qty} ${t('rew_' + res.reward.type) || res.reward.type}`, 'rew');
                  await refreshUser(); await loadInventory();
                  this.showLobby('gifts');
                } catch (e) { toast(e.message, 'error'); }
              }
            }, t('claim_gift')),
          g.expires_at ? h('span', { class: 'muted right' }, '⏱ ', new Date(g.expires_at).toLocaleDateString()) : null
        )
      ));
    }
    content.append(panel);
  }

  /* ================= CLASSEMENT ================= */

  async renderLeaderboard(content) {
    clear(content);
    let type = 'players', cat = 'trophies';
    const body = h('div');
    const tabs = h('div', { class: 'row', style: { marginBottom: '10px' } });
    const catsRow = h('div', { class: 'row', style: { marginBottom: '10px' } });
    const rebuild = async () => {
      const d = await api.get(`/api/leaderboard?type=${type}&cat=${cat}`);
      clear(body);
      const tbl = h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {},
          h('th', {}, t('rank')), type === 'players' ? h('th', {}, t('auth_uname')) : h('th', {}, t('clans')),
          h('th', {}, t('trophies')), h('th', {}, t('wins')),
          type === 'players' ? h('th', {}, t('kills')) : h('th', {}, t('members')),
          h('th', {}, t('level'))
        )),
        h('tbody', {}, d.entries.map(e => h('tr', {},
          h('td', { class: e.rank <= 3 ? 'lb-top3' : '' }, e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : String(e.rank)),
          h('td', {}, type === 'players' ? `${e.uname}` : `${e.emblem} ${e.name} [${e.tag}]`),
          h('td', {}, String(type === 'players' ? (cat === 'seasonal' ? e.season_trophies : e.trophies) : e.trophies)),
          h('td', {}, String(e.wins)),
          h('td', {}, String(type === 'players' ? e.kills : e.members)),
          h('td', {}, String(e.level))
        )))
      );
      body.append(h('div', { class: 'panel tbl-wrap' }, tbl));
    };
    const mkTab = (label, val, current, onclick) => h('button', {
      class: `btn small ${current === val ? 'primary' : ''}`, onclick
    }, label);
    const redrawTabs = () => {
      clear(tabs); clear(catsRow);
      tabs.append(
        mkTab(t('lb_players'), 'players', type, () => { type = 'players'; cat = 'trophies'; redrawTabs(); rebuild(); }),
        mkTab(t('lb_clans'), 'clans', type, () => { type = 'clans'; cat = 'trophies'; redrawTabs(); rebuild(); })
      );
      const cats = type === 'players'
        ? [[t('cat_trophies'), 'trophies'], [t('cat_wins'), 'wins'], [t('cat_kills'), 'kills'], [t('cat_seasonal'), 'seasonal']]
        : [[t('cat_trophies'), 'trophies'], [t('cat_wins'), 'wins']];
      for (const [label, val] of cats) catsRow.append(mkTab(label, val, cat, () => { cat = val; redrawTabs(); rebuild(); }));
    };
    redrawTabs();
    await rebuild();
    content.append(h('div', { class: 'panel' }, h('h2', {}, '🏆 ', t('leaderboard')), tabs, catsRow), body);
  }

  /* ================= PARAMÈTRES ================= */

  renderSettings(content) {
    clear(content);
    const u = state.user;
    // Audio
    const mkSlider = (label, key, onInput) => {
      const slider = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: String(state.settings[key] ?? 1), class: 'slider' });
      slider.addEventListener('input', () => {
        state.settings[key] = parseFloat(slider.value);
        onInput?.();
        persistSettings();
      });
      return h('div', { class: 'kb-row' }, h('div', {}, label), slider);
    };
    const audioPanel = h('div', { class: 'panel' },
      h('h2', {}, '🔊 ', t('set_audio')),
      mkSlider(t('set_master'), 'master', () => audio.setVolumes(state.settings.master, state.settings.music, state.settings.sfx)),
      mkSlider(t('set_music'), 'music', () => audio.setVolumes(state.settings.master, state.settings.music, state.settings.sfx)),
      mkSlider(t('set_sfx'), 'sfx', () => audio.setVolumes(state.settings.master, state.settings.music, state.settings.sfx))
    );
    // Langue
    const langPanel = h('div', { class: 'panel' },
      h('h2', {}, '🌐 ', t('set_lang')),
      h('div', { class: 'row' },
        h('button', {
          class: `btn small ${u.lang === 'fr' ? 'primary' : ''}`, onclick: async () => {
            setLang('fr'); state.user.lang = 'fr';
            await api.post('/api/me/settings', { lang: 'fr', settings: state.settings });
            this.showLobby('settings');
          }
        }, '🇫🇷 Français'),
        h('button', {
          class: `btn small ${u.lang === 'en' ? 'primary' : ''}`, onclick: async () => {
            setLang('en'); state.user.lang = 'en';
            await api.post('/api/me/settings', { lang: 'en', settings: state.settings });
            this.showLobby('settings');
          }
        }, '🇬🇧 English')
      )
    );
    // Touches
    const ACTIONS = [['up', t('bind_up')], ['down', t('bind_down')], ['left', t('bind_left')], ['right', t('bind_right')],
      ['attack', t('bind_attack')], ['interact', t('bind_interact')], ['special', t('bind_special')],
      ['map', t('bind_map')], ['emote', t('bind_emote')]];
    const kbPanel = h('div', { class: 'panel' },
      h('h2', {}, '⌨ ', t('set_keybinds')),
      h('div', { class: 'muted', style: { marginBottom: '8px' } }, t('set_key_hint'))
    );
    for (const [action, label] of ACTIONS) {
      const keyBtn = h('button', { class: 'kb-key' }, (state.keybinds[action][0] || '').replace('Key', '').replace('Arrow', ''));
      keyBtn.addEventListener('click', () => {
        keyBtn.classList.add('listening');
        keyBtn.textContent = '…';
        const onKey = (e) => {
          e.preventDefault();
          e.stopPropagation();
          setKeybind(action, e.code);
          keyBtn.textContent = e.code.replace('Key', '').replace('Arrow', '');
          keyBtn.classList.remove('listening');
          window.removeEventListener('keydown', onKey, true);
        };
        window.addEventListener('keydown', onKey, true);
      });
      kbPanel.append(h('div', { class: 'kb-row' }, h('div', {}, label), keyBtn));
    }
    kbPanel.append(h('button', { class: 'btn small', style: { marginTop: '10px' }, onclick: () => { resetKeybinds(); this.showLobby('settings'); } }, '↺ ', t('reset_binds')));
    // Affichage
    const zoomSlider = h('input', { type: 'range', min: 0.7, max: 1.8, step: 0.05, value: String(state.settings.zoom ?? 1.1), class: 'slider' });
    zoomSlider.addEventListener('input', () => { state.settings.zoom = parseFloat(zoomSlider.value); persistSettings(); });
    const displayPanel = h('div', { class: 'panel' },
      h('h2', {}, '🖥 ', t('set_display')),
      h('div', { class: 'kb-row' }, h('div', {}, t('set_zoom')), zoomSlider),
      h('div', { class: 'muted' }, '📱 ', 'Mobile paysage · PWA installable')
    );
    content.append(audioPanel, langPanel, kbPanel, displayPanel);
  }
}

/* Enregistrement des écrans */
screenRenderers = {
  play: Screens.prototype.renderPlay,
  shop: Screens.prototype.renderShop,
  fighters: Screens.prototype.renderFighters,
  friends: Screens.prototype.renderFriends,
  clans: Screens.prototype.renderClans,
  pass: Screens.prototype.renderPass,
  quests: Screens.prototype.renderQuests,
  news: Screens.prototype.renderNews,
  gifts: Screens.prototype.renderGifts,
  leaderboard: Screens.prototype.renderLeaderboard,
  settings: Screens.prototype.renderSettings
};

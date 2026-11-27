// src/admin/AdminPanel.js — Panneau d'administration : joueurs, parties, règles,
// fighters, boutique, quêtes, pass, news, clans, cadeaux, notifications, sons
// (synthèse/fichier par son) et logs. Toutes les actions passent par l'API admin.
import { h, clear, toast } from '../ui/dom.js';
import { t } from '../ui/i18n.js';
import { api } from '../ui/api.js';
import { audio } from '../audio/AudioManager.js';
import { MapEditor } from './MapEditor.js';
import { SkinEditor } from './SkinEditor.js';

export class AdminPanel {
  constructor(root, { onExit }) {
    this.root = h('div', { class: 'scene' });
    root.append(this.root);
    this.onExit = onExit;
    this.current = 'players';
  }

  async show(tab = 'players') {
    this.current = tab;
    clear(this.root);
    const TABS = [
      ['players', `👥 ${t('adm_players')}`], ['rooms', `🎮 ${t('adm_rooms')}`], ['config', `⚖ ${t('adm_config')}`],
      ['maps', `🗺 ${t('adm_maps')}`], ['fighters', `🥊 ${t('adm_fighters')}`], ['skins', `🎨 ${t('adm_skins')}`],
      ['textures', `🖼 ${t('adm_textures')}`], ['shop', `🛒 ${t('adm_shop')}`], ['quests', `📜 ${t('adm_quests')}`],
      ['pass', `🎟 ${t('adm_pass')}`], ['news', `📰 ${t('adm_news')}`], ['clans', `🛡 ${t('adm_clans')}`],
      ['gifts', `🎁 ${t('adm_gifts')}`], ['notifs', `🔔 ${t('adm_notifs')}`], ['sounds', `🔊 ${t('adm_sounds')}`],
      ['logs', `📋 ${t('adm_logs')}`]
    ];
    const tabsRow = h('div', { class: 'admin-tabs' });
    for (const [id, label] of TABS) {
      tabsRow.append(h('button', {
        class: this.current === id ? 'active' : '',
        onclick: () => { audio.play('click'); this.show(id); }
      }, label));
    }
    const content = h('div', { class: 'content' });
    this.root.append(
      h('div', { class: 'topbar' },
        h('div', { class: 'logo' }, '🛠 ADMIN'),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn small', onclick: () => this.onExit() }, '← Lobby')
      ),
      h('div', { style: { display: 'flex', flexDirection: 'column', height: 'calc(100% - 48px)', padding: '10px 14px' } },
        tabsRow, content)
    );
    clear(content);
    try {
      const fn = this[`render_${this.current}`];
      if (fn) await fn.call(this, content);
    } catch (e) {
      content.append(h('div', { class: 'panel' }, t('server_error'), ` — ${e.message || e.code}`));
    }
  }

  /* ================= Joueurs ================= */

  async render_players(content) {
    const qInput = h('input', { placeholder: t('search'), maxlength: 16, style: { maxWidth: '220px' } });
    const listWrap = h('div');
    const load = async () => {
      const d = await api.get(`/api/admin/players?q=${encodeURIComponent(qInput.value)}`);
      clear(listWrap);
      const tbl = h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {},
          h('th', {}, '#'), h('th', {}, t('auth_uname')), h('th', {}, t('trophies')), h('th', {}, t('level')),
          h('th', {}, '🔩/💠'), h('th', {}, 'Stats'), h('th', {}, 'Statut'), h('th', {}, '')
        )),
        h('tbody', {}, d.players.map(p => {
          const status = p.banned ? '⛔ BANNI' : (p.suspended_until ? '⏸ SUSPENDU' : (p.is_admin ? '★ ADMIN' : 'OK'));
          return h('tr', {},
            h('td', {}, String(p.id)),
            h('td', { style: { fontWeight: 700 } }, p.uname + (p.is_admin ? ' ★' : '')),
            h('td', {}, String(p.trophies)),
            h('td', {}, `${p.level} (${p.xp})`),
            h('td', {}, `${p.coins}/${p.cores}`),
            h('td', {}, `${p.wins}W ${p.kills}K`),
            h('td', {}, h('span', { style: { color: p.banned ? '#ff5d5d' : p.is_admin ? '#7fff6a' : 'inherit' } }, status)),
            h('td', {}, h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
              h('button', { class: 'btn small', onclick: () => this.editPlayer(p) }, '✏'),
              p.banned
                ? h('button', { class: 'btn small', onclick: async () => { await api.post(`/api/admin/players/${p.id}/ban`, { banned: false }); load(); } }, t('unban'))
                : h('button', { class: 'btn small danger', onclick: async () => { await api.post(`/api/admin/players/${p.id}/ban`, { banned: true }); load(); } }, t('ban')),
              h('button', {
                class: 'btn small', onclick: async () => {
                  const hours = prompt('Suspendre (heures) :', '24');
                  if (hours) { await api.post(`/api/admin/players/${p.id}/suspend`, { hours: parseInt(hours, 10) }); load(); }
                }
              }, '⏸'),
              h('button', {
                class: 'btn small', onclick: async () => {
                  try {
                    await api.post(`/api/admin/players/${p.id}/admin`, { is_admin: !p.is_admin });
                    load();
                  } catch (e) { toast(e.message, 'error'); }
                }
              }, p.is_admin ? t('remove_admin') : t('make_admin'))
            ))
          );
        }))
      );
      listWrap.append(h('div', { class: 'panel tbl-wrap' }, tbl));
    };
    qInput.addEventListener('input', () => load());
    await load();
    content.append(h('div', { class: 'panel' }, h('h2', {}, `👥 ${t('adm_players')}`),
      h('div', { class: 'row' }, qInput), listWrap));
  }

  editPlayer(p) {
    const mk = (label, val) => { const i = h('input', { value: String(val ?? '') }); return [h('label', {}, label), i, i]; };
    const [l1, u1, uname] = mk(t('auth_uname'), p.uname);
    const [l2, u2, trophies] = mk(t('trophies'), p.trophies);
    const [l3, u3, level] = mk(t('level'), p.level);
    const [l4, u4, xp] = mk('XP', p.xp);
    const [l5, u5, coins] = mk('🔩 ' + t('coins'), p.coins);
    const [l6, u6, cores] = mk('💠 ' + t('cores'), p.cores);
    const [l7, u7, wins] = mk(t('wins'), p.wins);
    const [l8, u8, kills] = mk(t('kills'), p.kills);
    const grantType = h('select', {},
      h('option', { value: 'coins' }, '🔩 coins'), h('option', { value: 'cores' }, '💠 cores'),
      h('option', { value: 'xp' }, 'XP'), h('option', { value: 'skin' }, 'skin'),
      h('option', { value: 'emote' }, 'emote'), h('option', { value: 'tag' }, 'tag'),
      h('option', { value: 'fx' }, 'fx'), h('option', { value: 'item' }, 'item'));
    const grantId = h('input', { placeholder: 'id (ex: emote_gg)' });
    const grantQty = h('input', { type: 'number', value: '1', min: 1, style: { width: '70px' } });
    const modal = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === modal) modal.remove(); } },
      h('div', { class: 'modal' },
        h('h3', {}, `✏ ${p.uname}`),
        h('div', { class: 'field' }, l1, uname), h('div', { class: 'field' }, l2, trophies),
        h('div', { class: 'field' }, l3, level), h('div', { class: 'field' }, l4, xp),
        h('div', { class: 'field' }, l5, coins), h('div', { class: 'field' }, l6, cores),
        h('div', { class: 'field' }, l7, wins), h('div', { class: 'field' }, l8, kills),
        h('h3', {}, `🎁 ${t('grant')}`),
        h('div', { class: 'row' }, grantType, grantId, grantQty),
        h('div', { class: 'row', style: { marginTop: '14px' } },
          h('button', {
            class: 'btn primary', onclick: async () => {
              try {
                await api.put(`/api/admin/players/${p.id}`, {
                  uname: uname.value, trophies: trophies.value, level: level.value, xp: xp.value,
                  coins: coins.value, cores: cores.value, wins: wins.value, kills: kills.value
                });
                if (grantType.value) {
                  await api.post(`/api/admin/players/${p.id}/grant`, { type: grantType.value, itemId: grantId.value, qty: grantQty.value });
                }
                toast('✓ ' + t('save'));
                modal.remove();
                this.show('players');
              } catch (e) { toast(e.message, 'error'); }
            }
          }, '💾 ', t('save')),
          h('button', { class: 'btn', onclick: () => modal.remove() }, t('close'))
        )
      )
    );
    document.body.append(modal);
  }

  /* ================= Parties ================= */

  async render_rooms(content) {
    const rooms = await api.get('/api/admin/rooms');
    const matches = await api.get('/api/admin/matches');
    content.append(h('div', { class: 'panel' },
      h('h2', {}, '🎮 Parties en cours'),
      rooms.rooms.length ? h('div', {}, rooms.rooms.map(r => h('div', { class: 'row', style: { marginBottom: '6px' } },
        h('div', { class: 'chip' }, r.id),
        h('span', { class: 'muted' }, `map ${r.mapId} · ${r.phase} · ${r.humans} humain(s) · ${r.players} entités${r.testMode ? ' · TEST' : ''}`)
      ))) : h('div', { class: 'muted' }, t('none'))
    ));
    const tbl = h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Map'), h('th', {}, 'Fin'), h('th', {}, 'Vainqueur'), h('th', {}, 'Joueurs'))),
      h('tbody', {}, matches.matches.map(m => h('tr', {},
        h('td', {}, String(m.id)),
        h('td', {}, m.map_id),
        h('td', {}, new Date(m.ended_at).toLocaleString()),
        h('td', {}, m.winner_type),
        h('td', {}, m.players.map(p => `${p.uname}${p.is_bot ? '🤖' : ''} (${p.kills}K/${p.tasks_done}T${p.won ? ' 🏆' : ''})`).join(', '))
      )))
    );
    content.append(h('div', { class: 'panel tbl-wrap' }, h('h2', {}, '📋 Historique'), tbl));
  }

  /* ================= Règles ================= */

  async render_config(content) {
    const d = await api.get('/api/admin/config');
    const inputs = {};
    const GROUPS = [
      ['Partie', ['maxPlayers', 'fillBots', 'botDifficulty', 'minHumansToStart', 'lobbyCountdownS']],
      ['Intoxication', ['repairTimeS', 'radiationAlertS', 'radiationGraceS', 'radiationArmorDrain', 'radiationDamage']],
      ['Armure', ['armorMax', 'startArmor', 'killArmorBonus', 'taskArmorBonus']],
      ['Évacuation', ['evacTimeS']],
      ['Récompenses', ['killCoins', 'taskCoins', 'winCoins', 'loseCoins', 'xpBase', 'xpKill', 'xpTask', 'xpWin', 'trophiesWin', 'trophiesLose', 'xpPerPassLevel']]
    ];
    for (const [group, keys] of GROUPS) {
      const panel = h('div', { class: 'panel' }, h('h2', {}, group));
      for (const key of keys) {
        const row = d.config.find(c => c.key === key);
        if (!row) continue;
        let input;
        if (typeof row.value === 'boolean') {
          input = h('select', {}, h('option', { value: 'true', selected: row.value }, 'true'), h('option', { value: 'false', selected: !row.value }, 'false'));
        } else if (key === 'botDifficulty') {
          input = h('select', {},
            ['easy', 'normal', 'hard'].map(v => h('option', { value: v, selected: row.value === v }, v)));
        } else {
          input = h('input', { value: String(row.value) });
        }
        inputs[key] = input;
        panel.append(h('div', { class: 'field' }, h('label', {}, key), input));
      }
      content.append(panel);
    }
    content.append(h('div', { class: 'panel' },
      h('button', {
        class: 'btn primary', onclick: async () => {
          const config = {};
          for (const [key, input] of Object.entries(inputs)) {
            let v = input.value;
            if (v === 'true') v = true; else if (v === 'false') v = false;
            else if (!isNaN(parseFloat(v)) && key !== 'botDifficulty') v = parseFloat(v);
            config[key] = v;
          }
          await api.put('/api/admin/config', { config });
          toast('✓ ' + t('save'));
        }
      }, '💾 ', t('save'))
    ));
  }

  /* ================= Maps ================= */

  async render_maps(content) {
    const d = await api.get('/api/admin/maps');
    const panel = h('div', { class: 'panel' }, h('h2', {}, '🗺 Maps'));
    for (const m of d.maps) {
      panel.append(h('div', { class: 'row', style: { marginBottom: '6px' } },
        h('div', { class: 'chip' }, `${m.id} — ${m.name}`),
        h('span', { class: `muted ${m.published ? '' : ''}` }, m.published ? '✅ publiée' : '📝 brouillon'),
        h('span', { class: 'muted' }, new Date(m.updated_at).toLocaleString()),
        h('div', { class: 'right row' },
          h('button', { class: 'btn small primary', onclick: () => { this.editor = new MapEditor(this.root, m.id, () => this.show('maps')); } }, '✏ ' + t('edit')),
          h('button', {
            class: 'btn small', onclick: async () => {
              await api.post('/api/admin/maps', { id: m.id + '_copy', duplicateOf: m.id });
              this.show('maps');
            }
          }, t('duplicate')),
          h('button', {
            class: 'btn small', onclick: async () => {
              await api.put(`/api/admin/maps/${m.id}`, { published: !m.published });
              this.show('maps');
            }
          }, m.published ? t('unpublish') : t('publish')),
          h('button', {
            class: 'btn small danger', onclick: async () => {
              if (!confirm(`Supprimer ${m.id} ?`)) return;
              await api.del(`/api/admin/maps/${m.id}`);
              this.show('maps');
            }
          }, '🗑')
        )
      ));
    }
    panel.append(h('div', { class: 'row', style: { marginTop: '10px' } },
      this.newMapInput = h('input', { placeholder: 'id nouvelle map (a-z0-9_)', maxlength: 32, style: { maxWidth: '240px' } }),
      h('button', {
        class: 'btn primary small', onclick: async () => {
          try {
            const res = await api.post('/api/admin/maps', { id: this.newMapInput.value });
            this.show('maps');
            this.editor = new MapEditor(this.root, res.id, () => this.show('maps'));
          } catch (e) { toast(e.message, 'error'); }
        }
      }, '＋ ', t('create'))
    ));
    content.append(panel);
  }

  /* ================= Fighters ================= */

  async render_fighters(content) {
    const d = await api.get('/api/admin/fighters');
    const panel = h('div', { class: 'panel' }, h('h2', {}, '🥊 Fighters'));
    for (const f of d.fighters) {
      const inputs = {};
      const row = h('div', { class: 'row', style: { alignItems: 'flex-end', marginBottom: '8px', borderBottom: '1px solid var(--line)', paddingBottom: '8px' } });
      const mkField = (label, key, width = '70px') => {
        const i = h('input', { value: String(f[key] ?? ''), style: { width } });
        inputs[key] = i;
        row.append(h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', {}, label), i));
      };
      row.append(h('div', { class: 'chip' }, f.id));
      mkField('Nom', 'name', '90px');
      mkField('HP', 'hp'); mkField('Dmg', 'damage'); mkField('Speed', 'speed');
      mkField('Range', 'attack_range'); mkField('Cd', 'attack_cooldown');
      mkField('Special', 'special', '90px'); mkField('SpCd', 'special_cd');
      mkField('Prix', 'price'); mkField('Cur', 'currency', '60px'); mkField('Rare', 'rarity', '80px');
      row.append(
        h('button', {
          class: 'btn small primary', onclick: async () => {
            const body = {};
            for (const [k, i] of Object.entries(inputs)) body[k] = i.value;
            body.published = f.published;
            await api.put(`/api/admin/fighters/${f.id}`, body);
            toast('✓ ' + f.id);
          }
        }, '💾'),
        h('button', {
          class: 'btn small', onclick: async () => {
            await api.put(`/api/admin/fighters/${f.id}`, { published: f.published ? 0 : 1 });
            this.show('fighters');
          }
        }, f.published ? t('unpublish') : t('publish'))
      );
      panel.append(row);
    }
    // création
    const idI = h('input', { placeholder: 'id', style: { width: '100px' } });
    const nameI = h('input', { placeholder: 'Nom', style: { width: '110px' } });
    panel.append(h('div', { class: 'row', style: { marginTop: '10px' } },
      idI, nameI,
      h('button', {
        class: 'btn primary small', onclick: async () => {
          try {
            await api.post('/api/admin/fighters', { id: idI.value, name: nameI.value, name_en: nameI.value, description: '', description_en: '' });
            this.show('fighters');
          } catch (e) { toast(e.message, 'error'); }
        }
      }, '＋ ', t('create'))
    ));
    content.append(panel);
  }

  /* ================= Skins (éditeur) ================= */

  async render_skins(content) {
    const d = await api.get('/api/admin/skins');
    const panel = h('div', { class: 'panel' }, h('h2', {}, '🎨 Skins'));
    for (const s of d.skins) {
      panel.append(h('div', { class: 'row', style: { marginBottom: '6px' } },
        h('div', { class: 'chip' }, `${s.id} (${s.fighter_id})`),
        h('span', { class: `rarity ${s.rarity}` }, s.rarity),
        h('span', { class: 'muted' }, s.published ? '✅' : '📝'),
        h('div', { class: 'right row' },
          h('button', { class: 'btn small primary', onclick: () => { this.skinEd = new SkinEditor(this.root, s.id, s.fighter_id, s.data, () => this.show('skins')); } }, '✏ ' + t('edit')),
          h('button', {
            class: 'btn small', onclick: async () => {
              await api.put(`/api/admin/skins/${s.id}`, { published: !s.published });
              this.show('skins');
            }
          }, s.published ? t('unpublish') : t('publish')),
          h('button', {
            class: 'btn small danger', onclick: async () => {
              if (!confirm(`Supprimer ${s.id} ?`)) return;
              await api.del(`/api/admin/skins/${s.id}`);
              this.show('skins');
            }
          }, '🗑')
        )
      ));
    }
    panel.append(h('div', { class: 'row', style: { marginTop: '10px' } },
      this.newSkinId = h('input', { placeholder: 'id skin', maxlength: 64, style: { maxWidth: '160px' } }),
      this.newSkinFighter = h('select', {}, (await api.get('/api/admin/fighters')).fighters.map(f => h('option', { value: f.id }, f.id))),
      h('button', {
        class: 'btn primary small', onclick: () => {
          const id = this.newSkinId.value.trim();
          if (!id) return;
          this.skinEd = new SkinEditor(this.root, id, this.newSkinFighter.value, null, () => this.show('skins'));
        }
      }, '＋ ' + t('create'))
    ));
    content.append(panel);
  }

  /* ================= Textures ================= */

  async render_textures(content) {
    const d = await api.get('/api/admin/textures');
    const nameInput = h('input', { placeholder: 'nom', maxlength: 60, style: { maxWidth: '160px' } });
    const catInput = h('select', {}, ['misc', 'tiles', 'walls', 'machines', 'characters', 'ui', 'news'].map(c => h('option', { value: c }, c)));
    const fileInput = h('input', { type: 'file', accept: '.png,.webp,.jpg' });
    const panel = h('div', { class: 'panel' },
      h('h2', {}, '🖼 Textures'),
      h('div', { class: 'row' }, nameInput, catInput, fileInput,
        h('button', {
          class: 'btn primary small', onclick: async () => {
            const file = fileInput.files[0];
            if (!file) { toast('Choisissez un fichier', 'error'); return; }
            if (file.size > 300 * 1024) { toast('Fichier > 300 Ko', 'error'); return; }
            const reader = new FileReader();
            reader.onload = async () => {
              try {
                await api.post('/api/admin/textures', { data: reader.result, name: nameInput.value, category: catInput.value });
                toast('✓ Upload');
                this.show('textures');
              } catch (e) { toast(e.message, 'error'); }
            };
            reader.readAsDataURL(file);
          }
        }, '📤 ', t('upload_file'))
      )
    );
    const grid = h('div', { class: 'cards', style: { marginTop: '12px' } });
    for (const tx of d.textures) {
      grid.append(h('div', { class: 'card' },
        h('img', { src: `/api/textures/${tx.id}/raw`, style: { width: '100%', imageRendering: 'pixelated', borderRadius: '6px', maxHeight: '120px', objectFit: 'contain', background: '#0d130f' } }),
        h('div', { class: 'card-title' }, tx.name),
        h('div', { class: 'muted' }, `${tx.category} · ${tx.mime} · ${(tx.size / 1024).toFixed(1)} Ko · ${tx.published ? '✅' : '📝'}`),
        h('div', { class: 'row' },
          h('button', {
            class: 'btn small', onclick: async () => {
              await api.put(`/api/admin/textures/${tx.id}`, { published: !tx.published });
              this.show('textures');
            }
          }, tx.published ? t('unpublish') : t('publish')),
          h('button', {
            class: 'btn small danger', onclick: async () => {
              await api.del(`/api/admin/textures/${tx.id}`);
              this.show('textures');
            }
          }, '🗑')
        )
      ));
    }
    panel.append(grid);
    content.append(panel);
  }

  /* ================= Boutique ================= */

  async render_shop(content) {
    const d = await api.get('/api/admin/shop');
    const panel = h('div', { class: 'panel' }, h('h2', {}, '🛒 Boutique'));
    for (const it of d.items) {
      panel.append(h('div', { class: 'row', style: { marginBottom: '6px', borderBottom: '1px solid var(--line)', paddingBottom: '6px' } },
        h('div', { class: 'chip' }, it.id),
        h('span', { class: 'muted' }, `${it.category} · ${it.rarity} · ${it.price} ${it.currency}`),
        h('span', { class: 'muted' }, it.available ? '✅' : '🚫'),
        h('button', {
          class: 'btn small right', onclick: async () => {
            await api.put(`/api/admin/shop/${it.id}`, { available: !it.available });
            this.show('shop');
          }
        }, it.available ? '🚫' : '✅'),
        h('button', {
          class: 'btn small danger', onclick: async () => {
            if (!confirm(`Supprimer ${it.id} ?`)) return;
            await api.del(`/api/admin/shop/${it.id}`);
            this.show('shop');
          }
        }, '🗑')
      ));
    }
    const idI = h('input', { placeholder: 'id', style: { width: '130px' } });
    const nameI = h('input', { placeholder: 'nom', style: { width: '130px' } });
    const catI = h('select', {}, ['skins', 'emotes', 'tags', 'effects', 'cosmetics'].map(c => h('option', { value: c }, c)));
    const priceI = h('input', { type: 'number', value: '100', style: { width: '80px' } });
    const curI = h('select', {}, h('option', { value: 'coins' }, 'coins'), h('option', { value: 'cores' }, 'cores'));
    const payloadI = h('input', { placeholder: 'payload (ex: {"text":"GG"})', style: { width: '200px' } });
    panel.append(h('div', { class: 'row', style: { marginTop: '10px' } },
      idI, nameI, catI, priceI, curI, payloadI,
      h('button', {
        class: 'btn primary small', onclick: async () => {
          try {
            let payload = {};
            try { payload = payloadI.value ? JSON.parse(payloadI.value) : {}; } catch { payload = {}; }
            await api.post('/api/admin/shop', { id: idI.value, name: nameI.value, name_en: nameI.value, category: catI.value, price: priceI.value, currency: curI.value, payload });
            this.show('shop');
          } catch (e) { toast(e.message, 'error'); }
        }
      }, '＋ ', t('create'))
    ));
    content.append(panel);
  }

  /* ================= Quêtes ================= */

  async render_quests(content) {
    const d = await api.get('/api/admin/quests');
    const panel = h('div', { class: 'panel' }, h('h2', {}, '📜 Quêtes'));
    for (const q of d.quests) {
      const goalI = h('input', { type: 'number', value: String(q.goal), style: { width: '70px' } });
      panel.append(h('div', { class: 'row', style: { marginBottom: '6px' } },
        h('div', { class: 'chip' }, `${q.icon} ${q.id}`),
        h('span', { class: 'muted' }, `${q.type} · ${q.stat} · ⭐${q.reward_xp} 🔩${q.reward_coins}${q.reward_cores ? ' 💠' + q.reward_cores : ''}`),
        goalI,
        h('button', {
          class: 'btn small primary', onclick: async () => {
            await api.put(`/api/admin/quests/${q.id}`, { goal: goalI.value });
            toast('✓');
          }
        }, '💾'),
        h('button', {
          class: 'btn small danger', onclick: async () => {
            if (!confirm(`Supprimer ${q.id} ?`)) return;
            await api.del(`/api/admin/quests/${q.id}`);
            this.show('quests');
          }
        }, '🗑')
      ));
    }
    const idI = h('input', { placeholder: 'id', style: { width: '140px' } });
    const nameI = h('input', { placeholder: 'nom', style: { width: '150px' } });
    const typeI = h('select', {}, ['daily', 'weekly', 'seasonal'].map(x => h('option', { value: x }, x)));
    const statI = h('select', {}, ['kills', 'tasks', 'wins', 'matches', 'damage'].map(x => h('option', { value: x }, x)));
    const goalI = h('input', { type: 'number', value: '3', style: { width: '60px' } });
    panel.append(h('div', { class: 'row', style: { marginTop: '10px' } },
      idI, nameI, typeI, statI, goalI,
      h('button', {
        class: 'btn primary small', onclick: async () => {
          try {
            await api.post('/api/admin/quests', { id: idI.value, name: nameI.value, name_en: nameI.value, type: typeI.value, stat: statI.value, goal: goalI.value });
            this.show('quests');
          } catch (e) { toast(e.message, 'error'); }
        }
      }, '＋ ', t('create'))
    ));
    content.append(panel);
  }

  /* ================= Pass ================= */

  async render_pass(content) {
    const d = await api.get('/api/admin/pass');
    const panel = h('div', { class: 'panel' }, h('h2', {}, '🎟 Pass — 50 niveaux'));
    const tbl = h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Niv.'), h('th', {}, 'Type'), h('th', {}, 'ID'), h('th', {}, 'Qté'), h('th', {}, ''))),
      h('tbody', {}, d.rewards.map(rw => {
        const typeI = h('select', {}, ['coins', 'cores', 'xp', 'skin', 'emote', 'tag', 'fx', 'item'].map(x => h('option', { value: x, selected: rw.type === x }, x)));
        const idI = h('input', { value: rw.id || '', style: { width: '140px' } });
        const qtyI = h('input', { type: 'number', value: String(rw.qty), style: { width: '60px' } });
        return h('tr', {},
          h('td', { style: { fontWeight: 700, color: 'var(--gold)' } }, String(rw.level)),
          h('td', {}, typeI), h('td', {}, idI), h('td', {}, qtyI),
          h('td', {}, h('button', {
            class: 'btn small primary', onclick: async () => {
              await api.put(`/api/admin/pass/${rw.level}`, { type: typeI.value, id: idI.value, qty: qtyI.value });
              toast(`✓ Niveau ${rw.level}`);
            }
          }, '💾'))
        );
      }))
    );
    panel.append(h('div', { class: 'tbl-wrap', style: { maxHeight: '420px', overflowY: 'auto' } }, tbl));
    content.append(panel);
  }

  /* ================= News ================= */

  async render_news(content) {
    const d = await api.get('/api/admin/news');
    const panel = h('div', { class: 'panel' }, h('h2', {}, '📰 Nouveautés'));
    const titleI = h('input', { placeholder: 'titre', style: { width: '200px' } });
    const bodyI = h('textarea', { placeholder: 'contenu', rows: 3, style: { width: '100%' } });
    const imageI = h('input', { placeholder: 'id texture (optionnel)', style: { width: '160px' } });
    panel.append(h('div', { class: 'col' }, titleI, bodyI, imageI,
      h('div', { class: 'row' },
        h('button', {
          class: 'btn primary small', onclick: async () => {
            await api.post('/api/admin/news', { title: titleI.value, body: bodyI.value, image: imageI.value || null, published: true });
            this.show('news');
          }
        }, '＋ ', t('publish'))
      )));
    for (const n of d.news) {
      panel.append(h('div', { class: 'row', style: { marginTop: '8px', borderTop: '1px solid var(--line)', paddingTop: '8px' } },
        h('div', { class: 'grow' }, h('b', {}, n.title), h('div', { class: 'muted' }, (n.body || '').slice(0, 90))),
        h('span', { class: 'muted' }, n.published ? '✅' : '📝'),
        h('button', {
          class: 'btn small', onclick: async () => {
            await api.put(`/api/admin/news/${n.id}`, { published: !n.published });
            this.show('news');
          }
        }, n.published ? t('unpublish') : t('publish')),
        h('button', {
          class: 'btn small danger', onclick: async () => {
            await api.del(`/api/admin/news/${n.id}`);
            this.show('news');
          }
        }, '🗑')
      ));
    }
    content.append(panel);
  }

  /* ================= Clans ================= */

  async render_clans(content) {
    const d = await api.get('/api/admin/clans');
    const panel = h('div', { class: 'panel' }, h('h2', {}, '🛡 Clans'));
    for (const c of d.clans) {
      const troI = h('input', { type: 'number', value: String(c.trophies), style: { width: '80px' } });
      panel.append(h('div', { class: 'row', style: { marginBottom: '6px' } },
        h('div', { class: 'chip' }, `${c.emblem} ${c.name} [${c.tag}]`),
        h('span', { class: 'muted' }, `${c.members} membres`),
        troI,
        h('button', {
          class: 'btn small primary', onclick: async () => {
            await api.put(`/api/admin/clans/${c.id}`, { trophies: troI.value });
            toast('✓');
          }
        }, '💾'),
        h('button', {
          class: 'btn small danger', onclick: async () => {
            if (!confirm(`Supprimer le clan ${c.name} ?`)) return;
            await api.del(`/api/admin/clans/${c.id}`);
            this.show('clans');
          }
        }, '🗑')
      ));
    }
    content.append(panel);
  }

  /* ================= Cadeaux ================= */

  async render_gifts(content) {
    const d = await api.get('/api/admin/gifts');
    const players = await api.get('/api/admin/players');
    const panel = h('div', { class: 'panel' }, h('h2', {}, '🎁 Cadeaux'));
    const titleI = h('input', { placeholder: 'titre', style: { width: '180px' } });
    const msgI = h('input', { placeholder: 'message', style: { width: '200px' } });
    const typeI = h('select', {}, ['coins', 'cores', 'xp', 'trophies', 'skin', 'emote', 'tag', 'fx', 'item'].map(x => h('option', { value: x }, x)));
    const idI = h('input', { placeholder: 'id (item/skin…)', style: { width: '130px' } });
    const qtyI = h('input', { type: 'number', value: '100', style: { width: '70px' } });
    const targetI = h('select', {},
      h('option', { value: 'all' }, '🌍 Tous les joueurs'),
      players.players.map(p => h('option', { value: p.id }, p.uname)));
    const expiryI = h('input', { type: 'date' });
    panel.append(h('div', { class: 'col' },
      h('div', { class: 'row' }, titleI, msgI),
      h('div', { class: 'row' }, typeI, idI, qtyI, targetI, expiryI),
      h('div', { class: 'row' },
        h('button', {
          class: 'btn primary small', onclick: async () => {
            try {
              await api.post('/api/admin/gifts', {
                title: titleI.value || 'Cadeau', message: msgI.value,
                reward_type: typeI.value, reward_id: idI.value, qty: qtyI.value,
                targets: targetI.value === 'all' ? 'all' : [parseInt(targetI.value, 10)],
                expires_at: expiryI.value ? new Date(expiryI.value).toISOString() : null
              });
              toast('✓ Cadeau créé');
              this.show('gifts');
            } catch (e) { toast(e.message, 'error'); }
          }
        }, '🎁 ' + t('create'))
      )));
    for (const g of d.gifts) {
      panel.append(h('div', { class: 'row', style: { marginTop: '8px', borderTop: '1px solid var(--line)', paddingTop: '8px' } },
        h('div', { class: 'grow' }, h('b', {}, `🎁 ${g.title}`),
          h('div', { class: 'muted' }, `${g.reward_type} ${g.reward_id || ''} ×${g.qty} · ${g.targets === 'all' ? '🌍 tous' : '🎯 ciblé'} · réclamés: ${g.claimed}`)),
        h('button', {
          class: 'btn small danger', onclick: async () => {
            await api.del(`/api/admin/gifts/${g.id}`);
            this.show('gifts');
          }
        }, '🗑')
      ));
    }
    content.append(panel);
  }

  /* ================= Notifications ================= */

  async render_notifs(content) {
    const titleI = h('input', { placeholder: 'titre', style: { width: '200px' } });
    const bodyI = h('input', { placeholder: 'message', style: { width: '260px' } });
    const targetI = h('select', {},
      h('option', { value: 'all' }, '🌍 Tous'),
      (await api.get('/api/admin/players')).players.map(p => h('option', { value: p.id }, p.uname)));
    const panel = h('div', { class: 'panel' }, h('h2', {}, '🔔 Notifications'),
      h('div', { class: 'col' },
        h('div', { class: 'row' }, titleI, bodyI, targetI),
        h('div', { class: 'row' },
          h('button', {
            class: 'btn primary small', onclick: async () => {
              await api.post('/api/admin/notifications', {
                userId: targetI.value === 'all' ? 'all' : parseInt(targetI.value, 10),
                title: titleI.value, body: bodyI.value
              });
              toast('✓ Envoyé');
            }
          }, '📤 Envoyer')
        )
      ));
    content.append(panel);
  }

  /* ================= Sons (synthèse / fichier par son) ================= */

  async render_sounds(content) {
    const d = await api.get('/api/admin/sounds');
    const panel = h('div', { class: 'panel' }, h('h2', {}, '🔊 Sons — mode par son'));
    panel.append(h('div', { class: 'muted', style: { marginBottom: '10px' } },
      'Chaque son peut basculer indépendamment entre synthèse WebAudio (paramétrable) et fichier audio importé.'));

    for (const s of d.sounds) {
      const row = h('div', { class: 'row', style: { marginBottom: '10px', borderBottom: '1px solid var(--line)', paddingBottom: '10px', alignItems: 'flex-end', flexWrap: 'wrap' } });
      row.append(h('div', { class: 'chip', style: { minWidth: '130px' } }, `${s.id}`));

      // mode
      const modeI = h('select', {},
        h('option', { value: 'synth', selected: s.mode === 'synth' }, t('sound_synth')),
        h('option', { value: 'file', selected: s.mode === 'file', disabled: !s.file_size }, t('sound_file') + (s.file_size ? '' : ' (aucun fichier)')));
      row.append(h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', {}, t('sound_mode')), modeI));

      // upload fichier
      const fileI = h('input', { type: 'file', accept: '.ogg,.mp3,.wav', style: { maxWidth: '180px' } });
      row.append(h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', {}, t('upload_file')), fileI));

      // params synthèse
      const p = s.params || {};
      const typeI = h('select', {}, ['square', 'sine', 'sawtooth', 'triangle'].map(x => h('option', { value: x, selected: (p.type || 'square') === x }, x)));
      const freqI = h('input', { type: 'number', value: String(p.freq ?? 440), style: { width: '70px' } });
      const freq2I = h('input', { type: 'number', value: String(p.freq2 ?? 220), style: { width: '70px' } });
      const durI = h('input', { type: 'number', step: '0.05', value: String(p.dur ?? 0.15), style: { width: '60px' } });
      const volI = h('input', { type: 'number', step: '0.05', value: String(p.vol ?? 0.4), style: { width: '60px' } });
      row.append(
        h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', {}, 'type'), typeI),
        h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', {}, 'freq→freq2'), freqI, freq2I),
        h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', {}, 'dur'), durI),
        h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', {}, 'vol'), volI)
      );

      // écouter (mode courant, avec params édités)
      row.append(h('button', {
        class: 'btn small', onclick: () => {
          audio.setSynthParams(s.id, { type: typeI.value, freq: parseFloat(freqI.value), freq2: parseFloat(freq2I.value), dur: parseFloat(durI.value), vol: parseFloat(volI.value), noise: s.id === 'repair' ? 0.4 : 0.1 });
          audio.soundModes[s.id] = 'synth'; // écoute la synthèse éditée
          audio.resume();
          audio.play(s.id);
        }
      }, '🔊 ' + t('play_sound')));

      // sauvegarder
      row.append(h('button', {
        class: 'btn small primary', onclick: async () => {
          try {
            const file = fileI.files[0];
            if (file) {
              if (file.size > 400 * 1024) { toast('Fichier > 400 Ko', 'error'); return; }
              const reader = new FileReader();
              reader.onload = async () => {
                await api.post(`/api/admin/sounds/${s.id}/file`, { data: reader.result });
                await api.put(`/api/admin/sounds/${s.id}`, {
                  mode: modeI.value,
                  params: { type: typeI.value, freq: parseFloat(freqI.value), freq2: parseFloat(freq2I.value), dur: parseFloat(durI.value), vol: parseFloat(volI.value) }
                });
                toast(`✓ ${s.id} → fichier`);
                this.show('sounds');
              };
              reader.readAsDataURL(file);
            } else {
              await api.put(`/api/admin/sounds/${s.id}`, {
                mode: modeI.value,
                params: { type: typeI.value, freq: parseFloat(freqI.value), freq2: parseFloat(freq2I.value), dur: parseFloat(durI.value), vol: parseFloat(volI.value) }
              });
              toast(`✓ ${s.id} → ${modeI.value}`);
              this.show('sounds');
            }
          } catch (e) { toast(e.message, 'error'); }
        }
      }, '💾 ' + t('save')));
      panel.append(row);
    }
    panel.append(h('button', {
      class: 'btn small', onclick: () => { location.reload(); }
    }, '↺ Recharger l\'audio client'));
    content.append(panel);
  }

  /* ================= Logs ================= */

  async render_logs(content) {
    const d = await api.get('/api/admin/logs');
    const panel = h('div', { class: 'panel' }, h('h2', {}, '📋 Actions admin'));
    if (!d.logs.length) panel.append(h('div', { class: 'muted' }, t('no_logs')));
    const tbl = h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Admin'), h('th', {}, 'Action'), h('th', {}, 'Cible'), h('th', {}, t('old_value')), h('th', {}, t('new_value')))),
      h('tbody', {}, d.logs.map(l => h('tr', {},
        h('td', {}, new Date(l.created_at).toLocaleString()),
        h('td', { style: { fontWeight: 700 } }, l.admin_uname),
        h('td', {}, l.action),
        h('td', {}, `${l.target_type}#${l.target_id}`),
        h('td', { class: 'muted' }, JSON.stringify(l.old_value)?.slice(0, 60) || '—'),
        h('td', { class: 'muted' }, JSON.stringify(l.new_value)?.slice(0, 60) || '—')
      )))
    );
    panel.append(h('div', { class: 'tbl-wrap', style: { maxHeight: '460px', overflowY: 'auto' } }, tbl));
    content.append(panel);
  }
}

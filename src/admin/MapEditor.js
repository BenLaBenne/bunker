// src/admin/MapEditor.js — Éditeur de maps isométriques multi-étages (admin) :
// pinceau de tuiles, étages, escaliers liés, tâches, spawns, évacuation,
// zones dangereuses, tailles de grille, sauvegarde, publication, test.
import { h, clear, toast } from '../ui/dom.js';
import { t } from '../ui/i18n.js';
import { api } from '../ui/api.js';
import { audio } from '../audio/AudioManager.js';

const TILE_TYPES = [
  { ch: '#', label: '⬛', name: 'Rocher' },
  { ch: ' ', label: '🕳', name: 'Vide (roche)' },
  { ch: '.', label: '🟧', name: 'Sable' },
  { ch: 'p', label: '▦', name: 'Métal rouillé' },
  { ch: 'g', label: '🌾', name: 'Herbe dorée' },
  { ch: 'h', label: '☢', name: 'Zone dangereuse' },
  { ch: 'd', label: '🚪', name: 'Porte' },
  { ch: 'e', label: '🟩', name: 'Évacuation' }
];

const TASK_TYPES = ['reactor', 'cooling', 'generator', 'filter', 'security', 'containment', 'lights', 'ventilation', 'beacon'];

export class MapEditor {
  constructor(root, mapId, onClose) {
    this.root = root;
    this.mapId = mapId;
    this.onClose = onClose;
    this.tool = '#';
    this.floor = 0;
    this.toolMode = 'tile'; // tile | task | stair | spawn | evac | erase
    this.taskType = 'reactor';
    this.taskWeight = 10;
    this.taskDuration = 5;
    this.stairDir = 'up';
    this.pendingStair = null; // {floor,x,y,dir}
    this.zoomPx = 22;
    this.load();
  }

  async load() {
    const d = await api.get(`/api/admin/maps/${this.mapId}`);
    this.map = d.map;
    if (!this.map.data.floors) {
      toast('Map invalide', 'error');
      return;
    }
    this.render();
  }

  render() {
    clear(this.root);
    const wrap = h('div', { class: 'scene' });
    // barre du haut
    const topbar = h('div', { class: 'topbar' },
      h('div', { class: 'logo' }, `🗺 ${this.map.id}`),
      h('button', {
        class: 'btn small', onclick: async () => {
          const name = prompt('Nom de la map :', this.map.name);
          if (name !== null) {
            await api.put(`/api/admin/maps/${this.mapId}`, { name });
            this.map.name = name;
            this.render();
          }
        }
      }, '✏ ', this.map.name),
      h('div', { class: 'spacer' }),
      h('button', {
        class: 'btn small primary', onclick: () => this.save(false)
      }, '💾 ', t('save')),
      h('button', {
        class: 'btn small primary', onclick: () => this.save(true)
      }, '📤 ', t('publish')),
      h('button', {
        class: 'btn small', onclick: () => this.save(false, true)
      }, '▶ ', t('test_map')),
      h('button', { class: 'btn small', onclick: () => { this.destroy(); this.onClose?.(); } }, '←')
    );

    const editorWrap = h('div', { class: 'editor-wrap' });
    // ---- side : outils
    const side = h('div', { class: 'editor-side' });

    // étages
    const floorRow = h('div', { class: 'row' });
    this.floorTabs = h('div', { class: 'row' });
    this.rebuildFloorTabs = () => {
      clear(this.floorTabs);
      this.map.data.floors.forEach((f, i) => {
        this.floorTabs.append(h('button', {
          class: `btn small ${i === this.floor ? 'primary' : ''}`,
          onclick: () => { this.floor = i; this.rebuildFloorTabs(); this.draw(); }
        }, `${i + 1}`));
      });
      floorRow.append(this.floorTabs,
        h('button', {
          class: 'btn small', onclick: () => {
            if (this.map.data.floors.length >= 5) { toast('Max 5 étages', 'error'); return; }
            const w = this.map.data.w, hh = this.map.data.h;
            this.map.data.floors.push({ name: `Étage ${this.map.data.floors.length}`, name_en: `Floor ${this.map.data.floors.length}`, grid: Array.from({ length: hh }, () => ' '.repeat(w)) });
            this.render();
          }
        }, '＋'),
        h('button', {
          class: 'btn small', onclick: () => {
            if (this.map.data.floors.length <= 1) { toast('Au moins 1 étage', 'error'); return; }
            this.map.data.floors.splice(this.floor, 1);
            this.map.data.stairs = this.map.data.stairs.filter(s => s.floor !== this.floor && s.to.floor !== this.floor);
            this.map.data.tasks = this.map.data.tasks.filter(tk => tk.floor !== this.floor);
            this.map.data.spawns = this.map.data.spawns.filter(sp => sp.floor !== this.floor);
            this.floor = 0;
            this.render();
          }
        }, '−')
      );
    };

    // taille de grille
    const wI = h('input', { type: 'number', value: this.map.data.w, min: 8, max: 60, style: { width: '60px' } });
    const hI = h('input', { type: 'number', value: this.map.data.h, min: 8, max: 40, style: { width: '60px' } });
    const resizeBtn = h('button', {
      class: 'btn small', onclick: () => {
        const nw = Math.max(8, Math.min(60, parseInt(wI.value, 10)));
        const nh = Math.max(8, Math.min(40, parseInt(hI.value, 10)));
        for (const f of this.map.data.floors) {
          const grid = f.grid.map(r => r.split(''));
          // redimensionner
          for (let y = 0; y < nh; y++) {
            if (!grid[y]) grid[y] = [];
            for (let x = 0; x < nw; x++) {
              grid[y][x] = grid[y][x] ?? ' ';
            }
            grid[y].length = nw;
          }
          grid.length = nh;
          f.grid = grid.map(row => row.join(''));
        }
        this.map.data.w = nw; this.map.data.h = nh;
        this.draw();
      }
    }, '⤢ ' + t('grid_size'));

    // palette tuiles
    const palette = h('div', { class: 'tile-palette' });
    const TOOL_BUTTONS = [...TILE_TYPES,
      { ch: '__task', label: '🔧', name: 'Tâche' },
      { ch: '__stair', label: '▲', name: 'Escalier' },
      { ch: '__spawn', label: '👤', name: 'Spawn' },
      { ch: '__erase_obj', label: '🧹', name: 'Effacer objet' }
    ];
    this.toolBtns = [];
    for (const tt of TOOL_BUTTONS) {
      const btn = h('button', {
        class: `tile-btn ${this.tool === tt.ch ? 'active' : ''}`,
        title: tt.name,
        onclick: () => {
          this.tool = tt.ch;
          this.toolMode = tt.ch.startsWith('__') ? tt.ch.slice(2) : 'tile';
          this.toolBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      }, tt.label);
      this.toolBtns.push(btn);
      palette.append(btn);
    }
    // sélection de type de tâche
    const taskSel = h('select', {}, TASK_TYPES.map(tt => h('option', { value: tt }, tt)));
    taskSel.addEventListener('change', () => { this.taskType = taskSel.value; });
    const weightI = h('input', { type: 'number', value: this.taskWeight, min: 1, max: 100, style: { width: '56px' } });
    weightI.addEventListener('change', () => { this.taskWeight = parseInt(weightI.value, 10) || 10; });
    const durI = h('input', { type: 'number', value: this.taskDuration, min: 1, max: 30, style: { width: '56px' } });
    durI.addEventListener('change', () => { this.taskDuration = parseInt(durI.value, 10) || 5; });
    const stairSel = h('select', {},
      h('option', { value: 'up' }, '▲ Vers le haut'),
      h('option', { value: 'down' }, '▼ Vers le bas'));
    stairSel.addEventListener('change', () => { this.stairDir = stairSel.value; });

    side.append(
      h('div', { class: 'panel' }, h('h3', {}, t('floors')), floorRow,
        h('div', { class: 'row', style: { marginTop: '6px' } }, wI, hI, resizeBtn)),
      h('div', { class: 'panel' }, h('h3', {}, 'Tuiles & objets'), palette),
      h('div', { class: 'panel' },
        h('h3', {}, '🔧 ' + t('tasks_label')),
        h('div', { class: 'field' }, h('label', {}, 'Type'), taskSel),
        h('div', { class: 'row' },
          h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', {}, 'Poids (total=100)'), weightI),
          h('div', { class: 'field', style: { marginBottom: 0 } }, h('label', {}, 'Durée (s)'), durI)),
        h('div', { class: 'muted', style: { marginTop: '6px' } },
          `Poids actuel: ${this.map.data.tasks.reduce((s, tk) => s + tk.weight, 0)}/100`)),
      h('div', { class: 'panel' },
        h('h3', {}, '▲ ' + t('stairs_label')),
        h('div', { class: 'field' }, h('label', {}, 'Direction'), stairSel),
        h('div', { class: 'muted' }, 'Placez un escalier puis cliquez la case destination sur l\'étage voisin.')),
      h('div', { class: 'panel' },
        h('h3', {}, '👤 ' + t('spawn_label') + ` (${this.map.data.spawns.filter(s => s.floor === this.floor).length})`),
        h('div', { class: 'muted' }, '🧹 efface objets/tâches/spawns/escaliers de la case.')),
      h('div', { class: 'panel' }, h('h3', {}, 'Zoom'),
        h('input', {
          type: 'range', min: 12, max: 40, value: this.zoomPx,
          oninput: (e) => { this.zoomPx = parseInt(e.target.value, 10); this.draw(); }
        }))
    );

    // ---- canvas principal
    const canvasWrap = h('div', { class: 'editor-canvas-wrap' });
    this.canvas = h('canvas', { width: this.map.data.w * this.zoomPx + 40, height: this.map.data.h * this.zoomPx + 40 });
    canvasWrap.append(this.canvas);
    this.canvas.addEventListener('click', (e) => this.onCanvasClick(e));

    editorWrap.append(side, h('div', { class: 'editor-main' }, h('div', { class: 'editor-canvas-wrap' }, this.canvas)));
    wrap.append(topbar, editorWrap);
    this.root.append(wrap);
    this.rebuildFloorTabs();
    this.draw();
  }

  destroy() {
    clear(this.root);
  }

  draw() {
    const ctx = this.canvas.getContext('2d');
    const Z = this.zoomPx;
    const W = this.map.data.w, H = this.map.data.h;
    this.canvas.width = W * Z + 40;
    this.canvas.height = H * Z + 40;
    ctx.fillStyle = '#140e0a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const grid = this.map.data.floors[this.floor].grid;
    for (let y = 0; y < H; y++) {
      const row = grid[y] || '';
      for (let x = 0; x < W; x++) {
        const ch = row[x] ?? ' ';
        const cx = 20 + x * Z, cy = 20 + y * Z;
        const colors = { '#': '#8a3f2b', ' ': '#140e0a', '.': '#c98e57', 'p': '#9c6b4f', 'g': '#b98f3c', 'h': '#5a5030', 'd': '#5a666e', 'e': '#2c6a36' };
        ctx.fillStyle = colors[ch] || '#2b332c';
        ctx.fillRect(cx, cy, Z - 1, Z - 1);
        if (ch === 'h') {
          ctx.strokeStyle = '#c9a23d';
          ctx.strokeRect(cx + 2, cy + 2, Z - 5, Z - 5);
        }
        if (ch === 'e') {
          ctx.strokeStyle = '#7fff6a';
          ctx.strokeRect(cx + 2, cy + 2, Z - 5, Z - 5);
        }
      }
    }
    // grille
    ctx.strokeStyle = 'rgba(127,255,106,0.06)';
    for (let x = 0; x <= W; x++) { ctx.beginPath(); ctx.moveTo(20 + x * Z, 20); ctx.lineTo(20 + x * Z, 20 + H * Z); ctx.stroke(); }
    for (let y = 0; y <= H; y++) { ctx.beginPath(); ctx.moveTo(20, 20 + y * Z); ctx.lineTo(20 + W * Z, 20 + y * Z); ctx.stroke(); }
    // objets
    const marker = (x, y, label, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(20 + x * Z + Z / 2, 20 + y * Z + Z / 2, Z * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#050705';
      ctx.font = `${Z * 0.5}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 20 + x * Z + Z / 2, 20 + y * Z + Z / 2 + 1);
    };
    for (const tk of this.map.data.tasks) {
      if (tk.floor === this.floor) marker(tk.x, tk.y, '🔧', tk.type === this.taskType ? '#ffd97a' : '#e07a3d');
    }
    for (const st of this.map.data.stairs) {
      if (st.floor === this.floor) marker(st.x, st.y, st.dir === 'up' ? '▲' : '▼', '#6ad9ff');
      if (this.pendingStair && st.floor === this.pendingStair.floor && st.x === this.pendingStair.x && st.y === this.pendingStair.y) {
        ctx.strokeStyle = '#ff5d5d';
        ctx.lineWidth = 2;
        ctx.strokeRect(20 + st.x * Z, 20 + st.y * Z, Z, Z);
        ctx.lineWidth = 1;
      }
    }
    for (const sp of this.map.data.spawns) {
      if (sp.floor === this.floor) marker(sp.x, sp.y, '👤', '#7fff6a');
    }
    if (this.pendingStair) {
      ctx.strokeStyle = '#ffd97a';
      ctx.lineWidth = 2;
      ctx.strokeRect(20 + this.pendingStair.x * Z, 20 + this.pendingStair.y * Z, Z, Z);
      ctx.lineWidth = 1;
    }
    // légende étage
    ctx.fillStyle = '#8fa392';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${t('floor')} ${this.floor + 1}/${this.map.data.floors.length} — outil: ${this.tool}`, 24, 14);
  }

  onCanvasClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX - 20;
    const cy = (e.clientY - rect.top) * scaleY - 20;
    const Z = this.zoomPx;
    const gx = Math.floor(cx / Z), gy = Math.floor(cy / Z);
    const W = this.map.data.w, H = this.map.data.h;
    if (gx < 0 || gy < 0 || gx >= W || gy >= H) return;
    const grid = this.map.data.floors[this.floor].grid.map(r => r.split(''));

    // destination d'escalier en attente
    if (this.pendingStair) {
      if (gx === this.pendingStair.x && gy === this.pendingStair.y && this.floor === this.pendingStair.floor) {
        this.pendingStair = null; this.draw(); return;
      }
      const opposite = this.pendingStair.dir === 'up' ? 'down' : 'up';
      const id = `st${Date.now().toString(36)}`;
      this.map.data.stairs.push({ id, floor: this.floor, x: gx, y: gy, dir: opposite, to: { floor: this.pendingStair.floor, x: this.pendingStair.x, y: this.pendingStair.y } });
      // met à jour la destination du premier
      const first = this.map.data.stairs.find(s => s.floor === this.pendingStair.floor && s.x === this.pendingStair.x && s.y === this.pendingStair.y);
      if (first) first.to = { floor: this.floor, x: gx, y: gy };
      this.pendingStair = null;
      audio.play('click');
      this.draw();
      return;
    }

    switch (this.toolMode) {
      case 'tile': {
        grid[gy][gx] = this.tool;
        this.map.data.floors[this.floor].grid = grid.map(r => r.join(''));
        break;
      }
      case 'task': {
        const existing = this.map.data.tasks.findIndex(tk => tk.floor === this.floor && tk.x === gx && tk.y === gy);
        if (existing !== -1) this.map.data.tasks.splice(existing, 1);
        this.map.data.tasks.push({ id: `t_${this.taskType}_${Date.now().toString(36)}`, type: this.taskType, floor: this.floor, x: gx, y: gy, duration: this.taskDuration, weight: this.taskWeight, name: this.taskType, name_en: this.taskType });
        audio.play('click');
        break;
      }
      case 'stair': {
        const existing = this.map.data.stairs.findIndex(st => st.floor === this.floor && st.x === gx && st.y === gy);
        if (existing !== -1) this.map.data.stairs.splice(existing, 1);
        this.map.data.stairs.push({ id: `st_${Date.now().toString(36)}`, floor: this.floor, x: gx, y: gy, dir: this.stairDir, to: null });
        this.pendingStair = { floor: this.floor, x: gx, y: gy, dir: this.stairDir };
        toast('Choisissez la case destination sur l\'étage voisin');
        break;
      }
      case 'spawn': {
        const existing = this.map.data.spawns.findIndex(sp => sp.floor === this.floor && sp.x === gx && sp.y === gy);
        if (existing !== -1) this.map.data.spawns.splice(existing, 1);
        else this.map.data.spawns.push({ floor: this.floor, x: gx, y: gy });
        audio.play('click');
        break;
      }
      case 'erase_obj': {
        this.map.data.tasks = this.map.data.tasks.filter(tk => !(tk.floor === this.floor && tk.x === gx && tk.y === gy));
        this.map.data.stairs = this.map.data.stairs.filter(st => !(st.floor === this.floor && st.x === gx && st.y === gy));
        this.map.data.spawns = this.map.data.spawns.filter(sp => !(sp.floor === this.floor && sp.x === gx && sp.y === gy));
        break;
      }
    }
    this.draw();
    // rafraîchit le compteur de poids
    const weightLabel = this.root.querySelectorAll('.panel .muted');
    for (const el of weightLabel) {
      if (el.textContent.startsWith('Poids actuel')) {
        el.textContent = `Poids actuel: ${this.map.data.tasks.reduce((s, tk) => s + tk.weight, 0)}/100`;
      }
    }
  }

  async save(publish, test) {
    try {
      const weight = this.map.data.tasks.reduce((s, tk) => s + tk.weight, 0);
      if (weight !== 100) { toast(`Poids total = ${weight} (doit être 100)`, 'error'); return; }
      if (!this.map.data.spawns.length) { toast('Placez au moins un spawn 👤', 'error'); return; }
      if (!this.map.data.tasks.length) { toast('Placez au moins une tâche 🔧', 'error'); return; }
      await api.put(`/api/admin/maps/${this.mapId}`, {
        name: this.map.name, name_en: this.map.name_en,
        description: this.map.description, description_en: this.map.description_en,
        data: this.map.data, published: publish ? true : undefined
      });
      audio.play('purchase');
      toast(publish ? '📤 Map publiée' : '💾 Map sauvegardée');
      if (test) {
        toast('▶ Test : la partie se lance avec la map publiée. Publiez d\'abord si besoin.');
      }
    } catch (e) {
      toast(e.message || e.code, 'error');
    }
  }
}

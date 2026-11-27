// src/ui/TaskMap.js — Carte des tâches façon Among Us : map vue de dessus par
// étage, emplacements des tâches (état + progression), escaliers, zone d'évac,
// position du joueur, progression globale du bunker.
import { h, clear } from './dom.js';
import { t } from './i18n.js';

const TILE_COLORS = {
  '#': '#141a15', ' ': '#050705', '.': '#2b332c', 'p': '#313a34', 'g': '#2e3739',
  'h': '#4a4438', 'd': '#31363a', 'e': '#1f4a2a'
};

export class TaskMap {
  constructor(root, callbacks) {
    this.root = h('div', { class: 'taskmap-overlay hidden' });
    root.append(this.root);
    this.cb = callbacks;
    this.floor = 0;
    this.map = null;
    this.build();
  }

  build() {
    const head = h('div', { class: 'tm-head' },
      h('h2', {}, '🗺 ', t('tasks_label')),
      this.floorTabs = h('div', { class: 'tm-floor-tabs' }),
      h('div', { class: 'grow' }),
      h('div', { class: 'col' },
        h('div', { class: 'hud-progress-label' }, 'BUNKER'),
        this.globalProgress = h('div', { class: 'progressbar', style: { width: '160px' } }, this.progressFill = h('div'))
      ),
      h('button', { class: 'btn small', onclick: () => this.hide() }, '✕ ', t('close'))
    );
    const body = h('div', { class: 'tm-body' },
      h('div', { class: 'tm-canvas-wrap' }, this.canvas = h('canvas', { width: 640, height: 460 })),
      this.taskList = h('div', { class: 'tm-list' })
    );
    const legend = h('div', { class: 'tm-legend' },
      h('span', { style: { color: '#ff5d5d' } }, t('tasks_label')),
      h('span', { style: { color: '#7fff6a' } }, t('evac_label')),
      h('span', { style: { color: '#6ad9ff' } }, t('stairs_label')),
      h('span', { style: { color: '#ffd97a' } }, 'En cours')
    );
    this.root.append(head, body, legend);
    this.canvas.addEventListener('click', (e) => this.onCanvasClick(e));
  }

  show() { this.root.classList.remove('hidden'); this.draw(); }
  hide() { this.root.classList.add('hidden'); this.cb.onClose?.(); }
  get isOpen() { return !this.root.classList.contains('hidden'); }

  setMap(map) {
    this.map = map;
    this.floor = 0;
    this.rebuildTabs();
  }

  rebuildTabs() {
    clear(this.floorTabs);
    this.map.floors.forEach((f, i) => {
      const label = (this.lang === 'en' ? f.name_en : f.name) || `E${i}`;
      this.floorTabs.append(h('button', {
        class: `btn small ${i === this.floor ? 'primary' : ''}`,
        onclick: () => { this.floor = i; this.rebuildTabs(); this.draw(); }
      }, label));
    });
  }

  updateSnap(map, snap, selfPos, lang) {
    this.map = map;
    this.lang = lang;
    if (snap) {
      this.progressFill.style.width = `${snap.progress}%`;
      this.lastSnap = snap;
      this.selfPos = selfPos;
    }
    if (this.isOpen) this.draw();
  }

  draw() {
    const map = this.map;
    if (!map) return;
    const ctx = this.canvas.getContext('2d');
    const W = this.canvas.width, H = this.canvas.height;
    const sx = W / map.w, sy = H / map.h;
    ctx.fillStyle = '#050705';
    ctx.fillRect(0, 0, W, H);
    const fog = map.fog;
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const state = fog[this.floor]?.[y]?.[x] ?? 0;
        if (state === 0) continue;
        const ch = map.tile(this.floor, x, y);
        let color = TILE_COLORS[ch] || '#2b332c';
        if (state === 1) color = '#1a201b';
        ctx.fillStyle = color;
        ctx.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
        // escaliers
        if (state === 2) {
          const st = map.stairAt(this.floor, x, y);
          if (st) {
            ctx.fillStyle = st.dir === 'up' ? '#6ad9ff' : '#3a8fb0';
            ctx.fillRect(x * sx + 2, y * sy + 2, sx - 4, sy - 4);
            ctx.fillStyle = '#050705';
            ctx.font = `${Math.min(sx, sy) * 0.8}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(st.dir === 'up' ? '▲' : '▼', x * sx + sx / 2, y * sy + sy / 2 + 3);
          }
        }
      }
    }
    // tâches (visibles si explorées)
    for (const task of map.tasks) {
      if (task.floor !== this.floor) continue;
      const state = fog[task.floor]?.[task.y]?.[task.x] ?? 0;
      if (state === 0) continue;
      const snapTask = this.lastSnap?.tasks?.find(tk => tk.id === task.id);
      const done = snapTask?.done;
      const inProgress = (snapTask?.progress || 0) > 0 && !done;
      const color = done ? '#3e7a35' : inProgress ? '#ffd97a' : '#ff5d5d';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(task.x * sx + sx / 2, task.y * sy + sy / 2, Math.min(sx, sy) * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#050705';
      ctx.stroke();
      if (inProgress) {
        ctx.strokeStyle = '#050705';
        ctx.beginPath();
        ctx.arc(task.x * sx + sx / 2, task.y * sy + sy / 2, Math.min(sx, sy) * 0.3, -Math.PI / 2, -Math.PI / 2 + (snapTask.progress || 0) * Math.PI * 2);
        ctx.strokeStyle = '#050705';
        ctx.stroke();
      }
    }
    // joueur
    if (this.selfPos && this.selfPos.floor === this.floor) {
      ctx.fillStyle = '#7fff6a';
      ctx.beginPath();
      ctx.arc(this.selfPos.x * sx, this.selfPos.y * sy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#050705';
      ctx.stroke();
    }
    this.drawTaskList();
  }

  drawTaskList() {
    clear(this.taskList);
    if (!this.map) return;
    for (const task of this.map.tasks) {
      const snapTask = this.lastSnap?.tasks?.find(tk => tk.id === task.id);
      if (!snapTask) continue;
      const name = this.lang === 'en' ? task.name_en : (task.name || task.id);
      const el = h('div', { class: `tm-task ${snapTask.done ? 'done' : ''}`, onclick: () => this.cb.onTaskClick?.(task) },
        h('div', {}, snapTask.done ? '✅' : task.floor === this.selfPos?.floor ? '🎯' : '⬆'),
        h('div', { class: 'grow' },
          h('div', { style: { fontWeight: 700, fontSize: '13px' } }, name),
          h('div', { class: 'muted' }, `E${task.floor} · ${task.x},${task.y}`),
          h('div', { class: 'tm-bar' }, h('div', { style: { width: `${(snapTask.progress || 0) * 100}%`, height: '100%', background: '#7fff6a' } }))
        )
      );
      this.taskList.append(el);
    }
  }

  onCanvasClick(e) {
    if (!this.map) return;
    const rect = this.canvas.getBoundingClientRect();
    const scale = this.canvas.width / rect.width;
    const cx = (e.clientX - rect.left) * scale;
    const cy = (e.clientY - rect.top) * scale;
    const sx = this.canvas.width / this.map.w, sy = this.canvas.height / this.map.h;
    const gx = Math.floor(cx / sx), gy = Math.floor(cy / sy);
    const task = this.map.tasks.find(tk => tk.floor === this.floor && Math.abs(tk.x - gx) <= 1 && Math.abs(tk.y - gy) <= 1);
    if (task) this.cb.onTaskClick?.(task);
  }
}

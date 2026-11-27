// src/admin/SkinEditor.js — Éditeur de skins pixel-art (admin) : feuille standard
// 128x64 (4 directions × 2 frames), pinceau, gomme, pipette, remplissage,
// palette, zoom, grille, undo/redo, aperçu animé, export PNG, publication.
import { h, clear, toast } from '../ui/dom.js';
import { t } from '../ui/i18n.js';
import { api } from '../ui/api.js';
import { audio } from '../audio/AudioManager.js';

const CELL_W = 32, CELL_H = 32, COLS = 4, ROWS = 2;
const DEFAULT_PALETTE = [
  '#0e1113', '#1a2226', '#2a3540', '#3a4a50', '#4e6a72', '#6a92a0', '#8fb8c0', '#b8d8dc',
  '#e8f4f4', '#4a5a50', '#5c7a52', '#7fff6a', '#b8ffb0', '#c9a23d', '#ffd97a', '#fff3b0',
  '#5c4632', '#8a6a4a', '#c98a4a', '#ff9b3d', '#8a3030', '#c95a5a', '#ff5d5d', '#ffc0c0',
  '#354a5a', '#7fc6e8', '#bfe9ff', '#3a2352', '#b28cff', '#e2d5ff', '#14161c', '#ffffff'
];

export class SkinEditor {
  constructor(root, skinId, fighterId, existingData, onClose) {
    this.skinId = skinId;
    this.fighterId = fighterId;
    this.onClose = onClose;
    this.color = '#7fff6a';
    this.tool = 'brush'; // brush | eraser | picker | fill
    this.zoomPx = 6;
    this.undoStack = [];
    this.redoStack = [];
    // pixels : { "x,y": "#rrggbb" } sur 128x64
    this.pixels = {};
    if (existingData?.pixels) this.pixels = { ...existingData.pixels };
    this.render();
  }

  setPixel(x, y, color) {
    const key = `${x},${y}`;
    if (color === null) delete this.pixels[key];
    else this.pixels[key] = color;
  }

  snapshot() { this.undoStack.push({ ...this.pixels }); if (this.undoStack.length > 60) this.undoStack.shift(); this.redoStack = []; }

  render() {
    clear(this.root);
    const wrap = h('div', { class: 'scene' });
    const topbar = h('div', { class: 'topbar' },
      h('div', { class: 'logo' }, `🎨 ${this.skinId} (${this.fighterId})`),
      h('div', { class: 'spacer' }),
      h('button', {
        class: 'btn small', onclick: () => this.exportPng()
      }, '📤 Export PNG'),
      h('button', {
        class: 'btn small primary', onclick: () => this.save(false)
      }, '💾 ', t('save')),
      h('button', {
        class: 'btn small primary', onclick: () => this.save(true)
      }, '📤 ', t('publish')),
      h('button', { class: 'btn small', onclick: () => { this.destroy(); this.onClose?.(); } }, '←')
    );
    const editorWrap = h('div', { class: 'editor-wrap' });

    // ---- side : outils + palette
    const side = h('div', { class: 'editor-side' });
    const tools = [
      ['brush', '🖌 Pinceau'], ['eraser', '🧽 Gomme'], ['picker', '💧 Pipette'], ['fill', '🪣 Remplir']
    ];
    const toolRow = h('div', { class: 'row' });
    this.toolBtns = [];
    for (const [id, label] of tools) {
      const btn = h('button', {
        class: `btn small ${this.tool === id ? 'primary' : ''}`,
        onclick: () => {
          this.tool = id;
          this.toolBtns.forEach(b => b.classList.remove('primary'));
          btn.classList.add('primary');
        }
      }, label);
      this.toolBtns.push(btn);
      toolRow.append(btn);
    }
    const colorGrid = h('div', { class: 'color-grid' });
    this.swatches = [];
    for (const color of DEFAULT_PALETTE) {
      const sw = h('div', { class: `color-swatch ${this.color === color ? 'active' : ''}`, style: { background: color }, title: color });
      sw.addEventListener('click', () => {
        this.color = color;
        this.swatches.forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        this.colorPreview.style.background = color;
      });
      this.swatches.push(sw);
      colorGrid.append(sw);
    }
    const customColor = h('input', { type: 'color', value: this.color, style: { width: '50px', height: '34px' } });
    customColor.addEventListener('input', () => { this.color = customColor.value; this.colorPreview.style.background = this.color; });
    const zoomI = h('input', { type: 'range', min: 3, max: 12, value: this.zoomPx, oninput: (e) => { this.zoomPx = parseInt(e.target.value, 10); this.drawSheet(); } });
    side.append(
      h('div', { class: 'panel' }, h('h3', {}, 'Outils'), toolRow,
        h('div', { class: 'row', style: { marginTop: '8px' } },
          h('div', {}, customColor), this.colorPreview = h('div', { style: { width: '34px', height: '34px', borderRadius: '6px', background: this.color, border: '1px solid var(--line)' } })),
        h('div', { class: 'color-grid', style: { marginTop: '8px' } }, colorGrid)),
      h('div', { class: 'panel' }, h('h3', {}, 'Zoom'), zoomI),
      h('div', { class: 'panel' },
        h('h3', {}, 'Historique'),
        h('div', { class: 'row' },
          h('button', { class: 'btn small', onclick: () => this.undo() }, '↶ Undo'),
          h('button', { class: 'btn small', onclick: () => this.redo() }, '↷ Redo'))),
      h('div', { class: 'panel' },
        h('h3', {}, 'Feuille standard'),
        h('div', { class: 'muted' }, '128×64 : 4 colonnes (bas, gauche, droite, haut) × 2 lignes (idle, marche). Uniquement des pixels opaques, fond transparent.'),
        h('div', { class: 'row', style: { marginTop: '8px' } },
          h('button', {
            class: 'btn small', onclick: () => this.copyRow(0, 1)
          }, 'Copier idle→marche'),
          h('button', {
            class: 'btn small', onclick: () => this.mirrorLR()
          }, '◀◀▶ Miroir G↔D'))
      ),
      h('div', { class: 'panel' },
        h('h3', {}, 'Aperçu animé'),
        this.previewCanvas = h('canvas', { class: 'skin-preview', width: 96, height: 48, style: { width: '192px', height: '96px' } }),
        h('div', { class: 'muted' }, 'Marche (direction bas)'))
    );

    // ---- canvas feuille
    const canvasWrap = h('div', { class: 'editor-canvas-wrap' });
    this.sheetCanvas = h('canvas', { width: CELL_W * COLS * this.zoomPx, height: CELL_H * ROWS * this.zoomPx });
    canvasWrap.append(this.sheetCanvas);
    this.attachCanvasEvents();

    editorWrap.append(side, h('div', { class: 'editor-main' }, h('div', { class: 'editor-canvas-wrap' }, this.sheetCanvas)));
    wrap.append(topbar, editorWrap);
    this.root.append(wrap);
    this.drawSheet();
    this.startPreview();
  }

  destroy() {
    clearInterval(this.previewIv);
    clear(this.root);
  }

  attachCanvasEvents() {
    let painting = false;
    const getCell = (e) => {
      const rect = this.sheetCanvas.getBoundingClientRect();
      const scaleX = this.sheetCanvas.width / rect.width;
      const scaleY = this.sheetCanvas.height / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;
      const Z = this.zoomPx;
      const x = Math.floor(cx / Z), y = Math.floor(cy / Z);
      if (x < 0 || y < 0 || x >= CELL_W * COLS || y >= CELL_H * ROWS) return null;
      return { x, y };
    };
    const apply = (x, y, first) => {
      if (this.tool === 'picker') {
        const c = this.pixels[`${x},${y}`];
        if (c) { this.color = c; this.colorPreview.style.background = c; }
        return;
      }
      if (first) this.snapshot();
      if (this.tool === 'brush') this.setPixel(x, y, this.color);
      else if (this.tool === 'eraser') this.setPixel(x, y, null);
      else if (this.tool === 'fill') this.floodFill(x, y, this.color);
    };
    this.sheetCanvas.addEventListener('pointerdown', (e) => {
      const cell = getCell(e);
      if (!cell) return;
      painting = true;
      apply(cell.x, cell.y, true);
      this.drawSheet();
    });
    this.sheetCanvas.addEventListener('pointermove', (e) => {
      if (!painting || this.tool === 'picker' || this.tool === 'fill') return;
      const cell = getCell(e);
      if (!cell) return;
      apply(cell.x, cell.y, false);
      this.drawSheet();
    });
    window.addEventListener('pointerup', () => { painting = false; });
  }

  floodFill(x, y, color) {
    const target = this.pixels[`${x},${y}`] || null;
    if (target === color) return;
    const stack = [[x, y]];
    const visited = new Set();
    while (stack.length) {
      const [cx, cy] = stack.pop();
      const key = `${cx},${cy}`;
      if (cx < 0 || cy < 0 || cx >= CELL_W * COLS || cy >= CELL_H * ROWS) continue;
      if (visited.has(key)) continue;
      visited.add(key);
      const cur = this.pixels[key] || null;
      if (cur !== target) continue;
      this.setPixel(cx, cy, color);
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }

  copyRow(from, to) {
    this.snapshot();
    for (let x = 0; x < CELL_W * COLS; x++) {
      for (let yy = 0; yy < CELL_H; yy++) {
        const c = this.pixels[`${x},${from * CELL_H + yy}`];
        if (c) this.setPixel(x, to * CELL_H + yy, c);
        else this.setPixel(x, to * CELL_H + yy, null);
      }
    }
    this.drawSheet();
  }

  mirrorLR() {
    this.snapshot();
    // colonnes gauche(1) et droite(2) : miroir horizontal de chaque ligne
    for (let row = 0; row < ROWS; row++) {
      for (let yy = 0; yy < CELL_H; yy++) {
        for (let xx = 0; xx < Math.floor(CELL_W / 2); xx++) {
          const xL = 1 * CELL_W + xx, xR = 2 * CELL_W + (CELL_W - 1 - xx);
          const a = this.pixels[`${xL},${row * CELL_H + yy}`];
          const b = this.pixels[`${xR},${row * CELL_H + yy}`];
          if (a) this.setPixel(xR, row * CELL_H + yy, a); else this.setPixel(xR, row * CELL_H + yy, null);
          if (b) this.setPixel(xL, row * CELL_H + yy, b); else this.setPixel(xL, row * CELL_H + yy, null);
        }
      }
    }
    this.drawSheet();
  }

  undo() {
    const snap = this.undoStack.pop();
    if (!snap) return;
    this.redoStack.push({ ...this.pixels });
    this.pixels = snap;
    this.drawSheet();
  }
  redo() {
    const snap = this.redoStack.pop();
    if (!snap) return;
    this.undoStack.push({ ...this.pixels });
    this.pixels = snap;
    this.drawSheet();
  }

  drawSheet() {
    const Z = this.zoomPx;
    this.sheetCanvas.width = CELL_W * COLS * Z;
    this.sheetCanvas.height = CELL_H * ROWS * Z;
    const ctx = this.sheetCanvas.getContext('2d');
    // damier de fond
    for (let cy = 0; cy < CELL_H * ROWS; cy++) {
      for (let cx = 0; cx < CELL_W * COLS; cx++) {
        ctx.fillStyle = ((cx >> 3) + (cy >> 3)) % 2 ? '#141a16' : '#0d130f';
        ctx.fillRect(cx * Z, cy * Z, Z, Z);
      }
    }
    // séparateurs de cellules
    ctx.strokeStyle = 'rgba(127,255,106,0.25)';
    for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c * CELL_W * Z, 0); ctx.lineTo(c * CELL_W * Z, CELL_H * ROWS * Z); ctx.stroke(); }
    for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * CELL_H * Z); ctx.lineTo(CELL_W * COLS * Z, r * CELL_H * Z); ctx.stroke(); }
    // pixels
    for (const [key, color] of Object.entries(this.pixels)) {
      const [x, y] = key.split(',').map(Number);
      ctx.fillStyle = color;
      ctx.fillRect(x * Z, y * Z, Z, Z);
    }
  }

  startPreview() {
    let frame = 0;
    const ctx = this.previewCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const off = document.createElement('canvas');
    off.width = CELL_W * COLS; off.height = CELL_H * ROWS;
    const offCtx = off.getContext('2d');
    const repaint = () => {
      offCtx.clearRect(0, 0, off.width, off.height);
      for (const [key, color] of Object.entries(this.pixels)) {
        const [x, y] = key.split(',').map(Number);
        offCtx.fillStyle = color;
        offCtx.fillRect(x, y, 1, 1);
      }
    };
    repaint();
    this.previewIv = setInterval(() => {
      if (!this.previewCanvas.isConnected) { clearInterval(this.previewIv); return; }
      const col = 0; // direction bas
      const row = frame % 2;
      ctx.clearRect(0, 0, 96, 48);
      ctx.fillStyle = '#0d130f';
      ctx.fillRect(0, 0, 96, 48);
      ctx.drawImage(off, col * CELL_W, row * CELL_H, CELL_W, CELL_H, 32, 8, CELL_W, CELL_H);
      frame++;
    }, 400);
  }

  exportPng() {
    const off = document.createElement('canvas');
    off.width = CELL_W * COLS; off.height = CELL_H * ROWS;
    const ctx = off.getContext('2d');
    for (const [key, color] of Object.entries(this.pixels)) {
      const [x, y] = key.split(',').map(Number);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
    const a = document.createElement('a');
    a.download = `${this.skinId}.png`;
    a.href = off.toDataURL('image/png');
    a.click();
  }

  async save(publish) {
    try {
      const data = { w: CELL_W * COLS, h: CELL_H * ROWS, pixels: this.pixels };
      // création ou mise à jour
      try {
        await api.post('/api/admin/skins', {
          id: this.skinId, fighterId: this.fighterId, name: this.skinId, name_en: this.skinId,
          data, published: false
        });
      } catch (e) {
        if (e.code === 'ID_TAKEN') {
          await api.put(`/api/admin/skins/${this.skinId}`, { data, ...(publish ? { published: true } : {}) });
        } else throw e;
      }
      if (publish) {
        await api.put(`/api/admin/skins/${this.skinId}`, { published: true });
        // Proposer l'ajout boutique
        if (confirm('Publier aussi dans la boutique (15 💠) ?')) {
          try {
            await api.post('/api/admin/shop', {
              id: 'skin_' + this.skinId, name: 'Skin ' + this.skinId, name_en: 'Skin ' + this.skinId,
              description: 'Skin édité dans BUNKER.', description_en: 'Skin made in BUNKER editor.',
              category: 'skins', rarity: 'rare', price: 15, currency: 'cores',
              payload: { skinId: this.skinId }
            });
          } catch { /* existe déjà */ }
        }
      }
      audio.play('purchase');
      toast(publish ? '📤 Skin publié' : '💾 Skin sauvegardé');
    } catch (e) {
      toast(e.message || e.code, 'error');
    }
  }
}

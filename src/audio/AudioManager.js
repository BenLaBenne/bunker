// src/audio/AudioManager.js — Sons 100% WebAudio : synthèse procédurale par défaut,
// ou fichier audio importé par l'admin (mode 'file' par son, indépendamment).

const SYNTH_DEFAULTS = {
  click:     { type: 'square', freq: 520, freq2: 420, dur: 0.06, vol: 0.35, noise: 0 },
  attack:    { type: 'sawtooth', freq: 640, freq2: 180, dur: 0.12, vol: 0.5, noise: 0.35 },
  hit:       { type: 'triangle', freq: 220, freq2: 90, dur: 0.16, vol: 0.6, noise: 0.5 },
  kill:      { type: 'square', freq: 880, freq2: 1760, dur: 0.28, vol: 0.5, noise: 0.1 },
  repair:    { type: 'square', freq: 300, freq2: 340, dur: 0.09, vol: 0.3, noise: 0.4 },
  reward:    { type: 'sine', freq: 660, freq2: 990, dur: 0.3, vol: 0.5, noise: 0 },
  purchase:  { type: 'sine', freq: 520, freq2: 780, dur: 0.25, vol: 0.5, noise: 0.15 },
  alarm:     { type: 'sawtooth', freq: 440, freq2: 880, dur: 0.9, vol: 0.5, noise: 0.1, loop: 0 },
  notification: { type: 'sine', freq: 740, freq2: 740, dur: 0.22, vol: 0.4, noise: 0 },
  victory:   { type: 'sine', freq: 523, freq2: 1046, dur: 0.7, vol: 0.55, noise: 0 },
  defeat:    { type: 'sine', freq: 392, freq2: 196, dur: 0.7, vol: 0.55, noise: 0.1 },
  ambience:  { type: 'sine', freq: 82, freq2: 78, dur: 2.5, vol: 0.12, noise: 0.12, loop: 1 }
};

class AudioManager {
  constructor() {
    this.ctx = null;
    this.soundModes = {};     // id -> 'synth' | 'file'
    this.buffers = {};        // id -> AudioBuffer (mode fichier)
    this.synthParams = {};    // id -> params admin
    this.ambienceSource = null;
    this.enabled = true;
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.musicGain.connect(this.master);
    } catch { this.enabled = false; }
  }

  /** Liste des modes renvoyée par /api/meta.sounds */
  setSoundConfig(sounds) {
    for (const s of sounds || []) {
      this.soundModes[s.id] = s.mode;
      if (s.mode === 'file' && !this.buffers[s.id]) this.loadFile(s.id);
    }
  }

  setSynthParams(id, params) {
    this.synthParams[id] = { ...SYNTH_DEFAULTS[id], ...(params || {}) };
  }

  async loadFile(id) {
    if (!this.ctx) return;
    try {
      const res = await fetch(`/api/sounds/${id}/raw`);
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      this.buffers[id] = await this.ctx.decodeAudioData(buf);
    } catch { /* format non décodable → reste en synthèse */ }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolumes(master, music, sfx) {
    if (!this.ctx) return;
    this.master.gain.value = master ?? 1;
    this.musicGain.gain.value = music ?? 0.6;
    this.sfxGain.gain.value = sfx ?? 1;
  }

  play(id, options = {}) {
    if (!this.ctx || !this.enabled) return;
    const mode = this.soundModes[id] || 'synth';
    if (mode === 'file' && this.buffers[id]) {
      this.playBuffer(id, options.loop, options.music ? this.musicGain : this.sfxGain);
      return;
    }
    this.playSynth(id, options);
  }

  playBuffer(id, loop, out) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[id];
    src.loop = !!loop;
    src.connect(out || this.sfxGain);
    if (loop && id === 'ambience') {
      if (this.ambienceSource) { try { this.ambienceSource.stop(); } catch {} }
      this.ambienceSource = src;
    }
    src.start();
  }

  playSynth(id, options = {}) {
    const p = this.synthParams[id] || SYNTH_DEFAULTS[id] || SYNTH_DEFAULTS.click;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = Math.max(0.03, options.dur || p.dur || 0.15);
    const out = id === 'ambience' ? this.musicGain : this.sfxGain;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(p.vol ?? 0.4, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    gain.connect(out);

    // souffle (noise)
    if (p.noise > 0) {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const ng = ctx.createGain();
      ng.gain.value = p.noise;
      noise.connect(ng).connect(gain);
      noise.start(now);
      noise.stop(now + dur);
    }
    // oscillateur avec glissando
    const osc = ctx.createOscillator();
    osc.type = p.type || 'square';
    osc.frequency.setValueAtTime(p.freq || 440, now);
    if (p.freq2 && p.freq2 !== p.freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, p.freq2), now + dur);
    }
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
    return osc;
  }

  startAmbience() {
    this.play('ambience', { loop: true });
  }

  stopAmbience() {
    if (this.ambienceSource) { try { this.ambienceSource.stop(); } catch {} this.ambienceSource = null; }
  }
}

export const audio = new AudioManager();

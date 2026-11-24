import { CONFIG } from '../core/config.js';

/**
 * Fully synthesized soundscape (Web Audio API) — no audio files.
 * Ocean bed ambience, gulls, and one-shot SFX for every game event.
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = this._loadMuted();
    this.ready = false;
    this.gullTimer = 4;
    this._nodes = {};
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    this.ready = true;
    this._startAmbience();
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem(CONFIG.storage.mutedKey, m ? '1' : '0'); } catch { }
    if (this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }
  }

  _loadMuted() {
    try { return localStorage.getItem(CONFIG.storage.mutedKey) === '1'; } catch { return false; }
  }

  _resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ------------------------------------------------------- ambience ----

  _startAmbience() {
    const ctx = this.ctx;

    // Looping filtered noise = ocean bed.
    const len = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // brown-ish noise
      data[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 420;
    lowpass.Q.value = 0.6;

    const swell = ctx.createGain();
    swell.gain.value = 0.05;

    // Slow LFO on the swell — waves breathing in and out.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.028;
    lfo.connect(lfoGain).connect(swell.gain);

    src.connect(lowpass).connect(swell).connect(this.master);
    src.start();
    lfo.start();

    this._nodes.ambience = { src, swell, lowpass };
  }

  /** Danger subtly raises the ambience tension (filter + gain). */
  setDanger(level) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const { swell, lowpass } = this._nodes.ambience;
    swell.gain.setTargetAtTime(0.05 + level * 0.05, t, 0.4);
    lowpass.frequency.setTargetAtTime(420 + level * 500, t, 0.4);
  }

  // ------------------------------------------------------------ sfx ----

  _tone({ type = 'sine', freq = 440, freqEnd, dur = 0.2, vol = 0.3, attack = 0.005, when = 0 }) {
    if (!this.ready) return;
    this._resume();
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  _noise({ dur = 0.3, vol = 0.3, filter = 'bandpass', freq = 1000, freqEnd, q = 1, when = 0, sweep = false }) {
    if (!this.ready) return;
    this._resume();
    const ctx = this.ctx;
    const t0 = ctx.currentTime + when;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
  }

  seagull() {
    const base = 2100 + Math.random() * 700;
    this._tone({ type: 'square', freq: base, freqEnd: base * 0.55, dur: 0.14, vol: 0.035, attack: 0.01 });
    this._tone({ type: 'square', freq: base * 0.92, freqEnd: base * 0.5, dur: 0.18, vol: 0.03, attack: 0.01, when: 0.16 });
  }

  grab() {
    this._noise({ dur: 0.1, vol: 0.22, freq: 900, q: 2 });
    this._tone({ type: 'sine', freq: 320, freqEnd: 180, dur: 0.12, vol: 0.25 });
  }

  shellSnap() {
    const f = 900 + Math.random() * 500;
    this._noise({ dur: 0.05, vol: 0.16, freq: f, q: 3 });
    this._tone({ type: 'triangle', freq: f * 0.6, freqEnd: f * 0.3, dur: 0.06, vol: 0.14 });
  }

  flap() {
    this._noise({ dur: 0.22, vol: 0.3, freq: 380, freqEnd: 140, q: 0.8 });
  }

  rodTension() {
    this._tone({ type: 'sawtooth', freq: 90, freqEnd: 160, dur: 0.5, vol: 0.05 });
    this._noise({ dur: 0.5, vol: 0.03, freq: 2000, freqEnd: 3000, q: 8 });
  }

  netSwoosh() {
    this._noise({ dur: 0.4, vol: 0.4, freq: 2400, freqEnd: 300, q: 1.2 });
  }

  netLand() {
    this._noise({ dur: 0.25, vol: 0.35, freq: 500, freqEnd: 120, q: 0.7 });
    this._tone({ type: 'sine', freq: 130, freqEnd: 55, dur: 0.35, vol: 0.4 });
  }

  caughtJingle() {
    // comedic descending trombone-ish wah
    this._tone({ type: 'sawtooth', freq: 300, freqEnd: 150, dur: 0.5, vol: 0.12 });
    this._tone({ type: 'sawtooth', freq: 260, freqEnd: 120, dur: 0.6, vol: 0.12, when: 0.35 });
    this._tone({ type: 'sawtooth', freq: 200, freqEnd: 70, dur: 0.9, vol: 0.14, when: 0.8 });
  }

  escapeSuccess() {
    // bright plucky two-note reward
    this._tone({ type: 'sine', freq: 660, dur: 0.22, vol: 0.22 });
    this._tone({ type: 'sine', freq: 880, dur: 0.3, vol: 0.22, when: 0.12 });
    this._tone({ type: 'triangle', freq: 1320, dur: 0.4, vol: 0.1, when: 0.24 });
  }

  splash() {
    this._noise({ dur: 0.45, vol: 0.3, freq: 1400, freqEnd: 400, q: 0.7 });
  }

  pearl() {
    this._tone({ type: 'sine', freq: 1560, dur: 0.18, vol: 0.06 });
  }

  /** Rising reward sting when the combo increments; milestones add chord. */
  combo(combo) {
    const base = 520 + Math.min(combo, 14) * 55;
    this._tone({ type: 'sine', freq: base, dur: 0.16, vol: 0.2 });
    this._tone({ type: 'sine', freq: base * 1.33, dur: 0.24, vol: 0.2, when: 0.09 });
    if (combo >= 5) this._tone({ type: 'triangle', freq: base * 2, dur: 0.3, vol: 0.12, when: 0.18 });
    if (combo >= 10) this._tone({ type: 'triangle', freq: base * 2.66, dur: 0.42, vol: 0.1, when: 0.27 });
  }

  /** Called every frame — schedules ambient gull cries. */
  update(dt) {
    if (!this.ready || this.muted) return;
    this.gullTimer -= dt;
    if (this.gullTimer <= 0) {
      this.gullTimer = 5 + Math.random() * 9;
      this.seagull();
    }
  }

  dispose() {
    if (this.ctx) this.ctx.close();
    this.ready = false;
  }
}

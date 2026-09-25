// Procedural sound. No files: every cue is synthesised with WebAudio so the
// game stays a handful of small text files.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('mr-muted') === '1'; } catch (e) { /* private mode */ }
  }
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('mr-muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  tone({ type = 'sine', f0 = 440, f1 = f0, dur = 0.12, gain = 0.3, attack = 0.005 }) {
    const c = this.ensure();
    if (!c || this.muted) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise({ dur = 0.2, gain = 0.3, f = 800, q = 1 }) {
    const c = this.ensure();
    if (!c || this.muted) return;
    const t = c.currentTime;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource();
    s.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const g = c.createGain();
    g.gain.value = gain;
    s.connect(bp); bp.connect(g); g.connect(this.master);
    s.start(t);
  }
  jump() { this.tone({ type: 'triangle', f0: 220, f1: 520, dur: 0.14, gain: 0.18 }); }
  shard() {
    this.tone({ type: 'sine', f0: 1560, f1: 2080, dur: 0.09, gain: 0.12 });
    this.tone({ type: 'sine', f0: 3120, f1: 2600, dur: 0.06, gain: 0.05 });
  }
  stompStart() { this.tone({ type: 'sine', f0: 600, f1: 200, dur: 0.1, gain: 0.08 }); }
  stomp() {
    this.tone({ type: 'sine', f0: 160, f1: 40, dur: 0.28, gain: 0.4 });
    this.noise({ dur: 0.18, gain: 0.25, f: 300, q: 0.7 });
  }
  hit() {
    this.noise({ dur: 0.16, gain: 0.35, f: 2400, q: 0.5 });
    this.tone({ type: 'square', f0: 180, f1: 90, dur: 0.12, gain: 0.12 });
  }
  shatter() {
    this.noise({ dur: 0.25, gain: 0.2, f: 3800, q: 0.8 });
    this.tone({ type: 'sine', f0: 2400, f1: 900, dur: 0.2, gain: 0.06 });
  }
  aftershock() {
    this.tone({ type: 'sine', f0: 60, f1: 30, dur: 0.9, gain: 0.5 });
    this.noise({ dur: 0.8, gain: 0.18, f: 120, q: 0.4 });
  }
  die() {
    this.noise({ dur: 0.5, gain: 0.35, f: 1800, q: 0.6 });
    this.tone({ type: 'sawtooth', f0: 240, f1: 40, dur: 0.7, gain: 0.15 });
  }
}

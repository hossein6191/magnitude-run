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
  // pickup pitch steps up with the combo chain
  shard(step = 0) {
    const k = Math.pow(2, Math.min(8, step) / 12);
    this.tone({ type: 'sine', f0: 1560 * k, f1: 2080 * k, dur: 0.09, gain: 0.12 });
    this.tone({ type: 'sine', f0: 3120 * k, f1: 2600 * k, dur: 0.06, gain: 0.05 });
  }
  slide() { this.noise({ dur: 0.22, gain: 0.16, f: 900, q: 0.6 }); }
  closecall() { this.tone({ type: 'sine', f0: 880, f1: 1320, dur: 0.12, gain: 0.1 }); this.tone({ type: 'sine', f0: 1320, f1: 1760, dur: 0.14, gain: 0.08, attack: 0.08 }); }
  power() { this.tone({ type: 'triangle', f0: 440, f1: 880, dur: 0.18, gain: 0.16 }); this.tone({ type: 'triangle', f0: 660, f1: 1320, dur: 0.26, gain: 0.12, attack: 0.1 }); }
  shieldPop() { this.tone({ type: 'sine', f0: 1200, f1: 300, dur: 0.25, gain: 0.2 }); this.noise({ dur: 0.2, gain: 0.15, f: 3000, q: 0.8 }); }
  vent() { this.noise({ dur: 0.45, gain: 0.25, f: 700, q: 0.4 }); this.tone({ type: 'sine', f0: 200, f1: 700, dur: 0.35, gain: 0.12 }); }
  thud() { this.tone({ type: 'sine', f0: 120, f1: 50, dur: 0.18, gain: 0.25 }); this.noise({ dur: 0.1, gain: 0.15, f: 400, q: 0.7 }); }
  rise() { this.noise({ dur: 0.3, gain: 0.2, f: 500, q: 0.5 }); this.tone({ type: 'sawtooth', f0: 80, f1: 220, dur: 0.16, gain: 0.08 }); }
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

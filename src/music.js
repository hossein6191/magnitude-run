// Procedural adaptive music. No samples: everything is synthesised on the fly,
// like audio.js, so the game stays a handful of small text files.
//
// Timing uses the "two clocks" pattern. A JS setInterval wakes every 25ms and
// books every 8th-note event that falls inside the next 120ms on the audio
// clock (ctx.currentTime). The audio clock is sample-accurate and the JS timer
// is not, so as long as the lookahead is longer than the timer's jitter the
// jitter never reaches the ear. Every booked note is its own short-lived
// oscillator with an envelope; only the pad (two detuned saws) and the D drone
// stay alive and are retuned at chord changes, so at most ~6 oscillators run
// at once and idle cost is zero when the engine is asleep.
//
// Harmony: a D minor drone under a Dm - Bb - F - C loop, two bars per chord.
// The game feeds intensity (tempo, layers, pad brightness), danger (heartbeat)
// and state (title / playing / paused / over); the music never reads game code.

const MUSIC_LEVEL = 0.32;
const PAD_LEVEL = 0.14;
const LOOKAHEAD = 0.12;
const TICK_MS = 25;
const STEPS = 64; // 4 chords x 2 bars x 8 eighths
const ARP_PAT = [0, 1, 2, 3, 4, 5, 4, 3]; // up the six chord tones and part-way back, twice per chord

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Pad plays root + third only (drone and bass supply the rest), voiced so the
// two saws move as little as possible between chords. Arp uses the six chord
// tones from D4 upward. Bass is a sine an octave below the pad root.
function chord(name, pad, bass, pcs) {
  const arp = [];
  for (let m = 74; arp.length < 6; m++) if (pcs.includes(m % 12)) arp.push(m);
  return { name, pad, bass, arp };
}
const CHORDS = [
  chord('Dm', [62, 65], 50, [2, 5, 9]),
  chord('Bb', [58, 62], 46, [10, 2, 5]),
  chord('F', [65, 69], 53, [5, 9, 0]),
  chord('C', [60, 64], 48, [0, 4, 7]),
];

// Anchor at the current value, then ramp: never a jump, never a click.
function ramp(param, target, t, dur) {
  const v = Math.max(0.0001, param.value);
  param.cancelScheduledValues(t);
  param.setValueAtTime(v, t);
  param.exponentialRampToValueAtTime(Math.max(0.0001, target), t + dur);
}
// One-shot envelope: from zero with a tiny attack, exponential tail.
function env(param, t, peak, attack, dur) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + dur);
}

export class Music {
  // getCtx: () => AudioContext|null (null until the first gesture creates it).
  // getMaster: () => GainNode, the Sfx master; our own gain feeds into it so
  // the global mute also silences music.
  constructor(getCtx, getMaster) {
    this.getCtx = getCtx;
    this.getMaster = getMaster;
    this._enabled = true;
    try { this._enabled = localStorage.getItem('mr-music') !== '0'; } catch (e) { /* private mode */ }
    this.state = 'title';
    this.intensity = 0;
    this.danger = 0;
    this.wanted = false; // start() called and not stop()'d
    this.timer = null;
    this.graph = false; // shared nodes built
    this.live = false; // pad + drone oscillators running, notes being booked
    this.silentAt = null; // audio-clock time after which a fading engine may sleep
    this.voices = [];
    this.drone = null;
    this.step = 0;
    this.nextTime = 0;
  }

  get enabled() { return this._enabled; }

  // ---- public control ----
  start() {
    this.wanted = true;
    this._ensureTimer();
    const c = this._ctx();
    if (c) ramp(this.out.gain, this._outTarget(), c.currentTime, 0.3);
  }
  stop() {
    this.wanted = false;
    const c = this._ctx();
    if (!c) { this._clearTimer(); return; }
    ramp(this.out.gain, 0.0001, c.currentTime, 0.4);
    this._silenceBy(c, 0.42);
  }
  setEnabled(b) {
    this._enabled = !!b;
    try { localStorage.setItem('mr-music', b ? '1' : '0'); } catch (e) { /* ignore */ }
    this._ensureTimer();
    const c = this._ctx();
    if (!c) return;
    ramp(this.out.gain, this._outTarget(), c.currentTime, 0.3);
    if (!b) this._silenceBy(c, 0.32);
  }
  setIntensity(x) {
    this.intensity = clamp01(x);
    this._applyTone();
  }
  setDanger(n) {
    this.danger = Math.max(0, Math.min(3, Math.round(n)));
    this._applyTone();
  }
  setState(s) {
    this.state = s;
    this._ensureTimer();
    const c = this._ctx();
    if (!c) return;
    const dur = s === 'over' ? 1.5 : s === 'paused' ? 0.2 : 0.3;
    ramp(this.stateGain.gain, this._stateTarget(), c.currentTime, dur);
    if (s === 'over') this._silenceBy(c, 1.55);
    this._applyTone();
  }
  // Momentary dip on the whole mix: fast down, hold, ease back over the tail.
  duck(seconds) {
    const c = this._ctx();
    if (!c) return;
    const t = c.currentTime, g = this.bus.gain, len = Math.max(0.15, seconds || 0.6);
    ramp(g, 0.22, t, 0.04);
    g.setValueAtTime(0.22, t + Math.max(0.05, len - 0.45));
    g.exponentialRampToValueAtTime(1, t + len);
  }

  // ---- derived targets ----
  _outTarget() { return this.wanted && this._enabled ? MUSIC_LEVEL : 0.0001; }
  _stateTarget() { return this.state === 'over' ? 0.0001 : this.state === 'paused' ? 0.2 : 1; }
  _active() { return this.wanted && this._enabled && this.state !== 'over'; }
  _calm() { return this.state === 'title'; }
  _bpm() { return 92 + 40 * (this._calm() ? 0 : this.intensity); }
  _cutoff() { return 600 * Math.pow(4, this._calm() ? 0 : this.intensity); }
  _padTarget() { return PAD_LEVEL * (this.danger >= 2 && !this._calm() ? 0.7 : 1); }

  _applyTone() {
    const c = this._ctx();
    if (!c) return;
    const t = c.currentTime;
    ramp(this.padFilter.frequency, this._cutoff(), t, 0.4);
    if (this.live) ramp(this.padGain.gain, this._padTarget(), t, 0.5);
  }
  _silenceBy(c, fade) {
    const at = c.currentTime + fade;
    this.silentAt = this.silentAt == null ? at : Math.min(this.silentAt, at);
  }

  // ---- graph ----
  // Returns the context once it exists, building the shared nodes on first sight.
  _ctx() {
    const c = this.getCtx();
    if (!c) return null;
    if (!this.graph) this._build(c);
    return c;
  }
  _build(c) {
    const master = this.getMaster() || c.destination;
    // chain: voices -> bus (duck) -> stateGain (pause/over) -> out (level + enabled) -> Sfx master
    this.out = c.createGain();
    this.out.gain.value = 0;
    this.out.connect(master);
    this.stateGain = c.createGain();
    this.stateGain.gain.value = 1;
    this.stateGain.connect(this.out);
    this.bus = c.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.stateGain);
    // pad: saws + drone share one lowpass so intensity brightens both
    this.padGain = c.createGain();
    this.padGain.gain.value = 0;
    this.padGain.connect(this.bus);
    this.padFilter = c.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 600;
    this.padFilter.Q.value = 1.1;
    this.padFilter.connect(this.padGain);
    this.droneGain = c.createGain();
    this.droneGain.gain.value = 0.6;
    this.droneGain.connect(this.padFilter);
    // hats: shared highpass, one short noise buffer reused by every hit
    this.hatFilter = c.createBiquadFilter();
    this.hatFilter.type = 'highpass';
    this.hatFilter.frequency.value = 6000;
    this.hatFilter.connect(this.bus);
    const n = Math.floor(c.sampleRate * 0.1);
    this.noise = c.createBuffer(1, n, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.graph = true;
  }

  // ---- scheduler ----
  _ensureTimer() {
    if (this.wanted && !this.timer) this.timer = setInterval(() => this._tick(), TICK_MS);
  }
  _clearTimer() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  _tick() {
    const c = this._ctx();
    if (!c || c.state !== 'running') return; // no gesture yet, or suspended: retry next tick
    const now = c.currentTime;
    if (this._active()) {
      this.silentAt = null;
      if (!this.live) this._wake(c);
      this._schedule(c, now);
    } else if (this.live) {
      // fading: keep playing under the fade, then put the voices to sleep
      if (this.silentAt != null && now < this.silentAt) this._schedule(c, now);
      else this._sleep(c);
    } else {
      this._clearTimer(); // nothing to do until a setter re-arms us
    }
  }
  _schedule(c, now) {
    // A stalled timer (hidden tab, suspended context) would otherwise dump
    // every missed note at once; resync and carry on from here.
    if (this.nextTime < now - 0.05) this.nextTime = now + 0.02;
    while (this.nextTime < now + LOOKAHEAD) {
      this._step(c, this.nextTime, this.step);
      this.step = (this.step + 1) % STEPS;
      this.nextTime += 30 / this._bpm(); // one 8th
    }
  }
  _wake(c) {
    const t = c.currentTime;
    this.live = true;
    this.step = 0; // always restart on Dm so the loop opens the same way
    this.nextTime = t + 0.05;
    this.voices = CHORDS[0].pad.map((m, i) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(m);
      o.detune.value = i ? 7 : -7;
      o.onended = () => o.disconnect();
      o.connect(this.padFilter);
      o.start(t);
      return { o, f: hz(m) };
    });
    const dr = c.createOscillator();
    dr.type = 'triangle';
    dr.frequency.value = hz(50); // D2
    dr.onended = () => dr.disconnect();
    dr.connect(this.droneGain);
    dr.start(t);
    this.drone = dr;
    ramp(this.padFilter.frequency, this._cutoff(), t, 0.05);
    // pad swells in rather than snapping on
    this.padGain.gain.cancelScheduledValues(t);
    this.padGain.gain.setValueAtTime(0.0001, t);
    this.padGain.gain.exponentialRampToValueAtTime(this._padTarget(), t + 1.2);
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(1, t);
    ramp(this.stateGain.gain, this._stateTarget(), t, 0.3);
    ramp(this.out.gain, this._outTarget(), t, 0.3);
  }
  _sleep(c) {
    const t = c.currentTime;
    ramp(this.padGain.gain, 0.0001, t, 0.08);
    for (const v of this.voices) v.o.stop(t + 0.12);
    if (this.drone) this.drone.stop(t + 0.12);
    this.voices = [];
    this.drone = null;
    this.live = false;
    this.silentAt = null;
  }

  // ---- one 8th-note step ----
  _step(c, t, s) {
    const ch = CHORDS[(s >> 4) & 3];
    const pos = s & 7; // eighth within the bar: 0 = beat 1, 4 = beat 3, odd = off-beats
    const calm = this._calm();
    const x = calm ? 0 : this.intensity;
    if ((s & 15) === 0) this._retune(ch, t);
    if (pos === 0 || (!calm && pos === 4)) this._bass(c, t, ch);
    const arpLvl = clamp01((x - 0.3) / 0.25);
    if (arpLvl > 0) this._arp(c, t, ch, s, arpLvl);
    const hatLvl = clamp01((x - 0.6) / 0.25);
    if (hatLvl > 0 && (pos & 1)) this._hat(c, t, hatLvl);
    // heartbeat: lub-dub on beat 4 and its off-beat, leading into the downbeat
    if (!calm && this.danger >= 2 && (pos === 6 || pos === 7)) this._thump(c, t, pos === 7);
  }
  _retune(ch, t) {
    ch.pad.forEach((m, i) => {
      const v = this.voices[i];
      const f = hz(m);
      if (!v || v.f === f) return;
      const p = v.o.frequency;
      p.cancelScheduledValues(t);
      p.setValueAtTime(v.f, t);
      p.exponentialRampToValueAtTime(f, t + 0.09);
      v.f = f;
    });
  }
  _bass(c, t, ch) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.value = hz(ch.bass);
    env(g.gain, t, 0.5, 0.008, 0.42);
    o.connect(g); g.connect(this.bus);
    o.start(t); o.stop(t + 0.45);
  }
  _arp(c, t, ch, s, lvl) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.value = hz(ch.arp[ARP_PAT[s & 7]]);
    const accent = (s & 1) ? 0.7 : 1;
    env(g.gain, t, 0.07 * lvl * accent, 0.004, 0.2);
    o.connect(g); g.connect(this.bus);
    o.start(t); o.stop(t + 0.22);
  }
  _hat(c, t, lvl) {
    const src = c.createBufferSource(), g = c.createGain();
    src.buffer = this.noise;
    env(g.gain, t, 0.05 * lvl * (0.8 + Math.random() * 0.2), 0.002, 0.045);
    src.connect(g); g.connect(this.hatFilter);
    src.start(t); src.stop(t + 0.06);
  }
  _thump(c, t, second) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(second ? 58 : 66, t);
    o.frequency.exponentialRampToValueAtTime(second ? 34 : 40, t + 0.18);
    env(g.gain, t, second ? 0.55 : 0.42, 0.01, 0.2);
    o.connect(g); g.connect(this.bus);
    o.start(t); o.stop(t + 0.22);
  }
}

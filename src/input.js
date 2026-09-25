// Input: everything collapses to two verbs, JUMP and DOWN, plus a few
// system keys. Keyboard: Space/Up/W = jump, Down/S/Shift = down.
// Mouse: left = jump, right = down. Touch: two zones across the whole
// viewport (jump side / down side, swappable) and a swipe down anywhere.
// A touch on the jump side waits 60 ms before jumping so a flick down can
// become a slide instead; the game's jump buffer hides that delay.

const UI = '.panel, button, input, label, select, a, textarea';

export class Input {
  constructor(canvas, h) {
    this.canvas = canvas;
    this.h = h;
    this.touch = false;
    try { this.touch = (navigator.maxTouchPoints || 0) > 0 && matchMedia('(pointer: coarse)').matches; } catch (e) { /* ignore */ }
    this.layout = 'right';
    try { this.layout = localStorage.getItem('mr-layout') === 'left' ? 'left' : 'right'; } catch (e) { /* ignore */ }
    this.pointers = new Map();
    this.keys = new Set();
    this.bind();
  }

  setLayout(l) {
    this.layout = l === 'left' ? 'left' : 'right';
    try { localStorage.setItem('mr-layout', this.layout); } catch (e) { /* ignore */ }
  }

  isJumpZone(x) {
    const frac = x / (window.innerWidth || 1);
    return this.layout === 'right' ? frac >= 0.42 : frac < 0.58;
  }

  bind() {
    const jumpKey = (e) => e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW';
    const downKey = (e) => e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'ShiftLeft' || e.code === 'ShiftRight';
    const onUi = (e) => Boolean(e.target && e.target.closest && e.target.closest(UI));

    window.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // a focused button keeps Enter and Space for itself
      if (tag === 'BUTTON' && (e.code === 'Enter' || e.code === 'Space')) return;
      if (jumpKey(e)) { e.preventDefault(); if (!e.repeat && !this.keys.has('jump')) { this.keys.add('jump'); this.h.jump('key'); } return; }
      if (downKey(e)) { e.preventDefault(); if (!e.repeat && !this.keys.has('down')) { this.keys.add('down'); this.h.down('key'); } return; }
      if (e.code === 'Escape' || e.code === 'KeyP') { this.h.pause(); return; }
      if (e.code === 'KeyM') { this.h.mute(); return; }
      if (e.code === 'Enter' || e.code === 'KeyR') { this.h.restart(e); }
    });
    window.addEventListener('keyup', (e) => {
      if (jumpKey(e)) { e.preventDefault(); this.keys.delete('jump'); this.h.jumpRelease(); }
      else if (downKey(e)) { e.preventDefault(); this.keys.delete('down'); this.h.downRelease(); }
    });

    document.addEventListener('contextmenu', (e) => { if (!onUi(e)) e.preventDefault(); });
    document.addEventListener('pointerdown', (e) => {
      if (onUi(e) || !e.isPrimary) return;
      e.preventDefault();
      if (e.pointerType === 'touch') this.touch = true;
      let verb;
      if (e.pointerType === 'mouse') verb = e.button === 2 ? 'down' : 'jump';
      else verb = this.isJumpZone(e.clientX) ? 'jump' : 'down';
      const p = { verb, x: e.clientX, y: e.clientY, t: performance.now(), swiped: false, fired: false, timer: null };
      this.pointers.set(e.pointerId, p);
      if (verb === 'down') { p.fired = true; this.h.down('pointer'); return; }
      if (e.pointerType === 'mouse') { p.fired = true; this.h.jump('pointer'); return; }
      p.timer = setTimeout(() => { if (!p.swiped && !p.fired) { p.fired = true; this.h.jump('pointer'); } }, 60);
    });
    document.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p || p.swiped) return;
      const dy = e.clientY - p.y, dx = Math.abs(e.clientX - p.x);
      if (dy > 14 && dy > dx * 1.2 && performance.now() - p.t < 320) {
        p.swiped = true;
        clearTimeout(p.timer);
        if (p.verb === 'jump') {
          // a flick down on the jump side: cancel the pending (or just-started) jump into a slide
          if (p.fired) { this.h.jumpRelease(); this.h.swipe(); } else { p.fired = true; this.h.down('swipe'); }
          p.verb = 'down';
        }
      }
    });
    const up = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.pointers.delete(e.pointerId);
      clearTimeout(p.timer);
      if (!p.fired) {
        // a tap shorter than the swipe window: jump now, hold it for a medium hop
        p.fired = true;
        if (p.verb === 'jump') { this.h.jump('pointer'); setTimeout(() => this.h.jumpRelease(), 110); return; }
        this.h.down('pointer');
      }
      if (p.verb === 'jump') this.h.jumpRelease(); else this.h.downRelease();
    };
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    window.addEventListener('blur', () => { for (const p of this.pointers.values()) clearTimeout(p.timer); this.pointers.clear(); this.keys.clear(); this.h.jumpRelease(); this.h.downRelease(); });
  }
}

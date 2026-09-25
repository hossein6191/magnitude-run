// Input: everything collapses to two verbs, JUMP and DOWN, plus a few
// system keys. Keyboard: Space/Up/W = jump, Down/S/Shift = down.
// Mouse: left = jump, right = down. Touch: two zones (jump side / down side,
// swappable for left-handed players) and a swipe down anywhere = down.

export class Input {
  constructor(canvas, h) {
    this.canvas = canvas;
    this.h = h;
    this.touch = false;
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
    const w = this.canvas.getBoundingClientRect().width || window.innerWidth;
    const frac = (x - this.canvas.getBoundingClientRect().left) / w;
    return this.layout === 'right' ? frac >= 0.42 : frac < 0.58;
  }

  bind() {
    const c = this.canvas;
    const jumpKey = (e) => e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW';
    const downKey = (e) => e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'ShiftLeft' || e.code === 'ShiftRight';

    window.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
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

    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (e.pointerType === 'touch') this.touch = true;
      let verb;
      if (e.pointerType === 'mouse') verb = e.button === 2 ? 'down' : 'jump';
      else verb = this.isJumpZone(e.clientX) ? 'jump' : 'down';
      this.pointers.set(e.pointerId, { verb, x: e.clientX, y: e.clientY, t: performance.now(), swiped: false });
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (verb === 'jump') this.h.jump('pointer'); else this.h.down('pointer');
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p || p.swiped) return;
      const dy = e.clientY - p.y, dx = Math.abs(e.clientX - p.x);
      if (dy > 28 && dy > dx * 1.2 && performance.now() - p.t < 260) {
        p.swiped = true;
        // a swipe down converts the gesture: release the jump, press down
        if (p.verb === 'jump') { this.h.jumpRelease(); p.verb = 'down'; this.h.down('swipe'); }
      }
    });
    const up = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.pointers.delete(e.pointerId);
      if (p.verb === 'jump') this.h.jumpRelease(); else this.h.downRelease();
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    window.addEventListener('blur', () => { this.pointers.clear(); this.keys.clear(); this.h.jumpRelease(); this.h.downRelease(); });
  }
}

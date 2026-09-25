// Stub DOM/browser globals so the game modules load in Node (used by smoke.mjs).
const noop = () => {};
const ctxTarget = { letterSpacing: '0px', globalAlpha: 1 };
const ctx = new Proxy(ctxTarget, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'createImageData' || k === 'getImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, (w | 0) * (h | 0)) * 4) });
    return noop;
  },
  set(t, k, v) { t[k] = v; return true; },
});
const fakeCanvas = () => ({ width: 0, height: 0, style: {}, getContext: () => ctx, addEventListener: noop, getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }) });
const store = new Map();
globalThis.window = globalThis;
globalThis.innerWidth = 960; globalThis.innerHeight = 540; globalThis.devicePixelRatio = 1;
globalThis.addEventListener = noop; globalThis.removeEventListener = noop;
globalThis.requestAnimationFrame = () => 0;
globalThis.matchMedia = () => ({ matches: false, addEventListener: noop });
Object.defineProperty(globalThis, 'navigator', { value: { maxTouchPoints: 0 }, configurable: true });
globalThis.document = { createElement: () => fakeCanvas(), addEventListener: noop, hidden: false, fonts: { load: async () => [] } };
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.__fakeCanvas = fakeCanvas;

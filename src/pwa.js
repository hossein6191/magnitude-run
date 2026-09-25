// PWA glue. Registers the service worker and holds on to the browser's
// install prompt so the UI can offer an Install button when it wants to, not
// when the browser feels like it. Everything is best-effort: no https, no
// service worker support, private mode or a browser without
// beforeinstallprompt must never break the game, so nothing here throws.

let deferred = null;      // BeforeInstallPromptEvent, usable exactly once
let installed = false;
let bound = false;
let regPromise = null;    // memoised so a second registerPwa() is a no-op
const listeners = new Set();

function isSecureHost() {
  try {
    const h = location.hostname;
    return location.protocol === 'https:' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost');
  } catch (e) { return false; }
}

// True when running as an installed app (home screen, dock). An Install
// button is pointless there.
export function isStandalone() {
  try {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  } catch (e) { return false; }
}

export function canInstall() { return Boolean(deferred) && !installed && !isStandalone(); }

function notify() {
  const v = canInstall();
  for (const cb of listeners) { try { cb(v); } catch (e) { /* listener's problem, not ours */ } }
}

// Subscribe to canInstall() changes; returns an unsubscribe function. The UI
// shows or hides its Install button from this.
export function onInstallChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Shows the native install dialog. Resolves true when the user accepted. The
// stored event can be prompted only once, so it is dropped either way; the
// browser fires a fresh beforeinstallprompt later if the page still qualifies.
export async function promptInstall() {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  notify();
  try {
    await e.prompt();
    const choice = await e.userChoice;
    return Boolean(choice && choice.outcome === 'accepted');
  } catch (err) { return false; }
}

function bindInstallEvents() {
  if (bound) return;
  bound = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();   // no mini-infobar; the UI decides when to ask
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true; deferred = null; notify();
  });
}

// Registers ./sw.js (relative to the page, not to this module) after load so
// the worker does not compete with the game's own first fetches. Resolves to
// the registration, or null when there is nothing to register; never rejects.
// opts.onUpdate fires once a newer worker has taken over: the next load runs
// the new build, so the UI may offer a reload between runs.
export function registerPwa(opts = {}) {
  try { bindInstallEvents(); } catch (e) { /* no window */ }
  if (regPromise) return regPromise;
  regPromise = new Promise((resolve) => {
    try {
      if (!('serviceWorker' in navigator) || !isSecureHost()) { resolve(null); return; }
      const sw = navigator.serviceWorker;
      let hadController = Boolean(sw.controller);
      sw.addEventListener('controllerchange', () => {
        // First activation also fires this (clients.claim); only a takeover is an update.
        if (hadController && typeof opts.onUpdate === 'function') { try { opts.onUpdate(); } catch (e) { /* ignore */ } }
        hadController = true;
      });
      const go = () => sw.register('./sw.js').then(resolve, () => resolve(null));
      if (document.readyState === 'complete') go();
      else window.addEventListener('load', go, { once: true });
    } catch (e) { resolve(null); }
  });
  return regPromise;
}

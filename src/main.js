import { Game } from './game.js';
import { renderCard } from './card.js';
import { LADDER, tierFor } from './score.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const title = $('title');
const over = $('over');
const pageUrl = location.origin + location.pathname;

function loadBest() { try { return JSON.parse(localStorage.getItem('mr-best') || 'null'); } catch (e) { return null; } }
function saveBest(b) { try { localStorage.setItem('mr-best', JSON.stringify(b)); } catch (e) { /* ignore */ } }
const fmtM = (m) => 'M ' + m.toFixed(2);
let best = loadBest();
let lastCard = null;
let lastRes = null;

function renderLadder(m) {
  const tier = m == null ? null : tierFor(m);
  $('ladder').innerHTML = LADDER.map(([v, name]) =>
    `<div class="${tier === name ? 'on' : ''}"><b>${v}+</b>${name}</div>`).join('');
}
function refreshBest() {
  $('best-title').textContent = best ? fmtM(best.m) : '—';
  renderLadder(best ? best.m : null);
}
refreshBest();

const game = new Game(canvas, {
  onStartRequest: startRun,
  onOver: async (res) => {
    lastRes = res;
    const isNew = !best || res.m > best.m;
    if (isNew) { best = { m: res.m, dist: res.dist, shards: res.shards, date: res.date }; saveBest(best); }
    $('o-mag').textContent = res.m.toFixed(2);
    $('o-tier').textContent = res.tier;
    $('o-dist').textContent = Math.floor(res.dist).toLocaleString('en-US') + ' m';
    $('o-shards').textContent = String(res.shards);
    $('o-zone').textContent = String(res.zone);
    $('o-best').textContent = fmtM(best.m);
    $('o-note').innerHTML = isNew ? '<span class="new">New best.</span> Press Enter to run again.' : 'Press Enter to run again.';
    $('o-card').removeAttribute('src');
    over.classList.remove('hidden');
    $('btn-again').focus();
    lastCard = await renderCard(res, pageUrl.replace(/^https?:\/\//, ''));
    $('o-card').src = lastCard.toDataURL('image/png');
    refreshBest();
  },
});

function startRun() {
  title.classList.add('hidden');
  over.classList.add('hidden');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  game.start();
}

$('btn-run').addEventListener('click', startRun);
$('btn-again').addEventListener('click', startRun);

function shareText() {
  if (!lastRes) return '';
  return `I reached M ${lastRes.m.toFixed(2)} (${lastRes.tier}) on Magnitude Run: ${Math.floor(lastRes.dist)} m along the trace, ${lastRes.shards} shards. A Seismic community build. ${pageUrl}`;
}
function flash(btn, text) {
  const old = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = old; }, 1500);
}
$('btn-save').addEventListener('click', () => {
  if (!lastCard || !lastRes) return;
  const a = document.createElement('a');
  a.href = lastCard.toDataURL('image/png');
  a.download = `magnitude-run-M${lastRes.m.toFixed(2)}.png`;
  a.click();
});
$('btn-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(shareText()); flash($('btn-copy'), 'Copied'); }
  catch (e) { flash($('btn-copy'), 'Copy failed'); }
});
$('btn-share').addEventListener('click', () => {
  if (!lastCard || !lastRes) return;
  lastCard.toBlob(async (blob) => {
    const file = new File([blob], `magnitude-run-M${lastRes.m.toFixed(2)}.png`, { type: 'image/png' });
    const data = { files: [file], text: shareText(), title: 'Magnitude Run' };
    try {
      if (navigator.canShare && navigator.canShare(data)) await navigator.share(data);
      else if (navigator.share) await navigator.share({ text: shareText(), title: 'Magnitude Run' });
      else { await navigator.clipboard.writeText(shareText()); flash($('btn-share'), 'Text copied'); }
    } catch (e) { /* user dismissed */ }
  }, 'image/png');
});

// sound
const mute = $('btn-mute');
function refreshMute() { mute.textContent = game.sfx.muted ? 'sound off' : 'sound on'; }
refreshMute();
mute.addEventListener('click', () => { game.sfx.setMuted(!game.sfx.muted); game.sfx.ensure(); refreshMute(); });

// input
const isJumpKey = (e) => e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW';
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (isJumpKey(e)) {
    e.preventDefault();
    if (e.repeat) return;
    if (game.state === 'over') return;
    game.press();
  } else if (e.code === 'Enter' || e.code === 'KeyR') {
    if (game.state === 'title' || game.state === 'over') { e.preventDefault(); startRun(); }
  } else if (e.code === 'Escape' || e.code === 'KeyP') {
    game.togglePause();
  } else if (e.code === 'KeyM') {
    game.sfx.setMuted(!game.sfx.muted); refreshMute();
  }
});
window.addEventListener('keyup', (e) => { if (isJumpKey(e)) { e.preventDefault(); game.release(); } });
canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); game.press(); });
window.addEventListener('pointerup', () => game.release());
window.addEventListener('pointercancel', () => game.release());
window.addEventListener('blur', () => game.release());
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'playing') game.togglePause(); });

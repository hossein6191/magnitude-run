import { Game } from './game.js';
import { Input } from './input.js';
import { renderCard } from './card.js';
import { net, fmtRank } from './net.js';
import { Missions } from './missions.js';
import { applySkin } from './rocky.js';
import { registerPwa, canInstall, promptInstall, onInstallChange } from './pwa.js';
import { $, show, hide, renderLadder, renderBoard, renderRank, renderMissions, renderSkins, renderStats, renderOver } from './ui.js';

const canvas = $('game');
const pageUrl = location.origin + location.pathname;
const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
const fmtM = (m) => 'M ' + m.toFixed(2);

// ---- state ----
const settings = Object.assign({ sound: true, music: true, shake: true, hints: true, vibrate: true, left: false }, read('mr-settings', {}));
let mode = 'endless';
let best = read('mr-best', null);
let bestDaily = read('mr-best-daily', null);
let lastCard = null, lastRes = null, pendingStart = null, runToken = null, submitted = null;
const missions = new Missions();
applySkin(missions.getSkin());

// ---- game ----
const game = new Game(canvas, {
  onStartRequest: () => startRun(),
  onEvent: (name, value) => { if (name === 'run_start' || game.debugStart > 0) return; missions.track(name, value); },
  onTick: (st) => { if (game.debugStart === 0) missions.runTick(st); },
  onPause: (paused) => { if (settings.vibrate && navigator.vibrate) navigator.vibrate(0); },
  onVibrate: (pattern) => { if (settings.vibrate && input.touch && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* ignore */ } } },
  onOver: onOver,
});
game.settings.shake = settings.shake;
game.settings.hints = settings.hints;
game.best = best;
// ?start=1200 begins an endless run 1200 m in (for practice and testing; such runs are not posted)
game.debugStart = Math.max(0, Number(new URLSearchParams(location.search).get('start')) || 0);
game.sfx.setMuted(!settings.sound);
game.music.setEnabled(settings.music);

const input = new Input(canvas, {
  jump: () => game.jump(),
  jumpRelease: () => game.jumpRelease(),
  down: () => game.down(),
  downRelease: () => game.downRelease(),
  pause: () => { if (game.state === 'playing' || game.state === 'paused') game.togglePause(); else closePanels(); },
  mute: () => { settings.sound = !settings.sound; applySettings(); },
  swipe: () => game.swipe(),
  restart: (e) => { if (game.state === 'title' || game.state === 'over') { e.preventDefault(); startRun(); } },
});
input.setLayout(settings.left ? 'left' : 'right');
let overAt = 0;

// unlock audio on the first gesture so title music can play
const unlock = () => { game.sfx.ensure(); };
window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', unlock, { once: true });

// ---- runs ----
function refreshTitle() {
  const b = mode === 'daily' ? bestDaily && bestDaily.date === net.dailyDate() ? bestDaily : null : best;
  $('best-title').textContent = b ? fmtM(b.m) : '—';
  renderLadder(b ? b.m : null);
  $('daily-date').textContent = net.dailyDate().slice(5);
  renderRank(missions.rank());
  document.querySelectorAll('.mode').forEach((el) => { const on = el.dataset.mode === mode; el.classList.toggle('on', on); el.setAttribute('aria-selected', on ? 'true' : 'false'); });
}
function closePanels() { ['board', 'missions', 'settings'].forEach(hide); }

let starting = false;
async function startRun() {
  if (starting) return;
  if (game.state === 'over' && performance.now() - overAt < 750) return;
  starting = true;
  try {
    closePanels();
    hide('title'); hide('over'); hide('btn-mute');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    submitted = null; runToken = null;
    pendingStart = net.startRun().then((r) => { runToken = r && r.token ? r.token : null; return r; });
    let seed = 0, date = net.dailyDate();
    if (mode === 'daily') {
      // the daily course comes from the server (its seed is secret); offline falls back to the public seed
      const r = await Promise.race([pendingStart, new Promise((res) => setTimeout(() => res(null), 2000))]);
      if (r && r.seed) { seed = r.seed; date = r.date; } else seed = net.dailySeed(date);
    }
    if (game.debugStart === 0) missions.runStart(mode);
    game.best = mode === 'endless' ? best : null;
    game.settings.shake = settings.shake; game.settings.hints = settings.hints;
    game.start(mode, seed, date);
    showZones();
  } finally { starting = false; }
}

function showZones() {
  if (!input.touch) return;
  const seen = read('mr-zones', 0);
  if (seen >= 3) return;
  write('mr-zones', seen + 1);
  $('zones').classList.toggle('left', settings.left);
  show('zones');
  setTimeout(() => hide('zones'), 3500);
}

async function onOver(res) {
  overAt = performance.now();
  lastRes = res;
  show('btn-mute');
  const practice = game.debugStart > 0;
  const missionRes = practice ? null : missions.runEnd({ m: res.m, dist: res.dist, shards: res.shards, zone: res.zone, mode: res.mode, duration: res.duration });
  let isNew = false;
  if (practice) { /* practice runs are not records */ }
  else if (res.mode === 'daily') {
    if (!bestDaily || bestDaily.date !== res.date || res.m > bestDaily.m) { bestDaily = { m: res.m, dist: res.dist, shards: res.shards, date: res.date }; write('mr-best-daily', bestDaily); isNew = true; }
  } else if (!best || res.m > best.m) {
    best = { m: res.m, dist: res.dist, shards: res.shards, date: res.date }; write('mr-best', best); isNew = true; game.best = best;
  }
  renderOver(res, res.mode === 'daily' ? bestDaily : best, missionRes);
  $('o-note').innerHTML = (practice ? 'Practice run from ' + game.debugStart + ' m: not recorded. ' : isNew ? '<span class="new">New best.</span> ' : '') + 'Press Enter to run again.';
  $('o-card').removeAttribute('src');
  hide('o-name');
  show('over');
  $('btn-again').focus();
  refreshTitle();
  lastCard = await renderCard({ ...res, name: net.name() }, pageUrl.replace(/^https?:\/\//, ''));
  $('o-card').src = lastCard.toDataURL('image/png');
  postScore(res);
}

async function postScore(res) {
  if (game.debugStart > 0) { $('o-rank').textContent = 'practice'; return; }
  const start = await pendingStart;
  if (!start || !start.token) { $('o-rank').textContent = net.online ? '—' : 'offline'; return; }
  if (!net.name()) {
    $('name-input').value = '';
    show('o-name');
    $('o-rank').textContent = 'add a name';
    return;
  }
  $('o-rank').textContent = 'posting…';
  const r = await net.submit({ token: start.token, mode: res.mode, dist: res.dist, shards: res.shards, zone: res.zone, m: res.m, killer: res.killer, seed: res.seed });
  submitted = r;
  if (!r) { $('o-rank').textContent = net.online ? 'not posted' : 'offline'; return; }
  if (r.ok === false) { $('o-rank').textContent = r.error === 'token used' ? 'posted' : 'rejected'; return; }
  $('o-rank').textContent = r.rank ? fmtRank(r.rank, r.total) : 'posted';
  if (r.improved && r.rank) $('o-note').innerHTML += ` <span class="new">${fmtRank(r.rank, r.total)} on the ${res.mode === 'daily' ? 'daily' : 'all-time'} board.</span>`;
}

$('btn-name').addEventListener('click', () => {
  const v = $('name-input').value.trim();
  if (v.length < 2) { $('name-input').focus(); return; }
  net.setName(v);
  $('board-name').value = net.name();
  hide('o-name');
  if (lastRes) postScore(lastRes);
});
$('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('btn-name').click(); } e.stopPropagation(); });

// ---- title buttons ----
$('btn-run').addEventListener('click', startRun);
$('btn-again').addEventListener('click', startRun);
$('btn-home').addEventListener('click', () => { hide('over'); show('btn-mute'); game.state = 'title'; game.reset(); game.music.start(); game.music.setState('title'); show('title'); refreshTitle(); });
document.querySelectorAll('.mode').forEach((el) => el.addEventListener('click', () => { mode = el.dataset.mode; refreshTitle(); el.blur(); }));
document.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => hide(el.dataset.close)));

// leaderboard
let boardTab = 'global', boardSeq = 0;
async function openBoard() {
  const seq = ++boardSeq;
  closePanels(); show('board');
  $('board-name').value = net.name();
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.board === boardTab));
  $('board-status').textContent = 'Loading…';
  $('board-list').innerHTML = ''; $('board-you').textContent = '';
  const data = await net.board(boardTab, { limit: 25 });
  if (seq !== boardSeq || $('board').classList.contains('hidden')) return;
  renderBoard(data, net.pid(), boardTab);
}
$('btn-board').addEventListener('click', openBoard);
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { boardTab = t.dataset.board; openBoard(); }));
$('btn-board-name').addEventListener('click', () => { $('board-name').value = net.setName($('board-name').value); $('btn-board-name').textContent = 'Saved'; setTimeout(() => { $('btn-board-name').textContent = 'Save'; }, 1200); });
$('board-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('btn-board-name').click(); } e.stopPropagation(); });

// missions
function openMissions() {
  closePanels(); show('missions');
  renderRank(missions.rank());
  renderMissions(missions.list());
  const pickSkin = (id) => { if (missions.setSkin(id)) { applySkin(id); renderSkins(missions, pickSkin); } };
  renderSkins(missions, pickSkin);
  renderStats(missions.stats());
}
$('btn-missions').addEventListener('click', openMissions);

// settings
function applySettings() {
  write('mr-settings', settings);
  game.sfx.setMuted(!settings.sound);
  game.music.setEnabled(settings.music);
  game.settings.shake = settings.shake;
  game.settings.hints = settings.hints;
  input.setLayout(settings.left ? 'left' : 'right');
  $('btn-mute').textContent = settings.sound ? 'sound on' : 'sound off';
  for (const k of ['sound', 'music', 'shake', 'hints', 'vibrate', 'left']) $('s-' + k).checked = settings[k];
}
for (const k of ['sound', 'music', 'shake', 'hints', 'vibrate', 'left']) $('s-' + k).addEventListener('change', (e) => { settings[k] = e.target.checked; applySettings(); game.sfx.ensure(); });
$('btn-settings').addEventListener('click', () => { closePanels(); show('settings'); });
$('btn-mute').addEventListener('click', () => { settings.sound = !settings.sound; applySettings(); game.sfx.ensure(); });
applySettings();

// share / save / copy
function shareText() {
  if (!lastRes) return '';
  const where = lastRes.mode === 'daily' ? `Daily ${lastRes.date}` : 'Endless';
  const rank = submitted && submitted.ok && submitted.rank ? ` ${fmtRank(submitted.rank, submitted.total)}.` : '';
  return `Magnitude Run · ${where}: M ${lastRes.m.toFixed(2)} (${lastRes.tier}), ${Math.floor(lastRes.dist)} m, ${lastRes.shards} shards, cracked by ${lastRes.killer || 'nothing'}.${rank} Beat me: ${pageUrl}`;
}
function flash(btn, text) { const old = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = old; }, 1500); }
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

// pwa: the worker is skipped on localhost (add ?pwa=1 to test it) so development always loads fresh files
const params = new URLSearchParams(location.search);
const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
if (!isLocal || params.has('pwa')) registerPwa();
else if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
onInstallChange((ok) => $('btn-install').classList.toggle('hidden', !ok));
$('btn-install').classList.toggle('hidden', !canInstall());
$('btn-install').addEventListener('click', () => promptInstall());

if (!params.has('nopause')) document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'playing') game.togglePause(); });
refreshTitle();

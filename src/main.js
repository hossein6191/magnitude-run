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
const settings = Object.assign({ sound: true, music: true, shake: true, hints: true, vibrate: true, left: false, mute: false }, read('mr-settings', {}));
let mode = 'endless';
let best = read('mr-best', null);
let bestDaily = read('mr-best-daily', null);
let lastCard = null, lastRes = null, lastStart = null, pendingStart = null, runToken = null, submitted = null;
// runSeq ties async work to the run it belongs to; dailyCache keeps the day's course seed
let runSeq = 0, dailyCache = null;
const missions = new Missions();
applySkin(missions.getSkin());

// vibration needs a real tap first; Chrome logs an error for every call before one
const canVibrate = () => settings.vibrate && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive);

// ---- game ----
const game = new Game(canvas, {
  onStartRequest: () => startRun(),
  onEvent: (name, value) => { if (name === 'run_start' || game.debugStart > 0) return; missions.track(name, value); },
  onTick: (st) => { if (game.debugStart === 0) missions.runTick(st); },
  onPause: () => { if (canVibrate()) { try { navigator.vibrate(0); } catch (e) { /* ignore */ } } },
  onVibrate: (pattern) => { if (canVibrate() && input.touch) { try { navigator.vibrate(pattern); } catch (e) { /* ignore */ } } },
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
  mute: () => { settings.mute = !settings.mute; applySettings(); },
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
    submitted = null; runToken = null; runSeq++;
    pendingStart = net.startRun().then((r) => {
      runToken = r && r.token ? r.token : null;
      if (r && r.seed && r.date) dailyCache = { date: r.date, seed: r.seed };
      return r;
    });
    let seed = 0, date = net.dailyDate();
    if (mode === 'daily') {
      // The daily course comes from the server (its seed is secret) and is the same all day, so
      // only the first daily run of the day waits for it; the run's own token arrives meanwhile.
      // The request has a 3.5 s cap; a run on the public fallback course is offline and not posted.
      if (dailyCache && dailyCache.date === date) seed = dailyCache.seed;
      else {
        game.status = 'Fetching today’s course…';
        const r = await pendingStart;
        if (r && r.seed) { seed = r.seed; date = r.date; } else seed = net.dailySeed(date);
      }
    }
    if (game.debugStart === 0) missions.runStart(mode);
    game.best = mode === 'endless' ? best : null;
    game.settings.shake = settings.shake; game.settings.hints = settings.hints;
    game.start(mode, seed, date);
    // the tab may have been hidden while the course loaded
    if (document.hidden && !new URLSearchParams(location.search).has('nopause')) game.togglePause();
    lockLandscape();
    showZones();
  } finally { starting = false; game.status = ''; }
}

// phones held upright get a one-line nudge; the run is laid out for landscape
const portrait = window.matchMedia ? matchMedia('(orientation: portrait)') : null;
function syncRotate() {
  const on = Boolean(input.touch && portrait && portrait.matches);
  document.body.classList.toggle('portrait-touch', on);
  $('rotate').classList.toggle('hidden', !on);
}
if (portrait && portrait.addEventListener) portrait.addEventListener('change', syncRotate);
window.addEventListener('pointerdown', syncRotate, { once: true });
syncRotate();
function lockLandscape() {
  // only possible in the installed app or fullscreen; everywhere else the hint above does the job
  try { const o = screen.orientation; if (o && o.lock && input.touch) o.lock('landscape').catch(() => {}); } catch (e) { /* unsupported */ }
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
  // bind this run's token and id now: a restart during the card render replaces both
  const seq = runSeq, startP = pendingStart;
  lastRes = res; lastStart = startP;
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
  const card = await renderCard({ ...res, name: net.name() }, pageUrl.replace(/^https?:\/\//, ''));
  if (seq === runSeq) { lastCard = card; $('o-card').src = card.toDataURL('image/png'); }
  postScore(res, startP, seq);
}

// Posts one run. The post itself always goes through (its token is single-use, so
// letting it land is what keeps the score); writes to the over screen only happen
// while that run's screen is still the one shown.
async function postScore(res, startP, seq) {
  const live = () => seq === runSeq;
  const rank = (t) => { if (live()) $('o-rank').textContent = t; };
  if (game.debugStart > 0) { rank('practice'); return; }
  const start = await startP;
  if (!start || !start.token) { rank(net.online ? '—' : 'offline'); return; }
  if (!net.name()) {
    if (!live()) return;
    $('name-input').value = '';
    show('o-name');
    rank('add a name');
    return;
  }
  if (res.mode === 'daily' && start.seed !== res.seed) { rank('offline course'); return; }
  rank('posting…');
  const body = { token: start.token, mode: res.mode, dist: res.dist, shards: res.shards, zone: res.zone, m: res.m, killer: res.killer, seed: res.seed };
  let r = await net.submit(body);
  // one retry with the same token: the server spends a token only once, so this cannot double-post
  if (!r) r = await net.submit(body);
  if (live()) submitted = r;
  if (!r || (r.ok === false && r.error === 'token used')) {
    // unknown, or an earlier attempt landed: the board says where this run stands
    net.invalidate();
    const b = await net.board(res.mode === 'daily' ? 'daily' : 'global', { limit: 1, date: res.date });
    const y = b && b.you;
    // only claim a rank the stored entry earns: it must be at least as good as this run
    if (y && y.rank && Number(y.m) >= Number(res.m.toFixed(2)) - 0.001) { rank(fmtRank(y.rank, b.total)); return; }
    rank(r ? 'posted' : net.online ? 'not posted' : 'offline');
    return;
  }
  if (r.ok === false) { rank(r.error === 'busy' ? 'busy, try later' : 'rejected'); return; }
  rank(r.rank ? fmtRank(r.rank, r.total) : 'posted');
  if (live() && r.improved && r.rank) $('o-note').innerHTML += ` <span class="new">${fmtRank(r.rank, r.total)} on the ${res.mode === 'daily' ? 'daily' : 'all-time'} board.</span>`;
}

$('btn-name').addEventListener('click', () => {
  const v = $('name-input').value.trim();
  if (v.length < 2) { $('name-input').focus(); return; }
  net.setName(v);
  $('board-name').value = net.name();
  hide('o-name');
  if (lastRes) postScore(lastRes, lastStart, runSeq);
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
  game.sfx.setMuted(settings.mute || !settings.sound);
  game.music.setEnabled(settings.music && !settings.mute);
  game.settings.shake = settings.shake;
  game.settings.hints = settings.hints;
  input.setLayout(settings.left ? 'left' : 'right');
  $('btn-mute').textContent = settings.mute ? 'sound off' : 'sound on';
  for (const k of ['sound', 'music', 'shake', 'hints', 'vibrate', 'left']) $('s-' + k).checked = settings[k];
}
for (const k of ['sound', 'music', 'shake', 'hints', 'vibrate', 'left']) $('s-' + k).addEventListener('change', (e) => { settings[k] = e.target.checked; applySettings(); game.sfx.ensure(); });
$('btn-settings').addEventListener('click', () => { closePanels(); show('settings'); });
$('btn-mute').addEventListener('click', () => { settings.mute = !settings.mute; applySettings(); game.sfx.ensure(); });
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
if (params.has('debug')) window.__mr = game;   // console access while developing
const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
if (!isLocal || params.has('pwa')) registerPwa();
else if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
onInstallChange((ok) => $('btn-install').classList.toggle('hidden', !ok));
$('btn-install').classList.toggle('hidden', !canInstall());
$('btn-install').addEventListener('click', () => promptInstall());

if (!params.has('nopause')) document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'playing') game.togglePause(); });
refreshTitle();

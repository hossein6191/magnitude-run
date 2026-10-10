import { Game } from './game.js';
import { Input } from './input.js';
import { renderCard } from './card.js';
import { net, fmtRank, cleanName } from './net.js';
import { mergeSave, saveSummary } from './save.js';
import { drawIcons } from './howto.js';
import { Missions } from './missions.js';
import { applySkin } from './rocky.js';
import { registerPwa, canInstall, promptInstall, onInstallChange } from './pwa.js';
import { $, show, hide, renderLadder, renderBoard, renderMiniBoard, renderRank, renderMissions, renderSkins, renderStats, renderOver } from './ui.js';

const canvas = $('game');
const pageUrl = location.origin + location.pathname;
const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
const fmtM = (m) => 'M ' + m.toFixed(2);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isOpen = (id) => !$(id).classList.contains('hidden');
// the runner and how-to panels take the screen: nothing behind them may start a run
const modalOpen = () => isOpen('who') || isOpen('howto');

// ---- state ----
const settings = Object.assign({ sound: true, music: true, shake: true, hints: true, vibrate: true, left: false, mute: false }, read('mr-settings', {}));
let mode = 'endless';
// The runner: net.name() is the confirmed runner's name ('' for none). Each runner's
// progress and bests live in their own storage slots ('mr-progress:<name>' ...);
// the bare keys hold play without a name (and the version before runner names).
const runnerKeyOf = (n) => (n ? n.toLowerCase() : '');
const slot = (base, n = net.name()) => (n ? `${base}:${runnerKeyOf(n)}` : base);
// A name kept from before runner names (or never confirmed) is not an identity yet:
// the runner panel offers it, so 'is this you?' can run before anything is merged.
if (net.name() && read('mr-runner', '') !== runnerKeyOf(net.name())) { write('mr-name-suggest', net.name()); net.setName(''); }
let best = read(slot('mr-best'), null);
let bestDaily = read(slot('mr-best-daily'), null);
let lastCard = null, lastRes = null, lastStart = null, pendingStart = null, runToken = null, submitted = null;
// runSeq ties async work to the run it belongs to; dailyCache keeps the day's course seed
let runSeq = 0, dailyCache = null;
const missions = new Missions(slot('mr-progress'));
applySkin(missions.getSkin());

// vibration needs a real tap first; Chrome logs an error for every call before one
const canVibrate = () => settings.vibrate && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive);

// ---- game ----
const game = new Game(canvas, {
  onStartRequest: () => { if (!modalOpen()) runOrGuide(); },
  onEvent: (name, value) => { if (name === 'run_start' || game.debugStart > 0) return; missions.track(name, value); },
  onTick: (st) => { if (game.debugStart === 0) missions.runTick(st); },
  onPause: () => {
    setPauseLabel();
    if (canVibrate()) { try { navigator.vibrate(0); } catch (e) { /* ignore */ } }
  },
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
  pause: () => { if (game.state === 'playing' || game.state === 'paused') game.togglePause(); else backToMenu(); },
  mute: () => { settings.mute = !settings.mute; applySettings(); },
  swipe: () => game.swipe(),
  restart: (e) => {
    if (modalOpen() || (game.state !== 'title' && game.state !== 'over')) return;
    e.preventDefault();
    if (game.state === 'title') runOrGuide(); else startRun();
  },
});
input.setLayout(settings.left ? 'left' : 'right');
let overAt = 0;
game.touchUi = input.touch;   // the pause button sits top centre: the HUD banner moves below it
function setPauseLabel() {
  const p = game.state === 'paused';
  $('btn-pause').textContent = p ? '▶' : 'II';
  $('btn-pause').setAttribute('aria-label', p ? 'Resume' : 'Pause');
}

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
function closePanels() { ['board', 'missions', 'settings', 'howto'].forEach(hide); }
// Esc or Back on a menu: close what is open and return to the screen underneath
function backToMenu() {
  if (isOpen('who')) return;
  if (isOpen('howto')) write('mr-howto-seen', true);
  closePanels();
  if (game.state === 'title') show('title');
}

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
      // keep the day's seed until 5 s before the server's next UTC midnight (server time, so a
      // skewed phone clock cannot serve yesterday's course with today's token)
      if (r && r.seed && r.date && r.now) dailyCache = { date: r.date, seed: r.seed, until: Date.now() + (86400000 - (r.now % 86400000)) - 5000 };
      return r;
    });
    let seed = 0, date = net.dailyDate();
    if (mode === 'daily') {
      // The daily course comes from the server (its seed is secret) and is the same all day, so
      // only the first daily run of the day waits for it; the run's own token arrives meanwhile.
      // The request has a 3.5 s cap; a run on the public fallback course is offline and not posted.
      if (dailyCache && Date.now() < dailyCache.until) { seed = dailyCache.seed; date = dailyCache.date; }
      else {
        game.status = 'Fetching today’s course…';
        const r = await pendingStart;
        if (r && r.seed) { seed = r.seed; date = r.date; } else seed = net.dailySeed(date);
      }
    }
    // the first run of a visit builds on the runner's save from the server, not a stale copy
    if (initialSync) {
      game.status = game.status || 'Loading your progress…';
      await Promise.race([initialSync, new Promise((ok) => setTimeout(ok, 4000))]);
      initialSync = null;
    }
    if (game.debugStart === 0) missions.runStart(mode);
    game.best = mode === 'endless' ? best : null;
    game.settings.shake = settings.shake; game.settings.hints = settings.hints;
    game.start(mode, seed, date);
    // the tab may have been hidden while the course loaded
    if (document.hidden && !new URLSearchParams(location.search).has('nopause')) game.togglePause();
    lockLandscape();
    if (input.touch) { show('btn-pause'); setPauseLabel(); }
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
  const seq = runSeq, startP = pendingStart, who = net.name();
  lastRes = res; lastStart = startP;
  show('btn-mute'); hide('btn-pause');
  const practice = game.debugStart > 0;
  const missionRes = practice ? null : missions.runEnd({ m: res.m, dist: res.dist, shards: res.shards, zone: res.zone, mode: res.mode, duration: res.duration });
  let isNew = false;
  if (practice) { /* practice runs are not records */ }
  else if (res.mode === 'daily') {
    if (!bestDaily || bestDaily.date !== res.date || res.m > bestDaily.m) { bestDaily = { m: res.m, dist: res.dist, shards: res.shards, date: res.date }; write(slot('mr-best-daily'), bestDaily); isNew = true; }
  } else if (!best || res.m > best.m) {
    best = { m: res.m, dist: res.dist, shards: res.shards, date: res.date }; write(slot('mr-best'), best); isNew = true; game.best = best;
  }
  renderOver(res, res.mode === 'daily' ? bestDaily : best, missionRes);
  $('o-note').innerHTML = (practice ? 'Practice run from ' + game.debugStart + ' m: not recorded. ' : isNew ? '<span class="new">New best.</span> ' : '') + 'Press Enter to run again.';
  $('o-card').removeAttribute('src');
  hide('o-name'); hide('o-board');
  show('over');
  $('btn-again').focus();
  refreshTitle();
  if (!practice) syncProfile();   // the runner's save follows every run
  showMiniBoard(res, seq);
  const card = await renderCard({ ...res, name: who }, pageUrl.replace(/^https?:\/\//, ''));
  if (seq === runSeq) { lastCard = card; $('o-card').src = card.toDataURL('image/png'); }
  postScore(res, startP, seq, who).then(() => { showMiniBoard(res, seq); refreshBadge(); });
}

// The top five of the board this run belongs to, with the runner's own row.
async function showMiniBoard(res, seq) {
  if (game.debugStart > 0) return;
  const boardName = res.mode === 'daily' ? 'daily' : 'global';
  const data = await net.board(boardName, { limit: 5, date: res.mode === 'daily' ? res.date : undefined });
  if (seq !== runSeq) return;
  if (!data || !data.online || !data.entries.length) { hide('o-board'); return; }
  $('o-board-title').textContent = boardName === 'daily' ? 'Today’s leaderboard' : 'All-time leaderboard';
  $('o-board-more').dataset.board = boardName;
  renderMiniBoard(data);
  show('o-board');
}

// Posts one run. The post itself always goes through (its token is single-use, so
// letting it land is what keeps the score); writes to the over screen only happen
// while that run's screen is still the one shown.
// who: the runner the run belongs to, fixed when it ended. A run with no runner (or
// one whose name the board refuses) waits in pendingPost until a name is picked.
async function postScore(res, startP, seq, who) {
  const live = () => seq === runSeq;
  const rank = (t) => { if (live()) $('o-rank').textContent = t; };
  if (game.debugStart > 0) { rank('practice'); return; }
  const start = await startP;
  if (!start || !start.token) { rank(net.online ? '—' : 'offline'); return; }
  if (!who) {
    pendingPost = { res, startP, seq };
    if (!live()) return;
    $('o-name-label').textContent = 'Pick a runner name to put this run on the leaderboard.';
    show('o-name');
    rank('needs a name');
    return;
  }
  if (res.mode === 'daily' && start.seed !== res.seed) { rank('offline course'); return; }
  rank('posting…');
  const body = { token: start.token, name: who, mode: res.mode, dist: res.dist, shards: res.shards, zone: res.zone, m: res.m, killer: res.killer, seed: res.seed };
  // The board's word on this run: its rank if the stored entry is at least as good as this
  // run (then this run, or a better one, is on the board), otherwise null.
  const onBoard = async () => {
    net.invalidate();
    const b = await net.board(res.mode === 'daily' ? 'daily' : 'global', { limit: 1, date: res.date, name: who });
    const y = b && b.you;
    return y && y.rank && Number(y.m) >= Number(res.m.toFixed(2)) - 0.001 ? fmtRank(y.rank, b.total) : null;
  };
  let r = await net.submit(body);
  // one retry with the same token: the server spends a token only once, so this cannot double-post
  const unknown = !r;
  if (unknown) r = await net.submit(body);
  // A refused post keeps its token (valid 6 h): back off and send it again; the last wait
  // crosses the server's 10-minute window. If the first attempt's fate is unknown it may
  // already be on the board, so look there before each wait.
  for (const wait of [30e3, 120e3, 300e3, 610e3]) {
    if (!(r && r.ok === false && r.error === 'busy')) break;
    if (unknown) { const hit = await onBoard(); if (hit) { rank(hit); return; } }
    rank('busy, retrying…');
    await new Promise((ok) => setTimeout(ok, wait));
    r = await net.submit(body);
  }
  if (live()) submitted = r;
  if (!r || (r.ok === false && r.error === 'token used')) {
    // unknown, or an earlier attempt landed: the board says where this run stands
    const hit = await onBoard();
    if (hit) { rank(hit); return; }
    // 'token used' with no entry to show cannot prove the run was stored
    rank(r ? 'not confirmed' : net.online ? 'not posted' : 'offline');
    return;
  }
  if (r.ok === false && r.error === 'name not allowed') {
    // the board's word list refuses this name: the run waits for another one
    if (who === net.name()) dropRunner();
    pendingPost = { res, startP, seq };
    if (live()) { $('o-name-label').textContent = 'That name can’t go on the leaderboard. Pick another one to post this run.'; show('o-name'); }
    rank('pick another name');
    return;
  }
  if (r.ok === false) { rank(r.error === 'busy' ? 'busy, try later' : 'rejected'); return; }
  rank(r.rank ? fmtRank(r.rank, r.total) : 'posted');
  if (live() && r.improved && r.rank) $('o-note').innerHTML += ` <span class="new">${fmtRank(r.rank, r.total)} on the ${res.mode === 'daily' ? 'daily' : 'all-time'} board.</span>`;
}

// ---- runner name and save ----
// The runner's name is their identity: their row on the boards and the key to
// their save on the server, so entering the same name on another device brings
// the progress back (see api/profile.js and src/save.js).
function collectSave() { return { v: 1, progress: missions.state, best, bestDaily }; }
// Load a save into the current runner's slots.
function applySave(save) {
  missions.load(save && save.progress);
  best = save && save.best ? save.best : null; write(slot('mr-best'), best);
  bestDaily = save && save.bestDaily ? save.bestDaily : null; write(slot('mr-best-daily'), bestDaily);
  game.best = best;
  applySkin(missions.getSkin());
  refreshTitle();
}
// Make this device runner `name` ('' for none) and load what its slots hold.
function useRunner(name) {
  net.setName(name);
  write('mr-runner', runnerKeyOf(name));
  missions.useStore(slot('mr-progress'));
  best = read(slot('mr-best'), null); bestDaily = read(slot('mr-best-daily'), null);
  game.best = best;
  applySkin(missions.getSkin());
  refreshTitle(); renderRunner();
}
// The board refuses the runner's name: the progress goes back to the no-name slot,
// where the next name picked claims it.
function dropRunner() {
  const save = collectSave();
  useRunner('');
  applySave(mergeSave(collectSave(), save));
}
// Push this device's save under the runner's name and take back the merged one
// (it may hold progress from another device). Never applied mid-run. A request
// while one is in flight runs once more after it, so no run end is missed.
let syncing = null, syncAgain = false, initialSync = null;
function syncProfile() {
  const name = net.name();
  if (!name) return Promise.resolve(null);
  if (syncing) { syncAgain = true; return syncing; }
  syncing = (async () => {
    let r = null;
    do {
      syncAgain = false;
      r = await net.saveProfile(name, collectSave());
      if (name !== net.name()) return r;
      if (r && r.refused) { dropRunner(); return r; }
      const busy = game.state === 'playing' || game.state === 'paused' || game.state === 'dying';
      // the local save is the newer side: a skin picked while this was in flight stays picked
      if (r && r.ok && r.save && !busy) applySave(mergeSave(r.save, collectSave()));
    } while (syncAgain);
    return r;
  })().finally(() => { syncing = null; });
  return syncing;
}

function renderRunner() {
  const n = net.name();
  const html = n
    ? `Runner <b>${esc(n)}</b> <button class="link" data-switch type="button">switch</button>`
    : `No runner name yet. <button class="link" data-switch type="button">Pick one</button>`;
  for (const id of ['runner-line', 'board-runner', 'settings-runner']) $(id).innerHTML = html;
}
async function refreshBadge() {
  if (!net.name()) { $('board-badge').textContent = ''; return; }
  const b = await net.board('global', { limit: 1 });
  $('board-badge').textContent = b && b.you && b.you.rank ? '#' + b.you.rank : '';
}

// The runner panel. It covers the screen it was opened over (the title or the
// results screen, plus the board or settings panel if it came from one) and puts
// those back when it closes. whoSeq changes on open and close: a name check that
// is still waiting when the panel closes stops there.
let whoSeq = 0, whoBase = null, whoPanel = null, whoThen = null, whoPending = null, pendingPost = null;
function whoStep(step) {
  $('who-ask').classList.toggle('hidden', step !== 'ask');
  $('who-confirm').classList.toggle('hidden', step !== 'confirm');
  $('who-done').classList.toggle('hidden', step !== 'done');
  $('who-skip').classList.toggle('hidden', step === 'done');
}
function whoMsg(html, err = false) { $('who-msg').innerHTML = html; $('who-msg').classList.toggle('err', err); }
function openWho({ from = null, then = null } = {}) {
  whoSeq++;
  whoBase = isOpen('over') ? 'over' : game.state === 'title' ? 'title' : null;
  whoPanel = from === 'board' || from === 'settings' ? from : null;
  whoThen = then; whoPending = null;
  for (const id of ['title', 'over', 'board', 'missions', 'settings', 'howto']) hide(id);
  const n = net.name(), suggest = n ? '' : read('mr-name-suggest', '');
  $('who-title').textContent = n ? 'Switch runner' : 'Pick a runner name';
  $('who-skip').textContent = n ? 'Cancel' : 'Not now';
  $('who-input').value = suggest || '';
  if (suggest) whoMsg(`Your name is now also your save. Press Continue to keep <b>${esc(suggest)}</b>, or type another name.`);
  else whoMsg(n ? `You are <b>${esc(n)}</b>. Enter another name to play as someone else; ${esc(n)}’s progress stays saved.` : '');
  $('who-go').disabled = false;
  whoStep('ask');
  show('who');
  if (!input.touch) setTimeout(() => $('who-input').focus(), 0);
}
function closeWho(done = false) {
  whoSeq++;
  hide('who');
  try { sessionStorage.setItem('mr-who-asked', '1'); } catch (e) { /* ignore */ }
  if (whoBase) show(whoBase);
  if (whoPanel === 'board') openBoard();
  else if (whoPanel === 'settings') show('settings');
  const then = whoThen; whoThen = null;
  if (done && then) then();
  // a run that waited for a name is posted once there is one
  if (pendingPost && net.name()) {
    const p = pendingPost; pendingPost = null;
    if (p.seq === runSeq) { hide('o-name'); refreshOverBest(); }
    postScore(p.res, p.startP, p.seq, net.name()).then(() => { showMiniBoard(p.res, p.seq); refreshBadge(); });
  }
}
// After a runner's save is loaded on the results screen, its Best and 'New best.' follow it.
function refreshOverBest() {
  if (!lastRes) return;
  const b = lastRes.mode === 'daily' ? bestDaily : best;
  if (b) $('o-best').textContent = fmtM(b.m);
  if (b && b.m > lastRes.m + 0.001) $('o-note').innerHTML = $('o-note').innerHTML.replace('<span class="new">New best.</span> ', '');
}
async function checkName() {
  const seq = whoSeq;
  const n = cleanName($('who-input').value);
  if (!n) { whoMsg('Use at least 2 letters or numbers (and not “Rocky”).', true); return; }
  const cur = net.name();
  if (cur && runnerKeyOf(n) === runnerKeyOf(cur)) { closeWho(true); return; }
  whoMsg('Checking the name…');
  $('who-go').disabled = true;
  const p = await net.profile(n);
  if (seq !== whoSeq) return;   // the panel was closed while the check ran
  $('who-go').disabled = false;
  if (p && p.refused) { whoMsg('That name can’t be used. Please pick another.', true); return; }
  // without an answer there is no telling whether the name is someone else's: never guess
  if (!p || !p.online) { whoMsg('The name can’t be checked right now. Try again in a moment' + (cur ? '.' : ', or tap Not now: your progress stays on this device.'), true); return; }
  if (p.exists) {
    whoPending = { name: p.name, save: p.save };   // the saved spelling of the name
    const sm = saveSummary(p.save);
    whoMsg(`<b>${esc(p.name)}</b> already has saved progress: ${sm.runs} run${sm.runs === 1 ? '' : 's'}, best M ${sm.bestM.toFixed(2)}, ${sm.km.toFixed(1)} km. Is that you?`);
    $('who-title').textContent = 'Is this you?';
    whoStep('confirm');
    return;
  }
  await adopt(n, null, false, seq);
}
// Become runner `name`. existing: the server holds a save for it (serverSave).
async function adopt(name, serverSave, existing, seq) {
  const prev = net.name();
  const switching = Boolean(prev) && runnerKeyOf(prev) !== runnerKeyOf(name);
  $('who-yes').disabled = true;
  try {
    if (switching) {
      // keep the current runner's progress safe on the server before this device moves on
      whoMsg('Saving ' + esc(prev) + '’s progress…');
      const saved = await net.saveProfile(prev, collectSave());
      if (seq !== whoSeq) return;
      if (!saved || (!saved.ok && !saved.refused)) { whoMsg('Could not save ' + esc(prev) + '’s progress, so the switch was cancelled. Try again in a moment.', true); whoStep('ask'); return; }
      useRunner(name);   // this device's own copy of that runner, if it has one
      applySave(mergeSave(collectSave(), existing ? serverSave : null));
    } else {
      // the first name on this device claims the progress played without one
      const anon = collectSave();
      useRunner(name);
      applySave(mergeSave(mergeSave(collectSave(), anon), existing ? serverSave : null));
      for (const k of ['mr-progress', 'mr-best', 'mr-best-daily']) write(k, null);
    }
    write('mr-name-suggest', '');
  } finally { $('who-yes').disabled = false; }
  if (existing) whoMsg(`Welcome back, <b>${esc(name)}</b>. Your progress is loaded.`);
  else whoMsg(`You are <b>${esc(name)}</b>. Remember it: <b>next time, on this phone or any other device, enter the same name</b> to get your progress back.`);
  $('who-title').textContent = existing ? 'Welcome back' : 'You’re all set';
  whoStep('done');
  $('who-ok').focus();
  syncProfile().then(refreshBadge);
}
$('who-go').addEventListener('click', checkName);
$('who-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); checkName(); } e.stopPropagation(); });
$('who-yes').addEventListener('click', () => { if (whoPending) adopt(whoPending.name, whoPending.save, true, whoSeq); });
$('who-no').addEventListener('click', () => { whoPending = null; $('who-input').value = ''; $('who-title').textContent = 'Pick a runner name'; whoMsg('Pick a name that is only yours.'); whoStep('ask'); if (!input.touch) $('who-input').focus(); });
$('who-ok').addEventListener('click', () => closeWho(true));
$('who-skip').addEventListener('click', () => closeWho(false));
document.addEventListener('click', (e) => {
  const b = e.target && e.target.closest && e.target.closest('[data-switch]');
  if (!b) return;
  openWho({ from: isOpen('board') ? 'board' : isOpen('settings') ? 'settings' : null });
});
// a run that ended without a name: pick one, and closeWho posts it
$('btn-name').addEventListener('click', () => openWho({}));

// ---- how to play ----
function openHowto(forRun = false) {
  closePanels(); hide('title');
  $('btn-howto-run').textContent = forRun ? 'Got it, run!' : 'Run';
  show('howto');
  drawIcons($('howto'));
  $('howto').querySelector('.panel').scrollTop = 0;
}
// the first Run shows the guide; after that Run just runs
function runOrGuide() {
  if (!read('mr-howto-seen', false)) { openHowto(true); return; }
  startRun();
}
$('btn-howto').addEventListener('click', () => openHowto(false));
$('btn-howto-inline').addEventListener('click', () => openHowto(false));
$('btn-howto-run').addEventListener('click', () => { write('mr-howto-seen', true); hide('howto'); startRun(); });
$('btn-howto-close').addEventListener('click', () => { write('mr-howto-seen', true); backToMenu(); });

// ---- pause (phones) ----
$('btn-pause').addEventListener('click', (e) => { e.stopPropagation(); e.currentTarget.blur(); if (game.state === 'playing' || game.state === 'paused') game.togglePause(); });

// ---- title buttons ----
$('btn-run').addEventListener('click', runOrGuide);
$('btn-again').addEventListener('click', startRun);
$('btn-home').addEventListener('click', () => { hide('over'); hide('btn-pause'); show('btn-mute'); game.state = 'title'; game.reset(); game.music.start(); game.music.setState('title'); show('title'); refreshTitle(); });
document.querySelectorAll('.mode').forEach((el) => el.addEventListener('click', () => { mode = el.dataset.mode; refreshTitle(); el.blur(); }));
document.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => { if (el.dataset.close === 'howto') { write('mr-howto-seen', true); backToMenu(); } else hide(el.dataset.close); }));

// leaderboard
let boardTab = 'global', boardSeq = 0;
async function openBoard() {
  const seq = ++boardSeq;
  closePanels(); show('board');
  renderRunner();
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.board === boardTab));
  $('board-status').textContent = 'Loading…';
  $('board-list').innerHTML = ''; $('board-you').textContent = '';
  const data = await net.board(boardTab, { limit: 25 });
  if (seq !== boardSeq || $('board').classList.contains('hidden')) return;
  renderBoard(data, net.name(), boardTab);
}
$('btn-board').addEventListener('click', openBoard);
$('o-board-more').addEventListener('click', () => { boardTab = $('o-board-more').dataset.board || 'global'; openBoard(); });
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { boardTab = t.dataset.board; openBoard(); }));

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
renderRunner();
// first visit (or a visit that skipped it): ask for a runner name; otherwise
// bring this device up to date with the runner's save on the server
let askedThisVisit = false;
try { askedThisVisit = sessionStorage.getItem('mr-who-asked') === '1'; } catch (e) { /* ignore */ }
if (!net.name() && (!askedThisVisit || read('mr-name-suggest', ''))) openWho({});
else if (net.name()) initialSync = syncProfile().then(refreshBadge);

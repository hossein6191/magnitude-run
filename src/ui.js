// DOM rendering for the panels. No game logic here: main.js hands data in.
import { LADDER, tierFor } from './score.js';
import { SKINS as SKIN_PAL } from './rocky.js';
import { fmtRank } from './net.js';

export const $ = (id) => document.getElementById(id);
export const show = (id) => $(id).classList.remove('hidden');
export const hide = (id) => $(id).classList.add('hidden');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtM = (m) => 'M ' + Number(m).toFixed(2);
const fmtDist = (d) => Math.floor(d).toLocaleString('en-US') + ' m';

export function renderLadder(m) {
  const tier = m == null ? null : tierFor(m);
  $('ladder').innerHTML = LADDER.map(([v, name]) => `<div class="${tier === name ? 'on' : ''}"><b>${v}+</b>${name}</div>`).join('');
}

export function renderBoard(data, pid, boardName) {
  const list = $('board-list'), status = $('board-status'), you = $('board-you');
  list.innerHTML = ''; you.textContent = '';
  if (!data) { status.textContent = 'Could not reach the leaderboard.'; return; }
  if (!data.online) { status.textContent = 'The leaderboard is offline on this host. Scores are kept in this browser only.'; return; }
  if (!data.entries.length) { status.textContent = boardName === 'daily' ? 'No runs on today’s fault line yet. Be the first.' : 'No runs posted yet.'; return; }
  status.textContent = boardName === 'daily' ? `Today · ${data.date} · ${data.total} runner${data.total === 1 ? '' : 's'}` : `All time · ${data.total} runner${data.total === 1 ? '' : 's'}`;
  list.innerHTML = data.entries.map((e) => `<li class="${e.you ? 'you' : ''}"><span class="r">#${e.rank}</span><span class="n">${esc(e.name || 'Rocky')}</span><span class="m">${fmtM(e.m)}</span><span class="d">${fmtDist(e.dist)}</span></li>`).join('');
  if (data.you) you.textContent = `You: ${fmtRank(data.you.rank, data.total)} · ${fmtM(data.you.m)} · ${fmtDist(data.you.dist)}`;
  else if (pid) you.textContent = 'You have not posted a run on this board yet.';
}

export function renderRank(rank) {
  $('rank-level').textContent = rank.level.toFixed(1);
  $('rank-title').textContent = rank.title;
  $('rank-bar').style.width = Math.round(rank.progress * 100) + '%';
  $('rank-next').textContent = rank.nextAt == null ? `${rank.points} pts · top rank` : `${rank.points} / ${rank.nextAt} pts to the next magnitude`;
  $('rank-badge').textContent = rank.level.toFixed(1);
}

export function renderMissions(list) {
  $('mission-list').innerHTML = list.map((m) => {
    const frac = m.goal ? Math.min(1, m.progress / m.goal) : 0;
    return `<li class="${m.done ? 'done' : ''}"><span>${esc(m.text)}</span><span class="p">${esc(m.label || `${m.progress} / ${m.goal}`)} · ${m.points} pts</span><div class="bar"><i style="width:${Math.round(frac * 100)}%"></i></div></li>`;
  }).join('');
}

export function renderSkins(missions, onPick) {
  const unlocked = new Set(missions.unlocks());
  const current = missions.getSkin();
  const el = $('skins');
  el.innerHTML = '';
  for (const id of Object.keys(SKIN_PAL)) {
    const sk = SKIN_PAL[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'skin' + (id === current ? ' on' : '') + (unlocked.has(id) ? '' : ' locked');
    const lvl = { mauve: 1, obsidian: 3, rose: 5, glass: 7, enclave: 9 }[id];
    b.innerHTML = `<i style="background:linear-gradient(135deg, ${sk.pal.light} 0 40%, ${sk.pal.mauve} 40% 70%, ${sk.pal.purple} 70%)"></i>${esc(sk.name)}<small>${unlocked.has(id) ? '' : `rank ${lvl}.0`}</small>`;
    b.disabled = !unlocked.has(id);
    b.addEventListener('click', () => onPick(id));
    el.appendChild(b);
  }
}

export function renderStats(stats) {
  const rows = [
    ['Runs', stats.runs], ['Best', stats.bestM ? fmtM(stats.bestM) : '—'], ['Distance', (stats.totalDist / 1000).toFixed(1) + ' km'],
    ['Shards', stats.shards], ['Watchers', stats.watchers], ['Stomps', stats.stomps], ['Slides', stats.slides], ['Close calls', stats.closecalls],
  ];
  $('life-stats').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
}

export function renderOver(res, best, missionRes) {
  $('o-eyebrow').textContent = res.mode === 'daily' ? `Daily · ${res.date}` : 'Run complete';
  $('o-mag').textContent = res.m.toFixed(2);
  $('o-tier').textContent = res.tier;
  $('o-killer').textContent = res.killer ? `Cracked by ${res.killer} at ${fmtDist(res.dist)}.` : '';
  $('o-dist').textContent = fmtDist(res.dist);
  $('o-shards').textContent = String(res.shards);
  $('o-zone').textContent = String(res.zone);
  $('o-best').textContent = best ? fmtM(best.m) : fmtM(res.m);
  $('o-close').textContent = String(res.stats.closecalls);
  $('o-shatter').textContent = String(res.stats.watchers + res.stats.golems);
  $('o-combo').textContent = 'x' + res.maxCombo;
  $('o-rank').textContent = '—';
  const done = $('o-missions');
  done.innerHTML = '';
  if (missionRes && missionRes.completed.length) {
    done.innerHTML = missionRes.completed.map((c) => `<div><b>Mission complete</b> · ${esc(c.text)} · +${c.points} pts</div>`).join('');
    if (missionRes.rankAfter && missionRes.rankBefore && missionRes.rankAfter.level > missionRes.rankBefore.level) done.innerHTML += `<div><b>Rank up</b> · Magnitude ${missionRes.rankAfter.level.toFixed(1)} · ${esc(missionRes.rankAfter.title)}</div>`;
    if (missionRes.newUnlocks && missionRes.newUnlocks.length) done.innerHTML += `<div><b>Skin unlocked</b> · ${missionRes.newUnlocks.map((s) => esc(SKIN_PAL[s] ? SKIN_PAL[s].name : s)).join(', ')}</div>`;
  }
}

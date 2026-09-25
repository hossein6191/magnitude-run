// Share card: a 1200x630 image of the run, drawn with the same vector Rocky
// and the run's own seismograph trace.

import { drawRocky, drawCrystal, POSES, PAL } from './rocky.js';
import { makeContourTile } from './world.js';

function setSpacing(g, px) { if ('letterSpacing' in g) g.letterSpacing = px + 'px'; }

export async function renderCard(res, url) {
  const W = 1200, H = 630;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  try {
    await Promise.all([
      document.fonts.load('400 180px "Instrument Serif"'),
      document.fonts.load('italic 400 44px "Instrument Serif"'),
      document.fonts.load('500 22px "JetBrains Mono"'),
      document.fonts.load('500 14px "Instrument Sans"'),
    ]);
  } catch (e) { /* fall back silently */ }

  g.fillStyle = PAL.ink;
  g.fillRect(0, 0, W, H);
  const rg = g.createRadialGradient(W * 0.8, H * 0.9, 40, W * 0.8, H * 0.9, 700);
  rg.addColorStop(0, 'rgba(82,53,66,0.55)');
  rg.addColorStop(1, 'rgba(82,53,66,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, W, H);
  const tile = makeContourTile(1600, H, 0.07, 3);
  g.drawImage(tile, -200, 0);

  // run trace along the lower band
  const tr = res.trace && res.trace.length > 4 ? res.trace : [0, 0, 0, 0];
  const x0 = 60, x1 = W - 60, base = 500;
  const drawTrace = (w, a) => {
    g.beginPath();
    for (let i = 0; i < tr.length; i++) {
      const x = x0 + (i / (tr.length - 1)) * (x1 - x0);
      const y = base - Math.min(220, tr[i]) * 0.55;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.strokeStyle = `rgba(243,231,236,${a})`;
    g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round';
    g.stroke();
  };
  drawTrace(7, 0.10);
  drawTrace(2, 0.9);
  g.fillStyle = 'rgba(252,252,252,0.4)';
  g.font = '500 13px "JetBrains Mono", monospace';
  setSpacing(g, 2);
  g.textAlign = 'left';
  g.fillText('0 m', x0, base + 26);
  g.textAlign = 'right';
  g.fillText(`${Math.floor(res.dist).toLocaleString('en-US')} m`, x1, base + 26);
  setSpacing(g, 0);

  // Rocky, at rest, with Shard
  drawRocky(g, 1000, 470, 2.1, POSES.idle(0.8), { cracks: 0 });
  drawCrystal(g, 940, 250, 16, -0.3, 1);

  // mark + name
  drawCrystal(g, 78, 72, 20, 0, 0);
  g.fillStyle = PAL.pearl;
  g.textAlign = 'left';
  g.font = '400 36px "Instrument Serif", serif';
  g.fillText('Magnitude Run', 104, 84);
  g.fillStyle = 'rgba(252,252,252,0.5)';
  g.font = '500 13px "Instrument Sans", sans-serif';
  setSpacing(g, 3);
  g.fillText(res.mode === 'daily' ? `DAILY · ${res.date}` : 'SEISMIC COMMUNITY BUILD', 106, 108);
  setSpacing(g, 0);
  if (res.name) { g.textAlign = 'right'; g.fillStyle = 'rgba(252,252,252,0.7)'; g.font = '500 20px "JetBrains Mono", monospace'; g.fillText(res.name, W - 60, 84); g.textAlign = 'left'; }

  // the number
  g.fillStyle = PAL.pearl;
  g.font = '400 132px "Instrument Serif", serif';
  g.fillText('M', 66, 330);
  g.font = '400 200px "Instrument Serif", serif';
  const mStr = res.m.toFixed(2);
  g.fillText(mStr, 186, 330);
  const mw = g.measureText(mStr).width;
  g.fillStyle = '#C29AAF';
  g.font = 'italic 400 46px "Instrument Serif", serif';
  g.fillText(res.tier, 196 + mw, 330);

  g.fillStyle = 'rgba(252,252,252,0.72)';
  g.font = '500 22px "JetBrains Mono", monospace';
  g.fillText(`${Math.floor(res.dist).toLocaleString('en-US')} m  ·  ${res.shards} shards  ·  zone ${res.zone}${res.killer ? '  ·  cracked by ' + res.killer : ''}`, 70, 384);

  g.fillStyle = 'rgba(252,252,252,0.42)';
  g.font = '500 15px "JetBrains Mono", monospace';
  g.fillText(url, 66, H - 40);
  g.textAlign = 'right';
  g.fillText(res.date, W - 60, H - 40);
  return c;
}

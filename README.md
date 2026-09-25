# Magnitude Run

One-button endless runner for the Seismic community. Rocky, the crystal golem,
runs along a seismograph trace. Every jump is written to the trace behind him,
and the score is a Richter-style magnitude from M 1.0 upward.

Fan-made. Not an official Seismic product.

## Play

Static files, no build step. Serve the folder with anything:

```bash
node magnitude-run/serve.mjs 5173
```

Then open http://127.0.0.1:5173/.

- **Space / tap**: jump. Hold for a higher jump.
- **Space again in the air**: stomp. The shockwave shatters Watchers within
  reach and cracks Glass Golems.
- Run *under* the high Watchers. Jump the low ones, the Glass Golems and the gaps.
- Three cracks and Rocky shatters.
- **Esc / P**: pause. **M**: mute. **Enter / R**: run again.

## Scoring

`M = 1 + 2.2 · log10(1 + (metres + 20 · shards) / 50)`, capped at 9.9.
Classes follow USGS: Micro, Minor, Light, Moderate, Strong, Major, Great.
Every 600 m is an aftershock: the trace vibrates, the cave shakes and the
speed steps up.

## Files

| file | what |
| --- | --- |
| `index.html`, `styles.css` | shell, title and result panels |
| `src/game.js` | loop, physics, spawner, collisions, HUD |
| `src/rocky.js` | Rocky, Shard, Watchers and Glass Golems as procedural vectors, plus poses |
| `src/world.js` | cave parallax: contour lines, rock spires, stalactites |
| `src/audio.js` | WebAudio cues, no sound files |
| `src/card.js` | 1200×630 share card with the run's own trace |
| `src/score.js` | magnitude formula and USGS classes |

## Brand

Palette and type follow the Seismic Brand Kit v2: Mauve `#825A6D`,
Purple `#523542`, greys from `#FCFCFC` to `#161616`. Suisse Intl and Suisse
Works are licensed faces, so the web build uses Instrument Sans and
Instrument Serif as free stand-ins, with JetBrains Mono for readouts.

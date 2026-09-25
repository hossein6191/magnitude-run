# Magnitude Run

One-button endless runner for the Seismic community. Rocky, the crystal golem,
runs along a seismograph trace through the cave, the crystal vein, the glass
city of the Watchers and the Enclave. Every jump is written to the trace behind
him, and the score is a Richter-style magnitude from M 1.0 upward.

Fan-made. Not an official Seismic product.

## Play

- **Space / tap**: jump. Hold for height, release early for a short hop.
- **Down / swipe down / left touch zone**: slide on the ground, dive in the air
  (a dive lands straight into a slide).
- **Space in the air**: stomp. The shockwave shatters Watchers, Probes, Rocks
  and glass within reach. Close to the ground it buffers a jump instead.
- Three cracks and Rocky shatters. Falling into a fault line costs a crack and
  puts you back on the far edge.
- **Esc / P** pause, **M** mute, **Enter / R** run again.

### Hazards

| hazard | from | answer |
| --- | --- | --- |
| Glass Golem, Glass Spire | ground | jump (spire needs a held jump) |
| fault line (gap) | below | jump |
| Watcher, low | air | jump, or stomp it |
| Watcher, high | air | run under |
| Watcher beam, chest | air | slide |
| Watcher beam, shin | air | jump |
| Fangs | ceiling | slide |
| Glass Moth | air, flying at you | slide |
| Probe | above, dives at a marked spot | jump the stuck spike, or stomp it |
| Burrower | below, cracks then erupts | jump |
| Rock (rockfall event) | above, lands on a marked spot | jump the rubble |
| Vent | below | ride it up to the shard arcs |

Aftershocks every 600 m step the speed up and, from zone 2, start an event:
Tremor, Watcher swarm, Rockfall, Glass storm. Biomes change every two zones.

### Power-ups

Shielded (one hit absorbed), Resonance (shard magnet, 10 s), Overclock (4.5 s
invulnerable dash, fault lines are bridged), Amplifier (shards count double,
12 s), Repair (heals a crack; only offered when cracked).

### Scoring

`M = 1 + 2.2 · log10(1 + (metres + 20 · shards) / 50)`, capped at 9.9, with USGS
classes. Shard chains build a multiplier (×2 at 5, ×3 at 10, ×4 at 15; 3 s
timer; a crack resets it). Passing a hazard within 18 px is a close call
worth 2 shards. Stomping several things at once is a combo.

### Modes

- **Endless**: your best distance shows as a marker in the world.
- **Daily**: the same course for everyone, seeded from the UTC date. Its own
  leaderboard, kept for three days.

Missions (three at a time, from a pool of 43) raise your rank from Magnitude
1.0 to 9.0 and unlock skins (Obsidian, Rose Quartz, Glass, Enclave).

## Run locally

Static files, no build step. The local server also runs the leaderboard API
against an in-memory store, so the whole online flow works without Vercel:

```bash
node serve.mjs 5173
```

Then open http://127.0.0.1:5173/. Handy URL flags: `?start=1200` begins an
endless run 1200 m in (practice; not posted), `?nopause=1` keeps running when
the tab loses focus, `?pwa=1` enables the service worker on localhost.

## Deploy on Vercel

1. Import the repository in Vercel (framework preset: Other, no build command,
   output directory `.`).
2. Storage → Marketplace → **Upstash Redis**, attach it to the project. It sets
   `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (the `KV_REST_API_*`
   names also work).
3. Add an environment variable `RUN_SECRET` with a long random string
   (`openssl rand -hex 32`). Without it the Redis token is used as the signing
   secret, which works but is weaker.
4. Deploy. Without Redis the game still runs; the leaderboard just says it is
   offline and everything stays in the browser.

Hosting the static files elsewhere (GitHub Pages) while the API lives on
Vercel also works: set `window.MR_API_BASE = 'https://your-app.vercel.app'`
before `src/main.js` loads.

### API

| endpoint | purpose |
| --- | --- |
| `POST /api/start` | issues a signed run token that carries the start time |
| `POST /api/submit` | validates a run (token, single use, elapsed time vs distance, zone and magnitude recomputed, shard plausibility, rate limit) and stores the best per player id |
| `GET /api/board?board=global\|daily&limit=25&pid=` | top list plus your own rank |

Player identity is a random id in the browser, never an account. Names are
2 to 14 characters, filtered server-side. This is honest-player anti-cheat:
the input-log replay verification in the roadmap is what would make it strict.

## Files

| file | what |
| --- | --- |
| `index.html`, `styles.css` | shell, title, result, leaderboard, missions and settings panels |
| `src/game.js` | loop, physics, spawner, events, collisions, HUD |
| `src/hazards.js` | hazard registry (update/draw/hit per type), patterns, events, power-ups |
| `src/rocky.js` | Rocky, Shard, Watchers and Glass Golems as procedural vectors; poses; skins |
| `src/world.js` | four biomes of parallax cave |
| `src/input.js` | keyboard, mouse, touch zones and swipe → jump / down |
| `src/audio.js`, `src/music.js` | WebAudio cues and the adaptive procedural score |
| `src/missions.js` | missions, lifetime stats, ranks, skin unlocks |
| `src/net.js` | leaderboard client |
| `src/card.js` | 1200×630 share card |
| `src/ui.js`, `src/main.js` | DOM panels and wiring |
| `api/` | Vercel functions (`_lib` is shared code, not a function) |
| `design/` | Rocky character brief and turnaround for designers |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | installable, offline-capable shell |

## Roadmap

- Replay-verified leaderboard: record inputs, re-simulate on the server with a
  deterministic fixed-step core.
- More hazards from the design notes: Shard Teeth, Glass Bomb, Cipher Gate,
  Mirror Watcher bait, armoured Golems.
- Ghost of your best daily run, weekly board, friend markers.
- Rocky sprite art from the design brief in `design/CHARACTER.md`.

## Brand

Palette and type follow the Seismic Brand Kit v2: Mauve `#825A6D`,
Purple `#523542`, greys from `#FCFCFC` to `#161616`. Suisse Intl and Suisse
Works are licensed faces, so the web build uses Instrument Sans and
Instrument Serif as free stand-ins, with JetBrains Mono for readouts.

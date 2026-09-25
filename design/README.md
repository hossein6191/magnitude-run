# Design hand-off

Everything a designer (or a design tool) needs to redraw Rocky and drop the
result back into the game.

| file | what it is |
| --- | --- |
| `CHARACTER.md` | the brief: who Rocky is, proportions, palette, the poses the game needs, delivery formats |
| `rocky-turnaround.svg` | front / side / back of the current in-game Rocky, exact palette |
| `rocky-poses.png` | every pose the game draws (idle, jump, fall, stomp, land, slide, the 8-phase run cycle, cracks) plus Shard, a Watcher and a Glass Golem |
| `ingame.png` | a frame from the game for context: cave, trace, HUD |
| `poses.html` | regenerates `rocky-poses.png` from the live code (open it through `node serve.mjs`) |
| `../src/rocky.js` | the procedural source of the character: facet polygons, seams, poses |
| `../icon.svg` | the crystal mark used for the app icon |

Brand source: Seismic Brand Kit v2 (Figma). Colours and type in the game come
from its Color System and Typography slides; the logomark's faceted crystal is
what Rocky's head and body are cut from. The official community mascot art
(Rocky, a friendly rock golem from the mascot contest) was **not** available to
this build, so the in-game Rocky is an original interpretation of the brief,
not a copy of that art.

## Prompt to hand a design tool

> Redesign "Rocky", the crystal golem mascot of the Magnitude Run game, using
> `design/CHARACTER.md` as the brief and `design/rocky-turnaround.svg` plus
> `design/rocky-poses.png` as the current version. Keep the seven-colour Seismic
> palette, the faceted low-poly language of the Seismic logomark, the glowing
> eye-slit and chest core, and the 2.5-heads-tall heavy proportions. Deliver an
> SVG with one group per body part (`head`, `torso`, `core`, `armFar`,
> `armNear`, `legFar`, `legNear`, `shard`), side view facing right, feet on
> y=0, about 106 units tall, so it can replace the drawing in `src/rocky.js`.

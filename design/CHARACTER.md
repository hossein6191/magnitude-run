# Rocky — character brief

Rocky is the playable mascot of Magnitude Run and a fan take on the Seismic
community's golem mascot. This brief exists so a designer (or a design tool)
can produce a better Rocky that still drops into the game.

## Who Rocky is

- A **crystal golem** cut from the same faceted stone as the Seismic
  logomark. Calm, heavy, unshakeable. He does not talk.
- His **core** (a small glowing gem in the chest) is the one thing the
  Watchers cannot see into: it stands for encrypted state. Everything else in
  the cave is transparent glass; Rocky is opaque stone.
- Personality in three words: **steady, quiet, unbothered.** He reads as a
  guardian, not a cute pet. No mouth. One horizontal glowing eye-slit carries
  every expression (narrow = focus, wide = surprise, blink).
- Signature move: the **stomp**. He lands hard and a shockwave ring rolls out
  along the seismograph line.

## Proportions and silhouette

- About **2.5 heads tall**, wide shoulders, short legs, big block feet.
- Head is a **faceted crystal**: a point at the top, two side facets, a flat
  front face with the eye-slit at about 60% of the head's height.
- Torso is a **trapezoid** (wider at the hips), split into two big facets
  with thin pearl seams. Core gem centred at chest height.
- Arms and legs are **tapered stone blocks**, two segments each, blocky hands
  and feet. No fingers.
- Companion: **Shard**, a fist-sized floating crystal that orbits behind his
  head. Shard is the pointer/guide in menus.

## Palette (Seismic Brand Kit v2)

| role | hex |
| --- | --- |
| highlight facet | `#A17A8F` |
| main facet (Mauve) | `#825A6D` |
| mid facet | `#6A475A` |
| shadow facet (Purple) | `#523542` |
| deep shadow / feet | `#3D2731` |
| core, eye, seams | `#F3E7EC` |
| ground / background | `#161616` |

Keep the whole figure inside these seven colours. Seams are 1px pearl lines
at ~35% opacity. The eye and core glow; nothing else does.

## Poses the game needs (side view, facing right)

1. **Idle** — weight on both feet, slight breathing bob, blink every 2–5 s.
2. **Run** — 8-frame cycle, 140 px stride, arms counter-swing, torso leans
   ~7° forward. Feet leave the ground clearly.
3. **Jump** — front knee up, back leg trailing, near arm reaches forward-up.
4. **Fall** — arms out, legs slightly spread, eye-slit wider.
5. **Stomp** — legs together, arms straight down, eye narrowed to a line,
   body compressed by ~4%.
6. **Slide** — low crouch, one leg extended forward, torso tilted back, head
   at knee height. Hitbox must fit under a 44 px gap.
7. **Land / squash** — 12% wider, 14% shorter for ~80 ms.
8. **Hit** — flash to pearl white, then a glowing crack appears on the torso
   (1st hit left of the core, 2nd right hip, 3rd on the head).
9. **Shatter** — the figure splits into its facets.

## Delivery that drops straight into the game

- **Best:** SVG, flat fills only (no gradients, no filters), one `<g>` per
  body part named `head`, `torso`, `core`, `armFar`, `armNear`, `legFar`,
  `legNear`, `shard`. The game animates parts procedurally, so a single
  idle pose with clean parts is enough.
- **Also fine:** a PNG sprite sheet, 8 run frames + the other poses, each
  cell 128×128, transparent background, feet on a fixed baseline at y=112.
- Reference geometry: `rocky-turnaround.svg` in this folder is the current
  in-game character in front / side / back views, in the exact palette.

## What not to do

- No mouth, no eyebrows, no rounded "blob" shapes. Everything is a facet.
- No extra colours, no outlines darker than the deepest facet.
- Don't make him cute-small; his weight is the point.

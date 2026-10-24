# Orbital Sandbox

A realistic-looking 3D rocket sandbox for the browser (desktop and mobile): build a rocket, launch, stage, reach orbit,
land under power or on parachutes, fly to the Moon and the planets, walk on the surface, plant flags, and jump to the stars
of the Milky Way. Everything is unlocked from the start.

TypeScript · Three.js · Vite · React. No server, no accounts: saves live in IndexedDB.

```bash
npm install
npm run dev        # development server
npm run build      # type-check + production build into dist/
npm test           # headless physics / mission / galaxy tests (vitest)
```

Append `?debug=1` to the URL to expose `window.__game` (world, renderer, THREE) for poking at a flight from the console.

## What is in the game

| Area | What you get |
|---|---|
| **Solar System** | Sun, 8 planets, Pluto, the Moon, Phobos/Deimos, the Galilean moons, Titan, Rhea, Iapetus, Enceladus, Titania, Oberon, Miranda, Triton, Charon. Real radii, GM, rotation, orbits (e, a, periapsis, epoch phase) and atmospheres (density, scale height). |
| **Landing** | Rocky worlds and moons have procedural terrain you can land on. Gas/ice giants have no surface: you fly into the atmosphere until the pressure crushes the weakest part. |
| **Vehicles** | Six ready-made rockets (training rocket, orbital launcher, heavy launcher, reusable booster, lunar lander, interplanetary ship) plus a part-by-part hangar. |
| **Hangar** | Snap-together attachment nodes (size-checked), side parts with 1–6× symmetry, move/delete with confirmation, undo/redo, reorderable staging, saved designs, live mass / Δv / TWR. |
| **Flight model** | Mass-flow engines (Isp varies with pressure), fuel sections separated by decouplers, solid boosters, aerodynamic drag and weathervane stability, gimballed thrust and reaction wheels, re-entry heating with heat shields, parachutes that depend on air density and deployment speed (reef → inflate → full, torn if too fast), landing legs, impact limits, ocean splashdowns. |
| **Orbits** | Patched conics with sphere-of-influence hand-offs, analytic Kepler propagation for time acceleration (up to 1,000,000×), predicted orbit, apsides, encounters and impacts on the map. |
| **Assists** | Stability assist (default **on**), orbit guidance (ascent, circularise, de-orbit, moon/planet transfer), landing assistance (de-orbit, braking burn, powered descent, legs, parachutes) and unlimited fuel (default **off**). |
| **Surface** | Hatch out of a landed crew vehicle, walk and jump (gravity matches the world), plant flags that persist, climb back in. |
| **Milky Way** | 10,316 real stars from the HYG catalog plus deterministic generated filler stars out to the disc edge. A jump drive module (fictional) hops between stars; arrival systems are generated from the star's type. |
| **Saves** | Designs, settings, quicksave (F5/F9) and 20-second autosaves in IndexedDB, with JSON export/import. A crash screen offers revert, autosave, restart or menu. |

### Controls

| | Keyboard / mouse | Touch |
|---|---|---|
| Pitch / yaw / roll | W S · A D · Q E (relative to the camera) | on-screen stick + roll buttons |
| Throttle | Shift / Ctrl, Z full, X cut | throttle slider |
| Stage | Space | STAGE button |
| Stability modes | 1 hold · 2 prograde · 3 retrograde · 4/5 radial · T assist on/off | HUD chips |
| Gear / parachutes | G / P | HUD buttons |
| Camera | drag, wheel, C toggles horizon/vessel-locked | drag, pinch |
| Map / galaxy | M / J | HUD buttons |
| Time acceleration | `,` slower · `.` faster · `/` reset | ◀ ▶ |
| Astronaut | F exit / plant flag · B board · WASD, Space, Shift | stick, jump, FLAG |
| Misc | Tab switch vessel · H hide HUD · F5/F9 save/load · Esc menu | Menu button |

Time acceleration is capped automatically: 4× while engines fire or inside an atmosphere, and rails warp is limited so that
it cannot carry you into the ground or atmosphere faster than you can react.

## Data and honesty about what is real

* **Observed:** body radii, masses (GM), rotation periods, orbit shapes and atmosphere densities of the Solar System bodies;
  positions and photometry of the 10,316 bundled stars (HYG v4.1, <https://codeberg.org/astronexus/hyg>,
  **CC BY-SA 4.0**, subset built by `scripts/build-catalog.mjs`); the existence, orbit and minimum mass of a few known
  exoplanets (Proxima b/d, Barnard's Star b, Tau Ceti e/f, ε Eridani b, 51 Peg b, 55 Cnc e/d).
* **Procedural approximations:** all surface appearance and terrain. Planets are not the real maps; Earth has plausible
  continents, not the real ones. Gas-giant bands are generated.
* **Fictional:** generated filler stars, generated planets, and the jump drive. The galaxy map and system info label each
  system as `observed`, `mixed` or `generated`.
* **Simplifications:** zero axial tilt and coplanar orbits (everything lives in one plane), two-body gravity inside a
  sphere of influence, no n-body effects. Launches start from an equatorial pad.

## Layout

```
src/sim/      pure TypeScript simulation (no DOM): bodies, orbits, parts, designs, flight, guidance, galaxy, saves
src/render/   Three.js: cube-sphere terrain quadtree, atmosphere shader, part meshes, particles, sky, editor scene
src/ui/       React: menu, flight HUD, maps, hangar, touch controls, storage
tests/        headless missions: ascent to orbit, re-entry and splashdown, Moon landing with EVA and relaunch, galaxy, saves
```

Rendering uses a floating origin (the camera sits at 0,0,0 and everything is placed relative to it in double precision),
chunk-local terrain vertices, a logarithmic depth buffer, and the simulation runs at a fixed 60 Hz step independent of
rendering.

## Testing status

Verified in this repository by automated tests: orbit propagation, an Earth launch with booster separation to a stable
orbit, re-entry, parachute deployment and a safe splashdown, a full Moon mission (transfer, capture, powered landing,
astronaut walk, flag, boarding, relaunch), gas-giant crushing, time-acceleration caps, deterministic galaxy generation and
save round-trips.

Rendering and the touch layout were exercised in headless Chromium (software GL). **Frame rates are not measured on
real devices:** the targets are 60 FPS on capable desktops and 30 FPS on mobile via the Auto graphics preset (which lowers
terrain detail and pixel ratio when frames run slow), but desktop Chrome, Android Chrome and iOS Safari have not been
benchmarked here, so treat those figures as goals.

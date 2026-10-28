# Killhouse

A mobile-first tactical first-person shooter built on Three.js (WebGL) and TypeScript. You clear a close-quarters training compound of 12 riflemen and 3 quadrotor drones against a par time.

Everything is generated in code when the page loads: the concrete, brick, crate and steel textures (canvas noise with derived normal maps), the warehouse geometry, the rifle and the enemy models, and every sound (Web Audio synthesis). The repository has no image, model or audio files.

## Run it

```bash
npm install
npm run dev     # Vite dev server, exposed on your LAN: open the printed URL on a phone
npm run build   # typecheck, then one self-contained dist/index.html (~760 KB)
```

`dist/index.html` runs from any static host or straight from a phone's file browser, because the build inlines all JS and CSS.

## Controls

| Touch | Action |
|---|---|
| Left half of the screen | Floating thumbstick: strafe and move |
| Right half of the screen | Drag to look; a quick tap fires one round |
| Fire | Hold for full auto; keep dragging the thumb on it to track a target |
| Aim | Toggle aim-down-sights (red dot, 1.5× zoom, tighter spread) |
| Reload | Reload (it also starts automatically when the magazine runs dry) |
| Auto | Crosshair macro: fires while the crosshair rests on a hostile |
| Light | Weapon light. Switching it off cuts how far unaware enemies can spot you |

On desktop, click to capture the mouse. Then use WASD to move, the left button to fire, the right button or Q to aim, R to reload, F for the light, T for auto and Esc to pause.

## Architecture

| Module | Responsibility |
|---|---|
| `core/GameLoop.ts` | `requestAnimationFrame` driver with semi-fixed sub-stepping (≤ 1/60 s steps), so physics stays stable at 30 Hz and motion stays smooth at 120 Hz |
| `core/Game.ts` | Builds the world, wires the systems together, runs the state machine (loading → menu → playing ⇄ paused → ended) and sets the frame order |
| `core/RenderPipeline.ts` | Renderer setup, the two-pass draw (world, then the viewmodel over a cleared depth buffer), field of view and adaptive resolution |
| `input/MobileInputController.ts` | Split-screen touch zones, floating stick, look drag, tap to shoot, fire/aim/reload buttons, plus a keyboard and pointer-lock fallback |
| `player/PlayerController.ts` | Movement, collision, look, recoil, head bob, damage direction, death camera |
| `weapons/WeaponModel.ts` | Procedural M4-pattern carbine with optic, weapon light and gloved hands (PBR metals with an environment map) |
| `weapons/WeaponSystem.ts` | Ammo, fire control, raycast hitscan with spread and bloom, recoil springs, sway, ADS, reload animation, muzzle flash, shell casings |
| `level/LevelConstructor.ts` | Turns the ASCII floor plan into merged and instanced geometry, lamps, pipes, colliders, nav grid and spawns |
| `level/ProceduralTextures.ts` | Tileable noise and every texture in the game |
| `level/CollisionWorld.ts` | Analytic oriented boxes and cylinders, shared by bullets, enemy line of sight and movement |
| `level/NavGrid.ts` | 8-connected A* with string-pulled waypoints |
| `ai/TargetManager.ts` | Spawns, updates and hit-tests every hostile; owns gunshot hearing |
| `ai/Enemy.ts` | Shared enemy brain: perception (view cone, line of sight, a suspicion delay), the state machine, steering and return fire |
| `ai/SoldierEnemy.ts`, `ai/DroneEnemy.ts` | Rifleman (bursts, strafing, falls on death) and drone (orbits, telegraphed laser, crashes and explodes) |
| `fx/*` | Pooled GPU particles, an instanced bullet-hole ring buffer, travelling tracers, flashes |
| `audio/AudioSystem.ts` | Synthesized reports, mechanics and impacts; warehouse reverb; spatial panning |
| `ui/*` | HUD (visor, compass, crosshair, damage arcs), heading-up radar, menus |

All tuning numbers live in `src/config.ts`, and the floor plan, lamps and exit signs live in `src/level/LevelLayout.ts`.

## Rendering notes

- **Shadows:** the weapon light is a `SpotLight` with a cookie texture and dynamic soft shadows. It sits low and right of the eye so its shadows can be seen. Three hung lamps bake their shadow maps once at load, before anything that moves is spawned.
- **Soft shadow filter:** the request asked for `PCFSoftShadowMap`. In three.js r186, which this project pins, that filter has been merged into `PCFShadowMap` (Vogel-disk PCF, softened with `shadow.radius`), and the old constant only logs a deprecation warning. The project uses the merged filter.
- **Viewmodel pass:** the rifle renders on its own layer with a narrower FOV after a depth clear, so it never clips into walls. Every light is enabled on both layers, so both passes compile the same shader programs.
- **Adaptive resolution:** the pixel ratio drops below 42 fps and climbs back above 57 fps, between 0.6 and 2.
- **Precompiling:** every material compiles at load, and pooled effects exist from the start, so the first shot doesn't stutter.

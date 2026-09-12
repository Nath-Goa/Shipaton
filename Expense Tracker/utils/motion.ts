// Fluid-gesture primitives from Apple's "Designing Fluid Interfaces" (WWDC
// 2018), translated for Reanimated worklets — see .claude/skills/apple-design
// for the source formulas. Every export is used from inside a Gesture.Pan()
// .onUpdate/.onEnd worklet, so each carries its own 'worklet' directive
// rather than relying on Reanimated's auto-workletization of imported
// functions, which isn't guaranteed across babel-plugin/Reanimated versions.

/**
 * Progressive resistance past a boundary — the further past it, the less
 * further movement follows, instead of a hard stop. `overshoot` and
 * `dimension` must share a unit (both px, or both "progress" units); the
 * formula is linear-homogeneous in the two together, so it's unit-agnostic
 * as long as they match. Returns the damped "give," not a final position.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  'worklet';
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/**
 * Apple's exponential-decay momentum projection (not the physics-textbook
 * v²/2a) — projects how far a released gesture's velocity would carry it.
 * `velocity` is in units/sec matching whatever position space you'll add
 * the result to (e.g. px/s for a pixel offset, or progress-units/s for a
 * fractional index).
 */
export function projectMomentum(velocity: number, decelerationRate = 0.998): number {
  'worklet';
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Nearest of an arbitrary set of snap points to a value. */
export function nearestSnapPoint(value: number, points: readonly number[]): number {
  'worklet';
  let closest = points[0];
  let closestDist = Math.abs(points[0] - value);
  for (let i = 1; i < points.length; i++) {
    const dist = Math.abs(points[i] - value);
    if (dist < closestDist) {
      closest = points[i];
      closestDist = dist;
    }
  }
  return closest;
}

/**
 * SlidingTabs' specialization of nearestSnapPoint: tab indices are
 * consecutive integers, so the landing tab is just the projected progress
 * clamped to the valid range and rounded — no point-set scan needed.
 */
export function projectedSnapIndex(currentProgress: number, velocity: number, maxIndex: number, decelerationRate = 0.998): number {
  'worklet';
  const projected = currentProgress + projectMomentum(velocity, decelerationRate);
  return Math.round(Math.min(maxIndex, Math.max(0, projected)));
}

/**
 * Blends position + velocity into one commit signal, so a fast flick can
 * commit a gesture even short of the pure-position threshold. Reused by
 * SlidingTabs' own swipe-intent calc (velocityWeight 0.12, already tuned
 * there) and the swipeable list rows' release decision.
 */
export function gestureIntent(translation: number, velocity: number, velocityWeight = 0.12): number {
  'worklet';
  return translation + velocity * velocityWeight;
}

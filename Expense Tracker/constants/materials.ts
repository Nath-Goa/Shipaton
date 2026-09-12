// Named blur/translucency tiers, per the apple-design skill's material-
// weight guidance (§12): "bigger/structural surfaces read thicker, lighter
// surfaces draw attention to interactive elements." Centralizes the app's
// BlurView intensities so they're one source of truth instead of repeated
// magic numbers at each call site.
export const material = {
  // Large, persistent, theme-consistent backdrop — the bottom tab bar,
  // which blurs over known app screens. Documents SlidingTabs.tsx's
  // existing, already-correct value.
  chrome: { intensity: 70 },
  // Transient full-screen overlay atop known app content — the tab bar's
  // long-press quick-actions menu. Documents SlidingTabs.tsx's existing
  // value.
  overlay: { intensity: 55 },
  // A non-blocking panel that can sit atop UNPREDICTABLE backdrop content
  // (e.g. the scanner's result sheet, blurring over an arbitrary camera
  // photo rather than a known app screen) — pairs a slightly lower blur
  // intensity with a fixed surface tint composited on top, closer to iOS's
  // .regularMaterial than .ultraThinMaterial, since blur alone isn't a safe
  // legibility guarantee over unknown brightness/color content.
  panel: { intensity: 65, tintOpacity: 0.85 },
} as const;

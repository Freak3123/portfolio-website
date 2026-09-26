/**
 * Every number here was measured off the art, not chosen by eye.
 * Provenance for each block is in plan/hero.md.
 */

/** Natural size of both portrait layers. */
export const IMG = { w: 1024, h: 1536 } as const;
/** Multiply a uv-y delta by this to compare it with a uv-x delta. */
export const AR = IMG.h / IMG.w; // 1.5

/* ── palette (plan §2) — the two states trade foreground and background ───── */
export const COLOR = {
  ink: "#0A101A",
  saffron: "#FDBF28",
  /**
   * The exact baked field colours, sampled off the renders. The shader grounds
   * use these rather than the palette tokens: a two-level mismatch is invisible
   * on a full-bleed image but reads as a rectangle once the portrait is a
   * centred column with ground either side of it.
   */
  bakedCold: "#090F17",
  bakedWarm: "#FDBF28",
  paper: "#F3EFE7",
  inkMuted: "#98A1AC",
  umber: "#5A3A0A",
} as const;

export const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

/* ── glasses (plan §6) — Kasa circle fit to the frame pixels of both renders ─ */
export const LENS = {
  left: { cx: 0.3742, cy: 0.3361, r: 0.0679 },
  right: { cx: 0.528, cy: 0.2989, r: 0.0667 },
  /** cursor must come within this (portrait px) before the effect eases in */
  wake: 180,
} as const;

/* ── earrings (plan §9.2) ─────────────────────────────────────────────────── */
/**
 * Both SVGs are rasterised into one shared "ear space" so a single inverse
 * mapping serves both: 300 × 820 units, gem top at y=60, centred on x=150.
 */
export const EAR_SPACE = { w: 300, h: 820, gemTop: 60, cx: 150 } as const;
export const EAR_SRC = {
  cold: { file: "/hero/cold-earing.svg", w: 300, h: 700, dy: 15 },
  warm: { file: "/hero/warm-earing.svg", w: 300, h: 760, dy: 10 },
} as const;

export const EAR = {
  /** lobe piercing point, portrait px — shared, because the layers are aligned */
  anchor: { x: 704, y: 550 },
  scale: 0.18,
  /** jump ring in ear space — the hinge you drew */
  ringY: 290,
  /** the rotation of body B fades in across this ear-space band, so the stem bends */
  blend: [300, 350] as [number, number],
  /** cursor influence radius, portrait px */
  influence: 150,
} as const;

/** The earring's bounding box in portrait px, derived from the two above. */
export const EAR_RECT = {
  x0: EAR.anchor.x + (0 - EAR_SPACE.cx) * EAR.scale,
  y0: EAR.anchor.y + (0 - EAR_SPACE.gemTop) * EAR.scale,
  x1: EAR.anchor.x + (EAR_SPACE.w - EAR_SPACE.cx) * EAR.scale,
  y1: EAR.anchor.y + (EAR_SPACE.h - EAR_SPACE.gemTop) * EAR.scale,
} as const;

/* ── pendulums (plan §9.2, §11) ───────────────────────────────────────────── */
/** ω = 2π/period, ζ = damping ratio. Settling time ≈ 1/(ζω). */
export const SPRINGS = {
  /** whole earring, pivoting at the post */
  earA: { w: 10.1, z: 0.05, clamp: 0.244 /* 14° */ },
  /** the drop, pivoting at the jump ring */
  earB: { w: 15.0, z: 0.035, clamp: 0.384 /* 22° */ },
  /** the bulb — slow and heavy */
  bulb: { w: 5.71, z: 0.04, clamp: 0.5 /* 28.6° */ },
} as const;

/** how much of body A's angular acceleration the drop inherits */
export const EAR_CARRY = 0.55;
/** kick given to every pendulum when the state toggles */
/** the lamp's kick stays small — a switch should nudge it, not launch it */
export const TOGGLE_KICK = { ear: 1.8, bulb: 0.9 } as const;

/* ── the halo (measured off the art) ──────────────────────────────────────
 * Hair/head top sits at uv y 0.115; at face height the hair spans uv x
 * 0.22–0.81. So the skull centre is ~(0.517, 0.245) and a ring a little wider
 * than the hair clears it on both sides while arcing above the crown.
 */
export const HALO = {
  /** centre, in portrait uv — a little above the skull, so the ring crowns her */
  cx: 0.517,
  cy: 0.2,
  /** radii as a fraction of the portrait's *width*, so the ring stays circular */
  rx: 0.5,
  ry: 0.3,
  /**
   * Elements dissolve through the bottom arc rather than crossing her hair.
   * Full opacity out to the sides (where the field is clear) and gone by ~45°
   * below the horizontal, which is where the hair starts to fill the width.
   */
  fadeFrom: 0.55,
  fadeTo: 0.85,
} as const;

/* ── the bulb ─────────────────────────────────────────────────────────────── */
export const BULB = {
  /** glass radius in px */
  r: 22,
  /** flex length as a fraction of hero height, clamped */
  len: [150, 0.26, 300] as [number, number, number],
} as const;

/* ── the tear (plan §8) ───────────────────────────────────────────────────── */
export const TEAR = {
  /** radius in uv-x units ≈ 113px at the 1024 reference */
  radius: 0.11,
  touchRadius: 0.14,
  /** how long a tap-opened hole stays before closing, ms */
  touchHold: 2500,
  /** cells across the portrait — 24px at the reference width, per L2 */
  cells: [42, 63] as [number, number],
  /** cursor follow, per frame at 60fps */
  lerp: 0.06,
  radiusLerp: 0.1,
} as const;

/* ── the global transition (plan §12) ─────────────────────────────────────── */
export const TRANSITION_MS = 1000;

/* ── motion ───────────────────────────────────────────────────────────────── */
export const FIXED_DT = 1 / 120; // pendulums integrate on fixed substeps
export const MAX_DPR = { desktop: 2, mobile: 1.5 } as const;

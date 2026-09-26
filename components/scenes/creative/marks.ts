/**
 * The creative self's drawing vocabulary, lifted verbatim from the hero's warm
 * orbiters (components/hero/Ambient.tsx → MARKS / MARK_COLOURS) so the "other
 * half" chapter is visibly the same hand as the saffron portrait.
 *
 * Reference: the hero art's own white doodles (animation-reference/characters/
 * warm.svg) — hearts, stars, paper plane, spiral, squiggle, motion lines.
 */
export const MARKS = [
  "M0 4 C0 0 5 0 5 3.5 C5 0 10 0 10 4 C10 8 5 11 5 11 C5 11 0 8 0 4 Z", // heart
  "M6 0 L7.6 4.2 L12 4.6 L8.6 7.5 L9.7 12 L6 9.4 L2.3 12 L3.4 7.5 L0 4.6 L4.4 4.2 Z", // star
  "M0 6 L14 0 L9 6 L14 12 Z", // paper plane
  "M8 8 C8 4 4 4 4 7 C4 10 9 11 11 7 C13 2 7 -1 3 2 C-1 5 0 12 5 14", // spiral
  "M0 6 Q3 0 6 6 T12 6", // squiggle
  "M1 0 L0 7 M6 0 L5.4 6 M10.5 1 L8.8 6.6", // motion lines
] as const;

/** white first — the art's doodles are white; umber is the hero's own
 *  "holds against saffron" stroke, used sparingly */
export const MARK_WHITE = "#FFFFFF";
export const MARK_UMBER = "#8C4A1E";

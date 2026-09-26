import { RANGES } from "./chapters";

/**
 * Where along the story's spine a global progress `g` sits. Mirrors the
 * camera logic in journey.ts (rest on a node, then one step of travel to the
 * next), so anything drawn along the silk arrives exactly when the camera does.
 */

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * The travel segment `g` is inside, or null while resting on a chapter.
 * `from` is the chapter index being left; `t` is eased 0 … 1 like the camera.
 */
export function travelAt(g: number): { from: number; t: number } | null {
  for (let i = 0; i < RANGES.length - 1; i++) {
    const restEnd = RANGES[i].start + RANGES[i].steps - 1;
    const next = RANGES[i + 1].start;
    if (g > restEnd && g < next) return { from: i, t: smooth((g - restEnd) / (next - restEnd)) };
  }
  return null;
}

/** index of the chapter `g` rests on or last left */
export function restIndexAt(g: number): number {
  let idx = 0;
  for (let i = 0; i < RANGES.length; i++) if (g >= RANGES[i].start - 1e-3) idx = i;
  return idx;
}

/**
 * Spine progress in "pieces": piece 0 is the prologue dragline, piece i (≥1)
 * is the thread from chapter i-1 to chapter i. Resting on chapter i returns
 * exactly i + 1 (pieces 0…i fully travelled); mid-travel returns a fraction.
 */
export function spinePieces(g: number): number {
  const tr = travelAt(g);
  if (tr) return tr.from + 1 + tr.t;
  return restIndexAt(g) + 1;
}

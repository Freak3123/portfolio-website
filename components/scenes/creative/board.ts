/**
 * The "Draw here." board as seen from outside it — a tiny shared handle so the
 * butterflies (creative/Butterflies) can land on the board's edge and on the
 * marks the visitor has made. DrawPad registers; Butterflies reads. No React.
 */

export type Perch = {
  /** identity of the mark it sits on; gone from the board ⇒ the perch is gone */
  key: object;
  /** canvas-local px */
  x: number;
  y: number;
};

export const board = {
  /** the glass board (its top edge is a perch) */
  el: null as HTMLElement | null,
  /** the drawing canvas (mark perches are local to it) */
  canvas: null as HTMLCanvasElement | null,
  /** a random point on a random mark, or null when the board is empty */
  sample: (): Perch | null => null,
  /** is this mark still on the board? */
  has: (key: object): boolean => (void key, false),
};

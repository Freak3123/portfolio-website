import { orbWeb, strandPath, type Pt } from "@/lib/web/draw";
import { RINGS } from "./data";

/**
 * Deterministic geometry for the Spin web, in a 1000×1000 viewBox. Computed
 * once at module load on both server and client (seeded), so the SSR markup and
 * the hydrated markup are identical.
 *
 * The capture spiral is a true spiral, not concentric circles: between two
 * radials it runs in a straight segment (as real capture silk does), stepping
 * out by one ring per turn. TURNS_PER_RING turns make one career ring.
 */
export const VIEW = 1000;
export const C: Pt = { x: 500, y: 500 };
export const RADIUS = 440;
export const SPOKES = 20;
export const TURNS_PER_RING = 3;
const TURNS = RINGS.length * TURNS_PER_RING;

const web = orbWeb(C, RADIUS, { spokes: SPOKES, rings: TURNS + 1, seed: 11, hub: 0.15 });
export const ANCHORS = web.radials;

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** spiral point n (turn = floor(n / SPOKES), spoke = n % SPOKES) */
export const SPIRAL: Pt[] = (() => {
  const pts: Pt[] = [];
  for (let t = 0; t < TURNS; t++) {
    for (let i = 0; i < SPOKES; i++) pts.push(lerp(web.rings[t][i], web.rings[t + 1][i], i / SPOKES));
  }
  pts.push(web.rings[TURNS][0]);
  return pts;
})();

const f = (n: number) => n.toFixed(1);

/** one path per career ring; consecutive bands share their joining point */
export const BAND_PATHS: string[] = RINGS.map((_, b) => {
  const from = b * TURNS_PER_RING * SPOKES;
  const to = (b + 1) * TURNS_PER_RING * SPOKES;
  let d = `M${f(SPIRAL[from].x)} ${f(SPIRAL[from].y)}`;
  for (let n = from + 1; n <= to; n++) d += ` L${f(SPIRAL[n].x)} ${f(SPIRAL[n].y)}`;
  return d;
});

export const radialPath = (i: number, pluck = 0) => strandPath(C, ANCHORS[i], 0, pluck);

/** the frame thread joining the radial anchors, plus three mooring lines off the web */
export const FRAME_PATH = (() => {
  let d = `M${f(ANCHORS[0].x)} ${f(ANCHORS[0].y)}`;
  for (let i = 1; i < SPOKES; i++) d += ` L${f(ANCHORS[i].x)} ${f(ANCHORS[i].y)}`;
  return d + " Z";
})();
export const MOORINGS: string[] = [
  { i: 2, to: { x: 1000, y: 700 } },
  { i: 9, to: { x: 0, y: 380 } },
  { i: 15, to: { x: 620, y: 0 } },
].map(({ i, to }) => strandPath(ANCHORS[i], to, 6));

/** the hub: a small, irregular mesh where the radials meet */
export const HUB_PATH = (() => {
  let d = "";
  for (const k of [0.35, 0.7]) {
    for (let i = 0; i <= SPOKES; i++) {
      const p = lerp(C, web.rings[0][i % SPOKES], k);
      d += `${i === 0 ? "M" : " L"}${f(p.x)} ${f(p.y)}`;
    }
  }
  return d;
})();

/* ── where things sit on the spiral ───────────────────────────────────── */

/** spokes each ring's dew drops hang on (kept clear of the label spoke) */
const DROP_SPOKES = [
  [2, 12],
  [4, 17],
  [1, 8, 13, 18],
  [3, 7, 11, 13, 19],
];
/** label spoke per ring — the outer ring's label goes on top, clear of the viewport edge */
const LABEL_SPOKES = [15, 10, 5, 16];
const LABEL_SIDES = ["top", "left", "bottom", "top"] as const;

export type Placed = Pt & { side: "top" | "left" | "bottom" | "right" };

export const DROPS: Pt[][] = RINGS.map((ring, b) =>
  ring.drops.map((_, k) => SPIRAL[(b * TURNS_PER_RING + 1) * SPOKES + DROP_SPOKES[b][k % DROP_SPOKES[b].length]]),
);

export const LABELS: Placed[] = RINGS.map((_, b) => {
  const p = SPIRAL[(b * TURNS_PER_RING + 2) * SPOKES + LABEL_SPOKES[b]];
  return { ...p, side: LABEL_SIDES[b] };
});

/** where the spider parks when the spiral is finished */
export const SPIRAL_END = SPIRAL[SPIRAL.length - 1];

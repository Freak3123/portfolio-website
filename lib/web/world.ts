import { orbWeb, rng, type OrbWeb, type Pt } from "./draw";
import { CHAPTERS } from "@/lib/journey/chapters";

/**
 * The world the journey camera flies through, built once and deterministically
 * (same web on every visit, server and client agree).
 *
 * Layers are drawn at different depths for parallax: a point on a layer of
 * depth d lands on screen at  centre + (p − camera) · scale · d, so far layers
 * (d < 1) drift slower and read smaller, near layers (d > 1) sweep past.
 *
 *   0  far    faint webs behind the story
 *   1  main   the orb-weaver the chapters hang on (depth 1 = journey.worldToScreen)
 *   2  near   a few loose strands and small webs in front of the lens
 */

export type LayerId = 0 | 1 | 2;
export const LAYER_DEPTH: Record<LayerId, number> = { 0: 0.55, 1: 1, 2: 1.55 };

export type Segments = {
  count: number;
  ax: Float32Array;
  ay: Float32Array;
  bx: Float32Array;
  by: Float32Array;
  /** gravity droop at the midpoint, world units */
  sag: Float32Array;
  layer: Uint8Array;
  /** warm grammar: every strand wobbles on its own clock */
  phase: Float32Array;
  speed: Float32Array;
};

export type Dew = { x: number; y: number; r: number; phase: number };

class SegBuilder {
  ax: number[] = [];
  ay: number[] = [];
  bx: number[] = [];
  by: number[] = [];
  sag: number[] = [];
  layer: number[] = [];

  add(a: Pt, b: Pt, layer: LayerId, sag = 0) {
    this.ax.push(a.x);
    this.ay.push(a.y);
    this.bx.push(b.x);
    this.by.push(b.y);
    this.sag.push(sag);
    this.layer.push(layer);
  }

  /** radials split at every ring crossing (so a pluck stays local), then rings */
  web(w: OrbWeb, layer: LayerId, sagK = 0.035, frame = true) {
    const n = w.radials.length;
    for (let i = 0; i < n; i++) {
      let prev = w.center;
      for (const ring of w.rings) {
        this.add(prev, ring[i], layer);
        prev = ring[i];
      }
      this.add(prev, w.radials[i], layer);
    }
    for (const ring of w.rings) {
      for (let i = 0; i < n; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % n];
        this.add(a, b, layer, Math.hypot(b.x - a.x, b.y - a.y) * sagK);
      }
    }
    if (frame) {
      for (let i = 0; i < n; i++) {
        const a = w.radials[i];
        const b = w.radials[(i + 1) % n];
        this.add(a, b, layer, Math.hypot(b.x - a.x, b.y - a.y) * sagK * 0.5);
      }
    }
  }

  build(seed: number): Segments {
    const count = this.ax.length;
    const r = rng(seed);
    const phase = new Float32Array(count);
    const speed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      phase[i] = r() * Math.PI * 2;
      speed[i] = 0.7 + r() * 1.6;
    }
    return {
      count,
      ax: Float32Array.from(this.ax),
      ay: Float32Array.from(this.ay),
      bx: Float32Array.from(this.bx),
      by: Float32Array.from(this.by),
      sag: Float32Array.from(this.sag),
      layer: Uint8Array.from(this.layer),
      phase,
      speed,
    };
  }
}

/* ── the spine: silk that ties the chapters together, in story order ──────── */

export type Spine = {
  /** flattened polyline x0,y0,x1,y1… in world units */
  pts: Float32Array;
  /** cumulative length at each point */
  cum: Float32Array;
  /** index of the last point of each piece (piece 0 = the prologue dragline) */
  pieceEnd: number[];
};

/** how far above the prologue node the dragline starts (world units) */
export const DRAGLINE = 760;

function buildSpine(): Spine {
  const xs: number[] = [];
  const ys: number[] = [];
  const pieceEnd: number[] = [];
  const first = CHAPTERS[0].node;

  // piece 0: the single dragline dropping from above — the hero's thread
  const DROP = 24;
  for (let i = 0; i <= DROP; i++) {
    xs.push(first.x);
    ys.push(first.y - DRAGLINE + (DRAGLINE * i) / DROP);
  }
  pieceEnd.push(xs.length - 1);

  // pieces 1…n: node to node, each thread bowed toward the hub like silk laid
  // along the web rather than cut straight across it
  const SAMPLES = 40;
  for (let c = 1; c < CHAPTERS.length; c++) {
    const a = CHAPTERS[c - 1].node;
    const b = CHAPTERS[c].node;
    const cx = ((a.x + b.x) / 2) * 0.72;
    const cy = ((a.y + b.y) / 2) * 0.72 + 30;
    for (let i = 1; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const u = 1 - t;
      xs.push(u * u * a.x + 2 * u * t * cx + t * t * b.x);
      ys.push(u * u * a.y + 2 * u * t * cy + t * t * b.y);
    }
    pieceEnd.push(xs.length - 1);
  }

  const pts = new Float32Array(xs.length * 2);
  const cum = new Float32Array(xs.length);
  for (let i = 0; i < xs.length; i++) {
    pts[i * 2] = xs[i];
    pts[i * 2 + 1] = ys[i];
    if (i > 0) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }
  return { pts, cum, pieceEnd };
}

/** spine length travelled for a fractional piece count (see spinePieces) */
export function spineLength(spine: Spine, pieces: number, dragline = 1): number {
  const n = spine.pieceEnd.length;
  const endLen = (k: number) => spine.cum[spine.pieceEnd[Math.min(Math.max(k, 0), n - 1)]];
  // still on the prologue: only the dragline, dropped as far as the handoff allows
  if (pieces <= 1) return endLen(0) * Math.max(0, pieces) * dragline;
  if (pieces >= n) return endLen(n - 1);
  const whole = Math.floor(pieces);
  const a = endLen(whole - 1);
  return a + (endLen(whole) - a) * (pieces - whole);
}

/* ── the world ─────────────────────────────────────────────────────────── */

export type World = {
  segs: Segments;
  dew: Dew[];
  spine: Spine;
};

let cached: World | null = null;

export function world(): World {
  if (cached) return cached;
  const b = new SegBuilder();
  const r = rng(9031);

  // far: four faint webs behind everything
  const FAR: [number, number, number][] = [
    [-1500, -1100, 780],
    [1650, -900, 700],
    [1500, 1250, 820],
    [-1650, 1150, 720],
  ];
  FAR.forEach(([x, y, rad], i) =>
    b.web(orbWeb({ x, y }, rad, { spokes: 16, rings: 10, seed: 101 + i * 17, hub: 0.14 }), 0, 0.03),
  );

  // main: one giant orb-weaver, the chapters sit on it
  const main = orbWeb({ x: 0, y: 0 }, 1100, { spokes: 30, rings: 26, seed: 4242, hub: 0.07 });
  b.web(main, 1, 0.035);
  // mooring lines: the frame threads that hold the web out in the world
  for (let i = 0; i < 7; i++) {
    const k = Math.floor(r() * main.radials.length);
    const a = main.radials[k];
    const ang = Math.atan2(a.y, a.x) + (r() - 0.5) * 0.5;
    b.add(a, { x: a.x + Math.cos(ang) * 1600, y: a.y + Math.sin(ang) * 1600 }, 1, 20);
  }
  // secondary webs anchored between the chapters
  const SECONDARY: [number, number, number][] = [
    [980, 120, 260],
    [-1000, 60, 240],
    [80, 1080, 230],
    [-760, -980, 210],
    [900, -980, 220],
  ];
  SECONDARY.forEach(([x, y, rad], i) => {
    const w = orbWeb({ x, y }, rad, { spokes: 14, rings: 9, seed: 707 + i * 29, hub: 0.12 });
    b.web(w, 1, 0.04);
    // tie each small web back to the big one with a bridge thread
    const tip = w.radials[Math.floor(r() * w.radials.length)];
    const len = Math.hypot(tip.x, tip.y) || 1;
    b.add(tip, { x: (tip.x / len) * 1000, y: (tip.y / len) * 1000 }, 1, 14);
  });

  // near: loose strands and two small webs passing close to the lens
  for (let i = 0; i < 9; i++) {
    const cx = (r() - 0.5) * 2200;
    const cy = (r() - 0.5) * 2000;
    const ang = r() * Math.PI;
    const half = 500 + r() * 600;
    b.add(
      { x: cx - Math.cos(ang) * half, y: cy - Math.sin(ang) * half },
      { x: cx + Math.cos(ang) * half, y: cy + Math.sin(ang) * half },
      2,
      30 + r() * 50,
    );
  }
  b.web(orbWeb({ x: -1150, y: -700 }, 300, { spokes: 12, rings: 7, seed: 55, hub: 0.15 }), 2, 0.05, false);
  b.web(orbWeb({ x: 1150, y: 760 }, 320, { spokes: 12, rings: 7, seed: 77, hub: 0.15 }), 2, 0.05, false);

  // dew: a scatter of drops on the main web's spiral intersections
  const dew: Dew[] = [];
  const dr = rng(313);
  main.rings.forEach((ring, k) =>
    ring.forEach((p) => {
      if (k > 1 && dr() < 0.075) dew.push({ x: p.x, y: p.y, r: 1.6 + dr() * 2.2, phase: dr() * Math.PI * 2 });
    }),
  );

  cached = { segs: b.build(5150), dew, spine: buildSpine() };
  return cached;
}

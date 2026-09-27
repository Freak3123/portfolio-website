/**
 * Trace — content and geometry. Pure module (no DOM), so the server can draw
 * the static webs and the client canvas can animate the same geometry.
 *
 * Geometry lives in "trace world" units (each web is an orbWeb of radius ~1).
 * The canvas maps it to pixels through its own camera.
 */
import { orbWeb, type Pt } from "@/lib/web/draw";

export type Metric = {
  from: number;
  to: number;
  decimals: number;
  prefix?: string;
  suffix?: string;
  /** tiny mono caption under the number */
  caption: string;
};

export type Project = {
  name: string;
  stack: string;
  /** ≤ 6 words each */
  symptom: string;
  cause: string;
  fix: string;
  metric: Metric;
  href: string;
};

export const PROJECTS: readonly Project[] = [
  {
    name: "Memonative",
    stack: "Python · FastAPI · Postgres + pgvector · Redis · Celery",
    symptom: "Agents forget between sessions",
    cause: "Memory stored as flat text",
    fix: "Decay, consolidation, conflict resolution",
    metric: { from: 0, to: 81, decimals: 0, suffix: "%", caption: "LongMemEval-S · 100% Recall@5" },
    href: "#", // DEMO: project link unknown
  },
  {
    name: "AI Legal Intent Rewriter",
    stack: "Next.js · FastAPI · LegalBERT · Flan-T5",
    symptom: "Risky clauses slip through",
    cause: "Intent buried in clause structure",
    fix: "Segment, classify intent, rewrite, flag",
    metric: { from: 0, to: 0.912, decimals: 3, caption: "accuracy · 0.915 F1 on CUAD" },
    href: "#", // DEMO: project link unknown
  },
  {
    name: "Brawer",
    stack: "Next.js 16 · Node WebSocket · Supabase · react-konva",
    symptom: "Strokes lag between players",
    cause: "A database round-trip per stroke",
    fix: "Own WebSocket server, Zod protocol",
    metric: { from: 1000, to: 100, decimals: 0, prefix: "<", suffix: "ms", caption: "latency · 60fps · 15 lobbies" },
    href: "#", // DEMO: project link unknown
  },
];

export function formatMetric(m: Metric, v: number) {
  return `${m.prefix ?? ""}${v.toFixed(m.decimals)}${m.suffix ?? ""}`;
}

/* ── geometry ──────────────────────────────────────────────────────────── */

export type Segment = { a: Pt; b: Pt };

const SPOKES = 10;
const RINGS = 4;

/** the finished web on each static project card (server-rendered SVG) */
export function webSegments(seed: number): { segments: Segment[]; dew: Pt[] } {
  const w = orbWeb({ x: 0, y: 0 }, 1, { spokes: SPOKES, rings: RINGS, seed, hub: 0.16 });
  const segments: Segment[] = [];
  w.radials.forEach((p) => segments.push({ a: w.center, b: p }));
  for (const ring of w.rings) {
    ring.forEach((p, i) => segments.push({ a: p, b: ring[(i + 1) % ring.length] }));
  }
  const dew = w.rings.flatMap((ring, k) => ring.filter((_, i) => (i + k) % 3 === 0));
  return { segments, dew };
}

/* ── the network: separate webs, joined one thread at a time ─────────────
   web 0 is where the chapter starts ("Trace first."), webs 1…3 hold one
   project each, the rest are small satellite webs that only join up as the
   chapter leaves — the moment the separate webs become one network. */

export type NetWeb = {
  c: Pt;
  r: number;
  radials: Pt[];
  /** capture rings, inner → outer; ring[k][i] sits on radial i */
  rings: Pt[][];
  /** a few ring points that carry dew once the web is spun */
  dew: Pt[];
  /** 0 start web, 1…3 project webs, -1 satellite */
  role: number;
};

/**
 * A thread from one web to the next, as a polyline the tracer draws along:
 * out of the source hub along a radial, across the gap as a bowed bridge,
 * then in along the target's radial to its hub.
 */
export type NetPath = {
  from: number;
  to: number;
  /** flattened x,y */
  pts: Float32Array;
  cum: Float32Array;
  /** length at the far rim (where the bridge lands: the symptom) */
  land: number;
  /** total length (the target hub: the root cause) */
  total: number;
};

export type Network = {
  webs: NetWeb[];
  /** paths[k] leads to project web k + 1 */
  paths: NetPath[];
  /** satellite bridges, drawn as the network completes */
  links: NetPath[];
  bounds: { x0: number; y0: number; x1: number; y1: number };
};

const WEBS: [number, number, number, number][] = [
  // x, y, radius, role
  [0, 0, 1, 0],
  [3.3, -1.15, 1, 1],
  [6.1, 1.2, 1, 2],
  [9.2, -0.35, 1, 3],
  [1.5, 2.55, 0.62, -1],
  [4.7, -3.2, 0.58, -1],
  [7.6, 3.75, 0.64, -1],
  [11.5, 1.95, 0.56, -1],
  [-1.9, -2.3, 0.52, -1],
  [11.6, -2.75, 0.5, -1],
];
/** satellite → the web it ties onto */
const LINKS: [number, number][] = [
  [0, 4],
  [4, 2],
  [1, 5],
  [2, 6],
  [3, 7],
  [0, 8],
  [3, 9],
  [5, 3],
];

function nearestRadial(w: NetWeb, angle: number): Pt {
  let best = w.radials[0];
  let bd = Infinity;
  for (const p of w.radials) {
    const a = Math.atan2(p.y - w.c.y, p.x - w.c.x);
    const d = Math.abs(Math.atan2(Math.sin(a - angle), Math.cos(a - angle)));
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

function makePath(webs: NetWeb[], from: number, to: number, bow: number): NetPath {
  const A = webs[from];
  const B = webs[to];
  const ang = Math.atan2(B.c.y - A.c.y, B.c.x - A.c.x);
  const exit = nearestRadial(A, ang);
  const land = nearestRadial(B, ang + Math.PI);
  const xs: number[] = [];
  const ys: number[] = [];
  const line = (p: Pt, q: Pt, n: number, skipFirst: boolean) => {
    for (let i = skipFirst ? 1 : 0; i <= n; i++) {
      xs.push(p.x + ((q.x - p.x) * i) / n);
      ys.push(p.y + ((q.y - p.y) * i) / n);
    }
  };
  line(A.c, exit, 8, false);
  // the bridge, bowed sideways like a thread floated on the wind
  const mx = (exit.x + land.x) / 2;
  const my = (exit.y + land.y) / 2;
  const dx = land.x - exit.x;
  const dy = land.y - exit.y;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (-dy / len) * bow * len;
  const cy = my + (dx / len) * bow * len;
  const N = 28;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const u = 1 - t;
    xs.push(u * u * exit.x + 2 * u * t * cx + t * t * land.x);
    ys.push(u * u * exit.y + 2 * u * t * cy + t * t * land.y);
  }
  const landIdx = xs.length - 1;
  line(land, B.c, 10, true);
  const pts = new Float32Array(xs.length * 2);
  const cum = new Float32Array(xs.length);
  for (let i = 0; i < xs.length; i++) {
    pts[i * 2] = xs[i];
    pts[i * 2 + 1] = ys[i];
    if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }
  return { from, to, pts, cum, land: cum[landIdx], total: cum[cum.length - 1] };
}

/** the point `d` along a path (clamped) */
export function pathPoint(p: NetPath, d: number): Pt {
  const { pts, cum } = p;
  if (d <= 0) return { x: pts[0], y: pts[1] };
  const n = cum.length;
  if (d >= cum[n - 1]) return { x: pts[(n - 1) * 2], y: pts[(n - 1) * 2 + 1] };
  let i = 1;
  while (cum[i] < d) i++;
  const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return {
    x: pts[(i - 1) * 2] + (pts[i * 2] - pts[(i - 1) * 2]) * t,
    y: pts[(i - 1) * 2 + 1] + (pts[i * 2 + 1] - pts[(i - 1) * 2 + 1]) * t,
  };
}

export function buildNetwork(): Network {
  const webs: NetWeb[] = WEBS.map(([x, y, rad, role], i) => {
    const w = orbWeb({ x, y }, rad, {
      spokes: role < 0 ? 9 : 12,
      rings: role < 0 ? 4 : 6,
      seed: 31 + i * 17,
      hub: 0.14,
    });
    const dew = w.rings.flatMap((ring, k) => ring.filter((_, j) => (j * 3 + k) % 5 === 0));
    return { c: w.center, r: rad, radials: w.radials, rings: w.rings, dew, role };
  });
  const bows = [0.22, -0.26, 0.2];
  const paths = [0, 1, 2].map((k) => makePath(webs, k, k + 1, bows[k]));
  const links = LINKS.map(([a, b], i) => makePath(webs, a, b, i % 2 ? -0.18 : 0.18));
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const w of webs) {
    x0 = Math.min(x0, w.c.x - w.r);
    y0 = Math.min(y0, w.c.y - w.r);
    x1 = Math.max(x1, w.c.x + w.r);
    y1 = Math.max(y1, w.c.y + w.r);
  }
  return { webs, paths, links, bounds: { x0, y0, x1, y1 } };
}

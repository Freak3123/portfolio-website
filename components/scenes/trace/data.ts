/**
 * Trace — content and geometry. Pure module (no DOM), so the server can draw
 * the static webs and the client canvas can animate the same geometry.
 *
 * Geometry lives in unit space (the tangle fits a disc of radius ~1; each fix
 * web is an orbWeb of radius 1 centred on 0,0). The canvas maps it to pixels.
 */
import { orbWeb, rng, type Pt } from "@/lib/web/draw";

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

export type Strand = {
  a: number;
  b: number;
  /** perpendicular bow of the tangled strand, unit space */
  curl: number;
  /** tremble phase */
  ph: number;
  /** set on strands that belong to a trace path */
  project?: number;
  hop?: number;
};

export type Segment = { a: Pt; b: Pt };

export type FixWeb = {
  segments: Segment[];
  /** strand index → segment index, or -1 to collapse into the hub */
  map: number[];
  /** per-strand stagger 0…1 for the re-organisation */
  delay: number[];
  /** a few ring intersections that carry dew */
  dew: Pt[];
};

export type Tangle = {
  nodes: Pt[];
  strands: Strand[];
  /** per project: node indices symptom → hops → root */
  paths: number[][];
  /** per project: strand indices in path order */
  pathStrands: number[][];
  webs: FixWeb[];
};

const SPOKES = 10;
const RINGS = 4;

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

export function buildTangle(seed = 31): Tangle {
  const r = rng(seed);
  const N = 22;
  const nodes: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2;
    const rad = Math.sqrt(0.06 + r() * 0.94) * 1.04;
    nodes.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad * 0.9 });
  }

  const byRadius = nodes.map((_, i) => i).sort((i, j) => Math.hypot(nodes[i].x, nodes[i].y) - Math.hypot(nodes[j].x, nodes[j].y));
  const roots = byRadius.slice(0, 3);
  const outer = byRadius.slice(-6).sort((i, j) => Math.atan2(nodes[i].y, nodes[i].x) - Math.atan2(nodes[j].y, nodes[j].x));
  const symptoms = [outer[0], outer[2], outer[4]];
  const pool = byRadius.filter((i) => !roots.includes(i) && !symptoms.includes(i));

  const paths: number[][] = [];
  for (let p = 0; p < 3; p++) {
    const hops: number[] = [];
    for (let h = 0; h < 3; h++) hops.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    // trace inward: outer symptom → ever closer hops → the knot near the centre
    hops.sort((i, j) => Math.hypot(nodes[j].x, nodes[j].y) - Math.hypot(nodes[i].x, nodes[i].y));
    paths.push([symptoms[p], ...hops, roots[p]]);
  }

  const strands: Strand[] = [];
  const key = new Set<string>();
  const add = (s: Strand) => {
    const k = s.a < s.b ? `${s.a}-${s.b}` : `${s.b}-${s.a}`;
    if (key.has(k)) return -1;
    key.add(k);
    strands.push(s);
    return strands.length - 1;
  };

  const pathStrands = paths.map((path, p) =>
    path.slice(0, -1).map((a, hop) => add({ a, b: path[hop + 1], curl: (r() - 0.5) * 0.5, ph: r() * 6.28, project: p, hop })),
  );
  // the mess: every node tied to two others picked at random, so strands cross
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 2; k++) {
      let j = Math.floor(r() * N);
      if (j === i) j = (j + 1) % N;
      add({ a: i, b: j, curl: (r() - 0.5) * 0.9, ph: r() * 6.28 });
    }
  }
  // enough silk that every segment of the fix web gets a strand
  const need = SPOKES * (RINGS + 1) + 4;
  while (strands.length < need) {
    const a = Math.floor(r() * N);
    add({ a, b: (a + 1 + Math.floor(r() * (N - 1))) % N, curl: (r() - 0.5) * 0.9, ph: r() * 6.28 });
  }

  const webs: FixWeb[] = [0, 1, 2].map((p) => {
    const { segments, dew } = webSegments(11 + p * 7);
    const wr = rng(97 + p * 13);
    // shuffle which strand becomes which segment, so the re-organisation reads as a rearrangement
    const order = strands.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(wr() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const map = new Array<number>(strands.length).fill(-1);
    order.forEach((s, n) => (map[s] = n < segments.length ? n : -1));
    const delay = strands.map(() => wr());
    return { segments, map, delay, dew };
  });

  return { nodes, strands, paths, pathStrands, webs };
}

/**
 * The corner webs' physics, after Subprotocol's verlet-js spiderweb
 * (github.com/subprotocol/verlet-js, examples/spiderweb.html): particles that
 * remember where they were a frame ago, distance constraints relaxed a few
 * times per frame, and pinned anchors. Spokes and catching threads are the
 * same kind of stick, just stiffer and softer — which is what makes a plucked
 * spiral ring ring while the spokes barely move.
 *
 * Fan-shaped rather than full-circle: these live in the corners of a room and
 * hang off two walls, so the outermost spokes are pinned along their length and
 * the rest is held up by the frame thread between them.
 */

export type Particle = {
  x: number;
  y: number;
  /** position a frame ago — velocity is implicit, as in verlet-js */
  px: number;
  py: number;
  /** where it was built, so the static render has a rest pose */
  hx: number;
  hy: number;
  pin: boolean;
  /** hand-drawn offset, only the warm pass applies it */
  jx: number;
  jy: number;
};

export type Stick = { a: Particle; b: Particle; len: number; k: number; spiral: boolean };

export type Web = {
  ps: Particle[];
  sticks: Stick[];
  /** [spoke][ring] — ring 0 is the hub, shared by every spoke */
  grid: Particle[][];
  spokes: number;
  rings: number;
};

export type WebSpec = {
  hx: number;
  hy: number;
  /** fan, radians, clockwise from +x (canvas y points down) */
  a0: number;
  a1: number;
  rx: number;
  ry: number;
  spokes: number;
  rings: number;
  seed: number;
};

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const particle = (x: number, y: number, pin = false): Particle => ({
  x,
  y,
  px: x,
  py: y,
  hx: x,
  hy: y,
  pin,
  jx: 0,
  jy: 0,
});

export function buildWeb(o: WebSpec): Web {
  const rnd = rng(o.seed);
  const hub = particle(o.hx, o.hy, true);
  const ps: Particle[] = [hub];
  const sticks: Stick[] = [];
  const grid: Particle[][] = [];
  const stick = (a: Particle, b: Particle, k: number, spiral: boolean, slack: number) =>
    sticks.push({ a, b, k, spiral, len: Math.hypot(a.x - b.x, a.y - b.y) * slack });

  for (let s = 0; s < o.spokes; s++) {
    const ang = o.a0 + ((o.a1 - o.a0) * s) / (o.spokes - 1);
    const edge = s === 0 || s === o.spokes - 1;
    const col: Particle[] = [hub];
    for (let r = 1; r <= o.rings; r++) {
      // a clear zone round the hub, as real orb webs have, then even rings
      const t = 0.2 + (0.8 * r) / o.rings;
      const p = particle(o.hx + Math.cos(ang) * o.rx * t, o.hy + Math.sin(ang) * o.ry * t, edge);
      // warm draws each point a little off the true ring: spacing along the
      // spoke and a hair across it, so the spiral reads as drawn by hand
      const step = (0.8 / o.rings) * Math.hypot(o.rx * Math.cos(ang), o.ry * Math.sin(ang));
      const along = (rnd() - 0.5) * 0.5 * step;
      const across = (rnd() - 0.5) * 2.2;
      p.jx = Math.cos(ang) * along - Math.sin(ang) * across;
      p.jy = Math.sin(ang) * along + Math.cos(ang) * across;
      col.push(p);
      ps.push(p);
      // radials stay taut; the slack is on the catching threads
      stick(col[r - 1], p, 0.7, false, 0.985);
    }
    grid.push(col);
  }
  for (let s = 0; s < o.spokes - 1; s++) {
    for (let r = 1; r <= o.rings; r++) stick(grid[s][r], grid[s + 1][r], 0.2, true, 0.995);
  }
  return { ps, sticks, grid, spokes: o.spokes, rings: o.rings };
}

export type Step = {
  /** px per frame², already scaled to the frame */
  gravity: number;
  /** a force field sampled per particle — the wind */
  force: (p: Particle, out: { x: number; y: number }) => void;
  damping: number;
  iterations: number;
  /**
   * A faint pull back to the built pose. Soft constraints alone let a long gust
   * fold a ring over its neighbour and it never unfolds; this is the same
   * shape-keeping a drawn web has, and it is far weaker than the sticks.
   */
  home: number;
};

const f = { x: 0, y: 0 };

export function stepWeb(w: Web, o: Step) {
  for (const p of w.ps) {
    if (p.pin) continue;
    o.force(p, f);
    const vx = (p.x - p.px) * o.damping;
    const vy = (p.y - p.py) * o.damping;
    p.px = p.x;
    p.py = p.y;
    p.x += vx + f.x + (p.hx - p.x) * o.home;
    p.y += vy + f.y + o.gravity + (p.hy - p.y) * o.home;
  }
  for (let it = 0; it < o.iterations; it++) {
    for (const s of w.sticks) {
      const dx = s.b.x - s.a.x;
      const dy = s.b.y - s.a.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const m = ((d - s.len) / d) * s.k;
      const wa = s.a.pin ? 0 : s.b.pin ? 1 : 0.5;
      const wb = s.b.pin ? 0 : s.a.pin ? 1 : 0.5;
      s.a.x += dx * m * wa;
      s.a.y += dy * m * wa;
      s.b.x -= dx * m * wb;
      s.b.y -= dy * m * wb;
    }
  }
}

/**
 * The cursor as a finger through the threads: anything inside the radius is
 * pushed out of the way and dragged a little along with the pointer's motion.
 * Only the position moves, not the previous position, so verlet reads the
 * shove as velocity and the constraints spring it back — a pluck.
 */
export function pluck(w: Web, cx: number, cy: number, vx: number, vy: number, radius: number) {
  const r2 = radius * radius;
  for (const p of w.ps) {
    if (p.pin) continue;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    const d = Math.sqrt(d2) || 1;
    const fall = 1 - d / radius;
    const push = fall * fall * 4;
    p.x += (dx / d) * push + Math.max(-6, Math.min(6, vx)) * fall * 0.22;
    p.y += (dy / d) * push + Math.max(-6, Math.min(6, vy)) * fall * 0.22;
  }
}

/** settle to rest without wind — the static (reduced-motion) pose */
export function settle(w: Web, gravity: number, frames: number) {
  const none = (_p: Particle, out: { x: number; y: number }) => {
    out.x = 0;
    out.y = 0;
  };
  for (let i = 0; i < frames; i++)
    stepWeb(w, { gravity, force: none, damping: 0.9, iterations: 2, home: 0.006 });
}

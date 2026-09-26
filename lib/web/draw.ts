/**
 * Shared silk vocabulary. Every web on the site is drawn with these so the
 * whole story reads as one material. Canvas 2D; SVG users can call the
 * `*Path` variants for a `d` string.
 *
 * Cold grammar (analytical): straight radials, even spiral, thin hairlines,
 * dew drops at intersections, everything on rails.
 * Warm grammar (creative, the hero's doodle vocabulary): the same strands but
 * wobbly, round-capped, thicker, each with its own clock.
 */

export type Pt = { x: number; y: number };

/** deterministic PRNG so server and client agree, and webs are reproducible */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export type OrbWeb = {
  center: Pt;
  /** outer anchor of each radial */
  radials: Pt[];
  /** spiral rings; ring[k][i] is the point on radial i */
  rings: Pt[][];
};

/**
 * An orb-weaver web: `spokes` radials with slight angular jitter, then
 * `rings` capture-spiral rings whose radius grows unevenly — real webs are
 * never perfectly regular, and a little irregularity is what sells "silk".
 */
export function orbWeb(
  center: Pt,
  radius: number,
  { spokes = 16, rings = 12, seed = 7, hub = 0.12 } = {},
): OrbWeb {
  const r = rng(seed);
  const angles = Array.from({ length: spokes }, (_, i) => (i / spokes) * Math.PI * 2 + (r() - 0.5) * 0.18);
  const reach = angles.map(() => radius * (0.82 + r() * 0.18));
  const radials = angles.map((a, i) => ({ x: center.x + Math.cos(a) * reach[i], y: center.y + Math.sin(a) * reach[i] }));
  const ringsOut: Pt[][] = [];
  for (let k = 0; k < rings; k++) {
    const f = hub + (1 - hub) * Math.pow((k + 1) / rings, 0.92);
    ringsOut.push(
      angles.map((a, i) => {
        const rr = reach[i] * f * (0.97 + r() * 0.06);
        return { x: center.x + Math.cos(a) * rr, y: center.y + Math.sin(a) * rr };
      }),
    );
  }
  return { center, radials, rings: ringsOut };
}

/**
 * A strand between two points with gravity sag. `sag` is px of droop at the
 * midpoint; `pluck` adds a transient sideways displacement (animate it with a
 * damped sine to make the strand vibrate).
 */
export function strand(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, sag = 0, pluck = 0) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // perpendicular for the pluck, straight down for the sag
  const cx = mx + (-dy / len) * pluck;
  const cy = my + (dx / len) * pluck + sag;
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(cx, cy, b.x, b.y);
}

export function strandPath(a: Pt, b: Pt, sag = 0, pluck = 0) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (-dy / len) * pluck;
  const cy = my + (dx / len) * pluck + sag;
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

/** a hand-drawn (warm) strand: the same line, with seeded wobble */
export function wobblyPath(a: Pt, b: Pt, seed = 1, amp = 3, segs = 6) {
  const r = rng(seed);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  let d = `M${a.x.toFixed(1)} ${a.y.toFixed(1)}`;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const w = i === segs ? 0 : (r() - 0.5) * 2 * amp;
    const x = a.x + dx * t + nx * w;
    const y = a.y + dy * t + ny * w;
    d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

/** a dew drop: a filled circle with a small highlight */
export function dew(ctx: CanvasRenderingContext2D, p: Pt, r: number, fill: string, glint: string) {
  ctx.beginPath();
  ctx.fillStyle = fill;
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = glint;
  ctx.arc(p.x - r * 0.35, p.y - r * 0.35, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

/** damped sine for a plucked strand: amplitude at time t (s) after the pluck */
export function pluckWave(t: number, amp: number, freq = 9, decay = 4.5) {
  return amp * Math.exp(-decay * t) * Math.sin(Math.PI * 2 * freq * t);
}

/** read the live theme tokens (they swap with the bulb) */
export function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return { ground: v("--ground"), fg: v("--fg"), muted: v("--fg-muted"), accent: v("--accent") };
}

import { HALO, MAX_DPR } from "@/lib/hero/constants";
import type { HeroEngine } from "@/lib/hero/engine";

/**
 * What the hero's environment layers share: the halo's geometry, the warm
 * doodle vocabulary, the perches the webs offer, and the plumbing every
 * Canvas2D layer needs (DPR, pointer, visibility, state).
 *
 * Nothing here owns a frame loop. Every layer rides the engine's single tick,
 * which already stops when the tab is hidden or the stage is offscreen; the
 * layers add their own check on top so they also rest when the WebGL canvas
 * never came up (and so never registered the engine's observer).
 */

/* ── the halo ─────────────────────────────────────────────────────────────── */
export type Halo = { cx: number; cy: number; rx: number; ry: number };

/** the ring round her head, in stage px — null until the renderer has a fit */
export function haloGeom(e: HeroEngine, width: number): Halo | null {
  const { fit } = e;
  if (fit.w <= 1) return null;
  const cx = fit.x + HALO.cx * fit.w;
  const cy = fit.y + HALO.cy * fit.h;
  // clamped, so the ring stays whole on narrow screens instead of having
  // elements sliced off at the viewport edge
  const room = Math.min(cx, width - cx) - 18;
  const rx = Math.min(HALO.rx * fit.w, Math.max(80, room));
  const ry = (rx / (HALO.rx * fit.w)) * HALO.ry * fit.w;
  return { cx, cy, rx, ry };
}

/** 1 at the top of the ring, 0 through the bottom arc */
export const haloFade = (sinA: number) => {
  const d = (sinA + 1) / 2;
  const t = (d - HALO.fadeFrom) / (HALO.fadeTo - HALO.fadeFrom);
  return 1 - Math.min(1, Math.max(0, t));
};

/**
 * Her head and hair, as an ellipse in stage px — measured off the art: hair
 * spans uv x 0.22–0.81 and runs from y 0.115 to about the chin at 0.5. Things
 * that wander (particles, butterflies' waypoints) keep out of it.
 */
export function faceZone(e: HeroEngine) {
  const { fit } = e;
  return { cx: fit.x + 0.515 * fit.w, cy: fit.y + 0.31 * fit.h, rx: 0.31 * fit.w, ry: 0.21 * fit.h };
}
export const inZone = (z: ReturnType<typeof faceZone>, x: number, y: number) =>
  ((x - z.cx) / z.rx) ** 2 + ((y - z.cy) / z.ry) ** 2 < 1;

/** 0 cold … 1 warm. Tracks the wipe rather than the attribute, like the halo. */
export const warmth = (e: HeroEngine) => (e.transitioning ? e.grammar : e.stateF);

/* ── warm vocabulary: the art's own doodles — thin line, round caps ────────── */
export const MARKS = [
  "M0 4 C0 0 5 0 5 3.5 C5 0 10 0 10 4 C10 8 5 11 5 11 C5 11 0 8 0 4 Z", // heart
  "M6 0 L7.6 4.2 L12 4.6 L8.6 7.5 L9.7 12 L6 9.4 L2.3 12 L3.4 7.5 L0 4.6 L4.4 4.2 Z", // star
  "M0 6 L14 0 L9 6 L14 12 Z", // paper plane
  "M8 8 C8 4 4 4 4 7 C4 10 9 11 11 7 C13 2 7 -1 3 2 C-1 5 0 12 5 14", // spiral
  "M0 6 Q3 0 6 6 T12 6", // squiggle
  "M1 0 L0 7 M6 0 L5.4 6 M10.5 1 L8.8 6.6", // motion lines
];
/**
 * Pulled straight off the sweater and the warm earring, so the marks belong to
 * the picture rather than being stuck on it. White stays in the set because the
 * art's own doodles are white — these have to read as the same hand.
 */
export const MARK_COLOURS = [
  "#FFFFFF",
  "#F0553F", // coral stripe
  "#39AEB0", // teal stripe
  "#8C4A1E", // burnt umber, for the ones that need to hold against saffron
  "#FFF3C4", // cream stripe
  "#C83B2E", // deep coral
];

let markCache: Path2D[] | null = null;
/** MARKS as Path2D, built lazily — Path2D does not exist on the server */
export const markPaths = () => (markCache ??= MARKS.map((d) => new Path2D(d)));

/* ── perches ──────────────────────────────────────────────────────────────── */
export type Perch = { x: number; y: number };
/**
 * Live points on the corner webs, in stage px. CornerWebs fills this with the
 * web's own particles, so a butterfly sitting on one sways with the thread —
 * and nudging one on landing plucks it.
 */
export const webPerches: Perch[] = [];

/* ── plumbing ─────────────────────────────────────────────────────────────── */
/** sizes the backing store, DPR capped as the portrait's own canvas is */
export function sizeCanvas(c: HTMLCanvasElement, w: number, h: number) {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const dpr = Math.min(window.devicePixelRatio || 1, coarse ? MAX_DPR.mobile : MAX_DPR.desktop);
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  return dpr;
}

export type Pointer = { x: number; y: number; vx: number; vy: number; on: boolean; last: number };

/**
 * Reads the pointer off the stage without ever touching the event — passive
 * listeners, no capture, no preventDefault — so the press-to-peek on the same
 * element is exactly as it was. The layers themselves are pointer-events: none.
 */
export function trackPointer(host: HTMLElement, p: Pointer) {
  const move = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (p.on) {
      p.vx += (x - p.x - p.vx) * 0.5;
      p.vy += (y - p.y - p.vy) * 0.5;
    }
    p.x = x;
    p.y = y;
    p.on = true;
    p.last = performance.now();
  };
  const leave = () => {
    p.on = false;
    p.vx = 0;
    p.vy = 0;
  };
  const up = (e: PointerEvent) => {
    // a finger lifting is the pointer leaving
    if (e.pointerType === "touch") leave();
  };
  host.addEventListener("pointermove", move, { passive: true });
  host.addEventListener("pointerdown", move, { passive: true });
  host.addEventListener("pointerleave", leave, { passive: true });
  host.addEventListener("pointerup", up, { passive: true });
  host.addEventListener("pointercancel", leave, { passive: true });
  return () => {
    host.removeEventListener("pointermove", move);
    host.removeEventListener("pointerdown", move);
    host.removeEventListener("pointerleave", leave);
    host.removeEventListener("pointerup", up);
    host.removeEventListener("pointercancel", leave);
  };
}

/** true while the element is on screen and the tab is showing */
export function watchOnScreen(el: Element, cb: (on: boolean) => void) {
  let inView = true;
  const update = () => cb(inView && !document.hidden);
  const io = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    update();
  });
  io.observe(el);
  document.addEventListener("visibilitychange", update);
  return () => {
    io.disconnect();
    document.removeEventListener("visibilitychange", update);
  };
}

/** html[data-hero-state] flips — the static (reduced-motion) render redraws on it */
export function watchHeroState(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-hero-state"] });
  return () => mo.disconnect();
}

export const isWarmAttr = () => document.documentElement.dataset.heroState === "warm";

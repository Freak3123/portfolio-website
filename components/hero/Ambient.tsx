"use client";

import { useEffect, useRef } from "react";
import { HALO } from "@/lib/hero/constants";
import type { HeroEngine } from "@/lib/hero/engine";

/**
 * A halo, not a background.
 *
 * Everything here rides one ellipse centred on her skull — measured, not
 * eyeballed: the hair top sits at uv y 0.115 and the hair spans uv x 0.22–0.81
 * at face height, so a ring at (0.517, 0.20) with radius 0.5 of the portrait's
 * width arcs above the crown and clears the hair on both sides.
 *
 * Elements orbit the whole way round and **dissolve through the bottom arc**
 * instead of stopping there. That keeps them off her hair, and it reads as
 * circling rather than as decoration pinned around her.
 *
 * Both states move the same way — independent orbits, each element with its own
 * radius, period, phase and drift. The contrast is carried by *what* is circling
 * and by how it connects:
 *
 *   cold  single mathematical symbols, thin geometric outlines and nodes, with
 *         hairlines that appear between whichever pair happens to be near enough
 *         right now. The web forms and comes apart as they drift past each
 *         other, so the structure is emergent rather than drawn.
 *   warm  hand-drawn marks in the vocabulary the art itself established, each
 *         spinning and bobbing on its own clock, connected to nothing.
 *
 * Whole expressions were tried here and cut: at this size rotating text stops
 * being legible and turns into pattern. Single glyphs read as marks rather than
 * as words, which is why the notation is one symbol at a time.
 */

type Orbiter = {
  /** a glyph to typeset, or a path to stroke. Neither means a plain node. */
  glyph?: string;
  d?: string;
  /** warm only — the marks take their colours from the sweater in the art */
  stroke?: string;
  /** radius multiplier against the base ellipse */
  r: number;
  /** angular speed, rad/s — negative runs the other way */
  speed: number;
  phase: number;
  s: number;
  /** vertical bob amplitude, px */
  bob: number;
};

/* ── cold ────────────────────────────────────────────────────────────────── */
const SYMBOLS = ["∑", "∂", "λ", "π", "∇", "∫", "≈", "⊕", "θ", "Δ"];
const SHAPES = [
  "M8 0 L16 14 L0 14 Z", // triangle
  "M1 1 H15 V15 H1 Z", // square
  "M8 0 L15 4 L15 12 L8 16 L1 12 L1 4 Z", // hexagon
  "M8 0 L16 8 L8 16 L0 8 Z", // diamond
  "M1 8 A7 7 0 1 1 15 8 A7 7 0 1 1 1 8 Z", // circle
  "M0 0 H16 M8 0 V16", // cross-tick
];

/** deterministic, so the same halo assembles on every visit */
let seed = 20260926;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

const COLD: Orbiter[] = [
  ...SYMBOLS.map((glyph, i) => ({
    glyph,
    r: 0.84 + rnd() * 0.36,
    speed: (0.07 + rnd() * 0.12) * (i % 3 === 0 ? -1 : 1),
    phase: rnd() * Math.PI * 2,
    s: 1.45 + rnd() * 0.75,
    bob: 3 + rnd() * 5,
  })),
  ...SHAPES.map((d, i) => ({
    d,
    r: 0.8 + rnd() * 0.4,
    speed: (0.06 + rnd() * 0.13) * (i % 2 === 0 ? 1 : -1),
    phase: rnd() * Math.PI * 2,
    s: 0.95 + rnd() * 0.75,
    bob: 2 + rnd() * 5,
  })),
  ...Array.from({ length: 14 }, (_, i) => ({
    r: 0.78 + rnd() * 0.44,
    speed: (0.05 + rnd() * 0.16) * (i % 2 ? -1 : 1),
    phase: rnd() * Math.PI * 2,
    s: 1,
    bob: 2 + rnd() * 6,
  })),
];
/** which cold orbiters are plain nodes — only these get connected */
const DOTS = COLD.map((o) => !o.glyph && !o.d);
/** how many hairlines can be live at once, and how near a pair has to be */
const LINK_POOL = 14;
const LINK_DIST = 0.42;

/* ── warm: the vocabulary the art already set — thin white line, round caps ─ */
const MARKS = [
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
const MARK_COLOURS = [
  "#FFFFFF",
  "#F0553F", // coral stripe
  "#39AEB0", // teal stripe
  "#8C4A1E", // burnt umber, for the ones that need to hold against saffron
  "#FFF3C4", // cream stripe
  "#C83B2E", // deep coral
];
const WARM: Orbiter[] = Array.from({ length: 14 }, (_, i) => ({
  d: MARKS[i % MARKS.length],
  stroke: MARK_COLOURS[i % MARK_COLOURS.length],
  r: 0.82 + rnd() * 0.4,
  speed: (0.1 + rnd() * 0.2) * (i % 4 === 0 ? -1 : 1),
  phase: rnd() * Math.PI * 2,
  s: 1.4 + rnd() * 1.1,
  bob: 4 + rnd() * 6,
}));

/** 1 at the top of the ring, 0 through the bottom arc */
const fade = (sinA: number) => {
  const d = (sinA + 1) / 2;
  const t = (d - HALO.fadeFrom) / (HALO.fadeTo - HALO.fadeFrom);
  return 1 - Math.min(1, Math.max(0, t));
};

export default function Ambient({ engine }: { engine: HeroEngine }) {
  const coldG = useRef<SVGGElement>(null);
  const warmG = useRef<SVGGElement>(null);

  useEffect(() => {
    const coldEls = Array.from(coldG.current?.querySelectorAll(".orb") ?? []);
    const links = Array.from(coldG.current?.querySelectorAll("line") ?? []);
    const warmEls = Array.from(warmG.current?.querySelectorAll(".orb") ?? []);

    const place = (
      els: Element[],
      defs: Orbiter[],
      t: number,
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      spinAmp: number,
    ) =>
      defs.map((o, i) => {
        const a = t * o.speed + o.phase;
        const x = cx + Math.cos(a) * rx * o.r;
        const y =
          cy + Math.sin(a) * ry * o.r + Math.sin(t * (0.4 + i * 0.06) + o.phase) * o.bob;
        const op = fade(Math.sin(a));
        const spin = Math.sin(t * (0.2 + i * 0.04) + o.phase) * spinAmp;
        const el = els[i];
        if (el) {
          el.setAttribute(
            "transform",
            `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${spin.toFixed(1)}) scale(${o.s})`,
          );
          el.setAttribute("opacity", op.toFixed(3));
        }
        return { x, y, op };
      });

    const off = engine.onTick((_dt, t) => {
      const showWarm = engine.transitioning ? engine.grammar : engine.stateF;
      coldG.current?.setAttribute("opacity", String(1 - showWarm));
      warmG.current?.setAttribute("opacity", String(showWarm));

      const { fit } = engine;
      if (fit.w <= 1) return;
      const cx = fit.x + HALO.cx * fit.w;
      const cy = fit.y + HALO.cy * fit.h;
      // clamped, so the ring stays whole on narrow screens instead of having
      // elements sliced off at the viewport edge
      const room = Math.min(cx, window.innerWidth - cx) - 18;
      const rx = Math.min(HALO.rx * fit.w, Math.max(80, room));
      const ry = (rx / (HALO.rx * fit.w)) * HALO.ry * fit.w;

      if (showWarm < 0.99) {
        // spin stays small for cold: these are instruments, not confetti
        const p = place(coldEls, COLD, t, cx, cy, rx, ry, 7);

        /* Hairlines between whichever pair of *nodes* is near enough right now.
           The web assembles and comes apart as they drift, so the structure is
           emergent rather than authored — which is the point of it being a web.
           Symbols and shapes are deliberately left out: threading lines through
           a ∑ makes it read as a diagram of something, which it is not. */
        const reach = LINK_DIST * rx;
        let n = 0;
        for (let i = 0; i < p.length && n < LINK_POOL; i++) {
          if (!DOTS[i]) continue;
          for (let j = i + 1; j < p.length && n < LINK_POOL; j++) {
            if (!DOTS[j]) continue;
            const d = Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y);
            if (d > reach) continue;
            const l = links[n++];
            l.setAttribute("x1", p[i].x.toFixed(1));
            l.setAttribute("y1", p[i].y.toFixed(1));
            l.setAttribute("x2", p[j].x.toFixed(1));
            l.setAttribute("y2", p[j].y.toFixed(1));
            // fade with distance as well as height, so links thin out instead of
            // blinking off the instant a pair drifts apart
            const near = 1 - d / reach;
            l.setAttribute(
              "opacity",
              (Math.min(p[i].op, p[j].op) * near * 0.6).toFixed(3),
            );
          }
        }
        for (let k = n; k < links.length; k++) links[k].setAttribute("opacity", "0");
      }

      if (showWarm > 0.01) place(warmEls, WARM, t, cx, cy, rx, ry, 24);
    });

    return off;
  }, [engine]);

  return (
    <svg className="hero-ambient" aria-hidden="true">
      <g ref={coldG} className="amb-cold">
        {Array.from({ length: LINK_POOL }, (_, i) => (
          <line key={`l${i}`} opacity="0" />
        ))}
        {COLD.map((o, i) => (
          <g key={`c${i}`} className="orb">
            {o.glyph ? (
              <text className="amb-sym" textAnchor="middle" dy="0.34em">
                {o.glyph}
              </text>
            ) : o.d ? (
              <path className="amb-shape" d={o.d} transform="translate(-8 -8)" />
            ) : (
              <circle className="amb-dot" r="2.2" />
            )}
          </g>
        ))}
      </g>

      <g ref={warmG} className="amb-warm" opacity="0">
        {WARM.map((o, i) => (
          <g key={`w${i}`} className="orb">
            <path d={o.d} stroke={o.stroke} transform="translate(-7 -6)" />
          </g>
        ))}
      </g>
    </svg>
  );
}

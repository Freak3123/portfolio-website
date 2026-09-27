"use client";

import { useEffect, useRef } from "react";
import type { HeroEngine } from "@/lib/hero/engine";
import { MARKS, MARK_COLOURS, haloFade, haloGeom } from "./heroEnv";

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
 *   cold  single mathematical symbols and thin geometric outlines. The nodes
 *         and hairlines that used to ride this ring now live in HeroLife as a
 *         force-directed graph homed on the same ellipse, so they can spring,
 *         answer the cursor and carry pulses — one network, not two.
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
];
/* the 14 plain nodes that used to follow drew four numbers each; burn them so
   the warm ring below still assembles exactly as it did */
for (let i = 0; i < 14 * 4; i++) rnd();

/* ── warm: the vocabulary the art already set (./heroEnv) ─────────────── */
const WARM: Orbiter[] = Array.from({ length: 14 }, (_, i) => ({
  d: MARKS[i % MARKS.length],
  stroke: MARK_COLOURS[i % MARK_COLOURS.length],
  r: 0.82 + rnd() * 0.4,
  speed: (0.1 + rnd() * 0.2) * (i % 4 === 0 ? -1 : 1),
  phase: rnd() * Math.PI * 2,
  s: 1.4 + rnd() * 1.1,
  bob: 4 + rnd() * 6,
}));

export default function Ambient({ engine }: { engine: HeroEngine }) {
  const coldG = useRef<SVGGElement>(null);
  const warmG = useRef<SVGGElement>(null);

  useEffect(() => {
    const coldEls = Array.from(coldG.current?.querySelectorAll(".orb") ?? []);
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
        const op = haloFade(Math.sin(a));
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

      const halo = haloGeom(engine, window.innerWidth);
      if (!halo) return;
      const { cx, cy, rx, ry } = halo;

      if (showWarm < 0.99) {
        // spin stays small for cold: these are instruments, not confetti
        place(coldEls, COLD, t, cx, cy, rx, ry, 7);
      }

      if (showWarm > 0.01) place(warmEls, WARM, t, cx, cy, rx, ry, 24);
    });

    return off;
  }, [engine]);

  return (
    <svg className="hero-ambient" aria-hidden="true">
      <g ref={coldG} className="amb-cold">
        {COLD.map((o, i) => (
          <g key={`c${i}`} className="orb">
            {o.glyph ? (
              <text className="amb-sym" textAnchor="middle" dy="0.34em">
                {o.glyph}
              </text>
            ) : (
              <path className="amb-shape" d={o.d} transform="translate(-8 -8)" />
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

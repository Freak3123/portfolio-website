"use client";

/**
 * Floating doodles for the creative chapter.
 *
 * Elements + reference sources:
 * - Hand-drawn white marks (heart, star, plane, spiral, squiggle, motion
 *   lines), each bobbing and spinning on its own clock .........................
 *   the hero's warm orbiters (components/hero/Ambient.tsx), i.e. the portrait
 *   art's own doodles.
 * - Cursor velocity scatters them, spring return home .........................
 *   L6 animation-reference/physics/19: cursor-velocity push force with
 *   (1 - d/r)^3 falloff and spring return.
 *
 * Server-rendered at their home positions (nested <svg x="%" y="%">), so the
 * static document shows them at rest. Motion only runs while the chapter is
 * present in live mode.
 */

import { useEffect, useRef } from "react";
import { journey } from "@/lib/journey/journey";
import { sound } from "@/lib/audio/sound";
import { rng } from "@/lib/web/draw";
import { MARKS, MARK_UMBER, MARK_WHITE } from "./marks";

type Def = {
  d: string;
  stroke: string;
  fx: number;
  fy: number;
  s: number;
  bob: number;
  period: number;
  spin: number;
  phase: number;
};

const r = rng(20260927);
const DEFS: Def[] = Array.from({ length: 18 }, (_, i) => {
  // keep a quiet middle band for the headline / play area
  let fx = 0.04 + r() * 0.92;
  const fy = 0.06 + r() * 0.88;
  if (fx > 0.3 && fx < 0.7 && fy > 0.3 && fy < 0.7) fx = fx < 0.5 ? fx - 0.24 : fx + 0.24;
  return {
    d: MARKS[i % MARKS.length],
    stroke: i % 5 === 4 ? MARK_UMBER : MARK_WHITE,
    fx,
    fy,
    s: 1.8 + r() * 1.6,
    bob: 5 + r() * 9,
    period: 2.6 + r() * 3.4,
    spin: 8 + r() * 22,
    phase: r() * Math.PI * 2,
  };
});

const RADIUS = 170;
const PUSH = 0.9;
const SPRING = 0.055;
const DAMP = 0.86;

export default function Doodles() {
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const root = svg.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<SVGGElement>(".cr-doodle-g"));
    const st = DEFS.map(() => ({ x: 0, y: 0, vx: 0, vy: 0 }));
    let W = root.clientWidth;
    let H = root.clientHeight;
    const ro = new ResizeObserver(() => {
      W = root.clientWidth;
      H = root.clientHeight;
    });
    ro.observe(root);

    // pointer, in the svg's own px space, with per-frame velocity
    const ptr = { x: -1e4, y: -1e4, vx: 0, vy: 0, fresh: false };
    const onMove = (e: PointerEvent) => {
      const b = root.getBoundingClientRect();
      const x = e.clientX - b.left;
      const y = e.clientY - b.top;
      if (ptr.x > -1e3) {
        ptr.vx = x - ptr.x;
        ptr.vy = y - ptr.y;
      }
      ptr.x = x;
      ptr.y = y;
      ptr.fresh = true;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    let t = 0;
    let lastPluck = 0;
    const off = journey.subscribe((j, dt) => {
      if (!j.live) return;
      const f = j.frame("creative");
      if (f.presence <= 0) return;
      t += dt;
      const k = Math.min(3, dt * 60);

      for (let i = 0; i < DEFS.length; i++) {
        const o = DEFS[i];
        const s = st[i];
        if (ptr.fresh) {
          const dx = o.fx * W + s.x - ptr.x;
          const dy = o.fy * H + s.y - ptr.y;
          const d = Math.hypot(dx, dy);
          if (d < RADIUS) {
            const fall = Math.pow(1 - d / RADIUS, 3);
            s.vx += ptr.vx * fall * PUSH;
            s.vy += ptr.vy * fall * PUSH;
            const speed = Math.hypot(ptr.vx, ptr.vy);
            if (speed > 18 && t - lastPluck > 0.14) {
              lastPluck = t;
              sound.pluck({ pitch: 0.4 + (1 - o.fy) * 0.5, gain: Math.min(0.5, speed / 120) });
            }
          }
        }
        s.vx += -s.x * SPRING * k;
        s.vy += -s.y * SPRING * k;
        const damp = Math.pow(DAMP, k);
        s.vx *= damp;
        s.vy *= damp;
        s.x += s.vx * k;
        s.y += s.vy * k;

        const w = (t / o.period) * Math.PI * 2 + o.phase;
        const bob = Math.sin(w) * o.bob;
        const rot = Math.sin(w * 0.7) * o.spin + s.vx * 0.8;
        els[i]?.setAttribute(
          "transform",
          `translate(${s.x.toFixed(1)} ${(s.y + bob).toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${o.s})`,
        );
      }
      ptr.fresh = false;
      ptr.vx *= 0.5;
      ptr.vy *= 0.5;
    });

    return () => {
      off();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <svg ref={svg} className="cr-doodles" aria-hidden="true">
      {DEFS.map((o, i) => (
        <svg key={i} x={`${(o.fx * 100).toFixed(2)}%`} y={`${(o.fy * 100).toFixed(2)}%`} overflow="visible">
          <g className="cr-doodle-g" transform={`scale(${o.s.toFixed(2)})`}>
            <path d={o.d} stroke={o.stroke} transform="translate(-7 -6)" />
          </g>
        </svg>
      ))}
    </svg>
  );
}

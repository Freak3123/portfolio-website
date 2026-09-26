"use client";

import { useEffect, useRef } from "react";
import type { HeroEngine } from "@/lib/hero/engine";
import { AR, TEAR } from "@/lib/hero/constants";

/** anchor points in portrait uv, scattered round the figure */
const ANCHORS: [number, number][] = [
  [0.06, 0.12], [0.5, 0.03], [0.95, 0.1],
  [0.02, 0.45], [0.98, 0.42],
  [0.08, 0.8], [0.5, 0.97], [0.94, 0.78],
];

/**
 * Hairlines from fixed points in the field to the rim of the tear. As the hole
 * moves they stretch and slacken, so the hole reads as *pulled open* rather
 * than painted in — which is the thing that makes this not a cursor-reveal
 * borrowed from somewhere else.
 *
 * R14's idea is that every filament completes in the same beat regardless of
 * its real length. R14 gets that from `pathLength="1"`, but Chromium does not
 * honour pathLength on `<line>` — the dash pattern collapses to 1px and the
 * line renders dotted instead of drawing in. So the normalisation is done by
 * hand: one shared `draw` parameter, per-line dash values computed from the
 * line's own length. Same gesture, actually works.
 */
export default function Filaments({ engine }: { engine: HeroEngine }) {
  const g = useRef<SVGGElement>(null);

  useEffect(() => {
    const lines = Array.from(g.current?.children ?? []) as SVGLineElement[];
    let draw = 0;

    const off = engine.onTick((dt) => {
      const { fit, radius } = engine;
      const open = radius > 0 ? 1 : 0;
      // reduced motion renders at final state; the connection is still visible,
      // it just doesn't travel
      draw += (open - draw) * (engine.reduced ? 1 : 1 - Math.pow(1 - 0.12, dt * 60));

      if (draw < 0.01) {
        g.current?.setAttribute("opacity", "0");
        return;
      }
      g.current?.setAttribute("opacity", "1");

      const cx = engine.mouse.x;
      const cy = engine.mouse.y;

      lines.forEach((ln, i) => {
        const [ax, ay] = ANCHORS[i];
        // rim point facing this anchor, in uv-x units so the circle stays round
        let dx = ax - cx;
        let dy = (ay - cy) * AR;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        const rx = cx + dx * radius;
        const ry = cy + (dy * radius) / AR;

        const X1 = fit.x + ax * fit.w;
        const Y1 = fit.y + ay * fit.h;
        const X2 = fit.x + rx * fit.w;
        const Y2 = fit.y + ry * fit.h;
        ln.setAttribute("x1", String(X1));
        ln.setAttribute("y1", String(Y1));
        ln.setAttribute("x2", String(X2));
        ln.setAttribute("y2", String(Y2));
        const px = Math.hypot(X2 - X1, Y2 - Y1);
        ln.setAttribute("stroke-dasharray", String(px));
        ln.setAttribute("stroke-dashoffset", (px * (1 - draw)).toFixed(2));
        // slack lines read fainter; taut ones read brighter
        const tension = Math.min(1, TEAR.radius / Math.max(0.18, len));
        ln.setAttribute("opacity", (draw * (0.22 + tension * 0.5)).toFixed(3));
      });
    });
    return off;
  }, [engine]);

  return (
    <svg className="hero-filaments" aria-hidden="true">
      <g ref={g} opacity="0">
        {ANCHORS.map((_, i) => (
          <line key={i} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}

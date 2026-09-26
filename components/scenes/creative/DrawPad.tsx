"use client";

/**
 * "Draw something." — a small pad the visitor can draw on.
 *
 * Elements + reference sources:
 * - Draw-on-canvas playful interaction ......................................
 *   Awwwards SOTD pattern (draw-on-canvas toy); literally what Brawer is.
 * - Strokes rendered as wobbly white silk lines, round caps, doubled pass ....
 *   the hero's warm doodle line (thin white, round caps) + lib/web/draw.ts
 *   warm grammar ("the same strands but wobbly").
 * - Soft pluck on each new stroke ............................................
 *   lib/audio/sound.ts silk pluck (the site's own sound vocabulary).
 *
 * Pointer-only toy; the canvas is labelled as an image and the Clear button is
 * a real button. Touch drawing does not leak into the journey's swipe
 * navigation (touch-action none + propagation stopped).
 */

import { useEffect, useRef, type SyntheticEvent } from "react";
import { rng, type Pt } from "@/lib/web/draw";
import { sound } from "@/lib/audio/sound";

type Stroke = { pts: Pt[]; seed: number };

export default function DrawPad() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const redraw = useRef<() => void>(() => {});

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let dpr = 1;

    const paint = () => {
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const s of strokes.current) {
        const pts = s.pts;
        if (!pts.length) continue;
        // two passes, the second slightly offset and thinner: a hand-drawn
        // double line, the way the art's doodles are inked
        for (let pass = 0; pass < 2; pass++) {
          const r = rng(s.seed + pass * 97);
          const off = pass ? 1.4 : 0;
          ctx.beginPath();
          ctx.strokeStyle = pass ? "rgba(255,255,255,0.55)" : "#FFFFFF";
          ctx.lineWidth = pass ? 1.2 : 3;
          const j = (p: Pt) => ({ x: p.x + off + (r() - 0.5) * 1.6, y: p.y + off + (r() - 0.5) * 1.6 });
          const p0 = j(pts[0]);
          ctx.moveTo(p0.x, p0.y);
          if (pts.length === 1) ctx.lineTo(p0.x + 0.1, p0.y + 0.1);
          let prev = p0;
          for (let i = 1; i < pts.length; i++) {
            const p = j(pts[i]);
            ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + p.x) / 2, (prev.y + p.y) / 2);
            prev = p;
          }
          ctx.lineTo(prev.x, prev.y);
          ctx.stroke();
        }
      }
    };
    redraw.current = paint;

    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(cv.clientWidth * dpr);
      cv.height = Math.round(cv.clientHeight * dpr);
      paint();
    };
    const ro = new ResizeObserver(size);
    ro.observe(cv);
    size();

    let active: Stroke | null = null;
    const at = (e: PointerEvent): Pt => {
      const b = cv.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    const down = (e: PointerEvent) => {
      e.preventDefault();
      cv.setPointerCapture(e.pointerId);
      const p = at(e);
      active = { pts: [p], seed: (Math.random() * 1e9) | 0 };
      strokes.current.push(active);
      sound.pluck({ pitch: 1 - p.y / Math.max(1, cv.clientHeight), gain: 0.35 });
      paint();
    };
    const move = (e: PointerEvent) => {
      if (!active) return;
      const p = at(e);
      const last = active.pts[active.pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 2.5) return;
      active.pts.push(p);
      paint();
    };
    const up = () => {
      active = null;
    };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);

    return () => {
      ro.disconnect();
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", up);
    };
  }, []);

  const clear = () => {
    strokes.current = [];
    redraw.current();
    sound.tick();
  };

  const stop = (e: SyntheticEvent) => e.stopPropagation();

  return (
    <div className="cr-pad" data-journey-free onTouchStart={stop} onTouchMove={stop}>
      <canvas
        ref={canvas}
        className="cr-pad-canvas"
        role="img"
        aria-label="Drawing pad. Draw with a mouse, pen or finger."
        data-cursor="draw"
      />
      <button type="button" className="cr-pad-clear" onClick={clear}>
        Clear
      </button>
    </div>
  );
}

"use client";

/**
 * Warm air: paint specks, four-point sparkles and tiny squiggles drifting up
 * through the creative chapter, like dust in a sunlit studio. Deliberately
 * faint — texture, not content.
 *
 * Reference: ambient particle layers used across Awwwards SOTD sites (slow,
 * low-alpha, sine-swayed drift with wrap-around), inked in this chapter's
 * palette and mark vocabulary (creative/marks.ts: white line, umber, ink).
 *
 * Decorative (aria-hidden, pointer-events none). Runs on the journey clock
 * only while the chapter is present; static mode draws one still frame.
 */

import { useEffect, useRef } from "react";
import { journey } from "@/lib/journey/journey";
import { rng } from "@/lib/web/draw";

type Speck = {
  kind: 0 | 1 | 2; // dot, sparkle, squiggle
  fx: number;
  y: number;
  size: number;
  rise: number;
  sway: number;
  freq: number;
  phase: number;
  rot: number;
  spin: number;
  colour: string;
  alpha: number;
};

const COLOURS = ["255,255,255", "255,255,255", "90,58,10", "10,16,26"];

export default function Specks() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let dpr = 1;
    let W = 1;
    let H = 1;
    const r = rng(4242);
    const count = window.innerWidth < 700 ? 16 : 28;
    const specks: Speck[] = Array.from({ length: count }, (_, i) => {
      const kind = (i % 5 === 0 ? 1 : i % 4 === 1 ? 2 : 0) as Speck["kind"];
      return {
        kind,
        fx: r(),
        y: r(),
        size: kind === 0 ? 1 + r() * 1.6 : kind === 1 ? 3 + r() * 3 : 5 + r() * 4,
        rise: 0.08 + r() * 0.22,
        sway: 6 + r() * 18,
        freq: 0.2 + r() * 0.5,
        phase: r() * Math.PI * 2,
        rot: r() * Math.PI * 2,
        spin: (r() - 0.5) * 0.6,
        colour: kind === 0 ? COLOURS[Math.floor(r() * COLOURS.length)] : "255,255,255",
        alpha: kind === 0 ? 0.25 + r() * 0.3 : 0.4 + r() * 0.3,
      };
    });
    let fresh = true;

    const draw = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = "round";
      for (const s of specks) {
        const x = s.fx * W + Math.sin(t * s.freq + s.phase) * s.sway;
        const y = s.y;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(s.rot);
        if (s.kind === 0) {
          ctx.fillStyle = `rgba(${s.colour},${s.alpha})`;
          ctx.beginPath();
          ctx.arc(0, 0, s.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (s.kind === 1) {
          const tw = s.alpha * (0.55 + 0.45 * Math.sin(t * 2.2 + s.phase));
          const a = s.size;
          const b = s.size * 0.28;
          ctx.fillStyle = `rgba(${s.colour},${tw.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(0, -a);
          ctx.quadraticCurveTo(b, -b, a, 0);
          ctx.quadraticCurveTo(b, b, 0, a);
          ctx.quadraticCurveTo(-b, b, -a, 0);
          ctx.quadraticCurveTo(-b, -b, 0, -a);
          ctx.fill();
        } else {
          const l = s.size;
          ctx.strokeStyle = `rgba(${s.colour},${s.alpha})`;
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(-l, 0);
          ctx.quadraticCurveTo(-l / 2, -l * 0.5, 0, 0);
          ctx.quadraticCurveTo(l / 2, l * 0.5, l, 0);
          ctx.stroke();
        }
        ctx.restore();
      }
    };

    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth || 1;
      H = cv.clientHeight || 1;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      if (fresh && H > 1) {
        for (const s of specks) s.y *= H;
        fresh = false;
      }
      if (!journey.live) draw(0);
    };
    const ro = new ResizeObserver(size);
    ro.observe(cv);
    size();

    let t = 0;
    let shown = false;
    const off = journey.subscribe((j, dt) => {
      if (!j.live) return;
      if (j.frame("creative").presence <= 0) {
        if (shown) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, W, H);
          shown = false;
        }
        return;
      }
      shown = true;
      t += dt;
      const k = Math.min(3, dt * 60);
      for (const s of specks) {
        s.y -= s.rise * k;
        s.rot += s.spin * dt;
        if (s.y < -20) {
          s.y = H + 20;
          s.fx = Math.random();
        }
      }
      draw(t);
    });

    return () => {
      off();
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="cr-air cr-air--specks" aria-hidden="true" />;
}

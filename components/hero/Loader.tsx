"use client";

import { useEffect, useRef } from "react";

const N = 110;
const DURATION = 1400;

/**
 * The opening doesn't end, it *demotes*: the web you watch build is the same
 * web that stays behind her for the rest of the visit. That is the difference
 * between a loading screen and an establishing shot.
 *
 * It never blocks content — the hero's text and links are in the DOM from byte
 * one, and if this throws, the page underneath is already correct.
 */
export default function Loader({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen = false;
    try {
      seen = sessionStorage.getItem("hero-seen") === "1";
    } catch {
      /* private windows throw; treat as unseen */
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        sessionStorage.setItem("hero-seen", "1");
      } catch {
        /* ignore */
      }
      // Clear, don't merely fade. An opacity transition can be interrupted by a
      // re-mount (StrictMode does exactly that in dev) and leave the last frame
      // of the web painted over the hero for the rest of the visit.
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      canvas.style.opacity = "0";
      onDone();
    };

    // Returning visitors have already watched this. Respecting people's time is
    // the whole reason the rest of the hero is built the way it is.
    if (seen || reduced) {
      const t = setTimeout(finish, seen ? 180 : 0);
      return () => clearTimeout(t);
    }

    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0,
      H = 0;

    const size = () => {
      const r = canvas.getBoundingClientRect();
      W = r.width;
      H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();

    // seeded, so the same web builds every time — this is the analytical state's
    // opening and it should not look random
    let s = 20260926;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

    const wide = W >= 900;
    const fx = wide ? 0.72 : 0.5;
    const pts = Array.from({ length: N }, (_, i) => {
      const toward = i / N < 0.55;
      const x = toward ? fx + (rnd() - 0.5) * 0.34 : rnd();
      const y = toward ? 0.18 + rnd() * 0.72 : rnd();
      return {
        x0: rnd() * W,
        y0: rnd() * H,
        x1: x * W,
        y1: y * H,
        x: 0,
        y: 0,
        d: rnd() * 0.28,
        a: 0,
      };
    });

    const links: [number, number][] = [];
    pts.forEach((p, i) => {
      const near = pts
        .map((q, j) => ({ j, d: Math.hypot(q.x1 - p.x1, q.y1 - p.y1) }))
        .filter((o) => o.j !== i)
        .sort((a, b) => a.d - b.d)
        .slice(0, 3);
      near.forEach((o) => {
        if (o.j > i) links.push([i, o.j]);
      });
    });

    const t0 = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / DURATION);
      ctx.clearRect(0, 0, W, H);

      pts.forEach((p) => {
        const appear = clamp((t - p.d * 0.9) / 0.25);
        // 700–1200ms: the web tightens toward where she will be
        const settle = ease(clamp((t - 0.5) / 0.36));
        p.x = p.x0 + (p.x1 - p.x0) * settle;
        p.y = p.y0 + (p.y1 - p.y0) * settle;
        p.a = appear;
      });

      // 350–800ms: edges draw in. All of them complete together (R14's idea,
      // done here by driving one normalised parameter rather than per-length).
      const drawn = ease(clamp((t - 0.25) / 0.33));
      const fade = 1 - ease(clamp((t - 0.64) / 0.36));

      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(253,191,40,${(0.3 * fade).toFixed(3)})`;
      ctx.beginPath();
      links.forEach(([a, b]) => {
        const p = pts[a],
          q = pts[b];
        const k = Math.min(p.a, q.a) * drawn;
        if (k <= 0.01) return;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + (q.x - p.x) * k, p.y + (q.y - p.y) * k);
      });
      ctx.stroke();

      ctx.fillStyle = `rgba(243,239,231,${(0.7 * fade).toFixed(3)})`;
      pts.forEach((p) => {
        if (p.a <= 0.01) return;
        ctx.globalAlpha = p.a * fade;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      if (t < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        finish();
      }
    };
    raf = requestAnimationFrame(frame);

    const ro = new ResizeObserver(size);
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      ctx.clearRect(0, 0, W, H);
    };
  }, [onDone]);

  return <canvas ref={ref} className="hero-loader" aria-hidden="true" />;
}

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

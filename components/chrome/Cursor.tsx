"use client";

/**
 * Custom cursor with a silk trail.
 *
 * Elements, and where each one comes from (no element here is original):
 * - Small dot that tracks the pointer ....................... meermohsin.me custom cursor
 * - Short fading trail of recent pointer positions, each
 *   point spring-lagged behind the one before it ............ Awwwards SOTD cursor trail
 *   (spring follow per L5 animation-reference/physics/1, "stretchy sticky cursor")
 * - Ring grows over links/buttons, shows `data-cursor` text .. Awwwards SOTD hover cursor
 *   + L5 physics/1 (cursor grows onto the hovered element)
 * The trail is drawn as silk (the user's web theme): a thin straight thread in
 * the cold state, the hero's wobbly hand-drawn doodle line in the warm state.
 *
 * Rules:
 * - Only for (hover: hover) and (pointer: fine), never under reduced motion.
 * - pointer-events: none, top z-index — it can never intercept a click.
 * - Hidden over the hero stage: its own grab/grabbing cursor is the
 *   affordance for the press-and-drag peek, so the native cursor shows there.
 * - The canvas only redraws while the trail is moving.
 */

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion/gsap";

const INTERACTIVE = "a, button, [data-cursor]";
const N = 18;

export default function Cursor() {
  const [enabled, setEnabled] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  // decide on the client only; the server renders nothing
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const decide = () => setEnabled(mq.matches && !rm.matches);
    const id = requestAnimationFrame(decide);
    mq.addEventListener("change", decide);
    rm.addEventListener("change", decide);
    return () => {
      cancelAnimationFrame(id);
      mq.removeEventListener("change", decide);
      rm.removeEventListener("change", decide);
    };
  }, []);

  useEffect(() => {
    if (!enabled || prefersReducedMotion()) return;
    const el = root.current;
    const cv = canvas.current;
    const d = dot.current;
    const r = ring.current;
    const ctx = cv?.getContext("2d");
    if (!el || !cv || !d || !r || !ctx) return;

    const html = document.documentElement;
    html.classList.add("has-cursor");

    /* ── sizing ── */
    let dpr = 1;
    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(window.innerWidth * dpr);
      cv.height = Math.round(window.innerHeight * dpr);
      wake();
    };

    /* ── theme ── */
    let accent = "#f5a623";
    let warm = false;
    const readTheme = () => {
      accent = getComputedStyle(html).getPropertyValue("--accent").trim() || accent;
      warm = html.dataset.heroState === "warm";
      wake();
    };
    // the palette swaps after a delay (--fg-swap); read now and once it has landed
    let themeTimer = 0;
    const mo = new MutationObserver(() => {
      readTheme();
      window.clearTimeout(themeTimer);
      themeTimer = window.setTimeout(readTheme, 800);
    });
    mo.observe(html, { attributes: true, attributeFilter: ["data-hero-state"] });

    /* ── state ── */
    const pts = Array.from({ length: N }, () => ({ x: -100, y: -100, vx: 0, vy: 0 }));
    const target = { x: -100, y: -100 };
    const ringPos = { x: -100, y: -100 };
    let placed = false;
    let visible = false;
    let raf = 0;
    let t0 = performance.now();
    let clock = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - t0) / 1000);
      t0 = now;
      clock += dt;
      const k = 1 - Math.pow(1 - 0.35, dt * 60);

      // head is the pointer; each point springs toward the one ahead (L5 spring follow)
      pts[0].x = target.x;
      pts[0].y = target.y;
      let energy = 0;
      for (let i = 1; i < N; i++) {
        const p = pts[i];
        const a = pts[i - 1];
        p.vx = (p.vx + (a.x - p.x) * 0.42) * 0.52;
        p.vy = (p.vy + (a.y - p.y) * 0.42) * 0.52;
        p.x += p.vx;
        p.y += p.vy;
        energy += Math.abs(a.x - p.x) + Math.abs(a.y - p.y);
      }
      ringPos.x += (target.x - ringPos.x) * k * 0.6;
      ringPos.y += (target.y - ringPos.y) * k * 0.6;
      d.style.transform = `translate3d(${target.x}px, ${target.y}px, 0)`;
      r.style.transform = `translate3d(${ringPos.x}px, ${ringPos.y}px, 0)`;

      draw();
      const ringMoving = Math.abs(target.x - ringPos.x) + Math.abs(target.y - ringPos.y) > 0.3;
      raf = energy > 0.4 || ringMoving ? requestAnimationFrame(frame) : 0;
      if (!raf) ctx.clearRect(0, 0, cv.width, cv.height);
    };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (!visible) return;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = accent;
      for (let i = 1; i < N; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const seg = Math.hypot(b.x - a.x, b.y - a.y);
        if (seg < 0.05) continue;
        const fade = 1 - i / N;
        ctx.globalAlpha = fade * 0.9;
        ctx.beginPath();
        if (warm) {
          // hero doodle grammar: wobbly, round-capped, thicker, on its own clock
          const nx = -(b.y - a.y) / seg;
          const ny = (b.x - a.x) / seg;
          const w = Math.sin(clock * 9 + i * 1.7) * Math.min(4, seg * 0.5);
          ctx.lineWidth = 2.6 * fade + 0.6;
          ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo((a.x + b.x) / 2 + nx * w, (a.y + b.y) / 2 + ny * w, b.x, b.y);
        } else {
          // cold grammar: a hairline thread
          ctx.lineWidth = 1.2 * fade + 0.3;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    function wake() {
      if (!raf) {
        t0 = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      target.x = e.clientX;
      target.y = e.clientY;
      if (!placed) {
        for (const p of pts) {
          p.x = e.clientX;
          p.y = e.clientY;
        }
        ringPos.x = e.clientX;
        ringPos.y = e.clientY;
        placed = true;
      }

      const t = e.target as Element | null;
      const overStage = !!t?.closest?.(".hero-stage");
      visible = !overStage;
      el.dataset.visible = visible ? "1" : "0";

      const hit = overStage ? null : t?.closest?.(INTERACTIVE);
      el.dataset.hover = hit ? "1" : "0";
      const text = hit?.getAttribute("data-cursor") ?? "";
      if (label.current && label.current.textContent !== text) label.current.textContent = text;
      el.dataset.label = text ? "1" : "0";
      wake();
    };
    const onLeave = () => {
      visible = false;
      el.dataset.visible = "0";
      wake();
    };

    readTheme();
    size();
    window.addEventListener("resize", size);
    window.addEventListener("pointermove", onMove, { passive: true });
    html.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);

    return () => {
      window.removeEventListener("resize", size);
      window.removeEventListener("pointermove", onMove);
      html.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      mo.disconnect();
      window.clearTimeout(themeTimer);
      if (raf) cancelAnimationFrame(raf);
      html.classList.remove("has-cursor");
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div ref={root} className="cursor" aria-hidden="true" data-visible="0" data-hover="0" data-label="0">
      <canvas ref={canvas} className="cursor-trail" />
      <div ref={ring} className="cursor-ring">
        <span ref={label} className="cursor-label" />
      </div>
      <div ref={dot} className="cursor-dot" />
    </div>
  );
}

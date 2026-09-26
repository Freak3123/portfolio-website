"use client";

/**
 * Three tilted polaroids of the creative work that can be dragged and thrown.
 *
 * Elements + reference sources:
 * - Drag-to-throw physics objects (release velocity, friction, wall bounce) ...
 *   Awwwards SOTD pattern (drag-and-throw playful objects).
 * - Tilt that springs back to its resting angle, leaning into the throw .......
 *   L5 animation-reference/physics/1 spring (stiffness 350 / damping 5 /
 *   mass 0.5) applied to rotation.
 * - Round "VIEW" link on each card ............................................
 *   meermohsin.me round button ("LET'S BE CREATIVE").
 * - Tilted polaroid cards ....................................................
 *   the hero art's hand-made register (warm self), user brief: "the creative
 *   side, like the yellow character".
 *
 * Keyboard/AT: every card is an <article> whose VIEW link is a normal link;
 * dragging never starts from the link, so clicks and Enter always work.
 * Reduced motion: cards can still be moved by hand, but are not thrown.
 */

import { useEffect, useRef, type CSSProperties, type SyntheticEvent } from "react";
import { sound } from "@/lib/audio/sound";
import { prefersReducedMotion } from "@/lib/motion/gsap";

export type WorkCard = {
  id: string;
  title: string;
  tag: string;
  img: string;
  href: string;
  /** resting position inside the tray, % of its box, and tilt in deg */
  hx: number;
  hy: number;
  tilt: number;
};

type Body = { x: number; y: number; vx: number; vy: number; r: number; vr: number; drag: boolean };

// L5 spring: stiffness 350, damping 5, mass 0.5 (framer-motion units, per second)
const K = 350;
const C = 5;
const M = 0.5;
const FRICTION = 0.94; // per 60fps frame
const BOUNCE = 0.55;

export default function ThrowCards({ cards }: { cards: WorkCard[] }) {
  const tray = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = tray.current;
    if (!box) return;
    const els = Array.from(box.querySelectorAll<HTMLElement>(".cr-card"));
    const bodies: Body[] = cards.map((c) => ({ x: 0, y: 0, vx: 0, vy: 0, r: c.tilt, vr: 0, drag: false }));
    const reduced = prefersReducedMotion();
    let z = 10;
    let raf = 0;
    let last = 0;

    const apply = (i: number) => {
      const b = bodies[i];
      els[i].style.transform = `translate3d(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px, 0) rotate(${b.r.toFixed(2)}deg)`;
    };

    /** keep a card inside the tray: offsets are relative to its home box */
    const bounds = (i: number) => {
      const el = els[i];
      const W = box.clientWidth;
      const H = box.clientHeight;
      return {
        minX: -el.offsetLeft,
        maxX: W - el.offsetLeft - el.offsetWidth,
        minY: -el.offsetTop,
        maxY: H - el.offsetTop - el.offsetHeight,
      };
    };

    const step = (now: number) => {
      const dt = Math.min(1 / 30, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      const k = dt * 60;
      let moving = false;
      bodies.forEach((b, i) => {
        if (!b.drag) {
          b.x += b.vx * k;
          b.y += b.vy * k;
          const f = Math.pow(FRICTION, k);
          b.vx *= f;
          b.vy *= f;
          const lim = bounds(i);
          let hit = 0;
          if (b.x < lim.minX || b.x > lim.maxX) {
            b.x = Math.max(lim.minX, Math.min(lim.maxX, b.x));
            b.vx = -b.vx * BOUNCE;
            hit = Math.abs(b.vx);
          }
          if (b.y < lim.minY || b.y > lim.maxY) {
            b.y = Math.max(lim.minY, Math.min(lim.maxY, b.y));
            b.vy = -b.vy * BOUNCE;
            hit = Math.max(hit, Math.abs(b.vy));
          }
          if (hit > 2) sound.pluck({ pitch: 0.3 + Math.random() * 0.2, gain: Math.min(0.5, hit / 30) });
        }
        // tilt: spring to rest angle + lean into horizontal motion
        const target = cards[i].tilt + Math.max(-16, Math.min(16, b.vx * 0.9));
        // integrate in small sub-steps; this spring is stiff and very bouncy
        const n = 4;
        for (let s = 0; s < n; s++) {
          b.vr += ((-K * (b.r - target) - C * b.vr) / M) * (dt / n);
          b.r += b.vr * (dt / n);
        }
        apply(i);
        if (b.drag || Math.hypot(b.vx, b.vy) > 0.05 || Math.abs(b.vr) > 0.05 || Math.abs(b.r - target) > 0.05) moving = true;
      });
      raf = moving ? requestAnimationFrame(step) : 0;
      if (!raf) last = 0;
    };
    const wake = () => {
      if (!raf && !reduced) raf = requestAnimationFrame(step);
    };

    const cleanups = els.map((el, i) => {
      let px = 0;
      let py = 0;
      let pt = 0;
      const down = (e: PointerEvent) => {
        if ((e.target as Element).closest("a")) return;
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        const b = bodies[i];
        b.drag = true;
        b.vx = b.vy = 0;
        px = e.clientX;
        py = e.clientY;
        pt = performance.now();
        el.style.zIndex = String(++z);
        el.dataset.dragging = "";
        sound.tick();
        wake();
      };
      const move = (e: PointerEvent) => {
        const b = bodies[i];
        if (!b.drag) return;
        const now = performance.now();
        const dx = e.clientX - px;
        const dy = e.clientY - py;
        const f = Math.max(1, now - pt) / (1000 / 60);
        // smoothed velocity in px per 60fps frame
        b.vx = b.vx * 0.5 + (dx / f) * 0.5;
        b.vy = b.vy * 0.5 + (dy / f) * 0.5;
        const lim = bounds(i);
        b.x = Math.max(lim.minX, Math.min(lim.maxX, b.x + dx));
        b.y = Math.max(lim.minY, Math.min(lim.maxY, b.y + dy));
        px = e.clientX;
        py = e.clientY;
        pt = now;
        if (reduced) apply(i);
      };
      const up = () => {
        const b = bodies[i];
        if (!b.drag) return;
        b.drag = false;
        delete el.dataset.dragging;
        if (reduced) {
          b.vx = b.vy = 0;
          return;
        }
        // a release that paused before letting go is a drop, not a throw
        if (performance.now() - pt > 90) b.vx = b.vy = 0;
        wake();
      };
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      return () => {
        el.removeEventListener("pointerdown", down);
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
      };
    });

    return () => {
      cancelAnimationFrame(raf);
      cleanups.forEach((c) => c());
    };
  }, [cards]);

  const stop = (e: SyntheticEvent) => e.stopPropagation();

  return (
    <div ref={tray} className="cr-tray" data-journey-free onTouchStart={stop} onTouchMove={stop}>
      {cards.map((c) => (
        <article
          key={c.id}
          className="cr-card"
          aria-labelledby={`cr-card-${c.id}`}
          data-cursor="throw"
          style={
            {
              "--hx": `${c.hx}%`,
              "--hy": `${c.hy}%`,
              transform: `rotate(${c.tilt}deg)`,
            } as CSSProperties
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- small static SVG cover inside a draggable card */}
          <img className="cr-card-img" src={c.img} alt="" draggable={false} width={320} height={220} />
          <div className="cr-card-cap">
            <h3 id={`cr-card-${c.id}`} className="cr-card-title">
              {c.title}
            </h3>
            <p className="cr-card-tag">{c.tag}</p>
          </div>
          <a className="cr-card-view" href={c.href} target="_blank" rel="noopener noreferrer" aria-label={`View ${c.title}`}>
            View
          </a>
        </article>
      ))}
    </div>
  );
}

"use client";

/**
 * Big round "LET'S BE CREATIVE" button that is pulled toward the cursor.
 *
 * Elements + reference sources:
 * - Round CTA button, "LET'S BE CREATIVE" ....................................
 *   meermohsin.me footer round button.
 * - Magnetic pull with a bouncy spring return (stiffness 350, damping 5,
 *   mass 0.5), label moving a little further than the disc .....................
 *   L5 animation-reference/physics/1 (framer-motion magnetic element) and the
 *   Awwwards magnetic-button pattern.
 *
 * A real <a href="mailto:…">, fully keyboard operable; the motion is only a
 * transform and never runs for coarse pointers or reduced motion.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/motion/gsap";
import { sound } from "@/lib/audio/sound";

const K = 350;
const C = 5;
const M = 0.5;
const PULL = 0.38;
const REACH = 70; // px beyond the disc where the magnet starts to catch

export default function MagneticButton({ href, children }: { href: string; children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const disc = useRef<HTMLAnchorElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const w = wrap.current;
    const a = disc.current;
    const l = label.current;
    if (!w || !a || !l) return;
    if (prefersReducedMotion() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const s = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
    let raf = 0;
    let last = 0;
    let inside = false;

    const step = (now: number) => {
      const dt = Math.min(1 / 30, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      const n = 4;
      for (let i = 0; i < n; i++) {
        s.vx += ((-K * (s.x - s.tx) - C * s.vx) / M) * (dt / n);
        s.vy += ((-K * (s.y - s.ty) - C * s.vy) / M) * (dt / n);
        s.x += s.vx * (dt / n);
        s.y += s.vy * (dt / n);
      }
      a.style.transform = `translate3d(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px, 0)`;
      l.style.transform = `translate3d(${(s.x * 0.35).toFixed(2)}px, ${(s.y * 0.35).toFixed(2)}px, 0)`;
      const rest = Math.hypot(s.x - s.tx, s.y - s.ty) < 0.05 && Math.hypot(s.vx, s.vy) < 0.05;
      raf = rest ? 0 : requestAnimationFrame(step);
      if (!raf) last = 0;
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(step);
    };

    const onMove = (e: PointerEvent) => {
      const b = w.getBoundingClientRect();
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const near = Math.hypot(dx, dy) < b.width / 2 + REACH;
      if (near) {
        if (!inside) sound.tick();
        s.tx = dx * PULL;
        s.ty = dy * PULL;
      } else if (inside) {
        s.tx = s.ty = 0;
      }
      if (near || inside) wake();
      inside = near;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={wrap} className="fn-magnet">
      <a ref={disc} className="fn-cta" href={href} data-cursor="hello">
        <span ref={label} className="fn-cta-label">
          {children}
        </span>
      </a>
    </div>
  );
}

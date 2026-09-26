"use client";

/**
 * Drives the creative chapter from the journey clock. Renders nothing.
 *
 * Elements + reference sources:
 * - Circular colour-wipe flooding the scene saffron from the top-right ........
 *   Awwwards SOTD circular/ripple colour-wipe transition; mirrors the hero's
 *   own bulb ripple (plan/hero.md §2, which starts at the bulb, top right).
 * - Turbulent, jagged wipe edge (radius + layered-sine turbulence, eased) .....
 *   L1 animation-reference/hover-for-newbg/17: `dist + (turbulence-0.5)*k`
 *   jagged distance mask between two renderings.
 * - The web's strands redrawn as white doodle-lines, drawn on as the wipe
 *   lands ...................................................................
 *   user's spider/web theme in the hero's warm doodle vocabulary.
 *
 * Writes on #creative: --cr-wipe, --cr-draw, --cr-s0, --cr-s1 and the
 * visibility of each step group. No React state per frame.
 */

import { useEffect } from "react";
import { journey } from "@/lib/journey/journey";
import { sound } from "@/lib/audio/sound";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const N = 84; // polygon vertices on the jagged edge

export default function CreativeDirector() {
  useEffect(() => {
    const scene = document.getElementById("creative");
    if (!scene) return;
    const wash = scene.querySelector<HTMLElement>(".cr-wash");
    const s0 = scene.querySelector<HTMLElement>(".cr-s0");
    const s1 = scene.querySelector<HTMLElement>(".cr-s1");
    let t = 0;
    let lastP = -1;
    let armed = true;

    const off = journey.subscribe((j, dt) => {
      if (!j.live) return;
      const f = j.frame("creative");
      if (f.presence <= 0 && lastP <= 0) return;
      t += dt;

      const p = easeOutCubic(f.presence);
      lastP = f.presence;

      // wipe
      if (wash) {
        if (p >= 0.999) {
          wash.style.clipPath = "none";
        } else if (p <= 0.001) {
          wash.style.clipPath = "polygon(0 0, 0 0, 0 0)";
        } else {
          const { w, h } = j.viewport;
          const ox = w * 0.92;
          const oy = h * 0.06;
          const far = Math.hypot(ox, h - oy) * 1.08;
          const R = far * p;
          // the edge is only jagged while it is travelling (L1 turbulence)
          const amp = Math.min(46, 18 + R * 0.05) * Math.sin(Math.PI * p);
          let poly = "";
          for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2;
            const n =
              Math.sin(a * 7 + t * 1.7) * 0.5 +
              Math.sin(a * 13 - t * 2.6) * 0.3 +
              Math.sin(a * 29 + t * 4.1) * 0.2;
            const r = Math.max(0, R + n * amp);
            poly += `${i ? "," : ""}${(ox + Math.cos(a) * r).toFixed(1)}px ${(oy + Math.sin(a) * r).toFixed(1)}px`;
          }
          wash.style.clipPath = `polygon(${poly})`;
        }
      }

      // one soft pluck as the light goes off (never on load — sound is gated)
      if (armed && f.presence > 0.15 && f.local < 0) {
        armed = false;
        sound.pluck({ pitch: 0.75, gain: 0.5 });
      }
      if (f.presence <= 0.01) armed = true;

      const gate = smooth(0.55, 0.95, f.presence);
      const a0 = gate * clamp01(1 - Math.abs(f.local) * 1.6);
      const a1 = gate * clamp01(1 - Math.abs(f.local - 1) * 1.6);
      scene.style.setProperty("--cr-wipe", p.toFixed(3));
      scene.style.setProperty("--cr-draw", smooth(0.45, 1, f.presence).toFixed(3));
      scene.style.setProperty("--cr-s0", a0.toFixed(3));
      scene.style.setProperty("--cr-s1", a1.toFixed(3));
      if (s0) s0.style.visibility = a0 > 0.02 ? "visible" : "hidden";
      if (s1) s1.style.visibility = a1 > 0.02 ? "visible" : "hidden";
    });

    return () => {
      off();
      if (wash) wash.style.clipPath = "";
      if (s0) s0.style.visibility = "";
      if (s1) s1.style.visibility = "";
      for (const k of ["--cr-wipe", "--cr-draw", "--cr-s0", "--cr-s1"]) scene.style.removeProperty(k);
    };
  }, []);

  return null;
}

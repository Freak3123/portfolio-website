"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * One registration point for GSAP. Every section imports gsap/ScrollTrigger
 * from here, never from "gsap" directly, so the plugin is registered exactly
 * once and only on the client.
 */
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export { gsap, ScrollTrigger };

/** Scroll-driven motion is decoration, never load-bearing (DESIGN-SYSTEM §5). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap, ScrollTrigger, prefersReducedMotion } from "@/lib/motion/gsap";
import { journey } from "@/lib/journey/journey";
import type { ChapterId } from "@/lib/journey/chapters";

/**
 * Lenis inertia scroll driven by GSAP's ticker, so pinned/scrubbed
 * ScrollTriggers and the scroll position share one clock (the pattern the
 * reference site, meermohsin.me, ships). Renders nothing.
 *
 * Reduced motion: no Lenis at all — native scroll, ScrollTrigger still works.
 * In-page `#anchor` links are routed through Lenis so they glide instead of jump.
 */
export default function SmoothScroll() {
  // Several chapters pin, and pinning adds height. Once every section has
  // mounted (and again after fonts/images settle) re-sort triggers by page
  // position and re-measure, so a later pin never computes a stale start.
  useEffect(() => {
    const settle = () => {
      ScrollTrigger.sort();
      ScrollTrigger.refresh();
    };
    const raf = requestAnimationFrame(settle);
    document.fonts?.ready.then(settle);
    window.addEventListener("load", settle);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("load", settle);
    };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1 });
    lenis.on("scroll", ScrollTrigger.update);

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;

    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href")!;
      // a bare "#" is a placeholder link (demo content), not "go to top"
      if (id === "#") {
        e.preventDefault();
        return;
      }
      const target = id === "#top" ? 0 : document.querySelector(id);
      if (target === null) return;
      e.preventDefault();
      // chapters live inside the pinned journey stage; their DOM position is
      // not where the story shows them, so hand them to the journey instead
      const chapter = target instanceof HTMLElement ? target.dataset.chapter : undefined;
      if (chapter && journey.live) {
        journey.goToChapter(chapter as ChapterId);
        history.replaceState(null, "", id);
        return;
      }
      lenis.scrollTo(target as HTMLElement | 0, { duration: 1.4 });
      history.replaceState(null, "", id);
    };
    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("click", onClick);
      gsap.ticker.remove(tick);
      lenis.destroy();
      delete (window as unknown as { __lenis?: Lenis }).__lenis;
    };
  }, []);

  return null;
}

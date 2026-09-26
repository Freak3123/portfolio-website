"use client";

/**
 * Site header.
 *
 * Elements, and where each one comes from (no element here is original):
 * - Fixed top bar, monogram linking home ................... meermohsin.me header
 * - Pulsing status dot + "Available" ........................ meermohsin.me "ONLINE" indicator
 * - Résumé link in the bar .................................. meermohsin.me header email/social slot
 * - Hide on scroll down / show on scroll up ................. Awwwards SOTD staple
 * - "Map" → full-screen overview map of the whole site,
 *   nodes as jump links, staggered line-draw reveal ......... Awwwards SOTD overview-map navigation
 *   + full-screen overlay menu with staggered items (see WebMap.tsx)
 *
 * Layout rules this file keeps:
 * - The hero's lamp hangs from 87% (≥900px) / 80% (<900px) of the width.
 *   Every interactive item stays left of ~76vw and the bar itself is
 *   `pointer-events: none`, so the flex and bulb are never covered or blocked.
 * - Right edge below the bar belongs to the journey's progress thread;
 *   bottom-left belongs to the sound toggle.
 * - Below 900px the hero's h1 sits top-centre, so the bar stays tucked away
 *   while the hero is on screen.
 * - Above the journey: hide on scroll down, show on scroll up. Inside the
 *   journey (a pinned stage) the bar stays put, pared down.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion } from "@/lib/motion/gsap";
import { journey } from "@/lib/journey/journey";
import { sound } from "@/lib/audio/sound";
import WebMap, { type MapTarget } from "./WebMap";

const RESUME = "/Ashreeta-Patra-CV.pdf";

type LenisLike = {
  stop(): void;
  start(): void;
  scrollTo(t: number | HTMLElement, o?: { duration?: number; immediate?: boolean }): void;
};
const lenis = () => (window as unknown as { __lenis?: LenisLike }).__lenis;

/** where the visitor is: the hero ("home") or a chapter of the journey */
function whereAmI(): MapTarget {
  const j = document.getElementById("journey");
  if (!j) return "home";
  return j.getBoundingClientRect().top > window.innerHeight * 0.5 ? "home" : journey.current;
}

function go(id: MapTarget) {
  if (id === "home") {
    const l = lenis();
    if (l) l.scrollTo(0, { duration: 1.6 });
    else window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    history.replaceState(null, "", "#top");
    return;
  }
  if (journey.live) {
    // the journey sits pinned below the hero; get into it first if needed
    const j = document.getElementById("journey");
    if (j && j.getBoundingClientRect().top > 1) {
      const l = lenis();
      if (l) l.scrollTo(j, { immediate: true });
      else j.scrollIntoView();
    }
    journey.goToChapter(id);
  } else {
    // no live stage (reduced motion / not mounted): scenes stack as a document
    const el = document.getElementById(id);
    const l = lenis();
    if (el && l) l.scrollTo(el, { duration: 1.4 });
    else el?.scrollIntoView();
  }
  history.replaceState(null, "", `#${id}`);
}

export default function SiteNav() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<MapTarget>("home");
  const navRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const pending = useRef<MapTarget | null>(null);

  /* ── bar state: in-hero, in-journey, hide on scroll down / show on up ── */
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const reduced = prefersReducedMotion();
    let last = window.scrollY;
    let raf = 0;

    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const hero = document.getElementById("top");
      const heroH = hero ? hero.offsetHeight : window.innerHeight;
      const inHero = y < heroH - 72;
      const j = document.getElementById("journey");
      const r = j?.getBoundingClientRect();
      const inJourney = !!r && r.top <= 1 && r.bottom > window.innerHeight * 0.5;
      nav.dataset.inHero = inHero ? "1" : "0";
      nav.dataset.inJourney = inJourney ? "1" : "0";

      if (inJourney) nav.dataset.hidden = "0";
      else if (!reduced) {
        const dy = y - last;
        if (y < 80) nav.dataset.hidden = "0";
        else if (dy > 4) nav.dataset.hidden = "1";
        else if (dy < -4) nav.dataset.hidden = "0";
      }
      last = y;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const openMap = useCallback(() => {
    setCurrent(whereAmI());
    setOpen(true);
  }, []);

  const pick = useCallback((id: MapTarget) => {
    pending.current = id;
    setOpen(false);
  }, []);

  /* ── dialog: scroll lock, inert page, focus trap, Esc, draw-in ── */
  useEffect(() => {
    const map = mapRef.current;
    const toggle = toggleRef.current;
    if (!map || !toggle || !open) return;
    const main = document.querySelector("main");

    lenis()?.stop();
    document.documentElement.dataset.menuOpen = "1";
    main?.setAttribute("inert", "");

    // Awwwards line-draw: silk first (radials, then rings), then the spine, then nodes
    let tl: gsap.core.Timeline | undefined;
    if (!prefersReducedMotion()) {
      const q = (s: string) => map.querySelectorAll<SVGPathElement>(s);
      tl = gsap.timeline();
      tl.fromTo(map, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power2.out" })
        .fromTo(
          q('[data-draw="radial"]'),
          { strokeDashoffset: 1 },
          { strokeDashoffset: 0, duration: 0.7, ease: "power2.out", stagger: 0.025 },
          0.05,
        )
        .fromTo(
          q('[data-draw="ring"]'),
          { strokeDashoffset: 1 },
          { strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut", stagger: 0.05 },
          0.3,
        )
        .fromTo(
          q('[data-draw="spine"]'),
          { strokeDashoffset: 1 },
          { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut" },
          0.45,
        )
        .fromTo(
          map.querySelectorAll("[data-map-node], [data-map-item]"),
          { opacity: 0, scale: 0.6 },
          { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(2)", stagger: 0.07 },
          0.55,
        );
    }
    map
      .querySelector<HTMLElement>('[aria-current="location"]')
      ?.focus({ preventScroll: true });
    if (!map.contains(document.activeElement)) {
      map.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = [toggle, ...map.querySelectorAll<HTMLElement>("button:not([disabled])")];
      const first = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        first.focus();
      } else if (!active || !focusables.includes(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    // keep wheel/keys/swipes from also flying the journey camera behind the map
    const swallow = (e: Event) => e.stopPropagation();
    document.addEventListener("keydown", onKey, true);
    map.addEventListener("keydown", swallow);
    map.addEventListener("wheel", swallow, { passive: true });
    map.addEventListener("touchmove", swallow, { passive: true });

    return () => {
      document.removeEventListener("keydown", onKey, true);
      map.removeEventListener("keydown", swallow);
      map.removeEventListener("wheel", swallow);
      map.removeEventListener("touchmove", swallow);
      tl?.revert();
      main?.removeAttribute("inert");
      delete document.documentElement.dataset.menuOpen;
      lenis()?.start();
      toggle.focus({ preventScroll: true });
      const target = pending.current;
      pending.current = null;
      if (target) requestAnimationFrame(() => go(target));
    };
  }, [open]);

  return (
    <header ref={navRef} className="site-nav" data-open={open ? "1" : "0"} data-in-hero="1" data-in-journey="0" data-hidden="0">
      <div className="site-nav-bar">
        <a href="#top" className="site-nav-brand" aria-label="Ashreeta Patra — back to top" onPointerEnter={() => sound.tick()}>
          <span className="site-nav-mark" aria-hidden="true">
            AP
          </span>
          <span className="site-nav-name">Ashreeta Patra</span>
        </a>

        <p className="site-nav-status">
          <span className="site-nav-dot" aria-hidden="true" />
          <span>Available</span>
          <span className="sr-only"> for new work</span>
        </p>

        <a
          className="site-nav-link site-nav-resume"
          href={RESUME}
          target="_blank"
          rel="noopener"
          onPointerEnter={() => sound.tick()}
        >
          Résumé<span className="sr-only"> (PDF, opens in a new tab)</span>
        </a>

        <button
          ref={toggleRef}
          type="button"
          className="site-nav-toggle"
          aria-expanded={open}
          aria-controls="site-map"
          aria-haspopup="dialog"
          data-cursor={open ? "close" : "map"}
          onPointerEnter={() => sound.tick()}
          onClick={() => (open ? setOpen(false) : openMap())}
        >
          <span className="site-nav-toggle-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" focusable="false">
              <path d="M10 1v18M1 10h18M3.6 3.6l12.8 12.8M16.4 3.6 3.6 16.4" />
              <circle cx="10" cy="10" r="4.5" />
              <circle cx="10" cy="10" r="8" />
            </svg>
          </span>
          <span className="site-nav-toggle-label">{open ? "Close" : "Map"}</span>
        </button>
      </div>

      <WebMap ref={mapRef} open={open} current={current} onPick={pick} />
    </header>
  );
}

"use client";

/**
 * JourneyEngine — the stage's clock, its scroll-jack, and the only writer of
 * live mode. Renders a hidden marker (to find its section) and nothing else.
 *
 * Elements, and where each one comes from:
 * - Pinned full-viewport stage, scroll scrubs a camera ........... meermohsin.me (Lenis +
 *   GSAP ScrollTrigger pinned, scrubbed stages); Awwwards SOTD scroll-driven
 *   camera flight through one scene (Igloo Inc, Lusion)
 * - One gesture = one story beat, snapped with directional
 *   easing (wheel, swipe, keys) ................................. Awwwards SOTD scroll-jacked
 *   snapping chapters; ScrollTrigger `snap` (directional) as the fallback for
 *   scrollbar / native touch momentum
 * - The hero → web handoff lands exactly on the first beat ...... same snapping pattern,
 *   applied to the section's first stop
 * - …and is flown, not scrolled: one gesture dives the camera down a silk
 *   tunnel into the web (./tunnel.ts), scrubbed by the `entry` trigger ... Codrops "Infinite
 *   Tubes with Three.js" (2017) + "Scroll-Driven 3D Gallery Using a Blender
 *   Camera Path" (2026): camera position on a curve = scroll progress
 * - Travel whoosh / ambient warmth follow the camera ........... meermohsin.me sound
 *   ("click anywhere to activate the experience")
 *
 * Live mode is decided here and only here: never under prefers-reduced-motion,
 * never without JS. Everything this file adds is removed again on teardown so
 * the static, stacked document is what remains.
 */

import { useEffect, useRef } from "react";
import type Lenis from "lenis";
import { ScrollTrigger, gsap, prefersReducedMotion } from "@/lib/motion/gsap";
import { journey } from "@/lib/journey/journey";
import { LAST_STEP, RANGES, type ChapterId } from "@/lib/journey/chapters";
import { stage } from "@/lib/journey/stage";
import { travelAt } from "@/lib/journey/travel";
import { sound } from "@/lib/audio/sound";
import { createTunnel } from "./tunnel";

type VirtualScrollData = { deltaX: number; deltaY: number; event: WheelEvent | TouchEvent };
type LenisLike = Lenis & { options: { virtualScroll?: (d: VirtualScrollData) => boolean } };

const getLenis = () => (window as unknown as { __lenis?: LenisLike }).__lenis;

/** gestures inside these are left alone (a scene's own drag / scroll areas) */
const FREE = "[data-lenis-prevent], [data-journey-free], input, textarea, select, [contenteditable]";

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** the gap (ms) that separates two wheel gestures — trackpad inertia is continuous */
const WHEEL_GAP = 170;
/** wheel delta (px) one gesture needs before it counts */
const WHEEL_THRESHOLD = 24;
/** swipe distance (px) one touch gesture needs */
const SWIPE_THRESHOLD = 36;
/** seconds for one flight down (or back up) the hero → web tunnel */
const TUNNEL_S = 1.9;

export default function JourneyEngine() {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const section = marker.current?.closest<HTMLElement>(".journey");
    if (!section) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let teardown: (() => void) | null = null;
    const decide = () => {
      teardown?.();
      teardown = null;
      if (!prefersReducedMotion()) teardown = goLive(section);
    };
    decide();
    mq.addEventListener("change", decide);
    return () => {
      mq.removeEventListener("change", decide);
      teardown?.();
    };
  }, []);

  return <span ref={marker} className="journey-engine" hidden />;
}

function goLive(section: HTMLElement): () => void {
  const stageEl = section.querySelector<HTMLElement>(".journey-stage") ?? section;
  const scenes = Array.from(section.querySelectorAll<HTMLElement>("[data-chapter]"));
  const ids = scenes.map((el) => el.dataset.chapter as ChapterId);
  const cache = scenes.map(() => ({ p: -1, l: NaN, active: false, inert: false }));

  section.style.setProperty("--journey-stops", String(LAST_STEP + 1));
  section.setAttribute("data-live", "");
  journey.live = true;

  const measure = () => journey.setViewport(stageEl.clientWidth || window.innerWidth, stageEl.clientHeight || window.innerHeight);
  measure();

  /* ── scroll → progress ─────────────────────────────────────────────── */
  const st = ScrollTrigger.create({
    trigger: section,
    start: "top top",
    end: "bottom bottom",
    onUpdate: (s) => journey.setProgress(s.progress * LAST_STEP),
    onRefresh: (s) => journey.setProgress(s.progress * LAST_STEP),
    snap: {
      // every 1 / LAST_STEP, directional — but momentum carried in from the
      // hero (native touch) must still land on the first beat, not skip it
      snapTo: (v: number, self?: ScrollTrigger) => {
        const s = v * LAST_STEP;
        if (s < 0.5) return 0;
        const dir = self?.direction ?? 1;
        const to = dir > 0 ? Math.ceil(s - 0.12) : Math.floor(s + 0.12);
        return Math.min(LAST_STEP, Math.max(0, to)) / LAST_STEP;
      },
      directional: false,
      duration: { min: 0.5, max: 1.1 },
      ease: "power2.inOut",
      delay: 0.08,
      inertia: false,
    },
  });
  const tunnel = createTunnel(section, stageEl);
  const onEntry = (s: ScrollTrigger) => {
    stage.entry = s.progress;
    section.style.setProperty("--entry", s.progress.toFixed(3));
    tunnel.update(s.progress);
  };
  const entry = ScrollTrigger.create({
    trigger: section,
    start: "top bottom",
    end: "top top",
    onUpdate: onEntry,
    onRefresh: onEntry,
    // the tunnel is never left hanging: a released drag / touch fling finishes
    // the dive in the direction it was going
    snap: {
      snapTo: (v: number, self?: ScrollTrigger) => {
        const dir = self?.direction ?? 1;
        return dir > 0 ? (v > 0.08 ? 1 : 0) : v < 0.92 ? 0 : 1;
      },
      directional: false,
      duration: { min: 0.9, max: 1.7 },
      ease: "power2.inOut",
      delay: 0.12,
      inertia: false,
    },
  });

  const scrollFor = (step: number) => st.start + (st.end - st.start) * (step / LAST_STEP);
  const engaged = () => {
    const y = window.scrollY;
    return y >= st.start - 2 && y <= st.end + 2;
  };

  /* ── navigation: every beat is a scroll position ─────────────────────── */
  let animating = false;
  let lockUntil = 0;
  let animTimer = 0;
  stage.target = Math.round(journey.g);

  /** glide the page to `y`; the stage is locked until it lands */
  const flyTo = (y: number, duration: number) => {
    animating = true;
    lockUntil = performance.now() + duration * 1000 - 180;
    window.clearTimeout(animTimer);
    animTimer = window.setTimeout(() => (animating = false), duration * 1000 + 60);
    const lenis = getLenis();
    if (lenis) {
      lenis.scrollTo(y, {
        duration,
        easing: easeInOutCubic,
        force: true,
        onComplete: () => {
          animating = false;
        },
      });
    } else {
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  journey.setNavigator((step) => {
    const y = scrollFor(step);
    const dist = Math.abs(step - journey.g);
    // diving in from the hero is the long flight down the tunnel
    const fromHero = window.scrollY < st.start - 2;
    const duration = fromHero ? TUNNEL_S : Math.min(1.8, 0.9 + 0.2 * Math.max(0, dist - 1));
    stage.target = step;
    flyTo(y, duration);
  });
  /** back out of the web, up the tunnel, to the hero */
  const flyOut = () => {
    stage.target = 0;
    flyTo(entry.start, TUNNEL_S);
  };

  /** next/prev from the step already in flight, so repeated presses queue up */
  const step = (dir: 1 | -1) => {
    if (animating) journey.goTo(stage.target + dir);
    else if (dir > 0) journey.next();
    else journey.prev();
  };
  const atStart = () => !animating && journey.g <= 1e-3;
  const atEnd = () => !animating && journey.g >= LAST_STEP - 1e-3;

  /* ── wheel: one gesture, one beat ────────────────────────────────────── */
  let lastWheel = 0;
  let lastAbs = 0;
  let armed = true;
  let acc = 0;

  /** returns true when the wheel event was consumed by the journey */
  const wheel = (dy: number): boolean => {
    const now = performance.now();
    const abs = Math.abs(dy);
    const gap = now - lastWheel;
    lastWheel = now;
    // a pause, or (once the last travel has landed) a fresh spike on top of
    // decaying trackpad inertia, starts a new gesture
    if (gap > WHEEL_GAP || (now > lockUntil && abs > 12 && abs > lastAbs * 2.2)) {
      armed = true;
      acc = 0;
    }
    lastAbs = abs;

    const y = window.scrollY;
    const lenis = getLenis();
    // approaching from the hero: one gesture inside the handoff zone flies the
    // whole tunnel and lands exactly on the first beat
    if (y < st.start - 2) {
      if (animating) return true; // mid-flight through the tunnel
      const target = (lenis?.targetScroll ?? y) + dy;
      if (dy > 0 && (target >= st.start || y >= entry.start - 2)) {
        if (armed) {
          armed = false;
          journey.goTo(0);
        }
        return true;
      }
      return false;
    }
    if (y > st.end + 2) {
      const target = (lenis?.targetScroll ?? y) + dy;
      if (dy < 0 && target <= st.end) {
        if (armed) {
          armed = false;
          journey.goTo(LAST_STEP);
        }
        return true;
      }
      return false;
    }
    // at either end of the story a fresh gesture hands the page back — at the
    // start, by flying back up the tunnel
    if (armed && dy < 0 && atStart()) {
      armed = false;
      flyOut();
      return true;
    }
    if (armed && dy > 0 && atEnd()) return false;
    if (!armed || now < lockUntil) return true;
    acc += dy;
    if (Math.abs(acc) >= WHEEL_THRESHOLD) {
      armed = false;
      acc = 0;
      step(dy > 0 ? 1 : -1);
    }
    return true;
  };

  const isFree = (t: EventTarget | null) => t instanceof Element && !!t.closest(FREE);

  const onVirtual = (d: VirtualScrollData): boolean => {
    const e = d.event;
    if (!e.type.startsWith("wheel") || (e as WheelEvent).ctrlKey) return true;
    if (Math.abs(d.deltaX) > Math.abs(d.deltaY) || isFree(e.target)) return true;
    if (!wheel(d.deltaY)) return true;
    if (e.cancelable) e.preventDefault();
    return false;
  };

  // Lenis owns the wheel; hook its virtual-scroll filter (chained, restored on
  // teardown). Without Lenis, listen natively.
  let hooked: LenisLike | null = null;
  let prevFilter: ((d: VirtualScrollData) => boolean) | undefined;
  const hook = () => {
    const lenis = getLenis();
    if (!lenis || hooked === lenis) return;
    hooked = lenis;
    prevFilter = lenis.options.virtualScroll;
    lenis.options.virtualScroll = (d) => onVirtual(d) && (prevFilter ? prevFilter(d) : true);
  };
  hook();
  const onNativeWheel = (e: WheelEvent) => {
    if (getLenis() || e.ctrlKey || isFree(e.target)) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (wheel(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1))) e.preventDefault();
  };
  window.addEventListener("wheel", onNativeWheel, { passive: false });

  /* ── touch: one swipe, one beat ──────────────────────────────────────── */
  let tx0 = 0;
  let ty0 = 0;
  let axis: "x" | "y" | null = null;
  let fired = false;
  let free = false;
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    tx0 = e.touches[0].clientX;
    ty0 = e.touches[0].clientY;
    axis = null;
    fired = false;
    free = isFree(e.target);
  };
  const onTouchMove = (e: TouchEvent) => {
    if (free || e.touches.length !== 1 || !engaged()) return;
    const dx = tx0 - e.touches[0].clientX;
    const dy = ty0 - e.touches[0].clientY;
    if (!axis && Math.hypot(dx, dy) > 8) axis = Math.abs(dy) >= Math.abs(dx) ? "y" : "x";
    if (axis !== "y") return;
    if (!fired && dy < 0 && atStart()) return; // hand back to the hero
    if (!fired && dy > 0 && atEnd()) return;
    if (e.cancelable) e.preventDefault();
    if (!fired && Math.abs(dy) > SWIPE_THRESHOLD && performance.now() > lockUntil - 250) {
      fired = true;
      step(dy > 0 ? 1 : -1);
    }
  };
  section.addEventListener("touchstart", onTouchStart, { passive: true });
  section.addEventListener("touchmove", onTouchMove, { passive: false });

  /* ── keys, while the stage holds the screen ──────────────────────────── */
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !engaged()) return;
    const t = e.target as Element | null;
    if (t?.closest?.("input, textarea, select, [contenteditable]")) return;
    const onControl = !!t?.closest?.("button, a, summary, [role='button']");
    let dir: 1 | -1 | 0 = 0;
    switch (e.key) {
      case "ArrowDown":
      case "PageDown":
        dir = 1;
        break;
      case "ArrowUp":
      case "PageUp":
        dir = -1;
        break;
      case " ":
        if (onControl) return;
        dir = e.shiftKey ? -1 : 1;
        break;
      case "Home":
        if (atStart()) return;
        e.preventDefault();
        journey.goTo(0);
        return;
      case "End":
        if (atEnd()) return;
        e.preventDefault();
        journey.goTo(LAST_STEP);
        return;
      default:
        return;
    }
    if (dir < 0 && atStart()) return;
    if (dir > 0 && atEnd()) return;
    e.preventDefault();
    step(dir);
  };
  window.addEventListener("keydown", onKey);

  /* ── visibility, size ────────────────────────────────────────────────── */
  const io = new IntersectionObserver(([e]) => (stage.visible = e.isIntersecting), { rootMargin: "64px 0px" });
  io.observe(section);
  const onRefresh = () => measure();
  ScrollTrigger.addEventListener("refresh", onRefresh);
  const ro = new ResizeObserver(measure);
  ro.observe(stageEl);
  ScrollTrigger.refresh();

  // a deep link (#trace) opens the story on that chapter
  const hash = window.location.hash.slice(1);
  const deep = RANGES.find((r) => r.id === hash);
  if (deep) {
    const y = scrollFor(deep.start);
    const lenis = getLenis();
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
  }

  /* ── the one clock ───────────────────────────────────────────────────── */
  let prevG = journey.g;
  let prevTravel = -1;
  const tick = (_time: number, deltaTime: number) => {
    if (!hooked) hook();
    if (!stage.visible) return;
    const dt = Math.min(0.05, Math.max(0.001, deltaTime / 1000));
    journey.tick(dt);
    const g = journey.g;

    // a travel between chapters just began
    const tr = travelAt(g);
    const idx = tr ? tr.from : -1;
    if (idx !== -1 && idx !== prevTravel && g !== prevG) sound.travel(g > prevG ? 1 : -1);
    prevTravel = idx;
    if (!animating && Math.abs(g - Math.round(g)) < 1e-3) stage.target = Math.round(g);
    if (g > 0.05) stage.moved = true;
    prevG = g;
    sound.setWarmth(journey.warmth);
    // While the creative chapter holds the screen the whole page is warm, the
    // same as the hero with its bulb off — so the fixed chrome (nav, sound
    // toggle, cursor) turns ink-on-saffron instead of paper-on-saffron.
    const warm = journey.warmth > 0.5;
    const html = document.documentElement;
    if (warm !== ("journeyWarm" in html.dataset)) {
      if (warm) html.dataset.journeyWarm = "";
      else delete html.dataset.journeyWarm;
    }

    for (let i = 0; i < scenes.length; i++) {
      const el = scenes[i];
      const c = cache[i];
      const f = journey.frame(ids[i]);
      const p = Math.round(f.presence * 1000) / 1000;
      const l = Math.round(f.local * 1000) / 1000;
      if (p !== c.p) {
        el.style.setProperty("--presence", String(p));
        c.p = p;
      }
      if (l !== c.l) {
        el.style.setProperty("--local", String(l));
        c.l = l;
      }
      if (f.active !== c.active) {
        if (f.active) el.setAttribute("data-active", "");
        else el.removeAttribute("data-active");
        c.active = f.active;
      }
      const inert = p < 0.5;
      if (inert !== c.inert) {
        el.inert = inert;
        c.inert = inert;
      }
    }
  };
  gsap.ticker.add(tick);
  // paint the first frame even if the observer has not reported yet
  stage.visible = true;
  tick(0, 16);
  stage.visible = section.getBoundingClientRect().top < window.innerHeight + 64;

  return () => {
    gsap.ticker.remove(tick);
    window.clearTimeout(animTimer);
    st.kill();
    entry.kill();
    tunnel.destroy();
    io.disconnect();
    ro.disconnect();
    ScrollTrigger.removeEventListener("refresh", onRefresh);
    window.removeEventListener("wheel", onNativeWheel);
    window.removeEventListener("keydown", onKey);
    section.removeEventListener("touchstart", onTouchStart);
    section.removeEventListener("touchmove", onTouchMove);
    if (hooked) hooked.options.virtualScroll = prevFilter;
    journey.setNavigator(null);
    journey.live = false;
    stage.visible = false;
    section.removeAttribute("data-live");
    section.style.removeProperty("--journey-stops");
    section.style.removeProperty("--entry");
    for (const el of scenes) {
      el.style.removeProperty("--presence");
      el.style.removeProperty("--local");
      el.removeAttribute("data-active");
      el.inert = false;
    }
    ScrollTrigger.refresh();
  };
}

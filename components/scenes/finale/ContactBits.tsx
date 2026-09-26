"use client";

/**
 * Small interactive pieces of the ending.
 *
 * Elements + reference sources:
 * - Click-to-copy email with a "Copied" confirmation ..........................
 *   Awwwards SOTD footer pattern (click-to-copy email).
 * - Ticking local time (Bhubaneswar, IST) ....................................
 *   Awwwards SOTD footer pattern (local time); meermohsin.me footer.
 * - "↑ Back to the start" routed through Lenis .................................
 *   meermohsin.me back-to-top; SmoothScroll's window.__lenis.
 */

import { useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { prefersReducedMotion } from "@/lib/motion/gsap";
import { sound } from "@/lib/audio/sound";
import { TZ } from "./contact";

/* ── local time ──────────────────────────────────────────────────────── */
const fmt =
  typeof Intl !== "undefined"
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: TZ,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : null;
const subscribeClock = (cb: () => void) => {
  const id = window.setInterval(cb, 1000);
  return () => window.clearInterval(id);
};
const readClock = () => (fmt ? fmt.format(new Date()) : "--:--:--");
const serverClock = () => "--:--:--";

export function LocalTime() {
  const time = useSyncExternalStore(subscribeClock, readClock, serverClock);
  return (
    <span className="fn-time mono">
      <span className="fn-time-digits">{time}</span> IST
    </span>
  );
}

/* ── copy email ──────────────────────────────────────────────────────── */
export function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>(0);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      sound.chime(0.8);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.location.href = `mailto:${email}`;
    }
  };

  return (
    <button type="button" className="fn-copy" onClick={copy} data-cursor="copy">
      <span className="fn-copy-text">{email}</span>
      <span className="fn-copy-hint mono" aria-live="polite">
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

/* ── back to the start ───────────────────────────────────────────────── */
type LenisLike = { scrollTo(target: string | number | HTMLElement, o?: { duration?: number }): void };

export function BackToStart() {
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const lenis = (window as unknown as { __lenis?: LenisLike }).__lenis;
    const top = document.getElementById("top");
    if (lenis?.scrollTo) lenis.scrollTo(top ?? 0, { duration: 2.2 });
    else if (top) top.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
    else window.scrollTo(0, 0);
    sound.tick();
  };
  return (
    <a className="fn-back" href="#top" onClick={go}>
      <span aria-hidden="true">↑</span> Back to the start
    </a>
  );
}

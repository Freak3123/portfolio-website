"use client";

/**
 * JourneyHUD — where you are in the story, and how to move through it.
 *
 * Elements, and where each one comes from:
 * - A vertical silk thread at the right edge with a small spider that drops
 *   down / climbs up its dragline as the story progresses ......... Awwwards SOTD progress
 *   indicator (the spider-on-dragline form is the user's theme); line style
 *   from the hero's hairlines (plan/hero.md §13)
 * - Chapter knots on the thread are buttons that fly the camera to
 *   that chapter; label appears on hover / focus ................... Awwwards SOTD map / overview
 *   navigation; meermohsin.me mono uppercase labels
 * - "Scroll / Swipe ↓" hint on the first beat, gone after the first
 *   move ............................................................ meermohsin.me scroll cue
 *
 * Kept clear of SiteNav (top bar) and of the sound toggle (bottom-left).
 * Rendered on the server, shown only in live mode (see journey.css).
 */

import { useEffect, useRef, type CSSProperties } from "react";
import { journey } from "@/lib/journey/journey";
import { LAST_STEP, RANGES, type ChapterId } from "@/lib/journey/chapters";
import { stage } from "@/lib/journey/stage";
import { sound } from "@/lib/audio/sound";

/** eight legs, two body parts, one line weight — the hero's hand, hanging head-down */
function Spider() {
  return (
    <svg className="jh-spider" viewBox="-14 -12 28 28" aria-hidden="true" focusable="false">
      <g className="jh-legs jh-legs--a">
        <path d="M-1.6 0.6 L-6.5 -3.5 L-10.5 1.5" />
        <path d="M-1.8 2 L-7.5 0.5 L-11.5 5" />
        <path d="M1.6 0.6 L6.5 -3.5 L10.5 1.5" />
        <path d="M1.8 2 L7.5 0.5 L11.5 5" />
      </g>
      <g className="jh-legs jh-legs--b">
        <path d="M-1.8 3.4 L-7 5 L-10 10" />
        <path d="M-1.4 4.6 L-5.5 8.5 L-7 13.5" />
        <path d="M1.8 3.4 L7 5 L10 10" />
        <path d="M1.4 4.6 L5.5 8.5 L7 13.5" />
      </g>
      {/* abdomen up (the dragline leaves the spinnerets), head down */}
      <ellipse className="jh-abdomen" cx="0" cy="-3.2" rx="3.4" ry="4.4" />
      <circle className="jh-head" cx="0" cy="3.6" r="2.3" />
    </svg>
  );
}

export default function JourneyHUD() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>("[data-hud-chapter]"));
    let lastP = -1;
    let lastCurrent = "";
    let lastG = journey.g;
    let moving = false;
    let moved = false;
    let stillFor = 0;

    return journey.subscribe((j, dt) => {
      const p = Math.round((j.g / LAST_STEP) * 10000) / 10000;
      if (p !== lastP) {
        el.style.setProperty("--p", String(p));
        lastP = p;
      }
      // legs scuttle while the spider travels, settle when it rests
      const delta = Math.abs(j.g - lastG);
      lastG = j.g;
      stillFor = delta > 1e-4 ? 0 : stillFor + dt;
      const nowMoving = stillFor < 0.12;
      if (nowMoving !== moving) {
        moving = nowMoving;
        el.toggleAttribute("data-moving", moving);
      }
      if (!moved && stage.moved) {
        moved = true;
        el.setAttribute("data-moved", "");
      }
      const current = j.current;
      if (current !== lastCurrent) {
        lastCurrent = current;
        for (const b of buttons) {
          if (b.dataset.hudChapter === current) b.setAttribute("aria-current", "step");
          else b.removeAttribute("aria-current");
        }
      }
    });
  }, []);

  const go = (id: ChapterId) => () => journey.goToChapter(id);

  return (
    <div className="journey-hud" ref={root}>
      <nav className="jh-thread" aria-label="Story chapters">
        <span className="jh-silk" aria-hidden="true" />
        <span className="jh-drag" aria-hidden="true" />
        <ol className="jh-knots">
          {RANGES.map((r) => (
            <li key={r.id} className="jh-knot" style={{ "--at": r.start / LAST_STEP } as CSSProperties}>
              <button
                type="button"
                className="jh-knot-btn"
                data-hud-chapter={r.id}
                aria-label={r.label}
                onClick={go(r.id)}
                onPointerEnter={() => sound.tick()}
                onFocus={() => sound.tick()}
              >
                <span className="jh-dot" aria-hidden="true" />
                <span className="jh-label" aria-hidden="true">
                  {r.label}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <span className="jh-spider-wrap" aria-hidden="true">
          <Spider />
        </span>
      </nav>
      <p className="jh-hint" aria-hidden="true">
        <span className="jh-hint-wheel">Scroll</span>
        <span className="jh-hint-touch">Swipe</span>
        <span className="jh-hint-arrow">↓</span>
        <span className="jh-hint-line" />
      </p>
    </div>
  );
}

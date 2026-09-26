"use client";

/**
 * Sound gate — bottom-left.
 *
 * Elements, and where each one comes from (no element here is original):
 * - "Click anywhere to activate the experience": the first gesture anywhere
 *   turns sound on ...................................... meermohsin.me opening gate
 *   (adapted: it never covers or blocks the hero — the page is fully usable
 *   before, and the triggering click still reaches whatever it landed on)
 * - Sound toggle with animated equaliser bars + mono "Sound on/off" label,
 *   pinned to a bottom corner .......................... Awwwards SOTD sound toggle
 * - Pulsing hint line beside it ......................... meermohsin.me "click anywhere…" prompt
 *
 * Rules:
 * - No audio ever starts without a gesture, even if the stored preference is
 *   "on". A visitor who chose "off" is never switched back on by the gate.
 * - Under reduced motion the click-anywhere gate is off: sound only starts
 *   from the explicit toggle, and the bars do not animate.
 * - No JS: nothing renders (the control cannot work without it).
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { sound } from "@/lib/audio/sound";
import { prefersReducedMotion } from "@/lib/motion/gsap";

const subscribe = (fn: () => void) => sound.onChange(fn);
const getOn = () => sound.enabled;
const getServer = () => false;

export default function SoundGate() {
  const on = useSyncExternalStore(subscribe, getOn, getServer);
  const [ready, setReady] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setReady(true);
      if (sound.preference === "off" || prefersReducedMotion()) return;
      setArmed(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // meermohsin.me: the first gesture anywhere activates the experience.
  // Capture phase so a child that stops propagation (the bulb does) still
  // counts; never preventDefault, so the click does its own job too.
  useEffect(() => {
    if (!armed) return;
    const events = ["pointerdown", "keydown", "touchend"] as const;
    const done = () => {
      events.forEach((t) => window.removeEventListener(t, onGesture, true));
      setArmed(false);
    };
    function onGesture(e: Event) {
      if ((e.target as Element | null)?.closest?.(".sound-gate")) {
        done(); // the toggle itself decides
        return;
      }
      if (e instanceof KeyboardEvent && (e.key === "Escape" || e.key === "Tab" || e.metaKey || e.ctrlKey || e.altKey)) return;
      if (sound.preference === "off") return done();
      sound.enable();
      // pointerdown from touch is not an activation gesture in every browser;
      // stay armed until the context really runs
      requestAnimationFrame(() => {
        if (sound.running) done();
      });
      setTimeout(() => sound.running && done(), 150);
    }
    events.forEach((t) => window.addEventListener(t, onGesture, { capture: true, passive: true }));
    return () => events.forEach((t) => window.removeEventListener(t, onGesture, true));
  }, [armed]);

  return (
    <div className="sound-gate" data-ready={ready ? "1" : "0"} data-on={on ? "1" : "0"}>
      <button
        type="button"
        className="sound-gate-btn"
        aria-pressed={on}
        onClick={() => sound.toggle()}
        data-cursor={on ? "mute" : "listen"}
      >
        <span className="sound-gate-bars" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="sound-gate-label">
          Sound <span className="sound-gate-state">{on ? "on" : "off"}</span>
        </span>
      </button>
      {armed && !on ? (
        <span className="sound-gate-hint" aria-hidden="true">
          click anywhere for sound
        </span>
      ) : null}
    </div>
  );
}

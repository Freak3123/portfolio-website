"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HeroEngine } from "@/lib/hero/engine";
import Ambient from "./Ambient";
import BulbCord from "./BulbCord";
import Filaments from "./Filaments";
import Loader from "./Loader";
import PortraitCanvas from "./PortraitCanvas";

/**
 * Owns the engine, the pointer and the one attribute React actually needs to
 * flip. Nothing in the 60fps path goes through React state.
 */
export default function HeroStage() {
  const [engine] = useState(() => new HeroEngine());
  const host = useRef<HTMLDivElement>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    engine.start();
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __hero?: HeroEngine }).__hero = engine;
    }
    return () => engine.stop();
  }, [engine]);

  // the only thing React re-renders for: the two states swap text colour,
  // ground, and one line of copy — all via a data attribute and CSS
  useEffect(() => {
    document.documentElement.dataset.heroState = engine.state;
    return engine.onChange(() => {
      document.documentElement.dataset.heroState = engine.state;
      // the `pull` affordance has done its job once the cord has been used
      document.documentElement.dataset.heroUsed = "1";
    });
  }, [engine]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const uv = (e: PointerEvent) =>
      engine.toPortrait(e.clientX, e.clientY, el.getBoundingClientRect());

    // the cord owns its own gestures; pressing it must not also tear the layer
    const onCord = (e: PointerEvent) =>
      !!(e.target as Element | null)?.closest?.(".hero-bulb");

    const move = (e: PointerEvent) => engine.pointerMove(uv(e));
    const leave = () => engine.pointerLeave();
    const down = (e: PointerEvent) => {
      if (onCord(e)) return;
      el.setPointerCapture(e.pointerId);
      engine.press(uv(e), e.pointerType === "touch");
      el.dataset.pressed = "1";
      document.documentElement.dataset.heroPeeked = "1";
    };
    const up = (e: PointerEvent) => {
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      engine.release();
      delete el.dataset.pressed;
    };

    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [engine]);

  /* keyboard: the tear is a first-class input, not a mouse-only flourish */
  const keyDown = (e: React.KeyboardEvent) => {
    const step = 0.05;
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        engine.keyOpen(engine.radius < 0.01);
        break;
      case "Escape":
        engine.keyOpen(false);
        break;
      case "ArrowLeft":
        e.preventDefault();
        engine.keyNudge(-step, 0);
        break;
      case "ArrowRight":
        e.preventDefault();
        engine.keyNudge(step, 0);
        break;
      case "ArrowUp":
        e.preventDefault();
        engine.keyNudge(0, -step);
        break;
      case "ArrowDown":
        e.preventDefault();
        engine.keyNudge(0, step);
        break;
    }
  };

  const onLoaderDone = useCallback(() => {
    document.documentElement.dataset.heroReady = "1";
  }, []);

  return (
    <div
      ref={host}
      className="hero-stage"
      data-canvas={canvasReady ? "1" : "0"}
      tabIndex={0}
      role="img"
      aria-label="Portrait of Ashreeta Patra. Two versions of the same picture. Press Enter to open a window onto the other one, arrow keys to move it, Escape to close. The light cord swaps them completely."
      onKeyDown={keyDown}
      // React's onBlur is focusout, which bubbles — so a child losing focus (the
      // light's button lives in here) would fire this too, and cancel a peek the
      // instant a press started. Only react when focus actually leaves the stage.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          engine.keyOpen(false);
        }
      }}
    >
      <PortraitCanvas engine={engine} onReady={() => setCanvasReady(true)} />
      <Ambient engine={engine} />
      <Filaments engine={engine} />
      <BulbCord engine={engine} />
      <Loader onDone={onLoaderDone} />
    </div>
  );
}

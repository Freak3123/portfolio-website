"use client";

/**
 * "Draw here." — a translucent glass board the visitor can draw, stamp and
 * sketch shapes on.
 *
 * Elements + reference sources:
 * - Draw-on-canvas playful interaction ......................................
 *   Awwwards SOTD pattern (draw-on-canvas toy); literally what Brawer is.
 * - Strokes rendered as wobbly silk lines, round caps, doubled pass ..........
 *   the hero's warm doodle line + lib/web/draw.ts warm grammar ("the same
 *   strands but wobbly"). Inks are the scene palette only: ink, white, umber.
 * - Stamp tray (star, heart, spiderweb, butterfly, spiral, flower) — pick one,
 *   click to press it onto the page, it pops in with a squash-and-stretch ....
 *   Codrops "Building an Interactive Digital Stamp Collection with Shaders,
 *   Postcards and Playful Inspection" (draggable stamps, playful inspection);
 *   squash-and-stretch is the classic animation principle (Disney's 12).
 * - Circle / line / triangle, drag to size ...................................
 *   standard drawing-app shape tools, inked with the same hand wobble.
 * - Glass board (tint + backdrop-filter blur/saturate, inner sheen) ..........
 *   glassmorphism panel pattern common across Awwwards sites (styles in
 *   app/journey/creative.css → .cr-pad). The canvas stays transparent.
 * - Soft pluck on each new stroke / shape, a soft bell per stamp ............
 *   lib/audio/sound.ts silk pluck + FM chime (the site's own vocabulary).
 *
 * Accessibility: the toolbar is a real role="toolbar" of buttons with
 * aria-pressed; with a stamp selected, Enter/Space on the focused canvas
 * presses it at a random spot; Ctrl/⌘+Z undoes. Touch drawing does not leak
 * into the journey's swipe navigation (touch-action none, data-journey-free,
 * propagation stopped). The marks are published to creative/board so the
 * butterflies can land on them.
 */

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type SyntheticEvent } from "react";
import { rng, type Pt } from "@/lib/web/draw";
import { sound } from "@/lib/audio/sound";
import { prefersReducedMotion } from "@/lib/motion/gsap";
import { board } from "./board";
import { INKS, STAMPS, type InkId, type StampId } from "./marks";

type ShapeId = "circle" | "line" | "triangle";
type Mode = "brush" | "stamp" | "shape";

type Stroke = { kind: "stroke"; pts: Pt[]; seed: number; ink: string };
type Shape = { kind: "shape"; shape: ShapeId; a: Pt; b: Pt; seed: number; ink: string };
type Stamp = { kind: "stamp"; stamp: StampId; x: number; y: number; size: number; rot: number; seed: number; ink: string; born: number };
type Item = Stroke | Shape | Stamp;

const POP = 0.9; // seconds a stamp takes to settle
const SHAPES: { id: ShapeId; label: string; icon: string }[] = [
  { id: "circle", label: "Circle", icon: "M20 12 A8 8 0 1 0 4 12 A8 8 0 1 0 20 12" },
  { id: "line", label: "Line", icon: "M5 19 L19 5" },
  { id: "triangle", label: "Triangle", icon: "M12 4.5 L20 19 L4 19 Z" },
];
const BRUSH_ICON = "M4 18 C6 11 9 16 12 10 C14.5 5.5 17 9 20 5";
const inkHex = (id: InkId) => INKS.find((i) => i.id === id)!.hex;

/** hex → rgba() with alpha */
const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** a shape as a polyline, so it gets the same wobbly double line as a stroke */
function shapePts(s: Shape): Pt[] {
  const { a, b } = s;
  const seg = (p: Pt, q: Pt, n: number, out: Pt[]) => {
    for (let i = out.length ? 1 : 0; i <= n; i++) out.push({ x: p.x + ((q.x - p.x) * i) / n, y: p.y + ((q.y - p.y) * i) / n });
    return out;
  };
  if (s.shape === "line") return seg(a, b, 16, []);
  if (s.shape === "circle") {
    const r = Math.hypot(b.x - a.x, b.y - a.y);
    const pts: Pt[] = [];
    for (let i = 0; i <= 56; i++) {
      const t = (i / 56) * Math.PI * 2;
      pts.push({ x: a.x + Math.cos(t) * r, y: a.y + Math.sin(t) * r });
    }
    return pts;
  }
  const top = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) };
  const bl = { x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) };
  const br = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
  const out: Pt[] = [];
  seg(top, br, 14, out);
  seg(br, bl, 14, out);
  seg(bl, top, 14, out);
  return out;
}

export default function DrawPad() {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const items = useRef<Item[]>([]);
  const api = useRef<{ undo: () => void; clear: () => void; stampAt: (x: number, y: number) => void }>({
    undo: () => {},
    clear: () => {},
    stampAt: () => {},
  });

  const [mode, setMode] = useState<Mode>("brush");
  const [stamp, setStamp] = useState<StampId>("star");
  const [shape, setShape] = useState<ShapeId>("circle");
  const [ink, setInk] = useState<InkId>("ink");
  const [count, setCount] = useState(0);
  const tool = useRef({ mode, stamp, shape, ink });
  useEffect(() => {
    tool.current = { mode, stamp, shape, ink };
  }, [mode, stamp, shape, ink]);

  useEffect(() => {
    const cv = canvas.current;
    const box = root.current;
    if (!cv || !box) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const reduced = prefersReducedMotion();
    const paths = new Map(STAMPS.map((s) => [s.id, new Path2D(s.d)]));
    let dpr = 1;
    let raf = 0;

    const line = (pts: Pt[], seed: number, hex: string) => {
      if (!pts.length) return;
      // two passes, the second slightly offset and thinner: a hand-drawn
      // double line, the way the art's doodles are inked
      for (let pass = 0; pass < 2; pass++) {
        const r = rng(seed + pass * 97);
        const off = pass ? 1.4 : 0;
        ctx.beginPath();
        ctx.strokeStyle = pass ? alpha(hex, 0.55) : hex;
        ctx.lineWidth = pass ? 1.2 : 3;
        const j = (p: Pt) => ({ x: p.x + off + (r() - 0.5) * 1.6, y: p.y + off + (r() - 0.5) * 1.6 });
        const p0 = j(pts[0]);
        ctx.moveTo(p0.x, p0.y);
        if (pts.length === 1) ctx.lineTo(p0.x + 0.1, p0.y + 0.1);
        let prev = p0;
        for (let i = 1; i < pts.length; i++) {
          const p = j(pts[i]);
          ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + p.x) / 2, (prev.y + p.y) / 2);
          prev = p;
        }
        ctx.lineTo(prev.x, prev.y);
        ctx.stroke();
      }
    };

    /** squash-and-stretch pop: overall scale overshoots and rings in, while
     *  x and y trade volume (sx·sy ≈ s²) */
    const popScale = (born: number, now: number) => {
      if (reduced) return { sx: 1, sy: 1, done: true };
      const t = (now - born) / 1000;
      if (t >= POP) return { sx: 1, sy: 1, done: true };
      const s = 1 - Math.exp(-9 * t) * Math.cos(16 * t);
      const q = 0.32 * Math.exp(-7 * t) * Math.sin(20 * t);
      return { sx: s * (1 + q), sy: s * (1 - q), done: false };
    };

    const paint = () => {
      const now = performance.now();
      let animating = false;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const it of items.current) {
        // white must hold on the pale glass: a soft umber shadow under it
        ctx.shadowColor = it.ink === "#FFFFFF" ? "rgba(90,58,10,0.45)" : "transparent";
        ctx.shadowBlur = it.ink === "#FFFFFF" ? 3 : 0;
        if (it.kind === "stroke") line(it.pts, it.seed, it.ink);
        else if (it.kind === "shape") line(shapePts(it), it.seed, it.ink);
        else {
          const { sx, sy, done } = popScale(it.born, now);
          if (!done) animating = true;
          if (sx <= 0.001 || sy <= 0.001) continue;
          const k = it.size / 24;
          for (let pass = 0; pass < 2; pass++) {
            ctx.save();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.translate(it.x + (pass ? 1.2 : 0), it.y + (pass ? 1.2 : 0));
            ctx.rotate(it.rot);
            // squash towards the page: scale about the stamp's foot
            ctx.translate(0, 12 * k);
            ctx.scale(sx * k, sy * k);
            ctx.translate(0, -12);
            ctx.lineWidth = (pass ? 1 : 2.4) / k;
            ctx.strokeStyle = pass ? alpha(it.ink, 0.5) : it.ink;
            ctx.stroke(paths.get(it.stamp)!);
            ctx.restore();
          }
        }
      }
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";
      return animating;
    };
    const frame = () => {
      raf = paint() ? requestAnimationFrame(frame) : 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(cv.clientWidth * dpr);
      cv.height = Math.round(cv.clientHeight * dpr);
      paint();
    };
    const ro = new ResizeObserver(size);
    ro.observe(cv);
    size();

    const push = (it: Item) => {
      items.current.push(it);
      setCount(items.current.length);
    };
    const placeStamp = (x: number, y: number) => {
      const t = tool.current;
      const s = Math.min(64, Math.max(34, cv.clientWidth * 0.1));
      push({
        kind: "stamp",
        stamp: t.stamp,
        x,
        y,
        size: s * (0.85 + Math.random() * 0.3),
        rot: (Math.random() - 0.5) * 0.7,
        seed: (Math.random() * 1e9) | 0,
        ink: inkHex(t.ink),
        born: performance.now(),
      });
      sound.chime(0.25 + (1 - y / Math.max(1, cv.clientHeight)) * 0.6);
      kick();
      if (reduced) paint();
    };

    let active: Stroke | Shape | null = null;
    const at = (e: PointerEvent): Pt => {
      const b = cv.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    const down = (e: PointerEvent) => {
      if (e.button > 0) return;
      e.preventDefault();
      const p = at(e);
      const t = tool.current;
      if (t.mode === "stamp") {
        placeStamp(p.x, p.y);
        return;
      }
      cv.setPointerCapture(e.pointerId);
      const seed = (Math.random() * 1e9) | 0;
      active =
        t.mode === "brush"
          ? { kind: "stroke", pts: [p], seed, ink: inkHex(t.ink) }
          : { kind: "shape", shape: t.shape, a: p, b: p, seed, ink: inkHex(t.ink) };
      push(active);
      sound.pluck({ pitch: 1 - p.y / Math.max(1, cv.clientHeight), gain: 0.35 });
      paint();
    };
    const move = (e: PointerEvent) => {
      if (!active) return;
      const p = at(e);
      if (active.kind === "stroke") {
        const last = active.pts[active.pts.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) < 2.5) return;
        active.pts.push(p);
      } else active.b = p;
      paint();
    };
    const up = () => {
      // a click with a shape tool makes nothing, not a dot
      if (active?.kind === "shape" && Math.hypot(active.b.x - active.a.x, active.b.y - active.a.y) < 4) {
        items.current = items.current.filter((i) => i !== active);
        setCount(items.current.length);
        paint();
      }
      active = null;
    };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);

    api.current = {
      undo: () => {
        if (!items.current.length) return;
        items.current = items.current.slice(0, -1);
        setCount(items.current.length);
        paint();
        sound.tick();
      },
      clear: () => {
        items.current = [];
        setCount(0);
        paint();
        sound.tick();
      },
      stampAt: placeStamp,
    };

    /* perches for the butterflies */
    board.el = box;
    board.canvas = cv;
    board.sample = () => {
      const list = items.current;
      if (!list.length) return null;
      const it = list[Math.floor(Math.random() * list.length)];
      if (it.kind === "stamp") return { key: it, x: it.x, y: it.y - it.size * 0.3 };
      const pts = it.kind === "stroke" ? it.pts : shapePts(it);
      const p = pts[Math.floor(Math.random() * pts.length)];
      return { key: it, x: p.x, y: p.y };
    };
    board.has = (key) => items.current.includes(key as Item);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", up);
      board.el = null;
      board.canvas = null;
      board.sample = () => null;
      board.has = () => false;
    };
  }, []);

  const stop = (e: SyntheticEvent) => e.stopPropagation();

  const onCanvasKey = (e: ReactKeyboardEvent<HTMLCanvasElement>) => {
    if ((e.key === "Enter" || e.key === " ") && mode === "stamp") {
      e.preventDefault();
      const cv = e.currentTarget;
      api.current.stampAt(cv.clientWidth * (0.15 + Math.random() * 0.7), cv.clientHeight * (0.2 + Math.random() * 0.65));
    }
  };
  const onPadKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      api.current.undo();
    }
  };

  const pick = (m: Mode, fn?: () => void) => {
    setMode(m);
    fn?.();
    sound.tick();
  };
  const label =
    mode === "brush"
      ? "Drawing board. Draw with a mouse, pen or finger."
      : mode === "stamp"
        ? `Drawing board, ${STAMPS.find((s) => s.id === stamp)!.label.toLowerCase()} stamp selected. Click to press it, or press Enter.`
        : `Drawing board, ${shape} tool selected. Drag to size the shape.`;

  return (
    <div ref={root} className="cr-pad" data-journey-free onTouchStart={stop} onTouchMove={stop} onKeyDown={onPadKey}>
      <div className="cr-pad-tools" role="toolbar" aria-label="Drawing tools">
        <button
          type="button"
          className="cr-tool"
          aria-pressed={mode === "brush"}
          aria-label="Brush"
          title="Brush"
          onClick={() => pick("brush")}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={BRUSH_ICON} />
          </svg>
        </button>
        <span className="cr-tool-sep" aria-hidden="true" />
        {STAMPS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="cr-tool"
            aria-pressed={mode === "stamp" && stamp === s.id}
            aria-label={`${s.label} stamp`}
            title={`${s.label} stamp`}
            onClick={() => pick("stamp", () => setStamp(s.id))}
          >
            <svg viewBox="-13 -13 26 26" aria-hidden="true">
              <path d={s.d} />
            </svg>
          </button>
        ))}
        <span className="cr-tool-sep" aria-hidden="true" />
        {SHAPES.map((s) => (
          <button
            key={s.id}
            type="button"
            className="cr-tool"
            aria-pressed={mode === "shape" && shape === s.id}
            aria-label={s.label}
            title={s.label}
            onClick={() => pick("shape", () => setShape(s.id))}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={s.icon} />
            </svg>
          </button>
        ))}
      </div>

      <canvas
        ref={canvas}
        className="cr-pad-canvas"
        role="img"
        tabIndex={0}
        aria-label={label}
        data-cursor="draw"
        data-mode={mode}
        onKeyDown={onCanvasKey}
      />

      <div className="cr-pad-foot">
        <div className="cr-inks" role="group" aria-label="Ink colour">
          {INKS.map((i) => (
            <button
              key={i.id}
              type="button"
              className="cr-ink"
              style={{ background: i.hex }}
              aria-pressed={ink === i.id}
              aria-label={`${i.label} ink`}
              title={`${i.label} ink`}
              onClick={() => {
                setInk(i.id);
                sound.tick();
              }}
            />
          ))}
        </div>
        <div className="cr-pad-actions">
          <button type="button" className="cr-pad-btn" onClick={() => api.current.undo()} disabled={!count}>
            Undo
          </button>
          <button type="button" className="cr-pad-btn" onClick={() => api.current.clear()} disabled={!count}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

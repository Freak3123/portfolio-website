"use client";

/**
 * Drives the creative chapter from the journey clock, and paints the way into
 * it. Renders one canvas (the dissolve); no React state per frame.
 *
 * The crossing, in order: the camera follows a thread across the world web
 * (WebCanvas: the travelled silk glows hot, its head flares) → where the head
 * is, the other side starts to show through → a noise-dissolve front spreads
 * out from it, its edge burning bright, silk flecks lifting off the edge →
 * the warm world is all that is left. Scrubbed both ways by the wheel.
 *
 * Elements + reference sources:
 * - Two worlds composited through a mask (the cold world web behind, the warm
 *   saffron world in front, a per-pixel mask between them) ....................
 *   Codrops "Composite Rendering: The Brilliance Behind Inspiring WebGL
 *   Transitions" (2026/02/23, Aircord / Garden Eight) — here the mask is a
 *   low-res field rendered to a canvas and upscaled (the "render target").
 * - Noise-threshold dissolve with a glowing edge band, particles emitted at
 *   the edge that drift and fade ..............................................
 *   Codrops "Implementing a Dissolve Effect with Shaders and Particles"
 *   (2025/02/17): value = noise, discard below threshold, emissive band
 *   `threshold - value < edgeWidth`, particles spawned on the band — ported
 *   from GLSL to a per-cell loop on Canvas2D ImageData.
 * - The front radiates from the head of the thread being followed ..........
 *   the same dissolve, with distance-from-origin mixed into the noise so the
 *   reveal has a direction (Composite Rendering's "mask that travels").
 * - The web's strands redrawn as white doodle-lines, drawn on as it lands ...
 *   user's spider/web theme in the hero's warm doodle vocabulary.
 *
 * Writes on #creative: --cr-wipe (reveal 0…1), --cr-draw, --cr-s0, --cr-s1
 * and the visibility of each step group (the same contract as before).
 */

import { useEffect, useRef } from "react";
import { journey } from "@/lib/journey/journey";
import { spinePieces } from "@/lib/journey/travel";
import { spineLength, spinePoint, world } from "@/lib/web/world";
import { rng } from "@/lib/web/draw";
import { sound } from "@/lib/audio/sound";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** css px per mask cell — the upscale's own smoothing softens the front */
const CELL = 6;
/** width of the burning edge, in field units */
const BAND = 0.075;
/** how much of the field is noise (the rest is distance from the thread's head) */
const NOISE = 0.42;
const MAX_FLECKS = 240;

type Fleck = { x: number; y: number; vx: number; vy: number; life: number; age: number; len: number; ink: boolean };

/** value noise, 3 octaves, 0…1 — computed once per resize */
function fieldNoise(gw: number, gh: number, seed: number) {
  const r = rng(seed);
  const G = 64;
  const lattice = new Float32Array(G * G);
  for (let i = 0; i < lattice.length; i++) lattice[i] = r();
  const at = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const i00 = lattice[(((yi % G) + G) % G) * G + (((xi % G) + G) % G)];
    const i10 = lattice[(((yi % G) + G) % G) * G + ((((xi + 1) % G) + G) % G)];
    const i01 = lattice[((((yi + 1) % G) + G) % G) * G + (((xi % G) + G) % G)];
    const i11 = lattice[((((yi + 1) % G) + G) % G) * G + ((((xi + 1) % G) + G) % G)];
    return (i00 + (i10 - i00) * sx) * (1 - sy) + (i01 + (i11 - i01) * sx) * sy;
  };
  const out = new Float32Array(gw * gh);
  const base = 0.045; // lattice cells per mask cell at the first octave
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let v = 0;
      let amp = 0.55;
      let fq = base;
      for (let o = 0; o < 3; o++) {
        v += at(x * fq + o * 17.3, y * fq + o * 9.1) * amp;
        amp *= 0.5;
        fq *= 2.1;
      }
      out[y * gw + x] = v / 0.9625;
    }
  }
  return out;
}

/** any CSS colour → [r, g, b] */
function rgbOf(color: string): [number, number, number] {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const x = c.getContext("2d");
  if (!x) return [253, 191, 40];
  x.fillStyle = "#fdbf28";
  x.fillStyle = color || "#fdbf28";
  x.fillRect(0, 0, 1, 1);
  const d = x.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

export default function CreativeDirector() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const scene = document.getElementById("creative");
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!scene || !canvas || !ctx) return;
    const wash = scene.querySelector<HTMLElement>(".cr-wash");
    const s0 = scene.querySelector<HTMLElement>(".cr-s0");
    const s1 = scene.querySelector<HTMLElement>(".cr-s1");
    const W = world();

    /* ── the mask's render target: a small canvas, upscaled ───────────── */
    const small = document.createElement("canvas");
    const sctx = small.getContext("2d");
    let img: ImageData | null = null;
    let noise = new Float32Array(1);
    let gw = 1;
    let gh = 1;
    let w = 1;
    let h = 1;
    let dpr = 1;
    const resize = () => {
      w = Math.max(1, canvas.clientWidth);
      h = Math.max(1, canvas.clientHeight);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gw = Math.ceil(w / CELL) + 1;
      gh = Math.ceil(h / CELL) + 1;
      small.width = gw;
      small.height = gh;
      img = sctx ? sctx.createImageData(gw, gh) : null;
      noise = fieldNoise(gw, gh, 4177);
      painted = -1;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let warmRGB: [number, number, number] = [253, 191, 40];
    let ink = "#0a101a";
    const readColors = () => {
      const cs = getComputedStyle(scene);
      warmRGB = rgbOf(cs.getPropertyValue("--ground").trim());
      ink = cs.getPropertyValue("--ink").trim() || ink;
    };
    readColors();

    const flecks: Fleck[] = [];
    const fr = rng(99);
    let t = 0;
    let lastP = -1;
    let armed = true;
    let painted = -1;
    let prevReveal = 0;
    let settled = true;
    resize();

    const origin = { x: 0, y: 0 };
    const locate = () => {
      // the head of the thread being followed, where WebCanvas draws it
      const sp = W.spine;
      const tip = spinePoint(sp, spineLength(sp, spinePieces(journey.g), 1));
      const s = journey.worldToScreen(tip.x, tip.y);
      origin.x = s.x;
      origin.y = s.y;
    };

    /** paint the composite mask for `p` into the small canvas; spawn flecks on its edge */
    const paintMask = (p: number, spawn: number) => {
      if (!img || !sctx) return;
      const data = img.data;
      const ox = origin.x / CELL;
      const oy = origin.y / CELL;
      const far = Math.max(
        Math.hypot(ox, oy),
        Math.hypot(gw - ox, oy),
        Math.hypot(ox, gh - oy),
        Math.hypot(gw - ox, gh - oy),
      );
      const inv = 1 / far;
      // threshold sweeps past both ends so 0 and 1 are clean
      const T = -BAND + p * (1 + 2 * BAND);
      const [wr, wg, wb] = warmRGB;
      const drift = t * 0.02;
      for (let y = 0; y < gh; y++) {
        const dy = y - oy;
        for (let x = 0; x < gw; x++) {
          const i = y * gw + x;
          const dx = x - ox;
          const n = noise[i];
          const v = (1 - NOISE) * Math.sqrt(dx * dx + dy * dy) * inv + NOISE * (n + Math.sin(drift + n * 6) * 0.02);
          const k = i * 4;
          if (v < T - BAND) {
            data[k] = wr;
            data[k + 1] = wg;
            data[k + 2] = wb;
            data[k + 3] = 255;
          } else if (v < T) {
            // the burning edge: white-hot at the front, cooling into saffron
            const e = (T - v) / BAND;
            data[k] = 255 + (wr - 255) * e;
            data[k + 1] = 255 + (wg - 255) * e;
            data[k + 2] = 255 + (wb - 255) * e;
            data[k + 3] = 255 * (0.35 + 0.65 * e);
          } else {
            data[k + 3] = 0;
          }
        }
      }
      sctx.putImageData(img, 0, 0);

      // particles on the band (the reference's edge emitters)
      let tries = spawn > 0 ? 90 : 0;
      let made = 0;
      while (tries-- > 0 && made < spawn && flecks.length < MAX_FLECKS) {
        const x = Math.floor(fr() * gw);
        const y = Math.floor(fr() * gh);
        const i = y * gw + x;
        const v = (1 - NOISE) * Math.hypot(x - ox, y - oy) * inv + NOISE * noise[i];
        if (v < T - BAND || v >= T) continue;
        const ang = Math.atan2(y - oy, x - ox) + (fr() - 0.5) * 1.4;
        const sp = 18 + fr() * 50;
        flecks.push({
          x: x * CELL,
          y: y * CELL,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp - 22,
          life: 1 + fr() * 1.3,
          age: 0,
          len: 4 + fr() * 10,
          ink: fr() < 0.35,
        });
        made++;
      }
    };

    const clearCanvas = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const off = journey.subscribe((j, dt) => {
      if (!j.live) return;
      const f = j.frame("creative");
      if (f.presence <= 0 && lastP <= 0 && settled) return;
      t += dt;
      lastP = f.presence;

      const reveal = j.warmth; // otherSide(presence), see lib/journey/journey.ts
      const moving = Math.abs(reveal - prevReveal) > 1e-4;
      const rate = Math.abs(reveal - prevReveal) / Math.max(dt, 1e-3);
      prevReveal = reveal;

      /* ── the composite ───────────────────────────────────────────── */
      if (reveal >= 0.999) {
        // fully across: the plain saffron ground takes over
        if (wash) wash.style.clipPath = "none";
      } else if (wash) {
        wash.style.clipPath = "";
      }
      const drawMask = reveal > 0.001 && reveal < 0.999;
      if (drawMask) {
        locate();
        const spawn = moving ? Math.min(8, 1 + Math.round(rate * 14)) : 0;
        paintMask(reveal, spawn);
        painted = reveal;
      }

      // age the flecks even at rest so none hang in mid-air
      for (let i = flecks.length - 1; i >= 0; i--) {
        const p = flecks[i];
        p.age += dt;
        if (p.age >= p.life) {
          flecks.splice(i, 1);
          continue;
        }
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 - 6 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      if (!drawMask && flecks.length === 0) {
        if (!settled) {
          clearCanvas();
          settled = true;
          painted = -1;
        }
      } else {
        settled = false;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        if (drawMask && painted >= 0) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.globalAlpha = 1;
          ctx.drawImage(small, 0, 0, gw * CELL, gh * CELL);
        }
        ctx.lineCap = "round";
        ctx.lineWidth = 1.1;
        for (const p of flecks) {
          const life = 1 - p.age / p.life;
          const sp = Math.hypot(p.vx, p.vy) || 1;
          ctx.globalAlpha = life * life * 0.9;
          ctx.strokeStyle = p.ink ? ink : "#ffffff";
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.quadraticCurveTo(
            p.x - (p.vx / sp) * p.len * 0.5 + Math.sin(t * 5 + p.len) * 2,
            p.y - (p.vy / sp) * p.len * 0.5,
            p.x - (p.vx / sp) * p.len,
            p.y - (p.vy / sp) * p.len,
          );
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // one soft pluck as the other side opens (never on load — sound is gated)
      if (armed && reveal > 0.05 && f.local < 0) {
        armed = false;
        sound.pluck({ pitch: 0.75, gain: 0.5 });
      }
      if (f.presence <= 0.01) armed = true;

      const gate = smooth(0.55, 0.95, f.presence);
      const a0 = gate * clamp01(1 - Math.abs(f.local) * 1.6);
      const a1 = gate * clamp01(1 - Math.abs(f.local - 1) * 1.6);
      scene.style.setProperty("--cr-wipe", reveal.toFixed(3));
      scene.style.setProperty("--cr-draw", smooth(0.45, 1, f.presence).toFixed(3));
      scene.style.setProperty("--cr-s0", a0.toFixed(3));
      scene.style.setProperty("--cr-s1", a1.toFixed(3));
      if (s0) s0.style.visibility = a0 > 0.02 ? "visible" : "hidden";
      if (s1) s1.style.visibility = a1 > 0.02 ? "visible" : "hidden";
    });

    const mo = new MutationObserver(readColors);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-hero-state"] });

    return () => {
      off();
      ro.disconnect();
      mo.disconnect();
      clearCanvas();
      if (wash) wash.style.clipPath = "";
      if (s0) s0.style.visibility = "";
      if (s1) s1.style.visibility = "";
      for (const k of ["--cr-wipe", "--cr-draw", "--cr-s0", "--cr-s1"]) scene.style.removeProperty(k);
    };
  }, []);

  return <canvas ref={ref} className="cr-dissolve" aria-hidden="true" />;
}

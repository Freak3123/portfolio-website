"use client";

import { useEffect, useRef } from "react";
import type { HeroEngine } from "@/lib/hero/engine";
import {
  markPaths,
  sizeCanvas,
  trackPointer,
  warmth,
  watchHeroState,
  watchOnScreen,
  webPerches,
  type Pointer,
} from "./heroEnv";
import { buildWeb, pluck, rng, settle, stepWeb, type Particle, type Web } from "./verlet";

/**
 * Webs in the top corners, after Subprotocol's Verlet Spiderweb: a verlet mesh
 * of spokes and catching threads, pinned to the walls, that the cursor plucks
 * as it passes and that springs back on its own (see ./verlet).
 *
 * One mesh, two hands. The physics is shared so the crossfade between states
 * is a change of ink, not two webs swapping:
 *
 *   cold  hairlines — paper spokes, saffron rings, straight segments, a regular
 *         spiral. Dew on a few crossings catches the light now and then. The
 *         air barely moves; the web breathes.
 *   warm  ink, drawn: each point nudged off the true ring, the rings sagging
 *         toward the hub the way a cartoon cobweb does, a few of the art's own
 *         hearts and stars caught in it, and more wind.
 *
 * Everything stays in the top ~40% of the stage and clear of her head: the
 * canvas itself is only that tall, the top-right web is narrowed so the lamp's
 * cord never runs through it, and the small ceiling web only appears where
 * there is room between the corner web and the portrait.
 */

type Dew = { p: Particle; ph: number; r: number };
type Caught = { p: Particle; mark: number; colour: string; rot: number; s: number };
type Corner = { web: Web; hub: Particle; seed: number; dew: Dew[]; caught: Caught[]; spider: boolean };
type Spider = {
  web: number;
  anchor: Particle | null;
  len: number;
  /** climbing back is quicker when something startled it */
  rate: number;
  max: number;
  phase: "idle" | "down" | "hang" | "up";
  t: number;
  wait: number;
};

/** wind, px per frame² — cold is a draught, warm is a breeze */
const WIND = { cold: 0.03, warm: 0.1 };
const GRAVITY = 0.02;
const STEP = 1 / 60;
/** only the hand-drawn state catches things — ink and the sweater's colours */
const CAUGHT_COLOURS = ["#0A101A", "#C83B2E", "#39AEB0", "#8C4A1E", "#FFFFFF"];
const COLD_SPOKE = "rgba(243, 239, 231, 0.26)";
const COLD_RING = "rgba(253, 191, 40, 0.4)";
const INK = "rgba(10, 16, 26, 0.6)";

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function layout(w: number, h: number, bulbX: number, portraitX: number): Corner[] {
  const narrow = w < 700;
  const R = narrow ? Math.min(110, Math.max(64, w * 0.26)) : Math.min(250, Math.max(110, w * 0.17));
  const r = Math.min(R, h * 0.78);
  const spokes = narrow ? 6 : 8;
  const rings = narrow ? 5 : 7;
  const out: Corner[] = [];
  const add = (spec: Parameters<typeof buildWeb>[0], spider: boolean) => {
    const web = buildWeb(spec);
    settle(web, GRAVITY, 240);
    const rnd = rng(spec.seed + 7);
    const dew: Dew[] = [];
    const caught: Caught[] = [];
    for (const p of web.ps) {
      if (p.pin) continue;
      if (rnd() < 0.2) dew.push({ p, ph: rnd() * Math.PI * 2, r: 0.8 + rnd() * 0.8 });
    }
    // two or three doodles, snagged on the outer rings where there is room
    const n = narrow ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const s = 1 + Math.floor(rnd() * (web.spokes - 2));
      const ring = Math.max(2, web.rings - 1 - Math.floor(rnd() * 3));
      caught.push({
        p: web.grid[s][ring],
        mark: [0, 1, 0, 3][Math.floor(rnd() * 4)],
        colour: CAUGHT_COLOURS[Math.floor(rnd() * CAUGHT_COLOURS.length)],
        rot: (rnd() - 0.5) * 1.2,
        s: 0.8 + rnd() * 0.35,
      });
    }
    out.push({ web, hub: web.grid[0][0], seed: spec.seed, dew, caught, spider });
  };

  // top-left: a quarter fan off both walls
  add({ hx: 1, hy: 1, a0: 0.035, a1: Math.PI / 2 - 0.035, rx: r * 1.05, ry: r * 0.92, spokes, rings, seed: 11 }, true);

  // top-right: kept right of the lamp's cord, so it runs further down the wall
  const room = w - bulbX - 26;
  const rxR = Math.max(narrow ? 52 : 70, Math.min(r, room));
  add(
    {
      hx: w - 1,
      hy: 1,
      a0: Math.PI / 2 + 0.035,
      a1: Math.PI - 0.035,
      rx: rxR,
      ry: Math.min(h * 0.85, r * (rxR < r * 0.8 ? 1.15 : 0.95)),
      spokes,
      rings,
      seed: 29,
    },
    true,
  );

  // a small half-web on the ceiling, only where it fits between the corner web
  // and the portrait — never over the art itself
  const gapL = r * 1.05 + 20;
  const gapR = portraitX - 16;
  const half = (gapR - gapL) / 2;
  if (!narrow && half > 44) {
    const rr = Math.min(half, r * 0.55);
    add(
      {
        hx: (gapL + gapR) / 2,
        hy: 1,
        a0: 0.03,
        a1: Math.PI - 0.03,
        rx: rr,
        ry: rr * 0.78,
        spokes: 7,
        rings: 4,
        seed: 47,
      },
      false,
    );
  }
  return out;
}

export default function CornerWebs({ engine }: { engine: HeroEngine }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !host || !ctx) return;

    const reduced = engine.reduced;
    const ptr: Pointer = { x: 0, y: 0, vx: 0, vy: 0, on: false, last: 0 };
    let w = 0;
    let h = 0;
    let dpr = 1;
    let corners: Corner[] = [];
    let key = "";
    let onScreen = true;
    let dirty = true;
    let acc = 0;
    let t = 0;
    const spider: Spider = {
      web: 0,
      anchor: null,
      len: 0,
      max: 0,
      phase: "idle",
      t: 0,
      wait: 6,
      rate: 1,
    };
    const rnd = rng(20260927);

    // the fixed nav's name sits over the top-left web; keep the threads off it
    let brand: DOMRect | null = null;
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      dpr = sizeCanvas(canvas, w, h);
      brand = document.querySelector(".site-nav-brand")?.getBoundingClientRect() ?? null;
      key = "";
      dirty = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const relayout = () => {
      const { fit, bulbPos } = engine;
      const ready = fit.w > 1;
      const bulbX = ready ? fit.x + bulbPos.x * fit.w : w * 0.87;
      const portraitX = ready ? fit.x : w * 0.3;
      const k = `${w}|${h}|${Math.round(bulbX)}|${Math.round(portraitX)}`;
      if (k === key || w < 2 || h < 2) return;
      key = k;
      corners = layout(w, h, bulbX, portraitX);
      // the perches a butterfly can take: mid-web, off the pinned edges
      webPerches.length = 0;
      corners.forEach((c) => {
        const g = c.web.grid;
        const mid = Math.floor(c.web.spokes / 2);
        webPerches.push(g[mid][c.web.rings - 1], g[mid - 1][c.web.rings - 2], g[mid + 1][c.web.rings - 2]);
      });
      spider.phase = "idle";
      spider.len = 0;
      spider.anchor = null;
      dirty = true;
    };

    const physics = (mix: number) => {
      const A = WIND.cold + (WIND.warm - WIND.cold) * mix;
      // gusts: the breeze comes and goes rather than holding one pressure
      const gust = 0.55 + 0.45 * Math.sin(t * 0.23) * Math.sin(t * 0.61 + 1);
      const breathe = Math.sin(t * 0.9) * 0.00025 * (1 - mix);
      for (const c of corners) {
        const hub = c.hub;
        stepWeb(c.web, {
          gravity: GRAVITY,
          damping: 0.985,
          iterations: 2,
          home: 0.006,
          force: (p, o) => {
            o.x =
              A * gust * (Math.sin(t * 0.7 + p.hy * 0.01 + c.seed) + 0.5 * Math.sin(t * 1.9 + p.hx * 0.02)) +
              (p.hx - hub.x) * breathe;
            o.y = A * gust * 0.4 * Math.sin(t * 1.1 + p.hx * 0.013 + c.seed) + (p.hy - hub.y) * breathe;
          },
        });
        if (ptr.on) pluck(c.web, ptr.x, ptr.y, ptr.vx, ptr.vy, w < 700 ? 38 : 46);
      }
      ptr.vx *= 0.85;
      ptr.vy *= 0.85;
    };

    /* the spider: now and then one lets itself down on a thread, hangs, and
       climbs back. A cursor coming close sends it straight back up. */
    const stepSpider = (dt: number) => {
      const s = spider;
      const eligible = corners.filter((c) => c.spider);
      if (!eligible.length) return;
      s.t += dt * s.rate;
      if (s.phase === "idle") {
        if (s.t < s.wait) return;
        s.web = Math.floor(rnd() * eligible.length);
        const web = eligible[s.web].web;
        s.anchor = web.grid[Math.floor(web.spokes / 2)][web.rings - 2];
        s.max = Math.max(0, Math.min(h - s.anchor.y - 18, 110));
        if (s.max < 30) {
          s.t = 0;
          return;
        }
        s.phase = "down";
        s.t = 0;
        s.rate = 1;
      } else if (s.phase === "down") {
        s.len = easeInOut(Math.min(1, s.t / 2.4)) * s.max;
        if (s.t >= 2.4) {
          s.phase = "hang";
          s.t = 0;
        }
      } else if (s.phase === "hang" && s.anchor) {
        s.len = s.max + Math.sin(s.t * 2.2) * 3;
        const sx = s.anchor.x;
        const sy = s.anchor.y + s.len;
        const scared = ptr.on && Math.hypot(ptr.x - sx, ptr.y - sy) < 56;
        if (s.t >= 3.6 || scared) {
          s.phase = "up";
          s.t = 0;
          s.rate = scared ? 2.4 : 1;
        }
      } else {
        s.len = (1 - easeInOut(Math.min(1, s.t / 2.6))) * s.max;
        if (s.t >= 2.6) {
          s.phase = "idle";
          s.t = 0;
          s.len = 0;
          s.wait = 12 + rnd() * 14;
        }
      }
    };

    const drawSpider = (mix: number) => {
      const s = spider;
      if (s.phase === "idle" || s.len < 1 || !s.anchor) return;
      const ax = s.anchor.x;
      const ay = s.anchor.y;
      const sway = Math.sin(t * 1.3) * s.len * 0.05;
      const x = ax + sway;
      const y = ay + s.len;
      const legs = (sgn: number) => {
        for (let i = 0; i < 4; i++) {
          const a = -0.9 + i * 0.6 + Math.sin(t * 6 + i) * 0.08;
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + sgn * 4.2, y + a * 4 - 2.5, x + sgn * 6.5, y + a * 5.5 + 1.5);
        }
      };
      for (const [alpha, cold] of [
        [1 - mix, true],
        [mix, false],
      ] as const) {
        if (alpha < 0.01) continue;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = cold ? "rgba(243, 239, 231, 0.55)" : INK;
        ctx.lineWidth = cold ? 0.6 : 0.9;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(x, y - 2);
        ctx.stroke();
        ctx.lineWidth = cold ? 0.7 : 1;
        ctx.beginPath();
        legs(-1);
        legs(1);
        ctx.stroke();
        ctx.fillStyle = cold ? "#f3efe7" : "#0a101a";
        ctx.beginPath();
        ctx.ellipse(x, y + 1.5, 2.6, 3.2, 0, 0, Math.PI * 2);
        ctx.ellipse(x, y - 2.2, 1.6, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        if (cold) {
          // cold gets a saffron eye-dot, a single instrument light
          ctx.fillStyle = "#fdbf28";
          ctx.beginPath();
          ctx.arc(x, y + 1.2, 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    const drawCold = (alpha: number) => {
      ctx.globalAlpha = alpha;
      ctx.lineCap = "butt";
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = COLD_SPOKE;
      ctx.beginPath();
      for (const c of corners)
        for (const col of c.web.grid) {
          ctx.moveTo(col[0].x, col[0].y);
          for (let r = 1; r < col.length; r++) ctx.lineTo(col[r].x, col[r].y);
        }
      ctx.stroke();
      ctx.strokeStyle = COLD_RING;
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      for (const c of corners) {
        const g = c.web.grid;
        for (let r = 1; r <= c.web.rings; r++) {
          ctx.moveTo(g[0][r].x, g[0][r].y);
          for (let s = 1; s < c.web.spokes; s++) ctx.lineTo(g[s][r].x, g[s][r].y);
        }
      }
      ctx.stroke();

      // dew: a paper bead at some crossings, and every so often one glints —
      // a short saffron cross that flares and is gone
      ctx.fillStyle = "rgba(243, 239, 231, 0.6)";
      ctx.beginPath();
      for (const c of corners)
        for (const d of c.dew) {
          ctx.moveTo(d.p.x + d.r, d.p.y);
          ctx.arc(d.p.x, d.p.y, d.r, 0, Math.PI * 2);
        }
      ctx.fill();
      if (!reduced) {
        ctx.strokeStyle = "#fdbf28";
        ctx.lineWidth = 0.8;
        for (const c of corners)
          for (const d of c.dew) {
            const g = Math.max(0, Math.sin(t * 0.55 + d.ph * 3.1)) ** 40;
            if (g < 0.03) continue;
            const L = 2 + g * 5;
            ctx.globalAlpha = alpha * g;
            ctx.beginPath();
            ctx.moveTo(d.p.x - L, d.p.y);
            ctx.lineTo(d.p.x + L, d.p.y);
            ctx.moveTo(d.p.x, d.p.y - L);
            ctx.lineTo(d.p.x, d.p.y + L);
            ctx.stroke();
          }
      }
      ctx.globalAlpha = 1;
    };

    const drawWarm = (alpha: number) => {
      ctx.globalAlpha = alpha;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.1;
      const X = (p: Particle) => p.x + p.jx;
      const Y = (p: Particle) => p.y + p.jy;
      ctx.beginPath();
      for (const c of corners) {
        // spokes: a hand wobble, curved through midpoints
        for (const col of c.web.grid) {
          ctx.moveTo(X(col[0]), Y(col[0]));
          for (let r = 1; r < col.length; r++) {
            const a = col[r - 1];
            const b = col[r];
            ctx.quadraticCurveTo(X(a), Y(a), (X(a) + X(b)) / 2, (Y(a) + Y(b)) / 2);
          }
          const e = col[col.length - 1];
          ctx.lineTo(X(e), Y(e));
        }
        // rings sag toward the hub, the cartoon cobweb's scalloped arcs
        const g = c.web.grid;
        const hub = c.hub;
        for (let r = 1; r <= c.web.rings; r++) {
          ctx.moveTo(X(g[0][r]), Y(g[0][r]));
          for (let s = 1; s < c.web.spokes; s++) {
            const a = g[s - 1][r];
            const b = g[s][r];
            const mx = (X(a) + X(b)) / 2;
            const my = (Y(a) + Y(b)) / 2;
            ctx.quadraticCurveTo(mx + (hub.x - mx) * 0.1, my + (hub.y - my) * 0.1, X(b), Y(b));
          }
        }
      }
      ctx.stroke();

      const marks = markPaths();
      for (const c of corners)
        for (const k of c.caught) {
          ctx.save();
          ctx.translate(X(k.p), Y(k.p));
          ctx.rotate(k.rot + (k.p.x - k.p.hx) * 0.05);
          ctx.scale(k.s, k.s);
          ctx.translate(-6, -6);
          ctx.strokeStyle = k.colour;
          ctx.lineWidth = 1.5 / k.s;
          ctx.stroke(marks[k.mark]);
          ctx.restore();
        }
      ctx.globalAlpha = 1;
    };

    const draw = (mix: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (mix < 0.99) drawCold(1 - mix);
      if (mix > 0.01) drawWarm(mix);
      drawSpider(mix);
      if (brand) {
        // soft-edged hole: the shadow of a destination-out fill erases too
        const c = canvas.getBoundingClientRect();
        const pad = 10;
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.roundRect(brand.left - c.left - pad, brand.top - c.top - pad, brand.width + pad * 2, brand.height + pad * 2, 18);
        ctx.fill();
        ctx.restore();
      }
    };

    const offPtr = trackPointer(host, ptr);
    const offVis = watchOnScreen(host, (v) => (onScreen = v));
    const offState = watchHeroState(() => (dirty = true));

    const offTick = engine.onTick((dt) => {
      if (!onScreen) return;
      relayout();
      if (!corners.length) return;
      const mix = warmth(engine);
      if (reduced) {
        // one still frame, redrawn only when the layout or the state changes
        if (dirty) draw(mix);
        dirty = false;
        return;
      }
      t += dt;
      // fixed steps: the tuning is per 60Hz frame, whatever the display runs at
      acc = Math.min(acc + dt, STEP * 3);
      while (acc >= STEP) {
        physics(mix);
        acc -= STEP;
      }
      stepSpider(dt);
      draw(mix);
    });

    return () => {
      offTick();
      offPtr();
      offVis();
      offState();
      ro.disconnect();
      webPerches.length = 0;
    };
  }, [engine]);

  return <canvas ref={ref} className="hero-webs" aria-hidden="true" />;
}

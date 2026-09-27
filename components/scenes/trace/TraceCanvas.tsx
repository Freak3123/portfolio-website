"use client";

/**
 * Trace — the live layer. Separate webs, joined one thread at a time into a
 * network. The chapter starts on a single web ("Trace first."); each step
 * floats a thread out of the current web to the next one, the view follows
 * the thread's head across the gap, and the project is revealed at the web
 * the thread lands on: the landing point is the symptom, the tracer runs in
 * along the radial to the hub (the root cause, pulse + chime), and the web is
 * spun complete around it (the fix). As the chapter leaves, satellite webs tie
 * on and the camera pulls back to the whole network — which dissolves into
 * the world web as the next chapter arrives. Everything is scrubbed by the
 * journey's `local` progress.
 *
 * ELEMENTS → REFERENCES
 *   Threads drawing progressively between webs, the camera following the
 *   drawing head, zooming out mid-path so both ends read
 *     → Codrops "Creating Scroll-Driven SVG Map Animations with GSAP"
 *       (2026/05/21): route draws with scroll, camera tracks the route head,
 *       markers appear as each leg completes — done on canvas with an exact
 *       partial polyline instead of stroke-dashoffset
 *   Curved bridge threads between webs, responsive to the viewport
 *     → Codrops "Responsive, Scroll-Triggered Curved Path Animations with GSAP"
 *       (2025/12/17): quadratic curves recomputed from the layout, drawn by
 *       progress
 *   Each project revealed at a node as its path completes (symptom at the
 *   landing, root cause at the hub, fix = the web spun around it)
 *     → the same map reference's "markers pop as the path reaches them"
 *   Final pull-back to the whole network as the chapter leaves
 *     → map reference's closing overview shot
 *   Root-cause knot pulse + ring, hover-follow node labels, metric counters
 *     → Awwwards node-graph "active node" pulse; hover-follow labels;
 *       glitch-free counters (unchanged from the previous version)
 *   Dew on spun webs, hairlines → the hero's cold grammar (lib/web/draw.ts)
 */
import { useEffect, useRef } from "react";
import { journey } from "@/lib/journey/journey";
import { sound } from "@/lib/audio/sound";
import { dew, themeColors, type Pt } from "@/lib/web/draw";
import { PROJECTS, buildNetwork, formatMetric, pathPoint, type NetPath, type NetWeb } from "./data";

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ramp = (v: number, a: number, b: number) => clamp((v - a) / (b - a));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const NET = buildNetwork();
const CENTRE = { x: (NET.bounds.x0 + NET.bounds.x1) / 2, y: (NET.bounds.y0 + NET.bounds.y1) / 2 };

/* per project step s (0…1): bridge 0→0.4, tracer 0.4→0.6, spin 0.62→0.95 */
const BRIDGE = 0.4;
const ROOT = 0.6;

/** how far along project path p the thread has been drawn at trace-local L */
function drawn(path: NetPath, s: number) {
  if (s <= 0) return 0;
  if (s >= ROOT) return path.total;
  if (s < BRIDGE) return path.land * ease(s / BRIDGE);
  return path.land + (path.total - path.land) * ease((s - BRIDGE) / (ROOT - BRIDGE));
}

type Target = { x: number; y: number; kicker: string; text: string };

export default function TraceCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const label = labelRef.current;
    const scene = canvas?.closest<HTMLElement>(".scene--trace");
    const ctx = canvas?.getContext("2d");
    if (!canvas || !label || !scene || !ctx) return;

    const articles = Array.from(scene.querySelectorAll<HTMLElement>(".trace-project"));
    const metricEls = articles.map((a) => a.querySelector<HTMLElement>("[data-metric]"));
    const title = scene.querySelector<HTMLElement>(".trace-intro");
    const counter = scene.querySelector<HTMLElement>(".trace-counter");
    const counterNum = scene.querySelector<HTMLElement>("[data-trace-count]");

    /* ── size ─────────────────────────────────────────────────────────── */
    let w = 1;
    let h = 1;
    let dpr = 1;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    /* ── theme ────────────────────────────────────────────────────────── */
    let col = themeColors();
    let colTimer = 0;
    const mo = new MutationObserver(() => {
      col = themeColors();
      window.clearTimeout(colTimer);
      // the tokens swap after --fg-swap's delay; read again once it has landed
      colTimer = window.setTimeout(() => (col = themeColors()), 760);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-hero-state"] });

    /* ── hover-follow label ───────────────────────────────────────────── */
    const ptr = { x: -9999, y: -9999, inside: false };
    let targets: Target[] = [];
    let hovered: Target | null = null;
    const pick = () => {
      let best: Target | null = null;
      let bd = 24;
      for (const t of targets) {
        const d = Math.hypot(t.x - ptr.x, t.y - ptr.y);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
      if (best !== hovered) {
        hovered = best;
        if (best) {
          label.firstElementChild!.textContent = best.kicker;
          label.lastElementChild!.textContent = best.text;
          sound.tick();
        }
        label.dataset.show = best ? "true" : "false";
      }
      label.style.transform = `translate3d(${ptr.x + 16}px, ${ptr.y + 14}px, 0)`;
    };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      ptr.x = e.clientX - r.left;
      ptr.y = e.clientY - r.top;
      ptr.inside = true;
      pick();
    };
    const onLeave = () => {
      ptr.inside = false;
      ptr.x = ptr.y = -9999;
      hovered = null;
      label.dataset.show = "false";
    };
    scene.addEventListener("pointermove", onMove);
    scene.addEventListener("pointerleave", onLeave);

    let time = 0;
    let prevL = -99;
    let cleared = true;
    let lastCount = "";
    const lastVars = new Map<string, string>();
    const lastMetric: string[] = [];
    const lastInert: boolean[] = [];

    /** write a CSS variable only when its value changes */
    const setVar = (el: HTMLElement, i: number, name: string, v: number) => {
      const s = v.toFixed(3);
      const key = `${i}${name}`;
      if (lastVars.get(key) === s) return;
      lastVars.set(key, s);
      el.style.setProperty(name, s);
    };

    const unsub = journey.subscribe((j, dt) => {
      if (!j.live) return;
      const f = j.frame("trace");
      if (f.presence <= 0) {
        if (!cleared) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          cleared = true;
        }
        prevL = f.local;
        return;
      }
      cleared = false;
      time += dt;

      /* ── where in the story are we ───────────────────────────────── */
      const L = f.local;
      const Lc = clamp(L, 0, 3);
      const k = Lc > 0 ? Math.min(3, Math.ceil(Lc - 1e-6)) : 0; // project heading to / resting on (1…3)
      const s = k > 0 ? Lc - (k - 1) : 0;
      const pi = k - 1;
      const leave = ease(ramp(L, 3, 3.8));

      /* ── sound, forward only ─────────────────────────────────────── */
      if (L > prevL && k > 0 && prevL > k - 1 - 1e-6 && prevL <= k) {
        const ps = prevL - (k - 1);
        if (ps < BRIDGE && s >= BRIDGE) sound.pluck({ pitch: 0.4 + pi * 0.12, gain: 0.3 });
        if (ps < ROOT && s >= ROOT) sound.chime(0.3 + pi * 0.2);
      }
      prevL = L;

      /* ── camera: follow the thread's head ────────────────────────── */
      const narrow = w < 760;
      const ax0 = narrow ? (w - 44) * 0.5 : w * 0.66; // phones: clear the progress thread on the right
      const ay0 = narrow ? h * 0.3 : h * 0.5; // phones: below the nav, above the text block
      const R0 = narrow ? Math.min(w * 0.24, h * 0.12) : Math.min(w * 0.19, h * 0.3);
      let C: Pt = NET.webs[0].c;
      let Z = 1;
      if (L <= 0) {
        Z = 1.3 - 0.3 * ease(ramp(L, -1, 0));
      } else if (k > 0) {
        const path = NET.paths[pi];
        if (s < ROOT) {
          C = pathPoint(path, drawn(path, s));
          // pull back mid-bridge so both webs share the frame
          Z = 1 - 0.42 * Math.sin(Math.PI * ramp(s, 0, BRIDGE + 0.04));
        } else {
          C = NET.webs[k].c;
        }
      }
      let ax = ax0;
      let ay = ay0;
      if (leave > 0) {
        const b = NET.bounds;
        const fit = Math.min((w * 0.9) / (b.x1 - b.x0), (h * (narrow ? 0.5 : 0.78)) / (b.y1 - b.y0)) / R0;
        C = { x: lerp(C.x, CENTRE.x, leave), y: lerp(C.y, CENTRE.y, leave) };
        Z = lerp(Z, fit, leave);
        ax = lerp(ax0, w / 2, leave);
        ay = lerp(ay0, narrow ? h * 0.36 : h / 2, leave);
      }
      const sc = R0 * Z;
      const X = (x: number) => ax + (x - C.x) * sc;
      const Y = (y: number) => ay + (y - C.y) * sc;
      const lw = clamp(sc / 150, 0.6, 1.3);

      /* ── draw ────────────────────────────────────────────────────── */
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const approach = ramp(L, -0.8, 0);
      const w0 = ease(ramp(L, -1, -0.1));
      const satSpin = ease(ramp(L, 3.2, 3.75));

      const drawWeb = (web: NetWeb, radialsA: number, radialLen: number, rings: number, dewA: number) => {
        const cx = X(web.c.x);
        const cy = Y(web.c.y);
        const rr = web.r * sc;
        if (cx + rr < -20 || cx - rr > w + 20 || cy + rr < -20 || cy - rr > h + 20) return;
        ctx.strokeStyle = col.fg;
        ctx.lineWidth = lw;
        if (radialsA > 0.01 && radialLen > 0.001) {
          ctx.globalAlpha = radialsA;
          ctx.beginPath();
          for (const p of web.radials) {
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + (X(p.x) - cx) * radialLen, cy + (Y(p.y) - cy) * radialLen);
          }
          ctx.stroke();
        }
        if (rings > 0.001) {
          const n = web.rings.length;
          const full = Math.floor(rings * n);
          const part = rings * n - full;
          ctx.globalAlpha = Math.max(radialsA, 0.5);
          ctx.beginPath();
          for (let r = 0; r < Math.min(n, full + 1); r++) {
            const ring = web.rings[r];
            const m = ring.length;
            const segs = r < full ? m : Math.floor(part * m);
            for (let i = 0; i < segs; i++) {
              const A = ring[i];
              const B = ring[(i + 1) % m];
              const qx = web.c.x + ((A.x + B.x) / 2 - web.c.x) * 0.94;
              const qy = web.c.y + ((A.y + B.y) / 2 - web.c.y) * 0.94;
              if (i === 0) ctx.moveTo(X(A.x), Y(A.y));
              ctx.quadraticCurveTo(X(qx), Y(qy), X(B.x), Y(B.y));
            }
          }
          ctx.stroke();
        }
        if (dewA > 0.02) {
          ctx.globalAlpha = dewA;
          for (const d of web.dew) dew(ctx, { x: X(d.x), y: Y(d.y) }, clamp(sc * 0.012, 1, 2.2), col.fg, col.ground);
        }
      };

      /** the drawn part of a path (0 … d), optionally with a glowing head */
      const drawPath = (path: NetPath, d: number, alpha: number, live: boolean) => {
        if (d <= 0 || alpha <= 0.01) return;
        const { pts, cum } = path;
        ctx.beginPath();
        ctx.moveTo(X(pts[0]), Y(pts[1]));
        let hx = X(pts[0]);
        let hy = Y(pts[1]);
        for (let i = 1; i < cum.length; i++) {
          if (cum[i] <= d) {
            hx = X(pts[i * 2]);
            hy = Y(pts[i * 2 + 1]);
            ctx.lineTo(hx, hy);
            continue;
          }
          const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
          hx = X(pts[(i - 1) * 2] + (pts[i * 2] - pts[(i - 1) * 2]) * t);
          hy = Y(pts[(i - 1) * 2 + 1] + (pts[i * 2 + 1] - pts[(i - 1) * 2 + 1]) * t);
          ctx.lineTo(hx, hy);
          break;
        }
        ctx.strokeStyle = col.accent;
        if (live) {
          ctx.globalAlpha = 0.16 * alpha;
          ctx.lineWidth = 7;
          ctx.stroke();
        }
        ctx.globalAlpha = alpha;
        ctx.lineWidth = live ? 1.9 : 1.3;
        ctx.stroke();
        if (live && d < path.total) {
          ctx.save();
          ctx.shadowColor = col.accent;
          ctx.shadowBlur = 16;
          ctx.fillStyle = col.accent;
          ctx.beginPath();
          ctx.arc(hx, hy, 3.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      };

      // satellites first (behind), then the chapter's own webs
      for (const web of NET.webs) {
        if (web.role >= 0) continue;
        drawWeb(web, 0.1 * approach + 0.35 * satSpin, 1, satSpin, 0.6 * satSpin);
      }
      // the network ties up as the chapter leaves
      NET.links.forEach((link, i) => {
        const u = ease(ramp(L, 3 + i * 0.05, 3.42 + i * 0.05));
        drawPath(link, link.total * u, 0.55, u > 0 && u < 1);
      });

      for (const web of NET.webs) {
        if (web.role < 0) continue;
        if (web.role === 0) {
          drawWeb(web, 0.5 * approach, ramp(w0, 0, 0.5), ramp(w0, 0.35, 1), 0.7 * ramp(w0, 0.8, 1));
          continue;
        }
        const p = web.role - 1;
        const sp = L - p;
        const lit = ramp(sp, BRIDGE, BRIDGE + 0.12);
        const spin = ease(ramp(sp, 0.62, 0.95));
        drawWeb(web, 0.13 * approach + 0.37 * lit, 1, spin, 0.7 * spin);
      }

      // the threads between the chapter's webs, drawn by progress
      NET.paths.forEach((path, p) => {
        const sp = L - p;
        const d = drawn(path, sp);
        drawPath(path, d, p === pi || (k === 0 && p === 0) ? 1 : 0.6, p === pi && sp > 0 && sp < ROOT);
      });

      const next: Target[] = [];

      // hubs: the start web's knot; spun project webs glow at the centre
      if (w0 > 0.85) {
        ctx.globalAlpha = ramp(w0, 0.85, 1);
        dew(ctx, { x: X(NET.webs[0].c.x), y: Y(NET.webs[0].c.y) }, 4, col.accent, col.ground);
      }
      for (let q = 1; q <= 3; q++) {
        const spin = ramp(L - (q - 1), 0.75, 0.95);
        if (spin <= 0) continue;
        const hub = NET.webs[q].c;
        ctx.globalAlpha = spin;
        dew(ctx, { x: X(hub.x), y: Y(hub.y) }, 4.5, col.accent, col.ground);
        if (q - 1 === pi && spin > 0.5 && leave < 0.5) {
          next.push({ x: X(hub.x), y: Y(hub.y), kicker: `Fix · ${PROJECTS[pi].name}`, text: PROJECTS[pi].fix });
        }
      }

      if (k > 0 && leave < 1) {
        const path = NET.paths[pi];
        const web = NET.webs[k];
        // symptom: where the thread lands, a dew drop trembling on the rim
        const sym = ramp(s, BRIDGE - 0.02, BRIDGE + 0.04) * (1 - ramp(s, 0.9, 1) * 0.6) * (1 - leave);
        if (sym > 0) {
          const lp = pathPoint(path, path.land);
          const pt = {
            x: X(lp.x) + Math.sin(time * 23 + pi * 2.1) * 1.2 * (1 - ramp(s, 0.62, 0.9)),
            y: Y(lp.y) + Math.cos(time * 19 + pi * 1.3) * 1.2 * (1 - ramp(s, 0.62, 0.9)),
          };
          ctx.globalAlpha = sym;
          dew(ctx, pt, 5, col.accent, col.ground);
          next.push({ x: pt.x, y: pt.y, kicker: `Symptom · ${PROJECTS[pi].name}`, text: PROJECTS[pi].symptom });
        }
        // root cause: a knot at the hub that pulses when the tracer arrives
        const knot = ramp(s, ROOT - 0.05, ROOT) * (1 - ramp(s, 0.82, 0.95));
        if (knot > 0) {
          const pulse = ramp(s, ROOT, 0.82);
          const beat = 1 + Math.sin(pulse * Math.PI) * 0.6;
          const px = X(web.c.x);
          const py = Y(web.c.y);
          ctx.strokeStyle = col.accent;
          ctx.lineWidth = 1.2;
          ctx.globalAlpha = knot;
          for (let t = 0; t < 3; t++) {
            const a = (t / 3) * Math.PI * 2 + time * 0.6;
            ctx.beginPath();
            ctx.arc(px + Math.cos(a) * 3 * beat, py + Math.sin(a) * 3 * beat, 3.4 * beat, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (pulse > 0 && pulse < 1) {
            ctx.globalAlpha = (1 - pulse) * 0.9;
            ctx.beginPath();
            ctx.arc(px, py, 8 + easeOut(pulse) * sc * 0.9, 0, Math.PI * 2);
            ctx.stroke();
          }
          next.push({ x: px, y: py, kicker: `Root cause · ${PROJECTS[pi].name}`, text: PROJECTS[pi].cause });
        }
      }
      ctx.globalAlpha = 1;
      targets = next;
      if (ptr.inside) pick();

      /* ── drive the text ──────────────────────────────────────────── */
      setVar(scene, 11, "--net", leave);
      if (title) {
        const vin = clamp(L + 1);
        const vout = 1 - ramp(L, 0, 0.22);
        setVar(title, 9, "--v", ease(vin) * vout);
      }
      if (counter && counterNum) {
        setVar(counter, 10, "--v", ramp(L, 0.1, 0.3) * (1 - ramp(L, 3, 3.3)));
        const c = `0${Math.max(1, k)}`;
        if (c !== lastCount) counterNum.textContent = lastCount = c;
      }
      articles.forEach((el, p) => {
        const arrive = clamp(Lc - p);
        // the next thread leaving takes this project's text with it
        const out = p < 2 ? 1 - ramp(L - (p + 1), 0, 0.16) : 1 - ramp(L - 3, 0.05, 0.4);
        setVar(el, p, "--sym", ramp(arrive, 0.3, 0.46) * out);
        setVar(el, p, "--cause", ramp(arrive, 0.56, 0.7) * out);
        setVar(el, p, "--fix", ramp(arrive, 0.74, 0.94) * out);
        const current = p === pi;
        if (lastInert[p] !== !current) {
          lastInert[p] = !current;
          el.inert = !current;
        }
        const m = PROJECTS[p].metric;
        const v = m.from + (m.to - m.from) * easeOut(ramp(arrive, 0.74, 0.98));
        const text = formatMetric(m, v);
        const me = metricEls[p];
        if (me && lastMetric[p] !== text) me.textContent = lastMetric[p] = text;
      });
    });

    return () => {
      unsub();
      ro.disconnect();
      mo.disconnect();
      window.clearTimeout(colTimer);
      scene.removeEventListener("pointermove", onMove);
      scene.removeEventListener("pointerleave", onLeave);
      articles.forEach((el) => (el.inert = false));
      scene.style.removeProperty("--net");
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="trace-canvas" aria-hidden="true" />
      <div ref={labelRef} className="trace-hoverlabel" data-show="false" aria-hidden="true">
        <span className="mono" />
        <span />
      </div>
    </>
  );
}

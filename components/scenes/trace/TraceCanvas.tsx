"use client";

/**
 * Trace — the live layer. One canvas draws the tangle, the tracer and the
 * fix web; the server-rendered text around it is driven by CSS variables this
 * component writes. Everything is scrubbed by the journey's `local` progress,
 * so the wheel literally pushes the tracer along the silk.
 *
 * ELEMENTS → REFERENCES
 *   Tracer drawing itself along strands, partial curve per hop
 *     → Awwwards SOTD "SVG line drawing on progress" (stroke-dashoffset scrub),
 *       done here as an exact de Casteljau split so it works on canvas
 *   Other strands dim while the path lights
 *     → Awwwards node-graph visualisations (focus + context highlighting)
 *   Root-cause knot pulse + ring
 *     → Awwwards node-graph "active node" pulse
 *   Tangle → orb web re-organisation, staggered per strand
 *     → meermohsin.me heavy staggered reveals / scrubbed pinned stages
 *   Nodes pushed by cursor velocity, (1-d/r)^3 falloff, spring return
 *     → L6 animation-reference/physics/19
 *   Trembling dew drops, hairlines, small nodes
 *     → the hero's cold grammar (components/hero/Ambient.tsx)
 *   Hover a node → label follows the cursor
 *     → Awwwards "hover-follow labels"
 *   Metric counting up, tabular figures
 *     → Awwwards "glitch-free counters"
 */
import { useEffect, useRef } from "react";
import { journey } from "@/lib/journey/journey";
import { sound } from "@/lib/audio/sound";
import { dew, themeColors, type Pt } from "@/lib/web/draw";
import { PROJECTS, buildTangle, formatMetric } from "./data";

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ramp = (v: number, a: number, b: number) => clamp((v - a) / (b - a));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

const TANGLE = buildTangle();
const S = TANGLE.strands.length;

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

    /* ── cursor (L6 push + hover label) ───────────────────────────────── */
    const ptr = { x: -9999, y: -9999, vx: 0, vy: 0, t: 0, inside: false };
    const N = TANGLE.nodes.length;
    const off = new Float32Array(N * 2);
    const vel = new Float32Array(N * 2);
    let targets: Target[] = [];
    let hovered: Target | null = null;

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const now = performance.now();
      const dt = Math.max(8, now - ptr.t);
      if (ptr.inside) {
        ptr.vx = ((x - ptr.x) / dt) * 16;
        ptr.vy = ((y - ptr.y) / dt) * 16;
      }
      ptr.x = x;
      ptr.y = y;
      ptr.t = now;
      ptr.inside = true;
      pick();
    };
    const onLeave = () => {
      ptr.inside = false;
      ptr.x = ptr.y = -9999;
      hovered = null;
      label.dataset.show = "false";
    };
    const pick = () => {
      let best: Target | null = null;
      let bd = 22;
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
    scene.addEventListener("pointermove", onMove);
    scene.addEventListener("pointerleave", onLeave);

    /* ── per-frame buffers ────────────────────────────────────────────── */
    const ax = new Float32Array(S);
    const ay = new Float32Array(S);
    const bx = new Float32Array(S);
    const by = new Float32Array(S);
    const qx = new Float32Array(S);
    const qy = new Float32Array(S);
    const alpha = new Float32Array(S);
    const inPath = new Int8Array(S).fill(-1);
    TANGLE.pathStrands.forEach((list, p) => list.forEach((s) => (inPath[s] = p)));

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
      const L = clamp(f.local, 0, 3);
      const k = L > 0 ? Math.min(3, Math.ceil(L - 1e-6)) : 0; // project heading to / resting on (1…3)
      const s = k > 0 ? L - (k - 1) : 0;
      const pi = k - 1;
      let webIdx = -1;
      let mix = 0;
      if (k > 0 && s < 0.2 && k >= 2) {
        webIdx = k - 2;
        mix = 1 - ease(s / 0.2);
      } else if (k > 0 && s >= 0.7) {
        webIdx = pi;
        mix = ease((s - 0.7) / 0.3);
      }
      if (f.local > 3) {
        webIdx = 2;
        mix = 1;
      }
      const tt = k > 0 ? ramp(s, 0.2, 0.6) : 0;
      const focus = k > 0 ? ramp(s, 0.14, 0.24) * (1 - ramp(s, 0.72, 0.88)) : 0;
      const pulse = k > 0 ? ramp(s, 0.6, 0.82) : 0;

      /* ── sound, forward only ─────────────────────────────────────── */
      if (f.local > prevL && k > 0 && prevL > k - 1 - 1e-6 && prevL < k) {
        const ps = prevL - (k - 1);
        const hops = TANGLE.pathStrands[pi].length;
        const was = Math.floor(ramp(ps, 0.2, 0.6) * hops);
        const now = Math.floor(tt * hops);
        if (now > was && now <= hops) sound.pluck({ pitch: 0.35 + now * 0.1, gain: 0.25 });
        if (ps < 0.6 && s >= 0.6) sound.chime(0.3 + pi * 0.2);
      }
      prevL = f.local;

      /* ── layout ──────────────────────────────────────────────────── */
      const narrow = w < 760;
      const cx = narrow ? (w - 44) * 0.5 : w * 0.66; // phones: clear the progress thread on the right
      const cy = narrow ? h * 0.3 : h * 0.5; // phones: below the nav, above the text block
      const R = narrow ? Math.min(w * 0.25, h * 0.12) : Math.min(w * 0.21, h * 0.33);

      /* ── L6: cursor-velocity push, spring return ─────────────────── */
      const push = 1 - mix;
      const k60 = Math.min(3, dt * 60);
      for (let n = 0; n < N; n++) {
        const nx = cx + TANGLE.nodes[n].x * R + off[n * 2];
        const ny = cy + TANGLE.nodes[n].y * R + off[n * 2 + 1];
        const d = Math.hypot(nx - ptr.x, ny - ptr.y);
        if (ptr.inside && d < 140) {
          const fall = Math.pow(1 - d / 140, 3) * 0.5 * push;
          vel[n * 2] += ptr.vx * fall;
          vel[n * 2 + 1] += ptr.vy * fall;
        }
        vel[n * 2] += -off[n * 2] * 0.07 * k60;
        vel[n * 2 + 1] += -off[n * 2 + 1] * 0.07 * k60;
        vel[n * 2] *= 0.86;
        vel[n * 2 + 1] *= 0.86;
        off[n * 2] += vel[n * 2] * k60;
        off[n * 2 + 1] += vel[n * 2 + 1] * k60;
      }
      ptr.vx *= 0.8;
      ptr.vy *= 0.8;
      const node = (n: number): Pt => ({ x: cx + TANGLE.nodes[n].x * R + off[n * 2], y: cy + TANGLE.nodes[n].y * R + off[n * 2 + 1] });

      /* ── strand geometry: tangle ⇄ web ───────────────────────────── */
      const web = webIdx >= 0 ? TANGLE.webs[webIdx] : null;
      const tremble = k === 0 ? 1 : 1 - focus * 0.6;
      for (let i = 0; i < S; i++) {
        const st = TANGLE.strands[i];
        const A = node(st.a);
        const B = node(st.b);
        let curl = (st.curl + Math.sin(time * 1.7 + st.ph) * 0.02 * tremble) * R;
        let sag = 0;
        let a = 0.42;
        if (web) {
          const m = easeOut(clamp(mix * 1.45 - web.delay[i] * 0.45));
          const seg = web.map[i];
          const wa = seg >= 0 ? web.segments[seg].a : { x: 0, y: 0 };
          const wb = seg >= 0 ? web.segments[seg].b : { x: 0, y: 0 };
          A.x += (cx + wa.x * R - A.x) * m;
          A.y += (cy + wa.y * R - A.y) * m;
          B.x += (cx + wb.x * R - B.x) * m;
          B.y += (cy + wb.y * R - B.y) * m;
          curl *= 1 - m;
          sag = m * R * 0.02;
          a = 0.42 + m * 0.3;
          if (seg < 0) a *= 1 - m;
        }
        if (inPath[i] !== pi || k === 0) a *= 1 - focus * 0.72;
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const len = Math.hypot(dx, dy) || 1;
        ax[i] = A.x;
        ay[i] = A.y;
        bx[i] = B.x;
        by[i] = B.y;
        qx[i] = (A.x + B.x) / 2 + (-dy / len) * curl;
        qy[i] = (A.y + B.y) / 2 + (dx / len) * curl + sag;
        alpha[i] = a;
      }

      /* ── draw ────────────────────────────────────────────────────── */
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      ctx.strokeStyle = col.fg;
      ctx.lineWidth = 1;
      for (let i = 0; i < S; i++) {
        if (alpha[i] < 0.01) continue;
        ctx.globalAlpha = alpha[i];
        ctx.beginPath();
        ctx.moveTo(ax[i], ay[i]);
        ctx.quadraticCurveTo(qx[i], qy[i], bx[i], by[i]);
        ctx.stroke();
      }

      // tangle nodes: small hairline dots (cold grammar)
      const tangleVis = 1 - mix;
      if (tangleVis > 0.02) {
        ctx.fillStyle = col.fg;
        ctx.globalAlpha = 0.55 * tangleVis * (1 - focus * 0.6);
        for (let n = 0; n < N; n++) {
          const p = node(n);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const next: Target[] = [];

      // symptoms: trembling dew drops — what a bug looks like from outside
      if (tangleVis > 0.02) {
        PROJECTS.forEach((proj, p) => {
          const n = TANGLE.paths[p][0];
          const base = node(n);
          const shake = p === pi ? 1.6 : 1;
          const pt = {
            x: base.x + Math.sin(time * 23 + p * 2.1) * 1.1 * shake,
            y: base.y + Math.cos(time * 19 + p * 1.3) * 1.1 * shake,
          };
          ctx.globalAlpha = tangleVis * (k === 0 || p === pi ? 1 : 0.35);
          dew(ctx, pt, p === pi ? 5 : 4, col.accent, col.ground);
          if (tangleVis > 0.5) next.push({ x: pt.x, y: pt.y, kicker: `Symptom · ${proj.name}`, text: proj.symptom });
        });
      }

      // the tracer: line-drawing along the path, hop by hop
      if (k > 0 && tt > 0) {
        const list = TANGLE.pathStrands[pi];
        const total = tt * list.length;
        const fade = 1 - ramp(s, 0.72, 0.9);
        ctx.strokeStyle = col.accent;
        ctx.lineWidth = 1.8;
        ctx.globalAlpha = fade;
        let head: Pt | null = null;
        for (let hop = 0; hop < list.length && hop < total; hop++) {
          const i = list[hop];
          const u = Math.min(1, total - hop);
          // de Casteljau: the sub-curve 0…u of a quadratic
          const q1x = ax[i] + (qx[i] - ax[i]) * u;
          const q1y = ay[i] + (qy[i] - ay[i]) * u;
          const mx = qx[i] + (bx[i] - qx[i]) * u;
          const my = qy[i] + (by[i] - qy[i]) * u;
          const ex = q1x + (mx - q1x) * u;
          const ey = q1y + (my - q1y) * u;
          ctx.beginPath();
          ctx.moveTo(ax[i], ay[i]);
          ctx.quadraticCurveTo(q1x, q1y, ex, ey);
          ctx.stroke();
          head = { x: ex, y: ey };
        }
        if (head && tt < 1) {
          ctx.save();
          ctx.shadowColor = col.accent;
          ctx.shadowBlur = 14;
          ctx.fillStyle = col.accent;
          ctx.beginPath();
          ctx.arc(head.x, head.y, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // root cause: a knot that pulses when the tracer arrives, then becomes the hub
      if (k > 0) {
        const knotVis = ramp(s, 0.55, 0.62);
        if (knotVis > 0) {
          const root = node(TANGLE.paths[pi][TANGLE.paths[pi].length - 1]);
          const m = webIdx === pi ? mix : 0;
          const p = { x: root.x + (cx - root.x) * m, y: root.y + (cy - root.y) * m };
          const beat = 1 + Math.sin(pulse * Math.PI) * 0.6;
          ctx.strokeStyle = col.accent;
          ctx.lineWidth = 1.2;
          ctx.globalAlpha = knotVis * (1 - m);
          for (let t = 0; t < 3; t++) {
            const a = (t / 3) * Math.PI * 2 + time * 0.6;
            ctx.beginPath();
            ctx.arc(p.x + Math.cos(a) * 3 * beat, p.y + Math.sin(a) * 3 * beat, 3.4 * beat, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (pulse > 0 && pulse < 1) {
            ctx.globalAlpha = (1 - pulse) * 0.9;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 8 + easeOut(pulse) * R * 0.45, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (m < 0.5) next.push({ x: p.x, y: p.y, kicker: `Root cause · ${PROJECTS[pi].name}`, text: PROJECTS[pi].cause });
        }
      }

      // the fix: dew on the clean web, the hub in accent
      if (web && mix > 0.02) {
        ctx.globalAlpha = mix * 0.8;
        for (const d of web.dew) dew(ctx, { x: cx + d.x * R, y: cy + d.y * R }, 1.8, col.fg, col.ground);
        ctx.globalAlpha = mix;
        dew(ctx, { x: cx, y: cy }, 4.5, col.accent, col.ground);
        const proj = PROJECTS[webIdx];
        if (mix > 0.5) next.push({ x: cx, y: cy, kicker: `Fix · ${proj.name}`, text: proj.fix });
      }
      ctx.globalAlpha = 1;
      targets = next;
      if (ptr.inside) pick();

      /* ── drive the text ──────────────────────────────────────────── */
      if (title) {
        const vin = clamp(f.local + 1);
        const vout = 1 - ramp(f.local, 0, 0.22);
        setVar(title, 9, "--v", ease(vin) * vout);
      }
      if (counter && counterNum) {
        setVar(counter, 10, "--v", ramp(f.local, 0.1, 0.3) * (1 - ramp(f.local, 3, 3.3)));
        const c = `0${Math.max(1, k)}`;
        if (c !== lastCount) counterNum.textContent = lastCount = c;
      }
      articles.forEach((el, p) => {
        const arrive = clamp(L - p);
        const leave = p < 2 ? 1 - ramp(f.local - (p + 1), 0, 0.16) : 1;
        setVar(el, p, "--sym", ramp(arrive, 0.12, 0.3) * leave);
        setVar(el, p, "--cause", ramp(arrive, 0.58, 0.72) * leave);
        setVar(el, p, "--fix", ramp(arrive, 0.76, 0.96) * leave);
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

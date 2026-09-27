"use client";

/**
 * Tunnel — the hero → web handoff as a fly-through. Instead of the page
 * scrolling up, the camera dives INTO the web: the hero is pulled away into
 * the vanishing point, a tube of silk rushes at the lens (spokes run along the
 * tube, so in perspective they read as a web's radials; the capture spiral
 * winds round it, so it reads as the web's rings), and at the far end an
 * orb-weaver web tears open at its hub onto the first chapter.
 *
 * Elements, and where each one comes from:
 * - Camera travelling inside a tube whose axis bends, rings rushing at the
 *   lens, fog in the distance ...................................... Codrops "Infinite Tubes with
 *   Three.js" (2017/05/09, after fornasetti.com) — ported to Canvas2D: the
 *   perspective divide is done by hand, one polyline per spiral turn
 * - Camera position along a curve IS the scroll progress, looking down the
 *   curve's tangent ................................................ Codrops "Scroll-Driven 3D Gallery
 *   Using a Blender Camera Path" (2026/07/07) — our curve is the tube axis
 * - Threads streaking past (motion blur along z, length ∝ camera speed),
 *   dew glinting on the spiral ..................................... Infinite Tubes' particle streaks;
 *   dew = the site's cold grammar (lib/web/draw.ts `dew`)
 * - The first chapter revealed through the hub of the web at the tunnel's end
 *   (circle clip on the stage, grown by the same projection) ....... same Infinite Tubes camera, the
 *   tube's end treated as a portal
 *
 * Driven only by the journey's `entry` ScrollTrigger (scrubbed, reversible):
 * the engine calls update(e) from onUpdate, so the hero transform, the stage
 * iris and the canvas all move in the scroll's own frame. A gsap.ticker hook
 * runs only while 0 < e < 1 (dew glints, idle sway). Never created under
 * reduced motion (the engine never goes live).
 */

import { gsap } from "@/lib/motion/gsap";
import { dew, orbWeb, rng, themeColors, type Pt } from "@/lib/web/draw";

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const sstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* ── the tube, in world units (radius 1) ──────────────────────────────── */
const SPOKES = 18;
const TURNS = 34;
/** z per spiral turn */
const DZ = 0.55;
const Z_END = TURNS * DZ + 0.5;
const CAM0 = -0.8;
const CAM1 = Z_END - 0.16;
const NEAR = 0.06;
const FAR = 10;

/** the tube's axis bends (Infinite Tubes' curve), straightening at the far end */
const taper = (z: number) => 1 - sstep(Z_END - 5, Z_END - 0.5, z);
const axisX = (z: number) => (0.46 * Math.sin(z * 0.29) + 0.12 * Math.sin(z * 0.83)) * taper(z);
const axisY = (z: number) => 0.32 * Math.sin(z * 0.21 + 1.1) * taper(z);

type Geo = {
  /** spiral point (turn i, spoke j) at index i*SPOKES + j: offset from the axis + z */
  ox: Float32Array;
  oy: Float32Array;
  oz: Float32Array;
  dew: { k: number; phase: number }[];
  streaks: { ox: number; oy: number; z: number; hot: boolean }[];
  end: { radials: Pt[]; rings: Pt[][] };
};

function build(): Geo {
  const r = rng(6061);
  const n = (TURNS + 1) * SPOKES;
  const ox = new Float32Array(n);
  const oy = new Float32Array(n);
  const oz = new Float32Array(n);
  const base = Array.from({ length: SPOKES }, (_, j) => (j / SPOKES) * Math.PI * 2 + (r() - 0.5) * 0.14);
  for (let i = 0; i <= TURNS; i++) {
    for (let j = 0; j < SPOKES; j++) {
      const k = i * SPOKES + j;
      const a = base[j] + (r() - 0.5) * 0.05;
      const rad = 0.9 + r() * 0.14;
      ox[k] = Math.cos(a) * rad;
      oy[k] = Math.sin(a) * rad;
      oz[k] = (i + j / SPOKES) * DZ;
    }
  }
  const dewPts: Geo["dew"] = [];
  for (let k = 0; k < n; k++) if (r() < 0.08) dewPts.push({ k, phase: r() * Math.PI * 2 });
  const streaks: Geo["streaks"] = [];
  for (let s = 0; s < 120; s++) {
    const a = r() * Math.PI * 2;
    const rad = 0.18 + r() * 0.72;
    streaks.push({ ox: Math.cos(a) * rad, oy: Math.sin(a) * rad, z: r() * Z_END, hot: r() < 0.22 });
  }
  const w = orbWeb({ x: 0, y: 0 }, 1, { spokes: SPOKES, rings: 11, seed: 808, hub: 0.08 });
  return { ox, oy, oz, dew: dewPts, streaks, end: { radials: w.radials, rings: w.rings } };
}

let GEO: Geo | null = null;

export type Tunnel = { update(e: number): void; destroy(): void };

export function createTunnel(section: HTMLElement, stageEl: HTMLElement): Tunnel {
  const geo = (GEO ??= build());
  const hero = section.previousElementSibling instanceof HTMLElement ? section.previousElementSibling : null;

  const canvas = document.createElement("canvas");
  canvas.className = "journey-tunnel";
  canvas.setAttribute("aria-hidden", "true");
  section.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  let w = 1;
  let h = 1;
  let dpr = 1;
  const resize = () => {
    w = document.documentElement.clientWidth || window.innerWidth || 1;
    h = window.innerHeight || 1;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  };
  resize();
  window.addEventListener("resize", resize);

  let e = 0;
  let active = false;
  let colors = themeColors();
  let time = 0;
  let prevCz = CAM0;
  let speed = 0;
  let drewFrame = -1;

  /* ── camera: position on the axis, looking down its tangent ─────────── */
  const cam = { z: CAM0, x: 0, y: 0, tx: 0, ty: 0, roll: 0, f: 1, cx: 0, cy: 0 };
  const setCamera = (ee: number) => {
    const t = clamp(ee);
    cam.z = CAM0 + (CAM1 - CAM0) * (0.8 * t + 0.2 * t * t);
    cam.x = axisX(cam.z);
    cam.y = axisY(cam.z);
    cam.tx = (axisX(cam.z + 0.02) - axisX(cam.z - 0.02)) / 0.04;
    cam.ty = (axisY(cam.z + 0.02) - axisY(cam.z - 0.02)) / 0.04;
    // a slow barrel roll — the vortex of falling in — settling level at the end
    cam.roll = 0.9 * Math.sin(t * Math.PI * 0.92);
    cam.f = Math.min(w, h) * 0.95;
    cam.cx = w / 2;
    cam.cy = h / 2;
  };
  const cr = () => Math.cos(cam.roll);
  const sr = () => Math.sin(cam.roll);

  /** project a point given as offset from the axis at depth z; out.d = depth, 0 when behind */
  const P = { x: 0, y: 0, d: 0 };
  const project = (ox: number, oy: number, z: number, c = cr(), s = sr()) => {
    const d = z - cam.z;
    if (d < NEAR) {
      P.d = 0;
      return P;
    }
    const X = axisX(z) + ox - cam.x - cam.tx * d;
    const Y = axisY(z) + oy - cam.y - cam.ty * d;
    const rx = X * c - Y * s;
    const ry = X * s + Y * c;
    P.x = cam.cx + (cam.f * rx) / d;
    P.y = cam.cy + (cam.f * ry) / d;
    P.d = d;
    return P;
  };

  /* ── hero + stage, the DOM half (same frame as the scroll) ──────────── */
  const heroState = { s: 1, rot: 0, o: 1, round: 0, H: 1, W: 1 };
  const irisState = { r: 0, x: 0, y: 0 };

  const layout = () => {
    const vh = h;
    const jt = section.getBoundingClientRect().top;

    // the hero freezes where it was at e = 0 and is pulled into the vanishing point
    if (hero) {
      const k = sstep(0, 0.62, e);
      const s = Math.exp(Math.log(0.05) * k);
      const rot = -7 * k;
      const o = 1 - sstep(0.34, 0.64, e);
      const H = hero.offsetHeight || vh;
      const round = 26 * sstep(0, 0.2, e);
      heroState.s = s;
      heroState.rot = rot;
      heroState.o = o;
      heroState.round = round;
      heroState.H = H;
      heroState.W = hero.offsetWidth || w;
      hero.style.transformOrigin = `50% ${(H - vh / 2).toFixed(1)}px`;
      hero.style.transform = `translate3d(0, ${(vh - jt).toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${s.toFixed(4)})`;
      hero.style.clipPath = round > 0.2 ? `inset(0 round ${Math.min(2000, round / s).toFixed(1)}px)` : "";
      hero.style.opacity = o.toFixed(3);
    }

    // the stage sits at the top of the screen, shown only through the hub
    setCamera(e);
    const dEnd = Z_END - cam.z;
    const open = Math.pow(sstep(0.74, 1, e), 1.3);
    const hub = project(0, 0, Z_END);
    irisState.x = hub.d ? hub.x : w / 2;
    irisState.y = hub.d ? hub.y : h / 2;
    irisState.r = dEnd > NEAR ? (cam.f * 1.05 * open) / dEnd : Math.hypot(w, h);
    stageEl.style.transform = `translate3d(0, ${(-jt).toFixed(1)}px, 0)`;
    stageEl.style.clipPath = `circle(${Math.max(0, irisState.r).toFixed(1)}px at ${irisState.x.toFixed(1)}px ${irisState.y.toFixed(1)}px)`;
  };

  /* ── canvas ─────────────────────────────────────────────────────────── */
  const draw = () => {
    if (!ctx) return;
    setCamera(e);
    const c = cr();
    const s = sr();
    const f = cam.f;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const bg = sstep(0, 0.2, e);
    const reveal = sstep(0, 0.16, e);
    const exit = 1 - sstep(0.93, 1, e);

    // the ground, with a hole where the hero still is
    ctx.globalAlpha = bg;
    ctx.fillStyle = colors.ground;
    ctx.fillRect(0, 0, w, h);
    if (hero && heroState.o > 0.001) {
      const hs = heroState;
      // the hero's rect relative to its transform origin (the screen centre)
      const top = h / 2 - hs.H;
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = hs.o;
      ctx.translate(w / 2, h / 2);
      ctx.rotate((hs.rot * Math.PI) / 180);
      ctx.scale(hs.s, hs.s);
      ctx.beginPath();
      const rr = Math.min(2000, hs.round / hs.s);
      if (ctx.roundRect) ctx.roundRect(-hs.W / 2, top, hs.W, hs.H, rr);
      else ctx.rect(-hs.W / 2, top, hs.W, hs.H);
      ctx.fill();
      ctx.restore();
    }

    // the light at the end of the tunnel
    const hub = project(0, 0, Z_END, c, s);
    if (hub.d) {
      const glow = sstep(0.35, 0.95, e) * exit;
      if (glow > 0.01) {
        const gr = Math.min(Math.hypot(w, h), (f * 1.4) / hub.d + 60);
        const g = ctx.createRadialGradient(hub.x, hub.y, 0, hub.x, hub.y, gr);
        g.addColorStop(0, colors.accent);
        g.addColorStop(1, "transparent");
        ctx.globalAlpha = 0.28 * glow;
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
    }

    const { ox, oy, oz } = geo;
    const depthAlpha = (d: number) => sstep(NEAR, 0.7, d) * (1 - sstep(FAR * 0.35, FAR, d));

    // the capture spiral, one turn per path (depth sets alpha + width)
    ctx.strokeStyle = colors.fg;
    for (let i = TURNS - 1; i >= 0; i--) {
      const zMid = (i + 0.5) * DZ;
      const dm = zMid - cam.z;
      if (dm > FAR || dm < NEAR - DZ) continue;
      const a = depthAlpha(Math.max(NEAR, dm)) * reveal * exit;
      if (a < 0.01) continue;
      ctx.globalAlpha = 0.62 * a;
      ctx.lineWidth = clamp(0.5 + 1.2 / Math.max(0.2, dm), 0.5, 3.4);
      ctx.beginPath();
      let pen = false;
      for (let j = 0; j <= SPOKES; j++) {
        const k = i * SPOKES + j;
        const p = project(ox[k], oy[k], oz[k], c, s);
        if (!p.d) {
          pen = false;
          continue;
        }
        const x = p.x;
        const y = p.y;
        if (!pen) {
          ctx.moveTo(x, y);
          pen = true;
          continue;
        }
        // capture silk sags toward the axis between spokes
        const k0 = k - 1;
        const q = project((ox[k0] + ox[k]) * 0.47, (oy[k0] + oy[k]) * 0.47, (oz[k0] + oz[k]) / 2, c, s);
        if (q.d) ctx.quadraticCurveTo(q.x, q.y, x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // spokes: along the tube, so they read as the web's radials
      ctx.globalAlpha = 0.34 * a;
      ctx.lineWidth = clamp(0.4 + 0.8 / Math.max(0.2, dm), 0.4, 2.4);
      ctx.beginPath();
      for (let j = 0; j < SPOKES; j++) {
        const k = i * SPOKES + j;
        const p = project(ox[k], oy[k], oz[k], c, s);
        if (!p.d) continue;
        const x1 = p.x;
        const y1 = p.y;
        const q = project(ox[k + SPOKES], oy[k + SPOKES], oz[k + SPOKES], c, s);
        if (!q.d) continue;
        ctx.moveTo(x1, y1);
        ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
    }

    // streaks: loose threads blurred along z by the camera's speed
    const len = 0.05 + clamp(speed * 0.06, 0, 1.4);
    for (const st of geo.streaks) {
      const d = st.z - cam.z;
      if (d < NEAR || d > FAR * 0.7) continue;
      const a = depthAlpha(d) * reveal * exit * (0.25 + clamp(speed * 0.08, 0, 0.75));
      if (a < 0.02) continue;
      const p = project(st.ox, st.oy, st.z, c, s);
      const x1 = p.x;
      const y1 = p.y;
      const q = project(st.ox, st.oy, st.z + len, c, s);
      if (!q.d) continue;
      ctx.globalAlpha = a;
      ctx.strokeStyle = st.hot ? colors.accent : colors.fg;
      ctx.lineWidth = clamp(1.4 / d, 0.4, 3);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }

    // dew on the spiral
    for (const dw of geo.dew) {
      const d = oz[dw.k] - cam.z;
      if (d < 0.15 || d > FAR * 0.6) continue;
      const p = project(ox[dw.k], oy[dw.k], oz[dw.k], c, s);
      if (!p.d || p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) continue;
      const glint = 0.5 + 0.5 * Math.sin(time * 2.4 + dw.phase);
      ctx.globalAlpha = depthAlpha(d) * reveal * exit * (0.35 + 0.65 * glint);
      dew(ctx, p, clamp((0.018 * f) / d, 0.8, 7), colors.muted, colors.fg);
    }

    // the web across the tunnel's end, its hub torn open onto the stage
    const dEnd = Z_END - cam.z;
    if (dEnd > NEAR && dEnd < FAR) {
      const a = (1 - sstep(FAR * 0.55, FAR, dEnd)) * reveal * exit;
      if (a > 0.01) {
        ctx.save();
        if (irisState.r > 0.5) {
          ctx.beginPath();
          ctx.rect(0, 0, w, h);
          ctx.arc(irisState.x, irisState.y, irisState.r, 0, Math.PI * 2);
          ctx.clip("evenodd");
        }
        ctx.strokeStyle = colors.fg;
        ctx.globalAlpha = 0.7 * a;
        ctx.lineWidth = clamp(0.6 + 1 / dEnd, 0.6, 2.6);
        ctx.beginPath();
        const { radials, rings } = geo.end;
        for (let j = 0; j < radials.length; j++) {
          const p0 = project(0, 0, Z_END, c, s);
          const x0 = p0.x;
          const y0 = p0.y;
          const p1 = project(radials[j].x, radials[j].y, Z_END, c, s);
          ctx.moveTo(x0, y0);
          ctx.lineTo(p1.x, p1.y);
        }
        for (const ring of rings) {
          for (let j = 0; j < ring.length; j++) {
            const A = ring[j];
            const B = ring[(j + 1) % ring.length];
            const p0 = project(A.x, A.y, Z_END, c, s);
            const x0 = p0.x;
            const y0 = p0.y;
            const q = project((A.x + B.x) * 0.47, (A.y + B.y) * 0.47, Z_END, c, s);
            const qx = q.x;
            const qy = q.y;
            const p1 = project(B.x, B.y, Z_END, c, s);
            ctx.moveTo(x0, y0);
            ctx.quadraticCurveTo(qx, qy, p1.x, p1.y);
          }
        }
        ctx.stroke();
        ctx.restore();

        // the torn hub: a bright rim of silk around the opening
        if (irisState.r > 0.5) {
          ctx.save();
          ctx.globalAlpha = 0.9 * exit;
          ctx.strokeStyle = colors.accent;
          ctx.shadowColor = colors.accent;
          ctx.shadowBlur = 18;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(irisState.x, irisState.y, irisState.r + 1, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        } else {
          const hp = project(0, 0, Z_END, c, s);
          ctx.globalAlpha = a;
          dew(ctx, hp, clamp((0.03 * f) / dEnd, 2, 9), colors.accent, colors.ground);
        }
      }
    }
    ctx.globalAlpha = 1;
  };

  const render = () => {
    layout();
    draw();
    drewFrame = gsap.ticker.frame;
  };

  /* the ticker only keeps the tunnel alive while the camera hangs mid-flight */
  const tick = (_t: number, deltaTime: number) => {
    const dt = Math.min(0.05, Math.max(0.001, deltaTime / 1000));
    time += dt;
    setCamera(e);
    const v = Math.abs(cam.z - prevCz) / dt;
    prevCz = cam.z;
    speed += (v - speed) * (1 - Math.pow(1 - 0.2, dt * 60));
    if (gsap.ticker.frame !== drewFrame) draw();
  };

  const activate = () => {
    if (active) return;
    active = true;
    colors = themeColors();
    section.setAttribute("data-tunnel", "");
    gsap.ticker.add(tick);
  };

  const clearDom = () => {
    if (hero) {
      hero.style.removeProperty("transform");
      hero.style.removeProperty("transform-origin");
      hero.style.removeProperty("clip-path");
      hero.style.removeProperty("opacity");
    }
    stageEl.style.removeProperty("transform");
    stageEl.style.removeProperty("clip-path");
  };

  const deactivate = () => {
    if (!active) return;
    active = false;
    gsap.ticker.remove(tick);
    section.removeAttribute("data-tunnel");
    clearDom();
    speed = 0;
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  return {
    update(next: number) {
      e = clamp(next);
      if (e <= 0.0005 || e >= 0.9995) {
        deactivate();
        return;
      }
      activate();
      render();
    },
    destroy() {
      deactivate();
      window.removeEventListener("resize", resize);
      canvas.remove();
    },
  };
}

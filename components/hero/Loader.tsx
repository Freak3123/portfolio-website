"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { COLOR } from "@/lib/hero/constants";

/**
 * The opening, after Codrops' "3D Particle Explorations" (2017), demo 2: dots
 * and the lines between them making a network, seen through a perspective
 * camera that then dollies in on z. Here the network is an orb web — spokes and
 * rings round a hub, with a looser plexus caught in it — and the dolly doesn't
 * stop: it flies *through* the hub, the threads streak past like hyperspace,
 * and the ink ground breaks into cells that open onto the portrait (the
 * staggered-grid exit of Codrops' "Ideas for Pixel Page Transitions", 2023).
 *
 * As those cells start to open it fires `hero:handoff`, and the portrait's own
 * entrance — the same cell grammar, in the shader — plays underneath. The two
 * are meant to read as one move.
 *
 * It never blocks content: only a plain ink cover is server-rendered, and CSS
 * lifts it after 4s if JS never comes (none at all with <noscript>); it
 * takes no pointer events, and a timeout finishes it whatever happens to rAF.
 */

/** ms. The full run for a first visit; the short one for a return in-session. */
const FULL = {
  dots: [0, 900],
  lines: [200, 1450],
  zoom: [1400, 2450],
  wipe: [2100, 2850],
  handoff: 2060,
  end: 2900,
} as const;
const QUICK = {
  dots: [0, 180],
  lines: [60, 380],
  zoom: [320, 900],
  wipe: [700, 1100],
  handoff: 660,
  end: 1150,
} as const;
type Phases = typeof FULL | typeof QUICK;

const SPOKES = 14;
const RINGS = 6;
const PLEXUS = 36;
/** camera distance at rest; also the focal length, so z=0 projects at scale 1 */
const D0 = 3;
const NEAR = 0.06;

interface Node {
  x: number;
  y: number;
  z: number;
  /** ms, when the dot appears */
  at: number;
}
interface Link {
  a: number;
  b: number;
  /** ms, when the thread starts drawing from a toward b */
  at: number;
}
interface Cell {
  x: number;
  y: number;
  /** ms, when the ink here clears */
  at: number;
}

const noop = () => () => {};

export default function Loader({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // client-only without a setState-in-effect: false on the server and through
  // hydration, true after — so the portal never mismatches the server HTML
  const client = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!client || !canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen = false;
    try {
      seen = sessionStorage.getItem("hero-seen") === "1";
    } catch {
      /* private windows throw; treat as unseen */
    }

    let done = false;
    let handed = false;
    const handoff = () => {
      if (handed) return;
      handed = true;
      window.dispatchEvent(new Event("hero:handoff"));
    };
    const ctx = canvas.getContext("2d");
    // the server-rendered ink (Hero.tsx) stands in until this canvas paints
    const cover = document.querySelector<HTMLElement>(".hero-cover");
    const uncover = () => {
      if (cover) cover.style.display = "none";
    };
    const finish = () => {
      if (done) return;
      done = true;
      try {
        sessionStorage.setItem("hero-seen", "1");
      } catch {
        /* ignore */
      }
      handoff();
      uncover();
      // Clear, don't merely fade. An opacity transition can be interrupted by a
      // re-mount (StrictMode does exactly that in dev) and leave the last frame
      // painted over the hero for the rest of the visit.
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      setGone(true);
      onDone();
    };

    // reduced motion: no loader at all, and no entrance either (the engine
    // ignores the handoff when reduced)
    if (reduced || !ctx) {
      const t = setTimeout(finish, 0);
      return () => clearTimeout(t);
    }

    // Returning visitors in the same session get the short cut of the same
    // film, not nothing: the web still lands and still opens onto her.
    const P: Phases = seen ? QUICK : FULL;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // seeded, so the same web builds every time — it should not look random
    let s = 20260926;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

    /* ── the web, in world units (outer ring ≈ 1) ─────────────────────────── */
    const span = (p: readonly [number, number], f: number) => p[0] + (p[1] - p[0]) * f;
    const nodes: Node[] = [{ x: 0, y: 0, z: 0.32, at: P.dots[0] }];
    const idx = (k: number, sp: number) => 1 + k * SPOKES + ((sp + SPOKES) % SPOKES);
    for (let k = 0; k < RINGS; k++) {
      const rk = 0.16 + (k / (RINGS - 1)) * 0.84;
      for (let sp = 0; sp < SPOKES; sp++) {
        const r = rk + (rnd() - 0.5) * 0.06;
        const a = (sp / SPOKES) * Math.PI * 2 + k * 0.02 + (rnd() - 0.5) * 0.05;
        nodes.push({
          x: Math.cos(a) * r,
          y: Math.sin(a) * r,
          // a shallow cone: the hub stands nearest the camera, so on the dolly
          // the middle rushes past first and the rim last
          z: 0.3 * (1 - r) + (rnd() - 0.5) * 0.12,
          // appear ring by ring, sweeping round — the web spun outward
          at: span(P.dots, Math.min(1, 0.06 + 0.66 * (k / RINGS) + 0.2 * (sp / SPOKES) + 0.06 * rnd())),
        });
      }
    }
    const plexus0 = nodes.length;
    for (let i = 0; i < PLEXUS; i++) {
      const r = 0.3 + rnd() * 1.3;
      const a = rnd() * Math.PI * 2;
      nodes.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        z: -0.5 + rnd() * 0.9,
        at: span(P.dots, 0.12 + 0.85 * rnd()),
      });
    }

    const links: Link[] = [];
    const lineDur = (P.lines[1] - P.lines[0]) * 0.22;
    const link = (a: number, b: number, lag: number) => {
      const at = Math.max(nodes[a].at, nodes[b].at, P.lines[0]) + lag;
      links.push({ a, b, at: Math.min(at, P.lines[1] - lineDur) });
    };
    const lag = (P.lines[1] - P.lines[0]) * 0.1;
    for (let sp = 0; sp < SPOKES; sp++) {
      link(0, idx(0, sp), 0);
      for (let k = 0; k < RINGS - 1; k++) link(idx(k, sp), idx(k + 1, sp), 0);
    }
    for (let k = 0; k < RINGS; k++) {
      for (let sp = 0; sp < SPOKES; sp++) {
        // a few gaps in the outer rings, so it reads spun rather than plotted
        if (k > 0 && rnd() < 0.12) continue;
        link(idx(k, sp), idx(k, sp + 1), lag);
      }
    }
    // the plexus: each loose dot catches on its two nearest neighbours
    for (let i = plexus0; i < nodes.length; i++) {
      const p = nodes[i];
      nodes
        .map((q, j) => ({ j, d: Math.hypot(q.x - p.x, q.y - p.y) }))
        .filter((o) => o.j !== i && o.d < 0.5)
        .sort((a, b) => a.d - b.d)
        .slice(0, 2)
        .forEach((o) => link(i, o.j, lag * 2));
    }

    /* ── screen ─────────────────────────────────────────────────────────── */
    let W = 0,
      H = 0,
      R = 1,
      cx = 0,
      cy = 0;
    let cells: Cell[] = [];
    let cell = 48;
    const size = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(W, H) * 0.44;
      // her face, by the renderer's own fit — the web lands where the portrait's
      // entrance starts (INTRO.centre)
      const ph = Math.min(H * 0.88, W * 1.2);
      const pw = ph * (2 / 3);
      cx = (W - pw) / 2 + 0.47 * pw;
      cy = H - ph + 0.34 * ph;

      // the exit grid: nearest the hub opens first, with a random spread so it
      // breaks up rather than irising
      cell = Math.max(44, Math.round(Math.min(W, H) / 11));
      const nx = Math.ceil(W / cell);
      const ny = Math.ceil(H / cell);
      const far = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
      let cs = 7;
      const crnd = () => ((cs = (cs * 1664525 + 1013904223) >>> 0) / 4294967296);
      cells = [];
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const d = Math.hypot((i + 0.5) * cell - cx, (j + 0.5) * cell - cy) / far;
          cells.push({ x: i * cell, y: j * cell, at: span(P.wipe, 0.55 * d + 0.4 * crnd()) });
        }
      }
    };
    size();

    /* ── camera ─────────────────────────────────────────────────────────── */
    const zoomAt = (ms: number) => {
      const u = clamp((ms - P.zoom[0]) / (P.zoom[1] - P.zoom[0]));
      // a slow push while it builds, then an accelerating dolly through the hub
      const push = 0.25 * ease(clamp(ms / P.zoom[0]));
      return D0 - push - 3.1 * u * u * u;
    };
    let yaw = 0,
      pitch = 0;
    const proj = (n: Node, D: number) => {
      const cyaw = Math.cos(yaw),
        syaw = Math.sin(yaw);
      const cp = Math.cos(pitch),
        sp = Math.sin(pitch);
      const x = n.x * cyaw + n.z * syaw;
      const z1 = -n.x * syaw + n.z * cyaw;
      const y = n.y * cp - z1 * sp;
      const z = n.y * sp + z1 * cp;
      const depth = D - z;
      if (depth < NEAR) return null;
      const k = Math.min(40, D0 / depth);
      return { x: cx + x * R * k, y: cy + y * R * k, k };
    };

    const t0 = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const ms = now - t0;
      ctx.clearRect(0, 0, W, H);

      // the web turns face-on as it finishes, so the dolly goes straight in
      const settle = ease(clamp(ms / P.zoom[0]));
      yaw = (seen ? 0.1 : 0.38) * (1 - settle);
      pitch = (seen ? 0.05 : 0.2) * (1 - settle);

      const D = zoomAt(ms);
      const zk = clamp((ms - P.zoom[0]) / (P.zoom[1] - P.zoom[0]));
      const Dprev = zoomAt(ms - (P.zoom[1] - P.zoom[0]) * 0.07);

      /* the ground: whole until the wipe, then only the cells not yet open —
         and the web is clipped to those same cells, so it leaves with them */
      const wiping = ms >= P.wipe[0];
      ctx.save();
      if (wiping) {
        ctx.beginPath();
        for (const c of cells) if (ms < c.at) ctx.rect(c.x, c.y, cell, cell);
        ctx.clip();
      }
      ctx.fillStyle = COLOR.ink;
      ctx.fillRect(0, 0, W, H);

      const pts = nodes.map((n) => proj(n, D));

      /* threads — thicker and brighter as they come at you */
      ctx.lineCap = "round";
      ctx.strokeStyle = COLOR.saffron;
      for (const l of links) {
        const k = ease(clamp((ms - l.at) / lineDur));
        if (k <= 0.01) continue;
        const p = pts[l.a],
          q = pts[l.b];
        if (!p || !q) continue;
        const depthK = (p.k + q.k) / 2;
        ctx.globalAlpha = Math.min(0.9, 0.32 + 0.5 * zk) * fadeOut(zk);
        ctx.lineWidth = Math.min(7, 0.8 * depthK);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + (q.x - p.x) * k, p.y + (q.y - p.y) * k);
        ctx.stroke();
      }

      /* the dolly's streaks: every dot drawn from where it was a moment ago to
         where it is now. Three passes, pushed radially apart and added, for the
         chromatic split — saffron thrown outward, paper pulled in. */
      if (zk > 0) {
        ctx.globalCompositeOperation = "lighter";
        const passes: [string, number][] = [
          [COLOR.saffron, 1 + 0.035 * zk],
          [COLOR.paper, 1],
          [COLOR.inkMuted, 1 - 0.03 * zk],
        ];
        for (const [color, rk] of passes) {
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.55 * Math.min(1, zk * 3) * fadeOut(zk);
          nodes.forEach((n, i) => {
            const p = pts[i];
            const q = proj(n, Dprev);
            if (!p || !q || ms < n.at) return;
            ctx.lineWidth = Math.min(6, 0.9 * p.k);
            ctx.beginPath();
            ctx.moveTo(cx + (q.x - cx) * rk, cy + (q.y - cy) * rk);
            ctx.lineTo(cx + (p.x - cx) * rk, cy + (p.y - cy) * rk);
            ctx.stroke();
          });
        }
        ctx.globalCompositeOperation = "source-over";
      }

      /* dots, one by one, each with a small overshoot as it lands */
      ctx.fillStyle = COLOR.paper;
      nodes.forEach((n, i) => {
        const p = pts[i];
        const a = clamp((ms - n.at) / 160);
        if (!p || a <= 0) return;
        ctx.globalAlpha = Math.min(1, a * 1.4) * 0.85 * fadeOut(zk);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.min(10, 1.6 * p.k) * pop(a), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.restore();

      /* each cell announces itself as it goes: a hairline square that flares
         and fades across its opening */
      if (wiping) {
        ctx.strokeStyle = COLOR.saffron;
        ctx.lineWidth = 1;
        for (const c of cells) {
          const d = (ms - c.at) / 140;
          if (d < -0.6 || d > 1) continue;
          ctx.globalAlpha = 0.5 * (1 - Math.abs(d));
          ctx.strokeRect(c.x + 0.5, c.y + 0.5, cell - 1, cell - 1);
        }
        ctx.globalAlpha = 1;
      }

      if (ms >= P.handoff) handoff();
      if (ms < P.end) {
        raf = requestAnimationFrame(frame);
      } else {
        finish();
      }
    };
    // paint the ink synchronously, so there is no transparent first frame
    frame(t0);
    uncover();

    // whatever happens to rAF (a background tab, a throw), this ends
    const safety = setTimeout(finish, P.end + 2500);
    window.addEventListener("resize", size);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(safety);
      window.removeEventListener("resize", size);
      ctx.clearRect(0, 0, W, H);
    };
  }, [onDone, client]);

  if (!client || gone) return null;
  return createPortal(
    <canvas ref={ref} className="hero-loader" aria-hidden="true" />,
    document.body,
  );
}

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
/** a landing with a little overshoot */
const pop = (t: number) => t * (1 + 0.6 * Math.sin(t * Math.PI));
/** everything the camera has flown past is gone by the end of the dolly */
const fadeOut = (zk: number) => 1 - clamp((zk - 0.75) / 0.25);

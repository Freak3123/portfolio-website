"use client";

import { useEffect, useRef } from "react";
import type { HeroEngine } from "@/lib/hero/engine";
import {
  faceZone,
  haloFade,
  haloGeom,
  inZone,
  markPaths,
  sizeCanvas,
  trackPointer,
  warmth,
  watchHeroState,
  watchOnScreen,
  webPerches,
  type Halo,
  type Perch,
  type Pointer,
} from "./heroEnv";
import { rng } from "./verlet";

/**
 * What lives in each world, drawn on one canvas and crossfaded with the wipe.
 *
 * cold — a thinking network, after the D3 force-directed graph
 *   (observablehq.com/@d3/force-directed-graph), with a hand-rolled sim in the
 *   same terms: velocity decay, a held alpha, link springs, short-range charge,
 *   and forceX/forceY toward a home. Most nodes are homed on the halo ring and
 *   orbit with it (they took over the plain dots Ambient used to carry), a few
 *   drift in the side margins. Nodes near the cursor pull in and link up into a
 *   small constellation, each one flaring as it joins; now and then a pulse
 *   runs along a link and sometimes carries on to the next — a thought moving.
 *
 * warm — a few butterflies after Matt Cool's Cursor Monarchs
 *   (mattcool.tech/posts/cursor-monarchs): each picks a waypoint and flies to it
 *   with capped speed and steering force; while the cursor is about, waypoints
 *   are picked round it. Every so often one lands — on a corner web or her
 *   shoulder — folds its wings and rests until it is disturbed. Paint specks,
 *   tiny stars and doodles drift up through the margins.
 *
 * Both keep out of her face: ring nodes dissolve through the bottom arc like
 * the halo, and particles and waypoints are placed outside an ellipse measured
 * off her head and hair.
 */

/* ── cold: the graph ─────────────────────────────────────────────────────── */
type Node = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** ring nodes: orbit parameters, same shape as Ambient's */
  ring: boolean;
  r: number;
  speed: number;
  phase: number;
  /** field nodes: home in stage fractions, and a slow wander round it */
  fx: number;
  fy: number;
  idea: boolean;
  op: number;
  /** 0…1 flare, decays */
  lit: number;
  near: boolean;
};
type Link = { a: number; b: number; rest: number };
type Pulse = { link: Link; from: number; t: number; hops: number };

const SIM = { velocityDecay: 0.4, alpha: 0.3, home: 0.05, link: 0.35, charge: -26, chargeRange: 70 };
const REACH = { cursor: 150, pair: 118 };
/** the ring's shared turn, rad/s */
const RING_SPEED = 0.045;

/* ── warm: monarchs ──────────────────────────────────────────────────────── */
type Fly = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  heading: number;
  flap: number;
  size: number;
  state: "fly" | "land" | "rest";
  perch: Perch | null;
  ox: number;
  oy: number;
  rest: number;
  airborne: number;
  tint: number;
};
/** saffron darkened toward umber — reads on the saffron ground, stays in family */
const WING = [
  ["#D9900C", "#B86A08"],
  ["#E3A01A", "#C07410"],
  ["#CC7F0A", "#A85E06"],
];
const INK = "#0a101a";

type Speck = { x: number; y: number; vx: number; vy: number; life: number; age: number; kind: number; c: string; s: number; rot: number };
const SPECK_COLOURS = ["#F0553F", "#39AEB0", "#8C4A1E", "#0A101A", "#FFFFFF", "#C83B2E"];

/** her shoulders, off the warm art — the sweater's top edge either side */
const SHOULDERS = [
  { u: 0.2, v: 0.53 },
  { u: 0.89, v: 0.61 },
];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export default function HeroLife({ engine }: { engine: HeroEngine }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !host || !ctx) return;

    const reduced = engine.reduced;
    const rnd = rng(20260928);
    const ptr: Pointer = { x: 0, y: 0, vx: 0, vy: 0, on: false, last: 0 };
    let w = 0;
    let h = 0;
    let dpr = 1;
    let narrow = false;
    let onScreen = true;
    let dirty = true;
    let t = 0;
    let built = "";

    let nodes: Node[] = [];
    let links: Link[] = [];
    const pulses: Pulse[] = [];
    let nextPulse = 1.5;
    let flies: Fly[] = [];
    let specks: Speck[] = [];

    /* ── build ─────────────────────────────────────────────────────────── */
    const build = () => {
      const ringN = narrow ? 11 : 15;
      const fieldN = narrow ? 3 : 8;
      nodes = [];
      // pulses point into the old links
      pulses.length = 0;
      for (let i = 0; i < ringN; i++) {
        nodes.push({
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          ring: true,
          r: 0.8 + rnd() * 0.4,
          speed: 0.2 + rnd() * 0.35,
          phase: (i / ringN) * Math.PI * 2 + rnd() * 0.3,
          fx: 0,
          fy: 0,
          idea: i % 4 === 0,
          op: 0,
          lit: 0,
          near: false,
        });
      }
      for (let i = 0; i < fieldN; i++) {
        const left = i % 2 === 0;
        nodes.push({
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          ring: false,
          r: 0,
          speed: 0.1 + rnd() * 0.15,
          phase: rnd() * Math.PI * 2,
          fx: left ? 0.04 + rnd() * 0.2 : 0.76 + rnd() * 0.2,
          fy: 0.42 + rnd() * 0.45,
          idea: i % 3 === 0,
          op: 0,
          lit: 0,
          near: false,
        });
      }
      // homes first, so the springs are built at their natural length
      placeHomes(0);
      nodes.forEach((n) => {
        n.x = homeX(n);
        n.y = homeY(n);
      });
      links = [];
      const link = (a: number, b: number) =>
        links.push({ a, b, rest: Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y) });
      // ring: each to its nearest neighbour by angle, plus a few chords
      const order = nodes
        .map((n, i) => ({ i, a: ((n.phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), ring: n.ring }))
        .filter((o) => o.ring)
        .sort((p, q) => p.a - q.a);
      for (let k = 0; k < order.length; k++) {
        if (k % 3 !== 2) link(order[k].i, order[(k + 1) % order.length].i);
        if (k % 5 === 0) link(order[k].i, order[(k + 2) % order.length].i);
      }
      // field: each to its nearest field neighbour
      const field = nodes.map((n, i) => ({ n, i })).filter((o) => !o.n.ring);
      field.forEach(({ n, i }) => {
        let best = -1;
        let bd = Infinity;
        field.forEach(({ n: m, i: j }) => {
          if (j === i) return;
          const d = Math.hypot(n.x - m.x, n.y - m.y);
          if (d < bd) {
            bd = d;
            best = j;
          }
        });
        if (best >= 0 && !links.some((l) => (l.a === best && l.b === i) || (l.a === i && l.b === best))) link(i, best);
      });

      // monarchs
      const flyN = narrow ? 3 : 5;
      flies = Array.from({ length: flyN }, (_, i) => {
        const p = airPoint();
        return {
          x: p.x,
          y: p.y,
          vx: 0,
          vy: 0,
          tx: p.x,
          ty: p.y,
          heading: 0,
          flap: rnd() * Math.PI * 2,
          size: (narrow ? 0.85 : 1.05) * (0.85 + rnd() * 0.3),
          state: "fly" as const,
          perch: null,
          ox: 0,
          oy: 0,
          rest: 0,
          airborne: rnd() * 4,
          tint: i % WING.length,
        };
      });
      specks = Array.from({ length: narrow ? 9 : 18 }, () => spawnSpeck(true));
    };

    /* ── homes ──────────────────────────────────────────────────────────── */
    let halo: Halo | null = null;
    let zone = faceZone(engine);
    const placeHomes = (time: number) => {
      halo = haloGeom(engine, w) ?? { cx: w / 2, cy: h * 0.28, rx: Math.min(w * 0.4, 300), ry: 150 };
      zone = faceZone(engine);
      tHome = time;
    };
    let tHome = 0;
    /* The ring turns as one, slowly, and each node wanders a little round its
       place on it. Ambient's orbiters run at independent speeds, but these are
       tied by springs: a shared rotation keeps the links near their rest
       length, so what shows is the graph's own give rather than a tug-of-war. */
    const ringAngle = (n: Node) => tHome * RING_SPEED + n.phase + Math.sin(tHome * n.speed + n.phase * 2) * 0.12;
    const ringR = (n: Node) => n.r * (1 + Math.sin(tHome * n.speed * 1.3 + n.phase) * 0.05);
    const homeX = (n: Node) => {
      if (n.ring && halo) return halo.cx + Math.cos(ringAngle(n)) * halo.rx * ringR(n);
      return n.fx * w + Math.sin(tHome * n.speed + n.phase) * 18;
    };
    const homeY = (n: Node) => {
      if (n.ring && halo) return halo.cy + Math.sin(ringAngle(n)) * halo.ry * ringR(n);
      return n.fy * h + Math.cos(tHome * n.speed * 0.8 + n.phase) * 14;
    };

    /** somewhere in the air, outside her head, in the upper two thirds */
    const airPoint = () => {
      for (let k = 0; k < 8; k++) {
        const x = 24 + rnd() * (w - 48);
        const y = 30 + rnd() * h * 0.62;
        if (!inZone(zone, x, y)) return { x, y };
      }
      return { x: rnd() < 0.5 ? w * 0.12 : w * 0.88, y: h * 0.3 };
    };

    function spawnSpeck(anyAge: boolean): Speck {
      const p = airPoint();
      const life = 7 + rnd() * 7;
      return {
        x: p.x,
        y: p.y + h * 0.2,
        vx: 0,
        vy: -(0.12 + rnd() * 0.22),
        life,
        age: anyAge ? rnd() * life : 0,
        kind: rnd() < 0.5 ? 0 : rnd() < 0.6 ? 1 : 2,
        c: SPECK_COLOURS[Math.floor(rnd() * SPECK_COLOURS.length)],
        s: 0.6 + rnd() * 0.9,
        rot: rnd() * Math.PI * 2,
      };
    }

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      narrow = w < 700;
      dpr = sizeCanvas(canvas, w, h);
      dirty = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const rebuildIfNeeded = () => {
      const k = `${w}|${h}|${Math.round(engine.fit.x)}|${Math.round(engine.fit.w)}`;
      if (k === built || w < 2) return;
      built = k;
      build();
      dirty = true;
    };

    /* ── cold sim ───────────────────────────────────────────────────────── */
    const stepGraph = (dt: number) => {
      placeHomes(t);
      const a = SIM.alpha;
      const k = dt * 60;
      for (const n of nodes) {
        n.vx += (homeX(n) - n.x) * SIM.home * a * k;
        n.vy += (homeY(n) - n.y) * SIM.home * a * k;
      }
      for (const l of links) {
        const A = nodes[l.a];
        const B = nodes[l.b];
        const dx = B.x + B.vx - A.x - A.vx;
        const dy = B.y + B.vy - A.y - A.vy;
        const d = Math.hypot(dx, dy) || 1;
        const m = ((d - l.rest) / d) * SIM.link * a * 0.5 * k;
        A.vx += dx * m;
        A.vy += dy * m;
        B.vx -= dx * m;
        B.vy -= dy * m;
      }
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const A = nodes[i];
          const B = nodes[j];
          const dx = B.x - A.x;
          const dy = B.y - A.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > SIM.chargeRange ** 2 || d2 < 1) continue;
          const m = (SIM.charge * a * k) / d2;
          A.vx += dx * m;
          A.vy += dy * m;
          B.vx -= dx * m;
          B.vy -= dy * m;
        }
      // the cursor as an attractor with a hard core: ideas gather, never pile up
      for (const n of nodes) {
        const was = n.near;
        n.near = false;
        if (!ptr.on || n.op < 0.15) continue;
        const dx = ptr.x - n.x;
        const dy = ptr.y - n.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > REACH.cursor) continue;
        n.near = true;
        if (!was) n.lit = 1;
        const pull = d > 46 ? 0.06 : -0.12;
        n.vx += (dx / d) * pull * (REACH.cursor - d) * 0.05 * k;
        n.vy += (dy / d) * pull * (REACH.cursor - d) * 0.05 * k;
      }
      const decay = Math.pow(1 - SIM.velocityDecay, k);
      for (const n of nodes) {
        n.vx *= decay;
        n.vy *= decay;
        n.x += n.vx * k;
        n.y += n.vy * k;
        n.lit = Math.max(0, n.lit - dt * 0.9);
        n.op = nodeOpacity(n);
      }

      // pulses: one every second or two, sometimes carrying on to a neighbour
      nextPulse -= dt;
      if (nextPulse <= 0 && pulses.length < 4 && links.length) {
        nextPulse = 1.1 + rnd() * 1.6;
        const l = links[Math.floor(rnd() * links.length)];
        if (Math.min(nodes[l.a].op, nodes[l.b].op) > 0.3) pulses.push({ link: l, from: rnd() < 0.5 ? l.a : l.b, t: 0, hops: 0 });
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.t += dt / 0.9;
        if (p.t < 1) continue;
        const to = p.link.a === p.from ? p.link.b : p.link.a;
        nodes[to].lit = Math.max(nodes[to].lit, 0.8);
        pulses.splice(i, 1);
        if (p.hops < 3 && rnd() < 0.55) {
          const next = links.filter((l) => l !== p.link && (l.a === to || l.b === to));
          if (next.length) pulses.push({ link: next[Math.floor(rnd() * next.length)], from: to, t: 0, hops: p.hops + 1 });
        }
      }
    };

    const nodeOpacity = (n: Node) => {
      if (!n.ring || !halo) return 0.75;
      return haloFade(clamp((n.y - halo.cy) / (halo.ry * n.r), -1, 1));
    };

    const drawGraph = (alpha: number) => {
      ctx.lineCap = "round";
      // standing links — faint, and fading with the ring
      ctx.strokeStyle = "#fdbf28";
      ctx.lineWidth = 0.8;
      for (const l of links) {
        const A = nodes[l.a];
        const B = nodes[l.b];
        const o = Math.min(A.op, B.op);
        if (o < 0.02) continue;
        ctx.globalAlpha = alpha * o * 0.22;
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.stroke();
      }
      // the constellation round the cursor: every near pair within reach
      const near = nodes.filter((n) => n.near);
      ctx.lineWidth = 0.9;
      for (let i = 0; i < near.length; i++)
        for (let j = i + 1; j < near.length; j++) {
          const A = near[i];
          const B = near[j];
          const d = Math.hypot(A.x - B.x, A.y - B.y);
          if (d > REACH.pair) continue;
          const fromCursor = Math.min(
            Math.hypot(A.x - ptr.x, A.y - ptr.y),
            Math.hypot(B.x - ptr.x, B.y - ptr.y),
          );
          ctx.globalAlpha =
            alpha * Math.min(A.op, B.op) * (1 - d / REACH.pair) * (1 - fromCursor / REACH.cursor) * 0.9;
          ctx.beginPath();
          ctx.moveTo(A.x, A.y);
          ctx.lineTo(B.x, B.y);
          ctx.stroke();
        }
      // pulses — a paper bead with a short saffron tail
      for (const p of pulses) {
        const A = nodes[p.from];
        const B = nodes[p.link.a === p.from ? p.link.b : p.link.a];
        const e = p.t * p.t * (3 - 2 * p.t);
        const x = A.x + (B.x - A.x) * e;
        const y = A.y + (B.y - A.y) * e;
        const o = Math.min(A.op, B.op);
        const tail = Math.max(0, e - 0.12);
        ctx.globalAlpha = alpha * o * 0.7;
        ctx.strokeStyle = "#fdbf28";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(A.x + (B.x - A.x) * tail, A.y + (B.y - A.y) * tail);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.globalAlpha = alpha * o;
        ctx.fillStyle = "#f3efe7";
        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      // nodes: plain dots, and 'ideas' as a ring round a dot
      for (const n of nodes) {
        if (n.op < 0.02) continue;
        ctx.globalAlpha = alpha * n.op;
        ctx.fillStyle = "#fdbf28";
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.idea ? 1.6 : 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#fdbf28";
        ctx.lineWidth = 0.9;
        if (n.idea) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, 4.2 + Math.sin(t * 1.4 + n.phase) * 0.6, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (n.lit > 0.01) {
          // a flare: a ring opening out and thinning as the idea lands
          ctx.globalAlpha = alpha * n.op * n.lit * 0.7;
          ctx.beginPath();
          ctx.arc(n.x, n.y, 3 + (1 - n.lit) * 11, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };

    /* ── warm sim ───────────────────────────────────────────────────────── */
    const shoulderPerches = (): Perch[] =>
      engine.fit.w > 1
        ? SHOULDERS.map((s) => ({ x: engine.fit.x + s.u * engine.fit.w, y: engine.fit.y + s.v * engine.fit.h }))
        : [];

    const pickTarget = (f: Fly) => {
      const cursorFresh = ptr.on && performance.now() - ptr.last < 2500;
      // after a while aloft, sometimes come in to land
      if (f.airborne > 6 && rnd() < 0.3) {
        const taken = new Set(flies.map((o) => o.perch).filter(Boolean));
        const options = [...webPerches, ...shoulderPerches()].filter((p) => !taken.has(p) && p.x > 8 && p.x < w - 8);
        if (options.length) {
          f.perch = options[Math.floor(rnd() * options.length)];
          f.ox = (rnd() - 0.5) * 6;
          f.oy = -2 - rnd() * 3;
          f.state = "land";
          return;
        }
      }
      if (cursorFresh && rnd() < 0.75) {
        // round the cursor, as the monarchs do — but not onto her face
        const a = rnd() * Math.PI * 2;
        const r = 50 + rnd() * 90;
        let x = ptr.x + Math.cos(a) * r;
        let y = ptr.y + Math.sin(a) * r;
        if (inZone(zone, x, y)) {
          const ang = Math.atan2((y - zone.cy) / zone.ry, (x - zone.cx) / zone.rx);
          x = zone.cx + Math.cos(ang) * zone.rx * 1.08;
          y = zone.cy + Math.sin(ang) * zone.ry * 1.08;
        }
        f.tx = clamp(x, 16, w - 16);
        f.ty = clamp(y, 16, h - 40);
        return;
      }
      const p = airPoint();
      f.tx = p.x;
      f.ty = p.y;
    };

    const stepFlies = (dt: number) => {
      const k = dt * 60;
      for (const f of flies) {
        if (f.state === "rest" && f.perch) {
          f.x = f.perch.x + f.ox;
          f.y = f.perch.y + f.oy;
          f.rest -= dt;
          const startled = ptr.on && Math.hypot(ptr.x - f.x, ptr.y - f.y) < 60;
          if (f.rest <= 0 || startled) {
            f.state = "fly";
            f.perch = null;
            f.airborne = 0;
            f.vy = -2.2;
            f.vx = (rnd() - 0.5) * 2;
            pickTarget(f);
          }
          f.flap += dt * 1.2;
          continue;
        }
        f.airborne += dt;
        const tx = f.state === "land" && f.perch ? f.perch.x + f.ox : f.tx;
        const ty = f.state === "land" && f.perch ? f.perch.y + f.oy : f.ty;
        const dx = tx - f.x;
        const dy = ty - f.y;
        const d = Math.hypot(dx, dy) || 1;
        // seek with arrival — slow in the last stretch, so landings settle
        const maxSpeed = (narrow ? 1.8 : 2.3) * f.size;
        const want = d < 50 ? maxSpeed * (d / 50) + 0.2 : maxSpeed;
        let sx = (dx / d) * want - f.vx;
        let sy = (dy / d) * want - f.vy;
        const maxForce = 0.09;
        const sm = Math.hypot(sx, sy);
        if (sm > maxForce) {
          sx = (sx / sm) * maxForce;
          sy = (sy / sm) * maxForce;
        }
        // the flutter: butterflies never fly a straight line
        const wob = Math.sin(t * 3.1 + f.tint * 2 + f.x * 0.01) * 0.06;
        f.vx += (sx - f.vy * wob) * k;
        f.vy += (sy + f.vx * wob + Math.sin(f.flap) * 0.04) * k;
        const sp = Math.hypot(f.vx, f.vy);
        if (sp > maxSpeed) {
          f.vx = (f.vx / sp) * maxSpeed;
          f.vy = (f.vy / sp) * maxSpeed;
        }
        f.x += f.vx * k;
        f.y += f.vy * k;
        const target = Math.atan2(f.vy, f.vx) + Math.PI / 2;
        let dh = target - f.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        f.heading += dh * Math.min(1, 0.12 * k);
        f.flap += dt * (f.state === "land" && d < 30 ? 9 : 15);

        if (d < (f.state === "land" ? 3 : 16)) {
          if (f.state === "land" && f.perch) {
            f.state = "rest";
            f.rest = 3 + rnd() * 5;
            f.vx = f.vy = 0;
            // a landing on the web tugs its thread
            if (webPerches.includes(f.perch)) f.perch.y += 2.5;
            // settle facing up the thread, roughly
            f.heading = (rnd() - 0.5) * 0.8;
          } else pickTarget(f);
        }
        if (f.state === "fly" && rnd() < 0.002 * k) pickTarget(f);
      }
    };

    const wing = (s: number, open: number, tint: number) => {
      const [fore, hind] = WING[tint];
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.scale(side * open, 1);
        ctx.beginPath();
        ctx.moveTo(0, -1);
        ctx.bezierCurveTo(4 * s, -9 * s, 11 * s, -10 * s, 10.5 * s, -3 * s);
        ctx.bezierCurveTo(9.5 * s, 0, 4 * s, 1 * s, 0, 0);
        ctx.fillStyle = fore;
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 0.5);
        ctx.bezierCurveTo(6 * s, 1 * s, 9 * s, 5 * s, 6 * s, 8.5 * s);
        ctx.bezierCurveTo(3 * s, 10.5 * s, 1 * s, 5 * s, 0, 1.5);
        ctx.fillStyle = hind;
        ctx.fill();
        ctx.stroke();
        // a vein, and the monarch's pale edge spots
        ctx.beginPath();
        ctx.moveTo(0.5, -0.5);
        ctx.quadraticCurveTo(5 * s, -4 * s, 9.5 * s, -4 * s);
        ctx.stroke();
        ctx.restore();
      }
    };

    const drawFlies = (alpha: number) => {
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (const f of flies) {
        const resting = f.state === "rest";
        // folded at rest, with the slow open–close a resting butterfly does
        const open = resting
          ? 0.14 + 0.5 * Math.max(0, Math.sin(f.flap)) ** 6
          : 0.2 + 0.8 * Math.abs(Math.sin(f.flap));
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(f.x, f.y);
        ctx.rotate(f.heading);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 0.9;
        wing(f.size, open, f.tint);
        // pale spots near the forewing tips, when the wings show
        if (open > 0.35) {
          ctx.fillStyle = "#fff3c4";
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.arc(side * open * 8.6 * f.size, -5.5 * f.size, 0.7, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.ellipse(0, 1.5 * f.size, 1.1, 5 * f.size, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-0.4, -3.2 * f.size);
        ctx.quadraticCurveTo(-2 * f.size, -7 * f.size, -3 * f.size, -8.5 * f.size);
        ctx.moveTo(0.4, -3.2 * f.size);
        ctx.quadraticCurveTo(2 * f.size, -7 * f.size, 3 * f.size, -8.5 * f.size);
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };

    const stepSpecks = (dt: number) => {
      const k = dt * 60;
      for (let i = 0; i < specks.length; i++) {
        const s = specks[i];
        s.age += dt;
        if (s.age > s.life) {
          specks[i] = spawnSpeck(false);
          continue;
        }
        s.x += (Math.sin(t * 0.8 + s.rot) * 0.18 + s.vx) * k;
        s.y += s.vy * k;
        s.rot += dt * 0.4;
      }
    };

    const drawSpecks = (alpha: number) => {
      const marks = markPaths();
      for (const s of specks) {
        const u = s.age / s.life;
        const fade = Math.min(1, u * 5, (1 - u) * 4);
        const o = fade * (inZone(zone, s.x, s.y) ? 0.25 : 0.7);
        if (o < 0.02) continue;
        ctx.globalAlpha = alpha * o;
        if (s.kind === 0) {
          // a paint speck: a lopsided blot
          ctx.fillStyle = s.c;
          ctx.beginPath();
          ctx.ellipse(s.x, s.y, 1.6 * s.s + 0.6, 1.2 * s.s + 0.5, s.rot, 0, Math.PI * 2);
          ctx.fill();
        } else if (s.kind === 1) {
          // a tiny four-point sparkle
          const L = 2.5 + s.s * 2;
          ctx.strokeStyle = s.c === "#FFFFFF" ? "#FFFFFF" : INK;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(s.x - L, s.y);
          ctx.lineTo(s.x + L, s.y);
          ctx.moveTo(s.x, s.y - L);
          ctx.lineTo(s.x, s.y + L);
          ctx.stroke();
        } else {
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(s.rot);
          ctx.scale(0.55 * s.s, 0.55 * s.s);
          ctx.translate(-6, -6);
          ctx.strokeStyle = s.c;
          ctx.lineWidth = 1.5 / (0.55 * s.s);
          ctx.lineCap = "round";
          ctx.stroke(marks[Math.floor(s.rot * 10) % 2 === 0 ? 0 : 1]);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    };

    /* ── the still frame for reduced motion ─────────────────────────────── */
    const restPose = () => {
      placeHomes(0);
      nodes.forEach((n) => {
        n.x = homeX(n);
        n.y = homeY(n);
        n.op = nodeOpacity(n);
      });
      const perches = [...webPerches, ...shoulderPerches()];
      flies.forEach((f, i) => {
        const p = perches[(i * 2) % Math.max(1, perches.length)];
        if (p) {
          f.state = "rest";
          f.perch = p;
          f.x = p.x;
          f.y = p.y - 3;
        }
        f.heading = 0;
        f.flap = Math.PI / 2;
      });
    };

    const draw = (mix: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (mix < 0.99) drawGraph(1 - mix);
      if (mix > 0.01) {
        drawSpecks(mix);
        drawFlies(mix);
      }
    };

    const offPtr = trackPointer(host, ptr);
    const offVis = watchOnScreen(host, (v) => (onScreen = v));
    const offState = watchHeroState(() => (dirty = true));

    const offTick = engine.onTick((dt) => {
      if (!onScreen) return;
      rebuildIfNeeded();
      const mix = warmth(engine);
      if (reduced) {
        if (dirty) {
          restPose();
          draw(mix);
        }
        dirty = false;
        return;
      }
      t += dt;
      // only the world on screen is simulated; the other waits where it was
      if (mix < 0.99) stepGraph(dt);
      if (mix > 0.01) {
        stepFlies(dt);
        stepSpecks(dt);
      }
      draw(mix);
    });

    return () => {
      offTick();
      offPtr();
      offVis();
      offState();
      ro.disconnect();
    };
  }, [engine]);

  return <canvas ref={ref} className="hero-life" aria-hidden="true" />;
}

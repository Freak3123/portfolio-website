"use client";

/**
 * CONNECT — skills as dew drops on a web, silk to the projects they built.
 *
 * Elements → references
 *  - Node graph of skills ↔ projects: Awwwards SOTD force-directed / node-graph
 *      interactive visualisations.
 *  - Hover/focus a drop → its strands light to its projects, those projects'
 *      other skills glow, the rest dims: Awwwards "hover highlighting of
 *      connected nodes".
 *  - Lit strands draw themselves along their length: Awwwards SVG line drawing.
 *  - A short organic cluster of neighbouring drops sparks around the one you
 *      touch: L2 animation-reference/hover-for-newbg/12 (light the nearest cell,
 *      then random-walk 1…clusterSize neighbours, each with a short lifetime).
 *  - Cursor velocity nudges the drops, which spring back: L6
 *      animation-reference/physics/19 (push = v·force·(1−d/r)³, neighbour
 *      influence = 0.2^|i−j|, spring 0.05, friction 0.85, cursor smoothing 0.75).
 *  - Idle: a slow autonomous trace hops node → project → node so the graph is
 *      alive untouched — the same highlight, driven by a walker (Awwwards
 *      node-graph pattern, as above).
 *  - sound.chime per lit connection, throttled.
 *  - IDEA BOARD — the visitor ties their own threads: drag one drop onto
 *      another (or select one with Tab+Enter, then another) and a taut thread
 *      twangs in with a pluck. Nodes run a gentle force simulation after
 *      D3's force-directed graph (observablehq.com/@d3/force-directed-graph):
 *      forceX/Y home springs, forceLink springs for every user thread (rest
 *      length 0.8x so it reads taut), forceCollide between drops, and d3-drag
 *      semantics (the dragged node is pinned to the pointer, fx/fy, and
 *      rejoins the simulation on release). As threads accumulate a capture
 *      spiral is spun between the linked nodes (orb-web grammar,
 *      lib/web/draw.ts); at THREAD_GOAL the web is complete and rings out.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { strandPath } from "@/lib/web/draw";
import { journey } from "@/lib/journey/journey";
import { sound } from "@/lib/audio/sound";
import { prefersReducedMotion } from "@/lib/motion/gsap";
import { GROUPS, PROJECTS, projectsOf } from "./data";
import {
  LAYOUTS,
  TALL_QUERY,
  edgePath,
  groupMembers,
  radialPath,
  ringPath,
  type GraphNode,
  type Layout,
} from "./layout";


/* L6 constants (physics/19), scaled to this viewBox */
const RADIUS = 170;
const PUSH = 3.2;
const NEIGHBOUR = 0.2;
const SPRING = 0.05;
const FRICTION = 0.85;
const SMOOTH = 0.75;
const MAX_OFFSET = 46;
/* L2 constants (hover-for-newbg/12) */
const CLUSTER = 4;
const SPARK_LIFE = 520;
/* idle trace */
const IDLE_AFTER = 3200;
const IDLE_HOP = 1700;
/* idea board (D3 force-directed graph, scaled to this viewBox) */
const THREAD_GOAL = 12;
const LINK_K = 0.014; // forceLink strength
const LINK_TAUT = 0.8; // rest length as a share of the resting distance
const COLLIDE = 20; // forceCollide radius (x scale)
const DRAG_START = 5; // px before a press becomes a drag
const SNAP = 30; // drop-target radius (x scale)
const SPIN_RINGS = 6;

type Link = readonly [number, number];
const linkKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

const f1 = (v: number) => v.toFixed(1);

function labelFor(node: GraphNode, NODES: GraphNode[]) {
  if (node.kind === "skill") {
    const ps = node.projects.map((p) => NODES[p].name);
    return ps.length ? `${node.name} — used in ${ps.join(", ")}` : node.name;
  }
  return `${node.name} — built with ${node.skills.map((s) => NODES[s].name).join(", ")}`;
}

/**
 * One rendering of the web. ConnectGraph renders the wide and the tall layout;
 * CSS shows one, and only the visible one runs its motion.
 */
type BoardProps = {
  links: readonly Link[];
  /** tie a thread between two nodes; false when it already exists */
  onLink: (a: number, b: number) => boolean;
  onSay: (msg: string) => void;
};

/** the capture spiral spun between the linked nodes (orb-web grammar) */
function spunPaths(pts: { x: number; y: number }[]) {
  if (pts.length < 3) return { radials: "", spiral: "" };
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const ring = [...pts].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  const m = ring.length;
  let radials = "";
  for (const p of ring) radials += `M${f1(cx)} ${f1(cy)} L${f1(p.x)} ${f1(p.y)} `;
  let spiral = "";
  const total = SPIN_RINGS * m;
  for (let i = 0; i <= total; i++) {
    const fr = 0.14 + 0.76 * (i / total);
    const p = ring[i % m];
    spiral += `${i ? "L" : "M"}${f1(cx + (p.x - cx) * fr)} ${f1(cy + (p.y - cy) * fr)} `;
  }
  return { radials: radials.trim(), spiral: spiral.trim() };
}

function WebGraph({ layout: L, links, onLink, onSay }: { layout: Layout } & BoardProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const linksRef = useRef(links);
  const board = useRef({ onLink, onSay, relink: () => {} });
  useEffect(() => {
    board.current.onLink = onLink;
    board.current.onSay = onSay;
  }, [onLink, onSay]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const api = board.current;
    const { NODES, EDGES, SKILLS, PROJECT_NODES, HUBS } = L;
    const reduced = prefersReducedMotion();
    const mq = window.matchMedia(TALL_QUERY);
    const isShown = () => (L.kind === "tall") === mq.matches;
    const radius = RADIUS * L.scale;
    const maxOffset = MAX_OFFSET * L.scale;

    const nodeEls = NODES.map((n) => svg.querySelector<SVGGElement>(`[data-n="${n.n}"]`)!);
    const edgeEls = EDGES.map((_, e) => svg.querySelector<SVGPathElement>(`[data-e="${e}"]`)!);
    const radialEls = SKILLS.map((s) => svg.querySelector<SVGPathElement>(`[data-r="${s.n}"]`)!);
    const ringEls = GROUPS.map((_, g) => svg.querySelector<SVGPathElement>(`[data-ring="${g}"]`)!);
    const spunRadials = svg.querySelector<SVGPathElement>(".cn-spun-radials")!;
    const spunSpiral = svg.querySelector<SVGPathElement>(".cn-spun-spiral")!;
    const threadEls = () => Array.from(svg.querySelectorAll<SVGPathElement>(".cn-thread"));
    const members = GROUPS.map((_, g) => groupMembers(L, g));
    /** node n → index in SKILLS */
    const si = new Map(SKILLS.map((s, i) => [s.n, i]));

    /* ── highlight ─────────────────────────────────────────────────── */
    const lit = new Set<Element>();
    let shown: number | null = null;
    let hovered: number | null = null;
    let pinned: number | null = null;
    let idleOn = false;
    const chimeTimers: number[] = [];
    let lastChime = 0;

    const mark = (el: Element, v: string) => {
      el.setAttribute("data-lit", v);
      lit.add(el);
    };
    const clearLit = () => {
      for (const el of lit) el.removeAttribute("data-lit");
      lit.clear();
      svg.removeAttribute("data-focus");
      svg.removeAttribute("data-lit-group");
      shown = null;
    };
    const chime = (pitch: number, delay: number) => {
      chimeTimers.push(
        window.setTimeout(() => {
          const now = performance.now();
          if (now - lastChime < 70) return;
          lastChime = now;
          sound.chime(pitch);
        }, delay),
      );
    };

    /** L2: light the touched drop's neighbours in a short random walk */
    const spark = (n: number) => {
      const node = NODES[n];
      if (node.kind !== "skill" || reduced) return;
      const ring = members[node.group];
      const count = Math.floor(Math.random() * CLUSTER) + 1;
      const active = new Set([node.k]);
      let cur = node.k;
      for (let i = 0; i < count; i++) {
        const nb = [cur - 1, cur + 1]
          .map((k) => (k + ring.length) % ring.length)
          .filter((k) => !active.has(k));
        if (!nb.length) break;
        cur = nb[Math.floor(Math.random() * nb.length)];
        active.add(cur);
        const el = nodeEls[ring[cur].n];
        el.setAttribute("data-spark", "");
        window.setTimeout(() => el.removeAttribute("data-spark"), SPARK_LIFE + i * 60);
      }
    };

    const show = (n: number | null, withSound: boolean) => {
      if (n === shown) return;
      clearLit();
      for (const t of chimeTimers.splice(0)) clearTimeout(t);
      if (n === null) return;
      shown = n;
      svg.setAttribute("data-focus", "");
      const node = NODES[n];
      if (node.kind === "skill") svg.setAttribute("data-lit-group", String(node.group));
      mark(nodeEls[n], "hot");
      if (node.kind === "skill") {
        for (const e of node.edges) mark(edgeEls[e], "hot");
        node.projects.forEach((p, i) => {
          const proj = NODES[p];
          mark(nodeEls[p], "hot");
          for (const e of proj.edges) if (!lit.has(edgeEls[e])) mark(edgeEls[e], "warm");
          if (proj.kind === "project") for (const s of proj.skills) if (s !== n) mark(nodeEls[s], "glow");
          if (withSound) chime(0.35 + PROJECT_NODES.findIndex((q) => q.n === p) * 0.14, i * 90);
        });
        mark(radialEls[si.get(n)!], "hot");
        if (!node.projects.length && withSound) chime(0.25 + node.group * 0.1, 0);
      } else {
        for (const e of node.edges) mark(edgeEls[e], "hot");
        node.skills.forEach((s, i) => {
          mark(nodeEls[s], "glow");
          if (withSound && i < 4) chime(0.4 + i * 0.1, i * 80);
        });
      }
    };

    const current = () => hovered ?? pinned;
    const nodeOf = (t: EventTarget | null) => {
      const el = (t as Element | null)?.closest?.("[data-n]");
      return el && svg.contains(el) ? Number(el.getAttribute("data-n")) : null;
    };

    let lastInteract = performance.now();
    const touch = () => {
      lastInteract = performance.now();
      if (idleOn) {
        idleOn = false;
        show(current(), false);
      }
    };

    const onOver = (e: PointerEvent) => {
      touch();
      const n = nodeOf(e.target);
      if (n === null || n === hovered) return;
      hovered = n;
      show(n, true);
      spark(n);
    };
    const onOut = (e: PointerEvent) => {
      const from = nodeOf(e.target);
      const to = nodeOf(e.relatedTarget);
      if (from === null || from === to) return;
      hovered = null;
      show(current(), false);
    };
    const onFocus = (e: FocusEvent) => {
      touch();
      const n = nodeOf(e.target);
      if (n === null) return;
      hovered = n;
      show(n, true);
      spark(n);
    };
    const onBlur = (e: FocusEvent) => {
      if (nodeOf(e.relatedTarget) !== null) return;
      hovered = null;
      show(current(), false);
    };
    const setPin = (n: number | null) => {
      pinned = n;
      for (const el of nodeEls) el.setAttribute("aria-pressed", "false");
      if (pinned !== null) nodeEls[pinned].setAttribute("aria-pressed", "true");
      show(current(), false);
    };
    /** select a node; with one already selected, tie a thread to it */
    const activate = (n: number) => {
      const say = board.current.onSay;
      if (pinned === null) {
        setPin(n);
        say(`${NODES[n].name} selected. Choose another drop to tie a thread to it, or press Escape.`);
      } else if (pinned === n) {
        setPin(null);
        say(`${NODES[n].name} released.`);
      } else {
        const from = pinned;
        setPin(null);
        if (!board.current.onLink(from, n)) say(`${NODES[from].name} and ${NODES[n].name} are already tied.`);
      }
    };
    let dragged = false;
    const onClick = (e: MouseEvent) => {
      if (dragged) {
        dragged = false;
        return;
      }
      const n = nodeOf(e.target);
      if (n !== null) activate(n);
    };
    const onKey = (e: KeyboardEvent) => {
      touch();
      if (e.key === "Escape" && pinned !== null) {
        setPin(null);
        board.current.onSay("Selection cleared.");
        return;
      }
      if (e.key !== "Enter" && e.key !== " ") return;
      const n = nodeOf(e.target);
      if (n === null) return;
      e.preventDefault();
      activate(n);
    };

    /* ── L6: cursor velocity push ──────────────────────────────────── */
    const cursor = { x: -1e4, y: -1e4, vx: 0, vy: 0, in: false };
    /** every node, by n (skills come first, so SKILLS[i].n === i) */
    const pos = NODES.map((s) => ({ x: s.rest.x, y: s.rest.y, vx: 0, vy: 0 }));
    const collide = COLLIDE * L.scale;
    const snap = SNAP * L.scale;
    /* d3-drag: the dragged node is pinned to the pointer (fx/fy) */
    const drag = { n: -1, id: -1, x: 0, y: 0, cx: 0, cy: 0, on: false, target: -1 };
    /* thread twang: born time per link */
    const born = new Map<string, number>();
    for (const [a, b] of linksRef.current) born.set(linkKey(a, b), -1e9);
    let spin = 0;
    const spinTarget = () => {
      const ls = linksRef.current;
      const nodes = new Set(ls.flat());
      return nodes.size >= 3 ? Math.min(1, ls.length / THREAD_GOAL) : 0;
    };
    const toSvg = (e: PointerEvent) => {
      const m = svg.getScreenCTM();
      if (!m) return null;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      return { x: p.x, y: p.y };
    };
    const onMove = (e: PointerEvent) => {
      touch();
      const p = toSvg(e);
      if (!p) return;
      if (cursor.in) {
        cursor.vx = cursor.vx * SMOOTH + (p.x - cursor.x) * (1 - SMOOTH);
        cursor.vy = cursor.vy * SMOOTH + (p.y - cursor.y) * (1 - SMOOTH);
      }
      cursor.x = p.x;
      cursor.y = p.y;
      cursor.in = true;
    };
    const onLeave = () => {
      cursor.in = false;
      cursor.vx = cursor.vy = 0;
      if (hovered !== null) {
        hovered = null;
        show(current(), false);
      }
    };

    let settled = true;
    const step = () => {
      const speed = Math.hypot(cursor.vx, cursor.vy);
      const fx = new Float32Array(SKILLS.length);
      const fy = new Float32Array(SKILLS.length);
      if (speed >= 0.5 && cursor.in && !drag.on) {
        SKILLS.forEach((s, i) => {
          const d = Math.hypot(cursor.x - s.rest.x, cursor.y - s.rest.y);
          if (d > radius) return;
          const w = (1 - d / radius) ** 3;
          fx[i] = cursor.vx * PUSH * w;
          fy[i] = cursor.vy * PUSH * w;
        });
      }
      // forceLink (user threads) + forceCollide, as velocity nudges
      const ax = new Float32Array(NODES.length);
      const ay = new Float32Array(NODES.length);
      for (const [a, b] of linksRef.current) {
        const pa = pos[a];
        const pb = pos[b];
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const d = Math.hypot(dx, dy) || 1;
        const rest = Math.hypot(NODES[b].rest.x - NODES[a].rest.x, NODES[b].rest.y - NODES[a].rest.y);
        const want = Math.max(40 * L.scale, rest * LINK_TAUT);
        const k = ((d - want) / d) * LINK_K;
        ax[a] += dx * k;
        ay[a] += dy * k;
        ax[b] -= dx * k;
        ay[b] -= dy * k;
      }
      for (let i = 0; i < NODES.length; i++) {
        for (let j = i + 1; j < NODES.length; j++) {
          const dx = pos[j].x - pos[i].x;
          const dy = pos[j].y - pos[i].y;
          if (Math.abs(dx) > collide || Math.abs(dy) > collide) continue;
          const d = Math.hypot(dx, dy) || 0.01;
          if (d >= collide) continue;
          const k = ((collide - d) / d) * 0.06;
          ax[i] -= dx * k;
          ay[i] -= dy * k;
          ax[j] += dx * k;
          ay[j] += dy * k;
        }
      }
      let moving = false;
      PROJECT_NODES.forEach((s) => {
        const p = pos[s.n];
        if (drag.on && drag.n === s.n) return;
        p.vx = (p.vx + (s.rest.x - p.x) * SPRING + ax[s.n]) * FRICTION;
        p.vy = (p.vy + (s.rest.y - p.y) * SPRING + ay[s.n]) * FRICTION;
        p.x += p.vx;
        p.y += p.vy;
        if (Math.abs(p.vx) + Math.abs(p.vy) > 0.01 || Math.abs(p.x - s.rest.x) + Math.abs(p.y - s.rest.y) > 0.05)
          moving = true;
      });
      SKILLS.forEach((s, i) => {
        let tx = fx[i];
        let ty = fy[i];
        // neighbour influence within the same cluster, by distance in the orb
        for (const o of members[s.group]) {
          if (o.n === s.n) continue;
          const j = si.get(o.n)!;
          const fall = NEIGHBOUR ** Math.abs(o.k - s.k);
          tx += fx[j] * fall;
          ty += fy[j] * fall * 0.6;
        }
        const len = Math.hypot(tx, ty);
        if (len > maxOffset) {
          tx *= maxOffset / len;
          ty *= maxOffset / len;
        }
        const p = pos[i];
        if (drag.on && drag.n === s.n) return;
        p.vx = (p.vx + (s.rest.x + tx - p.x) * SPRING + ax[i]) * FRICTION;
        p.vy = (p.vy + (s.rest.y + ty - p.y) * SPRING + ay[i]) * FRICTION;
        p.x += p.vx;
        p.y += p.vy;
        if (Math.abs(p.vx) + Math.abs(p.vy) > 0.01 || Math.abs(p.x - s.rest.x) + Math.abs(p.y - s.rest.y) > 0.05)
          moving = true;
      });
      if (drag.on) {
        const p = pos[drag.n];
        p.x = drag.x;
        p.y = drag.y;
        p.vx = p.vy = 0;
        moving = true;
      }
      // twanging threads and a spiral still spinning keep the frame alive
      const now = performance.now();
      for (const t of born.values()) if (now - t < 1400) moving = true;
      const st = spinTarget();
      if (Math.abs(st - spin) > 0.001) {
        spin += (st - spin) * 0.035;
        moving = true;
      } else spin = st;
      cursor.vx *= 0.9;
      cursor.vy *= 0.9;
      return moving;
    };

    const paint = () => {
      NODES.forEach((s) => {
        const p = pos[s.n];
        nodeEls[s.n].setAttribute("transform", `translate(${f1(p.x)} ${f1(p.y)})`);
      });
      SKILLS.forEach((s, i) => radialEls[i].setAttribute("d", radialPath(HUBS[s.group], pos[i])));
      EDGES.forEach((e, k) => {
        edgeEls[k].setAttribute("d", edgePath(pos[e.s], pos[e.p]));
      });
      members.forEach((m, g) => ringEls[g].setAttribute("d", ringPath(m.map((s) => pos[si.get(s.n)!]))));
      // user threads: a plucked string whose control point rings and decays
      const now = performance.now();
      const ls = linksRef.current;
      threadEls().forEach((el, i) => {
        const l = ls[i];
        if (!l) return;
        const t = (now - (born.get(linkKey(l[0], l[1])) ?? -1e9)) / 1000;
        const amp = reduced || t > 1.4 ? 0 : 26 * L.scale * Math.exp(-t / 0.28) * Math.cos(t * 24);
        el.setAttribute("d", strandPath(pos[l[0]], pos[l[1]], 0, amp));
      });
      const web = spunPaths([...new Set(ls.flat())].map((n) => pos[n]));
      spunRadials.setAttribute("d", web.radials || "M0 0");
      spunSpiral.setAttribute("d", web.spiral || "M0 0");
      spunSpiral.style.strokeDashoffset = (1 - spin).toFixed(4);
      spunRadials.style.opacity = Math.min(1, spin * 4).toFixed(3);
    };
    api.relink = () => {
      const now = performance.now();
      const keys = new Set<string>();
      for (const [a, b] of linksRef.current) {
        const key = linkKey(a, b);
        keys.add(key);
        if (!born.has(key)) born.set(key, now);
      }
      for (const key of [...born.keys()]) if (!keys.has(key)) born.delete(key);
      settled = false;
      // no clock outside live mode (or with reduced motion): land at once
      if (!journey.live || reduced) {
        spin = spinTarget();
        paint();
      }
    };

    /* d3-drag: press a drop, carry it, drop it onto another to tie a thread */
    const nearest = (x: number, y: number, not: number) => {
      let best = -1;
      let bd = snap;
      for (const nd of NODES) {
        if (nd.n === not) continue;
        const d = Math.hypot(pos[nd.n].x - x, pos[nd.n].y - y);
        if (d < bd) {
          bd = d;
          best = nd.n;
        }
      }
      return best;
    };
    const setTarget = (n: number) => {
      if (n === drag.target) return;
      if (drag.target >= 0) nodeEls[drag.target].removeAttribute("data-target");
      drag.target = n;
      if (n >= 0) nodeEls[n].setAttribute("data-target", "");
    };
    const onDown = (e: PointerEvent) => {
      if (e.button > 0) return;
      const n = nodeOf(e.target);
      if (n === null) return;
      const p = toSvg(e);
      if (!p) return;
      drag.n = n;
      drag.id = e.pointerId;
      drag.cx = e.clientX;
      drag.cy = e.clientY;
      drag.x = p.x;
      drag.y = p.y;
      drag.on = false;
      dragged = false;
    };
    const onDragMove = (e: PointerEvent) => {
      if (drag.n < 0 || e.pointerId !== drag.id) return;
      if (!drag.on) {
        if (Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < DRAG_START) return;
        drag.on = true;
        dragged = true;
        try {
          nodeEls[drag.n].setPointerCapture(e.pointerId);
        } catch {
          /* pointer already gone */
        }
        svg.setAttribute("data-dragging", "");
      }
      const p = toSvg(e);
      if (!p) return;
      drag.x = p.x;
      drag.y = p.y;
      setTarget(nearest(p.x, p.y, drag.n));
      settled = false;
      if (!journey.live || reduced) {
        pos[drag.n].x = p.x;
        pos[drag.n].y = p.y;
        paint();
      }
    };
    const onUp = (e: PointerEvent) => {
      if (drag.n < 0 || e.pointerId !== drag.id) return;
      const n = drag.n;
      const target = drag.target;
      const was = drag.on;
      setTarget(-1);
      drag.n = -1;
      drag.on = false;
      svg.removeAttribute("data-dragging");
      if (!was) return;
      if (target >= 0 && !board.current.onLink(n, target))
        board.current.onSay(`${NODES[n].name} and ${NODES[target].name} are already tied.`);
      settled = false;
      if (!journey.live || reduced) {
        // nothing will spring it home without the clock
        pos[n].x = NODES[n].rest.x;
        pos[n].y = NODES[n].rest.y;
        paint();
      }
    };
    /** a press on a drop must not become a journey swipe */
    const onTouch = (e: TouchEvent) => {
      if (nodeOf(e.target) !== null) e.stopPropagation();
    };

    /* ── idle trace ────────────────────────────────────────────────── */
    let idleAt = 0;
    let walker: number | null = null;
    const hop = () => {
      const node = walker === null ? null : NODES[walker];
      let next: number;
      if (!node) {
        const linked = SKILLS.filter((s) => s.projects.length);
        next = linked[Math.floor(Math.random() * linked.length)].n;
      } else if (node.kind === "skill") {
        const ps = node.projects.length ? node.projects : PROJECT_NODES.map((p) => p.n);
        next = ps[Math.floor(Math.random() * ps.length)];
      } else {
        next = node.skills[Math.floor(Math.random() * node.skills.length)];
      }
      walker = next;
      idleOn = true;
      show(next, false);
    };

    const offTick = journey.subscribe((j, dt) => {
      if (!j.live) return;
      const fr = j.frame("connect");
      if (!fr.active || !isShown()) {
        if (idleOn) {
          idleOn = false;
          show(current(), false);
        }
        return;
      }
      if (!reduced) {
        const steps = Math.min(3, Math.max(1, Math.round(dt * 60)));
        let moving = false;
        for (let s = 0; s < steps; s++) moving = step() || moving;
        if (moving || !settled) paint();
        settled = !moving;
      }
      // idle trace only while resting on the chapter and untouched
      const now = performance.now();
      const resting = fr.presence > 0.98;
      const untouched = hovered === null && pinned === null && !svg.contains(document.activeElement);
      if (!reduced && resting && untouched && now - lastInteract > IDLE_AFTER) {
        if (now - idleAt > IDLE_HOP) {
          idleAt = now;
          hop();
        }
      } else if (idleOn && !resting) {
        idleOn = false;
        show(current(), false);
      }
    });

    svg.addEventListener("pointerover", onOver);
    svg.addEventListener("pointerout", onOut);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerleave", onLeave);
    svg.addEventListener("focusin", onFocus);
    svg.addEventListener("focusout", onBlur);
    svg.addEventListener("click", onClick);
    svg.addEventListener("keydown", onKey);
    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("pointermove", onDragMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
    svg.addEventListener("touchstart", onTouch, { passive: true });
    svg.addEventListener("touchmove", onTouch, { passive: true });

    return () => {
      offTick();
      for (const t of chimeTimers) clearTimeout(t);
      svg.removeEventListener("pointerover", onOver);
      svg.removeEventListener("pointerout", onOut);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerleave", onLeave);
      svg.removeEventListener("focusin", onFocus);
      svg.removeEventListener("focusout", onBlur);
      svg.removeEventListener("click", onClick);
      svg.removeEventListener("keydown", onKey);
      svg.removeEventListener("pointerdown", onDown);
      svg.removeEventListener("pointermove", onDragMove);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointercancel", onUp);
      svg.removeEventListener("touchstart", onTouch);
      svg.removeEventListener("touchmove", onTouch);
      api.relink = () => {};
    };
  }, [L]);

  useEffect(() => {
    linksRef.current = links;
    board.current.relink();
  }, [links]);

  const { W, H, CENTER, HUBS, NODES, EDGES, SKILLS, PROJECT_NODES, FRAME_PATH, SPOKE_PATHS, scale: k } = L;
  const r = (v: number) => f1(v * k);
  return (
    <svg
      ref={svgRef}
      className={`cn-svg cn-svg--${L.kind}`}
      viewBox={`0 0 ${W} ${H}`}
      role="group"
      aria-label="Skills web: each skill is linked by silk to the projects it was used in. Focus a skill to trace its connections; press Enter on one drop, then on another, to tie your own thread between them."
    >
      <g className="cn-frame" aria-hidden="true">
        <path d={FRAME_PATH} />
        {SPOKE_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
        <circle cx={CENTER.x} cy={CENTER.y} r={r(3)} />
      </g>

      <g className="cn-clusters" aria-hidden="true">
        {GROUPS.map((g, gi) => (
          <g key={g.id} className="cn-cluster">
            {groupMembers(L, gi).map((s) => (
              <path key={s.n} className="cn-radial" data-r={s.n} d={radialPath(HUBS[gi], s.rest)} />
            ))}
            <path className="cn-ring" data-ring={gi} d={ringPath(groupMembers(L, gi).map((s) => s.rest))} />
            <circle className="cn-hub" cx={f1(HUBS[gi].x)} cy={f1(HUBS[gi].y)} r={r(4)} />
            <text className="cn-hub-label" x={f1(HUBS[gi].x)} y={f1(HUBS[gi].y + 22 * k)} textAnchor="middle">
              {g.name}
            </text>
          </g>
        ))}
      </g>

      <g className="cn-edges" aria-hidden="true">
        {EDGES.map((e, i) => (
          <path key={i} className="cn-edge" data-e={i} d={edgePath(NODES[e.s].rest, NODES[e.p].rest)} pathLength={1} />
        ))}
      </g>

      <g className="cn-spun" aria-hidden="true">
        <path className="cn-spun-radials" d="M0 0" />
        <path className="cn-spun-spiral" d="M0 0" pathLength={1} />
      </g>

      <g className="cn-threads" aria-hidden="true">
        {links.map(([a, b]) => (
          <path key={linkKey(a, b)} className="cn-thread" d={strandPath(NODES[a].rest, NODES[b].rest)} pathLength={1} />
        ))}
      </g>

      <g className="cn-nodes">
        {PROJECT_NODES.map((p) => (
          <g
            key={p.n}
            className="cn-node cn-node--project"
            data-n={p.n}
            transform={`translate(${f1(p.rest.x)} ${f1(p.rest.y)})`}
            tabIndex={0}
            role="button"
            aria-pressed="false"
            aria-label={labelFor(p, NODES)}
          >
            <circle className="cn-hit" r={r(30)} />
            <circle className="cn-halo" r={r(17)} />
            <circle className="cn-core" r={r(7)} />
            <text className="cn-project-label" y={r(38)} textAnchor="middle">
              {p.name}
            </text>
          </g>
        ))}
        {SKILLS.map((s) => (
          <g
            key={s.n}
            className="cn-node cn-node--skill"
            data-n={s.n}
            data-g={s.group}
            transform={`translate(${f1(s.rest.x)} ${f1(s.rest.y)})`}
            tabIndex={0}
            role="button"
            aria-pressed="false"
            aria-label={labelFor(s, NODES)}
          >
            <circle className="cn-hit" r={r(15)} />
            <circle className="cn-dew" r={r(5.5)} />
            <circle className="cn-glint" cx={r(-1.9)} cy={r(-1.9)} r={r(1.6)} />
            <text className="cn-label" x={f1(s.label.dx)} y={f1(s.label.dy)} textAnchor={s.label.anchor}>
              {s.name}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

export default function ConnectGraph() {
  const [links, setLinks] = useState<Link[]>([]);
  const [said, setSaid] = useState("");
  const tied = useRef(new Set<string>());
  const complete = links.length >= THREAD_GOAL;

  const onLink = useCallback((a: number, b: number) => {
    const key = linkKey(a, b);
    if (a === b || tied.current.has(key)) return false;
    tied.current.add(key);
    const n = tied.current.size;
    setLinks((ls) => [...ls, [a, b] as const]);
    const names = LAYOUTS.wide.NODES;
    sound.pluck({ pitch: 0.2 + Math.min(1, n / THREAD_GOAL) * 0.7, gain: 0.6 });
    if (n === THREAD_GOAL) {
      [0.35, 0.55, 0.75, 0.95].forEach((p, i) => window.setTimeout(() => sound.chime(p), 260 + i * 150));
      setSaid(`Tied ${names[a].name} to ${names[b].name}. ${n} of ${THREAD_GOAL} threads: the web is complete.`);
    } else {
      setSaid(`Tied ${names[a].name} to ${names[b].name}. ${n} of ${THREAD_GOAL} threads.`);
    }
    return true;
  }, []);
  const reset = () => {
    tied.current.clear();
    setLinks([]);
    setSaid("Threads cut. The board is clear.");
    sound.tick();
  };

  return (
    <div className="cn-stage" data-complete={complete ? "" : undefined}>
      <p className="cn-hint" aria-hidden="true">
        drag a drop onto another · tie a thread
      </p>
      <div className="cn-board">
        <p className="cn-count">
          <span className="cn-count__n">{Math.min(links.length, THREAD_GOAL)}</span> / {THREAD_GOAL} threads
          {complete && <span className="cn-count__done"> · the web holds</span>}
        </p>
        {links.length > 0 && (
          <button type="button" className="cn-reset" onClick={reset}>
            Cut threads
          </button>
        )}
      </div>
      <p className="cn-live" aria-live="polite">
        {said}
      </p>
      <WebGraph layout={LAYOUTS.wide} links={links} onLink={onLink} onSay={setSaid} />
      <WebGraph layout={LAYOUTS.tall} links={links} onLink={onLink} onSay={setSaid} />

      {/* static mode: the same web as plain grouped lists */}
      <div className="cn-static">
        {GROUPS.map((g) => (
          <section key={g.id} className="cn-static__group" aria-label={g.name}>
            <h3 className="cn-static__name">{g.name}</h3>
            <ul>
              {g.skills.map((skill) => {
                const ps = projectsOf(skill);
                return (
                  <li key={skill}>
                    {skill}
                    {ps.length > 0 && <span className="cn-static__to"> → {ps.map((p) => p.name).join(", ")}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <p className="cn-static__projects">{PROJECTS.map((p) => p.name).join(" · ")}</p>
      </div>
    </div>
  );
}

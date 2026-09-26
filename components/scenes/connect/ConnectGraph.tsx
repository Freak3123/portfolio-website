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
 */

import { useEffect, useRef } from "react";
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
function WebGraph({ layout: L }: { layout: Layout }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
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
    const togglePin = (n: number) => {
      pinned = pinned === n ? null : n;
      for (const el of nodeEls) el.setAttribute("aria-pressed", "false");
      if (pinned !== null) nodeEls[pinned].setAttribute("aria-pressed", "true");
      show(current(), false);
    };
    const onClick = (e: MouseEvent) => {
      const n = nodeOf(e.target);
      if (n !== null) togglePin(n);
    };
    const onKey = (e: KeyboardEvent) => {
      touch();
      if (e.key !== "Enter" && e.key !== " ") return;
      const n = nodeOf(e.target);
      if (n === null) return;
      e.preventDefault();
      togglePin(n);
    };

    /* ── L6: cursor velocity push ──────────────────────────────────── */
    const cursor = { x: -1e4, y: -1e4, vx: 0, vy: 0, in: false };
    const pos = SKILLS.map((s) => ({ x: s.rest.x, y: s.rest.y, vx: 0, vy: 0 }));
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
      if (speed >= 0.5 && cursor.in) {
        SKILLS.forEach((s, i) => {
          const d = Math.hypot(cursor.x - s.rest.x, cursor.y - s.rest.y);
          if (d > radius) return;
          const w = (1 - d / radius) ** 3;
          fx[i] = cursor.vx * PUSH * w;
          fy[i] = cursor.vy * PUSH * w;
        });
      }
      let moving = false;
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
        p.vx = (p.vx + (s.rest.x + tx - p.x) * SPRING) * FRICTION;
        p.vy = (p.vy + (s.rest.y + ty - p.y) * SPRING) * FRICTION;
        p.x += p.vx;
        p.y += p.vy;
        if (Math.abs(p.vx) + Math.abs(p.vy) > 0.01 || Math.abs(p.x - s.rest.x) + Math.abs(p.y - s.rest.y) > 0.05)
          moving = true;
      });
      cursor.vx *= 0.9;
      cursor.vy *= 0.9;
      return moving;
    };

    const paint = () => {
      SKILLS.forEach((s, i) => {
        const p = pos[i];
        nodeEls[s.n].setAttribute("transform", `translate(${f1(p.x)} ${f1(p.y)})`);
        radialEls[i].setAttribute("d", radialPath(HUBS[s.group], p));
      });
      EDGES.forEach((e, k) => {
        edgeEls[k].setAttribute("d", edgePath(pos[si.get(e.s)!], NODES[e.p].rest));
      });
      members.forEach((m, g) => ringEls[g].setAttribute("d", ringPath(m.map((s) => pos[si.get(s.n)!]))));
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
    };
  }, [L]);

  const { W, H, CENTER, HUBS, NODES, EDGES, SKILLS, PROJECT_NODES, FRAME_PATH, SPOKE_PATHS, scale: k } = L;
  const r = (v: number) => f1(v * k);
  return (
    <svg
      ref={svgRef}
      className={`cn-svg cn-svg--${L.kind}`}
      viewBox={`0 0 ${W} ${H}`}
      role="group"
      aria-label="Skills web: each skill is linked by silk to the projects it was used in. Focus a skill to trace its connections."
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
  return (
    <div className="cn-stage">
      <p className="cn-hint" aria-hidden="true">
        touch a drop · follow the silk
      </p>
      <WebGraph layout={LAYOUTS.wide} />
      <WebGraph layout={LAYOUTS.tall} />

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

"use client";

/**
 * The web map — the overlay behind the nav's "Map" button.
 *
 * Elements, and where each one comes from (no element here is original):
 * - Full-screen overlay navigation that shows the whole site as a map and
 *   lets you jump to any part ...................... Awwwards SOTD overview-map navigation
 * - Staggered reveal of the overlay's items ......... Awwwards SOTD full-screen menu (staggered links)
 * - Line-drawing reveal (stroke-dashoffset) ......... Awwwards SOTD SVG line-draw staple
 * - Current location highlighted on the map ......... Awwwards overview-map "you are here"
 * - Tick sound on hover ............................. Awwwards SOTD sound design (UI ticks)
 * The web itself (orb-weaver, chapters as nodes, the spine thread) is the
 * user's spider/web theme, drawn with the shared silk vocabulary in
 * lib/web/draw.ts; the warm state swaps to its wobbly hand-drawn grammar.
 *
 * Pure presentation: SiteNav owns open/close, focus and navigation.
 */

import type { Ref } from "react";
import { CHAPTERS, type ChapterId } from "@/lib/journey/chapters";
import { orbWeb, strandPath, wobblyPath, type Pt } from "@/lib/web/draw";
import { sound } from "@/lib/audio/sound";

export type MapTarget = ChapterId | "home";

/* world box: chapters live in ±1000; home hangs above the prologue */
const VB = { x: -1100, y: -1180, w: 2200, h: 2060 };
const HOME: Pt = { x: 0, y: -1080 };

const NODES: { id: MapTarget; label: string; p: Pt }[] = [
  { id: "home", label: "Home", p: HOME },
  ...CHAPTERS.map((c) => ({ id: c.id as MapTarget, label: c.label, p: c.node })),
];

const web = orbWeb({ x: 0, y: 0 }, 960, { spokes: 16, rings: 9, seed: 11 });
const f = (n: number) => n.toFixed(1);
const poly = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${f(p.x)} ${f(p.y)}`).join(" ") + " Z";

const COLD = {
  radials: web.radials.map((r) => `M${f(web.center.x)} ${f(web.center.y)} L${f(r.x)} ${f(r.y)}`),
  rings: web.rings.map(poly),
};
const WARM = {
  radials: web.radials.map((r, i) => wobblyPath(web.center, r, 100 + i, 9, 8)),
  rings: web.rings.map((ring, k) =>
    ring
      .map((p, i) => wobblyPath(p, ring[(i + 1) % ring.length], 300 + k * 40 + i, 5, 3))
      .join(" "),
  ),
};
// the spine: home → every chapter in story order, with gravity sag
const SPINE = NODES.slice(1)
  .map((n, i) => strandPath(NODES[i].p, n.p, 60, 0))
  .join(" ");
const SPINE_WARM = NODES.slice(1)
  .map((n, i) => wobblyPath(NODES[i].p, n.p, 900 + i, 14, 10))
  .join(" ");

const pct = (p: Pt) => ({
  left: `${(((p.x - VB.x) / VB.w) * 100).toFixed(3)}%`,
  top: `${(((p.y - VB.y) / VB.h) * 100).toFixed(3)}%`,
});

type Props = {
  open: boolean;
  current: MapTarget;
  onPick: (id: MapTarget) => void;
  ref?: Ref<HTMLDivElement>;
};

export default function WebMap({ open, current, onPick, ref }: Props) {
  return (
    <div
      ref={ref}
      id="site-map"
      className="web-map"
      role="dialog"
      aria-modal="true"
      aria-labelledby="web-map-title"
      hidden={!open}
    >
      <h2 id="web-map-title" className="web-map-title mono" data-map-item>
        The whole web
      </h2>

      <div className="web-map-frame" style={{ aspectRatio: `${VB.w} / ${VB.h}` }}>
        <svg
          className="web-map-svg"
          viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
          aria-hidden="true"
          focusable="false"
        >
          <g className="web-map-cold">
            {COLD.radials.map((d, i) => (
              <path key={`r${i}`} d={d} pathLength={1} className="web-map-silk" data-draw="radial" />
            ))}
            {COLD.rings.map((d, i) => (
              <path key={`g${i}`} d={d} pathLength={1} className="web-map-silk" data-draw="ring" />
            ))}
            <path d={SPINE} pathLength={1} className="web-map-spine" data-draw="spine" />
          </g>
          <g className="web-map-warm">
            {WARM.radials.map((d, i) => (
              <path key={`r${i}`} d={d} pathLength={1} className="web-map-silk" data-draw="radial" />
            ))}
            {WARM.rings.map((d, i) => (
              <path key={`g${i}`} d={d} pathLength={1} className="web-map-silk" data-draw="ring" />
            ))}
            <path d={SPINE_WARM} pathLength={1} className="web-map-spine" data-draw="spine" />
          </g>
        </svg>

        <ol className="web-map-nodes">
          {NODES.map((n, i) => (
            <li key={n.id} className="web-map-node" style={pct(n.p)} data-map-node>
              <button
                type="button"
                className="web-map-btn"
                aria-current={current === n.id ? "location" : undefined}
                data-cursor="go"
                onPointerEnter={() => sound.tick()}
                onFocus={() => sound.tick()}
                onClick={() => {
                  sound.chime(0.25 + (i / NODES.length) * 0.6);
                  onPick(n.id);
                }}
              >
                <span className="web-map-dot" aria-hidden="true" />
                <span className="web-map-label">
                  <span className="web-map-num mono" aria-hidden="true">
                    {String(i).padStart(2, "0")}
                  </span>
                  {n.label}
                </span>
                {current === n.id ? <span className="sr-only"> (you are here)</span> : null}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

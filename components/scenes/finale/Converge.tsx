"use client";

/**
 * The final connection: every chapter's node sends a strand to the centre,
 * and the centre lights.
 *
 * Elements + reference sources:
 * - Strands line-drawn node → centre, staggered, then the hub lights ..........
 *   user's spider/web theme ("everything connected through that web"); the
 *   draw-on line is the Awwwards SVG line-drawing reveal.
 * - Chime cascade, one per strand, rising, then the hub ........................
 *   lib/audio/sound.ts chime ("a node lighting up / a connection made").
 * - Camera zoomed out on the whole web ..........................................
 *   Awwwards "zoom-out reveal" (the engine's finale zoom 0.55).
 *
 * The SVG lives in world units; in live mode only its viewBox follows the
 * camera each frame. When the hub lights, #finale gets data-told, which lets
 * the ending text reveal (finale.css). Static mode: everything drawn and lit.
 */

import { useEffect, useRef } from "react";
import { journey } from "@/lib/journey/journey";
import { RANGES } from "@/lib/journey/chapters";
import { strandPath } from "@/lib/web/draw";
import { sound } from "@/lib/audio/sound";

const HUB = RANGES[RANGES.length - 1].node;
const SPOKES = RANGES.filter((r) => r.id !== "finale").map((r, i) => ({
  id: r.id,
  node: r.node,
  d: strandPath(r.node, HUB, 36 + (i % 2) * 22),
}));

const STAGGER = 0.14;
const DRAW = 0.55;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export default function Converge() {
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const root = svg.current;
    const scene = document.getElementById("finale");
    if (!root || !scene) return;
    const paths = Array.from(root.querySelectorAll<SVGPathElement>(".fn-strand"));
    const nodes = Array.from(root.querySelectorAll<SVGCircleElement>(".fn-node"));
    const hub = root.querySelector<SVGGElement>(".fn-hub");

    let clock = -1; // −1 = not started
    let chimed = 0;
    let lit = false;

    const set = (p: number, i: number) => {
      paths[i]?.style.setProperty("stroke-dashoffset", (1 - p).toFixed(4));
      nodes[i]?.style.setProperty("opacity", String(0.35 + 0.65 * Math.min(1, p * 3)));
    };
    const reset = () => {
      clock = -1;
      chimed = 0;
      lit = false;
      paths.forEach((_, i) => set(0, i));
      hub?.removeAttribute("data-lit");
      delete scene.dataset.told;
    };

    let primed = false;

    const off = journey.subscribe((j, dt) => {
      if (!j.live) return;
      if (!primed) {
        // only once the stage is live: static mode keeps everything drawn
        primed = true;
        root.dataset.live = "";
        reset();
      }
      const f = j.frame("finale");
      if (f.presence <= 0) {
        if (clock >= 0) reset();
        return;
      }

      // follow the camera: viewBox = the world rectangle currently on screen
      const { w, h } = j.viewport;
      const s = j.camera.zoom * (h / 1000);
      const vw = w / s;
      const vh = h / s;
      root.setAttribute(
        "viewBox",
        `${(j.camera.x - vw / 2).toFixed(1)} ${(j.camera.y - vh / 2).toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`,
      );

      // start while the camera is still arriving, so the ending never keeps a visitor waiting
      if (clock < 0 && f.presence > 0.6) clock = 0;
      if (clock < 0) return;
      if (f.presence < 0.5) {
        reset();
        return;
      }
      clock += dt;

      for (let i = 0; i < paths.length; i++) {
        const t = (clock - i * STAGGER) / DRAW;
        set(easeOut(Math.min(1, Math.max(0, t))), i);
        if (t >= 1 && chimed === i) {
          chimed++;
          sound.chime(0.25 + (i / paths.length) * 0.5);
        }
      }
      const done = (paths.length - 1) * STAGGER + DRAW + 0.15;
      if (!lit && clock >= done) {
        lit = true;
        hub?.setAttribute("data-lit", "");
        scene.dataset.told = "";
        sound.chime(1);
      }
    });

    return () => {
      off();
      delete root.dataset.live;
      delete scene.dataset.told;
    };
  }, []);

  return (
    <svg
      ref={svg}
      className="fn-web"
      viewBox="-1000 -1000 2000 2000"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {SPOKES.map((s) => (
        <path key={s.id} className="fn-strand" d={s.d} pathLength={1} />
      ))}
      {SPOKES.map((s) => (
        <circle key={s.id} className="fn-node" cx={s.node.x} cy={s.node.y} r={9} />
      ))}
      <g className="fn-hub" data-lit="">
        <circle className="fn-hub-halo" cx={HUB.x} cy={HUB.y} r={60} />
        <circle className="fn-hub-core" cx={HUB.x} cy={HUB.y} r={16} />
      </g>
    </svg>
  );
}

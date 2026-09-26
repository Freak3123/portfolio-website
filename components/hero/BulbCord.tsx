"use client";

import { useEffect, useRef, useState } from "react";
import { BULB } from "@/lib/hero/constants";
import type { HeroEngine } from "@/lib/hero/engine";

/**
 * A pendant lamp: flex, holder, bulb.
 *
 * Nothing here is dragged and nothing stretches. The lamp hangs and sways —
 * brushing past gives it torque, throwing the switch gives it a kick, and
 * gravity and damping do the rest. **Clicking the bulb or the flex is the
 * switch**, which is one gesture fewer to discover than a pull ever was.
 */
export default function BulbCord({ engine }: { engine: HeroEngine }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const flex = useRef<SVGPathElement>(null);
  const flexHit = useRef<SVGPathElement>(null);
  const lamp = useRef<SVGGElement>(null);
  const [lit, setLit] = useState(true);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    let anchorX = 0;
    let len = 0;

    const measure = () => {
      const r = svg.getBoundingClientRect();
      anchorX = r.width * (r.width >= 900 ? 0.87 : 0.8);
      const [min, frac, max] = BULB.len;
      len = Math.max(min, Math.min(r.height * frac, max));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(svg);

    const off = engine.onTick(() => {
      const th = engine.bulbPendulum.theta;
      const bx = anchorX + Math.sin(th) * len;
      const by = Math.cos(th) * len;

      // sag, perpendicular to the flex's own line (L4)
      const mx = anchorX + Math.sin(th) * len * 0.5 + Math.cos(th) * th * len * 0.18;
      const my = by * 0.5 + len * 0.05;
      const d = `M${anchorX} -12 Q${mx.toFixed(2)} ${my.toFixed(2)} ${bx.toFixed(2)} ${by.toFixed(2)}`;
      flex.current?.setAttribute("d", d);
      flexHit.current?.setAttribute("d", d);

      // the lamp hangs along the flex, so it tilts with it
      lamp.current?.setAttribute(
        "transform",
        `translate(${bx.toFixed(2)} ${by.toFixed(2)}) rotate(${((th * 180) / Math.PI).toFixed(2)})`,
      );
      lamp.current?.style.setProperty("--lit", engine.bulbLit.toFixed(3));

      // tell the shader where the light is, in portrait uv
      if (engine.fit.w > 0) {
        engine.bulbPos = {
          x: (bx - engine.fit.x) / engine.fit.w,
          y: (by - engine.fit.y) / engine.fit.h,
        };
      }
    });

    return () => {
      off();
      ro.disconnect();
    };
  }, [engine]);

  useEffect(() => engine.onChange(() => setLit(engine.state === "cold")), [engine]);

  // stopPropagation so a click on the lamp does not also tear the layer
  const hit = {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      engine.toggle();
    },
  };

  const r = BULB.r;

  return (
    <>
      <svg ref={svgRef} className="hero-bulb" aria-hidden="true">
        <defs>
          <radialGradient id="bulbGlow">
            <stop offset="0" stopColor="#FDBF28" stopOpacity="0.72" />
            <stop offset="0.4" stopColor="#FDBF28" stopOpacity="0.16" />
            <stop offset="1" stopColor="#FDBF28" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="bulbGlass" x1="0.2" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#FFF3C4" />
            <stop offset="0.45" stopColor="#FFD35C" />
            <stop offset="1" stopColor="#E09A12" />
          </linearGradient>
          <linearGradient id="bulbCap" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#5A6069" />
            <stop offset="0.35" stopColor="#B9C0C8" />
            <stop offset="0.7" stopColor="#787F88" />
            <stop offset="1" stopColor="#4A5058" />
          </linearGradient>
        </defs>

        <path ref={flex} className="hero-cord" />

        <g ref={lamp} className="hero-bulb-body">
          <circle r={r * 9} className="hero-bulb-halo" fill="url(#bulbGlow)" />

          {/* holder: a ribbed screw cap under a short shoulder */}
          <path
            d={`M${-r * 0.44} ${-r * 0.55} h${r * 0.88} v${r * 0.34} h${-r * 0.88} z`}
            className="hero-bulb-collar"
          />
          <path
            d={`M${-r * 0.4} ${-r * 0.2} h${r * 0.8} l${-r * 0.06} ${r * 0.44} h${-r * 0.68} z`}
            className="hero-bulb-cap"
          />
          {[0, 1, 2].map((i) => (
            <line
              key={i}
              className="hero-bulb-thread"
              x1={-r * 0.36}
              x2={r * 0.36}
              y1={-r * 0.08 + i * r * 0.13}
              y2={-r * 0.08 + i * r * 0.13}
            />
          ))}

          {/* Glass: a pear, not a circle — the neck is what makes it a bulb.
              Two layers, because a single hot-yellow fill at reduced opacity
              still reads yellow when the lamp is off. The cold glass is always
              there; the hot gradient fades in on top of it. */}
          <path
            className="hero-bulb-glass-cold"
            d={`M${-r * 0.34} ${r * 0.26}
                C${-r * 0.4} ${r * 0.72}, ${-r} ${r * 0.9}, ${-r} ${r * 1.5}
                C${-r} ${r * 2.16}, ${-r * 0.54} ${r * 2.5}, 0 ${r * 2.5}
                C${r * 0.54} ${r * 2.5}, ${r} ${r * 2.16}, ${r} ${r * 1.5}
                C${r} ${r * 0.9}, ${r * 0.4} ${r * 0.72}, ${r * 0.34} ${r * 0.26} Z`}
          />
          <path
            className="hero-bulb-glass"
            d={`M${-r * 0.34} ${r * 0.26}
                C${-r * 0.4} ${r * 0.72}, ${-r} ${r * 0.9}, ${-r} ${r * 1.5}
                C${-r} ${r * 2.16}, ${-r * 0.54} ${r * 2.5}, 0 ${r * 2.5}
                C${r * 0.54} ${r * 2.5}, ${r} ${r * 2.16}, ${r} ${r * 1.5}
                C${r} ${r * 0.9}, ${r * 0.4} ${r * 0.72}, ${r * 0.34} ${r * 0.26} Z`}
          />
          {/* filament: two support wires and a coil between them */}
          <path
            className="hero-bulb-filament"
            d={`M${-r * 0.2} ${r * 0.5} V${r * 1.2}
                q${r * 0.1} ${-r * 0.42} ${r * 0.2} 0
                q${r * 0.1} ${r * 0.42} ${r * 0.2} 0
                V${r * 0.5}`}
          />
          <ellipse
            className="hero-bulb-shine"
            cx={-r * 0.34}
            cy={r * 1.3}
            rx={r * 0.16}
            ry={r * 0.42}
            transform={`rotate(-16 ${-r * 0.34} ${r * 1.3})`}
          />

          <circle cy={r * 1.4} r={r * 1.5} className="hero-bulb-hit" {...hit} />
        </g>

        {/* the flex is a switch too — a thin cord is a small target on its own */}
        <path ref={flexHit} className="hero-cord-grab" {...hit} />
      </svg>

      <button
        type="button"
        className="hero-bulb-button"
        aria-pressed={!lit}
        onClick={() => engine.toggle()}
      >
        {lit ? "Turn the work light off" : "Turn the work light on"}
      </button>
    </>
  );
}

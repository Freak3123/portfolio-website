"use client";

import { useEffect, useRef } from "react";
import type { HeroEngine } from "@/lib/hero/engine";
import { PortraitRenderer } from "@/lib/hero/renderer";

export default function PortraitCanvas({
  engine,
  onReady,
}: {
  engine: HeroEngine;
  onReady: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const host = canvas.parentElement!;

    let renderer: PortraitRenderer;
    try {
      renderer = new PortraitRenderer(canvas, engine);
    } catch (err) {
      // No WebGL2. The <picture> underneath is already correct and the bulb
      // still toggles — the site's actual thesis survives with no shader.
      if (process.env.NODE_ENV !== "production") console.error("[hero] gl init", err);
      return;
    }

    let alive = true;
    const ro = new ResizeObserver(() => {
      const r = host.getBoundingClientRect();
      renderer.resize(r.width, r.height);
    });

    const io = new IntersectionObserver(
      ([entry]) => engine.setVisible(entry.isIntersecting && !document.hidden),
      { threshold: 0 },
    );

    const r = host.getBoundingClientRect();
    renderer
      .init(r.width)
      .then(() => {
        if (!alive) return;
        renderer.resize(r.width, r.height);
        ro.observe(host);
        io.observe(host);
        onReady();
      })
      .catch((err) => {
        if (process.env.NODE_ENV !== "production") console.error("[hero] assets", err);
      });

    const off = engine.onTick(() => renderer.draw());

    return () => {
      alive = false;
      off();
      ro.disconnect();
      io.disconnect();
      renderer.dispose();
    };
  }, [engine, onReady]);

  return <canvas ref={ref} className="hero-canvas" aria-hidden="true" />;
}

"use client";

/**
 * SPIN — the career spun as an orb-weaver's web, ring by ring.
 *
 * Elements → references
 *  - Frame + radials shooting out from the hub on approach (local −1→0):
 *      Awwwards SOTD "SVG line drawing on progress" (stroke-dashoffset scrubbed
 *      by progress, pathLength=1).
 *  - Capture spiral laid ring by ring, scrubbed by the wheel (local 0→1):
 *      same SVG line-drawing pattern; pinned + scrubbed stage =
 *      meermohsin.me Process section (pinned scrubbed stages).
 *  - Ring labels fading in as their ring is laid: meermohsin.me staggered reveals.
 *  - Dew drops = achievements; hover/focus → tooltip + sound.chime:
 *      Awwwards node-graph "hover highlighting of nodes"; dew vocabulary from
 *      lib/web/draw.ts (the site's shared silk grammar).
 *  - Big counters counting as the last ring is laid: meermohsin.me big stat
 *      blocks + Awwwards counters.
 *  - Cursor plucks radials: L4 animation-reference/physics/2 (strand bent by
 *      cursor movement, released into a damped-sine return — pluckWave()).
 *  - The spider running the spiral: the site owner's own spider/web theme.
 */

import { useEffect, useRef, type CSSProperties } from "react";
import { journey } from "@/lib/journey/journey";
import { pluckWave } from "@/lib/web/draw";
import { sound } from "@/lib/audio/sound";
import { prefersReducedMotion } from "@/lib/motion/gsap";
import { RINGS, STATS } from "./data";
import {
  ANCHORS,
  BAND_PATHS,
  C,
  DROPS,
  FRAME_PATH,
  HUB_PATH,
  LABELS,
  MOORINGS,
  RADIUS,
  SPIRAL_END,
  SPOKES,
  VIEW,
  radialPath,
} from "./geometry";
import Spider from "./Spider";

type Vars = CSSProperties & Record<`--${string}`, string | number>;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const pct = (v: number) => `${((v / VIEW) * 100).toFixed(3)}%`;
const fmt = (to: number, p: number, suffix: string) => `${Math.round(to * p)}${suffix}`;

/** do segments p1→p2 and p3→p4 cross? returns side of p1 relative to p3→p4 when they do */
function crosses(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number },
) {
  const d = (a: typeof p1, b: typeof p1, c: typeof p1) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  if (d1 * d2 < 0 && d3 * d4 < 0) return Math.sign(d1);
  return 0;
}

export default function SpinWeb() {
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const svg = svgRef.current;
    if (!root || !svg) return;
    const scene = root.closest<HTMLElement>('[data-chapter="spin"]') ?? root;
    const radials = Array.from(svg.querySelectorAll<SVGPathElement>(".spin-radial"));
    const bands = Array.from(svg.querySelectorAll<SVGPathElement>(".spin-band"));
    const spider = svg.querySelector<SVGGElement>(".spin-spider");
    const nums = Array.from(scene.querySelectorAll<HTMLElement>(".spin-stat__n"));
    const lengths = bands.map((b) => b.getTotalLength());
    const reduced = prefersReducedMotion();

    /* ── progress → drawing ─────────────────────────────────────────── */
    const last: Record<string, string> = {};
    const setVar = (name: string, v: number) => {
      const s = v.toFixed(4);
      if (last[name] === s) return;
      last[name] = s;
      scene.style.setProperty(name, s);
    };
    let lastSpider = "";
    const lastNums: string[] = [];

    const offTick = journey.subscribe((j) => {
      if (!j.live) return;
      const f = j.frame("spin");
      if (!f.active) return;
      const frame = clamp(f.local + 1);
      const s = clamp(f.local);
      setVar("--spin-frame", frame);
      const bs = RINGS.map((_, n) => clamp(s * RINGS.length - n));
      bs.forEach((b, n) => setVar(`--spin-b${n}`, b));

      // the spider rides the band currently being laid
      if (spider) {
        let n = bs.findIndex((b) => b < 1);
        if (n < 0) n = bs.length - 1;
        const len = lengths[n] * bs[n];
        const p = bands[n].getPointAtLength(len);
        const q = bands[n].getPointAtLength(Math.min(lengths[n], len + 3));
        const a = s >= 1 ? -90 : (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
        const t = `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${a.toFixed(1)})`;
        if (t !== lastSpider) {
          spider.setAttribute("transform", t);
          lastSpider = t;
        }
      }

      // counters: staggered, eased, each tied to its ring being laid
      STATS.forEach((st, k) => {
        const p = clamp((bs[st.ring] - k * 0.12) / 0.64);
        const txt = fmt(st.to, 1 - Math.pow(1 - p, 3), st.suffix);
        if (lastNums[k] !== txt && nums[k]) {
          nums[k].textContent = txt;
          lastNums[k] = txt;
        }
      });
    });

    /* ── pluck (L4): crossing a radial with the cursor sets it vibrating ── */
    const plucks = new Map<number, { t0: number; amp: number }>();
    const lastPluck = new Array<number>(SPOKES).fill(0);
    let raf = 0;
    const animate = () => {
      const now = performance.now();
      for (const [i, pk] of plucks) {
        const t = (now - pk.t0) / 1000;
        const done = t > 1.4;
        radials[i]?.setAttribute("d", radialPath(i, done ? 0 : pluckWave(t, pk.amp, 7, 3.6)));
        if (done) plucks.delete(i);
      }
      raf = plucks.size ? requestAnimationFrame(animate) : 0;
    };

    let prev: { x: number; y: number } | null = null;
    const toSvg = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * VIEW, y: ((e.clientY - r.top) / r.height) * VIEW };
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" && e.buttons === 0) return;
      const p = toSvg(e);
      if (prev && !reduced) {
        const speed = Math.hypot(p.x - prev.x, p.y - prev.y);
        if (speed > 0.5) {
          const now = performance.now();
          for (let i = 0; i < SPOKES; i++) {
            const side = crosses(prev, p, C, ANCHORS[i]);
            if (!side || now - lastPluck[i] < 90) continue;
            lastPluck[i] = now;
            const amp = side * Math.min(28, 5 + speed * 0.9);
            plucks.set(i, { t0: now, amp });
            const along = Math.hypot(p.x - C.x, p.y - C.y) / RADIUS;
            sound.pluck({ pitch: clamp(0.85 - along * 0.6), gain: clamp(speed / 40, 0.15, 0.8) });
          }
          if (plucks.size && !raf) raf = requestAnimationFrame(animate);
        }
      }
      prev = p;
    };
    const onLeave = () => (prev = null);
    const web = root.querySelector<HTMLElement>(".spin-web") ?? root;
    web.addEventListener("pointermove", onMove);
    web.addEventListener("pointerleave", onLeave);

    /* ── dew drops: chime on hover / focus ──────────────────────────── */
    let lastChime = 0;
    const onDrop = (e: Event) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(".spin-drop");
      if (!el) return;
      const from = (e as PointerEvent | FocusEvent).relatedTarget as Node | null;
      if (from && el.contains(from)) return;
      const now = performance.now();
      if (now - lastChime < 80) return;
      lastChime = now;
      sound.chime(Number(el.dataset.pitch ?? 0.5));
    };
    root.addEventListener("pointerover", onDrop);
    root.addEventListener("focusin", onDrop);

    return () => {
      offTick();
      cancelAnimationFrame(raf);
      web.removeEventListener("pointermove", onMove);
      web.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("pointerover", onDrop);
      root.removeEventListener("focusin", onDrop);
    };
  }, []);

  return (
    <div className="spin-stage" ref={rootRef}>
      <div className="spin-web">
        <svg
          ref={svgRef}
          className="spin-svg"
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          aria-hidden="true"
          focusable="false"
        >
          <g className="spin-silk">
            {MOORINGS.map((d) => (
              <path key={d} className="spin-frame" d={d} pathLength={1} />
            ))}
            <path className="spin-frame" d={FRAME_PATH} pathLength={1} />
            {ANCHORS.map((_, i) => (
              <path
                key={i}
                className="spin-radial"
                d={radialPath(i)}
                pathLength={1}
                style={{ "--i": i } as Vars}
              />
            ))}
            <path className="spin-hub" d={HUB_PATH} />
          </g>
          <g className="spin-spiral">
            {BAND_PATHS.map((d, n) => (
              <path
                key={n}
                className="spin-band"
                d={d}
                pathLength={1}
                style={{ "--b": `var(--spin-b${n}, 1)` } as Vars}
              />
            ))}
          </g>
          <g className="spin-dew">
            {DROPS.map((ring, n) =>
              ring.map((p, k) => (
                <circle
                  key={`${n}-${k}`}
                  cx={p.x.toFixed(1)}
                  cy={p.y.toFixed(1)}
                  r="9"
                  style={{ "--b": `var(--spin-b${n}, 1)` } as Vars}
                />
              )),
            )}
          </g>
          <g
            className="spin-spider"
            transform={`translate(${SPIRAL_END.x.toFixed(1)} ${SPIRAL_END.y.toFixed(1)}) rotate(-90)`}
          >
            <Spider />
          </g>
        </svg>

        <ol className="spin-rings">
          {RINGS.map((ring, n) => {
            const lab = LABELS[n];
            return (
              <li
                key={ring.id}
                className="spin-ring"
                style={{ "--b": `var(--spin-b${n}, 1)` } as Vars}
              >
                <p
                  className="spin-ring__label"
                  data-side={lab.side}
                  style={{ "--x": pct(lab.x), "--y": pct(lab.y) } as Vars}
                >
                  <span className="spin-ring__when">{ring.when}</span>
                  <span className="spin-ring__place">{ring.place}</span>
                  <span className="spin-ring__gist">{ring.gist}</span>
                </p>
                <ul className="spin-drops">
                  {ring.drops.map((drop, k) => {
                    const p = DROPS[n][k];
                    return (
                      <li key={drop.metric}>
                        <button
                          type="button"
                          className="spin-drop"
                          data-pitch={(0.3 + n * 0.15 + k * 0.03).toFixed(2)}
                          data-flip={p.y < 180 ? "" : undefined}
                          style={{ "--x": pct(p.x), "--y": pct(p.y), "--k": k } as Vars}
                        >
                          <span className="spin-drop__dot" aria-hidden="true" />
                          <span className="spin-drop__tip">{drop.metric}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>

      <dl className="spin-stats">
        {STATS.map((st) => (
          <div key={st.label} className="spin-stat">
            <dt className="spin-stat__label">{st.label}</dt>
            <dd className="spin-stat__value">
              <span className="spin-stat__n" aria-hidden="true">
                {st.to}
                {st.suffix}
              </span>
              <span className="sr-only">
                {st.to}
                {st.suffix}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

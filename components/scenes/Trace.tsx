/**
 * TRACE — the analytical heart. "Trace before you fix", told with silk.
 *   local 0      the tangle: every strand crossed, symptom dew trembling. "Trace first."
 *   local 1…3    one project each: a tracer runs from the symptom along the
 *                tangle, hop by hop, to a knot (root cause, pulse + chime); the
 *                tangle then re-organises into a clean orb web (the fix) and the
 *                metric counts up. Fractional local scrubs all of it.
 *
 * ELEMENTS → REFERENCES (live layer details in trace/TraceCanvas.tsx)
 *   Split-letter title reveal, masked                 → Awwwards SOTD split-letter / masked text reveals
 *   Labels SYMPTOM / ROOT CAUSE / FIX, masked reveal  → Awwwards masked text reveal; meermohsin.me "Process" stages
 *   Big metric counting up                            → Awwwards glitch-free counters
 *   "01 / 03" counter                                  → meermohsin.me pinned stage / gallery index
 *   Round VIEW link                                    → meermohsin.me gallery round "VIEW" button
 *   Hover-follow node labels                          → Awwwards hover-follow labels
 *   Static cards with the final web drawn             → meermohsin.me gallery cards (no-JS fallback)
 * The spider/web theme is the user's.
 */
import type { CSSProperties } from "react";
import Scene from "@/components/journey/Scene";
import { strandPath } from "@/lib/web/draw";
import TraceCanvas from "./trace/TraceCanvas";
import { PROJECTS, formatMetric, webSegments } from "./trace/data";

const TITLE = "Trace first.";

function StaticWeb({ index }: { index: number }) {
  const { segments, dew } = webSegments(11 + index * 7);
  const s = 100;
  const d = segments
    .map((g) => strandPath({ x: g.a.x * s, y: g.a.y * s }, { x: g.b.x * s, y: g.b.y * s }, 2))
    .join(" ");
  return (
    <svg className="trace-card-web" viewBox="-115 -115 230 230" aria-hidden="true" focusable="false">
      <path d={d} />
      {dew.map((p, i) => (
        <circle key={i} className="trace-card-dew" cx={(p.x * s).toFixed(1)} cy={(p.y * s).toFixed(1)} r="2.2" />
      ))}
      <circle className="trace-card-hub" cx="0" cy="0" r="5" />
    </svg>
  );
}

export default function Trace() {
  return (
    <Scene id="trace">
      <div className="trace-stage">
        <TraceCanvas />

        <div className="trace-intro">
          <h2 id="trace-title" className="trace-title">
            <span className="sr-only">{TITLE}</span>
            <span className="trace-title-chars" aria-hidden="true">
              {Array.from(TITLE).map((ch, i) => (
                <span key={i} className="trace-ch" style={{ "--i": i } as CSSProperties}>
                  {ch === " " ? " " : ch}
                </span>
              ))}
            </span>
          </h2>
          <p className="trace-kicker mono">symptom → root cause → fix</p>
        </div>

        <p className="trace-counter mono" aria-hidden="true">
          <span data-trace-count>01</span> / 03
        </p>

        <ol className="trace-projects">
          {PROJECTS.map((p, i) => (
            <li key={p.name} className="trace-project" data-project={i}>
              <article aria-labelledby={`trace-p${i}`}>
                <StaticWeb index={i} />
                <p className="trace-stack mono">
                  <span>{p.stack}</span>
                </p>
                <h3 id={`trace-p${i}`} className="trace-name">
                  <span>{p.name}</span>
                </h3>
                <dl className="trace-labels">
                  <div className="trace-label" data-k="sym">
                    <dt className="mono">Symptom</dt>
                    <dd>
                      <span>{p.symptom}</span>
                    </dd>
                  </div>
                  <div className="trace-label" data-k="cause">
                    <dt className="mono">Root cause</dt>
                    <dd>
                      <span>{p.cause}</span>
                    </dd>
                  </div>
                  <div className="trace-label" data-k="fix">
                    <dt className="mono">Fix</dt>
                    <dd>
                      <span>{p.fix}</span>
                    </dd>
                  </div>
                </dl>
                <p className="trace-metric">
                  <span className="trace-metric-num" data-metric>
                    {formatMetric(p.metric, p.metric.to)}
                  </span>
                  <span className="trace-metric-cap mono">{p.metric.caption}</span>
                </p>
                {/* DEMO: project links unknown — href="#" */}
                <a className="trace-view mono" href={p.href} aria-label={`View ${p.name}`}>
                  View
                </a>
              </article>
            </li>
          ))}
        </ol>
      </div>
    </Scene>
  );
}

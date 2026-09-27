/**
 * Chapter 5 — "The other half." The work light goes off.
 *
 * Elements + reference sources:
 * - Saffron circular colour-wipe from the top-right, turbulent jagged edge ....
 *   Awwwards SOTD circular/ripple colour-wipe + L1 hover-for-newbg/17 jagged
 *   turbulence mask; mirrors the hero's bulb ripple (see CreativeDirector).
 * - Scene-scoped warm tokens (saffron ground, ink text, umber muted) ..........
 *   the hero's warm state (app/hero.css html[data-hero-state="warm"]).
 * - The analytical web redrawn as white hand-drawn doodle-lines, spun on ......
 *   user's spider/web theme in the hero art's doodle line (lib/web/draw.ts
 *   wobblyPath — "the same strands but wobbly").
 * - Floating doodles scattered by cursor velocity ...............................
 *   hero warm orbiters + L6 physics/19 (see creative/Doodles).
 * - "Draw here." glass board: brush, stamps, shapes, undo ....................
 *   Awwwards draw-on-canvas toy; Codrops digital stamp collection; CSS
 *   backdrop-filter glassmorphism (see creative/DrawPad).
 * - Butterflies that wander, land on the board / your marks, fold, flee .......
 *   Matt Cool, "Cursor Monarchs" (see creative/Butterflies).
 * - Drifting paint specks, sparkles, squiggles ..............................
 *   ambient particle layer (see creative/Specks).
 * - Tilted polaroids, drag-to-throw, round VIEW buttons .........................
 *   Awwwards drag-to-throw + meermohsin.me round button (see creative/ThrowCards).
 *
 * Steps: approaching (local −1→0) wipe; 0 headline + doodles; 1 draw + play.
 * Static mode (no JS / reduced motion): the whole scene is saffron, the web is
 * drawn, and both steps stack as a normal document.
 */
import Scene from "@/components/journey/Scene";
import { orbWeb, wobblyPath } from "@/lib/web/draw";
import CreativeDirector from "./creative/CreativeDirector";
import Butterflies from "./creative/Butterflies";
import Doodles from "./creative/Doodles";
import DrawPad from "./creative/DrawPad";
import Specks from "./creative/Specks";
import ThrowCards, { type WorkCard } from "./creative/ThrowCards";

/* the same orb-weaver web, but inked by hand: every strand wobbles */
const WEB = orbWeb({ x: 0, y: 0 }, 520, { spokes: 14, rings: 9, seed: 23, hub: 0.14 });
const RADIALS = WEB.radials.map((p, i) => wobblyPath(WEB.center, p, 100 + i, 7, 7)).join(" ");
/* the capture spiral as one continuous line, ring after ring, so the draw-on
   reads as being spun rather than faded in */
const SPIRAL = (() => {
  const pts = WEB.rings.flat();
  pts.push(WEB.rings[WEB.rings.length - 1][0]);
  let d = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = wobblyPath(pts[i], pts[i + 1], 400 + i, 2.6, 3);
    // each segment starts where the last ended: keep only the first "M"
    d += i === 0 ? seg : seg.slice(seg.indexOf(" L"));
  }
  return d;
})();

const CARDS: WorkCard[] = [
  {
    id: "brawer",
    title: "Brawer",
    tag: "Draw it from clues",
    img: "/demo/work-brawer.svg",
    href: "https://github.com/", // DEMO: replace with the Brawer live/demo URL
    hx: 4,
    hy: 6,
    tilt: -7,
  },
  {
    id: "earth-again",
    title: "Earth Again",
    tag: "Site + admin",
    img: "/demo/work-earth-again.svg",
    href: "https://github.com/", // DEMO: replace with the Earth Again Movement URL
    hx: 36,
    hy: 30,
    tilt: 5,
  },
  {
    id: "lifespark",
    title: "Lifespark Infra",
    tag: "Real-estate site",
    img: "/demo/work-lifespark.svg",
    href: "https://github.com/", // DEMO: replace with the Lifespark Infra URL
    hx: 62,
    hy: 4,
    tilt: -3,
  },
];

export default function Creative() {
  return (
    <Scene id="creative">
      <div className="cr-wash" aria-hidden="true" />

      <svg className="cr-web" viewBox="-560 -560 1120 1120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path className="cr-web-radials" d={RADIALS} pathLength={1} />
        <path className="cr-web-spiral" d={SPIRAL} pathLength={1} />
      </svg>

      <Doodles />
      <Specks />

      <div className="cr-step cr-s0">
        <h2 id="creative-title" className="cr-title">
          The other half.
        </h2>
      </div>

      <div className="cr-step cr-s1">
        <div className="cr-play">
          <div className="cr-draw">
            <h3 className="cr-prompt">Draw here.</h3>
            <DrawPad />
          </div>
          <ThrowCards cards={CARDS} />
        </div>
      </div>

      <Butterflies />

      <CreativeDirector />
    </Scene>
  );
}

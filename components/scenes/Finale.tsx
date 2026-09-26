/**
 * Chapter 6 — the ending. "Every thread leads here."
 *
 * Elements + reference sources:
 * - Whole web zoomed out, every chapter's strand converging on a lit hub ......
 *   Awwwards zoom-out reveal + the user's web theme (see finale/Converge).
 * - "Every great story needs a powerful ending." big masked line reveal ........
 *   meermohsin.me footer CTA copy; Awwwards masked line reveal.
 * - "It was always going to be this way." .....................................
 *   meermohsin.me tagline.
 * - Big round magnetic "LET'S BE CREATIVE" → mailto ...........................
 *   meermohsin.me round button + L5 physics/1 magnetic spring.
 * - Click-to-copy email, local time, links row ...............................
 *   meermohsin.me footer links + Awwwards footer staples (see ContactBits).
 * - Giant name rising from a mask, filling the width ..........................
 *   Awwwards "giant name at the footer" pattern.
 * - "↑ Back to the start" .....................................................
 *   meermohsin.me back-to-top.
 * - Soft radial vignette in var(--ground) behind the text ......................
 *   keeps copy legible over the background web (no new visual element).
 */
import type { CSSProperties } from "react";
import Scene from "@/components/journey/Scene";
import Converge from "./finale/Converge";
import MagneticButton from "./finale/MagneticButton";
import { BackToStart, CopyEmail, LocalTime } from "./finale/ContactBits";
import { CITY, EMAIL, GITHUB, LINKEDIN, RESUME } from "./finale/contact";

/** stagger index for the reveal (finale.css reads --i) */
const order = (i: number) => ({ "--i": i }) as CSSProperties;

export default function Finale() {
  return (
    <Scene id="finale">
      <Converge />

      <div className="fn-body">
        <div className="fn-center">
          <h2 id="finale-title" className="fn-eyebrow mono">
            Every thread leads here.
          </h2>

          <p className="fn-ending">
            <span className="fn-mask">
              <span style={order(0)}>Every great story needs</span>
            </span>{" "}
            <span className="fn-mask">
              <span style={order(1)}>a powerful ending.</span>
            </span>
          </p>

          <p className="fn-tagline fn-late" style={order(2)}>
            It was always going to be this way.
          </p>

          <div className="fn-late" style={order(3)}>
            <MagneticButton href={`mailto:${EMAIL}`}>
              Let&rsquo;s be
              <br />
              creative
            </MagneticButton>
          </div>

          <div className="fn-meta fn-late" style={order(4)}>
            <CopyEmail email={EMAIL} />
            <p className="fn-where mono">
              {CITY} · <LocalTime />
            </p>
          </div>

          <nav className="fn-links fn-late" aria-label="Contact links" style={order(5)}>
            <a className="link-u" href={RESUME} target="_blank" rel="noopener">
              Résumé
            </a>
            <a className="link-u" href={GITHUB} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <a className="link-u" href={LINKEDIN} target="_blank" rel="noopener noreferrer">
              LinkedIn
            </a>
            <a className="link-u" href={`mailto:${EMAIL}`}>
              Email
            </a>
            <BackToStart />
          </nav>
        </div>

        <div className="fn-name" aria-hidden="true">
          <svg className="fn-name-svg" viewBox="0 0 1000 128" preserveAspectRatio="xMidYMax meet">
            <text x="0" y="118" textLength="1000" lengthAdjust="spacingAndGlyphs">
              ASHREETA PATRA
            </text>
          </svg>
        </div>
      </div>
    </Scene>
  );
}

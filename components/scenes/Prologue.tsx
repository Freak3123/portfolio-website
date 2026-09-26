/**
 * PROLOGUE — the dragline (1 step). A single thread drops from the top, a
 * spider rides it down; "Every problem leaves a thread." arrives word by word,
 * then "I follow it." decodes underneath. The thread can be plucked.
 *
 * ELEMENTS → REFERENCES (motion details in prologue/Dragline.tsx)
 *   Thread line-draw drop + spider settle      → Awwwards SVG line drawing on progress; L4 damped return
 *   Pluck: drag sideways, release, damped sine → L4 animation-reference/physics/2
 *   Word-by-word masked reveal                 → Awwwards masked text reveal; meermohsin.me staggered reveals
 *   Mono line decodes from glyphs              → Awwwards scramble/decode text effect
 * The spider/web theme is the user's.
 */
import { Fragment } from "react";
import Scene from "@/components/journey/Scene";
import Dragline from "./prologue/Dragline";

const LINE = ["Every", "problem", "leaves", "a", "thread."];

export default function Prologue() {
  return (
    <Scene id="prologue">
      <div className="pro-stage">
        <Dragline />
        <div className="pro-copy">
          <h2 id="prologue-title" className="pro-title">
            {LINE.map((word, i) => (
              <Fragment key={i}>
                <span className="pro-word">
                  <span>{word}</span>
                </span>
                {i < LINE.length - 1 ? " " : null}
              </Fragment>
            ))}
          </h2>
          <p className="pro-sub mono">
            <span className="sr-only">I follow it.</span>
            <span className="pro-scramble" aria-hidden="true">
              I follow it.
            </span>
          </p>
        </div>
      </div>
    </Scene>
  );
}

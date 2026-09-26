/**
 * Chapter 3 — SPIN. "Spun, ring by ring."
 *
 * Elements → references (details in spin/SpinWeb.tsx)
 *  - Masked title reveal tied to --presence: Awwwards SOTD masked text reveals.
 *  - Web drawn on approach, capture spiral scrubbed ring by ring: Awwwards SVG
 *    line drawing on progress; pinned scrubbed stages (meermohsin.me Process).
 *  - Dew-drop achievements with tooltips: Awwwards node hover highlighting.
 *  - Big counters: meermohsin.me stat blocks.
 *  - Plucking radials: L4 (animation-reference/physics/2).
 *  - The spider and her web: the site owner's theme.
 *
 * Server component: all content is in the HTML. SpinWeb hydrates the motion.
 */
import Scene from "@/components/journey/Scene";
import SpinWeb from "./spin/SpinWeb";

export default function Spin() {
  return (
    <Scene id="spin">
      <div className="spin">
        <h2 id="spin-title" className="spin-title display-l">
          <span className="spin-title__mask">
            <span>Spun, ring</span>
          </span>{" "}
          <span className="spin-title__mask">
            <span>by ring.</span>
          </span>
        </h2>
        <SpinWeb />
      </div>
    </Scene>
  );
}

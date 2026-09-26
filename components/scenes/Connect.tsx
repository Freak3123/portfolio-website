/**
 * Chapter 4 — CONNECT. "Connect the dots."
 *
 * Elements → references (details in connect/ConnectGraph.tsx)
 *  - Masked title reveal tied to --presence: Awwwards SOTD masked text reveals.
 *  - Skills ↔ projects node graph with connected-node highlighting and lit
 *    strands drawing along their length: Awwwards node-graph visualisations,
 *    SVG line drawing.
 *  - Neighbour sparks on touch: L2 (hover-for-newbg/12).
 *  - Drops pushed by cursor velocity, springing back: L6 (physics/19).
 *  - Dew and silk: the site owner's spider/web theme (lib/web/draw.ts grammar).
 *
 * Server component: every skill and project is in the HTML, and static mode
 * shows them as grouped lists.
 */
import Scene from "@/components/journey/Scene";
import ConnectGraph from "./connect/ConnectGraph";

export default function Connect() {
  return (
    <Scene id="connect">
      <div className="cn">
        <h2 id="connect-title" className="cn-title display-l">
          <span className="cn-title__mask">
            <span>Connect</span>
          </span>{" "}
          <span className="cn-title__mask">
            <span>the dots.</span>
          </span>
        </h2>
        <ConnectGraph />
      </div>
    </Scene>
  );
}

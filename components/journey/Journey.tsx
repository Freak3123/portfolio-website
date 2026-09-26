import Prologue from "@/components/scenes/Prologue";
import Trace from "@/components/scenes/Trace";
import Spin from "@/components/scenes/Spin";
import Connect from "@/components/scenes/Connect";
import Creative from "@/components/scenes/Creative";
import Finale from "@/components/scenes/Finale";
import WebCanvas from "./WebCanvas";
import JourneyHUD from "./JourneyHUD";
import JourneyEngine from "./JourneyEngine";

/**
 * Everything after the hero is one web. In live mode the stage is pinned and
 * the wheel / swipe / keys fly a camera along silk from chapter to chapter —
 * nothing on screen scrolls. Scenes are server-rendered so all content is in
 * the HTML; without JS they stack as a plain document.
 */
export default function Journey() {
  return (
    <section className="journey" id="journey" aria-label="The story, told as a web">
      <div className="journey-stage">
        <WebCanvas />
        <div className="journey-scenes">
          <Prologue />
          <Trace />
          <Spin />
          <Connect />
          <Creative />
          <Finale />
        </div>
        <JourneyHUD />
      </div>
      <JourneyEngine />
    </section>
  );
}

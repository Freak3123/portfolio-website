"use client";

/**
 * Stage-level state that sits beside the journey contract. The engine
 * (components/journey/JourneyEngine.tsx) is the only writer; the web canvas,
 * the HUD and any scene may read it.
 *
 *   stage.entry    0 … 1 while the journey section scrolls up into view
 *                  (the hero → web handoff: the dragline drops with it)
 *   stage.visible  the journey section intersects the viewport
 *   stage.moved    the visitor has left step 0 at least once
 *   stage.target   the step the stage is currently travelling to (or resting on)
 */
export const stage = {
  entry: 0,
  visible: false,
  moved: false,
  target: 0,
};

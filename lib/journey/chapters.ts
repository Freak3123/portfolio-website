/**
 * The story after the hero, as one web. Each chapter is a node in a single
 * large orb-weaver web (world units: the web is centred on 0,0 with a radius of
 * ~1000). The camera travels along silk from node to node.
 *
 * `steps` = how many snap stops the chapter owns. One step = one wheel gesture
 * / swipe / arrow press. Travel from a chapter's last stop to the next
 * chapter's first stop is itself one step, so chapter i+1 starts at
 * start_i + steps_i.
 *
 * Integer values of a chapter's `local` progress are REST states (what a
 * visitor sees when the snap settles). Fractional values are the in-between
 * animation, scrubbed by the wheel.
 */
export type ChapterId =
  | "prologue"
  | "trace"
  | "spin"
  | "connect"
  | "creative"
  | "finale";

export type Chapter = {
  id: ChapterId;
  /** one or two words — shown on the web map and the progress thread */
  label: string;
  steps: number;
  /** position of this chapter's node in world units */
  node: { x: number; y: number };
  /** camera zoom while resting on this chapter (1 = default) */
  zoom: number;
};

export const CHAPTERS: readonly Chapter[] = [
  // the thread drops from the hero: "every problem leaves a thread"
  { id: "prologue", label: "The thread", steps: 1, node: { x: 0, y: -820 }, zoom: 1.6 },
  // step 0: the tangle. steps 1–3: one project each, traced symptom → cause → fix
  { id: "trace", label: "Trace", steps: 4, node: { x: 560, y: -360 }, zoom: 1.25 },
  // the career, spun ring by ring. step 0: radials. step 1: spiral complete
  { id: "spin", label: "Spun", steps: 2, node: { x: 420, y: 420 }, zoom: 1.1 },
  // skills as dew on the web — touch one, its connections light
  { id: "connect", label: "Connect", steps: 1, node: { x: -420, y: 460 }, zoom: 1.15 },
  // the bulb goes off — the other half. step 0: warm wipe. step 1: play
  { id: "creative", label: "Other half", steps: 2, node: { x: -620, y: -260 }, zoom: 1.3 },
  // every node connects; zoom out to the whole web; contact
  { id: "finale", label: "Contact", steps: 1, node: { x: 0, y: 0 }, zoom: 0.55 },
];

export type ChapterRange = Chapter & { index: number; start: number };

export const RANGES: readonly ChapterRange[] = (() => {
  let start = 0;
  return CHAPTERS.map((c, index) => {
    const r = { ...c, index, start };
    start += c.steps;
    return r;
  });
})();

/** last snap position (global progress runs 0 … LAST_STEP) */
export const LAST_STEP = RANGES[RANGES.length - 1].start + RANGES[RANGES.length - 1].steps - 1;

export function rangeOf(id: ChapterId): ChapterRange {
  return RANGES.find((r) => r.id === id)!;
}

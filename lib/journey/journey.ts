"use client";

import { RANGES, LAST_STEP, rangeOf, type ChapterId } from "./chapters";

/**
 * The single source of truth for where the visitor is in the story.
 *
 * CONTRACT (other modules depend on these names — extend, never rename):
 *   journey.g                 global progress, float, 0 … LAST_STEP
 *   journey.frame(id)         { local, presence, active } for a chapter
 *   journey.subscribe(fn)     fn(journey, dt) every animation frame; returns unsubscribe
 *   journey.warmth            0 … 1 — how far into the warm/creative world we are
 *   journey.camera            { x, y, zoom } in world units, eased
 *   journey.worldToScreen()   world → CSS px in the stage
 *   journey.goTo(step) / next() / prev() / goToChapter(id)
 *   journey.live              false under reduced motion / before the stage mounts
 *
 * The stage (components/journey/*) is the only writer: it calls setProgress()
 * from scroll, setViewport() on resize, and tick() once per frame.
 */

export type ChapterFrame = {
  /** progress in steps relative to the chapter's first stop. <0 approaching, >steps-1 leaving */
  local: number;
  /** 1 while resting anywhere inside the chapter, fading to 0 over one step outside */
  presence: number;
  /** presence > 0 */
  active: boolean;
};

type Sub = (j: Journey, dt: number) => void;
type Navigator = (step: number) => void;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * How much of the warm "other side" has been revealed for the creative
 * chapter's presence. The first stretch of the travel is the thread being
 * followed (glowing, cold world only); the dissolve front then spreads from
 * where it lands. journey.warmth follows this curve, so sound, chrome and the
 * dissolve (creative/CreativeDirector.tsx) all turn warm together.
 */
export function otherSide(presence: number) {
  return smooth(clamp((presence - 0.42) / 0.58, 0, 1));
}

export class Journey {
  g = 0;
  readonly last = LAST_STEP;
  live = false;
  warmth = 0;
  camera = { x: RANGES[0].node.x, y: RANGES[0].node.y, zoom: RANGES[0].zoom };
  viewport = { w: 1, h: 1 };

  private subs = new Set<Sub>();
  private navigate: Navigator | null = null;

  frame(id: ChapterId): ChapterFrame {
    const r = rangeOf(id);
    const local = this.g - r.start;
    const outside = local < 0 ? -local : local > r.steps - 1 ? local - (r.steps - 1) : 0;
    const presence = clamp(1 - outside, 0, 1);
    return { local, presence, active: presence > 0 };
  }

  /** which chapter the visitor is on or nearest to */
  get current(): ChapterId {
    let best = RANGES[0];
    for (const r of RANGES) if (this.g >= r.start - 0.5) best = r;
    return best.id;
  }

  subscribe(fn: Sub) {
    this.subs.add(fn);
    return () => void this.subs.delete(fn);
  }

  /* ── writers (the stage only) ─────────────────────────────────────────── */

  setProgress(g: number) {
    this.g = clamp(g, 0, this.last);
  }

  setViewport(w: number, h: number) {
    this.viewport = { w, h };
  }

  setNavigator(fn: Navigator | null) {
    this.navigate = fn;
  }

  /** camera target for the current g: rest on a node, travel between nodes */
  cameraTarget() {
    for (let i = 0; i < RANGES.length; i++) {
      const a = RANGES[i];
      const restEnd = a.start + a.steps - 1;
      if (this.g <= restEnd || i === RANGES.length - 1) {
        return { x: a.node.x, y: a.node.y, zoom: a.zoom };
      }
      const b = RANGES[i + 1];
      if (this.g < b.start) {
        const t = smooth((this.g - restEnd) / (b.start - restEnd));
        // travel pulls back a little mid-flight so the thread between reads
        const dip = Math.sin(Math.PI * t) * 0.25;
        return {
          x: a.node.x + (b.node.x - a.node.x) * t,
          y: a.node.y + (b.node.y - a.node.y) * t,
          zoom: (a.zoom + (b.zoom - a.zoom) * t) * (1 - dip),
        };
      }
    }
    const z = RANGES[RANGES.length - 1];
    return { x: z.node.x, y: z.node.y, zoom: z.zoom };
  }

  tick(dt: number) {
    const t = this.cameraTarget();
    const k = 1 - Math.pow(1 - 0.14, dt * 60);
    this.camera.x += (t.x - this.camera.x) * k;
    this.camera.y += (t.y - this.camera.y) * k;
    this.camera.zoom += (t.zoom - this.camera.zoom) * k;
    this.warmth = otherSide(this.frame("creative").presence);
    for (const fn of this.subs) fn(this, dt);
  }

  /** world units → CSS px inside the stage (origin top-left) */
  worldToScreen(x: number, y: number) {
    const { w, h } = this.viewport;
    // one world unit ≈ 1px at zoom 1 on a 1000px-tall viewport
    const s = this.camera.zoom * (h / 1000);
    return { x: w / 2 + (x - this.camera.x) * s, y: h / 2 + (y - this.camera.y) * s, scale: s };
  }

  /* ── navigation ──────────────────────────────────────────────────────── */

  goTo(step: number) {
    this.navigate?.(clamp(Math.round(step), 0, this.last));
  }
  next() {
    this.goTo(Math.floor(this.g + 0.001) + 1);
  }
  prev() {
    this.goTo(Math.ceil(this.g - 0.001) - 1);
  }
  goToChapter(id: ChapterId) {
    this.goTo(rangeOf(id).start);
  }
}

/** one journey per page */
export const journey = new Journey();

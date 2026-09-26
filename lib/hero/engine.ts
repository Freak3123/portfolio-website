import {
  EAR,
  EAR_CARRY,
  EAR_RECT,
  IMG,
  SPRINGS,
  TEAR,
  TOGGLE_KICK,
  TRANSITION_MS,
} from "./constants";
import { Pendulum, falloff, idleSway } from "./pendulum";

export type HeroState = "cold" | "warm";

/** Where the portrait sits inside the hero box, in CSS px. */
export interface Fit {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Tick = (dt: number, t: number) => void;

/**
 * Everything that moves at 60fps lives here, deliberately outside React.
 * One rAF, one pointer listener, no setState in the frame path — React only
 * hears about the two things it actually renders: the state flip and whether
 * the opening animation is done.
 */
export class HeroEngine {
  state: HeroState = "cold";
  /** 0 while cold is on top, 1 while warm is. Held at the *old* value mid-transition. */
  stateF = 0;
  /** 0 = cell grammar, 1 = organic. Crosses over during a transition. */
  grammar = 0;
  /**
   * The scene wipe's own grammar, floored away from pure cells.
   *
   * At hole size the 24px cells read as a deliberate, blocky tear. Dragged
   * across the whole screen at speed they read as the animation stuttering —
   * the boundary is chunkier than the distance it moves per frame. The hover
   * hole keeps its cells; the wipe never goes below half-organic.
   */
  rippleGrammar = 0.5;
  transitioning = false;

  /** pointer, in portrait uv */
  mouse = { x: 0.5, y: 0.4 };
  private mouseTarget = { x: 0.5, y: 0.4 };
  /** smoothed pointer velocity, portrait px per frame */
  vel = { x: 0, y: 0 };
  private lastPx = { x: 0, y: 0 };
  private hasPointer = false;

  radius = 0;
  pressed = false;
  private radiusTarget = 0;

  ripple = { x: 0.82, y: 0.08 };
  rippleR = 0;
  private trans: { t: number; from: number; to: number; maxR: number } | null = null;

  bulbLit = 1;
  bulbPendulum = new Pendulum(SPRINGS.bulb);
  earA = new Pendulum(SPRINGS.earA);
  earB = new Pendulum(SPRINGS.earB);
  /** bulb anchor, portrait uv — set by BulbCord once it has laid out */
  bulbPos = { x: 0.86, y: 0.16 };

  lens = 0;

  fit: Fit = { x: 0, y: 0, w: 1, h: 1 };
  /** the viewport's own corners, in portrait uv — set by the renderer */
  uvRect = { x0: 0, y0: 0, x1: 1, y1: 1 };
  reduced = false;

  private ticks = new Set<Tick>();
  private listeners = new Set<() => void>();
  private raf = 0;
  private last = 0;
  time = 0;
  private running = false;
  private visible = true;

  constructor() {
    if (typeof window !== "undefined") {
      this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
  }

  /* ── subscriptions ──────────────────────────────────────────────────────── */
  onTick(fn: Tick) {
    this.ticks.add(fn);
    return () => {
      this.ticks.delete(fn);
    };
  }
  /** for the handful of things React genuinely needs to re-render */
  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private emit() {
    this.listeners.forEach((f) => f());
  }

  /* ── pointer ────────────────────────────────────────────────────────────── */
  /** client coords -> portrait uv, using the current fit */
  toPortrait(clientX: number, clientY: number, rect: DOMRect) {
    const px = clientX - rect.left - this.fit.x;
    const py = clientY - rect.top - this.fit.y;
    return { x: px / this.fit.w, y: py / this.fit.h };
  }

  /**
   * Hover moves the cursor and drives the pendulums, but it no longer opens the
   * tear — that is a press-and-drag now, so the layer underneath only shows when
   * you deliberately reach for it.
   */
  pointerMove(uv: { x: number; y: number }) {
    const px = { x: uv.x * IMG.w, y: uv.y * IMG.h };
    if (this.hasPointer) {
      // L6's smoothing: keep 75% of the old velocity so a jitter doesn't shove things
      this.vel.x = this.vel.x * 0.75 + (px.x - this.lastPx.x) * 0.25;
      this.vel.y = this.vel.y * 0.75 + (px.y - this.lastPx.y) * 0.25;
    }
    this.lastPx = px;
    this.hasPointer = true;
    this.mouseTarget = uv;
  }

  pointerLeave() {
    this.hasPointer = false;
    this.pressed = false;
    this.vel.x = this.vel.y = 0;
    this.radiusTarget = 0;
  }

  /** Press opens the hole under your finger, and holds it open while you drag. */
  press(uv: { x: number; y: number }, touch = false) {
    this.pressed = true;
    this.mouse = { ...uv };
    this.mouseTarget = uv;
    this.lastPx = { x: uv.x * IMG.w, y: uv.y * IMG.h };
    this.hasPointer = true;
    this.radiusTarget = touch ? TEAR.touchRadius : TEAR.radius;
    this.earA.kick(1.2);
  }

  release() {
    this.pressed = false;
    this.radiusTarget = 0;
  }

  /** Keyboard equivalent — a centred hole the arrows can move. */
  keyOpen(on: boolean) {
    this.radiusTarget = on ? TEAR.radius : 0;
    if (on && !this.hasPointer) this.mouseTarget = { x: 0.45, y: 0.33 };
  }
  keyNudge(dx: number, dy: number) {
    this.mouseTarget = {
      x: Math.min(1, Math.max(0, this.mouseTarget.x + dx)),
      y: Math.min(1, Math.max(0, this.mouseTarget.y + dy)),
    };
  }

  /* ── the switch ─────────────────────────────────────────────────────────── */
  toggle() {
    if (this.transitioning) return;
    this.transitioning = true;
    this.ripple = { ...this.bulbPos };
    this.bulbPendulum.kick(TOGGLE_KICK.bulb);
    this.earA.kick(TOGGLE_KICK.ear);
    this.emit();

    const from = this.stateF;
    const to = 1 - from;

    if (this.reduced) {
      this.stateF = to;
      this.grammar = to;
      this.bulbLit = to === 0 ? 1 : 0;
      this.state = to === 0 ? "cold" : "warm";
      this.transitioning = false;
      this.emit();
      return;
    }

    /* The wipe has to reach the furthest corner. It used to stop at a fixed
       1.6, but the lamp sits outside the portrait — the far corner is 1.92 away
       in aspect-corrected uv — so the last wedge of the old world was still
       there when the transition ended and swapped in a single frame. */
    const { x0, y0, x1, y1 } = this.uvRect;
    let maxR = 0;
    for (const [cx, cy] of [
      [x0, y0],
      [x1, y0],
      [x0, y1],
      [x1, y1],
    ]) {
      const dx = cx - this.ripple.x;
      const dy = (cy - this.ripple.y) * (IMG.h / IMG.w);
      maxR = Math.max(maxR, Math.hypot(dx, dy));
    }
    // margin covers the mask's own soft edge, which widens with the radius —
    // without it the far corner is still mid-crossfade when the timer ends
    this.trans = { t: 0, from, to, maxR: maxR + 0.3 };
  }

  /* ── frame loop ─────────────────────────────────────────────────────────── */
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.time += dt;
      if (this.visible) {
        this.update(dt);
        this.ticks.forEach((f) => f(dt, this.time));
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);

    document.addEventListener("visibilitychange", this.onVis);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    document.removeEventListener("visibilitychange", this.onVis);
  }

  private onVis = () => {
    this.visible = !document.hidden;
    this.last = performance.now();
  };

  setVisible(v: boolean) {
    this.visible = v;
    this.last = performance.now();
  }

  /**
   * The global swap, stepped from the shared tick.
   *
   * It used to run on a requestAnimationFrame of its own, which put its uniform
   * writes on either side of the renderer's draw depending on registration
   * order — so the wipe advanced by an inconsistent amount each frame. Traced
   * before the change: 0.046, 0.044, **0.153**, 0.114, 0.085 per frame.
   */
  private stepTransition(dt: number) {
    const tr = this.trans;
    if (!tr) return;
    tr.t += dt;
    const p = Math.min(1, tr.t / (TRANSITION_MS / 1000));

    // the light goes first, and quickly — it is the cause, not the effect
    this.bulbLit =
      tr.to === 0 ? smooth01((p - 0.04) / 0.3) : 1 - smooth01(p / 0.13);

    // one smooth S for the wipe. easeOutCubic started at full speed, so the
    // edge appeared out of nothing already travelling.
    const rp = Math.min(1, Math.max(0, (p - 0.08) / 0.8));
    this.rippleR = rp <= 0 ? 0 : easeInOutCubic(rp) * tr.maxR;

    /* Grammar follows the wipe, not the wall clock. On the old timing the
       portrait had finished swapping by ~520ms while grammar — which is also
       what crossfades the halo — was still at 0.68 and did not land until
       900ms, so the figure changed and its surroundings caught up late. */
    this.grammar = tr.from + (tr.to - tr.from) * smooth01(rp);
    this.rippleGrammar = Math.max(0.55, this.grammar);

    if (p >= 1) {
      this.stateF = tr.to;
      this.grammar = tr.to;
      this.rippleR = 0;
      this.state = tr.to === 0 ? "cold" : "warm";
      this.transitioning = false;
      this.trans = null;
      this.emit();
    }
  }

  private update(dt: number) {
    this.stepTransition(dt);

    // 60fps-normalised lerps, so the feel survives a 120Hz display
    const k = 1 - Math.pow(1 - TEAR.lerp, dt * 60);
    this.mouse.x += (this.mouseTarget.x - this.mouse.x) * k;
    this.mouse.y += (this.mouseTarget.y - this.mouse.y) * k;
    const kr = 1 - Math.pow(1 - TEAR.radiusLerp, dt * 60);
    // no tearing while the world is changing — the two must not fight
    const rt = this.transitioning ? 0 : this.radiusTarget;
    this.radius += (rt - this.radius) * kr;
    // An exponential ease never actually reaches zero, so without this snap the
    // hole closes but the filaments hang around for seconds afterwards. 0.012 is
    // ~10% of the open radius — below the point where the hole is legible, and
    // it guarantees the close terminates instead of asymptoting.
    if (rt === 0 && this.radius < 0.012) this.radius = 0;

    /* lens wakes only when the cursor comes near the glasses */
    const gx = 0.45 * IMG.w;
    const gy = 0.32 * IMG.h;
    const dLens = Math.hypot(this.mouse.x * IMG.w - gx, this.mouse.y * IMG.h - gy);
    const lensTarget = this.hasPointer && dLens < 400 ? falloff(dLens, 400) : 0;
    this.lens += (lensTarget - this.lens) * (1 - Math.pow(1 - 0.08, dt * 60));

    if (this.reduced) {
      this.earA.reset();
      this.earB.reset();
      this.bulbPendulum.reset();
      return;
    }

    /* earring — torque from pointer velocity, never from pointer position.
       When the pointer stops or leaves, this goes to zero and it coasts. */
    const ex = EAR.anchor.x;
    const ey = (EAR_RECT.y0 + EAR_RECT.y1) / 2;
    const d = Math.hypot(this.mouse.x * IMG.w - ex, this.mouse.y * IMG.h - ey);
    if (this.hasPointer && d < EAR.influence) {
      const w = falloff(d, EAR.influence) * Math.min(1, dt * 60);
      this.earA.kick(this.vel.x * 0.015 * w);
      this.earB.kick(this.vel.x * 0.012 * w);
    }
    this.earA.step(dt, idleSway(this.time, 0.007));
    this.earB.carriedBy(this.earA.accel, EAR_CARRY);
    this.earB.step(dt, this.earA.theta);

    /* The lamp hangs and sways. It is not draggable and nothing about it
       stretches: brushing past gives it torque, the toggle gives it a kick, and
       otherwise gravity and damping have it. */
    {
      const bp = { x: this.bulbPos.x * IMG.w, y: this.bulbPos.y * IMG.h };
      const db = Math.hypot(this.mouse.x * IMG.w - bp.x, this.mouse.y * IMG.h - bp.y);
      if (this.hasPointer && db < 320) {
        this.bulbPendulum.kick(
          this.vel.x * 0.006 * falloff(db, 320) * Math.min(1, dt * 60),
        );
      }
      this.bulbPendulum.step(dt, idleSway(this.time, 0.004));
    }

    // velocity decays on its own, so a parked cursor stops driving anything
    this.vel.x *= Math.pow(0.86, dt * 60);
    this.vel.y *= Math.pow(0.86, dt * 60);
  }
}

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
/** smoothstep, for the eases that only need gentle ends */
const smooth01 = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

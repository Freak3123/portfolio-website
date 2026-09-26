import { FIXED_DT } from "./constants";

export interface SpringSpec {
  /** natural frequency, rad/s */
  w: number;
  /** damping ratio — 0.05 gives ~5 visible swings before it settles */
  z: number;
  /** hard limit on |θ|, radians */
  clamp: number;
}

/**
 * A lightly damped angular oscillator.
 *
 * The cursor drives this through `push()`, which adds *torque*, never position.
 * That distinction is the whole point: torque comes from pointer velocity, so
 * when the pointer stops or leaves the room the driving term goes to zero and
 * the pendulum coasts on stored momentum — which is what a real hanging object
 * does. Following the pointer's position would stop it dead instead.
 */
export class Pendulum {
  theta = 0;
  omega = 0;
  /** last frame's angular acceleration — the carriage term for a child body */
  accel = 0;
  private torque = 0;
  private carry = 0;
  private acc = 0;

  constructor(private spec: SpringSpec) {}

  /** Add torque for this frame. Cleared once consumed. */
  push(t: number) {
    this.torque += t;
  }

  /**
   * Instantaneous impulse — a brush past, a flick, or a state toggle.
   *
   * Cursor proximity feeds this rather than `push()`. Torque is a rate: fed in
   * per frame it only ever acts across one 1/120s substep, which works out to
   * roughly nothing. A pointer sweeping past is physically an impulse, so
   * that's what it adds.
   */
  kick(dOmega: number) {
    const cap = this.spec.w * this.spec.clamp * 1.6;
    this.omega = Math.max(-cap, Math.min(cap, this.omega + dOmega));
  }

  /** Inherit a fraction of a parent body's angular acceleration. */
  carriedBy(parentAccel: number, k: number) {
    this.carry = -k * parentAccel;
  }

  /**
   * Fixed-substep semi-implicit Euler.
   *
   * Fixed substeps are not fussiness: with a variable dt a lightly damped
   * oscillator *gains* energy across a long frame and starts swinging harder,
   * which reads as a bug and eventually pins against the clamp.
   */
  step(dt: number, reference = 0) {
    this.acc += Math.min(dt, 0.1);
    const { w, z, clamp } = this.spec;
    while (this.acc >= FIXED_DT) {
      const a =
        -w * w * Math.sin(this.theta - reference) -
        2 * z * w * this.omega +
        this.torque +
        this.carry;
      this.omega += a * FIXED_DT;
      this.theta += this.omega * FIXED_DT;
      if (this.theta > clamp) {
        this.theta = clamp;
        this.omega = Math.min(this.omega, 0);
      } else if (this.theta < -clamp) {
        this.theta = -clamp;
        this.omega = Math.max(this.omega, 0);
      }
      this.accel = a;
      this.acc -= FIXED_DT;
    }
    this.torque = 0;
    this.carry = 0;
    return this.theta;
  }

  reset() {
    this.theta = this.omega = this.accel = this.torque = this.carry = this.acc = 0;
  }
}

/** L6's proximity falloff: (1 − d/r)³, zero outside r. */
export const falloff = (d: number, r: number) =>
  d >= r ? 0 : Math.pow(1 - d / r, 3);

/**
 * Two incommensurate sines. Real hanging things are never perfectly still, and
 * two periods that don't divide each other stop it reading as a loop.
 */
export const idleSway = (t: number, amp: number) =>
  amp * (Math.sin(t / 4.2) * 0.6 + Math.sin(t / 6.7 + 1.1) * 0.4);

"use client";

/**
 * Butterflies loose in the warm world. They wander between waypoints, drift
 * toward a slow cursor, land on the "Draw here." board's top edge and on the
 * visitor's own marks, fold their wings while perched, and scatter when the
 * cursor rushes at them.
 *
 * Reference: "Cursor Monarchs" by Matt Cool (mattcool.tech/posts/cursor-monarchs)
 * — each butterfly steers toward a waypoint with a capped speed and capped
 * steering force, picks a new waypoint on arrival (often near the cursor),
 * and when it lands it stops and folds its wings. Ported to Canvas2D:
 *   - flight = seek(waypoint) with |v| ≤ maxSpeed, |steer| ≤ maxForce, plus a
 *     wingbeat bob; wings are the fore/hind wing shapes scaled on x by the
 *     flap (a flat butterfly seen from above opening and closing);
 *   - landing = arrive(perch) slowing inside 80px, then perch: wings folded
 *     to a sliver, an occasional slow open, take off after a few seconds;
 *   - flee (this site's addition, asked for in the brief): a cursor moving
 *     fast *toward* a butterfly within 160px sends it off the other way.
 * Palette only: deep umber / white wings, ink outline and body.
 *
 * Decorative (aria-hidden, pointer-events none). Runs on the journey clock
 * only while the chapter is present; static mode / reduced motion draws one
 * still frame instead.
 */

import { useEffect, useRef } from "react";
import { journey } from "@/lib/journey/journey";
import { rng } from "@/lib/web/draw";
import { board } from "./board";

type Pt = { x: number; y: number };
type Perch = { get: () => Pt | null; angle: number };
type State = "fly" | "land" | "perch" | "flee";
type Fly = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  state: State;
  perch: Perch | null;
  timer: number;
  heading: number;
  phase: number;
  size: number;
  umber: boolean;
  glide: number;
};

const INK = "#0A101A";
const UMBER = "#5A3A0A";
const WHITE = "#FFFFFF";

const MAX_SPEED = 2.3; // px per 60fps frame
const MAX_FORCE = 0.09;
const FLEE_SPEED = 6.5;
const FLEE_R = 160;
const RUSH = 11; // cursor px/frame that counts as rushing

// built on first draw: Path2D doesn't exist during prerender
let wings: { fore: Path2D; hind: Path2D } | null = null;

function drawFly(ctx: CanvasRenderingContext2D, b: Fly, open: number) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.heading + Math.PI / 2);
  ctx.scale(b.size, b.size);
  ctx.lineWidth = 1 / b.size;
  ctx.strokeStyle = INK;
  wings ??= {
    fore: new Path2D("M0 -2 C5 -12 15.5 -11.5 14 -3 C12.5 1.5 5 1.5 0 0 Z"),
    hind: new Path2D("M0 1 C6 1 11.5 5 8.5 10.5 C5.5 13.5 1.5 8.5 0 3 Z"),
  };
  const { fore: FORE, hind: HIND } = wings;
  for (const side of [1, -1]) {
    ctx.save();
    ctx.scale(side * Math.max(0.06, open), 1);
    ctx.fillStyle = b.umber ? UMBER : WHITE;
    ctx.fill(HIND);
    ctx.stroke(HIND);
    ctx.fill(FORE);
    ctx.stroke(FORE);
    // spots near the wing tips, as on a monarch's margin
    ctx.fillStyle = b.umber ? WHITE : UMBER;
    ctx.beginPath();
    ctx.arc(11.2, -6.4, 1.1, 0, Math.PI * 2);
    ctx.arc(8.2, -8.6, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // body + antennae
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(0, 1.5, 1.3, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.4, -4.5);
  ctx.quadraticCurveTo(-1.5, -9, -4, -10.5);
  ctx.moveTo(0.4, -4.5);
  ctx.quadraticCurveTo(1.5, -9, 4, -10.5);
  ctx.stroke();
  ctx.restore();
}

const angleLerp = (a: number, b: number, t: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

export default function Butterflies() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let dpr = 1;
    let W = 1;
    let H = 1;
    const r = rng(1771);

    const n = window.innerWidth < 700 ? 4 : 6;
    const flies: Fly[] = Array.from({ length: n }, (_, i) => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      tx: 0,
      ty: 0,
      state: "fly",
      perch: null,
      timer: 0,
      heading: r() * Math.PI * 2,
      phase: r() * Math.PI * 2,
      size: 0.95 + r() * 0.45,
      umber: i % 3 !== 2,
      glide: 0,
    }));
    // seeded starting spots (also the static frame)
    const home = flies.map(() => ({ fx: 0.08 + r() * 0.84, fy: 0.12 + r() * 0.76 }));
    let placed = false;
    const place = () => {
      flies.forEach((b, i) => {
        b.x = b.tx = home[i].fx * W;
        b.y = b.ty = home[i].fy * H;
      });
      placed = true;
    };

    const clear = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
    };
    const drawStill = () => {
      clear();
      for (const b of flies) drawFly(ctx, b, 0.85);
    };
    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth || 1;
      H = cv.clientHeight || 1;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      if (!placed && W > 1) place();
      if (!journey.live) drawStill();
    };
    const ro = new ResizeObserver(size);
    ro.observe(cv);
    size();

    /* cursor, in canvas px, with a per-frame speed estimate */
    const ptr = { x: -1e4, y: -1e4, vx: 0, vy: 0, at: 0, t: 0 };
    const onMove = (e: PointerEvent) => {
      const b = cv.getBoundingClientRect();
      const x = e.clientX - b.left;
      const y = e.clientY - b.top;
      const now = performance.now();
      if (ptr.at && now - ptr.t < 100) {
        const k = 16.7 / Math.max(4, now - ptr.t);
        ptr.vx = ptr.vx * 0.5 + (x - ptr.x) * k * 0.5;
        ptr.vy = ptr.vy * 0.5 + (y - ptr.y) * k * 0.5;
      }
      ptr.x = x;
      ptr.y = y;
      ptr.t = now;
      ptr.at = now;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    /* perches: the board's top edge, or a point on one of the visitor's marks */
    let cvRect = cv.getBoundingClientRect();
    const boardShown = () => {
      const el = board.el;
      if (!el) return false;
      const ok = el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true;
      if (!ok) return false;
      const rr = el.getBoundingClientRect();
      return rr.width > 0 && rr.bottom > cvRect.top && rr.top < cvRect.bottom;
    };
    const choosePerch = (): Perch | null => {
      if (!boardShown()) return null;
      const s = Math.random() < 0.55 ? board.sample() : null;
      if (s && board.canvas) {
        const c = board.canvas;
        return {
          angle: -Math.PI / 2 + (Math.random() - 0.5) * 1.6,
          get: () => {
            if (board.canvas !== c || !board.has(s.key) || !boardShown()) return null;
            const rr = c.getBoundingClientRect();
            return { x: rr.left - cvRect.left + s.x, y: rr.top - cvRect.top + s.y };
          },
        };
      }
      const el = board.el!;
      const fx = 0.08 + Math.random() * 0.84;
      return {
        angle: -Math.PI / 2 + (Math.random() - 0.5) * 0.5,
        get: () => {
          if (board.el !== el || !boardShown()) return null;
          const rr = el.getBoundingClientRect();
          return { x: rr.left - cvRect.left + fx * rr.width, y: rr.top - cvRect.top - 2 };
        },
      };
    };

    const waypoint = (b: Fly, mayLand = true) => {
      const now = performance.now();
      const cursorNear = now - ptr.at < 2500 && ptr.x > 0 && ptr.x < W && ptr.y > 0 && ptr.y < H;
      if (cursorNear && Math.random() < 0.45) {
        // Cursor Monarchs: drift toward the cursor, never onto it
        const a = Math.random() * Math.PI * 2;
        const d = 55 + Math.random() * 70;
        b.tx = ptr.x + Math.cos(a) * d;
        b.ty = ptr.y + Math.sin(a) * d;
      } else {
        b.tx = 40 + Math.random() * (W - 80);
        b.ty = 60 + Math.random() * (H - 120);
      }
      b.tx = Math.min(W - 20, Math.max(20, b.tx));
      b.ty = Math.min(H - 20, Math.max(20, b.ty));
      if (mayLand && Math.random() < 0.28) {
        const p = choosePerch();
        if (p) {
          b.perch = p;
          b.state = "land";
          b.timer = 7;
        }
      }
      if (Math.random() < 0.25) b.glide = 0.4 + Math.random() * 0.6;
    };
    const takeOff = (b: Fly) => {
      b.state = "fly";
      b.perch = null;
      b.vy = -1.2;
      b.vx = (Math.random() - 0.5) * 1.5;
      waypoint(b, false); // not straight back down
    };
    const flee = (b: Fly) => {
      const dx = b.x - ptr.x;
      const dy = b.y - ptr.y;
      const d = Math.hypot(dx, dy) || 1;
      const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.9;
      b.state = "flee";
      b.perch = null;
      b.timer = 0.9;
      b.tx = Math.min(W - 20, Math.max(20, b.x + Math.cos(a) * 260));
      b.ty = Math.min(H - 20, Math.max(20, b.y + Math.sin(a) * 260));
      b.vx += (dx / d) * 2;
      b.vy += (dy / d) * 2;
    };

    let t = 0;
    let shown = false;
    const off = journey.subscribe((j, dt) => {
      if (!j.live) return;
      const f = j.frame("creative");
      if (f.presence <= 0) {
        if (shown) {
          clear();
          shown = false;
        }
        return;
      }
      shown = true;
      t += dt;
      const k = Math.min(3, dt * 60);
      cvRect = cv.getBoundingClientRect();
      const ptrSpeed = Math.hypot(ptr.vx, ptr.vy);
      const fresh = performance.now() - ptr.t < 80;

      clear();
      for (const b of flies) {
        // rushing cursor → scatter
        if (fresh && b.state !== "flee") {
          const dx = b.x - ptr.x;
          const dy = b.y - ptr.y;
          const d = Math.hypot(dx, dy);
          const toward = (ptr.vx * dx + ptr.vy * dy) / (d || 1);
          if ((d < FLEE_R && ptrSpeed > RUSH && toward > ptrSpeed * 0.4) || d < 24) flee(b);
        }

        let open: number;
        if (b.state === "perch") {
          const p = b.perch?.get() ?? null;
          b.timer -= dt;
          if (!p || b.timer <= 0) {
            takeOff(b);
          } else {
            b.x = p.x;
            b.y = p.y;
            b.vx = b.vy = 0;
            b.heading = angleLerp(b.heading, b.perch!.angle, 0.1 * k);
            // folded to a sliver, now and then a slow open-and-close
            open = 0.08 + 0.55 * Math.pow(Math.max(0, Math.sin(t * 1.3 + b.phase)), 6);
            drawFly(ctx, b, open);
            continue;
          }
        }

        let maxSpeed = MAX_SPEED;
        let tx = b.tx;
        let ty = b.ty;
        if (b.state === "land") {
          const p = b.perch?.get() ?? null;
          b.timer -= dt;
          if (!p || b.timer <= 0) {
            b.state = "fly";
            b.perch = null;
            waypoint(b, false);
          } else {
            tx = p.x;
            ty = p.y;
          }
        } else if (b.state === "flee") {
          maxSpeed = FLEE_SPEED;
          b.timer -= dt;
          if (b.timer <= 0) {
            b.state = "fly";
            waypoint(b);
          }
        }

        const dx = tx - b.x;
        const dy = ty - b.y;
        const d = Math.hypot(dx, dy);
        if (b.state === "land" && d < 2.5) {
          b.state = "perch";
          b.timer = 3 + Math.random() * 6;
          b.x = tx;
          b.y = ty;
          drawFly(ctx, b, 0.3);
          continue;
        }
        if (b.state === "fly" && d < 22) waypoint(b);

        // seek / arrive with a capped speed and a capped steering force
        const want = b.state === "land" ? maxSpeed * Math.min(1, d / 80) + 0.15 : maxSpeed;
        let sx = (dx / (d || 1)) * want - b.vx;
        let sy = (dy / (d || 1)) * want - b.vy;
        const force = b.state === "flee" ? MAX_FORCE * 4 : MAX_FORCE;
        const sl = Math.hypot(sx, sy);
        if (sl > force) {
          sx *= force / sl;
          sy *= force / sl;
        }
        b.vx += sx * k;
        b.vy += sy * k;
        // each wingbeat lifts a little: the flutter bob
        b.phase += dt * (b.state === "flee" ? 30 : b.glide > 0 ? 6 : 17);
        if (b.state !== "land" || d > 30) b.vy -= Math.sin(b.phase) * 0.05 * k;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > maxSpeed) {
          b.vx *= maxSpeed / sp;
          b.vy *= maxSpeed / sp;
        }
        b.x += b.vx * k;
        b.y += b.vy * k;
        if (sp > 0.2) b.heading = angleLerp(b.heading, Math.atan2(b.vy, b.vx), 0.12 * k);
        if (b.glide > 0) b.glide -= dt;

        open = b.glide > 0 ? 0.92 + Math.sin(b.phase) * 0.06 : 0.22 + 0.78 * (0.5 + 0.5 * Math.sin(b.phase));
        drawFly(ctx, b, open);
      }
    });

    return () => {
      off();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return <canvas ref={ref} className="cr-air cr-air--flies" aria-hidden="true" />;
}

"use client";

/**
 * WebCanvas — the world the journey flies through: one giant orb-weaver web,
 * smaller webs anchored around it, and the silk spine that ties the chapters
 * together in story order (prologue → trace → spin → connect → creative →
 * finale). "Everything is connected" is literal here: every scene sits on a
 * node of this one web, and the thread between them is drawn as you travel it.
 *
 * Elements, and where each one comes from:
 * - Scroll-driven camera flight through a single scene ............ Awwwards SOTD (Igloo Inc,
 *   Lusion); the camera itself is journey.camera
 * - Parallax depth: far / main / near layers of webs move at
 *   different rates as the camera flies .......................... Awwwards SOTD depth parallax;
 *   hero §13 warm "depth-weighted parallax" (W2)
 * - The travelled part of the spine glows in --accent, the rest
 *   stays faint (line drawing on progress) ....................... Awwwards SOTD SVG/canvas line
 *   drawing on scroll progress
 * - Strands plucked when the cursor crosses them, released into a
 *   damped-sine return, with a pluck sound ...................... L4 physics/2 (string dragged
 *   and released into a damped sine)
 * - Cursor velocity pushes nearby strand midpoints, (1-d/r)^3
 *   falloff, spring return ....................................... L6 physics/19
 * - Dew drops glinting at spiral intersections .................... hero cold grammar (plan/hero.md
 *   §13: nodes + hairlines), lib/web/draw.ts `dew`
 * - Warm grammar as journey.warmth → 1: wobbly, thicker, round-capped
 *   strands, each on its own clock ............................... hero warm doodles (plan/hero.md
 *   §13 "every element gets its own seeded phase … nothing shares a timing")
 * - Hero → journey handoff: a single dragline drops from the top
 *   onto the prologue node as the section scrolls in .............. hero §14 (the web assembles
 *   from single threads), meermohsin.me staged reveals
 *
 * Performance: one canvas, DPR ≤ 2, driven by journey.subscribe (the engine's
 * single gsap.ticker, paused while the journey is offscreen). Off-screen strands
 * are culled; strokes are batched one path per layer.
 */

import { useEffect, useRef } from "react";
import { journey } from "@/lib/journey/journey";
import { RANGES } from "@/lib/journey/chapters";
import { stage } from "@/lib/journey/stage";
import { spinePieces, travelAt } from "@/lib/journey/travel";
import { world, LAYER_DEPTH, spineLength, type LayerId } from "@/lib/web/world";
import { dew, pluckWave, themeColors } from "@/lib/web/draw";
import { sound } from "@/lib/audio/sound";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

/** cursor influence radius (px) for the L6 push */
const PUSH_R = 150;
/** cull margin (px) — sag and plucks can bow a strand past its endpoints */
const M = 80;

// Kept quiet on purpose: the world web is the backdrop every chapter draws on,
// never the subject. Each chapter's own web (the trace, the spiral, the graph)
// has to be the brightest silk on screen.
const LAYER_STYLE: Record<LayerId, { width: number; alpha: number }> = {
  0: { width: 0.7, alpha: 0.04 },
  1: { width: 0.9, alpha: 0.085 },
  2: { width: 1.1, alpha: 0.05 },
};

/** which side of a→b the point p lies on; 0 when it does not cross c→d */
function crossing(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  if (d1 * d2 > 0) return 0;
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  if (d3 * d4 > 0) return 0;
  return d2 > 0 ? 1 : -1;
}

export default function WebCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const W = world();
    const S = W.segs;
    const n = S.count;

    // contiguous layer ranges (the builder adds far, then main, then near)
    const range: Record<LayerId, [number, number]> = { 0: [n, 0], 1: [n, 0], 2: [n, 0] };
    for (let i = 0; i < n; i++) {
      const r = range[S.layer[i] as LayerId];
      r[0] = Math.min(r[0], i);
      r[1] = Math.max(r[1], i + 1);
    }

    // strand physics, in screen px
    const offX = new Float32Array(n);
    const offY = new Float32Array(n);
    const velX = new Float32Array(n);
    const velY = new Float32Array(n);
    const pluckT = new Float32Array(n).fill(-1);
    const pluckA = new Float32Array(n);
    const pushed = new Set<number>();

    let colors = themeColors();
    let colorTimer = 0;
    const mo = new MutationObserver(() => {
      window.clearTimeout(colorTimer);
      // the tokens swap at once; the page's own colour change lands ~480ms later
      colorTimer = window.setTimeout(() => (colors = themeColors()), 560);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-hero-state"] });

    let w = 1;
    let h = 1;
    let dpr = 1;
    const resize = () => {
      w = canvas.clientWidth || 1;
      h = canvas.clientHeight || 1;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const ptr = { cx: 0, cy: 0, has: false, lx: 0, ly: 0, valid: false };
    const onMove = (e: PointerEvent) => {
      ptr.cx = e.clientX;
      ptr.cy = e.clientY;
      ptr.has = true;
    };
    const onOut = (e: PointerEvent) => {
      if (!e.relatedTarget) ptr.has = false;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerout", onOut, { passive: true });

    let time = 0;
    let lastSound = -1;
    // 1 while the camera flies along the spine, easing to 0 at rest — the lit
    // thread is the path being followed, not a line to read text through
    let hot = 1;

    const draw = (_j: typeof journey, dt: number) => {
      time += dt;
      const g = journey.g;
      const warm = journey.warmth;
      const cam = journey.camera;
      const base = cam.zoom * (h / 1000);
      const f60 = Math.max(0.2, dt * 60);

      /* pointer, in canvas px */
      const rect = canvas.getBoundingClientRect();
      const px = ptr.cx - rect.left;
      const py = ptr.cy - rect.top;
      const inside = ptr.has && px >= 0 && px <= w && py >= 0 && py <= h;
      const lx = ptr.lx;
      const ly = ptr.ly;
      const moved = inside && ptr.valid;
      const pvx = moved ? (px - lx) / f60 : 0;
      const pvy = moved ? (py - ly) / f60 : 0;
      const speed = Math.hypot(pvx, pvy);
      const moveLen = moved ? Math.hypot(px - lx, py - ly) : 0;
      ptr.lx = px;
      ptr.ly = py;
      ptr.valid = inside;

      /* L6: spring the pushed strands home */
      for (const i of pushed) {
        velX[i] = velX[i] * 0.84 - offX[i] * 0.09;
        velY[i] = velY[i] * 0.84 - offY[i] * 0.09;
        offX[i] = clamp(offX[i] + velX[i], -40, 40);
        offY[i] = clamp(offY[i] + velY[i], -40, 40);
        if (Math.abs(offX[i]) + Math.abs(offY[i]) + Math.abs(velX[i]) + Math.abs(velY[i]) < 0.02) {
          offX[i] = offY[i] = velX[i] = velY[i] = 0;
          pushed.delete(i);
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // at step 0 the web is only a hint; the dragline carries the frame
      const reveal = 0.2 + 0.8 * smooth(clamp(g, 0, 1));
      const wobble = warm * 5;
      let plucks = 0;

      const strands = (L: LayerId) => {
        const d = LAYER_DEPTH[L];
        const k = base * d;
        const ox = w / 2 - cam.x * k;
        const oy = h / 2 - cam.y * k;
        const style = LAYER_STYLE[L];
        ctx.lineWidth = style.width * (1 + 1.4 * warm);
        ctx.globalAlpha = Math.min(1, style.alpha * (1 + 0.9 * warm) * reveal);
        ctx.strokeStyle = colors.fg;
        const interactive = L !== 0 && moved;
        ctx.beginPath();
        const [from, to] = range[L];
        for (let i = from; i < to; i++) {
          const x1 = S.ax[i] * k + ox;
          const y1 = S.ay[i] * k + oy;
          const x2 = S.bx[i] * k + ox;
          const y2 = S.by[i] * k + oy;
          if ((x1 < -M && x2 < -M) || (x1 > w + M && x2 > w + M) || (y1 < -M && y2 < -M) || (y1 > h + M && y2 > h + M)) continue;
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.hypot(dx, dy);
          if (len < 0.75) continue;
          const nx = -dy / len;
          const ny = dx / len;

          let perp = 0;
          if (pluckT[i] >= 0) {
            const t = time - pluckT[i];
            if (t > 1.6) pluckT[i] = -1;
            else perp += pluckWave(t, pluckA[i], clamp(1400 / (len / k + 60), 4, 11), 3.6);
          }
          if (wobble > 0.01) perp += wobble * Math.sin(time * S.speed[i] + S.phase[i]);

          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          ctx.moveTo(x1, y1);
          ctx.quadraticCurveTo(mx + nx * perp + offX[i], my + ny * perp + S.sag[i] * k + offY[i], x2, y2);

          if (!interactive) continue;
          // L6: cursor velocity pushes the midpoint, (1 - d/r)^3 falloff
          const qx = mx - px;
          const qy = my - py;
          const q2 = qx * qx + qy * qy;
          if (speed > 0.4 && q2 < PUSH_R * PUSH_R) {
            const fall = Math.pow(1 - Math.sqrt(q2) / PUSH_R, 3);
            velX[i] += pvx * fall * 0.32;
            velY[i] += pvy * fall * 0.32;
            pushed.add(i);
          }
          // L4: crossing a strand plucks it into a damped sine
          if (moveLen > 1.5 && plucks < 6) {
            const side = crossing(lx, ly, px, py, x1, y1, x2, y2);
            if (side !== 0 && (pluckT[i] < 0 || time - pluckT[i] > 0.12)) {
              const amp = clamp(speed * 0.55, 3, 14);
              pluckT[i] = time;
              pluckA[i] = side * amp;
              plucks++;
              if (time - lastSound > 0.07) {
                lastSound = time;
                const worldLen = len / k;
                sound.pluck({ pitch: clamp(1 - worldLen / 260, 0.05, 0.95), gain: clamp(amp / 14, 0.15, 0.7) });
              }
            }
          }
        }
        ctx.stroke();
      };

      strands(0);
      strands(1);

      /* the spine — travelled silk in --accent, the rest faint */
      const k = base;
      const ox = w / 2 - cam.x * k;
      const oy = h / 2 - cam.y * k;
      const sp = W.spine;
      const pts = sp.pts;
      const total = sp.cum[sp.cum.length - 1];
      const dragLen = sp.cum[sp.pieceEnd[0]];
      const entry = 1 - Math.pow(1 - clamp(stage.entry, 0, 1), 2);
      const D = spineLength(sp, spinePieces(g), entry);
      hot += ((travelAt(g) || g < 0.5 ? 1 : 0) - hot) * (1 - Math.pow(1 - 0.08, dt * 60));

      // untravelled (never the undropped part of the dragline)
      ctx.globalAlpha = 0.3 * reveal * (1 + 0.6 * warm);
      ctx.strokeStyle = colors.fg;
      ctx.lineWidth = 1.2 * (1 + warm);
      ctx.beginPath();
      let started = false;
      for (let i = sp.pieceEnd[0]; i < sp.cum.length; i++) {
        if (sp.cum[i] < Math.max(D, dragLen) && i < sp.cum.length - 1 && sp.cum[i + 1] <= Math.max(D, dragLen)) continue;
        const x = pts[i * 2] * k + ox;
        const y = pts[i * 2 + 1] * k + oy;
        if (!started) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        started = true;
      }
      ctx.stroke();

      // travelled: a soft glow under a bright line, ending in a bead
      let tipX = pts[0] * k + ox;
      let tipY = pts[1] * k + oy;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      for (let i = 1; i < sp.cum.length; i++) {
        const x = pts[i * 2] * k + ox;
        const y = pts[i * 2 + 1] * k + oy;
        if (sp.cum[i] <= D) {
          ctx.lineTo(x, y);
          tipX = x;
          tipY = y;
          continue;
        }
        const seg = sp.cum[i] - sp.cum[i - 1] || 1;
        const t = (D - sp.cum[i - 1]) / seg;
        if (t > 0) {
          tipX = tipX + (x - tipX) * t;
          tipY = tipY + (y - tipY) * t;
          ctx.lineTo(tipX, tipY);
        }
        break;
      }
      ctx.strokeStyle = colors.accent;
      if (D > 0.5) {
        ctx.globalAlpha = 0.16 * hot;
        ctx.lineWidth = 7 + 4 * warm;
        ctx.stroke();
        ctx.globalAlpha = 0.35 + 0.6 * hot;
        ctx.lineWidth = 1.2 + 0.6 * hot + 1.4 * warm;
        ctx.stroke();
        if (D < total) {
          ctx.fillStyle = colors.accent;
          ctx.beginPath();
          ctx.arc(tipX, tipY, 3.2 + 0.6 * Math.sin(time * 5), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      /* chapter nodes — knots on the web */
      for (const r of RANGES) {
        const x = r.node.x * k + ox;
        const y = r.node.y * k + oy;
        if (x < -40 || x > w + 40 || y < -40 || y > h + 40) continue;
        const visited = g >= r.start - 0.02 && (r.index > 0 || entry > 0.98);
        const presence = journey.frame(r.id).presence;
        if (presence > 0.01) {
          ctx.globalAlpha = 0.4 * presence;
          ctx.strokeStyle = colors.accent;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, 10 + 4 * Math.sin(time * 2.2), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(x, y, 3.4 * (1 + 0.3 * warm), 0, Math.PI * 2);
        if (visited) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = colors.accent;
          ctx.fill();
        } else {
          ctx.globalAlpha = 0.55 * reveal;
          ctx.strokeStyle = colors.fg;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }

      /* dew — glints drift on their own phase, brighten near the cursor */
      const dewAlpha = 0.5 * reveal * (1 - 0.7 * warm);
      if (dewAlpha > 0.02) {
        for (const d of W.dew) {
          const x = d.x * k + ox;
          const y = d.y * k + oy;
          if (x < -10 || x > w + 10 || y < -10 || y > h + 10) continue;
          let glint = 0.5 + 0.5 * Math.sin(time * 1.3 + d.phase);
          if (inside) {
            const dd = Math.hypot(x - px, y - py);
            if (dd < 160) glint = Math.max(glint, 1 - dd / 160);
          }
          ctx.globalAlpha = dewAlpha * (0.25 + 0.55 * glint);
          dew(ctx, { x, y }, clamp(d.r * k * 0.9, 1.2, 6), colors.muted, colors.fg);
        }
      }

      strands(2);
      ctx.globalAlpha = 1;
    };

    const unsub = journey.subscribe(draw);

    return () => {
      unsub();
      mo.disconnect();
      ro.disconnect();
      window.clearTimeout(colorTimer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onOut);
    };
  }, []);

  return <canvas ref={ref} className="journey-canvas" aria-hidden="true" />;
}

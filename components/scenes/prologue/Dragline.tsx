"use client";

/**
 * Prologue — the dragline. A single silk thread drops from the top of the
 * stage, a spider rides it down and settles; then the line is revealed.
 *
 * ELEMENTS → REFERENCES
 *   Thread drops in (line draw, top → down) and settles with a stretch
 *     → Awwwards SOTD "SVG line drawing on progress"; settle = L4 damped return
 *   Drag the thread sideways, release → damped sine; sound.pluck
 *     → L4 animation-reference/physics/2 (quadratic bézier dragged by the
 *       pointer, released into a damped-sine return)
 *   Words revealed one by one through a mask, staggered
 *     → Awwwards masked text reveal; meermohsin.me heavy staggered reveals
 *   "I follow it." decodes from glyphs
 *     → Awwwards scramble/decode text effect, glyphs from the hero's cold
 *       notation set (components/hero/Ambient.tsx)
 *   Leaving (local 0 → 1): the spider keeps descending on its thread
 *     → meermohsin.me pinned, scrubbed GSAP stages
 * The spider/web theme is the user's.
 */
import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "@/lib/motion/gsap";
import { journey } from "@/lib/journey/journey";
import { sound } from "@/lib/audio/sound";

const GLYPHS = "∑∂λπ∇∫≈⊕θΔ";
const MAX_PULL = 160;
const REST_D = "M500 -2 Q500 170 500 340";

export default function Dragline() {
  const svgRef = useRef<SVGSVGElement>(null);
  const threadRef = useRef<SVGPathElement>(null);
  const hitRef = useRef<SVGPathElement>(null);
  const spiderRef = useRef<SVGGElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const thread = threadRef.current;
    const hit = hitRef.current;
    const spider = spiderRef.current;
    const btn = btnRef.current;
    const scene = svg?.closest<HTMLElement>(".scene--prologue");
    if (!svg || !thread || !hit || !spider || !btn || !scene) return;

    const words = Array.from(scene.querySelectorAll<HTMLElement>(".pro-word > span"));
    const sub = scene.querySelector<HTMLElement>(".pro-scramble");
    const subText = sub?.textContent ?? "";

    /* ── geometry, in CSS px of the svg box ───────────────────────────── */
    let w = 1;
    let h = 1;
    const resize = () => {
      const r = svg.getBoundingClientRect();
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      svg.setAttribute("viewBox", `0 0 ${w.toFixed(0)} ${h.toFixed(0)}`);
      render();
    };

    // animated state
    const st = {
      drop: 1, // 0 … 1 how far the thread has dropped (static default: fully down)
      descend: 0, // extra descent while leaving the chapter
      pull: 0, // sideways displacement of the thread's belly, px
      pullY: 0.5, // where along the thread the pull sits (0 top … 1 spider)
    };

    const render = () => {
      const x0 = w * 0.5;
      const rest = h * 0.34;
      const end = rest * st.drop + st.descend * h * 0.75;
      // the spider hangs from the end; it swings with a fraction of the pull
      const sx = x0 + st.pull * 0.35;
      const cy = end * st.pullY;
      const cx = x0 + st.pull * 1.6 * (1 - Math.abs(st.pullY - 0.5));
      const d = `M${x0.toFixed(1)} -2 Q${cx.toFixed(1)} ${cy.toFixed(1)} ${sx.toFixed(1)} ${end.toFixed(1)}`;
      thread.setAttribute("d", d);
      hit.setAttribute("d", d);
      const tilt = (st.pull * 0.08).toFixed(2);
      spider.setAttribute("transform", `translate(${sx.toFixed(1)} ${end.toFixed(1)}) rotate(${tilt})`);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(svg);
    resize();

    /* ── L4: drag the silk, release into a damped sine ────────────────── */
    let dragging = false;
    let release = { t0: 0, amp: 0, active: false };
    let raf = 0;

    const loop = () => {
      raf = 0;
      if (!release.active) return;
      const t = (performance.now() - release.t0) / 1000;
      // damped sine starting from the released displacement (cosine phase so there is no jump)
      st.pull = release.amp * Math.exp(-3.6 * t) * Math.cos(Math.PI * 2 * 3.2 * t);
      render();
      if (t > 2.2) {
        release.active = false;
        st.pull = 0;
        render();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    const pluck = (amp: number) => {
      release = { t0: performance.now(), amp, active: true };
      sound.pluck({ pitch: 0.25 + (1 - Math.min(1, Math.abs(amp) / MAX_PULL)) * 0.35, gain: 0.3 + (Math.abs(amp) / MAX_PULL) * 0.6 });
      if (prefersReducedMotion()) {
        release.active = false;
        st.pull = 0;
        render();
        return;
      }
      if (!raf) raf = requestAnimationFrame(loop);
    };

    const local = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      dragging = true;
      release.active = false;
      hit.setPointerCapture(e.pointerId);
      scene.dataset.pulling = "true";
      // this gesture is a pluck, not a swipe to the next chapter
      e.preventDefault();
      e.stopPropagation();
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const p = local(e);
      const end = Math.max(1, h * 0.34 * st.drop + st.descend * h * 0.75);
      st.pullY = Math.min(0.85, Math.max(0.15, p.y / end));
      const raw = p.x - w * 0.5;
      // resistance grows as the silk stretches
      st.pull = Math.sign(raw) * MAX_PULL * (1 - Math.exp(-Math.abs(raw) / MAX_PULL));
      render();
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      delete scene.dataset.pulling;
      if (hit.hasPointerCapture(e.pointerId)) hit.releasePointerCapture(e.pointerId);
      pluck(st.pull);
    };
    hit.addEventListener("pointerdown", onDown);
    hit.addEventListener("pointermove", onMove);
    hit.addEventListener("pointerup", onUp);
    hit.addEventListener("pointercancel", onUp);
    const onKeyPluck = () => {
      st.pullY = 0.5;
      pluck(70);
    };
    btn.addEventListener("click", onKeyPluck);

    /* ── intro: plays once, the first time the stage shows the prologue ── */
    let introState: "idle" | "armed" | "played" = "idle";
    let visible = false;
    let lastLeave = 0;
    let tl: gsap.core.Timeline | null = null;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.35 });
    io.observe(svg.parentElement ?? scene);

    const scramble = (p: number) => {
      if (!sub) return;
      const n = subText.length;
      let out = "";
      for (let i = 0; i < n; i++) {
        const ch = subText[i];
        const at = i / n;
        if (ch === " " || p >= at + 0.25) out += ch;
        else if (p >= at) out += GLYPHS[(i * 7 + Math.floor(p * 40)) % GLYPHS.length];
        else out += " ";
      }
      sub.textContent = out;
    };

    const play = () => {
      introState = "played";
      tl = gsap.timeline({
        onComplete: () => {
          delete scene.dataset.intro;
        },
      });
      const s = { p: 0 };
      tl.fromTo(st, { drop: 0 }, { drop: 1, duration: 1.6, ease: "elastic.out(1, 0.45)", onUpdate: render }, 0.15)
        .fromTo(words, { yPercent: 110 }, { yPercent: 0, duration: 0.9, ease: "expo.out", stagger: 0.09 }, 1.05)
        .to(s, { p: 1.25, duration: 1.1, ease: "none", onUpdate: () => scramble(s.p) }, 1.7);
    };

    const unsub = journey.subscribe((j) => {
      if (!j.live) return;
      const f = j.frame("prologue");
      if (introState === "idle") {
        // hide the final state only now that we know the motion will run
        introState = "armed";
        scene.dataset.intro = "pending";
        st.drop = 0;
        words.forEach((el) => gsap.set(el, { yPercent: 110 }));
        scramble(0);
        render();
      }
      if (introState === "armed" && visible && f.presence > 0.5) play();
      const leave = Math.min(1, Math.max(0, f.local));
      if (leave !== lastLeave) {
        lastLeave = leave;
        st.descend = leave * leave;
        render();
      }
    });

    return () => {
      unsub();
      ro.disconnect();
      io.disconnect();
      tl?.kill();
      if (raf) cancelAnimationFrame(raf);
      hit.removeEventListener("pointerdown", onDown);
      hit.removeEventListener("pointermove", onMove);
      hit.removeEventListener("pointerup", onUp);
      hit.removeEventListener("pointercancel", onUp);
      btn.removeEventListener("click", onKeyPluck);
      delete scene.dataset.intro;
      if (sub) sub.textContent = subText;
    };
  }, []);

  return (
    <>
      {/* server-rendered at rest in a 1000-unit box; JS swaps in a px viewBox */}
      <svg
        ref={svgRef}
        className="pro-svg"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMin meet"
        aria-hidden="true"
        focusable="false"
      >
        <path ref={threadRef} className="pro-thread" d={REST_D} />
        <path ref={hitRef} className="pro-thread-hit" data-journey-free d={REST_D} />
        <g ref={spiderRef} className="pro-spider" transform="translate(500 340)">
          {/* abdomen up (silk leaves the spinnerets), head down */}
          <ellipse cx="0" cy="9" rx="6.5" ry="8.5" />
          <circle cx="0" cy="21" r="4.2" />
          <path
            className="pro-legs"
            d="M-3 19 L-11 13 L-17 20 M-3 21 L-12 19 L-18 27 M-3 23 L-11 26 L-15 34 M-2 24 L-8 31 L-9 39 M3 19 L11 13 L17 20 M3 21 L12 19 L18 27 M3 23 L11 26 L15 34 M2 24 L8 31 L9 39"
          />
        </g>
      </svg>
      <button ref={btnRef} type="button" className="pro-pluck mono">
        Pluck the thread
      </button>
    </>
  );
}

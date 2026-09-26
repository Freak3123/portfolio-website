"use client";

/**
 * Site sound — synthesised with Web Audio, no files.
 *
 * CONTRACT (scenes call these; implementations may change, names may not):
 *   sound.enabled                 true once the visitor has turned sound on
 *   sound.enable() / disable() / toggle()
 *   sound.onChange(fn)            fn() when enabled flips; returns unsubscribe
 *   sound.pluck({ pitch, gain })  a silk strand plucked. pitch 0…1 (low…high)
 *   sound.travel(dir)             camera flight along a thread, dir 1 | -1
 *   sound.chime(pitch)            a node lighting up / a connection made. pitch 0…1
 *   sound.tick()                  tiny UI tick (hover on nav, map nodes)
 *   sound.setWarmth(w)            0 cold ambient … 1 warm ambient
 *
 * Additions (read-only helpers for the sound gate):
 *   sound.preference              "on" | "off" | null — the visitor's stored choice
 *   sound.running                 the AudioContext is actually producing sound
 *
 * Every method is a silent no-op until enabled. Browsers only allow audio after
 * a user gesture, so nothing ever plays on load: enable() must be called from
 * inside a gesture handler (the gate does this), even when the stored
 * preference is "on".
 *
 * Reference: the ambient bed + UI sounds behind an opt-in toggle is the
 * meermohsin.me "click anywhere to activate the experience" pattern and the
 * Awwwards SOTD sound-toggle convention. The voices themselves are standard
 * synthesis recipes: Karplus–Strong plucked string, FM bell, filtered-noise
 * whoosh, detuned-sine drone + band-passed noise "wind".
 */
type Pluck = { pitch?: number; gain?: number };

const KEY = "ap-sound";
const MASTER = 0.32; // modest master level
/** major pentatonic, as semitone offsets over three octaves */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33];
const semis = (n: number) => Math.pow(2, n / 12);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

type Ctx = AudioContext;
type Voice = "pluck" | "travel" | "chime" | "tick";

class Sound {
  enabled = false;
  private subs = new Set<() => void>();

  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private coldBus: GainNode | null = null;
  private warmBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private ksCache = new Map<number, AudioBuffer>();
  private warmthValue = 0;
  private heroWarm = false;
  private boxTimer = 0;
  private suspendTimer = 0;
  private voices = 0;
  private last = { pluck: 0, travel: 0, chime: 0, tick: 0 };
  private observer: MutationObserver | null = null;

  /* ── preference ─────────────────────────────────────────────────────── */

  get preference(): "on" | "off" | null {
    try {
      const v = localStorage.getItem(KEY);
      return v === "on" || v === "off" ? v : null;
    } catch {
      return null;
    }
  }
  private store(v: "on" | "off") {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* private mode / blocked storage: the choice just is not remembered */
    }
  }

  get running() {
    return !!this.ctx && this.ctx.state === "running";
  }

  /* ── on / off ───────────────────────────────────────────────────────── */

  enable() {
    if (typeof window === "undefined") return;
    const ctx = this.ensure();
    if (!ctx) return;
    window.clearTimeout(this.suspendTimer);
    // resume() inside the gesture is what unlocks audio
    ctx.resume().then(
      () => this.emit(),
      () => {},
    );
    this.store("on");
    if (this.enabled) return;
    this.enabled = true;
    const now = ctx.currentTime;
    const g = this.master!.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(MASTER, now + 1.2);
    this.applyWarmth(0.1);
    this.scheduleBox();
    this.emit();
  }

  disable() {
    this.store("off");
    if (!this.enabled) return;
    this.enabled = false;
    const ctx = this.ctx;
    if (ctx && this.master) {
      const now = ctx.currentTime;
      const g = this.master.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + 0.5);
      window.clearTimeout(this.boxTimer);
      this.suspendTimer = window.setTimeout(() => {
        if (!this.enabled) void ctx.suspend();
      }, 700);
    }
    this.emit();
  }

  toggle() {
    if (this.enabled) this.disable();
    else this.enable();
  }

  onChange(fn: () => void) {
    this.subs.add(fn);
    return () => void this.subs.delete(fn);
  }
  private emit() {
    for (const fn of this.subs) fn();
  }

  /* ── graph ──────────────────────────────────────────────────────────── */

  private ensure(): Ctx | null {
    if (this.ctx) return this.ctx;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 18;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);

    this.coldBus = ctx.createGain();
    this.coldBus.gain.value = 0;
    this.coldBus.connect(this.master);
    this.warmBus = ctx.createGain();
    this.warmBus.gain.value = 0;
    this.warmBus.connect(this.master);

    // 2 s of white noise, shared by the wind, the whoosh and the tick
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.buildCold(ctx);
    this.buildWarmPad(ctx);
    this.watchHero();

    // a hidden tab makes no sound and burns no CPU
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (this.enabled) void this.ctx.resume();
    });
    return ctx;
  }

  /** cold: low, slow, airy — detuned sines + wind through silk */
  private buildCold(ctx: Ctx) {
    const bus = this.coldBus!;
    const drone = ctx.createGain();
    drone.gain.value = 0.16;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    drone.connect(lp).connect(bus);
    for (const [f, det] of [
      [55, -6],
      [55, 7],
      [82.41, 3],
      [110, -4],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      // each voice breathes on its own slow clock
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.04 + Math.random() * 0.06;
      const depth = ctx.createGain();
      depth.gain.value = 0.12;
      lfo.connect(depth).connect(g.gain);
      o.connect(g).connect(drone);
      o.start();
      lfo.start();
    }

    // wind: looping noise through a slowly sweeping band-pass
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 700;
    bp.Q.value = 0.9;
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.05;
    const sweepDepth = ctx.createGain();
    sweepDepth.gain.value = 420;
    sweep.connect(sweepDepth).connect(bp.frequency);
    const wind = ctx.createGain();
    wind.gain.value = 0.05;
    const gust = ctx.createOscillator();
    gust.frequency.value = 0.08;
    const gustDepth = ctx.createGain();
    gustDepth.gain.value = 0.03;
    gust.connect(gustDepth).connect(wind.gain);
    src.connect(bp).connect(wind).connect(bus);
    src.start();
    sweep.start();
    gust.start();
  }

  /** warm: a soft, bright pad under the music-box plucks */
  private buildWarmPad(ctx: Ctx) {
    const pad = ctx.createGain();
    pad.gain.value = 0.035;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    pad.connect(lp).connect(this.warmBus!);
    for (const f of [261.63, 329.63, 392]) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      o.connect(pad);
      o.start();
    }
  }

  /** music-box plucks at random intervals, only audible on the warm bus */
  private scheduleBox() {
    window.clearTimeout(this.boxTimer);
    const loop = () => {
      if (!this.enabled || !this.ctx) return;
      if (this.effectiveWarmth() > 0.05 && !document.hidden) this.musicBox();
      this.boxTimer = window.setTimeout(loop, 900 + Math.random() * 2600);
    };
    this.boxTimer = window.setTimeout(loop, 1200);
  }

  private musicBox() {
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.02;
    const f = 523.25 * semis(PENTA[5 + Math.floor(Math.random() * 8)] - 12);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.09, t + 0.005);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    out.connect(this.warmBus!);
    for (const [mult, amp] of [
      [1, 1],
      [3, 0.18],
      [4.2, 0.08],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.value = amp;
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 2.3);
    }
  }

  /* ── warmth ─────────────────────────────────────────────────────────── */

  private watchHero() {
    const root = document.documentElement;
    const read = () => {
      this.heroWarm = root.dataset.heroState === "warm";
      this.applyWarmth(1.2);
    };
    read();
    this.observer = new MutationObserver(read);
    this.observer.observe(root, { attributes: true, attributeFilter: ["data-hero-state"] });
  }

  private effectiveWarmth() {
    return Math.max(this.warmthValue, this.heroWarm ? 1 : 0);
  }

  private applyWarmth(tc = 0.6) {
    const ctx = this.ctx;
    if (!ctx || !this.coldBus || !this.warmBus) return;
    const w = this.effectiveWarmth();
    const now = ctx.currentTime;
    // equal-power crossfade
    this.coldBus.gain.setTargetAtTime(Math.cos((w * Math.PI) / 2), now, tc / 3);
    this.warmBus.gain.setTargetAtTime(Math.sin((w * Math.PI) / 2), now, tc / 3);
  }

  setWarmth(w: number) {
    const v = clamp01(w);
    if (Math.abs(v - this.warmthValue) < 0.01) return;
    this.warmthValue = v;
    this.applyWarmth();
  }

  /* ── voices ─────────────────────────────────────────────────────────── */

  private gate(kind: Voice, minMs: number, maxVoices = 10) {
    if (!this.enabled || !this.running) return false;
    const now = performance.now();
    if (now - this.last[kind] < minMs) return false;
    if (this.voices >= maxVoices) return false;
    this.last[kind] = now;
    return true;
  }
  private hold(node: AudioScheduledSourceNode) {
    this.voices++;
    node.onended = () => {
      this.voices--;
    };
  }

  /** Karplus–Strong: a noise burst circulating through a damped delay line */
  private ksBuffer(note: number) {
    const hit = this.ksCache.get(note);
    if (hit) return hit;
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const freq = 196 * semis(note);
    const period = Math.max(2, Math.round(sr / freq));
    const dur = 1.8;
    const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const out = buf.getChannelData(0);
    const line = new Float32Array(period);
    for (let i = 0; i < period; i++) line[i] = Math.random() * 2 - 1;
    let p = 0;
    const damp = 0.996;
    for (let i = 0; i < out.length; i++) {
      const next = (p + 1) % period;
      const v = line[p];
      out[i] = v;
      line[p] = damp * 0.5 * (v + line[next]);
      p = next;
    }
    this.ksCache.set(note, buf);
    return buf;
  }

  pluck({ pitch = 0.5, gain = 1 }: Pluck = {}) {
    if (!this.gate("pluck", 35, 8)) return;
    const ctx = this.ctx!;
    const note = PENTA[Math.round(clamp01(pitch) * (PENTA.length - 1))];
    const src = ctx.createBufferSource();
    src.buffer = this.ksBuffer(note);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 90;
    const g = ctx.createGain();
    g.gain.value = 0.22 * clamp01(gain);
    src.connect(hp).connect(g).connect(this.master!);
    this.hold(src);
    src.start();
  }

  travel(dir: 1 | -1) {
    if (!this.gate("travel", 280, 10)) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const dur = 0.9;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.6;
    const [a, b] = dir === 1 ? [320, 2600] : [2600, 320];
    bp.frequency.setValueAtTime(a, t);
    bp.frequency.exponentialRampToValueAtTime(b, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.master!);
    this.hold(src);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  chime(pitch = 0.5) {
    if (!this.gate("chime", 60, 8)) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const note = PENTA[Math.round(clamp01(pitch) * (PENTA.length - 1))];
    const f = 440 * semis(note);
    // FM bell: inharmonic modulator ratio, modulation index decaying fast
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f * 1.4;
    const idx = ctx.createGain();
    idx.gain.setValueAtTime(f * 2.2, t);
    idx.gain.exponentialRampToValueAtTime(f * 0.05, t + 1.4);
    mod.connect(idx).connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    car.connect(g).connect(this.master!);
    this.hold(car);
    car.start(t);
    mod.start(t);
    car.stop(t + 2.5);
    mod.stop(t + 2.5);
  }

  tick() {
    if (!this.gate("tick", 45, 12)) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "bandpass";
    hp.frequency.value = 4200;
    hp.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(hp).connect(g).connect(this.master!);
    this.hold(src);
    src.start(t, Math.random() * 1.5);
    src.stop(t + 0.04);
  }
}

export const sound = new Sound();

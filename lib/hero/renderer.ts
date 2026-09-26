import {
  COLOR,
  EAR,
  EAR_RECT,
  EAR_SPACE,
  EAR_SRC,
  IMG,
  MAX_DPR,
  TEAR,
  rgb,
} from "./constants";
import type { HeroEngine } from "./engine";
import { FRAG, VERT } from "./shaders";

const WIDTHS = [768, 1024, 1280] as const;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader: " + log);
  }
  return sh;
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("load " + src));
    img.src = src;
  });
}

/**
 * Rasterise an earring SVG into the shared 300×820 "ear space", so one inverse
 * mapping in the shader serves both files despite their different viewBoxes.
 * The browser does the rasterising, which is why there is no build step here.
 */
async function rasteriseEar(which: "cold" | "warm", px: number) {
  const s = EAR_SRC[which];
  const img = await load(s.file);
  const c = document.createElement("canvas");
  const k = px / EAR_SPACE.w;
  c.width = Math.round(EAR_SPACE.w * k);
  c.height = Math.round(EAR_SPACE.h * k);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, s.dy * k, s.w * k, s.h * k);
  return c;
}

export class PortraitRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private tex: Record<string, WebGLTexture> = {};
  private dpr = 1;
  ready = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private engine: HeroEngine,
  ) {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("no webgl2");
    this.gl = gl;

    this.prog = gl.createProgram()!;
    gl.attachShader(this.prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(this.prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(this.prog);
    if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) {
      throw new Error("link: " + gl.getProgramInfoLog(this.prog));
    }
    gl.useProgram(this.prog);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(this.prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    for (const name of [
      "uCold", "uWarm", "uEarCold", "uEarWarm", "uImg", "uFitScale", "uFitOffset",
      "uCells", "uState", "uGrammar", "uRippleGrammar", "uTime", "uMouse",
      "uRadius", "uRipple",
      "uRippleR", "uBulb", "uBulbPos", "uLens", "uEarRect", "uEarPivotPost",
      "uEarPivotRing", "uEarAngles", "uEarBlend", "uGroundCold", "uGroundWarm",
      "uRimCold", "uRimWarm", "uFeather",
    ]) {
      this.u[name] = gl.getUniformLocation(this.prog, name);
    }

    // constants that never change
    gl.uniform2f(this.u.uImg, IMG.w, IMG.h);
    gl.uniform2f(this.u.uCells, TEAR.cells[0], TEAR.cells[1]);
    gl.uniform3fv(this.u.uGroundCold, rgb(COLOR.bakedCold));
    gl.uniform3fv(this.u.uGroundWarm, rgb(COLOR.bakedWarm));
    gl.uniform3fv(this.u.uRimCold, rgb(COLOR.ink));
    gl.uniform3fv(this.u.uRimWarm, rgb(COLOR.saffron));
    // uFeather is set per-resize, in uv derived from a fixed pixel width
    gl.uniform4f(this.u.uEarRect, EAR_RECT.x0, EAR_RECT.y0, EAR_RECT.x1, EAR_RECT.y1);
    gl.uniform2f(this.u.uEarPivotPost, EAR.anchor.x, EAR.anchor.y);
    gl.uniform2f(
      this.u.uEarPivotRing,
      EAR.anchor.x,
      EAR.anchor.y + (EAR.ringY - EAR_SPACE.gemTop) * EAR.scale,
    );
    // blend band, normalised into the earring's own rect
    const nb = (y: number) =>
      ((EAR.anchor.y + (y - EAR_SPACE.gemTop) * EAR.scale) - EAR_RECT.y0) /
      (EAR_RECT.y1 - EAR_RECT.y0);
    gl.uniform2f(this.u.uEarBlend, nb(EAR.blend[0]), nb(EAR.blend[1]));
    for (const [i, n] of ["uCold", "uWarm", "uEarCold", "uEarWarm"].entries()) {
      gl.uniform1i(this.u[n], i);
    }
  }

  private upload(unit: number, src: TexImageSource, key: string, mip: boolean) {
    const gl = this.gl;
    const t = this.tex[key] ?? gl.createTexture()!;
    this.tex[key] = t;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (mip) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      // the cold drop is a 10px gold bar with a specular down it — it aliases
      // badly without this, right where the eye goes
      const ext = gl.getExtension("EXT_texture_filter_anisotropic");
      if (ext) {
        gl.texParameterf(
          gl.TEXTURE_2D,
          ext.TEXTURE_MAX_ANISOTROPY_EXT,
          Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)),
        );
      }
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
  }

  async init(heroWidth: number) {
    const mobile = heroWidth < 768;
    this.dpr = Math.min(window.devicePixelRatio || 1, mobile ? MAX_DPR.mobile : MAX_DPR.desktop);
    const need = (heroWidth * this.dpr) / 1.4;
    const w = WIDTHS.find((x) => x >= need) ?? 1280;
    const ext = document.createElement("canvas").toDataURL("image/avif").startsWith("data:image/avif")
      ? "avif"
      : "webp";

    const [cold, warm, ec, ew] = await Promise.all([
      load(`/hero/cold-${w}.${ext}`),
      load(`/hero/warm-${w}.${ext}`),
      rasteriseEar("cold", 300),
      rasteriseEar("warm", 300),
    ]);
    this.upload(0, cold, "cold", true);
    this.upload(1, warm, "warm", true);
    this.upload(2, ec, "earCold", true);
    this.upload(3, ew, "earWarm", true);
    this.ready = true;
  }

  /** Lay the portrait out inside the hero box and tell the engine where it went. */
  resize(w: number, h: number) {
    const gl = this.gl;
    const dpr = this.dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // Centred, standing on the bottom edge. The width cap is what leaves room
    // for the halo to ring her head: at w*1.45 the portrait filled a phone
    // edge to edge and the ring had nowhere to go but across her face.
    const ph = Math.min(h * 0.88, w * 1.2);
    const pw = ph * (IMG.w / IMG.h);
    const x = (w - pw) / 2;
    const y = h - ph;
    this.engine.fit = { x, y, w: pw, h: ph };

    gl.useProgram(this.prog);
    gl.uniform2f(this.u.uFitScale, w / pw, h / ph);
    gl.uniform2f(this.u.uFitOffset, -x / pw, -y / ph);
    // a border, not a vignette: the same ~13px at any portrait size
    gl.uniform2f(this.u.uFeather, 13 / pw, 13 / ph);

    // the viewport's corners in portrait uv, so the global wipe knows how far
    // it has to travel to clear the screen rather than just the portrait
    this.engine.uvRect = {
      x0: -x / pw,
      y0: -y / ph,
      x1: (w - x) / pw,
      y1: (h - y) / ph,
    };
  }

  draw() {
    if (!this.ready) return;
    const gl = this.gl;
    const e = this.engine;
    gl.useProgram(this.prog);
    gl.uniform1f(this.u.uState, e.stateF);
    gl.uniform1f(this.u.uGrammar, e.grammar);
    gl.uniform1f(this.u.uRippleGrammar, e.rippleGrammar);
    gl.uniform1f(this.u.uTime, e.time);
    gl.uniform2f(this.u.uMouse, e.mouse.x, e.mouse.y);
    gl.uniform1f(this.u.uRadius, e.radius);
    gl.uniform2f(this.u.uRipple, e.ripple.x, e.ripple.y);
    gl.uniform1f(this.u.uRippleR, e.rippleR);
    gl.uniform1f(this.u.uBulb, e.bulbLit);
    gl.uniform2f(this.u.uBulbPos, e.bulbPos.x, e.bulbPos.y);
    gl.uniform1f(this.u.uLens, e.lens);
    gl.uniform2f(this.u.uEarAngles, e.earA.theta, e.earB.theta);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose() {
    const gl = this.gl;
    Object.values(this.tex).forEach((t) => gl.deleteTexture(t));
    gl.deleteProgram(this.prog);
    // Deliberately NOT calling WEBGL_lose_context here. getContext() hands back
    // the same context object for a given canvas, so losing it would poison the
    // element for any later renderer — which is exactly what happens under
    // StrictMode's double-mount in dev.
  }
}

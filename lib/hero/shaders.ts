export const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){
  // y flipped here, not via UNPACK_FLIP_Y, so portrait uv matches the pixel
  // coordinates every number in constants.ts was measured in (y down).
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/**
 * One pass does the whole portrait: both layers, both earrings, the tear, the
 * lens and the bulb's falloff.
 *
 * The earrings are composited *here* rather than as their own quads. That is
 * what keeps this to a single draw call with no scene graph — and it also means
 * the tear mask applies to them for free, so tearing near the ear swaps the
 * earring along with the face instead of leaving the wrong one floating on top.
 */
export const FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 frag;

uniform sampler2D uCold, uWarm, uEarCold, uEarWarm;

uniform vec2  uImg;        // 1024 x 1536
uniform vec2  uFitScale;   // canvas uv -> portrait uv
uniform vec2  uFitOffset;
uniform vec2  uCells;      // tear cells across / down

uniform float uState;      // 0 = cold on top, 1 = warm on top
uniform float uGrammar;    // 0 = cells (cold), 1 = organic (warm)
uniform float uRippleGrammar; // the scene wipe's own, floored away from pure cells
uniform float uTime;

uniform vec2  uMouse;      // portrait uv
uniform float uRadius;     // tear radius, uv-x units. 0 = closed
uniform vec2  uRipple;     // portrait uv
uniform float uRippleR;    // 0 = inactive

uniform float uBulb;       // 1 lit, 0 dark
uniform vec2  uBulbPos;    // portrait uv
uniform float uLens;       // 0..1 lens effect strength

uniform vec4  uEarRect;    // x0,y0,x1,y1 in portrait px
uniform vec2  uEarPivotPost;   // portrait px
uniform vec2  uEarPivotRing;   // portrait px
uniform vec2  uEarAngles;      // thetaA, thetaB (radians)
uniform vec2  uEarBlend;       // ear-space y band, normalised 0..1

uniform vec3  uGroundCold, uGroundWarm, uRimCold, uRimWarm;
uniform vec2  uFeather;    // edge dissolve, uv — a fixed pixel width, both axes

const float AR = 1.5;      // uImg.y / uImg.x

/* ---------- noise (L1) ---------- */
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
}
float turbulence(vec2 p){
  float t = 0.0, w = 0.5;
  for (int i = 0; i < 6; i++){ t += abs(noise(p)) * w; p *= 2.0; w *= 0.5; }
  return t;
}

vec2 rot(vec2 v, float a){
  float c = cos(a), s = sin(a);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

/* ---------- the tear ----------
   One function, two grammars, three call sites (hover, touch, the global
   ripple). The tear speaks in the voice of the layer it is tearing through:
   cells while cold is on top, organic while warm is.                       */
float tear(vec2 uv, vec2 c, float r, float grammar){
  if (r <= 0.0) return 0.0;

  /* The noise terms are scaled by the radius so the hole reads the same at any
     size — but the scene-scale ripple reaches r ≈ 2.4, where that put ±1.0 uv
     of turbulence on the edge and ±0.36 uv of per-cell jitter. The boundary
     stopped being a boundary and became static. They are capped at the size of
     an ordinary hole; past that the edge keeps its character instead of
     growing teeth. */
  float rn = min(r, 0.26);

  vec2 q = uv;
  float jitter = 0.0;
  if (grammar < 0.999){
    vec2 cell = floor(uv * uCells);
    q = mix((cell + 0.5) / uCells, uv, grammar);
    jitter = (hash(cell) - 0.5) * 0.30 * rn * (1.0 - grammar);
  }

  vec2 d = q - c; d.y *= AR;
  float dist = length(d);

  // organic edge, from L1
  dist += (turbulence(uv * 25.0 + uTime * 0.75) - 0.5) * rn * 0.45 * grammar;

  // radial silk modulation — 7 lobes, slowly turning. Makes the rim read spun
  // rather than cloudy, which is the web language doing actual work.
  float ang = atan(d.y, d.x);
  float rr = r * (1.0 + 0.12 * sin(ang * 7.0 + uTime * 0.4) * grammar) + jitter;

  // a wipe crossing the whole screen needs a softer edge than a hole does: at
  // hole size this is unchanged, at scene scale it is a wash rather than a line
  float e = mix(0.0015, 0.018, grammar) * (1.0 + r * 1.2);
  return smoothstep(rr + e, rr - e, dist);
}

/* rim band, so the tear edge glows in the other state's accent */
float rimBand(vec2 uv, vec2 c, float r, float grammar){
  if (r <= 0.0) return 0.0;
  vec2 d = uv - c; d.y *= AR;
  float dist = length(d);
  float w = mix(0.003, 0.009, grammar);
  return smoothstep(r + w, r, dist) * smoothstep(r - w * 2.2, r - w * 0.4, dist);
}

/* ---------- glasses (plan §6: analytic, no texture) ---------- */
float lensMask(vec2 uv){
  vec2 a = uv - vec2(0.3742, 0.3361); a.y *= AR;
  vec2 b = uv - vec2(0.5280, 0.2989); b.y *= AR;
  return max(1.0 - smoothstep(0.0600, 0.0679, length(a)),
             1.0 - smoothstep(0.0590, 0.0667, length(b)));
}
/* A highlight travelling across the glass. Quick pass, long wait — glass does
   not shimmer continuously, it catches the light when something moves, so a
   sweep that runs for a third of its cycle and rests for the other two reads as
   glass rather than as an effect. The trailing band is the second surface of
   the lens picking the same light up a moment later. */
float lensGlint(vec2 uv, vec2 c, float r, float phase){
  vec2 d = uv - c; d.y *= AR;
  float rr = length(d) / r;
  if (rr > 1.0) return 0.0;

  float cyc = fract(uTime * 0.13 + phase);
  float run = smoothstep(0.0, 0.05, cyc) * (1.0 - smoothstep(0.30, 0.38, cyc));
  float pos = mix(-1.25, 1.25, clamp(cyc / 0.38, 0.0, 1.0));

  float proj  = (d.x * 0.66 + d.y * 0.75) / r;
  float band  = exp(-pow((proj - pos) * 6.0, 2.0));
  float band2 = exp(-pow((proj - pos + 0.30) * 12.0, 2.0)) * 0.5;

  return (band + band2) * run * (1.0 - smoothstep(0.70, 0.99, rr));
}

vec2 lensRefract(vec2 uv, vec2 c, float r, float k){
  vec2 d = uv - c; d.y *= AR;
  float rr = length(d) / r;
  if (rr > 1.0) return uv;
  d *= 1.0 + k * rr * rr;
  d.y /= AR;
  return c + d;
}

/* ---------- earrings ----------
   Inverse-map a portrait point into shared ear space, undoing the two-body
   rotation. Body A turns about the post; body B's extra rotation fades in
   across a band, so the stem bends at the jump ring instead of shearing. */
vec2 earUV(vec2 px){
  vec2 p = uEarPivotPost + rot(px - uEarPivotPost, -uEarAngles.x);
  float dB = -(uEarAngles.y - uEarAngles.x);
  vec2 q = p;
  for (int i = 0; i < 2; i++){
    float ey = (q.y - uEarRect.y) / (uEarRect.w - uEarRect.y);
    float t  = smoothstep(uEarBlend.x, uEarBlend.y, ey);
    q = uEarPivotRing + rot(p - uEarPivotRing, dB * t);
  }
  return (q - uEarRect.xy) / (uEarRect.zw - uEarRect.xy);
}

vec4 sampleEar(sampler2D tex, vec2 uv){
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture(tex, uv);
}

void main(){
  // canvas uv -> portrait uv (cover fit, computed on the CPU)
  vec2 uv = vUv * uFitScale + uFitOffset;

  /* Which layer shows here. Both the ripple and the press-peek apply to the
     whole canvas, not only to the portrait — the other world lies under the
     empty field too, so tearing out there shows its ground. */
  float ripple = tear(uv, uRipple, uRippleR, uRippleGrammar);
  float hole   = tear(uv, uMouse, uRadius, uGrammar);
  float m = max(hole, ripple);
  float showWarm = mix(uState, 1.0 - uState, m);

  /* The page ground is the artwork's own baked field, read from the texture.
     One sample is enough because the field is flattened at build time — see
     flatten_field() in scripts/build-hero-assets.py. It was not flat in the
     source (cold read (8,13,19) at the left edge against (11,18,26) at the
     right), and with hard edges that gradient drew a faint but perfectly
     straight full-height line where the portrait met the ground. Flattening it
     in the asset is the fix; matching it in the shader only ever chased it. */
  const vec2 FIELD = vec2(0.006, 0.02);
  vec3 ground = mix(texture(uCold, FIELD).rgb, texture(uWarm, FIELD).rgb, showWarm);

  /* The lamp lights the whole scene, not just her. Computing this before the
     bounds branch is not a tidiness point: applying it only inside the portrait
     left her sitting in a brighter rectangle, which is exactly the seam the
     side feather used to be hiding. */
  vec2 bd = uv - uBulbPos; bd.y *= AR;
  float fall = 1.0 - smoothstep(0.2, 2.3, length(bd));
  float lightMul = mix(1.0, 0.74 + 0.42 * fall, uBulb * (1.0 - uState));
  ground *= lightMul;

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0){
    float rimOut = max(rimBand(uv, uMouse, uRadius, uGrammar),
                       rimBand(uv, uRipple, uRippleR, uRippleGrammar));
    frag = vec4(mix(ground, mix(uRimWarm, uRimCold, uState), rimOut * 0.3), 1.0);
    return;
  }

  /* lens: refract, then a chromatic fringe — the part that reads as glass
     rather than as a blur */
  /* The glass is always glass. It used to be inert until the cursor came near,
     which meant the lens only existed for people who happened to hover there;
     it now sits at a third strength and rises to full on approach. */
  vec2 uvC = uv, uvR = uv, uvB = uv;
  float lm = lensMask(uv) * max(0.34, uLens);
  if (lm > 0.001){
    vec2 l1 = lensRefract(uv, vec2(0.3742, 0.3361), 0.0679, 0.06);
    vec2 l2 = lensRefract(uv, vec2(0.5280, 0.2989), 0.0667, 0.06);
    vec2 ld = mix(uv, (length(l1 - uv) > length(l2 - uv)) ? l1 : l2, lm);
    // low-amplitude smudge — an unclean lens, kept near subliminal — plus a
    // very slow breathing so the glass is never perfectly static
    ld += (vec2(noise(uv * 120.0), noise(uv * 120.0 + 7.3)) - 0.5) * 0.0018 * lm;
    ld += vec2(sin(uTime * 0.31 + uv.y * 9.0), cos(uTime * 0.27 + uv.x * 9.0))
          * 0.0006 * lm;
    uvC = ld;
    uvR = ld + vec2( 0.0015, 0.0) * lm;
    uvB = ld + vec2(-0.0015, 0.0) * lm;
  }

  vec3 cold = vec3(texture(uCold, uvR).r, texture(uCold, uvC).g, texture(uCold, uvB).b);
  vec3 warm = vec3(texture(uWarm, uvR).r, texture(uWarm, uvC).g, texture(uWarm, uvB).b);

  /* earrings, composited per layer then chosen by the same mask */
  vec2 eUV = earUV(uv * uImg);
  vec4 ec = sampleEar(uEarCold, eUV);
  vec4 ew = sampleEar(uEarWarm, eUV);
  cold = mix(cold, ec.rgb, ec.a);
  warm = mix(warm, ew.rgb, ew.a);

  vec3 col = mix(cold, warm, showWarm);

  /* specular streak across the lens, angled by where the cursor is standing */
  if (lm > 0.001){
    vec2 d = uv - vec2(0.45, 0.32);
    float streak = exp(-pow((d.x * 1.8 + d.y * 2.6 + 0.06), 2.0) * 900.0);
    col += streak * lm * 0.16;

    /* and the travelling glint — the two lenses run out of phase, because two
       pieces of glass at different angles never catch the light together */
    float g = lensGlint(uv, vec2(0.3742, 0.3361), 0.0679, 0.0)
            + lensGlint(uv, vec2(0.5280, 0.2989), 0.0667, 0.41);
    col += vec3(1.0, 0.985, 0.94) * g * 0.26;
  }

  /* the bulb's light. Its collapse is what sells the switch — the cold state
     has to feel *lit*, not merely dark. Same multiplier the ground already got. */
  col *= lightMul;

  /* rim at the tear edge, in the accent of whatever is showing through */
  float rb = max(rimBand(uv, uMouse, uRadius, uGrammar),
                 rimBand(uv, uRipple, uRippleR, uRippleGrammar));
  // restrained — a lit edge, not an outline round a magnifying glass
  col = mix(col, mix(uRimWarm, uRimCold, uState), rb * 0.3);

  /* A soft border, and only a border. The earlier fade was a percentage of the
     portrait's width, which at ~13% reached well into her hair and read as the
     picture being out of focus. This one is a fixed handful of pixels converted
     to uv on the CPU, so it stays a rim at any size: invisible where field
     meets field, and just enough to stop her coat and jeans being guillotined
     where the source frame cuts them. */
  vec2 e = min(smoothstep(vec2(0.0), uFeather, uv),
               smoothstep(vec2(1.0), vec2(1.0) - uFeather, uv));
  col = mix(ground, col, min(e.x, smoothstep(0.0, uFeather.y, uv.y)));

  frag = vec4(col, 1.0);
}`;

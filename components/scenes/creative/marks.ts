/**
 * The creative self's drawing vocabulary, lifted verbatim from the hero's warm
 * orbiters (components/hero/Ambient.tsx → MARKS / MARK_COLOURS) so the "other
 * half" chapter is visibly the same hand as the saffron portrait.
 *
 * Reference: the hero art's own white doodles (animation-reference/characters/
 * warm.svg) — hearts, stars, paper plane, spiral, squiggle, motion lines.
 */
export const MARKS = [
  "M0 4 C0 0 5 0 5 3.5 C5 0 10 0 10 4 C10 8 5 11 5 11 C5 11 0 8 0 4 Z", // heart
  "M6 0 L7.6 4.2 L12 4.6 L8.6 7.5 L9.7 12 L6 9.4 L2.3 12 L3.4 7.5 L0 4.6 L4.4 4.2 Z", // star
  "M0 6 L14 0 L9 6 L14 12 Z", // paper plane
  "M8 8 C8 4 4 4 4 7 C4 10 9 11 11 7 C13 2 7 -1 3 2 C-1 5 0 12 5 14", // spiral
  "M0 6 Q3 0 6 6 T12 6", // squiggle
  "M1 0 L0 7 M6 0 L5.4 6 M10.5 1 L8.8 6.6", // motion lines
] as const;

/** white first — the art's doodles are white; umber is the hero's own
 *  "holds against saffron" stroke, used sparingly */
export const MARK_WHITE = "#FFFFFF";
export const MARK_UMBER = "#8C4A1E";

/* ── stamps for the "Draw here." board ──────────────────────────────────
   Vector line-art in a 24-unit box centred on 0 (−12…12), stroked (never
   filled) so they read as the same hand as the strokes and the doodles.
   Reference: Codrops "Building an Interactive Digital Stamp Collection with
   Shaders, Postcards and Playful Inspection" — a tray of stamps you pick and
   press onto the page; here pressed with a squash-and-stretch pop. */

const f1 = (v: number) => v.toFixed(2);
const polar = (a: number, r: number) => `${f1(Math.cos(a) * r)} ${f1(Math.sin(a) * r)}`;

const STAR = (() => {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    d += `${i ? "L" : "M"}${polar(a, i % 2 ? 4.8 : 11.5)} `;
  }
  return d + "Z";
})();

const HEART = "M0 10 C-6 5.5 -11.5 1 -11.5 -4 C-11.5 -9 -5.5 -11 0 -5.5 C5.5 -11 11.5 -9 11.5 -4 C11.5 1 6 5.5 0 10 Z";

const WEB = (() => {
  const spokes = 8;
  const rings = [3.6, 7, 10.6];
  let d = "";
  for (let i = 0; i < spokes; i++) d += `M0 0 L${polar((i / spokes) * Math.PI * 2, 11.5)} `;
  for (const r of rings) {
    for (let i = 0; i <= spokes; i++) {
      // each ring segment sags a little towards the hub, like real silk
      const a0 = (i / spokes) * Math.PI * 2;
      if (i === 0) {
        d += `M${polar(a0, r)} `;
        continue;
      }
      const am = ((i - 0.5) / spokes) * Math.PI * 2;
      d += `Q${polar(am, r * 0.84)} ${polar(a0, r)} `;
    }
  }
  return d.trim();
})();

const BUTTERFLY = [
  "M0 -6 L0 8",
  "M0 -6 Q-1.5 -10 -4.5 -11.5 M0 -6 Q1.5 -10 4.5 -11.5",
  "M0 -3 C-4 -12 -12.5 -11 -11.5 -3.5 C-10.5 1 -4 1 0 0",
  "M0 -3 C4 -12 12.5 -11 11.5 -3.5 C10.5 1 4 1 0 0",
  "M0 1 C-4 1 -10 4 -8 9 C-6 12 -1.5 8 0 3",
  "M0 1 C4 1 10 4 8 9 C6 12 1.5 8 0 3",
].join(" ");

const SPIRAL = (() => {
  let d = "M0 0";
  for (let i = 1; i <= 64; i++) {
    const th = (i / 64) * Math.PI * 2 * 2.3;
    d += ` L${polar(th, 0.4 + th * 0.76)}`;
  }
  return d;
})();

const FLOWER = (() => {
  let d = "";
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
    d += `M0 0 C${polar(a - 0.62, 8)} ${polar(a - 0.3, 12.5)} ${polar(a, 11.8)} C${polar(a + 0.3, 12.5)} ${polar(a + 0.62, 8)} 0 0 `;
  }
  return d + "M2.4 0 A2.4 2.4 0 1 0 -2.4 0 A2.4 2.4 0 1 0 2.4 0";
})();

export type StampId = "star" | "heart" | "web" | "butterfly" | "spiral" | "flower";

export const STAMPS: readonly { id: StampId; label: string; d: string }[] = [
  { id: "star", label: "Star", d: STAR },
  { id: "heart", label: "Heart", d: HEART },
  { id: "web", label: "Spiderweb", d: WEB },
  { id: "butterfly", label: "Butterfly", d: BUTTERFLY },
  { id: "spiral", label: "Spiral", d: SPIRAL },
  { id: "flower", label: "Flower", d: FLOWER },
];

/** the board's inks — the scene palette only: ink, white, deep umber */
export const INKS = [
  { id: "ink", label: "Ink", hex: "#0A101A" },
  { id: "white", label: "White", hex: "#FFFFFF" },
  { id: "umber", label: "Umber", hex: "#5A3A0A" },
] as const;
export type InkId = (typeof INKS)[number]["id"];

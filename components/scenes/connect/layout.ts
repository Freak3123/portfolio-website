import { rng, strandPath, type Pt } from "@/lib/web/draw";
import { GROUPS, PROJECTS } from "./data";

/**
 * Deterministic layouts for the Connect web. Two shapes of the same web:
 *   wide  1200×780  five clusters on an outer ellipse, projects in the middle
 *   tall   780×1300 phones / portrait: clusters stacked in rows, projects in a
 *                   2×2 block between them, drops drawn larger
 * Both are seeded, so server and client produce identical markup. CSS shows
 * exactly one of them (see TALL_QUERY).
 */
export type LayoutKind = "wide" | "tall";

/** keep in sync with the @media rule in app/journey/connect.css */
export const TALL_QUERY = "(max-aspect-ratio: 5/6)";

export type SkillNode = {
  kind: "skill";
  n: number;
  name: string;
  group: number;
  /** index inside its group, for neighbour influence (L6) and the L2 walk */
  k: number;
  rest: Pt;
  /** label offset from the node, and its anchor */
  label: { dx: number; dy: number; anchor: "start" | "middle" | "end" };
  projects: number[];
  edges: number[];
};
export type ProjectNode = {
  kind: "project";
  n: number;
  name: string;
  id: string;
  rest: Pt;
  skills: number[];
  edges: number[];
};
export type GraphNode = SkillNode | ProjectNode;
export type Edge = { s: number; p: number };

export type Layout = {
  kind: LayoutKind;
  W: number;
  H: number;
  CENTER: Pt;
  /** drawing scale for drops, hit areas and labels */
  scale: number;
  HUBS: Pt[];
  NODES: GraphNode[];
  EDGES: Edge[];
  SKILLS: SkillNode[];
  PROJECT_NODES: ProjectNode[];
  FRAME_PATH: string;
  SPOKE_PATHS: string[];
};

const f = (v: number) => v.toFixed(1);
const deg = (d: number) => (d * Math.PI) / 180;

export const edgePath = (a: Pt, b: Pt) => strandPath(a, b, 16);
export const radialPath = (hub: Pt, p: Pt) => `M${f(hub.x)} ${f(hub.y)} L${f(p.x)} ${f(p.y)}`;
export const ringPath = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${f(p.x)} ${f(p.y)}`).join(" ") + " Z";

type Spec = {
  W: number;
  H: number;
  CENTER: Pt;
  scale: number;
  /** hub per group, in GROUPS order: AI, Infra, Web, Data, Automation */
  hubs: Pt[];
  /** project per PROJECTS order: legal, brawer, desk, memonative */
  projects: Pt[];
  /** inner / outer orb radius of a cluster */
  orb: [number, number];
};

const WIDE: Spec = (() => {
  const CENTER = { x: 600, y: 410 };
  const on = (a: number, rx: number, ry: number) => ({
    x: CENTER.x + Math.cos(deg(a)) * rx,
    y: CENTER.y + Math.sin(deg(a)) * ry,
  });
  return {
    W: 1200,
    H: 780,
    CENTER,
    scale: 1,
    hubs: [-162, -90, -18, 54, 126].map((a) => on(a, 405, 272)),
    projects: [-140, -40, 140, 40].map((a) => on(a, 165, 108)),
    orb: [80, 114],
  };
})();

const TALL: Spec = {
  W: 780,
  H: 1300,
  CENTER: { x: 390, y: 575 },
  scale: 1.9,
  // AI top-left, Web top-right, Automation + Data below the projects, Infra at the foot
  hubs: [
    { x: 200, y: 175 },
    { x: 390, y: 1145 },
    { x: 580, y: 175 },
    { x: 580, y: 905 },
    { x: 200, y: 905 },
  ],
  projects: [
    { x: 245, y: 470 },
    { x: 535, y: 470 },
    { x: 245, y: 680 },
    { x: 535, y: 680 },
  ],
  orb: [92, 132],
};

function build(kind: LayoutKind, spec: Spec): Layout {
  const { CENTER, orb } = spec;
  const NODES: GraphNode[] = [];
  const EDGES: Edge[] = [];
  const r = rng(23);
  const lab = 13 * spec.scale;

  GROUPS.forEach((g, gi) => {
    const hub = spec.hubs[gi];
    // start the orb facing the centre so linked silk leaves on the inside
    const toCentre = Math.atan2(CENTER.y - hub.y, CENTER.x - hub.x);
    const count = g.skills.length;
    g.skills.forEach((name, k) => {
      const a = toCentre + (k / count) * Math.PI * 2 + (r() - 0.5) * 0.12;
      const rad = count <= 4 ? (orb[0] + orb[1]) / 2 - 15 : k % 2 ? orb[1] : orb[0];
      const rest = { x: hub.x + Math.cos(a) * rad, y: hub.y + Math.sin(a) * rad };
      const c = Math.cos(a);
      const s = Math.sin(a);
      const anchor = c > 0.35 ? "start" : c < -0.35 ? "end" : "middle";
      const label = {
        dx: c * lab,
        dy: anchor === "middle" ? (s < 0 ? -lab * 1.1 : lab * 1.7) : (s * 10 + 4) * spec.scale,
        anchor,
      } as const;
      NODES.push({ kind: "skill", n: NODES.length, name, group: gi, k, rest, label, projects: [], edges: [] });
    });
  });
  PROJECTS.forEach((p, pi) => {
    NODES.push({ kind: "project", n: NODES.length, name: p.name, id: p.id, rest: spec.projects[pi], skills: [], edges: [] });
  });

  const byName = new Map<string, SkillNode>();
  for (const n of NODES) if (n.kind === "skill") byName.set(n.name, n);
  for (const node of NODES) {
    if (node.kind !== "project") continue;
    const proj = PROJECTS.find((p) => p.id === node.id)!;
    for (const skill of proj.skills) {
      const s = byName.get(skill);
      if (!s) continue;
      const e = EDGES.length;
      EDGES.push({ s: s.n, p: node.n });
      s.projects.push(node.n);
      s.edges.push(e);
      node.skills.push(s.n);
      node.edges.push(e);
    }
  }

  const SKILLS = NODES.filter((n): n is SkillNode => n.kind === "skill");
  const PROJECT_NODES = NODES.filter((n): n is ProjectNode => n.kind === "project");
  // frame thread through the hubs, in angular order round the centre
  const around = [...spec.hubs].sort(
    (a, b) => Math.atan2(a.y - CENTER.y, a.x - CENTER.x) - Math.atan2(b.y - CENTER.y, b.x - CENTER.x),
  );
  return {
    kind,
    W: spec.W,
    H: spec.H,
    CENTER,
    scale: spec.scale,
    HUBS: spec.hubs,
    NODES,
    EDGES,
    SKILLS,
    PROJECT_NODES,
    FRAME_PATH: ringPath(around),
    SPOKE_PATHS: PROJECT_NODES.map((p) => strandPath(CENTER, p.rest, 4)),
  };
}

export const LAYOUTS: Record<LayoutKind, Layout> = { wide: build("wide", WIDE), tall: build("tall", TALL) };

export const groupMembers = (L: Layout, gi: number) => L.SKILLS.filter((s) => s.group === gi);

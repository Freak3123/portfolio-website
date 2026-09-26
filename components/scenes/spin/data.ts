/**
 * Spin — the career as the capture spiral of an orb-weaver web, inner → outer.
 * Every fact here is from the CV. Words are kept to a few per ring (the brief:
 * less text, big visuals); the dew drops carry the metrics as tooltips.
 */

export type Drop = { metric: string };

export type Ring = {
  id: string;
  when: string;
  place: string;
  /** 2–4 words */
  gist: string;
  drops: Drop[];
};

export const RINGS: readonly Ring[] = [
  {
    id: "iter",
    when: "2022",
    place: "ITER, SOA",
    gist: "BTech · AI & ML",
    drops: [{ metric: "CSE, AI & ML" }, { metric: "Graduating Aug 2026" }],
  },
  {
    id: "alesa",
    when: "Apr 2025",
    place: "Alesa AI",
    gist: "Full-stack intern",
    drops: [{ metric: "4 production projects" }, { metric: "Next.js + Django" }],
  },
  {
    id: "freelance",
    when: "Jul 2025",
    place: "Freelance",
    gist: "Earth Again · Lifespark",
    drops: [
      { metric: "Earth Again Movement — Sambad Group" },
      { metric: "Thousands of visitors" },
      { metric: "Hundreds of sign-ups a month" },
      { metric: "Lifespark Infra — real estate" },
    ],
  },
  {
    id: "desk",
    when: "Dec 2025 → now",
    place: "The Desk",
    gist: "Zoho Partner · full-stack",
    drops: [
      { metric: "7+ businesses" },
      { metric: "80% of manual work automated" },
      { metric: "~50% faster turnaround" },
      { metric: "AI agent — 90+ days uptime" },
      { metric: "4 sites under 2s" },
    ],
  },
];

/** meermohsin-style stat blocks; each counts up as its ring is laid */
export type Stat = { to: number; suffix: string; label: string; ring: number };

export const STATS: readonly Stat[] = [
  { to: 7, suffix: "+", label: "businesses", ring: 3 },
  { to: 80, suffix: "%", label: "automated", ring: 3 },
  { to: 90, suffix: "+", label: "days uptime", ring: 3 },
];

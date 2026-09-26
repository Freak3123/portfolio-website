/**
 * Connect — skills as dew on a web, linked by silk to the projects they were
 * used in. All from the CV. (WebSocket appears in Brawer's stack, so it hangs
 * in the Web cluster.)
 */

export type ProjectId = "memonative" | "legal" | "brawer" | "desk";

export type Project = { id: ProjectId; name: string; skills: string[] };

export const PROJECTS: readonly Project[] = [
  {
    id: "legal",
    name: "Legal Rewriter",
    skills: ["Next.js", "FastAPI", "LegalBERT", "Flan-T5", "Supabase", "HuggingFace", "MongoDB"],
  },
  {
    id: "brawer",
    name: "Brawer",
    skills: ["Next.js", "React", "Tailwind", "Node", "WebSocket", "Supabase"],
  },
  {
    id: "desk",
    name: "The Desk agent",
    skills: ["OpenClaw", "Hermes", "MCP", "Zoho CRM", "Deluge", "n8n", "Zoho Flow", "VPS"],
  },
  {
    id: "memonative",
    name: "Memonative",
    skills: ["Python", "FastAPI", "PostgreSQL", "pgvector", "Redis", "Celery", "Docker"],
  },
];

export type Group = { id: string; name: string; skills: string[] };

export const GROUPS: readonly Group[] = [
  {
    id: "ai",
    name: "AI",
    skills: ["OpenClaw", "Hermes", "MCP", "Claude Code", "LangChain", "HuggingFace", "LegalBERT", "Flan-T5", "TensorFlow", "scikit-learn"],
  },
  {
    id: "infra",
    name: "Infra",
    skills: ["AWS", "Fly.io", "Docker", "Celery", "Git", "VPS"],
  },
  {
    id: "web",
    name: "Web",
    skills: ["TypeScript", "JavaScript", "React", "Next.js", "Node", "Express", "Django", "FastAPI", "Tailwind", "Framer Motion", "WebSocket"],
  },
  {
    id: "data",
    name: "Data",
    skills: ["Python", "SQL", "PostgreSQL", "pgvector", "MongoDB", "Supabase", "Prisma", "Redis", "Pandas", "NumPy"],
  },
  {
    id: "automation",
    name: "Automation",
    skills: ["Zoho CRM", "Deluge", "Zoho Flow", "n8n"],
  },
];

export const projectsOf = (skill: string) => PROJECTS.filter((p) => p.skills.includes(skill));

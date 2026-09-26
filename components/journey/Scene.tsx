import type { ReactNode } from "react";
import type { ChapterId } from "@/lib/journey/chapters";

/**
 * Every chapter renders inside one of these. The journey engine finds scenes
 * by `data-chapter` and, every frame in live mode, writes:
 *   --presence  0…1  (CSS custom property)
 *   --local     chapter-relative progress in steps
 *   data-active present while presence > 0
 * Scenes should put their own `<h2 id="{id}-title">` inside.
 *
 * Without JS or under reduced motion there is no live mode: scenes stack as a
 * normal document, each at least one screen tall, fully readable.
 */
export default function Scene({
  id,
  className = "",
  children,
}: {
  id: ChapterId;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} data-chapter={id} className={`scene scene--${id} ${className}`} aria-labelledby={`${id}-title`}>
      {children}
    </section>
  );
}

import Hero from "@/components/hero/Hero";
import SiteNav from "@/components/chrome/SiteNav";
import Cursor from "@/components/chrome/Cursor";
import SoundGate from "@/components/chrome/SoundGate";
import SmoothScroll from "@/components/motion/SmoothScroll";
import Journey from "@/components/journey/Journey";

/**
 * Two acts: the hero (who she is — two selves, one person), then the web
 * (how she works — every problem traced along a thread back to its cause).
 */
export default function Home() {
  return (
    <>
      <SmoothScroll />
      <SiteNav />
      <Cursor />
      <SoundGate />
      <main>
        <Hero />
        <Journey />
      </main>
    </>
  );
}

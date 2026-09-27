import HeroStage from "./HeroStage";

/**
 * Server component. One line of text, and it is in the initial HTML payload —
 * nothing here waits on JavaScript, WebGL or the opening animation.
 *
 * The <picture> underneath is also the whole fallback: with no WebGL you still
 * get the portrait, and the cord still toggles it.
 *
 * NOTE: the résumé, email, GitHub and LinkedIn links were removed from the hero
 * by request. They now have no home anywhere on the site — see plan/hero.md §15.
 */
export default function Hero() {
  return (
    <>
      {/* Ink over the page from the first paint until the loader's canvas has
          painted its own — otherwise the portrait flashes before hydration. The
          loader hides it; without JS, CSS fades it out (and <noscript> skips it).
          Outside the section: .hero isolates, which would trap it under the nav. */}
      <div className="hero-cover" aria-hidden="true" />
      <noscript>
        <style>{`.hero-cover{display:none}`}</style>
      </noscript>
      <section className="hero" id="top">
        <picture className="hero-fallback">
          <source
            type="image/avif"
            srcSet="/hero/cold-768.avif 768w, /hero/cold-1024.avif 1024w, /hero/cold-1280.avif 1280w"
            sizes="(max-width: 900px) 100vw, 60vw"
          />
          <img
            src="/hero/cold-1024.webp"
            srcSet="/hero/cold-768.webp 768w, /hero/cold-1024.webp 1024w, /hero/cold-1280.webp 1280w"
            sizes="(max-width: 900px) 100vw, 60vw"
            width={1024}
            height={1536}
            alt=""
            fetchPriority="high"
            decoding="async"
          />
        </picture>

        <h1 className="hero-greeting">Hi, I am Ashreeta,</h1>

        <HeroStage />

        <p className="hero-hint mono" aria-hidden="true">
          click
        </p>

        {/* one affordance, worded for the hand you have: a mouse holds, a finger taps */}
        <p className="hero-hint-peek mono" aria-hidden="true">
          <span className="peek-fine">hold to peek</span>
          <span className="peek-coarse">tap &amp; peek</span>
        </p>
      </section>
    </>
  );
}

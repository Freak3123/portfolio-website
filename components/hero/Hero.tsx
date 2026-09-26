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

      <p className="hero-hint-peek mono" aria-hidden="true">
        hold + drag
      </p>
    </section>
  );
}

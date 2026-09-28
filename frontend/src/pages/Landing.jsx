import { useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import TopicInput from "@/components/TopicInput";
import InterestOnboarding from "@/components/InterestOnboarding";
import HotFeed from "@/components/HotFeed";
import { synthesizeTopicFromInterests } from "@/lib/topic";

/**
 * Landing page.
 *  - "Hot Now · India" swipe stack sits on top — a live curated feed of
 *    the day's most talk-about moments across politics, Bollywood, cricket,
 *    tech, and internet drama, aimed at 20-30 y/o urban Indians. Double-tap
 *    on any card goes deep via the normal Directions → 12-card flow.
 *  - Below that: Interest Onboarding (Spotify-style chip grid) OR the
 *    original topic-input flow (unchanged).
 */
export default function Landing() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const hotSectionRef = useRef(null);

  // Auto-scroll to Hot section when navigated with ?hot=1 (from "Hot" pill on other pages)
  useEffect(() => {
    if (params.get("hot") === "1" && hotSectionRef.current) {
      const el = hotSectionRef.current;
      // Delay slightly so cards can start rendering
      setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    }
  }, [params]);

  const handleSubmit = useCallback(
    (topic) => navigate("/directions", { state: { topic } }),
    [navigate]
  );

  // From interest onboarding: turn interests into a topic string and hand off
  // to the existing /directions flow.
  const handleOnboardingProceed = useCallback(
    (interests, meta = {}) => {
      const topic = synthesizeTopicFromInterests(interests);
      navigate("/directions", {
        state: { topic, interests, is_news: !!meta.is_news },
      });
    },
    [navigate]
  );

  return (
    <div className="min-h-[100dvh] w-full bg-[#0C0C0D] text-[#F8F8F8]">
      {/* Hot Now feed — first thing the user sees, straight from the top.
          No top bar; the Hot deck IS the hero. */}
      <section ref={hotSectionRef} className="mx-auto w-full max-w-xl px-0 pt-4 sm:pt-6" data-testid="landing-hot-section">
        <HotFeed />
      </section>

      {/* Divider between "consume" and "create your own journey" */}
      <div className="mx-auto mt-10 flex w-full max-w-xl items-center gap-4 px-5 sm:px-0">
        <div className="h-px flex-1 bg-white/10" />
        <div
          className="text-[10px] uppercase tracking-[0.28em] text-white/35"
          style={{
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          Or start your own journey
        </div>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <main className="mx-auto flex w-full max-w-xl flex-col px-5 pb-16 pt-8 sm:px-8 sm:pt-10">
        <h1
          className="text-5xl leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          data-testid="landing-headline"
        >
          Discover insights.
        </h1>
        <p
          className="mt-5 max-w-md text-base leading-relaxed text-white/60"
          style={{
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          Enter any topic — get a swipeable feed of deeply researched insights,
          surfaced from live web search &amp; the world&rsquo;s best knowledge.
        </p>

        {/* Interest Onboarding — Spotify-style chip picker */}
        <div className="mt-8">
          <InterestOnboarding onProceed={handleOnboardingProceed} />
        </div>

        {/* Divider */}
        <div className="my-8 flex items-center gap-4">
          <div className="h-px flex-1 bg-white/10" />
          <div
            className="text-[10px] uppercase tracking-[0.28em] text-white/35"
            style={{
              fontFamily:
                "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            }}
          >
            Or type a topic
          </div>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        {/* Existing topic input flow */}
        <TopicInput onSubmit={handleSubmit} />
      </main>
    </div>
  );
}

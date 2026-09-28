import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, ArrowUpRight, Compass } from "@phosphor-icons/react";
import { fetchDirections } from "@/lib/api";
import HotHeaderPill from "@/components/HotHeaderPill";

/**
 * Rabbit-hole selector: after entering topic, user picks a direction to go deep in,
 * enters their own custom direction, or skips ("go without direction").
 */
export default function Directions() {
  const location = useLocation();
  const navigate = useNavigate();
  const topic = location.state?.topic;
  const interests = location.state?.interests || [];
  const isNews = !!location.state?.is_news;

  const [loading, setLoading] = useState(true);
  const [directions, setDirections] = useState([]);
  const [customText, setCustomText] = useState("");

  useEffect(() => {
    if (!topic) {
      navigate("/", { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchDirections(topic, interests, { is_news: isNews });
        if (!cancelled) setDirections(data.directions || []);
      } catch (err) {
        if (cancelled) return;
        const detail = err?.response?.data?.detail;
        toast.error(detail || "Could not load directions");
        setDirections([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topic, navigate]);  // eslint-disable-line react-hooks/exhaustive-deps

  const goToLoading = (direction) => {
    navigate("/loading", {
      state: { topic, direction: direction || null, interests, is_news: isNews },
      replace: false,
    });
  };

  const submitCustom = (e) => {
    e?.preventDefault?.();
    const t = customText.trim();
    if (!t) return;
    goToLoading(t);
  };

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-[#0C0C0D]">
      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-5 pt-5">
        <button
          data-testid="dir-back"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/80"
          aria-label="Back"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="max-w-[60%] truncate rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 font-ui text-[11px] text-white/70">
          {topic}
        </div>
        <HotHeaderPill compact />
      </header>

      <main className="relative z-10 px-5 pb-24 pt-8 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto w-full max-w-xl"
        >
          <div className="mb-5 flex items-center gap-2">
            <Compass size={16} className="text-white/60" />
            <p className="font-ui text-[10px] uppercase tracking-[0.28em] text-white/50">
              Choose a rabbit hole
            </p>
          </div>
          <h1
            className="font-editorial text-3xl leading-tight tracking-tight sm:text-4xl"
            data-testid="dir-heading"
          >
            Where should we go deep?
          </h1>
          <p className="mt-3 max-w-md font-ui text-sm text-white/50">
            Pick a direction below or write your own direction.
          </p>

          {/* Skeleton or options */}
          <div className="mt-8 space-y-3" data-testid="dir-list">
            {loading && (
              <>
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-2xl border border-white/5 bg-white/[0.02]"
                  />
                ))}
              </>
            )}

            <AnimatePresence>
              {!loading &&
                directions.map((d, idx) => (
                  <motion.button
                    key={d.id}
                    data-testid={`direction-card-${idx}`}
                    data-testid-legacy={`dir-option-${idx}`}
                    onClick={() => goToLoading(d.title)}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.06, duration: 0.35 }}
                    whileTap={{ scale: 0.98 }}
                    className="group flex w-full items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-left transition-colors hover:border-white/25 hover:bg-white/[0.05]"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="font-editorial text-lg leading-snug text-white">
                        {d.title}
                      </h3>
                      {d.subtitle && (
                        <p className="mt-1.5 font-ui text-xs leading-relaxed text-white/55">
                          {d.subtitle}
                        </p>
                      )}
                    </div>
                    <ArrowRight
                      size={16}
                      className="mt-1 flex-shrink-0 text-white/30 transition-transform group-hover:translate-x-1 group-hover:text-white/80"
                    />
                  </motion.button>
                ))}
            </AnimatePresence>
          </div>

          {/* Custom direction input */}
          <form onSubmit={submitCustom} className="mt-8">
            <label className="block font-ui text-[10px] uppercase tracking-[0.24em] text-white/40">
              Or write your own direction
            </label>
            <div className="mt-2 flex items-center gap-2 border-b border-white/20 focus-within:border-white/70 transition-colors">
              <input
                data-testid="dir-custom-input"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="e.g. focus on Indian consumer behavior"
                className="w-full bg-transparent py-3 font-editorial text-base italic outline-none placeholder:text-white/25"
              />
              <button
                type="submit"
                data-testid="dir-custom-submit"
                disabled={!customText.trim()}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#0C0C0D] transition-opacity disabled:opacity-30"
                aria-label="Use custom direction"
              >
                <ArrowUpRight size={14} weight="bold" />
              </button>
            </div>
          </form>

          {/* Skip option */}
          <div className="mt-8 flex justify-center">
            <button
              data-testid="dir-skip"
              onClick={() => goToLoading(null)}
              className="rounded-full border border-white/10 bg-white/[0.02] px-5 py-2.5 font-ui text-xs uppercase tracking-[0.18em] text-white/60 transition-colors hover:border-white/25 hover:text-white/95"
            >
              Skip — just start swiping
            </button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { StopCircle, ArrowClockwise, House } from "@phosphor-icons/react";
import { streamGenerate } from "@/lib/api";

const PHASE_LABELS = {
  start: "Starting deep research",
  planning: "Planning research angles",
  rails_planned: "Curating persona lenses",
  angles_ready: "Investigating angles",
  searching: "Searching the web deeply",
  sources_ready: "Found sources",
  extracting: "Extracting full page content",
  extracted: "Extracted deep sources",
  youtube: "Reading YouTube transcripts",
  synthesizing: "Synthesizing insights",
  done: "Ready",
  error: "Something went wrong",
};

export default function Loading() {
  const location = useLocation();
  const navigate = useNavigate();
  const topic = location.state?.topic;
  const direction = location.state?.direction || null;
  const interests = location.state?.interests || [];
  const isNews = !!location.state?.is_news;
  const [phase, setPhase] = useState({ label: "Planning research angles", detail: "" });
  const [errorMsg, setErrorMsg] = useState("");
  const [attempt, setAttempt] = useState(0);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!topic) {
      navigate("/", { replace: true });
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    abortRef.current = ac;
    setErrorMsg("");
    setPhase({ label: "Planning research angles", detail: "" });

    (async () => {
      try {
        for await (const evt of streamGenerate({ topic, direction, interests, is_news: isNews }, { signal: ac.signal })) {
          if (cancelled) return;
          if (evt.phase === "done" && evt.data) {
            navigate("/feed", { state: { data: evt.data }, replace: true });
            return;
          }
          if (evt.phase === "error") {
            // Stay on Loading and show the error inline instead of bouncing home.
            setErrorMsg(evt.message || "Something went wrong");
            return;
          }
          const label = PHASE_LABELS[evt.phase] || evt.message || evt.phase;
          let detail = "";
          if (evt.meta) {
            if (evt.meta.rails && Array.isArray(evt.meta.rails) && evt.meta.rails.length) {
              detail = evt.meta.rails.map((r) => r.name || r).slice(0, 4).join(" · ");
            } else if (evt.meta.rail) {
              detail = `${evt.meta.rail}`;
            } else if (evt.meta.fallback === "llm_only") {
              detail = "Live web search unavailable — using AI knowledge only";
            } else if (evt.meta.sources_count) {
              detail = `${evt.meta.sources_count} sources found`;
            } else if (evt.meta.angles && evt.meta.angles.length) {
              detail = evt.meta.angles.slice(0, 3).join(" · ");
            } else if (evt.meta.videos && evt.meta.videos.length) {
              detail = evt.meta.videos[0];
            }
          }
          setPhase({ label, detail });
        }
        // Stream ended without a `done` event — treat as failure but stay on Loading
        if (!cancelled) {
          setErrorMsg("Research stream ended unexpectedly. Please try again.");
        }
      } catch (err) {
        if (cancelled || err?.name === "AbortError") return;
        setErrorMsg("Research stream failed. Please try again.");
      }
    })();

    return () => {
      // Do NOT abort on cleanup — React StrictMode double-invokes effects in dev
      // and aborting here would kill the freshly-started fetch.
      cancelled = true;
    };
  }, [topic, direction, navigate, attempt]);  // eslint-disable-line react-hooks/exhaustive-deps

  const stopAndGoHome = () => {
    try { abortRef.current?.abort(); } catch {}
    navigate("/", { replace: true });
  };

  const retry = () => {
    try { abortRef.current?.abort(); } catch {}
    setAttempt((a) => a + 1);
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-[#0C0C0D] px-6 text-center">
      {/* Pulsing ring */}
      <motion.div
        className="relative mb-16 h-24 w-24"
        animate={{ rotate: errorMsg ? 0 : 360 }}
        transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
      >
        <motion.div
          className={`absolute inset-0 rounded-full border ${errorMsg ? "border-red-500/40" : "border-white/20"}`}
          animate={errorMsg ? { scale: 1, opacity: 0.4 } : { scale: [1, 1.15, 1], opacity: [0.4, 0.1, 0.4] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
        />
        <div className={`absolute inset-2 rounded-full border ${errorMsg ? "border-red-500/25" : "border-white/10"}`} />
        <div className={`absolute inset-6 rounded-full ${errorMsg ? "bg-red-400/80" : "bg-white/90"}`} />
      </motion.div>

      {/* Topic pill */}
      <p
        className="mb-6 max-w-md font-editorial text-xl italic text-white/70"
        data-testid="loading-topic"
      >
        &ldquo;{topic}&rdquo;
      </p>

      {/* Phase text / Error */}
      <div className="min-h-[3.5rem]">
        <AnimatePresence mode="wait">
          {errorMsg ? (
            <motion.div
              key="err"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col items-center gap-2"
              data-testid="loading-error"
            >
              <p className="font-ui text-xs uppercase tracking-[0.32em] text-red-300/85">
                Research failed
              </p>
              <p className="max-w-xs font-editorial text-sm italic text-white/60">
                {errorMsg}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key={phase.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col items-center gap-1.5"
            >
              <p
                className="font-ui text-xs uppercase tracking-[0.32em] text-white/60"
                data-testid="loading-phase"
              >
                {phase.label}…
              </p>
              {phase.detail && (
                <p
                  className="max-w-xs truncate font-editorial text-xs italic text-white/35"
                  data-testid="loading-detail"
                >
                  {phase.detail}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!errorMsg && (
        <p className="mt-16 max-w-xs font-ui text-xs leading-relaxed text-white/30">
          This can take 60–90 seconds. Deep research across the web, YouTube and
          recent news — not a shallow answer.
        </p>
      )}

      {/* Action row */}
      <div className="mt-10 flex items-center gap-3">
        {errorMsg ? (
          <>
            <button
              data-testid="loading-retry"
              onClick={retry}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 font-ui text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0C0C0D]"
            >
              <ArrowClockwise size={14} weight="bold" />
              Try again
            </button>
            <button
              data-testid="loading-back-home"
              onClick={stopAndGoHome}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-5 py-2.5 font-ui text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85"
            >
              <House size={14} weight="regular" />
              Home
            </button>
          </>
        ) : (
          <button
            data-testid="loading-stop"
            onClick={stopAndGoHome}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-5 py-2.5 font-ui text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85 transition-colors hover:border-white/30 hover:bg-white/[0.06]"
          >
            <StopCircle size={14} weight="fill" />
            Stop research
          </button>
        )}
      </div>
    </div>
  );
}

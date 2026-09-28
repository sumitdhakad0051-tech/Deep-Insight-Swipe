import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Plus, ArrowRight, Newspaper, Sparkle, Compass } from "@phosphor-icons/react";
import Branch from "@/components/InterestBranch";
import {
  fetchSeedInterests,
  fetchNewsSeedInterests,
  fetchMyInterests,
  saveMyInterests,
  getDeviceId,
} from "@/lib/api";
import { ONBOARDING } from "@/constants/testIds";

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/**
 * Redesigned Interest Onboarding:
 *  - Big affordance-friendly grid (symmetric, obviously tappable)
 *  - Interests | News toggle at the top
 *  - Recursive drill-down that streams new chips in
 *  - Auto-scrolls to new layers
 *  - Single "Start Swiping" action (no Skip)
 */
export default function InterestOnboarding({ onProceed }) {
  const [mode, setMode] = useState("interests"); // 'interests' | 'news'
  const [seeds, setSeeds] = useState({ interests: [], news: [] });
  const [loading, setLoading] = useState(true);

  // Per-mode state so switching preserves each side's picks/expansions
  const [state, setState] = useState({
    interests: {
      selected: new Set(),
      ordered: [],
      rootBranches: {},
      maxDepth: 0,
    },
    news: {
      selected: new Set(),
      ordered: [],
      rootBranches: {},
      maxDepth: 0,
    },
  });

  const [manualValue, setManualValue] = useState("");
  const [saved, setSaved] = useState([]);
  const [showSavedBanner, setShowSavedBanner] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [interestsSeed, newsSeed, mine] = await Promise.all([
          fetchSeedInterests(),
          fetchNewsSeedInterests(),
          fetchMyInterests(getDeviceId()).catch(() => ({ interests: [] })),
        ]);
        setSeeds({ interests: interestsSeed, news: newsSeed });
        if (mine.interests?.length > 0) {
          setSaved(mine.interests);
          setShowSavedBanner(true);
        }
      } catch (e) {
        toast.error("Couldn't load interests");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cur = state[mode];

  const patch = useCallback((updater) => {
    setState((prev) => ({ ...prev, [mode]: updater(prev[mode]) }));
  }, [mode]);

  const toggleSelect = useCallback((label) => {
    const key = label.toLowerCase();
    patch((c) => {
      const nextSelected = new Set(c.selected);
      let nextOrdered;
      if (nextSelected.has(key)) {
        nextSelected.delete(key);
        nextOrdered = c.ordered.filter((x) => x.toLowerCase() !== key);
      } else {
        nextSelected.add(key);
        nextOrdered = [...c.ordered, label];
      }
      return { ...c, selected: nextSelected, ordered: nextOrdered };
    });
  }, [patch]);

  const setRootBranch = useCallback((label, branch) => {
    patch((c) => ({ ...c, rootBranches: { ...c.rootBranches, [label]: branch } }));
  }, [patch]);

  const removeRootBranch = useCallback((label) => {
    patch((c) => {
      const next = { ...c.rootBranches };
      delete next[label];
      return { ...c, rootBranches: next };
    });
  }, [patch]);

  const handleDepth = useCallback((d) => {
    patch((c) => ({ ...c, maxDepth: Math.max(c.maxDepth, d) }));
  }, [patch]);

  const useSavedInterests = useCallback(() => {
    // Pre-populate the interests mode with saved labels (as manual pills)
    setMode("interests");
    setState((prev) => {
      const cInt = prev.interests;
      const nextSelected = new Set(cInt.selected);
      const nextOrdered = [...cInt.ordered];
      for (const s of saved) {
        const k = s.toLowerCase();
        if (!nextSelected.has(k)) {
          nextSelected.add(k);
          nextOrdered.push(s);
        }
      }
      return { ...prev, interests: { ...cInt, selected: nextSelected, ordered: nextOrdered } };
    });
    setShowSavedBanner(false);
  }, [saved]);

  const handleManualAdd = useCallback(() => {
    const v = manualValue.trim();
    if (!v) return;
    if (cur.selected.has(v.toLowerCase())) {
      toast.message("Already in your list");
      return;
    }
    toggleSelect(v);
    setManualValue("");
    toast.success(`Added "${v}"`);
  }, [manualValue, cur.selected, toggleSelect]);

  const combinedOrdered = useMemo(() => {
    // Combine both modes for the final payload (interests first, then news storylines)
    return [
      ...state.interests.ordered,
      ...state.news.ordered.map((s) => `news:${s}`),
    ];
  }, [state]);

  const totalSelected = state.interests.ordered.length + state.news.ordered.length;

  const proceed = useCallback(async () => {
    if (totalSelected === 0) {
      toast.error("Pick at least one topic to continue");
      return;
    }
    const payload = [
      ...state.interests.ordered,
      ...state.news.ordered,
    ];
    try {
      await saveMyInterests(getDeviceId(), payload);
    } catch {}
    const isNews = state.news.ordered.length > 0;
    onProceed(payload, { is_news: isNews });
  }, [state, totalSelected, onProceed]);

  return (
    <section
      data-testid={ONBOARDING.section}
      className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-7"
    >
      {/* Header — mode toggle sits at top-right */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div
            className="text-[10px] uppercase tracking-[0.28em] text-white/40"
            style={{ fontFamily: SANS }}
          >
            {mode === "news" ? "Chapter 01 · What's happening?" : "Chapter 01 · What tugs at you?"}
          </div>
          <h2
            className="mt-2 text-2xl leading-tight sm:text-3xl"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            {mode === "news" ? "Pick today's rabbit holes." : "Pick a spark. Watch it grow."}
          </h2>
          <p
            className="mt-2 max-w-sm text-sm text-white/55"
            style={{ fontFamily: SANS }}
          >
            {mode === "news"
              ? "Tap a headline theme and layers of fresh storylines bloom below."
              : "Tap a topic. Then tap deeper. Keep going until it feels like yours."}
          </p>
        </div>

        <div
          data-testid={ONBOARDING.selectedCounter}
          className="hidden sm:flex flex-col items-end shrink-0"
        >
          <div
            className="text-4xl tabular-nums leading-none"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            {String(totalSelected).padStart(2, "0")}
          </div>
          <div
            className="mt-1.5 text-[10px] uppercase tracking-[0.24em] text-white/40"
            style={{ fontFamily: SANS }}
          >
            picked
          </div>
        </div>
      </div>

      {/* Segmented toggle: Interests | News */}
      <div
        role="tablist"
        aria-label="Choose category"
        className="relative mb-5 inline-flex w-full items-center rounded-full border border-white/12 bg-white/[0.03] p-1 sm:w-auto"
        style={{ fontFamily: SANS }}
      >
        {[
          { key: "interests", label: "Interests", icon: <Compass size={14} weight="regular" /> },
          { key: "news", label: "News", icon: <Newspaper size={14} weight="regular" /> },
        ].map((t) => {
          const active = mode === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              data-testid={`onboarding-toggle-${t.key}`}
              onClick={() => setMode(t.key)}
              className={[
                "relative z-[1] flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold sm:min-w-[130px]",
                active ? "text-[#0C0C0D]" : "text-white/70 hover:text-white",
              ].join(" ")}
            >
              {active && (
                <motion.span
                  layoutId="onboarding-toggle-pill"
                  className="absolute inset-0 rounded-full bg-white"
                  transition={{ type: "spring", stiffness: 400, damping: 34 }}
                />
              )}
              <span className="relative z-[1] flex items-center gap-1.5">
                {t.icon}
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Returning-user banner */}
      <AnimatePresence>
        {showSavedBanner && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mb-5 flex flex-col gap-3 rounded-xl border border-dashed border-white/20 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div style={{ fontFamily: SANS }} className="text-sm text-white/80">
              You had <span className="text-white">{saved.length}</span> saved interest{saved.length !== 1 ? "s" : ""}. Use them?
            </div>
            <div className="flex gap-2">
              <button
                data-testid={ONBOARDING.useSavedBtn}
                onClick={useSavedInterests}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-[#0C0C0D]"
                style={{ fontFamily: SANS }}
              >
                <Sparkle size={12} weight="fill" /> Use these
              </button>
              <button
                data-testid={ONBOARDING.startFreshBtn}
                onClick={() => setShowSavedBanner(false)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.03] px-4 py-2 text-xs text-white/85"
                style={{ fontFamily: SANS }}
              >
                Start fresh
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interaction hint — clear affordance */}
      <div
        className="mb-4 flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-white/55 w-fit"
        style={{ fontFamily: SANS }}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Tap any tile · tap deeper for more layers
      </div>

      {/* Grid (streaming, symmetric) */}
      <div>
        {loading ? (
          <div
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4"
            aria-label="Loading interests"
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/2] w-full animate-pulse rounded-2xl bg-white/[0.03]" />
            ))}
          </div>
        ) : (
          <Branch
            label=""
            parentChain={[]}
            depth={0}
            subs={mode === "news" ? seeds.news : seeds.interests}
            selectedSet={cur.selected}
            toggleSelect={toggleSelect}
            branches={cur.rootBranches}
            setBranch={setRootBranch}
            removeBranch={removeRootBranch}
            onDepthReached={handleDepth}
            mode={mode}
          />
        )}
      </div>

      {/* Manual add — always at bottom */}
      <div className="mt-6 border-t border-white/10 pt-5">
        <div
          className="mb-2 text-[10px] uppercase tracking-[0.24em] text-white/40"
          style={{ fontFamily: SANS }}
        >
          Or add your own
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] pl-4 pr-1.5 py-1 focus-within:border-white/50">
          <input
            type="text"
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleManualAdd(); } }}
            placeholder={mode === "news" ? "e.g. Fed decision, IPO news…" : "Bauhaus, DAO governance, protein folding…"}
            data-testid={ONBOARDING.manualInput}
            style={{ fontFamily: SANS, fontSize: 14 }}
            className="flex-1 bg-transparent text-white placeholder:text-white/30 outline-none"
          />
          <button
            onClick={handleManualAdd}
            data-testid={ONBOARDING.manualAdd}
            style={{ fontFamily: SANS }}
            className="inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-[#0C0C0D]"
          >
            <Plus size={12} weight="bold" /> Add
          </button>
        </div>
      </div>

      {/* Selected preview — shows across both modes */}
      {totalSelected > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          <span
            className="self-center text-[10px] uppercase tracking-[0.24em] text-white/40 mr-1"
            style={{ fontFamily: SANS }}
          >
            Your set
          </span>
          {[...state.interests.ordered, ...state.news.ordered].map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-3 py-1 text-xs text-white/85"
              style={{ fontFamily: SANS }}
            >
              {s}
              <button
                onClick={() => {
                  // Deselect from whichever mode holds it
                  const inInterests = state.interests.selected.has(s.toLowerCase());
                  const targetMode = inInterests ? "interests" : "news";
                  setState((prev) => {
                    const c = prev[targetMode];
                    const nsel = new Set(c.selected);
                    nsel.delete(s.toLowerCase());
                    return {
                      ...prev,
                      [targetMode]: {
                        ...c,
                        selected: nsel,
                        ordered: c.ordered.filter((x) => x.toLowerCase() !== s.toLowerCase()),
                      },
                    };
                  });
                }}
                className="text-white/50 hover:text-white"
                aria-label={`Remove ${s}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Single primary action — no Skip */}
      <div className="mt-7 flex flex-wrap items-center justify-end gap-3">
        <button
          onClick={proceed}
          disabled={totalSelected === 0}
          data-testid={ONBOARDING.continueBtn}
          style={{ fontFamily: SANS }}
          className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#0C0C0D] disabled:opacity-30"
        >
          Start Swiping <ArrowRight size={14} weight="bold" />
        </button>
      </div>
    </section>
  );
}

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { CircleNotch, CaretRight } from "@phosphor-icons/react";
import InterestTile from "@/components/InterestChip";
import { streamExpandInterest } from "@/lib/api";
import { ONBOARDING } from "@/constants/testIds";

const MAX_DEPTH = 5;

/**
 * Recursive branch renderer. Streams sub-chips one by one via SSE for a
 * "living, growing" feel. Uses React.createElement for self-recursion to
 * avoid the visual-edits babel plugin stack overflow on JSX self-reference.
 *
 * Auto-scrolls its own newly-mounted children into view when a new layer
 * appears (both in seed grid and nested branches).
 */
export default function Branch(props) {
  const {
    label,
    parentChain,
    depth,
    subs,
    selectedSet,
    toggleSelect,
    branches,
    setBranch,
    removeBranch,
    onDepthReached,
    mode = "interests",
    streaming, // {[subLabel]: true} — sub-chips currently being expanded
    setStreaming,
    // symmetric grid columns for this branch
    columns,
  } = props;

  const nestedRef = useRef(null);
  const [localStreaming, setLocalStreaming] = useState(null);

  const gridCols = columns || (depth === 0 ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4" : "grid-cols-2 sm:grid-cols-3");
  const nextGridCols = depth === 0 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3";

  const handleTap = useCallback(async (sub) => {
    toggleSelect(sub);

    // Collapse if already open
    if (branches && branches[sub]) {
      removeBranch(sub);
      return;
    }

    if (depth + 1 >= MAX_DEPTH) {
      toast.message("You've reached the deepest layer");
      return;
    }

    setLocalStreaming(sub);
    // Create an empty branch immediately so the layer appears/scrolls in
    const chain = [...parentChain, label].filter(Boolean);
    const emptyBranch = {
      label: sub,
      parentChain: chain,
      depth: depth + 1,
      subs: [],
      branches: {},
    };
    setBranch(sub, emptyBranch);
    if (onDepthReached) onDepthReached(emptyBranch.depth);

    // Stream chips in
    try {
      const collected = [];
      for await (const ev of streamExpandInterest({ interest: sub, parent_chain: chain, mode })) {
        if (ev.phase === "chip" && ev.label) {
          collected.push(ev.label);
          // Update the branch subs progressively
          setBranch(sub, {
            ...emptyBranch,
            subs: [...collected],
          });
        } else if (ev.phase === "error") {
          throw new Error(ev.message || "expand failed");
        } else if (ev.phase === "done" && ev.sub_interests) {
          setBranch(sub, {
            ...emptyBranch,
            subs: ev.sub_interests,
          });
        }
      }
    } catch (e) {
      toast.error("Couldn't fetch sub-interests. Try again.");
      removeBranch(sub);
    } finally {
      setLocalStreaming(null);
    }
  }, [branches, depth, label, parentChain, removeBranch, setBranch, toggleSelect, onDepthReached, mode]);

  const setChildBranch = useCallback((childKey, subKey, subBranch) => {
    const child = branches[childKey];
    if (!child) return;
    setBranch(childKey, {
      ...child,
      branches: { ...(child.branches || {}), [subKey]: subBranch },
    });
  }, [branches, setBranch]);

  const removeChildBranch = useCallback((childKey, subKey) => {
    const child = branches[childKey];
    if (!child) return;
    const next = { ...(child.branches || {}) };
    delete next[subKey];
    setBranch(childKey, { ...child, branches: next });
  }, [branches, setBranch]);

  // Auto-scroll when a new child branch appears
  useEffect(() => {
    if (!nestedRef.current) return;
    const childCount = branches ? Object.keys(branches).length : 0;
    if (childCount === 0) return;
    // Wait for animation to start rendering, then scroll into view smoothly
    const t = setTimeout(() => {
      try {
        nestedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {}
    }, 100);
    return () => clearTimeout(t);
    // Only when the number of child branches changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches ? Object.keys(branches).length : 0]);

  return (
    <div
      className={
        depth === 0
          ? ""
          : "mt-4 w-full rounded-2xl border border-white/8 bg-white/[0.015] p-4 sm:p-5"
      }
    >
      {depth > 0 && (
        <div
          className="mb-3 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-white/45"
          style={{ fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}
        >
          <CaretRight size={10} />
          Deeper into <span className="text-white/85">{label}</span>
        </div>
      )}

      <div className={`grid gap-2 sm:gap-2.5 ${gridCols}`}>
        {subs.map((sub) => (
          <InterestTile
            key={sub}
            label={sub}
            selected={selectedSet.has(sub.toLowerCase())}
            onClick={() => handleTap(sub)}
            testId={ONBOARDING.chip(sub)}
            variant={depth === 0 ? "seed" : "sub"}
            loading={localStreaming === sub}
          />
        ))}
        {/* Skeleton placeholders when actively streaming a child that hasn't appeared yet */}
        {localStreaming && !subs.includes(localStreaming) && (
          <div
            className={`col-span-full flex items-center gap-2 text-xs text-white/50`}
            style={{ fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}
          >
            <CircleNotch size={12} className="animate-spin" />
            Growing new layer under "{localStreaming}"…
          </div>
        )}
      </div>

      {/* Nested branches */}
      <div ref={nestedRef}>
        <AnimatePresence initial={false}>
          {branches && Object.entries(branches).map(([childKey, child]) => (
            <motion.div
              key={childKey}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              style={{ overflow: "hidden" }}
            >
              {React.createElement(Branch, {
                label: child.label,
                parentChain: child.parentChain,
                depth: child.depth,
                subs: child.subs,
                selectedSet,
                toggleSelect,
                branches: child.branches,
                setBranch: (sub, state) => setChildBranch(childKey, sub, state),
                removeBranch: (sub) => removeChildBranch(childKey, sub),
                onDepthReached,
                mode,
                columns: nextGridCols,
              })}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

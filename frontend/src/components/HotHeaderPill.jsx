import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Flame } from "@phosphor-icons/react";

/**
 * Subtle "Hot" pill for the top header on non-Landing pages.
 * Clicking navigates to /?hot which triggers Landing to scroll to the
 * Hot Now section instantly. Kept intentionally small — 28px height,
 * icon-only on narrow screens — so the header stays uncluttered.
 */
export default function HotHeaderPill({ compact = false, testId = "hot-tab" }) {
  const navigate = useNavigate();
  return (
    <button
      data-testid={testId}
      onClick={() => navigate("/?hot=1")}
      className="pointer-events-auto group flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-[#121214]/95 px-2.5 text-white/80 backdrop-blur-md transition-colors hover:border-orange-300/40 hover:text-orange-100 no-tap-zoom"
      aria-label="Hot Now"
    >
      <motion.span
        animate={{ scale: [1, 1.15, 1], opacity: [0.75, 1, 0.75] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
        className="text-orange-200/90"
      >
        <Flame size={12} weight="fill" />
      </motion.span>
      {!compact && (
        <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.24em]">
          Hot
        </span>
      )}
    </button>
  );
}

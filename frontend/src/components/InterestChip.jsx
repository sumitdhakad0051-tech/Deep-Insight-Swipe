import { motion } from "framer-motion";
import { Check, Plus } from "@phosphor-icons/react";

/**
 * A large, tap-friendly interest tile — designed with clear affordance
 * (feels obviously tappable, works for a 5-year-old). Uses a subtle
 * plus/check "handle" and a hover lift.
 *
 *  - selected: boolean
 *  - onClick: () => void
 *  - testId: string
 *  - variant: "seed" (large) | "sub" (medium)
 */
export default function InterestTile({
  label,
  selected,
  onClick,
  testId,
  variant = "seed",
  loading = false,
}) {
  const isSeed = variant === "seed";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      data-testid={testId}
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 500, damping: 26 }}
      className={[
        "group relative flex select-none items-center justify-center",
        "text-center font-ui font-semibold leading-tight",
        "rounded-2xl border transition-colors duration-200 focus:outline-none",
        "focus-visible:ring-2 focus-visible:ring-white/70",
        isSeed
          ? "aspect-[3/2] w-full px-3 py-3 text-[13px] sm:text-sm md:text-[15px]"
          : "aspect-[5/2] w-full px-3 py-2.5 text-[12px] sm:text-[13px]",
        selected
          ? "border-white bg-white text-[#0C0C0D] shadow-[0_10px_28px_-8px_rgba(255,255,255,0.4)]"
          : "border-white/12 bg-white/[0.03] text-white/90 hover:border-white/40 hover:bg-white/[0.06]",
      ].join(" ")}
    >
      {/* Corner affordance dot — screams "tap me" without any label */}
      <span
        aria-hidden
        className={[
          "absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full transition-all",
          selected
            ? "bg-[#0C0C0D] text-white"
            : "bg-white/[0.06] text-white/60 group-hover:bg-white/15 group-hover:text-white",
        ].join(" ")}
      >
        {selected ? (
          <Check size={10} weight="bold" />
        ) : loading ? (
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
            className="block h-2.5 w-2.5 rounded-full border border-white/40 border-t-white"
          />
        ) : (
          <Plus size={10} weight="bold" />
        )}
      </span>

      <span className="max-w-full break-words">{label}</span>
    </motion.button>
  );
}

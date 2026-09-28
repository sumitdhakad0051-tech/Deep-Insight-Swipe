import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useMotionValue, animate, useTransform } from "framer-motion";

/**
 * TikTok / Instagram Reels-style vertical card stack.
 *
 * ONE swipe from anywhere on the screen advances the active card. No CSS
 * scroll-snap, no IntersectionObserver, no browser scroll — the entire
 * container is a framer-motion draggable that owns the y-transform.
 *
 * Advance rules (either wins):
 *   - Distance:  drag offset >  ADVANCE_DIST_FRAC * viewport-height
 *   - Velocity:  |velocity.y| > ADVANCE_VELOCITY  (fast flick)
 *
 * At index 0 the top boundary rubber-bands; at last index the bottom rubber-bands.
 *
 * Only three cards are mounted at once (prev / active / next) for perf.
 * Cards are absolutely positioned at their own slot so the framer-motion
 * translate is the ONLY vertical layout mechanism.
 */

const ADVANCE_DIST_FRAC = 0.14; // 14% of card height → advance
const ADVANCE_VELOCITY = 380;   // px/s absolute velocity → advance
const SNAP_STIFFNESS = 320;
const SNAP_DAMPING = 34;

export default function SwipeStack({
  total,          // total number of card slots including any "end-cta" slot
  activeIdx,      // controlled active index (0..total-1)
  onIndexChange,  // (nextIdx) => void
  renderCard,     // (idx) => ReactNode — mounts a fully-styled card, absolute inset-0
  disabled = false, // if true, drag is disabled (e.g. modal open)
}) {
  const wrapperRef = useRef(null);
  const [vh, setVh] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 800));
  const y = useMotionValue(-activeIdx * vh);
  const draggingRef = useRef(false);

  // Track viewport height (supports dvh where available via visualViewport)
  useEffect(() => {
    const measure = () => {
      const el = wrapperRef.current;
      const h = el?.clientHeight || window.innerHeight;
      setVh(h);
    };
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, []);

  // When activeIdx or viewport height changes and we're NOT dragging, snap y to slot.
  useEffect(() => {
    if (draggingRef.current) return;
    const target = -activeIdx * vh;
    const controls = animate(y, target, {
      type: "spring",
      stiffness: SNAP_STIFFNESS,
      damping: SNAP_DAMPING,
      mass: 0.8,
    });
    return () => controls.stop();
  }, [activeIdx, vh, y]);

  const handleDragEnd = (_event, info) => {
    draggingRef.current = false;
    const offsetY = info.offset.y;    // negative = swiped up (want next)
    const velocityY = info.velocity.y; // negative = fast upward flick

    const advancePx = ADVANCE_DIST_FRAC * vh;
    let next = activeIdx;

    const wantsNext =
      offsetY < -advancePx || velocityY < -ADVANCE_VELOCITY;
    const wantsPrev =
      offsetY > advancePx || velocityY > ADVANCE_VELOCITY;

    if (wantsNext && activeIdx < total - 1) next = activeIdx + 1;
    else if (wantsPrev && activeIdx > 0) next = activeIdx - 1;

    if (next !== activeIdx) {
      onIndexChange(next);
    } else {
      // snap back to current slot
      animate(y, -activeIdx * vh, {
        type: "spring",
        stiffness: SNAP_STIFFNESS,
        damping: SNAP_DAMPING,
        mass: 0.8,
      });
    }
  };

  // Compute which slots to mount — only prev/active/next for perf
  const mountedSlots = useMemo(() => {
    const s = new Set();
    for (let i = activeIdx - 1; i <= activeIdx + 1; i++) {
      if (i >= 0 && i < total) s.add(i);
    }
    return s;
  }, [activeIdx, total]);

  // Rubber-banding: clamp drag beyond boundaries so top/bottom feel firm
  const topBound = 0;
  const bottomBound = -(total - 1) * vh;

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full overflow-hidden"
      style={{ touchAction: "pan-y" }}
      data-testid="swipe-stack"
    >
      <motion.div
        drag={disabled ? false : "y"}
        dragDirectionLock
        dragMomentum={false}
        dragElastic={0.18}
        // Framer's dragConstraints uses element-local top/bottom bounds. Since y
        // is a motion value we control, we pass constraints in terms of y.
        dragConstraints={{ top: bottomBound, bottom: topBound }}
        onDragStart={() => { draggingRef.current = true; }}
        onDragEnd={handleDragEnd}
        style={{ y }}
        className="absolute inset-x-0 top-0"
      >
        {[...mountedSlots].map((idx) => (
          <div
            key={idx}
            data-idx={idx}
            style={{
              position: "absolute",
              top: idx * vh,
              left: 0,
              right: 0,
              height: vh,
            }}
          >
            {renderCard(idx)}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

import { useMemo, useRef, useState } from "react";

/**
 * Renders text as a sequence of tappable word spans + non-tappable whitespace/punctuation.
 * A "tap" is only fired if the pointer moved less than ~8px between down and up —
 * so a vertical swipe to advance snap-scroll is NEVER stolen as a tap.
 *
 * Stopwords / short words / punctuation-only tokens are not tappable.
 * Every tap fires onWordTap(phrase) with the word AND up to 2 words of surrounding context.
 */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "else",
  "of", "at", "by", "for", "in", "on", "to", "with", "as", "from",
  "is", "are", "was", "were", "be", "been", "being", "am",
  "it", "its", "this", "that", "these", "those",
  "i", "you", "he", "she", "we", "they", "them", "their", "his", "her",
  "not", "no", "so", "than", "such", "very", "just",
  "do", "does", "did", "have", "has", "had", "will", "would", "can", "could", "may", "might", "shall", "should", "must",
]);

const wordRegex = /(\s+|[^\w'’-]+)/;

function isTappable(token) {
  if (!token) return false;
  const clean = token.replace(/[^\w'’-]/g, "").toLowerCase();
  if (!clean) return false;
  if (clean.length < 3) return false;
  if (STOPWORDS.has(clean)) return false;
  return true;
}

const TAP_SLOP = 8; // px

export default function TappableText({ text, onWordTap, disabled = false, dim = false }) {
  const tokens = useMemo(() => (text || "").split(wordRegex).filter((t) => t !== ""), [text]);
  const [rippleIdx, setRippleIdx] = useState(-1);
  const downRef = useRef(null);

  const words = useMemo(() => tokens.map((t, i) => ({
    i,
    token: t,
    tappable: !disabled && isTappable(t),
  })), [tokens, disabled]);

  const buildPhrase = (idx) => {
    const around = [];
    let leftCount = 0;
    for (let j = idx - 1; j >= 0 && leftCount < 2; j--) {
      if (isTappable(tokens[j])) {
        around.unshift(tokens[j]);
        leftCount++;
      }
    }
    around.push(tokens[idx]);
    let rightCount = 0;
    for (let j = idx + 1; j < tokens.length && rightCount < 2; j++) {
      if (isTappable(tokens[j])) {
        around.push(tokens[j]);
        rightCount++;
      }
    }
    return around.join(" ");
  };

  const handlePointerDown = (i, e) => {
    downRef.current = {
      i,
      x: e.clientX,
      y: e.clientY,
      time: performance.now(),
      pointerId: e.pointerId,
    };
  };

  const handlePointerUp = (i, e) => {
    const d = downRef.current;
    downRef.current = null;
    if (!d || d.i !== i) return;
    const dx = Math.abs((e.clientX ?? 0) - d.x);
    const dy = Math.abs((e.clientY ?? 0) - d.y);
    if (dx > TAP_SLOP || dy > TAP_SLOP) {
      // Was a swipe — do NOT fire tap. Let the browser's scroll happen naturally.
      return;
    }
    // Real tap
    setRippleIdx(i);
    setTimeout(() => setRippleIdx((cur) => (cur === i ? -1 : cur)), 380);
    e.stopPropagation();
    onWordTap?.(buildPhrase(i));
  };

  return (
    <span data-testid="tappable-text" className={dim ? "text-white/60" : undefined}>
      {words.map(({ i, token, tappable }) => {
        if (!tappable) return <span key={i}>{token}</span>;
        const rippling = rippleIdx === i;
        return (
          <span
            key={i}
            role="button"
            tabIndex={0}
            data-testid={`word-${token.replace(/[^\w]/g, "").slice(0, 12)}-${i}`}
            onPointerDown={(e) => handlePointerDown(i, e)}
            onPointerUp={(e) => handlePointerUp(i, e)}
            onPointerCancel={() => { downRef.current = null; }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onWordTap?.(buildPhrase(i));
              }
            }}
            style={{ touchAction: "pan-y" }}
            className={`relative inline cursor-pointer rounded-sm px-[2px] py-0 underline decoration-white/15 decoration-dotted underline-offset-[3px] transition-colors hover:decoration-white/60 hover:text-white ${
              rippling ? "text-white word-ripple" : ""
            }`}
          >
            {token}
          </span>
        );
      })}
    </span>
  );
}

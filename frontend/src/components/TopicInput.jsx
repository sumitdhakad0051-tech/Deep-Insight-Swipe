import { useState } from "react";

/**
 * The simplest possible topic input.
 * - Plain controlled input, no memoization tricks needed
 * - Zero wrappers with framer-motion, backdrop-filter, or transforms
 * - System font stack, no web-font FOIT
 * - onSubmit called with trimmed topic string
 */
export default function TopicInput({ onSubmit }) {
  const [value, setValue] = useState("");
  const canSubmit = value.trim().length >= 4;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(value.trim());
  };

  const suggestions = [
    "How did Nintendo survive over 100 years?",
    "The evolution of the semiconductor industry",
    "Why Formula 1 became a business empire",
    "How the FMCG industry evolved",
    "The rise of AI startups",
  ];

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <label
        htmlFor="topic-field"
        className="block text-[10px] uppercase tracking-[0.24em] text-white/40"
        style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
      >
        Your topic
      </label>

      <input
        id="topic-field"
        data-testid="topic-input"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. how Amazon became successful"
        autoComplete="off"
        autoCorrect="on"
        autoCapitalize="sentences"
        spellCheck="true"
        enterKeyHint="go"
        inputMode="text"
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          fontSize: "18px",
          color: "#ffffff",
          background: "transparent",
          border: "none",
          borderBottom: "1px solid rgba(255,255,255,0.3)",
          outline: "none",
          padding: "10px 0",
          width: "100%",
          WebkitAppearance: "none",
          appearance: "none",
          borderRadius: 0,
          touchAction: "manipulation",
        }}
        className="mt-2 placeholder:text-white/25 focus:outline-none"
      />

      <button
        data-testid="start-swiping-button"
        type="submit"
        disabled={!canSubmit}
        style={{
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-[#0C0C0D] transition-opacity disabled:opacity-30"
      >
        Start Swiping →
      </button>

      <div className="mt-10">
        <p
          className="text-[10px] uppercase tracking-[0.24em] text-white/35"
          style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
        >
          Or try
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              data-testid={`suggestion-${s.slice(0, 12)}`}
              type="button"
              onClick={() => setValue(s)}
              style={{
                fontFamily:
                  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              }}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs text-white/70 transition-colors hover:border-white/25 hover:bg-white/[0.08] hover:text-white/95"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}

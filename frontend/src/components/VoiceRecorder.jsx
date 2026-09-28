import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Microphone, StopCircle } from "@phosphor-icons/react";
import { transcribeAudio } from "@/lib/api";
import { toast } from "sonner";

/**
 * Detect first supported mime type from candidates. iOS Safari typically
 * supports 'audio/mp4' (AAC); Chrome/Firefox typically support 'audio/webm'.
 */
function pickMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/aac",
    "audio/mpeg",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  const MR = typeof window !== "undefined" ? window.MediaRecorder : null;
  if (!MR) return null;
  for (const t of candidates) {
    try {
      if (MR.isTypeSupported && MR.isTypeSupported(t)) return t;
    } catch {}
  }
  // No mime supported — MediaRecorder can still be created without one on some browsers
  return "";
}

export default function VoiceRecorder({ open, onClose, onResult }) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [errorText, setErrorText] = useState("");
  const [supported, setSupported] = useState(true);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    if (open) {
      setErrorText("");
      setDuration(0);
      startRecording();
    } else {
      cleanup();
    }
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cleanup = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaRef.current) {
      const rec = mediaRef.current;
      try { if (rec.state !== "inactive") rec.stop(); } catch {}
      try { rec.stream?.getTracks().forEach((t) => t.stop()); } catch {}
      mediaRef.current = null;
    }
    setRecording(false);
    setDuration(0);
    chunksRef.current = [];
  };

  const startRecording = async () => {
    // Feature detection
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setSupported(false);
      setErrorText("Voice input isn't supported in this browser.");
      return;
    }
    if (typeof window.MediaRecorder === "undefined") {
      setSupported(false);
      setErrorText("Voice recording isn't supported in this browser. Try Chrome or Safari.");
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      setSupported(true);
      if (err && (err.name === "NotAllowedError" || err.name === "SecurityError")) {
        setErrorText("Mic permission was blocked. Enable it in your browser settings and try again.");
      } else if (err && err.name === "NotFoundError") {
        setErrorText("No microphone found on this device.");
      } else {
        setErrorText("Could not access the mic. Try again.");
      }
      return;
    }

    const mime = pickMimeType();
    let rec;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (err) {
      // Fallback: create without any mime specifier
      try {
        rec = new MediaRecorder(stream);
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        setErrorText("Recording isn't supported on this device.");
        return;
      }
    }
    const chosenMime = rec.mimeType || mime || "audio/webm";

    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onerror = () => {
      setErrorText("Recording error. Try again.");
      cleanup();
    };
    rec.onstop = async () => {
      try {
        const blob = new Blob(chunksRef.current, { type: chosenMime });
        stream.getTracks().forEach((t) => t.stop());
        if (blob.size < 1200) {
          toast("Say something a bit longer");
          onClose();
          return;
        }
        setProcessing(true);
        const { text } = await transcribeAudio(blob, chosenMime);
        if (!text) {
          toast("Couldn't hear you — try again");
        } else {
          onResult(text);
        }
      } catch {
        toast.error("Voice input failed");
      } finally {
        setProcessing(false);
        onClose();
      }
    };
    // Request dataavailable every 250ms so iOS Safari yields chunks reliably
    try { rec.start(250); } catch { rec.start(); }
    mediaRef.current = rec;
    setRecording(true);

    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - startedAt) / 1000);
      setDuration(secs);
      // Auto-stop after 45 seconds
      if (secs >= 45) stopRecording();
    }, 250);
  };

  const stopRecording = () => {
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      try { mediaRef.current.stop(); } catch {}
    }
    setRecording(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0C0C0D]/95 px-6 backdrop-blur-md"
          data-testid="voice-recorder"
          style={{ touchAction: "manipulation" }}
        >
          <button
            data-testid="voice-close"
            onClick={onClose}
            className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/80"
            aria-label="Close"
          >
            <X size={16} />
          </button>

          <p className="mb-4 font-ui text-[10px] uppercase tracking-[0.28em] text-white/40">
            {processing ? "Transcribing…" : errorText ? "Voice input" : "Speak your request"}
          </p>
          <div className="mb-10 w-full max-w-[20rem] px-2 text-center">
            <p className="break-words font-editorial text-[15px] italic leading-relaxed text-white/80 sm:text-base">
              {errorText || (
                <>
                  &ldquo;Add examples&rdquo; · &ldquo;Bullet points&rdquo; ·{" "}
                  &ldquo;Focus on Japan&rdquo; · &ldquo;Why is this true?&rdquo;
                </>
              )}
            </p>
          </div>

          <motion.div
            animate={recording ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={{ repeat: Infinity, duration: 1.2 }}
            className="relative flex h-28 w-28 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] sm:h-32 sm:w-32"
          >
            {processing ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
                className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white"
              />
            ) : (
              <Microphone size={36} weight="fill" className={errorText ? "text-white/30" : "text-white"} />
            )}
          </motion.div>

          {recording && !errorText && (
            <p className="mt-6 font-ui text-sm tabular-nums text-white/60" data-testid="voice-timer">
              {String(Math.floor(duration / 60)).padStart(2, "0")}:
              {String(duration % 60).padStart(2, "0")}
            </p>
          )}

          {recording && !errorText && (
            <button
              data-testid="voice-stop"
              onClick={stopRecording}
              className="mt-8 flex items-center gap-2 rounded-full bg-white px-6 py-3 font-ui text-xs font-semibold uppercase tracking-[0.16em] text-[#0C0C0D]"
            >
              <StopCircle size={16} weight="fill" />
              Done
            </button>
          )}

          {errorText && (
            <button
              data-testid="voice-retry"
              onClick={() => { setErrorText(""); startRecording(); }}
              className="mt-8 rounded-full border border-white/15 bg-white/[0.03] px-5 py-2.5 font-ui text-xs uppercase tracking-[0.16em] text-white/85"
            >
              Try again
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

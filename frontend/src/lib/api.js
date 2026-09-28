import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  timeout: 180000,
  headers: { "Content-Type": "application/json" },
});

export const generateInsights = (topic) =>
  api.post("/insights/generate", { topic }).then((r) => r.data);

export const fetchDirections = (topic, interests = [], opts = {}) =>
  api.post("/insights/directions", { topic, interests, is_news: !!opts.is_news }).then((r) => r.data);

export const saveInsight = (insight) =>
  api.post("/insights/save", { insight }).then((r) => r.data);

export const listSaved = () => api.get("/insights/saved").then((r) => r.data);

export const deleteSaved = (id) =>
  api.delete(`/insights/saved/${id}`).then((r) => r.data);

export const regenerateInsight = (payload) =>
  api.post("/insights/regenerate", payload).then((r) => r.data);

export const moreInsights = (payload) =>
  api.post("/insights/more", payload).then((r) => r.data);

// TTS returns audio blob
export const fetchTTS = async (text, voice = "sage") => {
  const res = await fetch(`${API}/insights/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) throw new Error("TTS failed");
  return res.blob();
};

// STT: upload audio blob
export const transcribeAudio = async (blob, mime = "audio/webm") => {
  const form = new FormData();
  const ext = mime.includes("webm") ? "webm" : mime.includes("mp4") ? "mp4" : "wav";
  form.append("file", new File([blob], `speech.${ext}`, { type: mime }));
  const res = await fetch(`${API}/insights/stt`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("STT failed");
  return res.json();
};

// Chat SSE — returns async generator of delta strings
export async function* streamChat(payload, { signal } = {}) {
  const res = await fetch(`${API}/insights/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok || !res.body) throw new Error("Chat failed");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data);
        if (parsed.delta) yield parsed.delta;
        if (parsed.error) throw new Error(parsed.error);
      } catch {
        // ignore parse errors
      }
    }
  }
}

// Generic SSE JSON event stream — accepts optional AbortSignal via opts
async function* sseJson(url, body, { signal, method } = {}) {
  const isGet = method === "GET" || method === "get";
  const res = await fetch(url, {
    method: isGet ? "GET" : "POST",
    headers: isGet ? {} : { "Content-Type": "application/json" },
    body: isGet ? undefined : JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Request failed: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      // Ignore keep-alive comments (":" prefix) and empty lines
      if (!trimmed || trimmed.startsWith(":")) continue;
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data) continue;
      try {
        yield JSON.parse(data);
      } catch {
        // skip malformed
      }
    }
  }
}

export const streamGenerate = ({ topic, direction, interests, is_news }, opts) =>
  sseJson(`${API}/insights/generate/stream`, { topic, direction: direction || null, interests: interests || [], is_news: !!is_news }, opts);

export const streamMore = ({ session_id, topic, previous_headlines, steer }, opts) =>
  sseJson(`${API}/insights/more/stream`, {
    session_id,
    topic,
    previous_headlines,
    steer,
  }, opts);

export const streamRewrite = (payload, opts) =>
  sseJson(`${API}/insights/rewrite/stream`, payload, opts);

export const streamDeeper = (payload, opts) =>
  sseJson(`${API}/insights/deeper/stream`, payload, opts);

export const streamExplain = (payload, opts) =>
  sseJson(`${API}/insights/explain/stream`, payload, opts);

export const streamAnswer = (payload, opts) =>
  sseJson(`${API}/insights/answer/stream`, payload, opts);

export const streamCommand = (payload, opts) =>
  sseJson(`${API}/insights/command/stream`, payload, opts);

export const fetchQuestions = (payload) =>
  api.post("/insights/questions", payload).then((r) => r.data);

export const fetchHotTopics = () => api.get("/insights/hot").then((r) => r.data);

// SSE stream — yields events {phase:'start'|'card'|'done'|'error', ...}
// Pass { fresh: true } to bypass the server-side 20-min cache (regenerate).
export const streamHotTopics = (opts) => {
  const { fresh, ...rest } = opts || {};
  const qs = fresh ? "?fresh=1" : "";
  return sseJson(`${API}/insights/hot/stream${qs}`, {}, { ...rest, method: "GET" });
};

// ============ Interest Onboarding (Spotify-style) ============

const DEVICE_KEY = "insightcard.deviceId";

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export const fetchSeedInterests = () =>
  api.get("/interests/seed").then((r) => r.data.interests);

export const fetchNewsSeedInterests = () =>
  api.get("/interests/news/seed").then((r) => r.data.interests);

export const expandInterest = (interest, parentChain = []) =>
  api.post("/interests/expand", { interest, parent_chain: parentChain }).then((r) => r.data);

// Streaming chip expansion — yields events {phase: 'start'|'chip'|'done'|'error', ...}
export const streamExpandInterest = ({ interest, parent_chain = [], mode = "interests" }, opts) =>
  sseJson(`${API}/interests/expand/stream`, { interest, parent_chain, mode }, opts);

export const fetchMyInterests = (deviceId) =>
  api.get("/interests/me", { params: { device_id: deviceId } }).then((r) => r.data);

export const saveMyInterests = (deviceId, interests) =>
  api.post("/interests/me", { device_id: deviceId, interests }).then((r) => r.data);

export const deleteMyInterests = (deviceId) =>
  api.delete("/interests/me", { params: { device_id: deviceId } }).then((r) => r.data);

// ============ Admin — Newsroom factory floor ============
export const fetchNewsroomStatus = () =>
  api.get("/admin/newsroom/status").then((r) => r.data);

export const fetchNewsroomPersonas = () =>
  api.get("/admin/newsroom/personas").then((r) => r.data);

export const fetchNewsroomRuns = (limit = 20) =>
  api.get("/admin/newsroom/runs", { params: { limit } }).then((r) => r.data);

export const fetchNewsroomRunDetail = (runId) =>
  api.get(`/admin/newsroom/runs/${runId}`).then((r) => r.data);

export const triggerNewsroomRun = (background = true) =>
  api.post(`/admin/newsroom/run`, null, { params: { background } }).then((r) => r.data);

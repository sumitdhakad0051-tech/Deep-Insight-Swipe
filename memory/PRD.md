# Explore Insights (Insight Swipe) — PRD

## What
Mobile-first TikTok-style AI insight discovery app. React (CRA + Craco) + FastAPI + MongoDB.
Two entry vectors from the Landing page:
1. **Hot Now · India** — a swipeable pulse feed of the day's viral moments across politics,
   Bollywood, cricket, tech, internet drama and youth culture. Curated for 20–30-year-old
   urban Indians. Double-tap / "Go deeper" on any card launches the normal Directions →
   12-card research flow with that story pre-seeded.
2. **Pick a spark / Type a topic** — the existing interest-onboarding and topic-input flows.

## Stack
- Frontend: React 19, Tailwind, framer-motion, react-router v7, sonner, @phosphor-icons/react
- Backend: FastAPI, Motor (Mongo), Tavily search, emergentintegrations (OpenAI gpt-5.4, TTS/STT)

## Env keys used
- MONGO_URL, DB_NAME=insight_swipe
- EMERGENT_LLM_KEY
- TAVILY_API_KEY (`tvly-dev-1CI0o3-…` — user-provided, live)

## Deployment status (2026-02)
- Full zip `Kiit-Deep-Insight-main` extracted into `/app`.
- Backend dependencies installed (emergentintegrations, tavily-python, youtube-transcript-api).
- Frontend deps installed (@phosphor-icons/react, html-to-image, all radix + shadcn).
- Both supervisor services RUNNING; backend on :8001, frontend on :3000.
- Landing page renders live, real Tavily+LLM-curated Hot Now cards.
- Backend endpoints wired: /api/insights/hot, /api/insights/hot/stream, /api/insights/generate,
  /api/insights/directions, /api/insights/chat, /api/insights/tts, /api/insights/stt,
  /api/interests/seed, /api/interests/expand, /api/interests/me and more.

## Known external limit (NOT a code bug)
The Emergent LLM key issued to this workspace has a $0.001 hard budget cap
(litellm returns "Budget exceeded" after a few gpt-5.4 calls). This truncates
Hot Now to whatever generated before the cap and blocks Directions/Generate/
Expand until the balance is topped up via Profile → Universal Key → Add Balance
(or auto top-up enabled).

## Verified working
- GET /api/  (health)
- GET /api/interests/seed  (28 chips)
- GET /api/interests/news/seed
- GET /api/insights/hot  (cached cards render on Landing)
- GET/POST /api/interests/me  (uses `device_id` param)
- Frontend Landing page renders with real content and correct dark editorial UI.

## Blocked by LLM budget (will work once key is topped up)
- POST /api/interests/expand
- POST /api/insights/generate  (+ /stream)
- POST /api/insights/directions
- POST /api/insights/chat
- POST /api/insights/tts, /stt
- Full 12-card Hot Now stream

## Backlog
- Pull-to-refresh on the Hot Now stack for hourly re-curation.
- Snapshot / share-as-image via html-to-image for a viral loop.
- Per-persona subtle colour tint on cards.

"""
Hybrid Question-Answering — NO LLM.

    USER QUESTION
        |
        v
    Intent Detection (rule-based)
        |
        +-------------+-------------+
        v             v             v
    Definition    Why/How    Compare/Example
        |             |             |
        +-------------+-------------+
        v
    Research Retrieval
    (stored bundle first -> Tavily fallback)
        |
        v
    Relevant passages + current insight + source metadata
        |
        v
    Answer Constructor (fixed templates per intent)
        |
        v
    FINAL CHAT ANSWER

This module replaces the LlmChat call in the `/insights/chat` follow-up
endpoint. It does NOT touch card generation or the suggested-questions
feature — those keep using the LLM.
"""
from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from typing import List, Optional

log = logging.getLogger(__name__)


# ============================================================
# 1. INTENT DETECTION  (rule-based)
# ============================================================

INTENT_DEFINITION = "definition"
INTENT_WHY_HOW = "why_how"
INTENT_COMPARE_EXAMPLE = "compare_example"
INTENT_GENERAL = "general"  # fallback when no rule matches

# Ordered: first matching rule wins. Order matters because some phrasings
# overlap (e.g. "how is X different from Y" is compare, not how-to).
_COMPARE_PATTERNS = [
    r"\bvs\.?\b", r"\bversus\b", r"\bcompar(e|ed|ison)\b",
    r"\bdifference between\b", r"\bdiffer(s|ence)?\s+from\b",
    r"\bexample(s)?\b", r"\binstance(s)?\b", r"\bfor instance\b",
    r"\bsimilar to\b", r"\blike\s+\w+\s+or\s+\w+\b",
    r"\bbetter than\b", r"\bworse than\b",
]

_WHY_HOW_PATTERNS = [
    r"^\s*why\b", r"\bwhy\s+(is|are|did|does|do|would|does)\b",
    r"^\s*how\b", r"\bhow\s+(does|did|do|can|is|are|would)\b",
    r"\bmechanism\b", r"\breason(s)?\s+(for|behind|why)\b",
    r"\bcause(s|d)?\b", r"\bwhat\s+(led|leads)\s+to\b",
]

_DEFINITION_PATTERNS = [
    r"^\s*what\s+is\b", r"^\s*what\'?s\b", r"^\s*what\s+are\b",
    r"^\s*who\s+is\b", r"^\s*who\s+are\b", r"\bdefine\b",
    r"\bdefinition\s+of\b", r"\bmeaning\s+of\b", r"\bwhat\s+do\s+you\s+mean\b",
    r"\bexplain\s+what\b",
]


def detect_intent(question: str) -> str:
    """Classify a follow-up question into one of three buckets using
    keyword/regex rules. No model call."""
    q = (question or "").strip().lower()
    if not q:
        return INTENT_GENERAL

    for pat in _COMPARE_PATTERNS:
        if re.search(pat, q):
            return INTENT_COMPARE_EXAMPLE
    for pat in _WHY_HOW_PATTERNS:
        if re.search(pat, q):
            return INTENT_WHY_HOW
    for pat in _DEFINITION_PATTERNS:
        if re.search(pat, q):
            return INTENT_DEFINITION

    return INTENT_GENERAL


# ============================================================
# 2. RESEARCH RETRIEVAL  (stored bundle -> Tavily fallback)
# ============================================================

_STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "do", "does", "did",
    "of", "to", "in", "on", "for", "and", "or", "with", "this", "that",
    "it", "its", "be", "as", "at", "by", "from", "what", "why", "how",
    "who", "which", "you", "your", "i", "me", "my", "so", "vs", "versus",
    "than", "about", "into", "can", "could", "would", "should", "there",
    "their", "them", "he", "she", "his", "her", "explain", "please",
}


def _tokenize(text: str) -> List[str]:
    words = re.findall(r"[a-zA-Z0-9']+", (text or "").lower())
    return [w for w in words if w not in _STOPWORDS and len(w) > 2]


def _split_sentences(text: str) -> List[str]:
    # Lightweight splitter — good enough for extract/article text.
    parts = re.split(r"(?<=[.!?])\s+", (text or "").strip())
    return [p.strip() for p in parts if len(p.strip()) > 20]


@dataclass
class Passage:
    text: str
    source_title: str = ""
    source_url: str = ""
    score: float = 0.0


@dataclass
class RetrievalResult:
    passages: List[Passage] = field(default_factory=list)
    used_fallback_search: bool = False


def _score_passage(passage_tokens: set, query_tokens: set) -> float:
    if not passage_tokens or not query_tokens:
        return 0.0
    overlap = passage_tokens & query_tokens
    return len(overlap) / (len(query_tokens) ** 0.5)


def _rank_extracts_as_passages(
    extracts: List[dict], question: str, insight_text: str, top_k: int = 3
) -> List[Passage]:
    """Score every sentence in every stored extract against the question
    (+ current insight text for context) and return the best few."""
    query_tokens = set(_tokenize(question)) | set(_tokenize(insight_text))
    scored: List[Passage] = []

    for ex in extracts or []:
        content = ex.get("content") or ""
        title = ex.get("title") or ""
        url = ex.get("url") or ""
        for sent in _split_sentences(content):
            sc = _score_passage(set(_tokenize(sent)), query_tokens)
            if sc > 0:
                scored.append(Passage(text=sent, source_title=title, source_url=url, score=sc))

    scored.sort(key=lambda p: p.score, reverse=True)
    return scored[:top_k]


# Minimum total score across top passages before we trust the stored
# bundle. Below this, we fall back to a fresh, targeted Tavily search.
_MIN_CONFIDENCE = 0.6


async def retrieve(
    question: str,
    insight_topic: str,
    insight_text: str,
    stored_extracts: Optional[List[dict]],
    tavily_client=None,
    top_k: int = 3,
) -> RetrievalResult:
    """Stored research bundle first; fresh Tavily search only if that
    doesn't yield confident passages."""
    passages = _rank_extracts_as_passages(
        stored_extracts or [], question, insight_text, top_k=top_k
    )
    confidence = sum(p.score for p in passages[:top_k])

    if confidence >= _MIN_CONFIDENCE:
        return RetrievalResult(passages=passages, used_fallback_search=False)

    # --- fallback: fresh, question-targeted Tavily search ---
    if tavily_client is None:
        # No search client available — return whatever we had (may be empty).
        return RetrievalResult(passages=passages, used_fallback_search=False)

    def _search():
        return tavily_client.search(
            query=f"{insight_topic} {question}".strip(),
            search_depth="advanced",
            max_results=4,
            include_answer=False,
            include_raw_content=False,
        )

    try:
        result = await asyncio.to_thread(_search)
        fresh_extracts = [
            {
                "url": r.get("url", ""),
                "title": r.get("title", ""),
                "content": r.get("content", ""),
            }
            for r in (result.get("results") or [])
        ]
    except Exception:
        log.exception("Fallback Tavily search failed in hybrid_qa.retrieve")
        fresh_extracts = []

    fresh_passages = _rank_extracts_as_passages(
        fresh_extracts, question, insight_text, top_k=top_k
    )

    # Merge: prefer fresh passages (they were fetched specifically for this
    # question) but keep any decent stored ones too, then re-trim.
    merged = fresh_passages + passages
    merged.sort(key=lambda p: p.score, reverse=True)
    return RetrievalResult(passages=merged[:top_k], used_fallback_search=True)


# ============================================================
# 3. ANSWER CONSTRUCTOR  (fixed templates per intent)
# ============================================================

_TEMPLATES = {
    INTENT_DEFINITION: (
        "**{topic}**, in short: {lead}"
        "{more}"
    ),
    INTENT_WHY_HOW: (
        "Here's why/how, based on the research behind this card: {lead}"
        "{more}"
    ),
    INTENT_COMPARE_EXAMPLE: (
        "For comparison / a concrete example: {lead}"
        "{more}"
    ),
    INTENT_GENERAL: (
        "Based on the sourced research: {lead}"
        "{more}"
    ),
}

_NO_PASSAGE_TEMPLATES = {
    INTENT_DEFINITION: (
        "I couldn't find a sourced definition beyond what's already in this "
        "insight: {insight_text}"
    ),
    INTENT_WHY_HOW: (
        "I don't have sourced material that explains the why/how beyond this "
        "insight itself: {insight_text}"
    ),
    INTENT_COMPARE_EXAMPLE: (
        "I don't have a sourced comparison or example on hand for this one. "
        "Here's the insight again: {insight_text}"
    ),
    INTENT_GENERAL: (
        "I don't have additional sourced material for that — here's what "
        "the card already says: {insight_text}"
    ),
}


def _format_source_line(passages: List[Passage]) -> str:
    seen = []
    for p in passages:
        label = p.source_title or p.source_url
        if label and label not in seen:
            seen.append(label)
    if not seen:
        return ""
    return "\n\n*Sources: " + "; ".join(seen[:3]) + "*"


def construct_answer(
    intent: str,
    passages: List[Passage],
    insight_topic: str,
    insight_text: str,
) -> str:
    """Fill the fixed template for `intent` with retrieved passage text.
    Falls back to the insight's own text if nothing was retrieved."""
    if not passages:
        template = _NO_PASSAGE_TEMPLATES.get(intent, _NO_PASSAGE_TEMPLATES[INTENT_GENERAL])
        return template.format(insight_text=insight_text)

    lead = passages[0].text
    more_sentences = [p.text for p in passages[1:] if p.text != lead]
    more = (" " + " ".join(more_sentences)) if more_sentences else ""

    template = _TEMPLATES.get(intent, _TEMPLATES[INTENT_GENERAL])
    answer = template.format(topic=insight_topic or "This", lead=lead, more=more)
    answer += _format_source_line(passages)
    return answer


# ============================================================
# 4. ORCHESTRATOR — single entry point for the chat endpoint
# ============================================================

async def answer_question(
    question: str,
    insight_topic: str,
    insight_text: str,
    stored_extracts: Optional[List[dict]] = None,
    tavily_client=None,
) -> str:
    """Full pipeline: Intent Detection -> Research Retrieval -> Answer
    Constructor. This is the only function the API route needs to call."""
    intent = detect_intent(question)
    retrieval = await retrieve(
        question=question,
        insight_topic=insight_topic,
        insight_text=insight_text,
        stored_extracts=stored_extracts,
        tavily_client=tavily_client,
    )
    return construct_answer(
        intent=intent,
        passages=retrieval.passages,
        insight_topic=insight_topic,
        insight_text=insight_text,
    )

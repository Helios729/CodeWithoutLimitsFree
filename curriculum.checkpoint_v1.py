"""
Quiz pool loader — Save 3.

Reads the author's Q*.json files in /app/backend/curriculum_data/ and exposes:
  - list_quiz_topics(): one entry per mini-quiz (4 per Q module = topics list)
  - get_quiz_pool(topic_id): returns the 5 questions for that mini-quiz,
    sampled with Bloom split 2 L1 + 2 L2 + 1 L3 when possible.

Each Q module file has structure:
  { module_id, module_title, mini_quizzes: [
      { mq: 1, title, source_lesson, questions: [
          { q_id, bloom, skill, stem, options:{A,B,C,D}, answer, explanation, source } ] } ] }

Quiz attempts go through this loader instead of /api/quiz/generate (Gemini).
Zero AI calls, zero token cost. Students can take unlimited quizzes.
"""

import json
import random
from pathlib import Path

DATA_DIR = Path(__file__).parent / "curriculum_data"
QUESTIONS_PER_QUIZ = 5
BLOOM_TARGET = {"L1": 2, "L2": 2, "L3": 1}


def _load_q_files() -> list[dict]:
    """Return all Q*.json files, in filename order so the list is stable."""
    out = []
    for path in sorted(DATA_DIR.glob("Q*.json")):
        try:
            out.append(json.loads(path.read_text(encoding="utf-8")))
        except Exception:
            continue
    return out


def list_quiz_topics() -> list[dict]:
    """One topic per mini-quiz. The Quiz tab renders these as picker cards.
    Mini-quizzes with status='coming_soon' surface as locked placeholders
    so learners can see what's planned without crashing on an empty pool."""
    topics = []
    for q in _load_q_files():
        mod_id = q.get("module_id", "")
        mod_title = (q.get("module_title", "") or "").rstrip(" -Q").rstrip("-")
        mod_coming = q.get("status") == "coming_soon"
        mod_teaser = q.get("teaser", "") or ""
        for mq in q.get("mini_quizzes", []):
            mq_num = mq.get("mq", "")
            mq_coming = mod_coming or mq.get("status") == "coming_soon" or not mq.get("questions")
            topics.append({
                "topic_id": f"{mod_id}__mq{mq_num}",
                "title": mq.get("title", f"Mini-Quiz {mq_num}"),
                "module_title": mod_title,
                "source_lesson": mq.get("source_lesson", ""),
                "question_count": len(mq.get("questions", [])),
                "coming_soon": mq_coming,
                "teaser": mq.get("teaser", "") or mod_teaser if mq_coming else "",
                "institutions": [],
            })
    return topics


def _find_quiz(topic_id: str) -> dict | None:
    """Resolve a topic_id like 'introduction-to-ai__mq1' to the mini-quiz dict."""
    if "__mq" not in topic_id:
        return None
    mod_id, mq_part = topic_id.split("__mq", 1)
    try:
        mq_num = int(mq_part)
    except ValueError:
        return None
    for q in _load_q_files():
        if q.get("module_id") != mod_id:
            continue
        for mq in q.get("mini_quizzes", []):
            if int(mq.get("mq", -1)) == mq_num:
                return {"module": q, "mini_quiz": mq}
    return None


def _bloom_sample(questions: list[dict], target=BLOOM_TARGET, total=QUESTIONS_PER_QUIZ) -> list[dict]:
    """Sample `total` questions matching the Bloom distribution when possible.
    Falls back gracefully (fills remaining slots randomly) so students never
    see a short quiz even if a level is under-supplied."""
    by_level: dict[str, list] = {}
    for q in questions:
        by_level.setdefault(q.get("bloom", "L1"), []).append(q)
    picked: list[dict] = []
    for level, n in target.items():
        pool = by_level.get(level, [])
        picked.extend(random.sample(pool, min(n, len(pool))))
    if len(picked) < total:
        leftover = [q for q in questions if q not in picked]
        random.shuffle(leftover)
        picked.extend(leftover[: total - len(picked)])
    return picked[:total]


def build_quiz(topic_id: str) -> dict | None:
    """Returns the public quiz payload the frontend renders. The correct
    `answer` is preserved in a separate map the route layer keeps server-side."""
    found = _find_quiz(topic_id)
    if not found:
        return None
    q_module = found["module"]
    mini_quiz = found["mini_quiz"]
    picked = _bloom_sample(mini_quiz.get("questions", []))
    questions_out, answers_out = [], []
    for q in picked:
        # Convert options dict {A:..., B:...} to a stable A,B,C,D ordered list.
        keys = ["A", "B", "C", "D"]
        opts = [q.get("options", {}).get(k, "") for k in keys]
        correct = keys.index(q.get("answer", "A"))
        questions_out.append({
            "q_id": q.get("q_id"),
            "bloom": q.get("bloom"),
            "question": q.get("stem", ""),
            "options": opts,
            "explanation": q.get("explanation", ""),
            "source": {
                "url": "",  # Q files cite by reference; URLs live on L files
                "institution": q.get("source", ""),
                "title": q.get("source", ""),
            },
        })
        answers_out.append(correct)
    return {
        "topic_id": topic_id,
        "topic_title": mini_quiz.get("title", ""),
        "module_title": (q_module.get("module_title", "") or "").rstrip(" -Q").rstrip("-"),
        "source_lesson": mini_quiz.get("source_lesson", ""),
        "questions": questions_out,
        "_correct_indexes": answers_out,
    }

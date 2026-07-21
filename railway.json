"""
Code Without Limits curriculum — Save 2.

Reads the author's exact JSON files from /app/backend/curriculum_data/ and
maps them to the shape the frontend already consumes. No hand-typed lesson
text. No paraphrasing. The JSONs are the single source of truth.

Special case: the 3 HTML files (L10b-beg/int/adv) are merged into ONE module
with 3 difficulty tabs so the home list doesn't crowd.
"""

import json
import os
from pathlib import Path

DATA_DIR = Path(__file__).parent / "curriculum_data"

PROMPT_FRAMEWORKS = [
    {"id": "RTF", "name": "RTF — Role · Task · Format", "purpose": "Smallest reliable prompt scaffold.",
     "template": "Role: <role>.\nTask: <single verb-driven task>.\nFormat: <exact output shape>.",
     "example": "Role: A community health worker.\nTask: Explain dehydration signs.\nFormat: 5 bullets, ≤80 words."},
    {"id": "CO-STAR", "name": "CO-STAR — Context · Objective · Style · Tone · Audience · Response",
     "purpose": "Production-grade scaffold when ambiguity is costly.",
     "template": "Context: <…>.\nObjective: <…>.\nStyle: <…>.\nTone: <…>.\nAudience: <…>.\nResponse: <…>.",
     "example": "Context: 14-year-olds in Brazil learning AI.\nObjective: Define 'token'.\nStyle: Conversational.\nTone: Encouraging.\nAudience: 9th grade.\nResponse: 3 sentences + 1 analogy."},
    {"id": "ERA", "name": "ERA — Expectation · Role · Action", "purpose": "Rapid code/task delegation.",
     "template": "Expectation: <deliverable>.\nRole: <expert>.\nAction: <steps>.",
     "example": "Expectation: HTML page showing today's date.\nRole: Mobile-first engineer.\nAction: Single file, inline CSS."},
    {"id": "RISE", "name": "RISE — Role · Input · Steps · Expectation", "purpose": "Multi-step reasoning workflows.",
     "template": "Role: <expert>.\nInput: <raw data>.\nSteps: <numbered>.\nExpectation: <final format>.",
     "example": "Role: Coach.\nInput: vendor sells $0.50 banana chips.\nSteps: 1) weak points 2) AI asset 3) revenue.\nExpectation: 3-row table."},
    {"id": "CREATE", "name": "CREATE — Character · Request · Examples · Adjustments · Type · Extras",
     "purpose": "Consistent batch outputs.",
     "template": "Character: <…>.\nRequest: <…>.\nExamples: <2-3>.\nAdjustments: <…>.\nType: <format>.\nExtras: <constraints>.",
     "example": "Character: Youth radio host.\nRequest: 3 captions for recycling drive.\nType: Plain text.\nExtras: ≤80 chars."},
    {"id": "RSTI", "name": "RSTI — Restate · Simplify · Test · Iterate", "purpose": "Debug failing prompts.",
     "template": "Restate.\nSimplify.\nTest.\nIterate.",
     "example": "Restate: 'Add two numbers.'\nSimplify: 1 input, 1 button.\nTest: 2+2=4.\nIterate: add ×."},
]


# Ordered list controls home-tab display order. Filenames map to titles.
# L10b-* are merged below into a single tabbed module.
MODULE_ORDER = [
    ("L01_introduction_to_ai.json",     "Foundations",     "brand"),
    ("L02_edtech.json",                 "Pedagogy",        "brandSecondary"),
    ("L03_ai_ethics.json",              "Trustworthy AI",  "brand"),
    ("L04_algorithms.json",             "CS Core",         "brandSecondary"),
    ("L05_python.json",                 "Programming",     "brand"),
    ("L06_machine_learning.json",       "Statistical Learning", "brandSecondary"),
    ("L07_neural_networks.json",        "Deep Learning",   "brand"),
    ("L08_nlp.json",                    "Language AI",     "brandSecondary"),
    ("L09_robotics.json",               "Robotics",        "brand"),
    ("L10a_generative_ai.json",         "Generative AI",   "brandSecondary"),
]

# These three are merged into one tabbed module.
HTML_FILES = ("L10b_beg_html.json", "L10b_int_html.json", "L10b_adv_html.json")
HTML_DIFFICULTY_LABELS = {"L10b_beg_html.json": "Beginner",
                          "L10b_int_html.json": "Intermediate",
                          "L10b_adv_html.json": "Advanced"}


def _load_json(filename: str) -> dict:
    path = DATA_DIR / filename
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _resolve_sources(source_refs, all_sources):
    """Convert ['S1','S3'] + the module's sources array into [{url, institution}]."""
    by_id = {s.get("id"): s for s in (all_sources or [])}
    out = []
    for ref in (source_refs or []):
        s = by_id.get(ref)
        if not s:
            continue
        out.append({
            "url": s.get("url", ""),
            "institution": s.get("citation") or s.get("id"),
        })
    return out


def _flatten_lesson(mini_lesson: dict) -> str:
    """Combine the JSON's concept array into a single readable lesson body."""
    parts = []
    for c in mini_lesson.get("concepts", []):
        title = c.get("title", "")
        explanation = c.get("explanation", "")
        worked = c.get("worked_example", "")
        block = title + ": " if title else ""
        block += explanation
        if worked:
            block += "  Example — " + worked
        parts.append(block.strip())
    return "\n\n".join(parts) or mini_lesson.get("title", "")


def _build_submodule(mini_lesson: dict, module_sources: list, prefix: str = "") -> dict:
    """Map one JSON mini-lesson into the frontend's submodule shape."""
    ml_num = mini_lesson.get("ml") or mini_lesson.get("id") or ""
    raw_refs = []
    for c in mini_lesson.get("concepts", []):
        raw_refs.extend(c.get("source_refs", []))
    seen, unique_refs = set(), []
    for r in raw_refs:
        if r not in seen:
            seen.add(r)
            unique_refs.append(r)
    return {
        "id": f"{prefix}{ml_num}" if prefix else str(ml_num),
        "title": mini_lesson.get("title", "Untitled"),
        "objective": f"{mini_lesson.get('bloom', '')} · {mini_lesson.get('title', '')}".strip(" ·"),
        "lesson": _flatten_lesson(mini_lesson),
        "sources": _resolve_sources(unique_refs, module_sources),
    }


def _build_module(data: dict, persona: str, color: str, module_id_override: str = None) -> dict:
    """Map one JSON module into the frontend's module shape."""
    title = (data.get("module_title") or "Untitled").rstrip(" -L").rstrip("-")
    submodules = [_build_submodule(ml, data.get("sources", [])) for ml in data.get("mini_lessons", [])]
    return {
        "module_id": module_id_override or data.get("module_id", "unknown"),
        "title": title,
        "persona": persona,
        "tagline": (data.get("learning_objectives") or [""])[0][:140],
        "color": color,
        "submodules": submodules,
    }


def _build_html_module() -> dict:
    """Merge L10b-beg/int/adv into a single module with 3 tabs (difficulty
    prefix on each sub-module ID so they don't collide and the UI can group)."""
    beg = _load_json("L10b_beg_html.json")
    intm = _load_json("L10b_int_html.json")
    adv = _load_json("L10b_adv_html.json")
    all_subs = []
    for src, prefix_letter in [(beg, "B"), (intm, "I"), (adv, "A")]:
        if not src:
            continue
        for ml in src.get("mini_lessons", []):
            sub = _build_submodule(ml, src.get("sources", []), prefix=f"{prefix_letter}")
            sub["difficulty"] = src.get("difficulty", "")
            # Title is shown beneath a difficulty tab on the client now,
            # so the "[Beginner] …" prefix is no longer needed.
            all_subs.append(sub)
    # Merge sources from all three so resolutions work.
    return {
        "module_id": "L10b-html",
        "title": "HTML — Build on Your Phone",
        "persona": "Mobile Coding Track",
        "tagline": "Beginner → Intermediate → Advanced. Build single-file HTML/CSS/JS apps right on your phone.",
        "color": "brand",
        "submodules": all_subs,
        "tabs": ["Beginner", "Intermediate", "Advanced"],
    }


def _load_all_modules() -> list:
    modules = []
    for filename, persona, color in MODULE_ORDER:
        data = _load_json(filename)
        if data:
            modules.append(_build_module(data, persona, color))
    html_mod = _build_html_module()
    if html_mod["submodules"]:
        modules.append(html_mod)
    return modules


# Loaded once at import time. Restart the backend to pick up new JSON edits.
MODULES = _load_all_modules()


def find_module(module_id: str):
    for m in MODULES:
        if m["module_id"] == module_id:
            return m
    return None


def find_submodule(module_id: str, sub_id: str):
    m = find_module(module_id)
    if not m:
        return None, None
    for s in m["submodules"]:
        if s["id"] == sub_id:
            return m, s
    return m, None


def attach_citations(submodule: dict) -> dict:
    """Already attached during _build_submodule; pass through for back-compat."""
    out = dict(submodule)
    if submodule.get("framework"):
        framework = next((f for f in PROMPT_FRAMEWORKS if f["id"] == submodule["framework"]), None)
        if framework:
            out["framework"] = framework
    return out

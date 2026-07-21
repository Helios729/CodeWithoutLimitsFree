"""
Code Without Limits — extended content loaders.

Loads two new author-provided JSONs (single source of truth):

  • income_modules.json   – the 18 Income & Asset modules (microenterprise
    project bank). Participants build a monetisable digital asset.
  • app_content.json      – everything outside the 18 income modules:
    curriculum overview, programme structure, workflow stages, languages,
    supplementary modules, core rule, references.

The JSON shapes are passed through as-is to the frontend — no paraphrasing.
"""

import json
from pathlib import Path

DATA_DIR = Path(__file__).parent / "curriculum_data"


def _load_json(filename: str) -> dict:
    path = DATA_DIR / filename
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


# Loaded once at import. Restart backend to pick up edits.
INCOME_DOC = _load_json("income_modules.json")
PROGRAMME_DOC = _load_json("app_content.json")
GLOSSARY_DOC = _load_json("glossary.json")
RESOURCES_DOC = _load_json("resources.json")

INCOME_MODULES = INCOME_DOC.get("modules", []) if isinstance(INCOME_DOC, dict) else []


# Translator modules ship as one JSON per language plus a manifest.
_TRANSLATOR_DIR = DATA_DIR / "translator_modules"
TRANSLATOR_MANIFEST: dict = {}
TRANSLATOR_BY_KEY: dict[str, dict] = {}
if _TRANSLATOR_DIR.exists():
    try:
        TRANSLATOR_MANIFEST = json.loads(
            (_TRANSLATOR_DIR / "manifest.json").read_text(encoding="utf-8")
        )
    except Exception:
        TRANSLATOR_MANIFEST = {}
    for entry in TRANSLATOR_MANIFEST.get("modules", []) or []:
        fname = entry.get("file")
        key = entry.get("key")
        if not (fname and key):
            continue
        try:
            TRANSLATOR_BY_KEY[key] = json.loads(
                (_TRANSLATOR_DIR / fname).read_text(encoding="utf-8")
            )
        except Exception:
            continue


def income_list_summary() -> dict:
    """Lightweight catalog for the Income Bank list screen.

    Module 18 is the intentional duplicate of Module 2 — a teaching device
    that highlights how supporting and boosting local economies through
    community-based efforts is worth re-emphasising. The public count is
    therefore presented as 17 distinct modules with a curiosity-gap note."""
    items = []
    for m in INCOME_MODULES:
        items.append(
            {
                "id": m.get("id"),
                "slug": m.get("slug"),
                "title": m.get("title"),
                "role_label": m.get("role_label"),
                "asset": m.get("asset"),
                "languages": m.get("languages", []) or [],
                "ai_basics_count": len(m.get("ai_basics_learned") or []),
            }
        )
    return {
        "title": "Income & Asset Module Bank (Tasks 1\u201317)",
        "description": INCOME_DOC.get("description", ""),
        "source_document": INCOME_DOC.get("source_document", ""),
        "count": 17,
        "total_cards": len(items),
        "duplication_note": (
            "You'll notice Task 18 repeats Task 2. That's intentional. "
            "Supporting and boosting local economies through community-based "
            "efforts is the spine of this programme \u2014 it earns its second seat at "
            "the table. Read both and notice how the framing shifts from the "
            "individual builder to the community multiplier."
        ),
        "modules": items,
    }


def income_module_detail(module_id: int) -> dict | None:
    for m in INCOME_MODULES:
        if str(m.get("id")) == str(module_id):
            return m
    return None


def programme_overview() -> dict:
    """Curated bundle of the most useful programme-level sections for the
    About / Programme screen. Returns empty dict if the JSON wasn't loaded."""
    if not isinstance(PROGRAMME_DOC, dict) or not PROGRAMME_DOC:
        return {}
    return {
        "title": PROGRAMME_DOC.get("title", "Code Without Limits"),
        "description": PROGRAMME_DOC.get("description", ""),
        "source_document": PROGRAMME_DOC.get("source_document", ""),
        "overview": PROGRAMME_DOC.get("overview", {}),
        "core_rule": PROGRAMME_DOC.get("core_rule", ""),
        "curriculum": PROGRAMME_DOC.get("curriculum", {}),
        "system_integration": PROGRAMME_DOC.get("system_integration", {}),
        "module_bank_intro": PROGRAMME_DOC.get("module_bank_intro", {}),
        "shared_energy_to_income_workflow": PROGRAMME_DOC.get(
            "shared_energy_to_income_workflow", {}
        ),
        "languages": PROGRAMME_DOC.get("languages", {}),
        "supplementary_modules": PROGRAMME_DOC.get("supplementary_modules", {}),
        "programme_structure": PROGRAMME_DOC.get("programme_structure", {}),
        "references": PROGRAMME_DOC.get("references", []) or [],
    }


def translator_list_summary() -> dict:
    """List of language modules + the verified manifest banners."""
    modules = []
    for entry in TRANSLATOR_MANIFEST.get("modules", []) or []:
        key = entry.get("key")
        mod = TRANSLATOR_BY_KEY.get(key, {})
        lang = mod.get("language") or {}
        recs = mod.get("recommended_resources") or []
        modules.append(
            {
                "key": key,
                "language": entry.get("language"),
                "autonym": lang.get("autonym"),
                "iso_639_3": entry.get("iso_639_3"),
                "flores_200_code": entry.get("flores_200_code"),
                "resource_level": entry.get("resource_level"),
                "regions": lang.get("regions", []),
                "resource_count": len(recs),
                "speech_to_text_supported": bool(
                    (mod.get("speech_to_text") or {}).get("covered_by_seamless_m4t_v2")
                ),
            }
        )
    return {
        "title": TRANSLATOR_MANIFEST.get("title", "Open-Source Translator Modules"),
        "description": TRANSLATOR_MANIFEST.get("description", ""),
        "verified_on": TRANSLATOR_MANIFEST.get("verified_on", ""),
        "monetisation_note": (
            "No open-source translator covers every language. That gap is also "
            "an opportunity: communities can build, label, and licence the "
            "missing corpora themselves and earn from it. Income Module 18 "
            "(\u2261 Module 2) shows one path \u2014 decoupled web-scraping & local "
            "market aggregation. Module 13 (Web Scraper) shows another. "
            "Helping low-resource languages reach quality parity is real, "
            "verifiable work \u2014 and the receipts (corpus, eval scores, "
            "translator API) are themselves saleable digital assets."
        ),
        "licensing_guidance": TRANSLATOR_MANIFEST.get("licensing_guidance", {}),
        "speech_to_text_summary": TRANSLATOR_MANIFEST.get("speech_to_text_summary", {}),
        "offline_guidance": TRANSLATOR_MANIFEST.get("offline_guidance", ""),
        "primary_venues_referenced": TRANSLATOR_MANIFEST.get(
            "primary_venues_referenced", []
        ),
        "modules": modules,
    }


def translator_module_detail(key: str) -> dict | None:
    return TRANSLATOR_BY_KEY.get(key)


def glossary_payload() -> dict:
    if not isinstance(GLOSSARY_DOC, dict):
        return {}
    return GLOSSARY_DOC


def resources_payload() -> dict:
    if not isinstance(RESOURCES_DOC, dict):
        return {}
    return RESOURCES_DOC

"""Iteration 7 content tests: income bank, translator, glossary, content topics teasers.

All routes are public (no auth). Endpoints are served from local JSON.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/")


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- Income & Asset Module Bank ---
class TestIncomeModules:
    def test_income_modules_list(self, api):
        r = api.get(f"{BASE_URL}/api/income/modules")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"].rstrip().endswith("(Tasks 1\u201317)"), d["title"]
        assert d["count"] == 17, d["count"]
        assert d["total_cards"] == 18, d["total_cards"]
        note = d.get("duplication_note", "")
        assert note and isinstance(note, str)
        lower = note.lower()
        # Mentions Task 18 / Task 2 / local economy framing
        assert "task 18" in lower or "18" in lower
        assert "task 2" in lower or "2" in lower
        assert "communit" in lower or "local" in lower or "econom" in lower
        mods = d["modules"]
        assert len(mods) == 18, len(mods)
        required = {"id", "title", "role_label", "asset", "languages", "ai_basics_count"}
        for m in mods:
            missing = required - set(m.keys())
            assert not missing, f"Module {m.get('id')} missing keys: {missing}"

    def test_income_module_18_duplicates_2(self, api):
        r2 = api.get(f"{BASE_URL}/api/income/modules/2")
        r18 = api.get(f"{BASE_URL}/api/income/modules/18")
        assert r2.status_code == 200
        assert r18.status_code == 200
        assert r2.json()["title"] == r18.json()["title"]

    def test_income_module_1_has_execution(self, api):
        r = api.get(f"{BASE_URL}/api/income/modules/1")
        assert r.status_code == 200
        d = r.json()
        # Should contain Execution-like content
        # Spec: "still returns full body with Execution"
        # Look for the "execution" key (case-insensitive scan)
        keys_lower = {k.lower() for k in d.keys()}
        assert any("execution" in k for k in keys_lower), f"No execution-related key in {list(d.keys())}"


# --- Translator ---
class TestTranslator:
    def test_translator_index(self, api):
        r = api.get(f"{BASE_URL}/api/translator")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "Open-Source Translator" in d["title"]
        mods = d["modules"]
        assert len(mods) == 8, len(mods)
        for m in mods:
            for key in ("key", "language", "iso_639_3", "resource_count",
                        "speech_to_text_supported"):
                assert key in m, f"missing {key} in {m}"
        mon = d.get("monetisation_note", "")
        assert mon and isinstance(mon, str)
        lower = mon.lower()
        assert "gap" in lower and "opportunit" in lower, mon
        assert "low" in lower or "low-resource" in lower or "corpora" in lower or "corpus" in lower
        assert d.get("licensing_guidance"), "licensing_guidance missing"
        assert d.get("verified_on"), "verified_on missing"

    def test_translator_haitian_creole(self, api):
        r = api.get(f"{BASE_URL}/api/translator/haitian_creole")
        assert r.status_code == 200
        d = r.json()
        assert d["language"]["name_en"] == "Haitian Creole"
        assert len(d.get("recommended_resources", [])) >= 1
        assert d["speech_to_text"]["covered_by_seamless_m4t_v2"] is False
        assert d.get("verification_policy")

    def test_translator_not_found(self, api):
        r = api.get(f"{BASE_URL}/api/translator/does_not_exist")
        assert r.status_code == 404


# --- Glossary ---
class TestGlossary:
    def test_glossary_shape(self, api):
        r = api.get(f"{BASE_URL}/api/glossary")
        assert r.status_code == 200
        d = r.json()
        terms = d["terms"]
        assert len(terms) >= 15, len(terms)
        names = [t["term"].lower() for t in terms]
        for required in ("bandwidth", "throughput", "bottleneck", "corpus"):
            assert any(required in n for n in names), f"missing term: {required}"
        for t in terms:
            for key in ("term", "short", "definition"):
                assert t.get(key), f"term {t.get('term')} missing {key}"
            src = t.get("source") or {}
            assert src.get("url") or src.get("title"), f"term {t.get('term')} missing source"


# --- Content topics teasers (html-advanced) ---
class TestContentTopicsTeasers:
    def test_html_advanced_topics_have_teasers(self, api):
        r = api.get(f"{BASE_URL}/api/content/topics")
        assert r.status_code == 200
        d = r.json()
        topics = d.get("topics", d) if isinstance(d, dict) else d
        assert isinstance(topics, list)

        expected_ids = {f"html-advanced__mq{i}" for i in range(1, 5)}
        by_id = {t.get("topic_id") or t.get("id"): t for t in topics}
        for tid in expected_ids:
            assert tid in by_id, f"missing topic {tid}"
            t = by_id[tid]
            assert t.get("coming_soon") is True, f"{tid} not coming_soon"
            teaser = t.get("teaser") or ""
            assert isinstance(teaser, str) and teaser.strip(), f"{tid} empty teaser"


# --- Regression: previously working endpoints ---
class TestRegression:
    def test_l10b_html_has_tabs_and_difficulty(self, api):
        r = api.get(f"{BASE_URL}/api/modules/L10b-html")
        assert r.status_code == 200
        d = r.json()
        assert d.get("tabs"), "missing tabs"
        sm = d.get("submodules") or d.get("lessons") or []
        if sm:
            assert any(s.get("difficulty") for s in sm), "no difficulty on submodules"

    def test_programme_returns_weeks(self, api):
        r = api.get(f"{BASE_URL}/api/programme")
        assert r.status_code == 200
        d = r.json()
        weeks = ((d.get("programme_structure") or {}).get("weeks")
                 or d.get("weeks"))
        assert weeks and len(weeks) >= 1, "no weeks"

    def test_income_module_1_full_body(self, api):
        r = api.get(f"{BASE_URL}/api/income/modules/1")
        assert r.status_code == 200
        d = r.json()
        assert d.get("title")
        # spec: still returns full body with Execution
        keys_lower = {k.lower() for k in d.keys()}
        assert any("execution" in k for k in keys_lower)

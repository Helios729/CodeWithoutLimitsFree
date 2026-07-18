"""
Iteration 6 tests — Income & Asset Module Bank, Programme overview,
L10b-html tabs, plus a regression on /api/modules.
All endpoints below are public (no Bearer auth).
"""
import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ["FRONTEND_URL"]).rstrip("/")


# ----- Income & Asset Module Bank -----
class TestIncomeModules:
    def test_list_count_and_shape(self):
        r = requests.get(f"{BASE_URL}/api/income/modules", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["count"] == 18
        assert isinstance(data["modules"], list)
        assert len(data["modules"]) == 18

        # Validate every summary item has the documented fields.
        required = {"id", "slug", "title", "role_label", "asset", "languages", "ai_basics_count"}
        for m in data["modules"]:
            missing = required - set(m.keys())
            assert not missing, f"Module id={m.get('id')} missing keys: {missing}"
            assert isinstance(m["languages"], list)
            assert isinstance(m["ai_basics_count"], int)

    def test_detail_module_1_has_full_body(self):
        r = requests.get(f"{BASE_URL}/api/income/modules/1", timeout=20)
        assert r.status_code == 200, r.text
        m = r.json()
        for field in (
            "execution",
            "energy_maximisation",
            "why_it_monetises",
            "community_multiplier",
            "ai_basics_learned",
            "languages",
        ):
            assert field in m, f"Missing field {field} in income module 1"
        assert "AI Security Red-Teaming" in m["title"]
        assert isinstance(m["ai_basics_learned"], list) and m["ai_basics_learned"]
        assert isinstance(m["languages"], list) and m["languages"]

    def test_detail_404(self):
        r = requests.get(f"{BASE_URL}/api/income/modules/999", timeout=20)
        assert r.status_code == 404

    def test_all_18_detail_endpoints_resolve(self):
        for i in range(1, 19):
            r = requests.get(f"{BASE_URL}/api/income/modules/{i}", timeout=20)
            assert r.status_code == 200, f"id {i} -> {r.status_code}"
            body = r.json()
            assert body.get("id") == i


# ----- Programme overview -----
class TestProgramme:
    def test_programme_overview_payload(self):
        r = requests.get(f"{BASE_URL}/api/programme", timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        # summary must be non-empty
        assert d.get("overview", {}).get("summary"), "overview.summary should be non-empty"
        # core_rule is a non-empty string
        assert isinstance(d.get("core_rule"), str)
        assert len(d["core_rule"]) > 10
        # weeks is a non-empty list
        weeks = d.get("programme_structure", {}).get("weeks")
        assert isinstance(weeks, list) and len(weeks) > 0
        # programme_languages
        langs = d.get("languages", {}).get("programme_languages")
        assert isinstance(langs, list) and len(langs) > 0
        # references
        refs = d.get("references")
        assert isinstance(refs, list) and len(refs) > 0


# ----- L10b-html tabs -----
class TestHtmlModuleTabs:
    def test_module_has_three_tabs_and_difficulty(self):
        r = requests.get(f"{BASE_URL}/api/modules/L10b-html", timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("tabs") == ["Beginner", "Intermediate", "Advanced"], d.get("tabs")
        subs = d.get("submodules", [])
        assert subs, "submodules should be non-empty"
        allowed = {"Beginner", "Intermediate", "Advanced"}
        for s in subs:
            assert s.get("difficulty") in allowed, (
                f"Submodule {s.get('id')} bad difficulty: {s.get('difficulty')}"
            )
            # Titles must NOT carry a "[Beginner]/" or similar prefix.
            title = s.get("title", "")
            for tag in ("[Beginner]", "[Intermediate]", "[Advanced]"):
                assert not title.startswith(tag), (
                    f"Submodule {s.get('id')} retains prefix in title: {title!r}"
                )


# ----- Regressions -----
class TestModulesRegression:
    def test_list_modules(self):
        r = requests.get(f"{BASE_URL}/api/modules", timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        modules = d.get("modules", [])
        assert len(modules) >= 11, f"Expected >=11 modules, got {len(modules)}"
        assert "framework_count" in d

    def test_first_module_detail_resolves(self):
        # Use the first module returned by /api/modules
        r = requests.get(f"{BASE_URL}/api/modules", timeout=20)
        first_id = r.json()["modules"][0]["module_id"]
        r2 = requests.get(f"{BASE_URL}/api/modules/{first_id}", timeout=20)
        assert r2.status_code == 200, f"{first_id} -> {r2.status_code}: {r2.text[:200]}"
        body = r2.json()
        assert body["module_id"] == first_id
        assert isinstance(body.get("submodules"), list)

    def test_quiz_generate_unauth_does_not_500(self):
        # Quiz endpoint requires auth — must return 401/403, never 500.
        r = requests.post(
            f"{BASE_URL}/api/quiz/generate",
            json={"topic_id": "anything"},
            timeout=20,
        )
        assert r.status_code in (401, 403, 422), f"unexpected status {r.status_code}: {r.text[:200]}"

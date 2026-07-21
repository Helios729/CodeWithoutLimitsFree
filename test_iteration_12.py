"""Iteration 10 — verifies external-link redirector (/api/go),
survey-forms registry (/api/forms), and regressions for
/api/income/modules, /api/programme, /api/translator."""

import os
import requests
import pytest

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ["FRONTEND_URL"]).rstrip("/")


# ---------- /api/forms (BUG 3 fix) ----------

class TestForms:
    def test_forms_200_and_count_39(self):
        r = requests.get(f"{BASE_URL}/api/forms", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["count"] == 39, f"expected 39 items, got {data['count']}"
        assert len(data["items"]) == 39

    def test_forms_first_is_intro_to_ai_learning(self):
        r = requests.get(f"{BASE_URL}/api/forms", timeout=20)
        first = r.json()["items"][0]
        assert first["kind"] == "learning"
        assert "introduction-to-ai" in first["module_id"].lower() or \
               "introduction to ai" in first["title"].lower()

    def test_forms_every_item_has_survey_title(self):
        r = requests.get(f"{BASE_URL}/api/forms", timeout=20)
        for it in r.json()["items"]:
            assert isinstance(it.get("survey_title"), str) and it["survey_title"].strip()
            assert it.get("module_id")
            assert it.get("kind") in {"learning", "income", "translator", "programme"}

    def test_forms_each_kind_present(self):
        r = requests.get(f"{BASE_URL}/api/forms", timeout=20)
        kinds = {it["kind"] for it in r.json()["items"]}
        assert {"learning", "income", "translator", "programme"} <= kinds

    def test_forms_kind_counts(self):
        r = requests.get(f"{BASE_URL}/api/forms", timeout=20)
        items = r.json()["items"]
        counts = {k: sum(1 for i in items if i["kind"] == k)
                  for k in ("learning", "income", "translator", "programme")}
        # spec: 11 learning + 18 income + 8 translator + 2 programme
        assert counts["learning"] == 11, counts
        assert counts["income"] == 18, counts
        assert counts["translator"] == 8, counts
        assert counts["programme"] == 2, counts


# ---------- /api/go (BUG 1 fix) ----------

class TestGoRedirect:
    def test_go_huggingface_302(self):
        url = "https://huggingface.co/google/madlad400-3b-mt"
        r = requests.get(f"{BASE_URL}/api/go", params={"url": url},
                         allow_redirects=False, timeout=20)
        assert r.status_code == 302, f"{r.status_code} {r.text}"
        assert r.headers.get("Location") == url

    def test_go_coddy_302(self):
        url = "https://coddy.tech"
        r = requests.get(f"{BASE_URL}/api/go", params={"url": url},
                         allow_redirects=False, timeout=20)
        assert r.status_code == 302
        assert r.headers.get("Location") == url

    def test_go_alison_302(self):
        url = "https://alison.com"
        r = requests.get(f"{BASE_URL}/api/go", params={"url": url},
                         allow_redirects=False, timeout=20)
        assert r.status_code == 302
        assert r.headers.get("Location") == url

    def test_go_blocks_non_allowlisted_host(self):
        r = requests.get(f"{BASE_URL}/api/go",
                         params={"url": "https://evil.example.com"},
                         allow_redirects=False, timeout=20)
        assert r.status_code == 403, f"expected 403, got {r.status_code}"

    def test_go_missing_url_param(self):
        r = requests.get(f"{BASE_URL}/api/go",
                         allow_redirects=False, timeout=20)
        # FastAPI returns 422 when a required query param is missing
        assert r.status_code in (400, 422), r.status_code

    def test_go_invalid_scheme(self):
        r = requests.get(f"{BASE_URL}/api/go",
                         params={"url": "ftp://huggingface.co/foo"},
                         allow_redirects=False, timeout=20)
        assert r.status_code == 400


# ---------- Regression ----------

class TestRegression:
    def test_income_modules_17(self):
        r = requests.get(f"{BASE_URL}/api/income/modules", timeout=20)
        assert r.status_code == 200
        data = r.json()
        # API uses "count" for distinct modules
        cnt = data.get("count") or len(data.get("modules", []))
        assert cnt == 17 or len(data.get("modules", [])) == 17, data.get("count")

    def test_programme_returns_weeks(self):
        r = requests.get(f"{BASE_URL}/api/programme", timeout=20)
        assert r.status_code == 200
        weeks = r.json().get("programme_structure", {}).get("weeks") or []
        assert len(weeks) >= 1

    def test_translator_modules_8(self):
        r = requests.get(f"{BASE_URL}/api/translator", timeout=20)
        assert r.status_code == 200
        mods = r.json().get("modules") or []
        assert len(mods) == 8, len(mods)

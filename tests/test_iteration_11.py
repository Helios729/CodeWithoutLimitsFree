"""Iteration 11: Google Form survey wiring tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://token-limit-enforcer.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---- Module survey_form_url ----
class TestModuleSurveyUrl:
    def test_intro_to_ai(self, s):
        r = s.get(f"{BASE_URL}/api/modules/introduction-to-ai", timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("survey_form_url") == "https://forms.gle/x5XuawYCBpAAcU5q8"

    def test_l10b_html(self, s):
        r = s.get(f"{BASE_URL}/api/modules/L10b-html", timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("survey_form_url") == "https://forms.gle/1Q7YRrQaaTfY1Yme6"

    def test_python_fundamentals(self, s):
        r = s.get(f"{BASE_URL}/api/modules/python-fundamentals", timeout=30)
        assert r.status_code == 200, r.text
        url = r.json().get("survey_form_url")
        assert url is not None and "aWDbB6bGic9gYeup6" in url


# ---- Income survey_form_url ----
class TestIncomeSurveyUrl:
    def test_income_1(self, s):
        r = s.get(f"{BASE_URL}/api/income/modules/1", timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("survey_form_url") == "https://forms.gle/ztwSJNm7WH9CGQj5A"

    def test_income_2(self, s):
        r = s.get(f"{BASE_URL}/api/income/modules/2", timeout=30)
        assert r.status_code == 200, r.text
        url = r.json().get("survey_form_url")
        assert url is not None and "391tDSSJySnMV45v8" in url

    def test_income_17(self, s):
        r = s.get(f"{BASE_URL}/api/income/modules/17", timeout=30)
        assert r.status_code == 200, r.text
        url = r.json().get("survey_form_url")
        assert url is not None and "Bo1nQh6XkEgknv1C8" in url

    def test_income_18_null(self, s):
        r = s.get(f"{BASE_URL}/api/income/modules/18", timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("survey_form_url") is None


# ---- Translator ----
class TestTranslatorSurveyUrl:
    def test_translator_haitian(self, s):
        r = s.get(f"{BASE_URL}/api/translator/haitian_creole", timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("survey_form_url") is None


# ---- /api/forms registry ----
class TestFormsRegistry:
    def test_forms_count_and_wiring(self, s):
        r = s.get(f"{BASE_URL}/api/forms", timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        # accept either list or {count, items}
        items = body.get("items") if isinstance(body, dict) else body
        count = body.get("count") if isinstance(body, dict) else len(items)
        assert count == 39, f"expected 39, got {count}"
        wired = [x for x in items if x.get("form_url")]
        assert len(wired) == 28, f"expected 28 wired, got {len(wired)}"
        # translator + programme kinds should all be null
        for x in items:
            kind = x.get("kind")
            if kind in ("translator", "programme"):
                assert x.get("form_url") in (None, ""), f"unexpected wired {kind}: {x}"


# ---- /api/go redirect ----
class TestGoRedirect:
    def test_go_forms_gle(self, s):
        r = s.get(
            f"{BASE_URL}/api/go",
            params={"url": "https://forms.gle/x5XuawYCBpAAcU5q8"},
            allow_redirects=False,
            timeout=30,
        )
        assert r.status_code in (301, 302, 307, 308), f"got {r.status_code}: {r.text[:200]}"
        loc = r.headers.get("Location", "")
        assert "forms.gle" in loc, f"unexpected location: {loc}"


# ---- Regression sweep ----
class TestRegression:
    def test_income_modules_list(self, s):
        r = s.get(f"{BASE_URL}/api/income/modules", timeout=30)
        assert r.status_code == 200
        body = r.json()
        items = body.get("items") if isinstance(body, dict) else body
        count = body.get("count") if isinstance(body, dict) else len(items)
        assert count == 17

    def test_programme(self, s):
        r = s.get(f"{BASE_URL}/api/programme", timeout=30)
        assert r.status_code == 200
        body = r.json()
        # Programme returns rich curriculum structure (programme_structure / curriculum keys);
        # the review only requires HTTP 200 for the regression sweep.
        assert isinstance(body, dict) and len(body) > 0

    def test_translator_list(self, s):
        r = s.get(f"{BASE_URL}/api/translator", timeout=30)
        assert r.status_code == 200
        body = r.json()
        items = body.get("modules") or body.get("items") or body
        if isinstance(items, dict):
            items = items.get("modules") or items.get("items")
        assert items and len(items) == 8

"""Iteration 12 — deployment-readiness regression.

Covers:
- Root-level probe endpoints (`/` and `/healthz`) for Kubernetes readiness.
- Regression of `/api/` and core content endpoints.
- ENABLE_PRESEED gating (no startup HTTP calls by default).
"""
import os
import re
import requests
import pytest

BASE_URL = "http://localhost:8001"


# ---------- probe endpoints (root, no /api prefix) ----------
def test_root_probe_returns_ok():
    r = requests.get(f"{BASE_URL}/")
    assert r.status_code == 200
    body = r.json()
    assert body == {"status": "ok", "service": "Code Without Limits API"}


def test_healthz_probe_returns_ok():
    r = requests.get(f"{BASE_URL}/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# ---------- /api regressions ----------
def test_api_root_regression():
    r = requests.get(f"{BASE_URL}/api/")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_income_modules_count_17():
    r = requests.get(f"{BASE_URL}/api/income/modules")
    assert r.status_code == 200
    data = r.json()
    # canonical count field on the response payload
    assert data.get("count") == 17, f"expected count=17, got {data.get('count')}"
    assert isinstance(data.get("modules"), list)


def test_module_introduction_to_ai_survey_url():
    r = requests.get(f"{BASE_URL}/api/modules/introduction-to-ai")
    assert r.status_code == 200
    data = r.json()
    assert data.get("survey_form_url"), "survey_form_url must be non-null"
    assert data["survey_form_url"].startswith("https://forms.gle/")


def test_forms_registry_count_and_wired():
    r = requests.get(f"{BASE_URL}/api/forms")
    assert r.status_code == 200
    data = r.json()
    assert data.get("count") == 39
    items = data.get("items", [])
    assert len(items) == 39
    wired = [i for i in items if i.get("form_url")]
    assert len(wired) == 28, f"expected 28 wired forms, got {len(wired)}"


def test_go_redirect_302():
    r = requests.get(
        f"{BASE_URL}/api/go",
        params={"url": "https://forms.gle/x5XuawYCBpAAcU5q8"},
        allow_redirects=False,
    )
    assert r.status_code == 302
    assert r.headers.get("location") == "https://forms.gle/x5XuawYCBpAAcU5q8"


# ---------- pre-seed gating (code + log inspection) ----------
def test_preseed_gating_is_env_var_controlled():
    """Confirm server.py reads ENABLE_PRESEED before scheduling preseed task."""
    src = open("/app/backend/server.py").read()
    assert 'os.environ.get("ENABLE_PRESEED"' in src, "preseed must be env-gated"
    # the create_task call must be inside the env-gated branch
    m = re.search(
        r'if\s+os\.environ\.get\("ENABLE_PRESEED".*?\)\.lower\(\)\s+in\s+\([^)]+\):\s*\n'
        r'\s+import\s+asyncio\s*\n'
        r'\s+asyncio\.create_task\(preseed_all\(db\)\)',
        src,
    )
    assert m, "asyncio.create_task(preseed_all(db)) must be inside ENABLE_PRESEED gate"


def test_recent_backend_restart_has_no_preseed_lines():
    """The latest backend startup must not log preseed/scrape activity."""
    log = open("/var/log/supervisor/backend.err.log").read()
    # find the last "Application startup complete." occurrence
    parts = log.split("Application startup complete.")
    assert len(parts) >= 2, "no startup-complete marker found in log"
    last_startup_window = parts[-2][-2000:] + "Application startup complete." + parts[-1]
    # within the most recent startup window, no preseed/scrape activity
    assert "Pre-seeding scraped content" not in parts[-1], \
        "latest startup still pre-seeding; ENABLE_PRESEED gate not honoured"
    assert "scrape failed" not in parts[-1], \
        "latest startup still emitting scrape warnings"

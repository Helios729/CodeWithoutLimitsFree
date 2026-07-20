"""Iteration 15 tests: languages content fix + quiz '5 questions' fix."""
import os
import re
import requests
import pytest

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "http://localhost:8001").rstrip("/")
LOCAL = "http://localhost:8001"

EXPECTED_LANGS = [
    "English", "French", "Haitian Creole",
    "Brazilian Portuguese", "Spanish", "Bambara", "Wolof",
]


# ---------- BUG 1: languages section ----------
class TestProgrammeLanguages:
    @pytest.fixture(scope="class")
    def programme(self):
        r = requests.get(f"{LOCAL}/api/programme", timeout=10)
        assert r.status_code == 200
        return r.json()

    def test_programme_languages_exact_order(self, programme):
        langs = programme.get("languages", {}).get("programme_languages")
        assert langs == EXPECTED_LANGS, f"got {langs}"

    def test_note_contains_all_7(self, programme):
        note = programme.get("languages", {}).get("note", "")
        for lang in EXPECTED_LANGS:
            assert lang in note, f"missing {lang} in note: {note}"

    def test_note_no_step_by_step_in_english(self, programme):
        note = programme.get("languages", {}).get("note", "")
        assert "step-by-step in English" not in note

    def test_instruction_language(self, programme):
        il = programme.get("languages", {}).get("instruction_language", "")
        assert "English" in il
        assert "translator mode" in il.lower()

    def test_translator_mode_core_has_haitian_creole(self, programme):
        core = programme.get("languages", {}).get("translator_mode_core", [])
        assert "Haitian Creole" in core

    def test_translator_mode_best_effort_has_bambara(self, programme):
        be = programme.get("languages", {}).get("translator_mode_best_effort", [])
        assert "Bambara" in be


# ---------- BUG 2: quiz source files ----------
class TestQuizSourceContent:
    def test_quiz_tab_says_exactly_5(self):
        with open("/app/frontend/app/(tabs)/quiz.tsx") as f:
            src = f.read()
        assert "exactly 5 questions" in src
        assert "exactly 10 questions" not in src

    def test_quiz_topic_eyebrow_5_questions(self):
        with open("/app/frontend/app/quiz/[topicId].tsx") as f:
            src = f.read()
        # Either >5 questions< or "5 questions"
        has_5 = ">5 questions<" in src or '"5 questions"' in src or "'5 questions'" in src
        assert has_5, "neither >5 questions< nor \"5 questions\" literal found"
        assert ">10 questions<" not in src
        assert '"10 questions"' not in src
        assert "'10 questions'" not in src


# ---------- REGRESSION ----------
class TestRegression:
    def test_income_modules(self):
        r = requests.get(f"{LOCAL}/api/income/modules", timeout=10)
        assert r.status_code == 200
        data = r.json()
        # data may be list or dict with count
        if isinstance(data, list):
            count = len(data)
        elif isinstance(data, dict):
            count = data.get("count") or len(data.get("modules", []))
        else:
            count = 0
        assert count == 17, f"expected 17 modules, got {count}"

    def test_root(self):
        r = requests.get(f"{LOCAL}/", timeout=10)
        assert r.status_code == 200

    def test_healthz(self):
        r = requests.get(f"{LOCAL}/healthz", timeout=10)
        assert r.status_code == 200

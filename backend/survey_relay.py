"""
Mirror every in-app /api/surveys/submit response into the master
Google Form ("Master Sheet_Code Without Limits") so all feedback
auto-flows into the linked Google Sheet.

Failures here MUST NEVER break the in-app submission — they're
fire-and-forget. Logged for diagnostics, swallowed otherwise.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger("codeguardian.survey_relay")

# Master Google Form mapping. If you ever swap the form, update only
# the entry IDs below; nothing else in the codebase changes.
FORM_ID = os.getenv(
    "MASTER_SURVEY_FORM_ID",
    "1FAIpQLSfqBbZk21rQph-1DFqWi8qovH0VR_JPD0K5ACc0oomFeZ0CFQ",
)
FORM_URL = f"https://docs.google.com/forms/d/e/{FORM_ID}/formResponse"

FIELDS = {
    "full_name":   "entry.1831790721",  # short-text, required
    "module_id":   "entry.1098583469",  # short-text, required
    "clarity":     "entry.1345917939",  # linear-scale 1..5
    "pace":        "entry.66475573",    # linear-scale 1..5
    "relevance":   "entry.636758064",   # linear-scale 1..5
    "confidence":  "entry.187784294",   # linear-scale 1..5
    "worked_well": "entry.1297071410",  # paragraph
    "free_text":   "entry.1473631472",  # paragraph (didn't work + would change merged)
}

# Toggle the relay without code changes by setting SURVEY_RELAY_ENABLED=false.
def _enabled() -> bool:
    return os.getenv("SURVEY_RELAY_ENABLED", "true").lower() in ("1", "true", "yes")


def _build_payload(*, user: dict[str, Any], doc: dict[str, Any]) -> dict[str, str]:
    """Map our internal survey doc → Google Form field IDs."""
    name = (user.get("name") or "").strip() or user.get("email", "anonymous")
    module_label = doc.get("module_title") or doc.get("module_id") or ""
    if doc.get("module_id") and doc.get("module_title"):
        module_label = f"{doc['module_id']} — {doc['module_title']}"

    # Google linear-scale fields accept the option label (e.g. "1"..."5").
    return {
        FIELDS["full_name"]:   name[:200],
        FIELDS["module_id"]:   module_label[:200],
        FIELDS["clarity"]:     str(int(doc.get("clarity") or 0)),
        FIELDS["pace"]:        str(int(doc.get("pace") or 0)),
        FIELDS["relevance"]:   str(int(doc.get("relevance") or 0)),
        FIELDS["confidence"]:  str(int(doc.get("confidence") or 0)),
        FIELDS["worked_well"]: (doc.get("worked_well") or "")[:1800],
        FIELDS["free_text"]:   _merge_free_text(
            doc.get("did_not_work") or "",
            doc.get("would_change") or "",
        ),
    }


def _merge_free_text(did_not: str, would_change: str) -> str:
    """The master form combined two prompts into one paragraph field —
    keep both signals labeled so the Sheet row is still readable."""
    parts: list[str] = []
    if did_not.strip():
        parts.append(f"What didn't work:\n{did_not.strip()}")
    if would_change.strip():
        parts.append(f"What I would change:\n{would_change.strip()}")
    return ("\n\n".join(parts))[:1800] or "(no comment)"


async def relay_to_google_form(*, user: dict[str, Any], doc: dict[str, Any]) -> bool:
    """Fire-and-forget POST to the master Google Form. Returns True on
    likely success (Google returns 200 with a "Your response has been
    recorded" page). Never raises."""
    if not _enabled():
        return False
    try:
        payload = _build_payload(user=user, doc=doc)
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                FORM_URL,
                data=payload,
                follow_redirects=True,
                headers={
                    "User-Agent": "Mozilla/5.0 (compatible; CodeWithoutLimits/1.0)",
                    # Google rejects POSTs that look unlike a browser submission
                    "Referer": f"https://docs.google.com/forms/d/e/{FORM_ID}/viewform",
                },
            )
        ok = resp.status_code == 200 and (
            "Your response" in resp.text or "formResponse" in str(resp.url)
        )
        if not ok:
            logger.warning(
                "survey_relay: unexpected response status=%s len=%s",
                resp.status_code, len(resp.text),
            )
        else:
            logger.info(
                "survey_relay: ok module=%s user=%s",
                doc.get("module_id"), user.get("email"),
            )
        return ok
    except Exception as e:
        logger.warning("survey_relay: failed: %r", e)
        return False

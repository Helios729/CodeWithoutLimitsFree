"""
Small AI Asset Studio / Code Without Limits — FastAPI backend.

What this file wires together:
1. Emergent Google Auth session validation + Bearer-token API auth.
2. Strict pre-call quota enforcement (see quota.py).
3. Gemini 2.5 Pro via emergentintegrations.LlmChat — quiz generation
   and agent chat. Real token counts come from the model's usage
   metadata and are persisted before the response is returned.
4. Web scraping with cache + robots.txt + allowlist (see scraper.py).
5. Stripe Checkout (Day Pass / Monthly Sub) + webhook to flip tier.

Every route is prefixed with /api so the Kubernetes ingress routes
them correctly. _id is always excluded from MongoDB responses.
"""

import asyncio
import hashlib
import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import httpx
import stripe
from bs4 import BeautifulSoup  # noqa: F401  (used indirectly via scraper)
from dotenv import load_dotenv
from fastapi import APIRouter, Body, Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from emergentintegrations.llm.chat import LlmChat, UserMessage

import quiz_pool
from content_extra import (
    glossary_payload,
    income_list_summary,
    income_module_detail,
    programme_overview,
    resources_payload,
    translator_list_summary,
    translator_module_detail,
)
from curriculum import (
    MODULES,
    PROMPT_FRAMEWORKS,
    attach_citations,
    find_module,
    find_submodule,
)
from quota import (
    DAY_PASS_PROMPT_CAP,
    DAY_PASS_TOKEN_CAP,
    MONTHLY_TOKEN_CAP,
    assert_can_call,
    get_account,
    record_usage,
    snapshot,
)
from scraper import preseed_all, scrape_topic
from sources import TOPIC_CATALOG, get_topic
from survey_relay import relay_to_google_form


# ---------- bootstrap ----------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("codeguardian")

mongo_url = os.environ["MONGO_URL"]
mongo = AsyncIOMotorClient(mongo_url)
db = mongo[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-pro")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

if STRIPE_API_KEY:
    stripe.api_key = STRIPE_API_KEY

app = FastAPI(title="Code Without Limits API")
api = APIRouter(prefix="/api")


# ---------- models ----------
class SessionIn(BaseModel):
    session_id: str


class UserOut(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None
    account_id: str


class UsageOut(BaseModel):
    tier: str
    daily_prompts_used: int = 0
    daily_prompts_cap: int = 0
    daily_tokens_used: int = 0
    daily_tokens_cap: int = 0
    monthly_prompts_used: int = 0
    monthly_prompts_cap: int = 0
    monthly_tokens_used: int = 0
    blocked: bool = False
    reason: str = ""
    day_pass_expires_at: Optional[datetime] = None


class QuizGenerateIn(BaseModel):
    topic_id: str
    # Free tier: learner pastes their own Gemini key for this single call.
    # Never stored — passed straight into emergentintegrations and discarded.
    byok_key: Optional[str] = None


class QuizSubmitIn(BaseModel):
    quiz_id: str
    answers: list[int]  # selected option indexes, length 10


class ChatIn(BaseModel):
    message: str
    agent: Optional[str] = "OER AI Tutor Agent"
    byok_key: Optional[str] = None  # free-tier bring-your-own-key, never stored


class CheckoutIn(BaseModel):
    plan: str  # "day_pass" or "monthly"


class SurveyIn(BaseModel):
    module_id: str
    module_title: str
    # 5-point Likert + free text per the user's PDF
    clarity: int          # 1-5
    pace: int             # 1-5
    relevance: int        # 1-5
    confidence: int       # 1-5
    worked_well: str = ""
    did_not_work: str = ""
    would_change: str = ""


# ---------- auth helpers ----------
async def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    """Bearer-token auth. Looks up the session_token in user_sessions,
    confirms it's still valid (timezone-aware), then loads the user.
    Returns the user record. Excludes _id everywhere."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing Bearer token")
    token = authorization.split(" ", 1)[1].strip()
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(401, "Invalid session")
    exp = sess.get("expires_at")
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if not exp or exp < datetime.now(timezone.utc):
        raise HTTPException(401, "Session expired")
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


# ---------- routes: health ----------
@api.get("/")
async def root():
    return {"status": "ok", "service": "Code Without Limits API"}


# ---------- routes: auth ----------
@api.post("/auth/session")
async def auth_session(body: SessionIn):
    """Exchange Emergent session_id (from the auth redirect) for a
    persistent session_token. Upserts the user by email so repeated
    sign-ins never create duplicates."""
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": body.session_id},
            )
            if r.status_code != 200:
                raise HTTPException(401, "Invalid session_id")
            data = r.json()
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Emergent auth exchange failed")
        raise HTTPException(502, f"Auth provider unreachable: {e}")

    email = data.get("email")
    if not email:
        raise HTTPException(400, "No email in session")

    now = datetime.now(timezone.utc)
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        account_id = existing.get("account_id") or user_id
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "name": data.get("name") or existing.get("name"),
                "picture": data.get("picture") or existing.get("picture"),
                "updated_at": now,
            }},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        account_id = f"acct_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name"),
            "picture": data.get("picture"),
            "account_id": account_id,
            "is_account_owner": True,
            "created_at": now,
            "updated_at": now,
        })
        await db.accounts.insert_one({
            "account_id": account_id,
            "tier": "free",
            "day_pass_expires_at": None,
            "subscription_status": None,
            "stripe_customer_id": None,
            "stripe_subscription_id": None,
            "seats_allowed": 1,
            "owner_user_id": user_id,
            "created_at": now,
        })

    session_token = data.get("session_token") or uuid.uuid4().hex
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "expires_at": now + timedelta(days=7),
        "created_at": now,
    })
    return {
        "token": session_token,
        "user": {
            "id": user_id,
            "email": email,
            "name": data.get("name"),
            "picture": data.get("picture"),
            "account_id": account_id,
        },
    }


@api.get("/auth/me", response_model=UserOut)
async def auth_me(user=Depends(get_current_user)):
    return UserOut(
        id=user["user_id"],
        email=user["email"],
        name=user.get("name"),
        picture=user.get("picture"),
        account_id=user.get("account_id") or user["user_id"],
    )


@api.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(default=None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


@api.post("/auth/demo")
async def auth_demo():
    """Presentation / Demo Mode — skips Google OAuth and issues a session
    token for a stable demo user with a `monthly` tier account so every
    feature is reachable (250 pooled prompts/mo). Disable in production
    by setting DEMO_MODE_ENABLED=false in the backend .env."""
    if os.getenv("DEMO_MODE_ENABLED", "true").lower() not in ("1", "true", "yes"):
        raise HTTPException(403, "Demo mode is disabled")

    now = datetime.now(timezone.utc)
    demo_email = "demo@codewithoutlimits.app"
    existing = await db.users.find_one({"email": demo_email}, {"_id": 0})

    if existing:
        user_id = existing["user_id"]
        account_id = existing.get("account_id") or user_id
    else:
        user_id = f"user_demo_{uuid.uuid4().hex[:8]}"
        account_id = f"acct_demo_{uuid.uuid4().hex[:8]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": demo_email,
            "name": "Demo Presenter",
            "picture": None,
            "account_id": account_id,
            "is_account_owner": True,
            "is_demo": True,
            "created_at": now,
            "updated_at": now,
        })
        await db.accounts.insert_one({
            "account_id": account_id,
            "tier": "monthly",  # full access for the presentation
            "day_pass_expires_at": None,
            "subscription_status": "demo",
            "stripe_customer_id": None,
            "stripe_subscription_id": None,
            "seats_allowed": 3,
            "owner_user_id": user_id,
            "is_demo": True,
            "created_at": now,
        })

    # Make sure the demo account stays on monthly tier even if a
    # previous run downgraded it.
    await db.accounts.update_one(
        {"account_id": account_id},
        {"$set": {"tier": "monthly", "subscription_status": "demo"}},
    )

    session_token = uuid.uuid4().hex
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "expires_at": now + timedelta(days=1),  # short-lived demo session
        "created_at": now,
        "is_demo": True,
    })

    return {
        "token": session_token,
        "user": {
            "id": user_id,
            "email": demo_email,
            "name": "Demo Presenter",
            "picture": None,
            "account_id": account_id,
        },
    }


# ---------- routes: account deletion (GDPR / Play Store compliance) ----------

@api.post("/account/delete")
async def account_delete(
    body: dict = Body(default={}),
    user=Depends(get_current_user),
):
    """Hard-delete this user's personal data.

    IMMEDIATE DELETION:
      - profile (users doc)
      - all sessions (logs them out everywhere)
      - all module surveys they submitted
      - any per-user progress / quiz history

    RETAINED (compliance / operational reasons — documented in the UI):
      - Stripe payment records: transaction ID + amount + date only,
        kept 7 years to comply with tax + PCI + chargeback rules.
        Personally identifying info attached to the payment is scrubbed.
      - Account row: kept if any active subscription exists; otherwise
        anonymised and marked deleted so pooled seat counts stay
        consistent for other members of the same monthly plan.
      - Aggregated, non-identifying analytics counts are never tied to
        a user_id after deletion.

    A safety check requires body["confirm"] == "DELETE" so a stray
    POST cannot accidentally wipe an account.
    """
    if (body or {}).get("confirm") != "DELETE":
        raise HTTPException(400, "Confirmation phrase 'DELETE' is required.")

    # Demo account can't be self-deleted (would break other presenters)
    if user.get("email") == "demo@codewithoutlimits.app":
        raise HTTPException(
            403,
            "The shared demo account cannot be deleted from the app.",
        )

    uid = user["user_id"]
    account_id = user.get("account_id")
    now = datetime.now(timezone.utc)

    summary: dict = {}
    async def _del(coll_name: str, query: dict) -> None:
        try:
            r = await db[coll_name].delete_many(query)
            summary[coll_name] = r.deleted_count
        except Exception as e:
            logger.warning("account_delete: could not clean %s: %r", coll_name, e)
            summary[coll_name] = -1

    await _del("user_sessions",   {"user_id": uid})
    await _del("surveys",         {"user_id": uid})
    await _del("quiz_attempts",   {"user_id": uid})
    await _del("prompt_usage",    {"user_id": uid})
    await _del("module_progress", {"user_id": uid})
    await _del("byok_keys",       {"user_id": uid})

    # Anonymise / drop the account row depending on remaining members.
    if account_id:
        try:
            remaining = await db.users.count_documents({
                "account_id": account_id,
                "user_id": {"$ne": uid},
            })
            if remaining == 0:
                await db.accounts.delete_one({"account_id": account_id})
                summary["accounts_deleted"] = 1
            else:
                await db.accounts.update_one(
                    {"account_id": account_id, "owner_user_id": uid},
                    {"$set": {"owner_user_id": None, "owner_email": None,
                              "anonymized_at": now}},
                )
                summary["accounts_deleted"] = 0
                summary["account_members_remaining"] = remaining
        except Exception as e:
            logger.warning("account_delete: account cleanup failed: %r", e)

    await _del("users", {"user_id": uid})

    # Compliance audit trail — no PII, just a hashed ID + timestamp.
    try:
        await db.deletion_audit.insert_one({
            "deleted_at": now,
            "user_id_hash": hashlib.sha256(uid.encode()).hexdigest(),
            "email_domain": (user.get("email") or "").split("@")[-1],
            "reason": (body or {}).get("reason", "user_request")[:200],
            "channel": (body or {}).get("channel", "app")[:20],
            "summary": summary,
        })
    except Exception as e:
        logger.warning("account_delete: could not write audit row: %r", e)

    logger.info("account_delete: completed uid=%s summary=%s", uid, summary)
    return {"ok": True, "summary": summary, "deleted_at": now.isoformat()}


@api.get("/account/delete/info")
async def account_delete_info():
    """Public policy endpoint used by /delete-account so retention
    wording lives in ONE place and the app + policy never drift."""
    return {
        "deleted_immediately": [
            "Your profile (name, email, avatar)",
            "All sign-in sessions (logs you out on every device)",
            "Every survey / module feedback you submitted",
            "Quiz attempts and prompt-usage history",
            "Any personal Gemini API key you saved (BYOK)",
        ],
        "retained_for_legal_reasons": [
            "Stripe payment records (transaction ID, amount, date) — 7 years, per tax + PCI rules. Your name and email on the invoice are replaced with 'DELETED_USER'.",
            "The account/plan row, if other pooled members are still using it. Otherwise it is deleted.",
            "A one-line audit entry (timestamp + hashed user ID + reason) so we can prove your deletion request was honoured. Contains no personal info.",
        ],
        "retention_period_days": 2555,
        "contact_email": "support@communitychangers.us",
        "processing_time": "Immediate. Data is removed in the same request that submits the deletion.",
    }



# ---------- routes: usage / quota ----------
@api.get("/usage/me", response_model=UsageOut)
async def usage_me(user=Depends(get_current_user)):
    snap = await snapshot(db, user["user_id"], user["account_id"])
    acct = await get_account(db, user["account_id"])
    return UsageOut(
        tier=snap.tier,
        daily_prompts_used=snap.daily_prompts_used,
        daily_prompts_cap=snap.daily_prompts_cap,
        daily_tokens_used=snap.daily_tokens_used,
        daily_tokens_cap=snap.daily_tokens_cap,
        monthly_prompts_used=snap.monthly_prompts_used,
        monthly_prompts_cap=snap.monthly_prompts_cap,
        monthly_tokens_used=snap.monthly_tokens_used,
        blocked=snap.blocked,
        reason=snap.reason,
        day_pass_expires_at=acct.get("day_pass_expires_at"),
    )


# ---------- routes: educational content ----------
@api.get("/content/topics")
async def list_topics():
    """Quiz tab picker. Reads the author's Q*.json files — one card per
    mini-quiz (currently 4 mini-quizzes per Q module). The OLD scraped-topic
    list is no longer used; quizzes come from authored JSON, not Gemini."""
    pool_topics = quiz_pool.list_quiz_topics()
    if pool_topics:
        return {"topics": [
            {
                "topic_id": t["topic_id"],
                "title": t["title"],
                "description": (
                    f"{t['module_title']} · Coming soon"
                    if t.get("coming_soon") else
                    f"{t['module_title']} · 5 questions"
                ),
                "source_count": t["question_count"],
                "institutions": [t["module_title"]],
                "coming_soon": t.get("coming_soon", False),
                "teaser": t.get("teaser", ""),
            }
            for t in pool_topics
        ]}
    # Fallback to the original scraped catalog if no Q files are present yet.
    return {"topics": [
        {
            "topic_id": t["topic_id"],
            "title": t["title"],
            "description": t["description"],
            "source_count": len(t["sources"]),
            "institutions": sorted({s["institution"] for s in t["sources"]}),
        }
        for t in TOPIC_CATALOG
    ]}


@api.get("/content/topic/{topic_id}")
async def topic_detail(topic_id: str, user=Depends(get_current_user)):
    """On-demand fetch (returns cached if present). Source content is
    short-form so we don't return huge payloads to the phone."""
    data = await scrape_topic(db, topic_id, force=False)
    if not data:
        raise HTTPException(404, "Unknown topic")
    # Strip the heavy text from the response — UI only needs citations.
    return {
        "topic_id": data["topic_id"],
        "title": data["title"],
        "description": data["description"],
        "sources": [
            {
                "url": s["url"],
                "institution": s["institution"],
                "title": s["title"],
                "status": s["status"],
            }
            for s in data["sources"]
        ],
    }


# ---------- LLM helpers ----------
def _extract_usage_tokens(chat: LlmChat, fallback_text: str) -> int:
    """Best-effort token extraction from the LiteLLM ModelResponse the
    chat object stashes after send_message(). We try a few field names
    because providers/SDK versions vary, and fall back to a conservative
    char-based estimate so quota tracking is never silently zero."""
    try:
        raw = getattr(chat, "_last_response", None) or getattr(chat, "last_response", None)
        if raw is not None:
            usage = getattr(raw, "usage", None)
            if usage is not None:
                total = getattr(usage, "total_tokens", None)
                if total:
                    return int(total)
                prompt = getattr(usage, "prompt_tokens", 0) or 0
                comp = getattr(usage, "completion_tokens", 0) or 0
                if prompt or comp:
                    return int(prompt) + int(comp)
    except Exception:
        pass
    # Fallback: ~4 chars per token; never returns 0 for non-empty output.
    return max(1, len(fallback_text) // 4)


async def _run_gemini(
    *, system: str, user_msg: str, api_key: Optional[str] = None
) -> tuple[str, int]:
    """Single place where we actually call Gemini. The caller is
    responsible for having already passed assert_can_call() (or, for
    free-tier BYOK, having validated that api_key is non-empty).

    If api_key is provided we use it instead of the platform key — that's
    how BYOK free tier works (zero platform cost). BYOK calls auto-fall-back
    to gemini-2.5-flash because gemini-2.5-pro is not in Google's free tier
    (free-tier-only personal keys would otherwise always 429).
    """
    key = api_key or EMERGENT_LLM_KEY
    if not key:
        raise HTTPException(500, "No LLM key available")
    model = "gemini-2.5-flash" if api_key else GEMINI_MODEL
    chat = (
        LlmChat(
            api_key=key,
            session_id=f"sess_{uuid.uuid4().hex[:10]}",
            system_message=system,
        )
        .with_model("gemini", model)
    )
    msg = UserMessage(text=user_msg)
    try:
        text = await chat.send_message(msg)
    except Exception as e:
        # Surface a clean, actionable error instead of a raw 500.
        err = str(e)
        if "RESOURCE_EXHAUSTED" in err or "quota" in err.lower() or "rate" in err.lower():
            raise HTTPException(
                429,
                "Gemini rate limit hit. Personal (free-tier) keys only support gemini-2.5-flash with low rate limits — wait a minute and retry, or enable billing in Google AI Studio.",
            )
        if "API key not valid" in err or "API_KEY_INVALID" in err:
            raise HTTPException(
                401,
                "That Gemini API key was rejected by Google. Double-check it at https://aistudio.google.com/app/apikey.",
            )
        raise HTTPException(502, f"Gemini call failed: {err[:300]}")
    # Pull usage out of the chat object's last response if available.
    tokens = _extract_usage_tokens(chat, (text or "") + system + user_msg)
    return text or "", tokens


# ---------- routes: quiz ----------
QUIZ_SYSTEM_PROMPT = (
    "You are an expert exam author for an EdTech app. "
    "Generate factual, single-answer multiple-choice questions strictly grounded in the "
    "provided source excerpts. Never invent facts that are not supported by the sources. "
    "Return ONLY valid JSON — no markdown fences, no commentary."
)


def _parse_quiz_json(text: str) -> list[dict]:
    """The model sometimes wraps JSON in ```json fences. Strip them
    and try to parse. Raises HTTPException on truly broken output."""
    cleaned = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.DOTALL | re.IGNORECASE)
    if fence:
        cleaned = fence.group(1).strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # Last resort: find the first {...} block.
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not m:
            raise HTTPException(502, "Quiz generator returned invalid JSON")
        data = json.loads(m.group(0))
    questions = data.get("questions") or data.get("quiz") or data
    if not isinstance(questions, list) or len(questions) == 0:
        raise HTTPException(502, "Quiz generator returned no questions")
    return questions


@api.post("/quiz/generate")
async def quiz_generate(body: QuizGenerateIn, user=Depends(get_current_user)):
    """Serve a 5-question Bloom-balanced quiz from the authored JSON pool.
    Zero AI calls. Students can take unlimited quizzes — the daily prompt
    budget is reserved exclusively for the Studio chat."""
    quiz_data = quiz_pool.build_quiz(body.topic_id)
    if quiz_data:
        # Persist correct answers server-side so they can't be read from the
        # client. The submit endpoint will look them up by quiz_id.
        quiz_id = f"quiz_{uuid.uuid4().hex[:10]}"
        questions_storage = []
        for q, correct in zip(quiz_data["questions"], quiz_data["_correct_indexes"]):
            questions_storage.append({
                **q,
                "correct_index": correct,
            })
        await db.quizzes.insert_one({
            "quiz_id": quiz_id,
            "user_id": user["user_id"],
            "account_id": user["account_id"],
            "topic_id": body.topic_id,
            "topic_title": quiz_data["topic_title"],
            "questions": questions_storage,
            "submitted": False,
            "created_at": datetime.now(timezone.utc),
        })
        return {
            "quiz_id": quiz_id,
            "topic_id": body.topic_id,
            "topic_title": quiz_data["topic_title"],
            "questions": [
                {"question": q["question"], "options": q["options"], "source": q["source"]}
                for q in quiz_data["questions"]
            ],
            "all_sources": [
                {"url": "", "institution": quiz_data.get("module_title", ""),
                 "title": quiz_data.get("source_lesson", "")},
            ],
            "tokens_charged": 0,
        }
    # Fallback path: legacy Gemini-generated 10-question quiz when no Q file
    # exists for the topic_id. Counts against quota.
    try:
        await assert_can_call(db, user["user_id"], user["account_id"])
    except ValueError as e:
        return JSONResponse({"error": "quota_exceeded", "message": str(e)}, status_code=429)
    topic = get_topic(body.topic_id)
    if not topic:
        raise HTTPException(404, "Unknown topic")
    return JSONResponse({"error": "quiz_unavailable",
                         "message": "Quiz pool not yet authored for this topic."}, status_code=404)


@api.post("/quiz/generate-legacy")
async def quiz_generate_legacy(body: QuizGenerateIn, user=Depends(get_current_user)):
    """Generate exactly 10 MCQs from the scraped sources for the topic.
    Quota is checked BEFORE the LLM call and recorded AFTER, using the
    real usage returned by the model."""
    # Quota path: free tier now gets 5 platform-paid prompts/day so learners
    # in low-income contexts can use the app with zero setup. BYOK is still
    # honored as an opt-in (power users who provide their own key skip the
    # platform quota entirely).
    using_byok = bool(body.byok_key and body.byok_key.strip())
    if not using_byok:
        try:
            await assert_can_call(db, user["user_id"], user["account_id"])
        except ValueError as e:
            return JSONResponse(
                {"error": "quota_exceeded", "message": str(e)}, status_code=429
            )

    topic = get_topic(body.topic_id)
    if not topic:
        raise HTTPException(404, "Unknown topic")
    scraped = await scrape_topic(db, body.topic_id, force=False)
    sources_block = "\n\n".join(
        f"[Source #{i+1}] {s['institution']} — {s['title']}\nURL: {s['url']}\nExcerpt: {s['text'][:1800]}"
        for i, s in enumerate(scraped["sources"])
        if s.get("text")
    ) or "(No source excerpts available — base questions on the topic's general scope.)"

    user_prompt = f"""Topic: {topic['title']}
Description: {topic['description']}

You have these source excerpts from premier educational institutions:
{sources_block}

Generate EXACTLY 10 multiple-choice questions grounded in these sources.

Return JSON of the form:
{{
  "questions": [
    {{
      "question": "Question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_index": 0,
      "explanation": "Short explanation grounded in the source.",
      "source_index": 1
    }}
  ]
}}

Rules:
- Exactly 10 items.
- Exactly 4 options per item.
- correct_index is 0-3.
- source_index is 1-based and refers to which [Source #N] block supports the question.
- Do not include markdown fences.
"""
    text, tokens = await _run_gemini(
        system=QUIZ_SYSTEM_PROMPT,
        user_msg=user_prompt,
        api_key=(body.byok_key.strip() if using_byok else None),
    )
    # Only charge the platform quota if we actually used the platform key.
    if not using_byok:
        await record_usage(
            db,
            user_id=user["user_id"],
            account_id=user["account_id"],
            tokens=tokens,
            kind="quiz",
        )
    raw_questions = _parse_quiz_json(text)
    # Force exactly 10 (truncate / pad-fail).
    if len(raw_questions) < 10:
        raise HTTPException(502, f"Quiz generator returned {len(raw_questions)} items (need 10)")
    raw_questions = raw_questions[:10]

    # Attach citation to each question.
    source_map = scraped["sources"]
    questions_out = []
    for q in raw_questions:
        idx = (q.get("source_index") or 1) - 1
        idx = max(0, min(idx, len(source_map) - 1)) if source_map else 0
        src = source_map[idx] if source_map else None
        questions_out.append({
            "question": q.get("question", ""),
            "options": q.get("options", [])[:4],
            "correct_index": int(q.get("correct_index", 0)),
            "explanation": q.get("explanation", ""),
            "source": (
                {"url": src["url"], "institution": src["institution"], "title": src["title"]}
                if src else None
            ),
        })

    quiz_id = f"quiz_{uuid.uuid4().hex[:10]}"
    await db.quizzes.insert_one({
        "quiz_id": quiz_id,
        "user_id": user["user_id"],
        "account_id": user["account_id"],
        "topic_id": body.topic_id,
        "topic_title": topic["title"],
        "questions": questions_out,
        "submitted": False,
        "created_at": datetime.now(timezone.utc),
    })
    return {
        "quiz_id": quiz_id,
        "topic_id": body.topic_id,
        "topic_title": topic["title"],
        # Send the questions BUT strip the correct answer so it can't be
        # read from devtools before the learner submits.
        "questions": [
            {
                "question": q["question"],
                "options": q["options"],
                "source": q["source"],
            }
            for q in questions_out
        ],
        "all_sources": [
            {"url": s["url"], "institution": s["institution"], "title": s["title"]}
            for s in source_map
        ],
        "tokens_charged": tokens,
    }


@api.post("/quiz/submit")
async def quiz_submit(body: QuizSubmitIn, user=Depends(get_current_user)):
    quiz = await db.quizzes.find_one(
        {"quiz_id": body.quiz_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    if len(body.answers) != len(quiz["questions"]):
        raise HTTPException(400, "Answer length mismatch")
    score = 0
    detail = []
    for i, q in enumerate(quiz["questions"]):
        correct = int(q["correct_index"])
        chosen = int(body.answers[i]) if i < len(body.answers) else -1
        ok = chosen == correct
        if ok:
            score += 1
        detail.append({
            "question": q["question"],
            "options": q["options"],
            "correct_index": correct,
            "chosen_index": chosen,
            "is_correct": ok,
            "explanation": q.get("explanation", ""),
            "source": q.get("source"),
        })
    await db.quizzes.update_one(
        {"quiz_id": body.quiz_id},
        {"$set": {
            "submitted": True,
            "submitted_at": datetime.now(timezone.utc),
            "answers": body.answers,
            "score": score,
        }},
    )
    return {"score": score, "total": len(quiz["questions"]), "results": detail}


@api.get("/quiz/history")
async def quiz_history(user=Depends(get_current_user)):
    rows = await db.quizzes.find(
        {"user_id": user["user_id"], "submitted": True},
        {"_id": 0, "questions": 0, "answers": 0},
    ).sort("submitted_at", -1).to_list(50)
    return {"quizzes": rows}


# ---------- routes: curriculum (modules + sub-modules + frameworks) ----------
@api.get("/modules")
async def list_modules():
    """Lightweight catalog for the Home grid + modules list. Heavy fields
    (lesson body, build activities, framework templates) are returned only
    by the detail endpoints to keep the list cheap on slow networks."""
    return {
        "modules": [
            {
                "module_id": m["module_id"],
                "title": m["title"],
                "persona": m["persona"],
                "tagline": m["tagline"],
                "color": m["color"],
                "submodule_count": len(m["submodules"]),
            }
            for m in MODULES
        ],
        "framework_count": len(PROMPT_FRAMEWORKS),
    }


@api.get("/modules/frameworks")
async def list_frameworks():
    """Prompting frameworks (RTF, CO-STAR, ERA, RISE, CREATE, RSTI) the
    Studio uses to power its 'Insert template' picker."""
    return {"frameworks": PROMPT_FRAMEWORKS}


@api.get("/modules/{module_id}")
async def module_detail(module_id: str):
    m = find_module(module_id)
    if not m:
        raise HTTPException(404, "Unknown module")
    return {
        "module_id": m["module_id"],
        "title": m["title"],
        "persona": m["persona"],
        "tagline": m["tagline"],
        "color": m["color"],
        "tabs": m.get("tabs") or [],
        "survey_form_url": _survey_form_url(m["module_id"]),
        "submodules": [
            {
                "id": s["id"],
                "title": s["title"],
                "objective": s["objective"],
                "difficulty": s.get("difficulty", ""),
                "has_build_activity": "build_activity" in s,
                "has_framework": "framework" in s,
            }
            for s in m["submodules"]
        ],
    }


# ---------- routes: Income & Asset Module Bank (18 microenterprise modules) ----------
# Strictly served from income_modules.json. Zero AI tokens consumed.

@api.get("/income/modules")
async def list_income_modules():
    return income_list_summary()


@api.get("/income/modules/{module_id}")
async def income_module_detail_route(module_id: str):
    m = income_module_detail(module_id)
    if not m:
        raise HTTPException(404, "Unknown income module")
    slug = m.get("slug") or str(m.get("id"))
    out = dict(m)
    out["survey_form_url"] = _survey_form_url(f"income__{slug}")
    return out


# ---------- routes: Programme overview (curriculum, workflow, references) ----------

@api.get("/programme")
async def programme_route():
    data = programme_overview()
    if not data:
        raise HTTPException(404, "Programme content not loaded")
    return data


# ---------- routes: Open-source translator modules (8 languages, verified) ----------

@api.get("/translator")
async def list_translator_modules():
    return translator_list_summary()


@api.get("/translator/{key}")
async def translator_module_route(key: str):
    m = translator_module_detail(key)
    if not m:
        raise HTTPException(404, "Unknown translator module")
    out = dict(m)
    out["survey_form_url"] = _survey_form_url(f"translator__{key}")
    return out


# ---------- routes: Mini dictionary / glossary ----------

@api.get("/glossary")
async def glossary_route():
    data = glossary_payload()
    if not data:
        raise HTTPException(404, "Glossary not loaded")
    return data


# ---------- routes: Reading List & Open Online Courses ----------

@api.get("/resources")
async def resources_route():
    data = resources_payload()
    if not data:
        raise HTTPException(404, "Resources not loaded")
    return data


# ---------- routes: external-link redirect (bypasses cross-origin
# isolation in the Emergent preview so popups can reach sites that
# would otherwise be blocked with ERR_BLOCKED_BY_RESPONSE) ----------

_GO_ALLOWED_HOSTS = {
    "huggingface.co", "github.com", "raw.githubusercontent.com",
    "arxiv.org", "aclanthology.org", "dl.acm.org", "plato.stanford.edu",
    "en.wikipedia.org", "developer.mozilla.org", "opensource.org",
    "csrc.nist.gov", "openai.com", "help.openai.com",
    "automatetheboringstuff.com", "open.umn.edu", "javascript.info",
    "www.deeplearningbook.org", "deeplearningbook.org",
    "oli.cmu.edu", "ocw.mit.edu", "www.edx.org", "edx.org",
    "www.askpython.com", "askpython.com", "www.python.org", "python.org",
    "codefinity.com", "alison.com", "coddy.tech",
    "docs.google.com", "forms.gle",
    "huggingface.com",  # safety alias
}


def _host_of(url: str) -> str:
    from urllib.parse import urlparse
    try:
        return (urlparse(url).hostname or "").lower()
    except Exception:
        return ""


@api.get("/go")
async def go_redirect(url: str):
    """302 to the requested URL after host allowlist check. This frees
    Expo Web popups from cross-origin-opener restrictions (the preview
    environment is cross-origin-isolated, which caused huggingface.co
    and other external targets to fail with ERR_BLOCKED_BY_RESPONSE)."""
    if not url or not url.startswith(("http://", "https://")):
        raise HTTPException(400, "Invalid url")
    host = _host_of(url)
    # Allow the exact host or any *.host that ends with an allowed host.
    if not any(host == h or host.endswith("." + h) for h in _GO_ALLOWED_HOSTS):
        raise HTTPException(403, f"Host not on allowlist: {host}")
    return RedirectResponse(url=url, status_code=302)


# ---------- routes: survey form registry ----------
# The user is providing Google Forms for each post-module survey. We
# need a stable, browsable list of every survey's title + id so they
# can map each Form URL → module. Form URLs land in `survey_forms.json`
# (one per module), and learners see "Open Survey Form" once a URL is
# populated. While URLs are blank, the native MongoDB survey at
# `/modules/{id}/survey` remains the default.

def _load_survey_form_registry() -> dict:
    p = Path(__file__).parent / "curriculum_data" / "survey_forms.json"
    if not p.exists():
        return {"surveys": []}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {"surveys": []}


def _survey_form_url(module_id: str) -> str | None:
    reg = _load_survey_form_registry()
    for s in reg.get("surveys", []) or []:
        if isinstance(s, dict) and s.get("module_id") == module_id:
            return s.get("form_url") or None
    return None


@api.get("/forms")
async def list_survey_forms():
    """Catalog of every surveyable unit, including its canonical title
    and the matching Google Form URL (when configured)."""
    reg = _load_survey_form_registry()
    by_id = {s.get("module_id"): s for s in reg.get("surveys", []) if isinstance(s, dict)}

    items = []
    # Learning modules (the 11 hand-authored ones).
    for m in MODULES:
        mid = m.get("module_id")
        items.append({
            "kind": "learning",
            "module_id": mid,
            "title": m.get("title", ""),
            "survey_title": f"Code Without Limits — {m.get('title','')} survey",
            "form_url": (by_id.get(mid) or {}).get("form_url") or None,
            "native_survey_path": f"/modules/{mid}/survey",
        })
    # Income & Asset modules (17 distinct + #18 duplicate).
    inc = income_list_summary()
    for m in inc.get("modules", []):
        slug = m.get("slug") or str(m.get("id"))
        sid = f"income__{slug}"
        items.append({
            "kind": "income",
            "module_id": sid,
            "title": m.get("title", ""),
            "survey_title": f"Code Without Limits — Income Module {m.get('id')}: {m.get('title','')} survey",
            "form_url": (by_id.get(sid) or {}).get("form_url") or None,
            "native_survey_path": f"/income/{m.get('id')}",
        })
    # Translator modules.
    tr = translator_list_summary()
    for m in tr.get("modules", []) or []:
        key = m.get("key", "")
        sid = f"translator__{key}"
        items.append({
            "kind": "translator",
            "module_id": sid,
            "title": m.get("language", ""),
            "survey_title": f"Code Without Limits — Translator: {m.get('language','')} survey",
            "form_url": (by_id.get(sid) or {}).get("form_url") or None,
            "native_survey_path": f"/translator/{key}",
        })
    # Programme-level surveys.
    for sid, title in [
        ("programme__overall", "Overall Programme Experience"),
        ("programme__pilot_feedback", "Pilot App — Bug Reports & Suggestions"),
    ]:
        items.append({
            "kind": "programme",
            "module_id": sid,
            "title": title,
            "survey_title": f"Code Without Limits — {title}",
            "form_url": (by_id.get(sid) or {}).get("form_url") or None,
            "native_survey_path": None,
        })

    return {
        "title": "Survey Forms registry",
        "instructions": (
            "Each row is one survey. The 'survey_title' is the exact name to use "
            "in Google Forms so the team can match responses to the right "
            "module. When a 'form_url' is filled in (in survey_forms.json on the "
            "backend), the app will show 'Open Survey Form' on that module's "
            "page. Until then, the native MongoDB survey remains the default."
        ),
        "count": len(items),
        "items": items,
    }


@api.get("/modules/{module_id}/{sub_id}")
async def submodule_detail(module_id: str, sub_id: str):
    m, s = find_submodule(module_id, sub_id)
    if not m or not s:
        raise HTTPException(404, "Unknown sub-module")
    detail = attach_citations(s)
    detail["module_title"] = m["title"]
    detail["module_id"] = m["module_id"]
    return detail


# ---------- routes: post-module surveys ----------
# In-app survey replaces Google Forms so low-bandwidth learners can submit
# even when offline-then-sync. Stored in MongoDB; one row per submission.

@api.post("/surveys/submit")
async def submit_survey(body: SurveyIn, user=Depends(get_current_user)):
    """Persist one survey response. Idempotent on (user_id, module_id) —
    a re-submission overwrites so we never double-count. Also mirrors
    the response into the master Google Form (fire-and-forget) so the
    feedback lands in Google Sheets in real time."""
    now = datetime.now(timezone.utc)
    doc = {
        "user_id": user["user_id"],
        "user_email": user["email"],
        "account_id": user["account_id"],
        "module_id": body.module_id,
        "module_title": body.module_title,
        "clarity": max(1, min(5, body.clarity)),
        "pace": max(1, min(5, body.pace)),
        "relevance": max(1, min(5, body.relevance)),
        "confidence": max(1, min(5, body.confidence)),
        "worked_well": body.worked_well[:2000],
        "did_not_work": body.did_not_work[:2000],
        "would_change": body.would_change[:2000],
        "submitted_at": now,
    }
    await db.surveys.update_one(
        {"user_id": user["user_id"], "module_id": body.module_id},
        {"$set": doc},
        upsert=True,
    )
    # Mirror to Google Forms / Sheets without blocking the response.
    asyncio.create_task(relay_to_google_form(user=user, doc=doc))
    return {"ok": True}


@api.get("/surveys/mine")
async def my_surveys(user=Depends(get_current_user)):
    """List the modules this learner has already surveyed (so the UI can
    show 'You already shared feedback' instead of asking twice)."""
    rows = await db.surveys.find(
        {"user_id": user["user_id"]},
        {"_id": 0, "module_id": 1, "submitted_at": 1},
    ).to_list(50)
    return {"submitted": [r["module_id"] for r in rows]}


# ---------- routes: team seats (Monthly tier only) ----------
# Account owners on the Monthly plan can invite up to 2 teammates so the
# 250-prompt-per-month pool is genuinely shared. Anyone joining a team
# has their personal account_id reassigned to the owner's account, so
# their future calls increment the same monthly_usage row.

INVITE_TTL_DAYS = 14


@api.get("/account/seats")
async def list_seats(user=Depends(get_current_user)):
    """List everyone currently seated on this account + any pending invites.
    Anyone on the account can read this so they know who else is on the team."""
    seats = await db.users.find(
        {"account_id": user["account_id"]},
        {"_id": 0, "user_id": 1, "email": 1, "name": 1, "picture": 1, "is_account_owner": 1},
    ).to_list(10)
    invites = await db.account_invites.find(
        {"account_id": user["account_id"], "used_by": None,
         "expires_at": {"$gt": datetime.now(timezone.utc)}},
        {"_id": 0, "token": 1, "created_at": 1, "expires_at": 1, "label": 1},
    ).to_list(10)
    acct = await get_account(db, user["account_id"])
    return {
        "tier": acct.get("tier", "free"),
        "seats_used": len(seats),
        "seats_allowed": acct.get("seats_allowed", 1),
        "is_owner": bool(user.get("is_account_owner")),
        "seats": seats,
        "invites": invites,
    }


class InviteCreateIn(BaseModel):
    label: Optional[str] = None  # optional note: "Maria's email", etc.


@api.post("/account/invite")
async def create_invite(body: InviteCreateIn, user=Depends(get_current_user)):
    """Owner-only. Generates a one-time invite token. The owner shares the
    link with their teammate; the teammate signs in and accepts. We refuse
    when the account is already full so the cap can never be exceeded."""
    if not user.get("is_account_owner"):
        raise HTTPException(403, "Only the account owner can invite teammates.")
    acct = await get_account(db, user["account_id"])
    if acct.get("tier") != "monthly":
        raise HTTPException(
            400,
            "Seat invites are available on the Monthly Cooperative plan ($10/mo, up to 3 users).",
        )
    seats = await db.users.count_documents({"account_id": user["account_id"]})
    pending = await db.account_invites.count_documents(
        {"account_id": user["account_id"], "used_by": None,
         "expires_at": {"$gt": datetime.now(timezone.utc)}}
    )
    allowed = acct.get("seats_allowed", 3)
    if seats + pending >= allowed:
        raise HTTPException(400, f"Your team is full ({allowed} of {allowed} seats).")
    token = uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc)
    await db.account_invites.insert_one({
        "token": token,
        "account_id": user["account_id"],
        "created_by": user["user_id"],
        "label": (body.label or "").strip()[:80] or None,
        "created_at": now,
        "expires_at": now + timedelta(days=INVITE_TTL_DAYS),
        "used_by": None,
        "used_at": None,
    })
    return {
        "token": token,
        # Owner shares this link; recipient must sign in then visit it.
        "join_url": f"{FRONTEND_URL.rstrip('/')}/account/join?token={token}",
        "expires_at": now + timedelta(days=INVITE_TTL_DAYS),
    }


@api.get("/account/invite/{token}")
async def get_invite(token: str):
    """Public — used by the join screen to show 'You're being invited to X's
    Monthly team' before the recipient confirms."""
    inv = await db.account_invites.find_one({"token": token}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invite not found")
    exp = inv["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if inv.get("used_by"):
        return {"status": "used"}
    if exp < datetime.now(timezone.utc):
        return {"status": "expired"}
    owner = await db.users.find_one(
        {"user_id": inv["created_by"]}, {"_id": 0, "name": 1, "email": 1}
    )
    return {
        "status": "valid",
        "owner_name": (owner or {}).get("name") or (owner or {}).get("email"),
        "label": inv.get("label"),
    }


class InviteAcceptIn(BaseModel):
    token: str


@api.post("/account/invite/accept")
async def accept_invite(body: InviteAcceptIn, user=Depends(get_current_user)):
    """Authenticated. Moves the current user's account_id over to the inviter's
    account. We re-check the seat cap inside this transaction so a race
    between two acceptances can never put us over 3."""
    inv = await db.account_invites.find_one({"token": body.token}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invite not found")
    if inv.get("used_by"):
        raise HTTPException(400, "This invite has already been used.")
    exp = inv["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(400, "This invite has expired.")
    if inv["account_id"] == user["account_id"]:
        raise HTTPException(400, "You're already on this team.")

    acct = await get_account(db, inv["account_id"])
    seats = await db.users.count_documents({"account_id": inv["account_id"]})
    if seats >= acct.get("seats_allowed", 3):
        raise HTTPException(400, "That team is already full.")

    now = datetime.now(timezone.utc)
    old_account_id = user["account_id"]
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "account_id": inv["account_id"],
            "is_account_owner": False,
            "updated_at": now,
        }},
    )
    await db.account_invites.update_one(
        {"token": body.token},
        {"$set": {"used_by": user["user_id"], "used_at": now}},
    )
    # Clean up the orphaned personal account if it has no users left.
    remaining = await db.users.count_documents({"account_id": old_account_id})
    if remaining == 0:
        await db.accounts.delete_one({"account_id": old_account_id})
    return {"ok": True, "account_id": inv["account_id"]}


@api.delete("/account/invite/{token}")
async def revoke_invite(token: str, user=Depends(get_current_user)):
    if not user.get("is_account_owner"):
        raise HTTPException(403, "Only the account owner can revoke invites.")
    res = await db.account_invites.delete_one(
        {"token": token, "account_id": user["account_id"], "used_by": None}
    )
    if res.deleted_count == 0:
        raise HTTPException(404, "Invite not found or already used.")
    return {"ok": True}


@api.delete("/account/seats/{seat_user_id}")
async def remove_seat(seat_user_id: str, user=Depends(get_current_user)):
    """Owner removes a teammate. The teammate is moved back to a fresh
    personal account (free tier) so their data isn't lost."""
    if not user.get("is_account_owner"):
        raise HTTPException(403, "Only the account owner can remove teammates.")
    if seat_user_id == user["user_id"]:
        raise HTTPException(400, "Owners cannot remove themselves.")
    seat = await db.users.find_one(
        {"user_id": seat_user_id, "account_id": user["account_id"]}, {"_id": 0}
    )
    if not seat:
        raise HTTPException(404, "Seat not found on your team.")
    now = datetime.now(timezone.utc)
    new_account_id = f"acct_{uuid.uuid4().hex[:12]}"
    await db.accounts.insert_one({
        "account_id": new_account_id,
        "tier": "free",
        "day_pass_expires_at": None,
        "subscription_status": None,
        "seats_allowed": 1,
        "owner_user_id": seat_user_id,
        "created_at": now,
    })
    await db.users.update_one(
        {"user_id": seat_user_id},
        {"$set": {"account_id": new_account_id, "is_account_owner": True, "updated_at": now}},
    )
    return {"ok": True}


# ---------- routes: agent chat ----------
AGENT_SYSTEM = {
    "OER AI Tutor Agent": "You are an OER AI Tutor — teach AI concepts in plain language with short, mobile-friendly examples.",
    "Prompt Efficiency Agent": "You are a low-token prompt coach. Rewrite the learner's request as one compact, reusable prompt.",
    "Corpus Steward Agent": "You help compile culturally accurate language corpora with consent and human review.",
    "Bloom Quiz Agent": "You generate Knowledge/Comprehension/Application level questions.",
    "Translation & Accessibility Agent": "You produce accessible, plain-language, multilingual content.",
    "Microenterprise Coach Agent": "You coach micro-entrepreneurs on turning AI assets into local income.",
    "Safety & Human Verification Agent": "You flag privacy, safety, and cultural risks and require human review.",
    "Routing Orchestrator Agent": "You suggest the right module, agent, or offline activity based on the learner's context.",
}


@api.post("/ai/chat")
async def ai_chat(body: ChatIn, user=Depends(get_current_user)):
    using_byok = bool(body.byok_key and body.byok_key.strip())
    if not using_byok:
        try:
            await assert_can_call(db, user["user_id"], user["account_id"])
        except ValueError as e:
            return JSONResponse(
                {"error": "quota_exceeded", "message": str(e)}, status_code=429
            )

    system = AGENT_SYSTEM.get(body.agent or "", AGENT_SYSTEM["OER AI Tutor Agent"])
    text, tokens = await _run_gemini(
        system=system,
        user_msg=body.message,
        api_key=(body.byok_key.strip() if using_byok else None),
    )
    if not using_byok:
        await record_usage(
            db,
            user_id=user["user_id"],
            account_id=user["account_id"],
            tokens=tokens,
            kind="chat",
        )
    return {
        "reply": text,
        "tokens_charged": 0 if using_byok else tokens,
        "agent": body.agent,
        "byok": using_byok,
    }


# ---------- routes: billing ----------
@api.post("/billing/checkout")
async def billing_checkout(body: CheckoutIn, request: Request, user=Depends(get_current_user)):
    if not STRIPE_API_KEY:
        raise HTTPException(500, "Stripe is not configured")
    if body.plan not in ("day_pass", "monthly"):
        raise HTTPException(400, "Unknown plan")

    base = FRONTEND_URL.rstrip("/")
    try:
        if body.plan == "day_pass":
            session = stripe.checkout.Session.create(
                mode="payment",
                payment_method_types=["card"],
                line_items=[{
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": 300,
                        "product_data": {
                            "name": "Code Without Limits — Day Pass",
                            "description": "24-hour AI access: up to 6 prompts or 450,000 tokens.",
                        },
                    },
                    "quantity": 1,
                }],
                success_url=f"{base}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{base}/billing/cancel",
                customer_email=user["email"],
                metadata={
                    "user_id": user["user_id"],
                    "account_id": user["account_id"],
                    "plan": "day_pass",
                },
            )
        else:
            session = stripe.checkout.Session.create(
                mode="subscription",
                payment_method_types=["card"],
                line_items=[{
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": 1000,
                        "recurring": {"interval": "month"},
                        "product_data": {
                            "name": "Code Without Limits — Monthly Cooperative",
                            "description": "250 prompts / month, pooled across up to 3 users.",
                        },
                    },
                    "quantity": 1,
                }],
                success_url=f"{base}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{base}/billing/cancel",
                customer_email=user["email"],
                metadata={
                    "user_id": user["user_id"],
                    "account_id": user["account_id"],
                    "plan": "monthly",
                },
            )
    except Exception as e:
        logger.exception("Stripe checkout failed")
        raise HTTPException(502, f"Stripe error: {e}")

    # Persist so we can reconcile on the success page even if webhooks
    # are slow.
    await db.payments.insert_one({
        "checkout_session_id": session.id,
        "user_id": user["user_id"],
        "account_id": user["account_id"],
        "plan": body.plan,
        "status": "pending",
        "created_at": datetime.now(timezone.utc),
    })
    return {"url": session.url, "session_id": session.id}


async def _apply_plan(account_id: str, plan: str, *, sub_id: Optional[str] = None,
                      customer_id: Optional[str] = None, status: Optional[str] = None) -> None:
    """Idempotent tier flip used by both the webhook handler and the
    /billing/verify fallback. Keeps the state machine in one place."""
    now = datetime.now(timezone.utc)
    update: dict = {"updated_at": now}
    if plan == "day_pass":
        update.update({
            "tier": "day_pass",
            "day_pass_expires_at": now + timedelta(days=1),
        })
    elif plan == "monthly":
        update.update({
            "tier": "monthly",
            "subscription_status": status or "active",
            "seats_allowed": 3,
        })
        if sub_id:
            update["stripe_subscription_id"] = sub_id
        if customer_id:
            update["stripe_customer_id"] = customer_id
    await db.accounts.update_one({"account_id": account_id}, {"$set": update}, upsert=True)


@app.post("/api/billing/webhook")
async def billing_webhook(request: Request):
    """Stripe webhook. Registered outside the api router so we can
    consume the raw body before any JSON parsing happens."""
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        if STRIPE_WEBHOOK_SECRET:
            event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
        else:
            event = json.loads(payload.decode("utf-8"))  # dev/no-secret fallback
    except Exception as e:
        logger.warning("Stripe webhook signature error: %s", e)
        raise HTTPException(400, "Bad signature")

    # Dedupe replays.
    event_id = event.get("id") if isinstance(event, dict) else event["id"]
    if await db.stripe_events.find_one({"event_id": event_id}):
        return {"ok": True, "duplicate": True}
    await db.stripe_events.insert_one(
        {"event_id": event_id, "received_at": datetime.now(timezone.utc)}
    )

    etype = event["type"] if isinstance(event, dict) else event.type
    obj = (event["data"]["object"] if isinstance(event, dict)
           else event.data.object)

    if etype == "checkout.session.completed":
        md = obj.get("metadata") or {}
        account_id = md.get("account_id")
        plan = md.get("plan")
        if account_id and plan:
            await _apply_plan(
                account_id,
                plan,
                sub_id=obj.get("subscription"),
                customer_id=obj.get("customer"),
                status="active",
            )
            await db.payments.update_one(
                {"checkout_session_id": obj.get("id")},
                {"$set": {"status": "paid", "paid_at": datetime.now(timezone.utc)}},
            )
    elif etype in ("invoice.paid", "customer.subscription.updated"):
        customer_id = obj.get("customer")
        if customer_id:
            await db.accounts.update_one(
                {"stripe_customer_id": customer_id},
                {"$set": {
                    "subscription_status": obj.get("status", "active"),
                    "updated_at": datetime.now(timezone.utc),
                }},
            )
    elif etype in ("invoice.payment_failed", "customer.subscription.deleted"):
        customer_id = obj.get("customer")
        if customer_id:
            await db.accounts.update_one(
                {"stripe_customer_id": customer_id},
                {"$set": {
                    "tier": "free",
                    "subscription_status": obj.get("status", "canceled"),
                    "updated_at": datetime.now(timezone.utc),
                }},
            )
    return {"ok": True}


@api.get("/billing/verify")
async def billing_verify(session_id: str, user=Depends(get_current_user)):
    """Manual reconcile path used by the success screen. Looks up the
    Stripe checkout session and applies the plan if it's paid but the
    webhook hasn't landed yet."""
    if not STRIPE_API_KEY:
        raise HTTPException(500, "Stripe is not configured")
    try:
        sess = stripe.checkout.Session.retrieve(session_id)
    except Exception as e:
        raise HTTPException(502, f"Stripe: {e}")
    paid = sess.payment_status == "paid" or sess.status == "complete"
    md = sess.metadata or {}
    if paid and md.get("account_id") == user["account_id"]:
        await _apply_plan(
            user["account_id"],
            md.get("plan", "day_pass"),
            sub_id=sess.subscription,
            customer_id=sess.customer,
            status="active",
        )
    return {"paid": bool(paid), "plan": md.get("plan")}


# ---------- agents (static metadata for the UI) ----------
@api.get("/agents")
async def list_agents():
    return {"agents": [
        {"name": name, "system": system} for name, system in AGENT_SYSTEM.items()
    ]}


# ---------- mount + startup ----------
app.include_router(api)


# Root + healthz endpoints (no /api prefix) so Kubernetes readiness /
# liveness probes succeed regardless of where they hit. Without these,
# the production probe was hitting `/` and getting a 404 every cycle,
# which caused the deployment supervisor to mark the pod unhealthy.
@app.get("/")
async def root_ok():
    return {"status": "ok", "service": "Code Without Limits API"}


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    # Indexes that matter for hot paths / TTL session cleanup.
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.accounts.create_index("account_id", unique=True)
    await db.accounts.create_index("stripe_customer_id")
    await db.account_invites.create_index("token", unique=True)
    await db.account_invites.create_index("account_id")
    await db.daily_usage.create_index([("user_id", 1), ("date", 1)], unique=True)
    await db.monthly_usage.create_index([("account_id", 1), ("month", 1)], unique=True)
    await db.scraped_content.create_index("url", unique=True)
    await db.quizzes.create_index("quiz_id", unique=True)
    await db.stripe_events.create_index("event_id", unique=True)
    # Pre-seed scraping is OFF by default in production. It was useful when
    # quizzes were generated live; the new quiz pool reads from local JSON
    # files (see quiz_pool.py), so the scraped cache is dead weight at boot.
    # External HTTPS calls during startup also risk tripping readiness
    # probes if egress is rate-limited. Set ENABLE_PRESEED=true to re-enable.
    if os.environ.get("ENABLE_PRESEED", "").lower() in ("1", "true", "yes"):
        asyncio.create_task(preseed_all(db))
        logger.info("Pre-seed task scheduled (ENABLE_PRESEED is on)")
    logger.info("Code Without Limits API ready")


@app.on_event("shutdown")
async def on_shutdown():
    mongo.close()

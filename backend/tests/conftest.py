"""Shared pytest fixtures for backend tests."""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ["FRONTEND_URL"]
BASE_URL = BASE_URL.rstrip("/")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _seed_user(db, tier: str, *, daily_prompts=0, daily_tokens=0, monthly_tokens=0,
               day_pass_expired=False):
    """Seed a fresh user+account+session and return (user, account_id, token)."""
    uid = f"user_TEST_{uuid.uuid4().hex[:10]}"
    acct = f"acct_TEST_{uuid.uuid4().hex[:10]}"
    email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
    token = f"sess_TEST_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)

    db.users.insert_one({
        "user_id": uid, "email": email, "name": "Test User",
        "account_id": acct, "is_account_owner": True,
        "created_at": now, "updated_at": now,
    })
    acct_doc = {
        "account_id": acct,
        "tier": tier,
        "day_pass_expires_at": (now - timedelta(hours=1)) if day_pass_expired
            else (now + timedelta(hours=23)) if tier == "day_pass" else None,
        "subscription_status": "active" if tier == "monthly" else None,
        "seats_allowed": 3 if tier == "monthly" else 1,
        "owner_user_id": uid,
        "created_at": now,
    }
    db.accounts.insert_one(acct_doc)
    db.user_sessions.insert_one({
        "session_token": token, "user_id": uid,
        "expires_at": now + timedelta(days=1), "created_at": now,
    })
    if daily_prompts or daily_tokens:
        db.daily_usage.insert_one({
            "user_id": uid, "date": now.strftime("%Y-%m-%d"),
            "prompts": daily_prompts, "tokens": daily_tokens,
            "created_at": now, "updated_at": now,
        })
    if monthly_tokens:
        db.monthly_usage.insert_one({
            "account_id": acct, "month": now.strftime("%Y-%m"),
            "tokens": monthly_tokens, "created_at": now, "updated_at": now,
        })
    return uid, acct, token, email


@pytest.fixture
def seed_user(db):
    created = {"uids": [], "accts": [], "tokens": []}

    def _make(tier="day_pass", **kw):
        uid, acct, token, email = _seed_user(db, tier, **kw)
        created["uids"].append(uid)
        created["accts"].append(acct)
        created["tokens"].append(token)
        return {"user_id": uid, "account_id": acct, "token": token, "email": email}

    yield _make

    # Cleanup
    if created["uids"]:
        db.users.delete_many({"user_id": {"$in": created["uids"]}})
        db.daily_usage.delete_many({"user_id": {"$in": created["uids"]}})
        db.usage_log.delete_many({"user_id": {"$in": created["uids"]}})
        db.quizzes.delete_many({"user_id": {"$in": created["uids"]}})
    if created["accts"]:
        db.accounts.delete_many({"account_id": {"$in": created["accts"]}})
        db.monthly_usage.delete_many({"account_id": {"$in": created["accts"]}})
        db.payments.delete_many({"account_id": {"$in": created["accts"]}})
    if created["tokens"]:
        db.user_sessions.delete_many({"session_token": {"$in": created["tokens"]}})


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

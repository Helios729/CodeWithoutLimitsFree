"""End-to-end backend tests for Code Without Limits (platform-paid free-tier iteration).

NEW free-tier behavior under test:
- Free tier gets 5 platform-paid prompts/day and 50,000 tokens/day.
- /api/usage/me reports tier='free', daily_prompts_cap=5, daily_tokens_cap=50000, blocked=False.
- POST /api/ai/chat as free user (no byok_key) SUCCEEDS using platform key and
  increments daily_usage.prompts by 1.
- 6th call after 5 successful calls returns 429 with 'free prompts' in message.
- POST /api/quiz/generate as free user behaves identically.
- BYOK calls (byok_key supplied) NEVER increment daily_usage counters.
- Day-pass and monthly tier caps unchanged.
"""
import pytest
from tests.conftest import BASE_URL, auth_headers


# ---------- health ----------
class TestHealth:
    def test_root_health(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# ---------- content catalog ----------
class TestContent:
    def test_list_topics(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/content/topics")
        assert r.status_code == 200
        topics = r.json().get("topics", [])
        assert len(topics) == 8

    def test_topic_detail_requires_auth(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/content/topic/intro-ai")
        assert r.status_code == 401


# ---------- auth gating ----------
class TestAuthGating:
    @pytest.mark.parametrize("path,method,payload", [
        ("/api/auth/me", "get", None),
        ("/api/usage/me", "get", None),
        ("/api/quiz/generate", "post", {"topic_id": "intro-ai"}),
        ("/api/ai/chat", "post", {"message": "hi"}),
        ("/api/billing/checkout", "post", {"plan": "day_pass"}),
    ])
    def test_protected_without_token(self, api_client, path, method, payload):
        r = api_client.request(method, f"{BASE_URL}{path}", json=payload)
        assert r.status_code == 401


# ---------- /api/usage/me snapshots ----------
class TestUsageMe:
    def test_usage_me_free_tier_new_caps(self, api_client, seed_user):
        """NEW: free tier has its own 5 prompts / 50k tokens daily budget."""
        u = seed_user("free")
        r = api_client.get(f"{BASE_URL}/api/usage/me", headers=auth_headers(u["token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["tier"] == "free"
        assert body["daily_prompts_cap"] == 5, f"expected 5 free prompts/day, got {body}"
        assert body["daily_tokens_cap"] == 50000, f"expected 50000 free tokens/day, got {body}"
        assert body["blocked"] is False, f"fresh free user must NOT be blocked, got {body}"

    def test_usage_me_day_pass_caps(self, api_client, seed_user):
        u = seed_user("day_pass")
        r = api_client.get(f"{BASE_URL}/api/usage/me", headers=auth_headers(u["token"]))
        assert r.status_code == 200
        body = r.json()
        assert body["tier"] == "day_pass"
        assert body["daily_prompts_cap"] == 6
        assert body["daily_tokens_cap"] == 450000
        assert body["blocked"] is False

    def test_usage_me_monthly_caps_prompt_based(self, api_client, seed_user):
        """NEW: monthly tier is prompt-based (250/mo pooled), not token-based."""
        u = seed_user("monthly")
        r = api_client.get(f"{BASE_URL}/api/usage/me", headers=auth_headers(u["token"]))
        assert r.status_code == 200
        body = r.json()
        assert body["tier"] == "monthly"
        assert body["monthly_prompts_cap"] == 250, f"expected 250, got {body}"
        assert body.get("monthly_prompts_used", 0) == 0
        # monthly_tokens_cap should be 0 / absent (no longer enforced as cap)
        assert body.get("monthly_tokens_cap", 0) == 0, (
            f"monthly_tokens_cap should not be returned for monthly tier, got {body}"
        )


# ---------- platform-paid free-tier behavior (real Gemini calls) ----------
@pytest.mark.timeout(180)
class TestFreeTierPlatformPaid:
    def test_chat_free_no_byok_succeeds_and_increments(self, api_client, seed_user, db):
        """NEW: free user without BYOK should succeed via platform key,
        with tokens_charged > 0 and daily_usage.prompts == 1 after the call."""
        u = seed_user("free")
        r = api_client.post(
            f"{BASE_URL}/api/ai/chat",
            json={"message": "In one short sentence: what is AI?"},
            headers=auth_headers(u["token"]),
            timeout=90,
        )
        assert r.status_code == 200, f"free user should succeed via platform key, got {r.status_code}: {r.text[:300]}"
        body = r.json()
        assert isinstance(body.get("reply"), str) and len(body["reply"]) > 0
        assert body.get("byok") is False
        assert body.get("tokens_charged", 0) > 0, f"platform call must charge tokens, got {body}"

        daily = db.daily_usage.find_one({"user_id": u["user_id"]})
        assert daily is not None, "daily_usage row must be created"
        assert daily.get("prompts", 0) == 1, f"expected prompts=1, got {daily}"
        assert daily.get("tokens", 0) > 0

    def test_chat_free_6th_call_returns_429_quota_exceeded(self, api_client, seed_user, db):
        """Seed daily_usage at 5 prompts so the very next free call must 429
        with 'free prompts' in the message (we avoid burning 5 real Gemini calls)."""
        u = seed_user("free", daily_prompts=5, daily_tokens=100)
        r = api_client.post(
            f"{BASE_URL}/api/ai/chat",
            json={"message": "hello"},
            headers=auth_headers(u["token"]),
        )
        assert r.status_code == 429, r.text
        body = r.json()
        assert body.get("error") == "quota_exceeded"
        assert "free prompts" in body.get("message", "").lower(), (
            f"message should mention 'free prompts', got: {body.get('message')}"
        )

    def test_quiz_free_at_cap_returns_429(self, api_client, seed_user):
        """5 prompts already used → quiz generate must 429."""
        u = seed_user("free", daily_prompts=5)
        r = api_client.post(
            f"{BASE_URL}/api/quiz/generate",
            json={"topic_id": "intro-ai"},
            headers=auth_headers(u["token"]),
        )
        assert r.status_code == 429, r.text
        assert r.json().get("error") == "quota_exceeded"

    def test_chat_free_at_token_cap_returns_429(self, api_client, seed_user):
        u = seed_user("free", daily_prompts=1, daily_tokens=50000)
        r = api_client.post(
            f"{BASE_URL}/api/ai/chat",
            json={"message": "hi"},
            headers=auth_headers(u["token"]),
        )
        assert r.status_code == 429
        assert r.json().get("error") == "quota_exceeded"


# ---------- BYOK opt-in: counters must NOT increment ----------
class TestByokOptIn:
    def test_chat_free_with_byok_does_not_touch_quota(self, api_client, seed_user, db):
        """BYOK calls go directly to Google with the user's key. Even when
        Google rejects the key (4xx), platform daily/monthly counters must
        stay at 0 because BYOK never charges the platform."""
        u = seed_user("free")
        r = api_client.post(
            f"{BASE_URL}/api/ai/chat",
            json={"message": "hello", "byok_key": "AIza_fake_key"},
            headers=auth_headers(u["token"]),
            timeout=60,
        )
        # Upstream will reject the fake key — could be 401/429/502.
        assert r.status_code >= 400, (
            f"fake BYOK key should fail upstream, got {r.status_code}: {r.text[:300]}"
        )
        daily = db.daily_usage.find_one({"user_id": u["user_id"]})
        assert daily is None or daily.get("prompts", 0) == 0, (
            f"BYOK call must NOT increment daily_usage. Got: {daily}"
        )
        monthly = db.monthly_usage.find_one({"account_id": u["account_id"]})
        assert monthly is None or monthly.get("tokens", 0) == 0

    def test_chat_with_byok_works_even_when_quota_exhausted(self, api_client, seed_user, db):
        """Quota-exhausted free user should still be able to use their own key —
        BYOK bypasses the platform gate entirely."""
        u = seed_user("free", daily_prompts=5, daily_tokens=50000)
        r = api_client.post(
            f"{BASE_URL}/api/ai/chat",
            json={"message": "hi", "byok_key": "AIza_fake_key"},
            headers=auth_headers(u["token"]),
            timeout=60,
        )
        # Must NOT be 429 (quota_exceeded). May fail upstream (4xx/5xx).
        if r.status_code == 429:
            assert r.json().get("error") != "quota_exceeded", (
                f"BYOK call must NEVER hit platform quota gate, got: {r.text}"
            )
        # Counters must still not have moved.
        daily = db.daily_usage.find_one({"user_id": u["user_id"]})
        assert daily is None or daily.get("prompts", 0) == 5  # unchanged from seed


# ---------- paid tier quota regression ----------
class TestPaidTierQuota:
    def test_day_pass_at_prompt_cap_blocks(self, api_client, seed_user):
        u = seed_user("day_pass", daily_prompts=6, daily_tokens=10)
        r = api_client.post(
            f"{BASE_URL}/api/ai/chat",
            json={"message": "hi"},
            headers=auth_headers(u["token"]),
        )
        assert r.status_code == 429
        assert r.json().get("error") == "quota_exceeded"

    def test_day_pass_at_token_cap_blocks(self, api_client, seed_user):
        u = seed_user("day_pass", daily_prompts=1, daily_tokens=450000)
        r = api_client.post(
            f"{BASE_URL}/api/quiz/generate",
            json={"topic_id": "intro-ai"},
            headers=auth_headers(u["token"]),
        )
        assert r.status_code == 429

    def test_monthly_at_prompt_cap_blocks(self, api_client, seed_user, db):
        """NEW: monthly tier is prompt-based — 250 prompts pooled per account."""
        u = seed_user("monthly")
        # Seed monthly_usage at the cap directly so we don't burn real Gemini calls.
        from datetime import datetime, timezone
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        db.monthly_usage.insert_one({
            "account_id": u["account_id"], "month": month,
            "prompts": 250, "tokens": 12345,
        })
        r = api_client.post(
            f"{BASE_URL}/api/ai/chat",
            json={"message": "hi"},
            headers=auth_headers(u["token"]),
        )
        assert r.status_code == 429, r.text
        body = r.json()
        assert body.get("error") == "quota_exceeded"
        msg = body.get("message", "").lower()
        assert "shared across your team" in msg or "monthly" in msg or "250" in msg, (
            f"message should mention pooling/monthly, got: {body.get('message')}"
        )

    def test_monthly_pooled_across_users_on_same_account(self, api_client, seed_user, db):
        """Two users on the same account_id share the 250-prompt pool."""
        from datetime import datetime, timedelta, timezone
        import uuid
        shared_acct = f"acct_TEST_shared_{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc)
        db.accounts.insert_one({
            "account_id": shared_acct, "tier": "monthly",
            "seats_allowed": 3, "subscription_status": "active",
            "created_at": now,
        })
        users = []
        for _ in range(2):
            uid = f"user_TEST_{uuid.uuid4().hex[:10]}"
            tok = f"sess_TEST_{uuid.uuid4().hex}"
            db.users.insert_one({
                "user_id": uid, "email": f"TEST_{uuid.uuid4().hex[:8]}@x.com",
                "account_id": shared_acct, "is_account_owner": False,
                "created_at": now, "updated_at": now,
            })
            db.user_sessions.insert_one({
                "session_token": tok, "user_id": uid,
                "expires_at": now + timedelta(days=1), "created_at": now,
            })
            users.append({"user_id": uid, "token": tok})
        # Seed pooled monthly_usage at the cap (combined prompts already 250).
        month = now.strftime("%Y-%m")
        db.monthly_usage.insert_one({
            "account_id": shared_acct, "month": month,
            "prompts": 250, "tokens": 0,
        })
        try:
            for user in users:
                r = api_client.post(
                    f"{BASE_URL}/api/ai/chat",
                    json={"message": "hi"},
                    headers=auth_headers(user["token"]),
                )
                assert r.status_code == 429, (
                    f"user {user['user_id']} on pooled acct must be blocked at 250, got {r.status_code}: {r.text}"
                )
                assert r.json().get("error") == "quota_exceeded"
        finally:
            db.users.delete_many({"user_id": {"$in": [u["user_id"] for u in users]}})
            db.user_sessions.delete_many({"session_token": {"$in": [u["token"] for u in users]}})
            db.accounts.delete_one({"account_id": shared_acct})
            db.monthly_usage.delete_many({"account_id": shared_acct})

    def test_monthly_249_prompts_still_allows_one_more(self, api_client, seed_user, db):
        """With 249 prompts used, usage/me must report unblocked and 1 prompt left."""
        from datetime import datetime, timezone
        u = seed_user("monthly")
        month = datetime.now(timezone.utc).strftime("%Y-%m")
        db.monthly_usage.insert_one({
            "account_id": u["account_id"], "month": month,
            "prompts": 249, "tokens": 0,
        })
        r = api_client.get(f"{BASE_URL}/api/usage/me", headers=auth_headers(u["token"]))
        assert r.status_code == 200
        body = r.json()
        assert body["monthly_prompts_used"] == 249
        assert body["monthly_prompts_cap"] == 250
        assert body["blocked"] is False

    def test_monthly_checkout_returns_stripe_url(self, api_client, seed_user):
        u = seed_user("free")
        r = api_client.post(
            f"{BASE_URL}/api/billing/checkout",
            json={"plan": "monthly"},
            headers=auth_headers(u["token"]),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["url"].startswith("https://checkout.stripe.com")
        assert body["session_id"].startswith("cs_")

    def test_day_pass_expired_downgrades_to_free(self, api_client, seed_user):
        u = seed_user("day_pass", day_pass_expired=True)
        r = api_client.get(f"{BASE_URL}/api/usage/me", headers=auth_headers(u["token"]))
        assert r.status_code == 200
        body = r.json()
        assert body["tier"] == "free"
        # After downgrade, fresh free user gets new caps and is unblocked.
        assert body["daily_prompts_cap"] == 5
        assert body["blocked"] is False


# ---------- paid LLM smoke ----------
@pytest.mark.timeout(180)
class TestPaidLLMFlows:
    def test_day_pass_chat_increments_quota(self, api_client, seed_user, db):
        u = seed_user("day_pass")
        r = api_client.post(
            f"{BASE_URL}/api/ai/chat",
            json={"message": "In one sentence: what is supervised learning?"},
            headers=auth_headers(u["token"]),
            timeout=90,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body.get("reply"), str) and len(body["reply"]) > 0
        assert body.get("tokens_charged", 0) > 0
        assert body.get("byok") is False
        daily = db.daily_usage.find_one({"user_id": u["user_id"]})
        assert daily is not None
        assert daily.get("prompts", 0) == 1
        assert daily.get("tokens", 0) > 0


# ---------- Stripe checkout (URL only) ----------
class TestBillingCheckout:
    def test_day_pass_checkout_returns_stripe_url(self, api_client, seed_user):
        u = seed_user("free")
        r = api_client.post(
            f"{BASE_URL}/api/billing/checkout",
            json={"plan": "day_pass"},
            headers=auth_headers(u["token"]),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["url"].startswith("https://checkout.stripe.com")
        assert body["session_id"].startswith("cs_")

    def test_unknown_plan_rejected(self, api_client, seed_user):
        u = seed_user("free")
        r = api_client.post(
            f"{BASE_URL}/api/billing/checkout",
            json={"plan": "yearly"},
            headers=auth_headers(u["token"]),
        )
        assert r.status_code == 400

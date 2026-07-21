"""
Token / prompt quota enforcement.

Tiers (per problem statement — hard limits, NEVER exceed):
- free          : 5 platform-paid prompts / 50,000 tokens per learner per day.
                  Resets at UTC midnight. Designed for learners in low-income
                  contexts who don't have credit cards or Google Cloud projects.
- day_pass ($3) : 6 prompts/day per user. Token cap kept as a generous safety
                  net so a runaway prompt can't accidentally burn the budget.
- monthly ($10) : 250 prompts / calendar month, pooled across up to 3 users
                  per account. Token cap kept as a safety net.

Enforcement order (mandatory): we read the persisted counter BEFORE each
Gemini call, refuse if the call would exceed the cap, then atomically
increment AFTER the call using the real usage returned by the model.

Counters live in MongoDB so they survive restarts and session resets.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from dataclasses import dataclass


FREE_DAILY_PROMPT_CAP = 5
FREE_DAILY_TOKEN_CAP = 50_000
DAY_PASS_PROMPT_CAP = 6
DAY_PASS_TOKEN_CAP = 450_000
MONTHLY_TOKEN_CAP = 1_000_000  # legacy safety net only — UI/quota gates are prompt-based now
MONTHLY_PROMPT_CAP = 250
MONTHLY_SEAT_CAP = 3


def _today_key(now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%d")


def _month_key(now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    return now.strftime("%Y-%m")


@dataclass
class QuotaSnapshot:
    tier: str
    daily_prompts_used: int
    daily_tokens_used: int
    daily_prompts_cap: int
    daily_tokens_cap: int
    monthly_prompts_used: int
    monthly_prompts_cap: int
    monthly_tokens_used: int
    blocked: bool
    reason: str  # "" when not blocked


async def get_account(db, account_id: str) -> dict:
    """Fetch (or create) the account record. Day-pass expiry is enforced here:
    if the pass has elapsed the tier is downgraded automatically so a stale
    counter can never let an expired pass through."""
    acct = await db.accounts.find_one({"account_id": account_id}, {"_id": 0})
    if not acct:
        acct = {
            "account_id": account_id,
            "tier": "free",
            "day_pass_expires_at": None,
            "subscription_status": None,
            "stripe_customer_id": None,
            "stripe_subscription_id": None,
            "seats_allowed": 1,
            "created_at": datetime.now(timezone.utc),
        }
        await db.accounts.insert_one(dict(acct))
        return acct
    # Auto-expire day pass.
    if acct.get("tier") == "day_pass":
        exp = acct.get("day_pass_expires_at")
        if exp and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if not exp or exp < datetime.now(timezone.utc):
            await db.accounts.update_one(
                {"account_id": account_id},
                {"$set": {"tier": "free"}},
            )
            acct["tier"] = "free"
    return acct


async def snapshot(db, user_id: str, account_id: str) -> QuotaSnapshot:
    """Read-only view of where this user/account stands right now.
    Used by /api/usage/me for the UI meter and by the pre-call guard."""
    acct = await get_account(db, account_id)
    tier = acct.get("tier", "free")
    today = _today_key()
    month = _month_key()

    daily = await db.daily_usage.find_one(
        {"user_id": user_id, "date": today}, {"_id": 0}
    ) or {"prompts": 0, "tokens": 0}
    monthly = await db.monthly_usage.find_one(
        {"account_id": account_id, "month": month}, {"_id": 0}
    ) or {"prompts": 0, "tokens": 0}

    blocked = False
    reason = ""

    if tier == "free":
        # Platform-paid free tier: 5 prompts / 50k tokens per learner per day.
        # When the cap is hit, we block and surface a friendly upgrade message.
        if daily.get("prompts", 0) >= FREE_DAILY_PROMPT_CAP:
            blocked = True
            reason = (
                f"You've used your {FREE_DAILY_PROMPT_CAP} free prompts for today. "
                "Your free access resets tomorrow at 00:00 UTC — or upgrade to a "
                "Day Pass ($3) for more."
            )
        elif daily.get("tokens", 0) >= FREE_DAILY_TOKEN_CAP:
            blocked = True
            reason = (
                "You've reached today's free token limit. Resets tomorrow, or "
                "upgrade to a Day Pass ($3) for more."
            )
    elif tier == "day_pass":
        if daily.get("prompts", 0) >= DAY_PASS_PROMPT_CAP:
            blocked = True
            reason = (
                "You've used all 6 Day Pass prompts for today. "
                "Your access resets tomorrow at 00:00 UTC."
            )
        elif daily.get("tokens", 0) >= DAY_PASS_TOKEN_CAP:
            blocked = True
            reason = (
                "You've reached your daily token limit. Your access resets tomorrow."
            )
    elif tier == "monthly":
        if monthly.get("prompts", 0) >= MONTHLY_PROMPT_CAP:
            blocked = True
            reason = (
                f"Your account has used all {MONTHLY_PROMPT_CAP} prompts for this month "
                "(shared across your team). Access resets on the 1st of next month."
            )

    return QuotaSnapshot(
        tier=tier,
        daily_prompts_used=daily.get("prompts", 0),
        daily_tokens_used=daily.get("tokens", 0),
        daily_prompts_cap=(
            FREE_DAILY_PROMPT_CAP if tier == "free"
            else DAY_PASS_PROMPT_CAP if tier == "day_pass"
            else 0
        ),
        daily_tokens_cap=(
            FREE_DAILY_TOKEN_CAP if tier == "free"
            else DAY_PASS_TOKEN_CAP if tier == "day_pass"
            else 0
        ),
        monthly_prompts_used=monthly.get("prompts", 0),
        monthly_prompts_cap=MONTHLY_PROMPT_CAP if tier == "monthly" else 0,
        monthly_tokens_used=monthly.get("tokens", 0),
        blocked=blocked,
        reason=reason,
    )


async def assert_can_call(db, user_id: str, account_id: str) -> QuotaSnapshot:
    """Pre-call guard. Raises ValueError(reason) if the call must be blocked
    *before* it ever reaches Gemini. The route layer turns that into a 429.

    This is the critical "never overage" gate: nothing else may call Gemini
    without going through assert_can_call first.
    """
    snap = await snapshot(db, user_id, account_id)
    if snap.blocked:
        raise ValueError(snap.reason)
    return snap


async def record_usage(
    db, *, user_id: str, account_id: str, tokens: int, kind: str
) -> None:
    """Atomically persist the real token cost returned by the model so the
    next assert_can_call sees an up-to-date counter even across restarts."""
    now = datetime.now(timezone.utc)
    today = _today_key(now)
    month = _month_key(now)
    tokens = max(int(tokens or 0), 0)

    # Per-call audit log (one row per Gemini call).
    await db.usage_log.insert_one(
        {
            "user_id": user_id,
            "account_id": account_id,
            "tokens": tokens,
            "kind": kind,
            "created_at": now,
        }
    )
    # Per-user daily aggregate (drives the 6-prompt / 450k-token cap).
    await db.daily_usage.update_one(
        {"user_id": user_id, "date": today},
        {
            "$inc": {"prompts": 1, "tokens": tokens},
            "$setOnInsert": {"user_id": user_id, "date": today, "created_at": now},
            "$set": {"updated_at": now},
        },
        upsert=True,
    )
    # Per-account monthly aggregate. We track prompts (the user-facing cap)
    # AND tokens (kept for analytics / cost monitoring).
    await db.monthly_usage.update_one(
        {"account_id": account_id, "month": month},
        {
            "$inc": {"prompts": 1, "tokens": tokens},
            "$setOnInsert": {
                "account_id": account_id,
                "month": month,
                "created_at": now,
            },
            "$set": {"updated_at": now},
        },
        upsert=True,
    )

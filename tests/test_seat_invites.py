"""Backend tests for seat-invite UI / Monthly Cooperative team management.

Covers:
- GET /api/account/seats (owner, monthly + free gate)
- POST /api/account/invite (monthly owner, non-owner 403, free 400, team-full 400)
- GET /api/account/invite/{token} (valid / expired / used / 404)
- POST /api/account/invite/accept (move accountId, idempotent, share monthly pool)
- DELETE /api/account/invite/{token}
- DELETE /api/account/seats/{user_id} (kick teammate, cannot remove self)
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

from conftest import auth_headers

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or os.environ["FRONTEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


# Helper: seed a non-owner monthly teammate sharing an existing account
def _seed_extra_user(db, account_id, *, is_owner=False):
    uid = f"user_TEST_{uuid.uuid4().hex[:10]}"
    token = f"sess_TEST_{uuid.uuid4().hex}"
    email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
    now = datetime.now(timezone.utc)
    db.users.insert_one({
        "user_id": uid, "email": email, "name": "Teammate",
        "account_id": account_id, "is_account_owner": is_owner,
        "created_at": now, "updated_at": now,
    })
    db.user_sessions.insert_one({
        "session_token": token, "user_id": uid,
        "expires_at": now + timedelta(days=1), "created_at": now,
    })
    return {"user_id": uid, "token": token, "email": email}


@pytest.fixture
def extra_users(db):
    created_uids, created_tokens = [], []

    def _make(account_id, is_owner=False):
        u = _seed_extra_user(db, account_id, is_owner=is_owner)
        created_uids.append(u["user_id"])
        created_tokens.append(u["token"])
        return u

    yield _make

    if created_uids:
        db.users.delete_many({"user_id": {"$in": created_uids}})
    if created_tokens:
        db.user_sessions.delete_many({"session_token": {"$in": created_tokens}})


# ---------- GET /api/account/seats ----------
class TestGetSeats:
    def test_monthly_owner_sees_team(self, api_client, seed_user):
        owner = seed_user(tier="monthly")
        r = api_client.get(f"{API}/account/seats", headers=auth_headers(owner["token"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["tier"] == "monthly"
        assert data["is_owner"] is True
        assert data["seats_used"] == 1
        assert data["seats_allowed"] == 3
        assert len(data["seats"]) == 1
        assert data["seats"][0]["email"] == owner["email"]

    def test_free_user_sees_free_tier(self, api_client, seed_user):
        u = seed_user(tier="free")
        r = api_client.get(f"{API}/account/seats", headers=auth_headers(u["token"]))
        assert r.status_code == 200
        assert r.json()["tier"] == "free"


# ---------- POST /api/account/invite ----------
class TestCreateInvite:
    def test_monthly_owner_can_create(self, api_client, seed_user, db):
        owner = seed_user(tier="monthly")
        r = api_client.post(
            f"{API}/account/invite",
            json={"label": "Maria"},
            headers=auth_headers(owner["token"]),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body and len(body["token"]) > 0
        assert "/account/join?token=" in body["join_url"]
        assert body["join_url"].endswith(body["token"])
        # cleanup
        db.account_invites.delete_many({"account_id": owner["account_id"]})

    def test_non_owner_gets_403(self, api_client, seed_user, extra_users, db):
        owner = seed_user(tier="monthly")
        teammate = extra_users(owner["account_id"], is_owner=False)
        r = api_client.post(
            f"{API}/account/invite",
            json={"label": "x"},
            headers=auth_headers(teammate["token"]),
        )
        assert r.status_code == 403
        db.account_invites.delete_many({"account_id": owner["account_id"]})

    def test_free_user_gets_400(self, api_client, seed_user):
        u = seed_user(tier="free")
        r = api_client.post(
            f"{API}/account/invite",
            json={"label": "x"},
            headers=auth_headers(u["token"]),
        )
        assert r.status_code == 400
        assert "Monthly Cooperative" in r.json().get("detail", "")

    def test_team_full_returns_400(self, api_client, seed_user, extra_users, db):
        owner = seed_user(tier="monthly")
        # Fill: owner is 1 of 3; add 2 teammates → seats_used=3 = seats_allowed
        extra_users(owner["account_id"])
        extra_users(owner["account_id"])
        r = api_client.post(
            f"{API}/account/invite",
            json={},
            headers=auth_headers(owner["token"]),
        )
        assert r.status_code == 400
        assert "full" in r.json().get("detail", "").lower()


# ---------- GET /api/account/invite/{token} ----------
class TestGetInvite:
    def test_valid_invite_returns_owner_name(self, api_client, seed_user, db):
        owner = seed_user(tier="monthly")
        r = api_client.post(
            f"{API}/account/invite", json={"label": "Maria"},
            headers=auth_headers(owner["token"]),
        )
        token = r.json()["token"]
        # No auth headers — endpoint must be public
        r2 = requests.get(f"{API}/account/invite/{token}")
        assert r2.status_code == 200
        body = r2.json()
        assert body["status"] == "valid"
        assert body["owner_name"]  # name or email of owner
        assert body["label"] == "Maria"
        db.account_invites.delete_many({"account_id": owner["account_id"]})

    def test_expired_invite(self, api_client, seed_user, db):
        owner = seed_user(tier="monthly")
        token = uuid.uuid4().hex[:12]
        now = datetime.now(timezone.utc)
        db.account_invites.insert_one({
            "token": token, "account_id": owner["account_id"],
            "created_by": owner["user_id"], "label": None,
            "created_at": now - timedelta(days=20),
            "expires_at": now - timedelta(days=1),
            "used_by": None, "used_at": None,
        })
        r = requests.get(f"{API}/account/invite/{token}")
        assert r.status_code == 200
        assert r.json()["status"] == "expired"
        db.account_invites.delete_one({"token": token})

    def test_used_invite(self, api_client, seed_user, db):
        owner = seed_user(tier="monthly")
        token = uuid.uuid4().hex[:12]
        now = datetime.now(timezone.utc)
        db.account_invites.insert_one({
            "token": token, "account_id": owner["account_id"],
            "created_by": owner["user_id"], "label": None,
            "created_at": now, "expires_at": now + timedelta(days=7),
            "used_by": "someone_else", "used_at": now,
        })
        r = requests.get(f"{API}/account/invite/{token}")
        assert r.status_code == 200
        assert r.json()["status"] == "used"
        db.account_invites.delete_one({"token": token})

    def test_unknown_token_404(self):
        r = requests.get(f"{API}/account/invite/nonexistent_xyz")
        assert r.status_code == 404


# ---------- POST /api/account/invite/accept ----------
class TestAcceptInvite:
    def test_joinee_moves_to_owner_account(self, api_client, seed_user, db):
        owner = seed_user(tier="monthly")
        joinee = seed_user(tier="free")
        old_joinee_acct = joinee["account_id"]

        r = api_client.post(
            f"{API}/account/invite", json={"label": "M"},
            headers=auth_headers(owner["token"]),
        )
        token = r.json()["token"]

        r2 = api_client.post(
            f"{API}/account/invite/accept", json={"token": token},
            headers=auth_headers(joinee["token"]),
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["account_id"] == owner["account_id"]

        # Verify via /api/auth/me — account_id changed
        me = api_client.get(f"{API}/auth/me", headers=auth_headers(joinee["token"]))
        assert me.status_code == 200
        # account_id may not be in /me; verify directly from DB if not present
        if "account_id" in me.json():
            assert me.json()["account_id"] == owner["account_id"]
        u_doc = db.users.find_one({"user_id": joinee["user_id"]})
        assert u_doc["account_id"] == owner["account_id"]
        assert u_doc["is_account_owner"] is False

        # Old personal account should be deleted (orphaned)
        assert db.accounts.find_one({"account_id": old_joinee_acct}) is None

        db.account_invites.delete_many({"account_id": owner["account_id"]})

    def test_replay_returns_400(self, api_client, seed_user, db):
        owner = seed_user(tier="monthly")
        joinee = seed_user(tier="free")
        joinee2 = seed_user(tier="free")
        r = api_client.post(
            f"{API}/account/invite", json={},
            headers=auth_headers(owner["token"]),
        )
        token = r.json()["token"]

        r1 = api_client.post(
            f"{API}/account/invite/accept", json={"token": token},
            headers=auth_headers(joinee["token"]),
        )
        assert r1.status_code == 200
        # Second acceptance (by joinee2) of the same token must fail
        r2 = api_client.post(
            f"{API}/account/invite/accept", json={"token": token},
            headers=auth_headers(joinee2["token"]),
        )
        assert r2.status_code == 400
        assert "already been used" in r2.json().get("detail", "").lower()
        db.account_invites.delete_many({"account_id": owner["account_id"]})

    def test_post_accept_joinee_sees_monthly_usage(self, api_client, seed_user, db):
        owner = seed_user(tier="monthly")
        joinee = seed_user(tier="free")
        r = api_client.post(
            f"{API}/account/invite", json={},
            headers=auth_headers(owner["token"]),
        )
        token = r.json()["token"]
        api_client.post(
            f"{API}/account/invite/accept", json={"token": token},
            headers=auth_headers(joinee["token"]),
        )
        # joinee /usage/me reports monthly tier
        u = api_client.get(f"{API}/usage/me", headers=auth_headers(joinee["token"]))
        assert u.status_code == 200
        body = u.json()
        assert body["tier"] == "monthly"
        assert body.get("monthly_prompts_cap") == 250

        # Both users share the monthly_usage row keyed by account_id
        rows = list(db.monthly_usage.find({"account_id": owner["account_id"]}))
        # 0 or 1 row — both reference the same account_id
        assert len(rows) <= 1

        db.account_invites.delete_many({"account_id": owner["account_id"]})


# ---------- DELETE /api/account/seats/{user_id} ----------
class TestRemoveSeat:
    def test_owner_can_remove_teammate(self, api_client, seed_user, extra_users, db):
        owner = seed_user(tier="monthly")
        teammate = extra_users(owner["account_id"])
        r = api_client.delete(
            f"{API}/account/seats/{teammate['user_id']}",
            headers=auth_headers(owner["token"]),
        )
        assert r.status_code == 200
        # Verify teammate moved to new personal free account
        u_doc = db.users.find_one({"user_id": teammate["user_id"]})
        assert u_doc["account_id"] != owner["account_id"]
        assert u_doc["is_account_owner"] is True
        new_acct = db.accounts.find_one({"account_id": u_doc["account_id"]})
        assert new_acct is not None
        assert new_acct["tier"] == "free"
        # Cleanup the new account created by remove_seat (not tracked by fixture)
        db.accounts.delete_one({"account_id": u_doc["account_id"]})

    def test_owner_cannot_remove_self(self, api_client, seed_user):
        owner = seed_user(tier="monthly")
        r = api_client.delete(
            f"{API}/account/seats/{owner['user_id']}",
            headers=auth_headers(owner["token"]),
        )
        assert r.status_code == 400
        assert "themselves" in r.json().get("detail", "").lower()


# ---------- DELETE /api/account/invite/{token} ----------
class TestRevokeInvite:
    def test_owner_can_revoke(self, api_client, seed_user, db):
        owner = seed_user(tier="monthly")
        r = api_client.post(
            f"{API}/account/invite", json={},
            headers=auth_headers(owner["token"]),
        )
        token = r.json()["token"]
        r2 = api_client.delete(
            f"{API}/account/invite/{token}",
            headers=auth_headers(owner["token"]),
        )
        assert r2.status_code == 200
        # confirm gone
        assert db.account_invites.find_one({"token": token}) is None

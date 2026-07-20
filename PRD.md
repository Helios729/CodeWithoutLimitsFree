# Code Without Limits — Product Requirements

## Vision
Mobile-first AI learning + digital-asset studio for low-bandwidth, energy-constrained learners
(Mondial Connections / Community Changers Foundations). Previously titled "Code Guardian";
rebranded to **Code Without Limits**. Rebuilt as an Expo React Native app
backed by FastAPI + MongoDB.

## Core requirements implemented (v1)

### 1. Strict token / prompt limit enforcement (no Google API overage)
- **Day Pass ($3):** 6 prompts OR 450,000 tokens / day per user, whichever first. Resets at UTC midnight.
- **Monthly ($10/mo, up to 3 users/account):** 1,000,000 tokens / month, tracked at the account level.
- Enforcement is **pre-call** via `quota.assert_can_call()` — Gemini is never invoked if the call would exceed quota.
- Real token counts come from the model response (`usage_metadata`) and are persisted to
  `daily_usage` / `monthly_usage` / `usage_log` in MongoDB. Counters survive restarts.
- 429 response carries a friendly user-facing message.

### 2. Web scraping for educational content
- Allowlist of premier CS / AI / EdTech domains: MIT (OCW, news, CSAIL),
  Caltech, CMU, Stanford (AI Lab, HAI, NLP, CS231n), UC Berkeley (EECS, BAIR),
  data.gov, ERIC, NSF.
- `robots.txt` checked at runtime before every fetch; non-allowlisted domains rejected.
- Cached in `scraped_content` with 30-day TTL. Pre-seeded for all topics on startup.
- Source URL + institution name attached to every quiz question and the quiz footer.

### 3. Interactive quiz feature
- Exactly **10 multiple-choice questions**, grounded in scraped excerpts.
- Each question shows a source citation (institution + URL).
- Quiz generation goes through the same quota gate as agent chat.
- Submit returns score + per-question correct/incorrect + explanation.

### 4. Stripe checkout
- $3 Day Pass (`mode=payment`) and $10/month Monthly (`mode=subscription`) created via
  `stripe.checkout.Session.create`.
- Webhook at `POST /api/billing/webhook` flips account tier; `/api/billing/verify` is a
  reconcile fallback used by `/billing/success`.

### 5. Auth
- Emergent-managed Google Auth.
- Bearer tokens stored in `expo-secure-store` (native) / `localStorage` (web).
- Token enforced on every protected route, MongoDB TTL on `user_sessions.expires_at`.

## Architecture
- `/app/backend/server.py` — FastAPI app, all routes under `/api`.
- `/app/backend/quota.py` — quota state machine.
- `/app/backend/scraper.py` — polite cached scraper.
- `/app/backend/sources.py` — allowlist + topic catalog.
- `/app/frontend/app/` — Expo Router screens (welcome, tabs, quiz, billing).
- `/app/frontend/src/context/AuthContext.tsx` — auth + usage state.
- `/app/frontend/src/components/TokenMeter.tsx` — header meter on every signed-in screen.

## Out of scope (v1)
- ~~BYOK (free tier currently blocked — upgrade to use AI).~~ **DONE** — Free tier now accepts a `byok_key` per request; platform quota is never charged for BYOK calls.
- Multi-user seat invites for monthly plan (single owner only).
- Markdown / PDF exports.
- Sign-language video integration.
- Flutterwave checkout (Stripe only per user choice).

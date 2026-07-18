"""
Lightweight, polite web scraper for publicly accessible educational
content. Caches everything to MongoDB so we never re-fetch the same
URL within the cache window.

Design notes:
- Allowlist + robots.txt are both enforced before any HTTP request.
- Failures degrade gracefully: we return a stub record with the source
  URL + institution so the quiz generator can still cite the source
  even if the network is flaky.
- Text is truncated to ~6000 chars per source so prompts stay cheap.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx
from bs4 import BeautifulSoup

from sources import ALLOWED_DOMAINS, TOPIC_CATALOG, get_topic

logger = logging.getLogger(__name__)

CACHE_TTL_DAYS = 30
MAX_CHARS = 6000
USER_AGENT = (
    "SmallAIAssetStudioBot/1.0 (+https://token-limit-enforcer.preview.emergentagent.com; "
    "educational research scraper)"
)


def _is_allowed_domain(url: str) -> bool:
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return False
    return host in ALLOWED_DOMAINS


async def _robots_allows(url: str) -> bool:
    """Best-effort robots.txt check. If robots.txt itself is unreachable
    we conservatively allow (most academic sites have permissive robots)."""
    try:
        parsed = urlparse(url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": USER_AGENT}) as c:
            r = await c.get(robots_url)
            if r.status_code >= 400:
                return True
            rp = RobotFileParser()
            rp.parse(r.text.splitlines())
            return rp.can_fetch(USER_AGENT, url)
    except Exception as e:
        logger.warning("robots.txt check failed for %s: %s", url, e)
        return True


def _extract_text(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    # Drop noisy tags before extracting plaintext.
    for tag in soup(["script", "style", "nav", "footer", "header", "form", "noscript"]):
        tag.decompose()
    # Prefer <main>/<article> when present.
    main = soup.find("main") or soup.find("article") or soup.body or soup
    text = main.get_text(separator=" ", strip=True)
    # Collapse whitespace.
    text = " ".join(text.split())
    return text[:MAX_CHARS]


async def fetch_one(url: str, institution: str) -> dict:
    """Fetch a single URL with allowlist + robots checks. Returns a record
    that's safe to persist even on failure (so quiz citations still work)."""
    record = {
        "url": url,
        "institution": institution,
        "title": "",
        "text": "",
        "fetched_at": datetime.now(timezone.utc),
        "status": "error",
        "error": None,
    }
    if not _is_allowed_domain(url):
        record["error"] = "domain_not_allowed"
        return record
    if not await _robots_allows(url):
        record["error"] = "robots_disallow"
        return record
    try:
        async with httpx.AsyncClient(
            timeout=20,
            headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
            follow_redirects=True,
        ) as c:
            r = await c.get(url)
            r.raise_for_status()
            html = r.text
            soup = BeautifulSoup(html, "lxml")
            title_tag = soup.find("title")
            record["title"] = title_tag.get_text(strip=True) if title_tag else url
            record["text"] = _extract_text(html)
            record["status"] = "ok"
    except Exception as e:
        record["error"] = str(e)[:200]
        logger.warning("scrape failed %s: %s", url, e)
    return record


async def get_or_scrape(db, url: str, institution: str, force: bool = False) -> dict:
    """Cached scrape. Returns the existing doc if within TTL, otherwise
    re-fetches and upserts. _id is excluded from results."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=CACHE_TTL_DAYS)
    if not force:
        cached = await db.scraped_content.find_one(
            {"url": url, "fetched_at": {"$gte": cutoff}, "status": "ok"},
            {"_id": 0},
        )
        if cached:
            return cached
    record = await fetch_one(url, institution)
    await db.scraped_content.update_one(
        {"url": url},
        {"$set": record},
        upsert=True,
    )
    record.pop("_id", None)
    return record


async def scrape_topic(db, topic_id: str, force: bool = False) -> dict | None:
    """Fetch every source listed for the topic. Returns a topic dict with
    a 'sources' list that includes the scraped text + citation metadata."""
    topic = get_topic(topic_id)
    if not topic:
        return None
    results = await asyncio.gather(
        *[get_or_scrape(db, s["url"], s["institution"], force) for s in topic["sources"]]
    )
    return {
        "topic_id": topic["topic_id"],
        "title": topic["title"],
        "description": topic["description"],
        "sources": [
            {
                "url": r["url"],
                "institution": r["institution"],
                "title": r.get("title") or r["url"],
                "text": r.get("text") or "",
                "status": r.get("status", "error"),
            }
            for r in results
        ],
    }


async def preseed_all(db) -> None:
    """Pre-seed the cache for every topic on startup. Runs in the background
    so we don't block the API. Failures are logged, never raised."""
    logger.info("Pre-seeding scraped content for %d topics", len(TOPIC_CATALOG))
    for topic in TOPIC_CATALOG:
        try:
            await scrape_topic(db, topic["topic_id"], force=False)
        except Exception as e:
            logger.error("preseed failed for %s: %s", topic["topic_id"], e)
    logger.info("Pre-seed complete")

"""
Crawl every Google Form in /app/backend/curriculum_data/survey_forms.json,
follow short URLs, extract title + question structure + entry IDs, and
print a clean health report.

Usage:  python3 /app/backend/scripts/crawl_survey_forms.py
"""
import json, re, asyncio, sys
from pathlib import Path
import httpx

REGISTRY = Path("/app/backend/curriculum_data/survey_forms.json")
TIMEOUT = 15.0
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; CodeWithoutLimitsBot/1.0)"}

Q_TYPES = {
    0: "short-text", 1: "paragraph", 2: "radio", 3: "dropdown",
    4: "checkbox", 5: "linear-scale", 7: "grid", 9: "date", 10: "time",
}


def parse_form(html: str) -> dict:
    """Return {title, questions:[{entry_id, type, label, options}], accepting}."""
    out = {"title": None, "questions": [], "accepting": True, "closed_reason": None}
    t = re.search(r"<title>([^<]+)</title>", html)
    if t:
        out["title"] = t.group(1).strip()

    # Closed-form detection
    for marker in ("no longer accepting responses",
                   "This form is no longer accepting responses",
                   "Form has been closed"):
        if marker.lower() in html.lower():
            out["accepting"] = False
            out["closed_reason"] = marker
            break

    # FB_PUBLIC_LOAD_DATA_ is the canonical structure
    m = re.search(r"FB_PUBLIC_LOAD_DATA_\s*=\s*(\[.*?\]);\s*</script>", html, re.DOTALL)
    if not m:
        return out
    try:
        data = json.loads(m.group(1))
        questions = data[1][1] or []
    except Exception:
        return out

    for q in questions:
        # q layout: [id, label, description, type, [[entry_id, ...], ...]]
        try:
            qtype = q[3]
            label = (q[1] or "").strip() or "(no label)"
            entry_id = None
            options = []
            if q[4]:
                first_sub = q[4][0]
                entry_id = first_sub[0]
                # For radio/checkbox/dropdown/scale, options live at index 1
                if len(first_sub) > 1 and isinstance(first_sub[1], list):
                    options = [o[0] for o in first_sub[1] if isinstance(o, list) and o]
            out["questions"].append({
                "entry_id": entry_id,
                "type": Q_TYPES.get(qtype, f"type-{qtype}"),
                "label": label,
                "options": options[:8],
            })
        except Exception:
            continue
    return out


async def fetch_form(client: httpx.AsyncClient, short_url: str) -> dict:
    """Follow short URL → grab viewform HTML → parse."""
    try:
        r = await client.get(short_url, follow_redirects=True, timeout=TIMEOUT)
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}
    if r.status_code != 200:
        return {"ok": False, "error": f"HTTP {r.status_code}", "final_url": str(r.url)}
    info = parse_form(r.text)
    info["ok"] = True
    info["final_url"] = str(r.url)
    # Extract long form ID
    m = re.search(r"/forms/d/e/([A-Za-z0-9_-]+)/", str(r.url))
    info["form_id"] = m.group(1) if m else None
    return info


async def main():
    reg = json.loads(REGISTRY.read_text())
    surveys = reg.get("surveys", [])
    print(f"Loaded {len(surveys)} survey entries from registry.\n")

    async with httpx.AsyncClient(headers=HEADERS) as client:
        # Concurrent crawl
        tasks = []
        for entry in surveys:
            url = entry.get("form_url")
            tasks.append(fetch_form(client, url) if url else asyncio.sleep(0, result={"ok": False, "error": "no form_url"}))
        results = await asyncio.gather(*tasks)

    bad, partial, healthy = [], [], []
    rows = []
    for entry, info in zip(surveys, results):
        mod = entry.get("module_id", "?")
        url = entry.get("form_url") or "(no url)"
        if not info.get("ok"):
            bad.append((mod, info.get("error")))
            rows.append({"module_id": mod, "form_url": url, "status": "error", "reason": info.get("error")})
            continue
        qs = info.get("questions", [])
        nq = len(qs)
        title = info.get("title") or "(no title)"
        accepting = info.get("accepting")
        # Heuristic: a "real" survey has >= 3 questions with non-empty labels
        real_labels = sum(1 for q in qs if q["label"] != "(no label)" and "Untitled" not in q["label"])
        is_skeleton = nq < 3 or real_labels < 2
        if not accepting:
            bad.append((mod, "form CLOSED"))
            rows.append({"module_id": mod, "title": title, "status": "closed", "questions": nq})
        elif is_skeleton:
            partial.append((mod, title, nq, real_labels))
            rows.append({"module_id": mod, "title": title, "status": "skeleton", "questions": nq, "real_labels": real_labels, "form_id": info.get("form_id"), "fields": qs})
        else:
            healthy.append((mod, title, nq))
            rows.append({"module_id": mod, "title": title, "status": "healthy", "questions": nq, "form_id": info.get("form_id"), "fields": qs})

    print("=" * 90)
    print(f"  ✅ HEALTHY  (≥3 real questions, accepting):  {len(healthy)}")
    print(f"  ⚠️  SKELETON (form exists but <3 real Qs):    {len(partial)}")
    print(f"  ❌ BROKEN   (unreachable / closed / 404):     {len(bad)}")
    print("=" * 90)

    if healthy:
        print("\n✅ HEALTHY FORMS")
        for m, t, n in healthy:
            print(f"   • {m:38}  {n:>2} Qs   '{t}'")
    if partial:
        print("\n⚠️  SKELETON FORMS (need real questions added on Google Forms)")
        for m, t, n, rl in partial:
            print(f"   • {m:38}  {n:>2} Qs ({rl} labeled)  '{t}'")
    if bad:
        print("\n❌ BROKEN")
        for m, e in bad:
            print(f"   • {m:38}  → {e}")

    # Save detailed report
    out_path = Path("/app/backend/curriculum_data/survey_forms_health.json")
    out_path.write_text(json.dumps({"summary": {
        "total": len(surveys), "healthy": len(healthy),
        "skeleton": len(partial), "broken": len(bad),
    }, "rows": rows}, indent=2))
    print(f"\nFull details written to: {out_path}")


if __name__ == "__main__":
    asyncio.run(main())

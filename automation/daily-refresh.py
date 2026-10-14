#!/usr/bin/env python3
"""cricketnow.online — daily 6 AM PKT full-section refresh orchestrator.

One run covers EVERY menu section:
  1. publish_manifest.py --no-commit  -> homepage data (matches, hero,
     leagues, upcoming_majors), live-score.json (verified scores only),
     highlights (major-first per-fixture dedicated search BEFORE the
     generic channel scan; team-clash guard + fixture-verified flags
     intact), highlight-gaps.json.
  2. generate-date-pages.py           -> matches-today/ + cricket-matches-tomorrow/
  3. fetch_bbc_news.py                -> bbc-news.json (news section)
  4. channels.json integrity check    -> channels data (streams stay OFF)
  5. orphan_check.py                  -> link QA
  6. automation/last-run-report.md    -> per-section counts, missing-major
     highlights list, failures (failures are ALWAYS visible — no silent
     failures).
  7. git commit + push (rebase-before-push, retry; never force-push).

On pipeline verify FAIL the previous manifest is kept (publish_manifest.py
exits before writing), but the remaining steps still run and the failure is
written into last-run-report.md. Exit code is non-zero when the pipeline
failed.

DRY_RUN=1 regenerates everything but commits/pushes nothing.

Guardrails: never touches stream embeds or ad code. Never invents matches,
scores, captains, channels or highlights — unverified items stay TBD/empty.
STREAMS_ENABLED stays false. GA4/AdSense untouched. No Cricbuzz content.
"""
from __future__ import annotations
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

PKT = ZoneInfo("Asia/Karachi")
REPO = Path(__file__).resolve().parent.parent      # ~/workspace/cricketnow-source
AUTO = REPO / "automation"
PIPE_AUTO = Path.home() / "workspace" / "cricketnow" / "automation"
PUBLISH = PIPE_AUTO / "publish_manifest.py"
GAPS_SRC = PIPE_AUTO / "highlight-gaps.json"
GAPS_DST = AUTO / "highlight-gaps.json"
REPORT = AUTO / "last-run-report.md"
DRY_RUN = os.environ.get("DRY_RUN") == "1"

GIT_ENV = {**os.environ,
           "GIT_AUTHOR_NAME": "Muse", "GIT_AUTHOR_EMAIL": "muse@local",
           "GIT_COMMITTER_NAME": "Muse", "GIT_COMMITTER_EMAIL": "muse@local"}


def run(cmd, **kw):
    """Run a command, return CompletedProcess (never raises on rc!=0)."""
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def pkt_today() -> str:
    return datetime.now(PKT).strftime("%Y-%m-%d")


def load_json(path):
    try:
        return json.loads(Path(path).read_text())
    except Exception:
        return None


def homepage_payload():
    """Parse automation/homepage-data.js -> window.__CN_HOMEPAGE payload."""
    try:
        txt = (AUTO / "homepage-data.js").read_text()
    except Exception:
        return None
    m = re.match(r"\s*window\.__CN_HOMEPAGE\s*=\s*(.*?);?\s*$", txt, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except Exception:
        return None


def git_commit_push(report_path: Path, summary: str) -> list[str]:
    """Commit + push with rebase-before-push. Never force-push. Returns log lines."""
    log = []
    paths = ["automation/", "matches-today/index.html",
             "cricket-matches-tomorrow/index.html"]
    r = run(["git", "add"] + paths, cwd=str(REPO), env=GIT_ENV)
    if r.returncode != 0:
        log.append(f"FAIL git add: {r.stderr.strip()}")
        return log
    diff = run(["git", "diff", "--cached", "--quiet"], cwd=str(REPO), env=GIT_ENV)
    if diff.returncode == 0:
        log.append("no changes - nothing committed")
        return log
    r = run(["git", "commit", "-m", summary], cwd=str(REPO), env=GIT_ENV)
    if r.returncode != 0:
        log.append(f"FAIL git commit: {r.stderr.strip()}")
        return log
    for attempt in range(3):
        r = run(["git", "push", "origin", "main"], cwd=str(REPO), env=GIT_ENV)
        if r.returncode == 0:
            log.append("pushed to origin/main")
            return log
        log.append(f"push rejected (attempt {attempt + 1}) - rebasing onto origin/main")
        run(["git", "fetch", "origin"], cwd=str(REPO), env=GIT_ENV)
        rb = run(["git", "-c", "user.name=Muse", "-c", "user.email=muse@local",
                  "rebase", "origin/main"], cwd=str(REPO), env=GIT_ENV)
        if rb.returncode != 0:
            run(["git", "rebase", "--abort"], cwd=str(REPO), env=GIT_ENV)
            log.append(f"FAIL rebase: {rb.stderr.strip()[:300]}")
            return log
    log.append("FAIL git push failed after rebase retries")
    return log


def main() -> int:
    run_id = pkt_today()
    now = datetime.now(PKT)
    sections: list[tuple[str, str, str]] = []   # (section, status, detail)
    failures: list[str] = []
    manifest_ok = False

    # --- 1. main pipeline (homepage, live scores, highlights, gaps) ---
    print(f"[{now:%H:%M}] step 1: publish_manifest.py", flush=True)
    r = run([sys.executable, str(PUBLISH), "--date", run_id, "--no-commit"],
            cwd=str(PIPE_AUTO))
    sys.stdout.write(r.stdout)
    sys.stderr.write(r.stderr)
    if r.returncode == 0:
        manifest_ok = True
        sections.append(("pipeline (publish_manifest.py)", "PASS",
                         "verify gate PASS; manifest + homepage data + live scores + highlights regenerated"))
    else:
        failures.append("publish_manifest.py FAILED (verify gate or pipeline error) - previous manifest kept; no data published from this step")
        sections.append(("pipeline (publish_manifest.py)", "FAIL",
                         "previous manifest kept untouched"))

    # --- 2. date pages (schedule section) ---
    print(f"[{now:%H:%M}] step 2: generate-date-pages.py", flush=True)
    r = run([sys.executable, str(AUTO / "generate-date-pages.py")], cwd=str(REPO))
    sys.stdout.write(r.stdout)
    if r.returncode == 0:
        counts = re.findall(r"\((\d+) fixtures\)", r.stdout)
        sections.append(("schedule pages (matches-today / tomorrow)", "PASS",
                         f"matches-today {counts[0] if len(counts) > 0 else '?'} fixtures, "
                         f"cricket-matches-tomorrow {counts[1] if len(counts) > 1 else '?'} fixtures"))
    else:
        failures.append(f"generate-date-pages.py FAILED: {r.stderr.strip()[:300]}")
        sections.append(("schedule pages", "FAIL", "see failures"))

    # --- 3. news ---
    print(f"[{now:%H:%M}] step 3: fetch_bbc_news.py", flush=True)
    r = run([sys.executable, str(AUTO / "fetch_bbc_news.py")], cwd=str(AUTO))
    sys.stdout.write(r.stdout)
    news = load_json(AUTO / "bbc-news.json")
    n_items = len(news.get("items", [])) if news else 0
    if r.returncode == 0 and news:
        sections.append(("news (BBC Sport cricket RSS)", "PASS",
                         f"{n_items} stories, updated {news.get('updatedAt', '?')}"))
    else:
        failures.append(f"fetch_bbc_news.py FAILED: {r.stderr.strip()[:300]}")
        sections.append(("news", "FAIL", "previous bbc-news.json kept"))

    # --- 4. channels data integrity ---
    channels = load_json(AUTO / "channels.json")
    if isinstance(channels, list):
        sections.append(("channels data (channels.json)", "PASS",
                         f"{len(channels)} channel entries intact; streams stay OFF"))
    else:
        failures.append("channels.json unreadable or invalid")
        sections.append(("channels data", "FAIL", "channels.json invalid"))

    # --- 5. highlight gaps report (copied into repo for the run record) ---
    gaps = load_json(GAPS_SRC)
    if gaps is not None:
        shutil.copy(GAPS_SRC, GAPS_DST)
        missing = gaps.get("missing", [])
        sections.append(("highlight gaps report", "PASS",
                         f"{len(missing)} finished major fixtures still lack official highlights"))
    else:
        missing = []
        failures.append("highlight-gaps.json not found - missing-major-highlights list unavailable")
        sections.append(("highlight gaps report", "FAIL", "gaps file missing"))

    # --- 6. orphan check QA ---
    r = run([sys.executable, str(AUTO / "orphan_check.py")], cwd=str(REPO))
    if r.returncode == 0:
        sections.append(("orphan check QA", "PASS", "no new orphan pages"))
    else:
        sections.append(("orphan check QA", "WARN",
                         f"exit {r.returncode}: {r.stdout.strip()[:200]}"))

    # --- gather counts for the report ---
    manifest = load_json(AUTO / "daily-manifest.json")
    payload = homepage_payload()
    scores = load_json(AUTO / "live-score.json")

    n_live = n_up = n_hl = n_heroes = n_leagues = n_majors = n_scores = 0
    if manifest:
        n_hl = len(manifest.get("highlights", []))
    if payload:
        matches = payload.get("matches", [])
        n_live = sum(1 for m in matches if m.get("live"))
        n_up = sum(1 for m in matches if not m.get("live"))
        n_hl = n_hl or len(payload.get("highlights", []))
        n_heroes = len(payload.get("hero", []))
        n_leagues = len(payload.get("leagues", []))
        n_majors = len(payload.get("upcoming_majors", []))
    if scores:
        n_scores = len(scores.get("matches", []))

    sections.insert(0, ("homepage (hero/matches/leagues/upcoming_majors)",
                        "PASS" if manifest_ok else "STALE",
                        f"{n_heroes} hero cards, {n_live} live, {n_up} upcoming, "
                        f"{n_leagues} league sections, {n_majors} upcoming-major cards"
                        + ("" if manifest_ok else " (yesterday's data - pipeline failed)")))
    sections.insert(1, ("live scores (live-score.json)",
                        "PASS" if manifest_ok else "STALE",
                        f"{n_scores} verified live matches" if n_scores
                        else "empty - no verified live scores (intentional, never invented)"))
    sections.insert(2, ("highlights (official YouTube, cap 500)",
                        "PASS" if manifest_ok else "STALE",
                        f"{n_hl} in archive; major-first fixture-verified search + team-clash guard active"))

    # --- 7. write the run report ---
    lines = [
        f"# CricketNow daily refresh — {run_id} (06:00 PKT run)",
        "",
        f"- Run at: {now.isoformat()}",
        f"- Pipeline: {'PASS' if manifest_ok else 'FAIL'}",
        f"- Highlights: {n_hl} total in archive (cap 500, dedupe by video ID, permanent)",
        f"- Fixture-verified search: major-first per-fixture dedicated search "
        f"BEFORE generic channel scan; team-clash guard ON",
        "",
        "## Sections",
        "",
        "| Section | Status | Detail |",
        "|---|---|---|",
    ]
    for name, status, detail in sections:
        lines.append(f"| {name} | {status} | {detail} |")
    lines += [
        "",
        "## Missing major highlights",
        "",
        f"{len(missing)} finished major fixture(s) still lack official highlights "
        f"(from highlight-gaps.json):",
        "",
    ]
    for g in missing:
        lines.append(f"- {g.get('teams', '?')} — {g.get('series', '')} — "
                     f"{g.get('date', '')} — {g.get('venue', '')}".rstrip(" —"))
    if not missing:
        lines.append("- none — every finished major fixture has official highlights")
    lines += ["", "## Failures", ""]
    if failures:
        for f in failures:
            lines.append(f"- {f}")
    else:
        lines.append("- none")
    lines.append("")
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {REPORT}", flush=True)

    # --- 8. commit + push (skipped on dry run) ---
    git_log: list[str] = []
    if DRY_RUN:
        git_log.append("DRY_RUN=1 - nothing committed or pushed")
    else:
        summary = (f"Daily refresh {run_id}: {n_live} live, {n_up} upcoming, "
                   f"{n_hl} highlights, {n_items} news")
        git_log = git_commit_push(REPORT, summary)
    for line in git_log:
        print("git:", line, flush=True)
    if any(l.startswith("FAIL") for l in git_log):
        failures.append("git commit/push failed: " + "; ".join(
            l for l in git_log if l.startswith("FAIL")))

    outcome = "PASS" if manifest_ok and not failures else "FAIL"
    print(f"DAILY REFRESH {outcome}: {n_live} live / {n_up} upcoming / "
          f"{n_hl} highlights / {n_items} news", flush=True)
    return 0 if outcome == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())

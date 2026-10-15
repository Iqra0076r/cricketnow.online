# CricketNow daily refresh — 2026-10-15 (06:00 PKT run)

- Run at: 2026-10-15T05:58:30.073937+05:00
- Pipeline: PASS
- Highlights: 58 total in archive (cap 500, dedupe by video ID, permanent)
- Fixture-verified search: major-first per-fixture dedicated search BEFORE generic channel scan; team-clash guard ON

## Sections

| Section | Status | Detail |
|---|---|---|
| homepage (hero/matches/leagues/upcoming_majors) | PASS | 3 hero cards, 0 live, 9 upcoming, 2 league sections, 0 upcoming-major cards |
| live scores (live-score.json) | PASS | empty - no verified live scores (intentional, never invented) |
| highlights (official YouTube, cap 500) | PASS | 58 in archive; major-first fixture-verified search + team-clash guard active |
| pipeline (publish_manifest.py) | PASS | verify gate PASS; manifest + homepage data + live scores + highlights regenerated |
| schedule pages (matches-today / tomorrow) | PASS | matches-today 3 fixtures, cricket-matches-tomorrow 2 fixtures |
| news (BBC Sport cricket RSS) | PASS | 30 stories, updated 2026-10-15T01:01:40.519917+00:00 |
| channels data (channels.json) | PASS | 23 channel entries intact; streams stay OFF |
| highlight gaps report | PASS | 0 finished major fixtures still lack official highlights |
| orphan check QA | PASS | no new orphan pages |

## Missing major highlights

0 finished major fixture(s) still lack official highlights (from highlight-gaps.json):

- none — every finished major fixture has official highlights

## Failures

- none

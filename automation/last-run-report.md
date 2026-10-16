# CricketNow daily refresh — 2026-10-16 (06:00 PKT run)

- Run at: 2026-10-16T05:58:38.704172+05:00
- Pipeline: PASS
- Highlights: 61 total in archive (cap 500, dedupe by video ID, permanent)
- Fixture-verified search: major-first per-fixture dedicated search BEFORE generic channel scan; team-clash guard ON

## Sections

| Section | Status | Detail |
|---|---|---|
| homepage (hero/matches/leagues/upcoming_majors) | PASS | 3 hero cards, 0 live, 27 upcoming, 5 league sections, 0 upcoming-major cards |
| live scores (live-score.json) | PASS | empty - no verified live scores (intentional, never invented) |
| highlights (official YouTube, cap 500) | PASS | 61 in archive; major-first fixture-verified search + team-clash guard active |
| pipeline (publish_manifest.py) | PASS | verify gate PASS; manifest + homepage data + live scores + highlights regenerated |
| schedule pages (matches-today / tomorrow) | PASS | matches-today 7 fixtures, cricket-matches-tomorrow 7 fixtures |
| news (BBC Sport cricket RSS) | PASS | 30 stories, updated 2026-10-16T01:01:17.924270+00:00 |
| channels data (channels.json) | PASS | 23 channel entries intact; streams stay OFF |
| highlight gaps report | PASS | 0 finished major fixtures still lack official highlights |
| orphan check QA | PASS | no new orphan pages |

## Missing major highlights

0 finished major fixture(s) still lack official highlights (from highlight-gaps.json):

- none — every finished major fixture has official highlights

## Failures

- none

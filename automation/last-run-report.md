# CricketNow daily refresh — 2026-10-26 (06:00 PKT run)

- Run at: 2026-10-26T11:48:40.855128+05:00
- Pipeline: PASS
- Highlights: 61 total in archive (cap 500, dedupe by video ID, permanent)
- Fixture-verified search: major-first per-fixture dedicated search BEFORE generic channel scan; team-clash guard ON

## Sections

| Section | Status | Detail |
|---|---|---|
| homepage (hero/matches/leagues/upcoming_majors) | PASS | 3 hero cards, 19 live, 11 upcoming, 3 league sections, 0 upcoming-major cards |
| live scores (live-score.json) | PASS | 19 verified live matches |
| highlights (official YouTube, cap 500) | PASS | 61 in archive; major-first fixture-verified search + team-clash guard active |
| pipeline (publish_manifest.py) | PASS | verify gate PASS; manifest + homepage data + live scores + highlights regenerated |
| schedule pages (matches-today / tomorrow) | PASS | matches-today 19 fixtures, cricket-matches-tomorrow 2 fixtures |
| news | FAIL | previous bbc-news.json kept |
| channels data (channels.json) | PASS | 23 channel entries intact; streams stay OFF |
| highlight gaps report | PASS | 0 finished major fixtures still lack official highlights |
| orphan check QA | PASS | no new orphan pages |

## Missing major highlights

0 finished major fixture(s) still lack official highlights (from highlight-gaps.json):

- none — every finished major fixture has official highlights

## Failures

- fetch_bbc_news.py FAILED: Traceback (most recent call last):
  File "/usr/lib/python3.12/urllib/request.py", line 1344, in do_open
    h.request(req.get_method(), req.selector, req.data, headers,
  File "/usr/lib/python3.12/http/client.py", line 1365, in request
    self._send_request(method, url, body, headers, encode_chunk

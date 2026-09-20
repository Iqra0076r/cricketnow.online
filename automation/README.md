# CricketNow Daily Production Automation

The production workflow runs every day at **05:00 Asia/Karachi (PKT)**. It uses the latest successful production package as its master copy, verifies current cricket information from reliable sources, removes stale fixtures, updates live and upcoming matches, generates or reuses optimized posters, and refreshes captain-focused hero and live-match artwork for verified current matches. Artwork should use editorial or fictional captain depictions unless approved reference assets are available, must avoid false affiliation and unofficial logos, and should preserve text-safe space for the website UI. The workflow updates the schedule and homepage promotion, runs QA, and deploys only a verified package to the existing Cloudflare Pages project.

The workflow publishes `daily-manifest.json` alongside the site. `daily-refresh.js` is loaded by `index.html` and refreshes open tabs after a new PKT-day manifest is published. If the manifest is unavailable or empty, the existing bundled schedule remains the safe fallback.

## Manifest contract

`daily-manifest.json` is intentionally conservative. Every published match must be verified before it is written. Times are represented in PKT, and finished or unverified fixtures must not be included as upcoming matches.

This directory is part of the deployable website package; it does not expose credentials or Cloudflare account settings.

## Live scores and commentary

The website sidebar and Control Room use `live-score.json` as a safe default feed and poll it without caching. A licensed cricket-data provider can be configured in Control Room by supplying a JSON endpoint. The accepted shape is `{ "updatedAt": "ISO timestamp", "matches": [{ "teams": "Team A vs Team B", "status": "LIVE", "score": "verified score", "commentary": "verified event", "venue": "venue" }] }`. The UI rejects malformed records and shows an unavailable state instead of inventing scores or commentary. The daily workflow must refresh this feed only from an accessible, reliable source and preserve the empty fallback when verification is unavailable.

The feature layer is mounted on `document.body` rather than inside the React root so the Control Room assignment and feed panels survive React route rendering.

## YouTube highlights

The Highlights route reads `highlights-100.json`, which contains 100 unique YouTube embed URLs, original YouTube thumbnail URLs, titles, channels, and watch links. Videos are not downloaded or rehosted. Cards use lazy-loaded square thumbnails and open the selected video in YouTube’s official embed player. The daily workflow should replace the list with the latest verified cricket-match highlights from multiple channels, retain exactly 100 unique videos, preserve channel attribution, and remove unavailable or non-highlight entries.

## Artwork fallback

If image generation fails, the workflow must keep the last successful captain artwork or an existing match poster rather than publishing a broken image path. Every generated image must be checked for a valid file, sensible web dimensions, and a matching manifest reference before deployment.

## BBC Sport news refresh

The public `/news` page reads `bbc-news.json`, which is refreshed by `fetch_bbc_news.py` from the official BBC Sport cricket RSS feed at `https://feeds.bbci.co.uk/sport/cricket/rss.xml`. The included GitHub Actions workflow runs every two hours and commits the refreshed JSON. Enable Actions and grant the repository workflow permission to write contents; the next Cloudflare Pages deployment should publish the updated JSON. The page links back to BBC Sport for the full article and does not republish article body text.

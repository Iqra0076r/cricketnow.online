/* ============================================================
   CricketNow — static SPA (vanilla JS, no build step)
   DATA-DRIVEN ONLY: fixtures/scores/live status come from
   window.__CN_HOMEPAGE (inlined by the bootstrap), plus
   automation/live-score.json, automation/daily-manifest.json
   and automation/channels.json. Nothing is hardcoded.
   ============================================================ */
'use strict';

var RAW_BASE = 'https://raw.githubusercontent.com/Iqra0076r/cricketnow.online/main/automation/';
var STREAMS_ENABLED = false; // Streams paused until AdSense review passes (user decision, 2026-10-12). Flip to true to restore players instantly.

/* ---------------- state ---------------- */
var HP = (typeof window !== 'undefined' && window.__CN_HOMEPAGE) || {};
var CHANNELS = [];        // [{name, category, embed, image}]
var LIVE_SCORES = [];     // [{teams, score, status, venue}]
var MANIFEST = null;      // daily-manifest.json
var CHANNEL_BY_SLUG = {};
var REMINDERS = [];
try { REMINDERS = JSON.parse(localStorage.getItem('cn_reminders') || '[]'); } catch (e) { REMINDERS = []; }

/* ---------------- utils ---------------- */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function slugify(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function fetchWithTimeout(url, ms) {
  ms = ms || 5000;
  return new Promise(function (resolve, reject) {
    var to = setTimeout(function () { reject(new Error('timeout')); }, ms);
    fetch(url, { cache: 'no-store' }).then(function (r) { clearTimeout(to); resolve(r); },
      function (e) { clearTimeout(to); reject(e); });
  });
}
function fetchJSON(name) {
  var urls = [RAW_BASE + name + '?v=' + Date.now(), '/automation/' + name + '?v=' + Date.now()];
  function next(i) {
    if (i >= urls.length) return Promise.resolve(null);
    return fetchWithTimeout(urls[i]).then(function (r) {
      if (!r.ok) throw new Error('bad status');
      return r.json();
    }).catch(function () { return next(i + 1); });
  }
  return next(0);
}
function saveReminders() {
  try { localStorage.setItem('cn_reminders', JSON.stringify(REMINDERS)); } catch (e) {}
}

/* -------- team artwork: REAL stadium photos only (no AI) -------- */
/* All match art comes from real stadium photographs in /media/stadiums/.
   teamArt is a legacy fallback that now returns a real stadium photo. */
var FALLBACK_ART = '/media/stadiums/kingsmead-durban.jpg';
function teamArt(teams) {
  return FALLBACK_ART;
}
function ghostText(label) {
  var letters = String(label || '').replace(/[^a-zA-Z ]/g, ' ').trim().split(/\s+/)
    .map(function (w) { return w.charAt(0); }).join('').slice(0, 4).toUpperCase();
  return letters || 'CN';
}
/* Channel tile images: channels.json keeps byte-identical "image" values;
   bundle tokens resolve here to the copied tile files. */
var BUNDLE_TILES = {
  'criclife-1': '/media/tiles/criclife-1.webp',
  'criclife-2': '/media/tiles/criclife-2.webp',
  'criclife-3': '/media/tiles/criclife-3.webp',
  'a-sports': '/media/tiles/a-sports.webp',
  'astro-cricket': '/media/tiles/astro-cricket.webp',
  'fox-sports-cricket': '/media/tiles/fox-sports-cricket.webp',
  'geo-super': '/media/tiles/geo-super.webp',
  'ptv-sports': '/media/tiles/ptv-sports.webp',
  'sky-sports-cricket': '/media/tiles/sky-sports-cricket.svg',
  'sony-ten-1': '/media/tiles/sony-ten-1.webp',
  'sony-ten-2': '/media/tiles/sony-ten-2.webp',
  'sony-ten-3': '/media/tiles/sony-ten-3.webp',
  'sony-ten-5': '/media/tiles/sony-ten-5.webp',
  'star-sports-1': '/media/tiles/star-sports-1.webp',
  'star-sports-2': '/media/tiles/star-sports-2.webp',
  'star-sports-hindi': '/media/tiles/star-sports-hindi.webp',
  'supersport-cricket': '/media/tiles/supersport-cricket.webp',
  't-sports': '/media/tiles/t-sports.svg',
  'ten-sports': '/media/tiles/ten-sports.webp',
  'willow-cricket': '/media/tiles/willow-cricket.webp',
  'willow-2': '/media/tiles/willow-2.webp',
  'willow-buzz': '/media/tiles/willow-buzz.webp',
  'willow-hd': '/media/tiles/willow-hd.webp'
};
function channelTile(ch) {
  var img = ch && ch.image;
  if (!img) return null;
  if (img.indexOf('bundle:') === 0) return BUNDLE_TILES[img.slice(7)] || null;
  if (img.indexOf('/media/') === 0) {
    var file = img.split('/').pop();
    return '/media/tiles/' + file;
  }
  if (/^https?:\/\//.test(img)) return img;
  return null;
}

/* ---------------- data accessors ---------------- */
function heroItems() { return Array.isArray(HP.hero) ? HP.hero : []; }
function matchItems() { return Array.isArray(HP.matches) ? HP.matches : []; }
function scheduleItems() { return Array.isArray(HP.schedule) ? HP.schedule : []; }
function liveMatches() { return matchItems().filter(function (m) { return m.live === true; }); }
function upcomingMatches() { return matchItems().filter(function (m) { return m.live !== true; }); }
function isLiveScoreEntry(e) { return /live/i.test(e.status || '') || /\(live\)/i.test(e.score || ''); }

/* ---------------- icons ---------------- */
var SVG = {
  play: '<svg viewBox="0 0 16 16"><path d="M4 2l9 6-9 6z"/></svg>',
  playCircle: '<svg viewBox="0 0 16 16"><path d="M4 2l9 6-9 6z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  chevL: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  chevR: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  arrow: '<svg viewBox="0 0 16 16"><path d="M3 8h9M8 4l4 4-4 4" stroke="#fff" stroke-width="2" fill="none"/></svg>',
  brand: '<span class="brand-mark"><svg viewBox="0 0 16 16"><path d="M5 3l8 5-8 5z"/></svg></span>'
};

/* ---------------- shared chrome ---------------- */
var NAV_LINKS = [
  ['/', 'Home'], ['/live-scores', 'Live Scores'], ['/live-tv', 'Live TV'], ['/schedule', 'Schedule'],
  ['/channels', 'Channels'], ['/highlights', 'Highlights'], ['/news', 'News']
];
function navHTML(active) {
  var links = NAV_LINKS.map(function (l) {
    return '<a href="' + l[0] + '" data-link class="' + (l[0] === active ? 'active' : '') + '">' + l[1] + '</a>';
  }).join('');
  return '' +
  '<header class="nav" id="nav"><div class="nav-inner">' +
    '<a class="brand" href="/" data-link aria-label="CricketNow home">' + SVG.brand +
      '<span class="brand-name">Cricket<em>Now</em></span></a>' +
    '<nav class="nav-links" aria-label="Primary">' + links + '</nav>' +
    '<div class="search-wrap">' +
      '<label class="search-pill">' + SVG.search +
        '<input type="search" id="navSearch" placeholder="Search matches, teams, channels…" aria-label="Search" autocomplete="off">' +
      '</label><div class="search-drop" id="searchDrop"></div>' +
    '</div>' +
    '<a class="nav-cta" href="/live-tv/" data-link><span class="pulse-dot"></span>Watch Live</a>' +
    '<button class="burger" id="burger" aria-label="Open menu"><span></span></button>' +
  '</div></header>' +
  '<div class="mmenu" id="mmenu" aria-hidden="true">' +
    '<div class="mmenu-top"><span class="brand-name" style="font-size:20px;font-weight:800">Cricket<em style="font-style:normal;color:var(--green)">Now</em></span>' +
    '<button class="mmenu-close" id="mclose" aria-label="Close menu">✕</button></div>' +
    '<div class="mmenu-search"><label class="search-pill">' + SVG.search +
      '<input type="search" id="mSearch" placeholder="Search matches, teams…" aria-label="Search" autocomplete="off">' +
    '</label></div>' +
    '<a class="btn-primary mmenu-cta" href="/live-tv/" data-link><span class="pulse-dot"></span>Watch Live</a>' +
    links.replace(/class="/g, 'class="mlink ').replace(/data-link/g, 'data-link') +
  '</div>';
}
function footerHTML() {
  return '' +
  '<footer><div class="foot-grid">' +
    '<div class="foot-brand"><a class="brand" href="/" data-link>' + SVG.brand +
      '<span class="brand-name">Cricket<em>Now</em></span></a>' +
      '<p>Your home for live cricket — international series, franchise leagues and 24/7 sports channels, with scores and highlights updated around the clock.</p></div>' +
    '<div class="foot-col"><h4>Explore</h4>' +
      '<a href="/live-scores/" data-link>Live Scores</a><a href="/live-tv/" data-link>Live TV</a><a href="/schedule/" data-link>Schedule</a>' +
      '<a href="/channels/" data-link>Channels</a><a href="/highlights/" data-link>Highlights</a>' +
      '<a href="/news/" data-link>News</a></div>' +
    '<div class="foot-col"><h4>Legal</h4>' +
      '<a href="/about/" data-link>About Us</a><a href="/contact/" data-link>Contact</a>' +
      '<a href="/privacy/" data-link>Privacy Policy</a><a href="/terms/" data-link>Terms of Use</a>' +
      '<a href="/terms#dmca" data-link>DMCA</a></div>' +
    '<div class="foot-col"><h4>Never miss a match</h4>' +
      '<form class="news-form" id="newsForm"><input type="email" placeholder="Email address" aria-label="Email address" required>' +
      '<button type="submit">Join</button></form>' +
      '<p class="foot-note">Match alerts and the weekly schedule, straight to your inbox. No spam, ever.</p></div>' +
  '</div>' +
  '<div class="foot-bar"><div class="foot-bar-inner">' +
    '<span>© 2026 CricketNow. All rights reserved.</span>' +
    '<span>CricketNow is a streaming guide. All trademarks belong to their respective owners.</span>' +
  '</div></div></footer>';
}

/* ---------------- score strip ---------------- */
function scoreChipsHTML() {
  if (!LIVE_SCORES.length) {
    return '<span class="strip-empty">No live scores right now — check the schedule for upcoming fixtures.</span>';
  }
  return LIVE_SCORES.map(function (e) {
    var live = isLiveScoreEntry(e);
    return '<div class="score-chip">' + (live ? '<span class="rdot"></span>' : '') +
      '<span class="t">' + esc(e.teams) + '</span>' +
      '<span class="s">' + esc(e.score) + '</span>' +
      '<span class="st">' + esc(e.status || '') + '</span></div>';
  }).join('');
}
function scoreStripHTML() {
  return '<div class="strip" aria-label="Live scores"><div class="strip-inner" id="scoreStripInner">' + scoreChipsHTML() + '</div></div>';
}
function refreshScores() {
  fetchJSON('live-score.json').then(function (d) {
    if (!d || !Array.isArray(d.matches)) return;
    LIVE_SCORES = d.matches;
    var el = document.getElementById('scoreStripInner');
    if (el) el.innerHTML = scoreChipsHTML(); /* in-place update, no layout shift */
  });
}

/* ---------------- live center (real-time scores) ----------------
   Polls ESPN's public scoreboard API (CORS: Access-Control-Allow-Origin: *)
   every 60 seconds. Shows ONLY what the feed carries: team score strings,
   status, venue. The feed carries no ball-by-ball detail, so none is shown. */
var ESPN_LEAGUES = [
  ['8048', 'Indian Premier League'],
  ['8049', 'Indian Cricket League'],
  ['8050', 'Ranji Trophy'],
  ['8052', 'County Championship Division One'],
  ['18041', 'Shpageeza Cricket League'],
  ['18042', "Women's Big Bash League"],
  ['8046', 'State League Twenty20'],
  ['8045', "Sri Lanka Inter-Provincial Women's T20"]
];
var LIVE_CENTER = { live: [], upcoming: [], results: [], updatedAt: 0, tried: false };
function pkDateTime(iso) {
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(d) + ' PKT';
  } catch (e) { return ''; }
}
function normEvent(league, e) {
  var st = (e.status && e.status.type) || {};
  var comp = (e.competitions && e.competitions[0]) || {};
  var venue = (comp.venue && (comp.venue.fullName || comp.venue.name)) || '';
  var teams = (comp.competitors || []).map(function (c) {
    return { name: (c.team && (c.team.displayName || c.team.name)) || '', score: c.score || '', winner: !!c.winner };
  });
  return { league: league, name: e.name || '', date: e.date || '', state: st.state || '', detail: st.detail || st.description || '', venue: venue, teams: teams };
}
function updatedAgo() {
  if (!LIVE_CENTER.tried) return 'Connecting to the live feed…';
  if (!LIVE_CENTER.updatedAt) return 'Live feed unreachable — showing the daily fixture list.';
  var s = Math.max(0, Math.round((Date.now() - LIVE_CENTER.updatedAt) / 1000));
  if (s < 8) return 'Updated just now';
  if (s < 60) return 'Updated ' + s + 's ago';
  return 'Updated ' + Math.floor(s / 60) + 'm ago';
}
function lcLiveCard(m) {
  var rows = m.teams.map(function (t) {
    return '<div class="lc-row"><span class="lc-team">' + esc(t.name) + '</span>' +
      (t.score ? '<span class="lc-score">' + esc(t.score) + '</span>' : '<span class="lc-noscore">yet to bat</span>') + '</div>';
  }).join('');
  return '<article class="lc-card lc-is-live"><div class="lc-top"><span class="live-badge"><i></i>Live</span>' +
    '<span class="lc-league">' + esc(m.league) + '</span></div>' +
    '<h3 class="lc-name">' + esc(m.name) + '</h3>' + rows +
    (m.venue ? '<p class="lc-venue">' + esc(m.venue) + '</p>' : '') + '</article>';
}
function lcResultCard(m) {
  var rows = m.teams.map(function (t) {
    return '<div class="lc-row"><span class="lc-team' + (t.winner ? ' lc-winner' : '') + '">' + esc(t.name) + (t.winner ? ' ✓' : '') + '</span>' +
      (t.score ? '<span class="lc-score">' + esc(t.score) + '</span>' : '') + '</div>';
  }).join('');
  return '<article class="lc-card"><div class="lc-top"><span class="lc-result-badge">' + esc(m.detail || 'Result') + '</span>' +
    '<span class="lc-league">' + esc(m.league) + '</span></div>' +
    '<h3 class="lc-name">' + esc(m.name) + '</h3>' + rows +
    (m.venue ? '<p class="lc-venue">' + esc(m.venue) + '</p>' : '') + '</article>';
}
function lcUpcomingCard(m) {
  var rows = m.teams.map(function (t) {
    return '<div class="lc-row"><span class="lc-team">' + esc(t.name) + '</span></div>';
  }).join('');
  return '<article class="lc-card"><div class="lc-top"><span class="lc-result-badge lc-sched">' + esc(pkDateTime(m.date) || 'Scheduled') + '</span>' +
    '<span class="lc-league">' + esc(m.league) + '</span></div>' +
    '<h3 class="lc-name">' + esc(m.name) + '</h3>' + rows +
    (m.venue ? '<p class="lc-venue">' + esc(m.venue) + '</p>' : '') + '</article>';
}
function liveNowModuleInner() {
  if (!LIVE_CENTER.tried) {
    return '<div class="wrap"><p class="lc-loading"><span class="rdot"></span>Checking live scores…</p></div>';
  }
  var upd = '<span class="lc-upd">' + esc(updatedAgo()) + '</span>';
  var all = '<a class="lc-viewall" href="/live-scores/" data-link>All live scores ' + SVG.arrow + '</a>';
  if (LIVE_CENTER.live.length) {
    return '<div class="wrap"><div class="lc-hero-head"><span class="live-badge"><i></i>Live Now</span>' + upd + all + '</div>' +
      '<div class="lc-grid">' + LIVE_CENTER.live.slice(0, 4).map(lcLiveCard).join('') + '</div></div>';
  }
  var up = LIVE_CENTER.upcoming.slice(0, 3);
  var upHtml = up.length
    ? '<div class="lc-grid">' + up.map(lcUpcomingCard).join('') + '</div>'
    : '<p class="lc-empty">No fixtures on the live feed right now. See the <a href="/schedule/" data-link>full schedule</a> for upcoming matches.</p>';
  return '<div class="wrap"><div class="lc-hero-head"><span class="lc-quiet-badge">No live matches right now</span>' + upd + all + '</div>' + upHtml + '</div>';
}
function liveNowModuleHTML() {
  return '<section id="liveNowModule" class="lc-hero" aria-label="Live cricket scores">' + liveNowModuleInner() + '</section>';
}
function liveCenterInner() {
  var upd = '<span class="lc-upd">' + esc(updatedAgo()) + '</span>';
  var liveSec = LIVE_CENTER.live.length
    ? '<div class="lc-grid">' + LIVE_CENTER.live.map(lcLiveCard).join('') + '</div>'
    : '<p class="lc-empty">No matches are live right now. Scores appear here automatically the moment play starts — this page refreshes every minute.</p>';
  var resSec = LIVE_CENTER.results.length
    ? '<div class="lc-grid">' + LIVE_CENTER.results.map(lcResultCard).join('') + '</div>'
    : '<p class="lc-empty">No recent results on the live feed.</p>';
  var upSec = LIVE_CENTER.upcoming.length
    ? '<div class="lc-grid">' + LIVE_CENTER.upcoming.map(lcUpcomingCard).join('') + '</div>'
    : '<p class="lc-empty">No upcoming fixtures on the live feed. See the <a href="/schedule/" data-link>full schedule</a>.</p>';
  return '<div class="lc-page-head"><h1>Live Cricket Scores</h1>' + upd +
    '<p class="lc-sub">Real-time scores from matches in play now, refreshed every 60 seconds. Recent results and upcoming fixtures below.</p></div>' +
    '<section class="lc-sec" aria-label="Live matches"><div class="lc-sec-head"><h2><span class="rdot" aria-hidden="true"></span>Live Now</h2></div>' + liveSec + '</section>' +
    '<section class="lc-sec" aria-label="Recent results"><div class="lc-sec-head"><h2>Recent Results</h2></div>' + resSec + '</section>' +
    '<section class="lc-sec" aria-label="Upcoming fixtures"><div class="lc-sec-head"><h2>Coming Up</h2></div>' + upSec + '</section>';
}
function pageLiveScores() {
  return '<main class="wrap page-anim" id="liveCenterWrap">' + liveCenterInner() + '</main>';
}
/* In-place refresh of every live-center surface currently on screen. */
function paintLiveCenter() {
  var mod = document.getElementById('liveNowModule');
  if (mod) mod.innerHTML = liveNowModuleInner();
  var wrap = document.getElementById('liveCenterWrap');
  if (wrap) wrap.innerHTML = liveCenterInner();
  var strip = document.getElementById('scoreStripInner');
  if (strip && LIVE_CENTER.tried && LIVE_CENTER.live.length) {
    strip.innerHTML = LIVE_CENTER.live.slice(0, 10).map(function (m) {
      return '<div class="score-chip"><span class="rdot"></span><span class="t">' + esc(m.name) + '</span>' +
        '<span class="s">' + esc(m.teams.map(function (t) { return t.score; }).filter(Boolean).join(' & ') || 'Live') + '</span>' +
        '<span class="st">' + esc(m.league) + '</span></div>';
    }).join('');
  }
}
function settleLiveCenter(all) {
  var now = Date.now();
  var live = all.filter(function (m) { return m.state === 'in'; })
    .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
  var upcoming = all.filter(function (m) { return m.state === 'pre' && m.date && new Date(m.date).getTime() >= now - 36e5; })
    .sort(function (a, b) { return new Date(a.date) - new Date(b.date); }).slice(0, 8);
  var cutoff = now - 4 * 864e5;
  var results = all.filter(function (m) { return m.state === 'post' && m.date && new Date(m.date).getTime() >= cutoff; })
    .sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 10);
  LIVE_CENTER = { live: live, upcoming: upcoming, results: results, updatedAt: now, tried: true };
  paintLiveCenter();
}
function fetchLiveCenter() {
  var pending = ESPN_LEAGUES.length, all = [];
  ESPN_LEAGUES.forEach(function (L) {
    fetchWithTimeout('https://site.api.espn.com/apis/site/v2/sports/cricket/' + L[0] + '/scoreboard', 12000)
      .then(function (r) { if (!r.ok) throw new Error('bad status'); return r.json(); })
      .then(function (d) { (d.events || []).forEach(function (e) { all.push(normEvent(L[1], e)); }); })
      .catch(function () { /* one league down must not break the center */ })
      .then(function () { if (--pending === 0) settleLiveCenter(all); });
  });
}

/* ---------------- cards ---------------- */
function matchCard(m, i, opts) {
  opts = opts || {};
  var title = m.teams || m.name || '';
  var meta = [m.comp || m.competition, m.meta].filter(Boolean).join(' · ');
  var live = m.live === true;
  var badge = live
    ? '<span class="badge live"><i></i>Live</span>'
    : '<span class="badge time">' + esc(dayLabel(m.time)) + '</span>';
  var href = opts.href || ('/match/' + slugify(title) + '/');
  // Card art priority:
  // 1. Tapmad-style graphic (AI-generated background + REAL captain photos) - 100% Tapmad look
  // 2. Split real captain photos (large, prominent)
  // 3. Bold typographic (never fake, never empty)
  var artInner = '';
  if (m.image && m.image.indexOf('tapmad') !== -1) {
    artInner = '<div class="fill"><img src="' + esc(m.image) + '" alt="' + esc(title) + '" loading="lazy"></div>';
  } else if (m.captainImages && m.captainImages.length === 2) {
    var cnames = (m.captains || '').split(' · ');
    var teams2 = title.split(' vs ');
    artInner = '<div class="cap-split">' +
      '<div class="cap-half"><img src="' + esc(m.captainImages[0]) + '" alt="' + esc(cnames[0] || teams2[0] || 'Captain') + '" loading="lazy">' +
      '<span class="cap-name">' + esc(cnames[0] || teams2[0] || '') + '</span></div>' +
      '<div class="cap-half"><img src="' + esc(m.captainImages[1]) + '" alt="' + esc(cnames[1] || teams2[1] || 'Captain') + '" loading="lazy">' +
      '<span class="cap-name">' + esc(cnames[1] || teams2[1] || '') + '</span></div>' +
      '<span class="cap-vs-big">VS</span></div>';
  } else {
    // No real captain photos: bold typographic duel (never a fake person, never empty)
    var tn = title.split(' vs ');
    artInner = '<div class="type-duel"><span class="type-team">' + esc(ghostText(tn[0] || '')) + '</span>' +
      '<span class="cap-vs-big">VS</span>' +
      '<span class="type-team">' + esc(ghostText(tn[1] || '')) + '</span></div>';
  }
  return '<a class="card" href="' + href + '" data-link aria-label="' + esc(title) + '">' +
    '<div class="card-art">' + artInner +
    '<div class="fade"></div>' + badge +
    '<div class="card-scrim"><span class="play-circle">' + SVG.playCircle + '</span>' +
    '<span class="scrim-label">' + (live ? 'Watch Live' : 'View Details') + '</span></div></div>' +
    '<div class="card-title">' + esc(title) + '</div>' +
    '<div class="card-meta">' + esc(meta) + '</div></a>';
}
function channelCard(ch, liveDot) {
  var tile = channelTile(ch);
  var slug = slugify(ch.name);
  var art = tile
    ? '<div class="fill logo-fill"><img src="' + esc(tile) + '" alt="' + esc(ch.name) + '" loading="lazy"></div>'
    : '<div class="fill art-' + ((slug.length % 8) + 1) + '"></div>';
  return '<a class="card" href="/watch?c=' + slug + '" data-link aria-label="' + esc(ch.name) + '">' +
    '<div class="card-art">' + art +
    '<div class="ghost-sm">' + esc(ghostText(ch.name)) + '</div>' +
    '<div class="fade"></div>' +
    '<span class="badge hd">HD</span>' +
    (liveDot ? '<span class="badge live" style="left:auto;right:10px"><i></i></span>' : '') +
    '<div class="card-scrim"><span class="play-circle">' + SVG.playCircle + '</span>' +
    '<span class="scrim-label">Watch Live</span></div></div>' +
    '<div class="card-title">' + esc(ch.name) + '</div>' +
    '<div class="card-meta">' + esc(ch.category) + '</div></a>';
}
function railHTML(id, title, viewAll, cards) {
  if (!cards) return '';
  return '<section class="rail" aria-label="' + esc(title) + '"><div class="rail-head">' +
    '<h2>' + esc(title) + '</h2><span class="rule"></span>' +
    (viewAll ? '<a class="viewall" href="' + viewAll + '" data-link>View All ' + SVG.chevR + '</a>' : '') +
    '</div><div class="rail-body">' +
    '<button class="rail-arrow left" aria-label="Scroll left">' + SVG.chevL + '</button>' +
    '<div class="rail-track" id="' + id + '">' + cards + '</div>' +
    '<button class="rail-arrow right" aria-label="Scroll right">' + SVG.chevR + '</button>' +
    '</div></section>';
}
function dayLabel(timeStr) {
  var t = String(timeStr || '').toLowerCase();
  if (/live/.test(t)) return 'LIVE';
  if (/today/.test(t)) return 'TODAY';
  if (/tomorrow/.test(t)) return 'TMRW';
  var d = new Date(timeStr);
  if (!isNaN(d)) return ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()];
  return (timeStr || '').slice(0, 6).toUpperCase() || 'SOON';
}
function emptyRail(title, copy, cta) {
  return '<div class="empty"><div class="empty-art art-3" style="border-radius:8px"></div>' +
    '<h3>' + esc(title) + '</h3><p>' + esc(copy) + '</p>' +
    (cta ? '<a class="btn-ghost" href="' + cta[1] + '" data-link>' + esc(cta[0]) + '</a>' : '') + '</div>';
}

/* ============ NEWS ARTICLES (verbatim body copy from sprint/dist/content/news/) ============ */
var ARTICLES = {};
ARTICLES["afghanistan-bangladesh-only-test-preview"] = {"title": "Afghanistan vs Bangladesh, Only Test: a rare five-day meeting with the head-to-head locked at 1–1", "desc": "Test cricket's rarest fixture is back. When Afghanistan and Bangladesh walked out at the Sheikh Zayed Stadium in Abu Dhabi on Friday morning, it was only the th", "date": "2026-10-09", "category": "Previews", "readTime": 6, "body": "<div class=\"meta\"><span class=\"cat\">Previews</span><br>By CricketNow Desk &middot; 2026-10-09</div>\n<p>Test cricket&#x27;s rarest fixture is back. When Afghanistan and Bangladesh walked out at the Sheikh Zayed Stadium in Abu Dhabi on Friday morning, it was only the third time the two sides had ever met in the five-day game — and the ledger could not be more perfectly balanced. Two Tests, two emphatic results, one decider in the desert.</p>\n<p>Bangladesh won the toss and chose to bat first on a dry, scorching morning, and what follows over the next five days will settle an argument that began seven years ago in Chattogram.</p>\n<h2>Match details</h2>\n<ul>\n<li><strong>Fixture:</strong> Afghanistan vs Bangladesh, Only Test</li>\n<li><strong>Dates:</strong> 9–13 October 2026</li>\n<li><strong>Venue:</strong> Sheikh Zayed Stadium, Abu Dhabi</li>\n<li><strong>Toss:</strong> Bangladesh won the toss and elected to bat</li>\n<li><strong>Captains:</strong> Rahmat Shah (Afghanistan), Najmul Hossain Shanto (Bangladesh)</li>\n<li><strong>Umpires:</strong> Allahuddien Paleker (South Africa), Ahsan Raza (Pakistan)</li>\n<li><strong>Start time:</strong> 11:30 AM IST</li>\n<li><strong>Watch:</strong> India — live streaming on FanCode (subscription required; no television telecast). Elsewhere, check local listings.</li>\n</ul>\n<h2>Series context: two Tests, two statements</h2>\n<p>The history of this fixture is short but violent. In September 2019, Afghanistan travelled to Chattogram and produced one of the great away performances by a young Test nation, beating Bangladesh by 224 runs. Rashid Khan was the story of that match, taking five-wicket hauls in both innings as Afghanistan&#x27;s spinners dismantled the hosts on a wearing pitch.</p>\n<p>Bangladesh&#x27;s answer came four years later in Dhaka, and it was even more emphatic: a 546-run demolition in June 2023, built on twin hundreds from a then-emerging Najmul Hossain Shanto. That remains one of the largest margins of victory by runs in Test history, and it redressed the balance completely.</p>\n<p>So here we are at 1–1, on neutral ground, with neither side having managed to land a second blow. A one-off Test is an unforgiving format — there is no second chance to correct a bad session, no dead rubber to blood youngsters. Everything is compressed into five days, and the rivalry, starved of oxygen in the longest format, finally gets room to breathe.</p>\n<h2>The key battle: Afghanistan&#x27;s spin against Bangladesh&#x27;s survival</h2>\n<p>Strip this Test to its essence and it is a contest between Afghanistan&#x27;s spin resources and a Bangladesh batting line-up that has spent years learning how to survive them. Even without Rashid Khan — rested from Test cricket on medical advice to protect his back ahead of important white-ball assignments, the Afghanistan Cricket Board confirmed — Afghanistan have named a spin-heavy attack: Qais Ahmad, Zia-ur-Rehman and Shahidullah Kamal in the XI, with only Yamin Ahmadzai and Mohammad Saleem Safi as specialist seamers.</p>\n<p>Bangladesh, intriguingly, have gone the same way. Nayeem Hasan was drafted into the XI from the reserves to form a three-pronged spin attack alongside Mehidy Hasan Miraz and Taijul Islam, with Hasan Mahmud and Ebadot Hossain leading the pace attack. When both captains independently arrive at spin-heavy XIs, it tells you what they expect of the surface.</p>\n<p>And the surface is expected to misbehave eventually. Shanto said on the eve of the match that he was expecting &quot;a slow wicket which will be good for batting&quot; early on. At the toss, he pointed to the dry surface and the extreme heat as his reasons for batting first: &quot;The wicket is quite dry, and it is very hot as well. I think batting in the second innings will be a little difficult.&quot; With temperatures around 40 degrees Celsius forecast, the team batting last could be in for a genuine examination.</p>\n<h2>Players to watch</h2>\n<p><strong>Rahmat Shah (Afghanistan, captain).</strong> This is Rahmat&#x27;s first assignment as Afghanistan&#x27;s full-time Test captain, and the most experienced red-ball batter in the side carries the dual burden of runs and leadership. Afghanistan have won only four of their 13 Tests since gaining status in 2017; Rahmat&#x27;s tenure will be judged on whether he can turn rare fixtures like this into a habit of competitiveness.</p>\n<p><strong>Qais Ahmad (Afghanistan).</strong> In Rashid&#x27;s absence, the leg-spinner becomes the attack&#x27;s most potent weapon. On a surface both camps expect to turn, Qais&#x27;s ability to bowl long, attacking spells could decide the middle overs of each innings.</p>\n<p><strong>Shahidullah Kamal (Afghanistan).</strong> The recall is earned, not gifted: 538 runs at 76.85 in the Ahmad Shah Abdali first-class tournament. If Afghanistan&#x27;s top order wobbles, the middle-order batter&#x27;s domestic form suggests he belongs at this level.</p>\n<p><strong>Najmul Hossain Shanto (Bangladesh, captain).</strong> The twin hundreds of Dhaka 2023 remain the defining innings of this fixture&#x27;s short history. Shanto arrives in Abu Dhabi having led Bangladesh to a historic Test win over Australia in Darwin — and, by his own admission, determined to treat that as past: &quot;These are new conditions against a new opponent and so we have to plan accordingly.&quot;</p>\n<p><strong>Mehidy Hasan Miraz (Bangladesh).</strong> The all-rounder is the kind of cricketer who decides one-off Tests: capable of a hundred, capable of a five-for, and utterly at home in Asian conditions. With Nayeem and Taijul alongside him, Mehidy can attack without carrying the entire spin workload.</p>\n<p><strong>Mushfiqur Rahim (Bangladesh).</strong> The veteran&#x27;s experience in subcontinental-style conditions is precisely the commodity Bangladesh lacked in Chattogram in 2019. Against a young Afghan attack, his ability to bat long could be the innings that breaks the game open.</p>\n<h2>Selection questions, answered</h2>\n<p>The XIs held few shocks but several statements. Bangladesh&#x27;s big call was Nayeem Hasan&#x27;s inclusion from the reserves — a vote for three spinners over an extra seamer — while Towhid Hridoy, despite a triple century for Bangladesh A, missed out. Shadman Islam was given another opportunity at the top alongside Tanzid Hasan.</p>\n<p>Afghanistan&#x27;s combination is equally spin-weighted: Ismat Alam, recalled after missing the India Test, joins Qais, Zia-ur-Rehman and Shahidullah in an attack with just two specialist quicks. It is a brave selection that backs the surface to do exactly what both captains expect.</p>\n<h2>Venue dossier</h2>\n<p>The Sheikh Zayed Stadium is familiar territory for Afghanistan, who have long staged their home cricket in the UAE. October in Abu Dhabi means fierce daytime heat — the forecast touches 40 degrees — and a dry surface that has historically offered early batting value before deteriorating. Bangladesh have never played a Test in this part of the world; their only UAE experience has come in day-night white-ball cricket. Shanto was honest about the challenge without making it an alibi: &quot;The conditions are a little hot, that will be the case. But as professional players, we don&#x27;t want to see it as an excuse at all.&quot;</p>\n<h2>Three things that will decide it</h2>\n<ol>\n<li><strong>The fourth innings.</strong> Everything both captains said points to the pitch at its most difficult late in the game. The side batting last will need its most disciplined cricket.</li>\n<li><strong>Spin without Rashid.</strong> Afghanistan must prove their attack has depth beyond their superstar. Qais Ahmad&#x27;s series will be watched closely.</li>\n<li><strong>Bangladesh&#x27;s openers.</strong> Tanzid Hasan and Shadman Islam against the new ball will set the tone — survive the first session, and Bangladesh&#x27;s deep batting can build the platform Shanto wants.</li>\n</ul>\n<p>---</p>\n<p><em>Sources: squad and fixture details via Wikipedia (&quot;Bangladeshi cricket team against Afghanistan in the UAE in 2026–27&quot;); pre-match quotes from Najmul Hossain Shanto via <a href=\"https://WWW.cricbuzz.com/cricket-news/140438/najmul-puts-australia-success-in-the-past-gears-up-for-afghanistan-challenge\" target=\"_blank\" rel=\"noopener\">Cricbuzz</a> and <a href=\"https://supersport.com/cricket/news/f246b5f1-ebd1-4b9b-bfbd-83a4d5790b4d/bangladesh-aim-to-keep-progress-going-in-afghanistan-test\" target=\"_blank\" rel=\"noopener\">SuperSport</a>; toss and playing XIs via <a href=\"https://cricfrenzy.com/en/international/171613/JKqQzGiNtv\" target=\"_blank\" rel=\"noopener\">CricFrenzy</a>; broadcast information for India via <a href=\"https://www.livemint.com/sports/cricket-news/afghanistan-vs-bangladesh-one-off-test-live-streaming-when-where-to-watch-afg-vs-ban-in-india-date-time-venue-11791434911119.html\" target=\"_blank\" rel=\"noopener\">LiveMint</a> and <a href=\"https://sportsdigest.in/afghanistan-vs-bangladesh-only-test-2026-live-streaming-in-india/226215/amp/\" target=\"_blank\" rel=\"noopener\">SportsDigest</a>.</em></p>"};
ARTICLES["japan-hong-kong-t20i-rivalry-sano-feature"] = {"title": "Japan vs Hong Kong at Sano: the best Associate rivalry in Asia that nobody previewed", "desc": "Three weeks ago, in front of a small crowd at a ground most cricket fans couldn't find on a map, Japan and Hong Kong played a T20 international that deserved a ", "date": "2026-10-10", "category": "Features", "readTime": 5, "body": "<div class=\"meta\"><span class=\"cat\">Features</span><br>By CricketNow Desk &middot; 2026-10-10</div>\n<p>Three weeks ago, in front of a small crowd at a ground most cricket fans couldn&#x27;t find on a map, Japan and Hong Kong played a T20 international that deserved a far bigger audience. Hong Kong won by four wickets, chasing 96 with five balls to spare. Outside these pages, effectively nobody wrote about it.</p>\n<p>That is the gap CricketNow exists to fill. This is a genuine rivalry between two of Asia&#x27;s most serious Associate programmes: Hong Kong, the region&#x27;s established pathway side with World Cup pedigree, against a Japanese team that has built real infrastructure — its own international ground at Sano — and a playing identity to match. With both teams&#x27; seasons still unfolding, this is the story of Asian Associate cricket&#x27;s most overlooked contest, told properly for once.</p>\n<h2>The rivalry: what happened at Sano</h2>\n<p>The first T20I of Hong Kong&#x27;s tour of Japan, on September 19, was a proper low-scoring scrap. Japan won the toss and chose to bat on their home ground — and immediately discovered how hard Hong Kong&#x27;s bowlers make you work for runs. Ehsan Khan&#x27;s 3 for 18 and Yasim Murtaza&#x27;s 2 for 16 kept Japan to 95 for 7 from their twenty overs, with only Benjamin Ito-Davis (35 from 34 balls) offering sustained resistance.</p>\n<p>Ninety-six should have been a formality. It wasn&#x27;t. Japan&#x27;s bowlers, led by the same Ito-Davis (3 for 11 from four outstanding overs) and Charlie Hara-Hinze (2 for 21), dragged Hong Kong into the deepest of holes, and at 85 for 6 the game was genuinely in the balance. It took Shahid Wasif&#x27;s unbeaten 30 from 31 balls — calm, unhurried, exactly what the situation demanded — and Ehsan Khan&#x27;s 14 not out from 11 to get Hong Kong home: 99 for 6 in 19.1 overs, a four-wicket win sealed with a boundary.</p>\n<p>The second match, scheduled for the following day, was abandoned without a ball bowled. One game, one classic, one washout — the whole emotional range of Associate cricket in 48 hours.</p>\n<h2>Form guide: what the scorecards say</h2>\n<p><strong>Hong Kong&#x27;s last five T20Is</strong> tell the story of a team finding its rhythm at exactly the right time:</p>\n<ul>\n<li>Sep 19: beat Japan by 4 wickets (Sano)</li>\n<li>Sep 20: abandoned vs Japan (Sano)</li>\n<li>Sep 24: lost to Malaysia by 8 wickets (Hong Kong 81 all out)</li>\n<li>Sep 25: beat Oman by 41 runs</li>\n<li>Oct 8: beat Malaysia by 7 runs, DLS (Qualifier B opener, Kuala Lumpur)</li>\n</ul>\n<p>The September 24 defeat to Malaysia — rolled for 81 — looks increasingly like the anomaly, not the norm. Since then: two wins from two, including the rain-affected qualifier opener where Ayush Shukla&#x27;s new-ball burst and Syed Aziz&#x27;s counterattack made it a match worth remembering.</p>\n<p><strong>Japan&#x27;s recent sample is smaller, but instructive:</strong> the narrow loss to Hong Kong at Sano, the abandonment, and then a remarkable footnote — on September 22, India played their first-ever international against Japan at the same ground, a rain-shortened T20I that India won by just 2 runs. Japan pushed one of the sport&#x27;s giants to the final ball on their own patch. That result says more about where Japanese cricket is heading than any ranking ever could.</p>\n<h2>Venue dossier: Sano International Cricket Ground</h2>\n<p>Sano, in Tochigi Prefecture about 100 kilometres north of Tokyo, is the headquarters of the Japan Cricket Association and the spiritual home of the sport in the country. In March 2016, the Sano City Council converted the former Tanuma High School ground into Japan&#x27;s first dedicated, purpose-built cricket venue — a place that would never again have to compete with baseball or football for usage.</p>\n<p>It is a small, intimate ground by international standards: boundaries of roughly 55 metres, capacity around 2,000. But what it lacks in scale it makes up for in character. The low, skiddy surface rewards accurate bowling — as both attacks demonstrated in September — and the ground has hosted everything from East Asia Cup fixtures to ICC pathway qualifiers. When the Asian Games needed a new cricket stadium, one was built at Nisshin near Nagoya; but Sano remains where Japanese cricket lives.</p>\n<h2>Players to watch</h2>\n<p><strong>Shahid Wasif (Hong Kong).</strong> The unbeaten 30 at Sano was a masterclass in chase management, and his 17 not out against Malaysia steadied another wobble. Hong Kong&#x27;s finisher-in-chief is in the form of his life.</p>\n<p><strong>Ehsan Khan (Hong Kong).</strong> Three for 18 with the ball and 14 not out with the bat in the same September game, then 2 for 7 against Malaysia. The genuine all-round article, and Hong Kong&#x27;s most valuable cricketer right now.</p>\n<p><strong>Yasim Murtaza (Hong Kong, captain).</strong> Two for 16 at Sano and the tactical brain behind Hong Kong&#x27;s revival. Leads from the front with his left-arm spin.</p>\n<p><strong>Benjamin Ito-Davis (Japan).</strong> The standout individual of the Sano series: 35 runs and 3 for 11 in the same match. A genuine two-skill cricketer and the face of Japan&#x27;s new generation.</p>\n<p><strong>Charlie Hara-Hinze (Japan).</strong> Two for 21 at Sano, and the kind of lively seam bowling that troubles Associate batting line-ups. Japan&#x27;s new-ball leader.</p>\n<p><strong>Kendel Kadowaki-Fleming (Japan).</strong> Part of the new wave of Japanese-qualified talent coming through the domestic system. The Sano series was another step in his international education.</p>\n<h2>Why it matters</h2>\n<p>Forget the rankings for a moment. What Japan are building — a dedicated home ground, a domestic league feeding the national team, fixtures against Full Members — is the actual infrastructure of cricket&#x27;s global growth. Hong Kong, meanwhile, remain the standard-bearers for what a well-run Associate programme looks like: professional, competitive, and capable of beating anyone on their day, as Malaysia discovered twice in three weeks.</p>\n<p>The pathway ahead is real. The East Asia-Pacific qualifiers for the 2028 men&#x27;s T20 World Cup will be staged in Japan, with matches at both the new Nisshin venue and Sano. For Japan, that is a home World Cup qualifying campaign. For Hong Kong, every fixture against improving opposition is preparation for the Asian qualification battles that define their calendar.</p>\n<p>Nobody previewed Japan vs Hong Kong in September. Next time these two meet — and there will be a next time — it will be harder to ignore them.</p>\n<h2>Where to watch / how to follow</h2>\n<p>Associate fixtures rarely enjoy fixed global broadcast deals. For future Japan and Hong Kong matches, check local listings and the boards&#x27; official channels around match time; ball-by-ball coverage is typically available through the major live-score platforms.</p>\n<p>---</p>\n<p><em>Scorecard data via <a href=\"https://www.crictracker.com/live-scores/japan-vs-hkg-1st-match-t20i-hong-kong-tour-of-japan-19-sep-2026/full-scorecard/\" target=\"_blank\" rel=\"noopener\">CricTracker</a>, <a href=\"https://m.cricbuzz.com/live-cricket-scores/171257/jpn-vs-hkc-1st-t20i-hong-kong-china-tour-of-japan-2026\" target=\"_blank\" rel=\"noopener\">Cricbuzz</a> and <a href=\"https://www.cricketnmore.com/cricket-livescore/scorecard/13072010063/hong-kong-tour-of-japan-t20-1\" target=\"_blank\" rel=\"noopener\">CricketNMore</a>; Sano ground details via <a href=\"https://en.wikipedia.org/wiki/Sano_International_Cricket_Ground\" target=\"_blank\" rel=\"noopener\">Wikipedia</a> and <a href=\"https://www.cricketnews.com/en/cricket/news/sano-international-cricket-ground-japan-boundary-dimensions-size/aec9d2f0a897d7d78339ac1f\" target=\"_blank\" rel=\"noopener\">CricketNews.com</a>; Japan-India September 2026 fixture via <a href=\"https://en.wikipedia.org/wiki/Sano_International_Cricket_Ground\" target=\"_blank\" rel=\"noopener\">Wikipedia</a>.</em></p>"};
ARTICLES["qualifier-b-diary-day1-hong-kong-malaysia"] = {"title": "Qualifier B diary, Day 1: Hong Kong survive the rain — and Malaysia — in a DLS thriller", "desc": "**Result:** Hong Kong 140/5 (20 overs) beat Malaysia 72/5 (10 overs) by 7 runs (DLS method), 3rd Match, ICC Men's T20 World Cup Asia Sub Regional Qualifier B 20", "date": "2026-10-10", "category": "Diaries", "readTime": 4, "body": "<div class=\"meta\"><span class=\"cat\">Diaries</span><br>By CricketNow Desk &middot; 2026-10-10</div>\n<p><strong>Result:</strong> Hong Kong 140/5 (20 overs) beat Malaysia 72/5 (10 overs) by 7 runs (DLS method), 3rd Match, ICC Men&#x27;s T20 World Cup Asia Sub Regional Qualifier B 2026, Selangor Turf Club, Kuala Lumpur.</p>\n<p>The qualifier opened with the exact chaos that makes Associate cricket irresistible. Hong Kong posted 140 for 5, Malaysia&#x27;s chase was twice interrupted — first by Ayush Shukla, then by the Kuala Lumpur rain — and when Duckworth-Lewis-Stern did the final arithmetic, Hong Kong were seven runs to the good. Fourteen days after Malaysia had thrashed them by eight wickets, Hong Kong had their revenge when it mattered.</p>\n<h2>How it was won</h2>\n<p>Hong Kong&#x27;s innings was built the old-fashioned way: one substantial partnership and useful late runs. Zeeshan Ali, keeping wicket and opening, anchored the top order with 48 from 38 balls, and his 63-run stand with Reyansh Sharma (35 off 27) for the second wicket was the spine of the innings. Malaysia&#x27;s spinners fought back impressively through the middle overs — Vijay Unni&#x27;s 4-0-16-3 was the pick of the bowling on either side, and Virandeep Singh&#x27;s 4-0-19-1 kept the scoring honest. When Zeeshan fell with the score at 105, Hong Kong could have subsided; instead Shahid Wasif&#x27;s unbeaten 17 from 14 balls pushed them to 140 for 5, a total that looked competitive without looking safe.</p>\n<p>Malaysia&#x27;s reply began disastrously. Ayush Shukla struck in his first over, removing Nazmus Sakib, and by the time he had also accounted for Aqeel Wahid and Virandeep Singh, Malaysia were three down inside the powerplay and going nowhere. Shukla&#x27;s 3 for 24 from three overs was the definitive new-ball spell of the day.</p>\n<p>Then came Syed Aziz. The Malaysian batter produced the innings of the match — 40 from just 21 balls, with seven fours and a six, played at a strike rate of 190. For a brief, thrilling passage, the chase had a pulse: Aziz was finding the boundary almost at will, and Hong Kong&#x27;s fielders were suddenly the ones under pressure.</p>\n<p>But the rain had the final word. With Malaysia at 72 for 5 after 10 overs — Aziz already dismissed, Ehsan Khan having struck, and the required rate climbing — the weather closed in and no further play was possible. Under DLS, with half the chase gone and five wickets down, Malaysia were seven runs short of the par. Hong Kong took the points without bowling another ball.</p>\n<h2>Key performances</h2>\n<p><strong>Syed Aziz (Malaysia) — 40 (21), 7×4, 1×6.</strong> The innings of the day, and ultimately a losing one. Aziz&#x27;s counterattack was the only passage of play in which Malaysia looked like winning; his dismissal for 40, with the score on the slide, was the moment the chase truly died.</p>\n<p><strong>Ayush Shukla (Hong Kong) — 3-0-24-3.</strong> Three powerplay wickets, including two in the top order, broke Malaysia&#x27;s chase before it could breathe. In a rain-shortened game, early wickets are worth double — Shukla delivered them.</p>\n<p><strong>Vijay Unni (Malaysia) — 4-0-16-3.</strong> The quiet excellence of the day. While Aziz took the headlines, Unni&#x27;s four overs for 16 were the reason Hong Kong never got away to 160-plus. On another day, that spell wins matches.</p>\n<p><strong>Zeeshan Ali (Hong Kong) — 48 (38).</strong> The innings that gave Hong Kong something to defend. Five fours and a six, and the composure to bat through the middle overs when Malaysia&#x27;s spinners were tightening the screws.</p>\n<h2>DLS, in plain English</h2>\n<p>Here&#x27;s what happened, without the textbook. Rain stopped play with Malaysia&#x27;s chase exactly halfway through — 10 of 20 overs bowled, five wickets down, 72 on the board. The Duckworth-Lewis-Stern method exists for precisely this situation: it calculates what a team &quot;should&quot; have scored at the interruption point, given the wickets they&#x27;ve lost and the overs remaining, based on the resources consumed relative to the target.</p>\n<p>Malaysia, five down and well behind the required rate when the rain came, were adjudged seven runs short of par. The margin — &quot;won by 7 runs (DLS method)&quot; — reflects the gap between their 72 and where DLS said they needed to be. It is a cold arithmetic, but a fair one: Hong Kong had banked their full twenty overs and 140 runs; Malaysia had managed neither the runs nor the resource preservation to stay ahead of the equation.</p>\n<h2>What it means</h2>\n<p>First, the immediate: Hong Kong open their campaign with a win, and it is a sweet one. When these sides last met on September 24, Malaysia rolled Hong Kong for 81 and chased it down with eight wickets and eight overs to spare. To reverse that result, in a qualifier, with rain complicating everything, is the kind of statement that builds a campaign.</p>\n<p>Second, the arithmetic. In a short sub-regional qualifier, every win is gold and every net-run-rate decimal can decide who advances. Hong Kong will take the two points and the psychological edge; Malaysia, despite Aziz&#x27;s brilliance, start with a defeat that puts immediate pressure on their remaining group games.</p>\n<p>The race is on — and on Day 1 evidence, it will not lack for drama.</p>\n<p>---</p>\n<p><em>Scorecard data via <a href=\"https://khelnow.com/live-cricket-score/malaysia-vs-hong-kong-icc-men&#x27;s-t20-world-cup-asia-sub-regional-qualifier-b-8th-october-2026-41285\" target=\"_blank\" rel=\"noopener\">Khel Now</a>, <a href=\"https://possible11.com/live-score/mal-vs-hk-19677/\" target=\"_blank\" rel=\"noopener\">Possible11</a> and <a href=\"https://www.crictracker.com/live-scores/mal-vs-hkg-3rd-match-t20i-icc-mens-t20-world-cup-asia-sub-regional-qualifier-b-08-oct-2026/\" target=\"_blank\" rel=\"noopener\">CricTracker</a>; September 24 result via <a href=\"https://www.crictracker.com/live-scores/hkg-vs-mal-2nd-match-t20i-asian-games-in-japan-mens-24-sep-2026/full-scorecard/\" target=\"_blank\" rel=\"noopener\">CricTracker</a>. No verified post-match quotes were available at the time of writing.</em></p>"};

/* ============ HIGHLIGHTS — driven by window.__CN_HOMEPAGE.highlights
   (YouTube videos for finished matches, refreshed daily by the 6 AM pipeline).
   Falls back to the static editorial placeholders only when the feed is empty. ============ */
var HIGHLIGHTS_PLACEHOLDERS = [
  { title: 'Every Wicket: Pakistan v India', comp: 'Champions Trophy Final', meta: '12 wickets · 4 min', dur: '4:00' },
  { title: 'All Boundaries: Aus v Eng', comp: 'Ashes 3rd Test · Day 1', meta: '28 boundaries · 6 min', dur: '6:00' },
  { title: 'Top Catches of the Week', comp: 'Weekly Round-up', meta: '10 catches · 3 min', dur: '3:00' },
  { title: 'Super Over Thriller', comp: 'NZ v SA · 2nd ODI', meta: 'Full super over · 5 min', dur: '5:00' },
  { title: 'Fastest Fifties This Season', comp: 'PSL 2026 Build-up', meta: 'Compilation · 7 min', dur: '7:00' }
];
var HIGHLIGHTS = (function () {
  var hp = (typeof window !== 'undefined' && window.__CN_HOMEPAGE) || {};
  if (hp.highlights && hp.highlights.length) return hp.highlights;
  return HIGHLIGHTS_PLACEHOLDERS;
})();
function isLiveHighlight(h) { return !!(h && h.videoId); }
function highlightCard(h, i) {
  if (isLiveHighlight(h)) {
    var thumb = 'https://i.ytimg.com/vi/' + h.videoId + '/hqdefault.jpg';
    var meta = (h.competition || '') + (h.score ? ' · ' + h.score : '') + (h.date ? ' · ' + h.date : '');
    return '<article class="card hl-video" data-videoid="' + esc(h.videoId) + '" aria-label="' + esc(h.teams + ' highlights') + '">' +
      '<div class="card-art"><img src="' + thumb + '" alt="" loading="lazy">' +
      '<div class="fade"></div>' +
      '<div class="card-scrim"><span class="play-circle">' + SVG.playCircle + '</span>' +
      '<span class="scrim-label">Play</span></div></div>' +
      '<div class="card-title">' + esc(h.teams) + '</div>' +
      '<div class="card-meta">' + esc(meta) + '</div></article>';
  }
  return '<a class="card" href="/highlights/" data-link aria-label="' + esc(h.title) + '">' +
    '<div class="card-art"><div class="fill art-' + ((i % 8) + 1) + '"></div>' +
    '<div class="ghost-sm">' + esc(ghostText(h.title)) + '</div><div class="fade"></div>' +
    '<span class="badge time">' + esc(h.dur) + '</span>' +
    '<div class="card-scrim"><span class="play-circle">' + SVG.playCircle + '</span>' +
    '<span class="scrim-label">Watch</span></div></div>' +
    '<div class="card-title">' + esc(h.title) + '</div>' +
    '<div class="card-meta">' + esc(h.comp + ' · ' + h.meta) + '</div></a>';
}
/* Click-to-play for YouTube highlight cards: swaps the thumbnail for the embed. */
document.addEventListener('click', function (e) {
  var card = e.target && e.target.closest ? e.target.closest('.hl-video') : null;
  if (!card || card.getAttribute('data-playing')) return;
  card.setAttribute('data-playing', '1');
  var art = card.querySelector('.card-art') || card.querySelector('.hero-art');
  if (art) {
    art.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + card.getAttribute('data-videoid') +
      '?autoplay=1&rel=0" title="Match highlights" loading="lazy" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" ' +
      'allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>';
  }
});

/* ============ HERO ============ */
function heroButton(b) {
  if (b && typeof b === 'object') return { label: b.label || 'Watch Now', href: b.href || '/live-tv' };
  return { label: b || 'Watch Now', href: '/live-tv' };
}
function heroHTML() {
  var items = heroItems();
  if (!items.length) {
    var live = liveMatches();
    if (!live.length) return '';
    var m = live[0];
    return '<section class="hero"><div class="hero-static">' +
      '<div class="hero-art"><img src="/media/match-graphics/tapmad-bg-stadium.jpg" alt="" loading="eager"></div>' +
      '<div class="ghost">' + esc(ghostText(m.teams.split(' vs ')[0])) + '</div>' +
      '<div class="hero-scrim-b"></div><div class="hero-scrim-l"></div>' +
      '<div class="hero-copy"><span class="eyebrow"><span class="live-badge"><i></i>Live Now</span>' + esc(m.comp || '') + '</span>' +
      '<h1 class="hero-title">' + esc(m.teams) + '</h1>' +
      '<p class="hero-sub">' + esc(m.time || '') + '</p>' +
      '<div><a class="btn-primary" href="/live-tv/" data-link>' + SVG.play + 'Watch Now</a></div></div>' +
      '</div></section>';
  }
  var slides = items.map(function (s, i) {
    var btn = heroButton(s.button);
    var live = /live/i.test(s.eyebrow || '') || /live/i.test(s.subtitle || '');
    // Hero art: REAL captain photos prominent (no stadiums, no AI)
    var heroArt = '';
    if (s.captainImages && s.captainImages.length === 2) {
      var hcnames = (s.captains || '').split(' · ');
      var hteams = (s.title || '').split(' vs ');
      heroArt = '<div class="hero-art hero-cap-split">' +
        '<div class="hero-cap-half"><img src="' + esc(s.captainImages[0]) + '" alt="' + esc(hcnames[0] || hteams[0] || '') + '" loading="' + (i === 0 ? 'eager' : 'lazy') + '">' +
        '<span class="hero-cap-name">' + esc(hcnames[0] || hteams[0] || '') + '</span></div>' +
        '<div class="hero-cap-half"><img src="' + esc(s.captainImages[1]) + '" alt="' + esc(hcnames[1] || hteams[1] || '') + '" loading="' + (i === 0 ? 'eager' : 'lazy') + '">' +
        '<span class="hero-cap-name">' + esc(hcnames[1] || hteams[1] || '') + '</span></div></div>';
    } else {
      heroArt = '<div class="hero-art"><img src="' + (s.image || teamArt(s.title)) + '" alt="" ' + (i === 0 ? 'loading="eager"' : 'loading="lazy"') + '></div>';
    }
    return '<article class="hero-slide" role="tabpanel" aria-label="Slide ' + (i + 1) + '">' +
      heroArt +
      '<div class="ghost">' + esc(ghostText((s.title || '').split(' vs ')[0])) + '</div>' +
      '<div class="hero-scrim-b"></div><div class="hero-scrim-l"></div>' +
      '<div class="hero-copy">' +
      '<span class="eyebrow">' + (live ? '<span class="live-badge"><i></i>Live Now</span>' : '') + esc(s.eyebrow || '') + '</span>' +
      '<h1 class="hero-title">' + esc(s.title || '') + '</h1>' +
      '<p class="hero-sub">' + esc(s.subtitle || '') + '</p>' +
      '<div><a class="btn-primary" href="' + esc(btn.href) + '" data-link>' + SVG.play + esc(btn.label) + '</a>' +
      (s.watch && s.watch.channel ? '<span class="watch-note">Live on ' + esc(s.watch.channel) + '</span>' : '') + '</div>' +
      '</div></article>';
  }).join('');
  return '<section class="hero" id="hero" aria-label="Featured">' +
    '<div class="hero-viewport"><div class="hero-track" id="heroTrack">' + slides + '</div></div>' +
    '<button class="hero-arrow prev" id="heroPrev" aria-label="Previous slide">' + SVG.chevL + '</button>' +
    '<button class="hero-arrow next" id="heroNext" aria-label="Next slide">' + SVG.chevR + '</button>' +
    '<div class="hero-dots" id="heroDots" role="tablist" aria-label="Slides"></div></section>';
}
var heroTimer = null;
function initHero() {
  var track = document.getElementById('heroTrack');
  if (!track) return;
  var n = track.children.length;
  var dotsBox = document.getElementById('heroDots');
  var idx = 0;
  for (var i = 0; i < n; i++) {
    (function (k) {
      var d = document.createElement('button');
      d.setAttribute('role', 'tab');
      d.setAttribute('aria-label', 'Slide ' + (k + 1));
      d.addEventListener('click', function () { go(k, true); });
      dotsBox.appendChild(d);
    })(i);
  }
  var dots = Array.prototype.slice.call(dotsBox.children);
  var mq = window.matchMedia('(max-width:860px)');
  function go(i, manual) {
    idx = (i + n) % n;
    var step = mq.matches ? 91 : 78, off = mq.matches ? 6 : 12;
    track.style.transform = 'translateX(' + (off - idx * step) + 'vw)';
    dots.forEach(function (d, k) { d.classList.toggle('active', k === idx); });
    if (manual) restart();
  }
  function restart() { clearInterval(heroTimer); heroTimer = setInterval(function () { go(idx + 1); }, 6000); }
  pageTimers.push(function () { clearInterval(heroTimer); });
  document.getElementById('heroPrev').addEventListener('click', function () { go(idx - 1, true); });
  document.getElementById('heroNext').addEventListener('click', function () { go(idx + 1, true); });
  var heroEl = document.getElementById('hero');
  heroEl.addEventListener('mouseenter', function () { clearInterval(heroTimer); });
  heroEl.addEventListener('mouseleave', restart);
  var sx = null;
  heroEl.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; clearInterval(heroTimer); }, { passive: true });
  heroEl.addEventListener('touchend', function (e) {
    if (sx === null) return;
    var dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 48) go(idx + (dx < 0 ? 1 : -1), true);
    sx = null; restart();
  }, { passive: true });
  window.addEventListener('resize', function onRs() {
    if (!document.getElementById('heroTrack')) { window.removeEventListener('resize', onRs); return; }
    go(idx);
  });
  go(0); restart();
}

/* ============ PAGES ============ */
function pageHome() {
  var hero = heroItems(), live = liveMatches(), up = upcomingMatches();
  var chRail = CHANNELS.slice(0, 8).map(function (c) { return channelCard(c, false); }).join('');
  var hl = HIGHLIGHTS.map(highlightCard).join('');
  return heroHTML() + scoreStripHTML() + liveNowModuleHTML() +
    '<main class="wrap page-anim">' +
    (live.length ? railHTML('railLive', 'Live Now', '/live-tv', live.map(function (m, i) { return matchCard(m, i); }).join('')) : '') +
    (up.length ? railHTML('railUpcoming', 'Upcoming Matches', '/schedule', up.map(function (m, i) { return matchCard(m, i); }).join('')) : '') +
    (chRail ? railHTML('railChannels', 'TV Channels', '/channels', chRail) : '') +
    railHTML('railHighlights', 'Highlights', '/highlights', hl) +
    '<section class="band" aria-label="About CricketNow"><div class="band-inner"><div>' +
    '<h3>Every Ball. Every Match. Live.</h3>' +
    '<p>CricketNow brings live international and league cricket together with ' + CHANNELS.length + ' sports channels, ball-by-ball scores and highlights — all in one dark, distraction-free home.</p></div>' +
    '<a class="btn-primary" href="/channels/" data-link>Explore Channels ' + SVG.arrow + '</a></div></section>' +
    '</main>';
}

function channelLiveDot(ch) {
  /* heuristic only: a channel "carries live" if a live match's tv_channels
     (from daily-manifest.json) names it. Never invented. */
  var tv = [];
  try {
    (MANIFEST.matches || []).forEach(function (m) {
      if (/live/i.test(m.time || '') && Array.isArray(m.tv_channels)) tv = tv.concat(m.tv_channels);
    });
  } catch (e) {}
  var n = ch.name.toLowerCase();
  return tv.some(function (t) { return String(t).toLowerCase().indexOf(n) !== -1 || n.indexOf(String(t).toLowerCase().split(' ')[0]) !== -1; });
}
function pageLiveTV() {
  var live = liveMatches();
  var featured;
  if (live.length) {
    var m = live[0];
    featured = '<div class="feature"><div class="hero-art"><img src="' + teamArt(m.teams) + '" alt=""></div>' +
      '<div class="ghost">' + esc(ghostText(m.teams.split(' vs ')[0])) + '</div>' +
      '<div class="hero-scrim-b"></div><div class="hero-scrim-l"></div>' +
      '<div class="feature-copy"><span class="eyebrow"><span class="live-badge"><i></i>Live Now</span>' + esc(m.comp || '') + '</span>' +
      '<h2>' + esc(m.teams) + '</h2><p>' + esc(m.time || '') + '</p>' +
      '<a class="btn-primary" href="/channels/" data-link>' + SVG.play + 'Find a Channel</a></div></div>';
  } else if (CHANNELS.length) {
    var c = CHANNELS[0], tile = channelTile(c);
    featured = '<div class="feature">' + (tile ? '<div class="hero-art"><img src="' + esc(tile) + '" alt=""></div>' : '<div class="hero-art art-1"></div>') +
      '<div class="ghost">' + esc(ghostText(c.name)) + '</div>' +
      '<div class="hero-scrim-b"></div><div class="hero-scrim-l"></div>' +
      '<div class="feature-copy"><span class="eyebrow">' + esc(c.category) + '</span>' +
      '<h2>' + esc(c.name) + '</h2><p>No live matches in the feed right now — pick a channel to watch.</p>' +
      '<a class="btn-primary" href="/watch?c=' + slugify(c.name) + '" data-link>' + SVG.play + 'Watch Now</a></div></div>';
  } else featured = '';
  var grid = CHANNELS.map(function (c) { return channelCard(c, channelLiveDot(c)); }).join('');
  return '<main class="wrap page-anim"><div class="page-head"><h1>Live TV</h1>' +
    '<p>Streaming now across ' + CHANNELS.length + ' channels.</p></div>' +
    featured +
    '<div class="chips-wrap">' + scoreChipsHTML().replace(/<\/?span class="strip-empty"[^>]*>/g, '') + '</div>' +
    (grid ? '<div class="ch-grid">' + grid + '</div>' : emptyRail('No channels available', 'The channel list could not be loaded. Please try again later.', null)) +
    (live.length ? railHTML('railLive2', 'Live Matches', null, live.map(function (m, i) { return matchCard(m, i); }).join('')) : '') +
    '</main>' + scoreStripHTML();
}

function parseSchedDate(item) {
  if (item.live) return 'now';
  var t = String(item.time || '');
  var tl = t.toLowerCase();
  var now = new Date();
  function key(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  if (/today/.test(tl)) return key(now);
  if (/tomorrow/.test(tl)) { var tm = new Date(now.getTime() + 864e5); return key(tm); }
  var d = new Date(t);
  if (!isNaN(d)) return key(d);
  return null;
}
function dateHeading(key) {
  if (key === 'now') return 'HAPPENING NOW';
  var p = key.split('-');
  var d = new Date(p[0], p[1] - 1, p[2]);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
}
function splitTime(t) {
  var s = String(t || '');
  if (/live/i.test(s)) return ['LIVE', 'NOW'];
  var parts = s.split('·').map(function (x) { return x.trim(); });
  if (parts.length >= 2) return [parts[0].toUpperCase().slice(0, 9), parts.slice(1).join(' · ')];
  return ['FIXTURE', s];
}
var schedFilter = 'all';
function pageSchedule() {
  var items = scheduleItems();
  var pills = [['all', 'All'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This Week']]
    .map(function (p) { return '<button class="pill' + (schedFilter === p[0] ? ' active' : '') + '" data-sfilter="' + p[0] + '">' + p[1] + '</button>'; }).join('');
  var now = new Date();
  function inFilter(it) {
    var k = parseSchedDate(it);
    if (schedFilter === 'all') return true;
    if (k === null) return false;
    if (schedFilter === 'today') return k === 'now' || k === dateKeyOf(now);
    if (schedFilter === 'tomorrow') { var tm = new Date(now.getTime() + 864e5); return k === dateKeyOf(tm); }
    if (schedFilter === 'week') {
      if (k === 'now') return true;
      var p = k.split('-'); var d = new Date(p[0], p[1] - 1, p[2]);
      var diff = (d - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5;
      return diff >= 0 && diff < 7;
    }
    return true;
  }
  function dateKeyOf(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  var filtered = items.filter(inFilter);
  var groups = {};
  filtered.forEach(function (it) {
    var k = parseSchedDate(it) || 'undated';
    (groups[k] = groups[k] || []).push(it);
  });
  var order = Object.keys(groups).sort(function (a, b) {
    if (a === 'now') return -1; if (b === 'now') return 1;
    if (a === 'undated') return 1; if (b === 'undated') return -1;
    return a < b ? -1 : 1;
  });
  var body = order.map(function (k) {
    var rows = groups[k].map(function (it) {
      var st = splitTime(it.time);
      var key = it.teams || '';
      var on = REMINDERS.indexOf(key) !== -1;
      var side = it.live
        ? '<span class="pill-live"><i></i>Live</span>'
        : '<button class="remind' + (on ? ' on' : '') + '" data-remind="' + esc(key) + '">' + (on ? 'Saved' : 'Remind Me') + '</button>';
      return '<div class="sched-row"><div class="sched-time"><span class="d">' + esc(st[0]) + '</span><span class="t">' + esc(st[1]) + '</span></div>' +
        '<div class="sched-thumb"><img src="' + teamArt(it.teams) + '" alt="" loading="lazy"></div>' +
        '<div class="sched-main"><div class="teams">' + esc(it.teams || '') + '</div>' +
        '<div class="comp">' + esc(it.competition || it.comp || '') + '</div></div>' +
        '<div class="sched-side">' + side + '</div></div>';
    }).join('');
    var head = k === 'undated' ? 'MORE FIXTURES' : dateHeading(k);
    return '<div class="date-group"><div class="date-head">' + esc(head) + '</div>' + rows + '</div>';
  }).join('');
  if (!items.length) body = emptyRail('No fixtures in the feed', 'The schedule feed is empty right now. Fixtures refresh with the daily automation run.', ['Browse channels', '/channels']);
  else if (!filtered.length) body = emptyRail('Nothing under this filter', 'Try a different date range.', null);
  return '<main class="wrap page-anim"><div class="page-head"><h1>Schedule</h1>' +
    '<p>Fixtures across every competition we cover.</p></div>' +
    '<div class="pill-row" role="tablist" aria-label="Date filter">' + pills + '</div>' +
    '<div id="schedBody">' + body + '</div></main>';
}

function pageChannels() {
  var cats = {};
  CHANNELS.forEach(function (c) { cats[c.category] = true; });
  var catList = Object.keys(cats).sort();
  var active = pageChannelsCat || 'All';
  var pills = ['All'].concat(catList).map(function (c) {
    return '<button class="pill' + (active === c ? ' active' : '') + '" data-cfilter="' + esc(c) + '">' + esc(c) + '</button>';
  }).join('');
  var list = CHANNELS.filter(function (c) { return active === 'All' || c.category === active; });
  var grid = list.map(function (c) { return channelCard(c, false); }).join('');
  return '<main class="wrap page-anim"><div class="page-head"><h1>Channels</h1>' +
    '<p>' + CHANNELS.length + ' sports channels, one click away.</p></div>' +
    '<div class="pill-row">' + pills + '</div>' +
    (grid ? '<div class="ch-grid">' + grid + '</div>'
          : emptyRail('No channels found', 'Try a different category.', null)) + '</main>';
}
var pageChannelsCat = 'All';

/* ============ WATCH ============ */
function findChannel() {
  var q = new URLSearchParams(window.location.search);
  var c = q.get('c'), byName = q.get('channel');
  if (byName) {
    var hit = CHANNELS.find(function (ch) { return ch.name.toLowerCase() === byName.toLowerCase(); });
    if (hit) return hit;
  }
  if (c && CHANNEL_BY_SLUG[c]) return CHANNEL_BY_SLUG[c];
  return null;
}
function pageWatch() {
  var ch = findChannel();
  if (!ch) {
    return '<main class="wrap page-anim"><div class="notfound"><h2>Channel not found</h2>' +
      '<p>We could not find that channel. It may have been renamed or removed.</p>' +
      '<a class="btn-primary" href="/channels/" data-link>Browse Channels</a></div></main>';
  }
  var slug = slugify(ch.name);
  var tile = channelTile(ch);
  var idx = CHANNELS.indexOf(ch);
  var upNext = [];
  for (var i = 1; i <= 6 && i < CHANNELS.length; i++) upNext.push(CHANNELS[(idx + i) % CHANNELS.length]);
  var upHTML = upNext.map(function (u) {
    var t = channelTile(u);
    return '<a class="upnext-row" href="/watch?c=' + slugify(u.name) + '" data-link>' +
      '<div class="upnext-thumb">' + (t ? '<img src="' + esc(t) + '" alt="" loading="lazy">' : '<div class="fill art-2" style="position:absolute;inset:0"></div><span class="ghost-sm">' + esc(ghostText(u.name)) + '</span>') + '</div>' +
      '<div class="upnext-info"><div class="n">' + esc(u.name) + '</div><div class="c">' + esc(u.category) + '</div></div></a>';
  }).join('');
  /* schedule tab: fixtures whose text mentions the channel's region, else next 5 upcoming */
  var region = String(ch.category || '').split('·')[0].trim().toLowerCase();
  var sched = scheduleItems();
  var rel = sched.filter(function (s) {
    var hay = ((s.teams || '') + ' ' + (s.competition || s.comp || '')).toLowerCase();
    return region && hay.indexOf(region) !== -1;
  });
  if (!rel.length) rel = sched.filter(function (s) { return !s.live; }).slice(0, 5);
  var relHTML = rel.length ? rel.map(function (s) {
    return '<div class="kv"><span>' + esc(s.teams || '') + '</span><span>' + esc(s.time || '') + '</span></div>';
  }).join('') : '<p>No fixtures listed for this region right now.</p>';
  var aboutCopy = {
    'pakistan': 'Pakistani sports broadcaster carrying live cricket, including international fixtures and domestic tournaments.',
    'mena': 'Middle East and North Africa cricket broadcaster with ball-by-ball coverage of international and league cricket.',
    'uk': 'UK sports broadcaster with live cricket coverage across the home summer and overseas tours.',
    'australia': 'Australian sports broadcaster covering home internationals, the Big Bash and touring sides.',
    'india': 'Indian sports network broadcasting international cricket and franchise leagues in multiple languages.',
    'south africa': 'South African sports broadcaster with live coverage of the Proteas and domestic competitions.',
    'bangladesh': 'Bangladeshi sports channel covering international cricket and domestic tournaments.',
    'north america': 'North American cricket broadcaster streaming international fixtures and T20 leagues.'
  };
  var about = aboutCopy[region] || 'Sports broadcaster streaming live cricket around the clock.';
  var playerHTML = STREAMS_ENABLED ? (
    '<div class="player-shell" id="player-shell"><iframe src="' + esc(ch.embed) + '" title="' + esc(ch.name) + ' live player" ' +
    'id="live-player-frame" onload="window.__playerLoaded=true" onerror="window.__playerError=true;showPlayerFallback()" ' +
    'allowfullscreen allow="autoplay; fullscreen; picture-in-picture" referrerpolicy="no-referrer"></iframe>' +
    '<div id="player-fallback" style="display:none;position:absolute;inset:0;background:#0a0d10;color:#e8ecef;display:none;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;z-index:5">' +
    '<div style="font-size:48px;margin-bottom:16px">📡</div>' +
    '<h3 style="color:#00E676;margin:0 0 12px">Stream Temporarily Unavailable</h3>' +
    '<p style="color:#9aa4ad;max-width:400px;line-height:1.6">This channel\'s stream source is not responding right now. Try another channel below or check back in a few minutes.</p>' +
    '<button onclick="location.reload()" style="background:#00E676;color:#000;border:0;padding:12px 28px;border-radius:8px;font-weight:bold;cursor:pointer;margin-top:8px">Retry Stream</button>' +
    '</div></div>' +
    '<scr'+'ipt>setTimeout(function(){var f=document.getElementById("live-player-frame");if(f&&!window.__playerLoaded){try{var doc=f.contentDocument;if(!doc||doc.body.innerHTML.trim().length<50){showPlayerFallback();}}catch(e){/* cross-origin, assume loading */}}},15000);function showPlayerFallback(){var fb=document.getElementById("player-fallback");if(fb){fb.style.display="flex";}}</scr'+'ipt>'
  ) : (
    '<div class="player-shell"><div style="position:absolute;inset:0;background:#0a0d10;color:#e8ecef;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px"><div style="font-size:48px;margin-bottom:16px">🏏</div><h3 style="color:#00E676;margin:0 0 12px">Live Streaming Returns Soon</h3><p style="color:#9aa4ad;max-width:420px;line-height:1.6">Channel streams are paused briefly while we complete a platform review. Live scores, schedules and match highlights continue as normal.</p><a href="/highlights/" data-link style="background:#00E676;color:#000;padding:12px 28px;border-radius:8px;font-weight:bold;text-decoration:none;margin-top:8px">Watch Highlights</a></div></div>'
  );
  return '<main class="wrap page-anim">' +
    '<div class="watch-layout"><div>' +
playerHTML +
    '<div class="watch-title"><h2>' + esc(ch.name) + '</h2><span class="pill-live"><i></i>Live</span></div>' +
    '<div class="watch-meta"><span class="pill pill-cat">' + esc(ch.category) + '</span>' +
    '<a class="btn-ghost" style="padding:9px 20px;font-size:12px" href="/contact?channel=' + slug + '&issue=stream" data-link>Report issue</a></div>' +
    scoreStripHTML() +
    '<div class="tabs" role="tablist"><button class="tab active" data-wtab="about" role="tab">About</button>' +
    '<button class="tab" data-wtab="sched" role="tab">Schedule</button></div>' +
    '<div class="tab-panel" id="wtab-about"><p>' + esc(about) + '</p>' +
    '<div class="kv"><span>Stream quality</span><span>HD</span></div>' +
    '<div class="kv"><span>Category</span><span>' + esc(ch.category) + '</span></div></div>' +
    '<div class="tab-panel" id="wtab-sched" hidden><div style="margin-top:4px">' + relHTML + '</div></div>' +
    '</div>' +
    '<aside class="upnext"><h3>Up Next</h3>' + upHTML + '</aside>' +
    '</div></main>';
}

/* ============ HIGHLIGHTS ============ */
function pageHighlights() {
  var list = HIGHLIGHTS;
  var hasVideo = list.some(isLiveHighlight);
  var f = list[0];
  var grid = list.slice(1).map(function (h, i) { return highlightCard(h, i + 1); }).join('');
  var feature;
  if (isLiveHighlight(f)) {
    var fmeta = (f.competition || '') + (f.score ? ' · ' + f.score : '') + (f.date ? ' · ' + f.date : '');
    feature = '<article class="hl-feature hl-video" data-videoid="' + esc(f.videoId) + '" aria-label="' + esc(f.teams + ' highlights') + '">' +
      '<div class="hero-art"><img src="https://i.ytimg.com/vi/' + esc(f.videoId) + '/hqdefault.jpg" alt="" loading="eager"></div>' +
      '<div class="hero-scrim-b"></div><div class="hero-scrim-l"></div>' +
      '<div class="feature-copy"><span class="eyebrow">Latest · ' + esc(f.competition || '') + '</span>' +
      '<h2>' + esc(f.teams) + '</h2><p>' + esc(fmeta) + '</p>' +
      '<span class="btn-primary">' + SVG.play + 'Play Highlights</span></div></article>';
  } else {
    feature = '<a class="hl-feature" href="/highlights/" data-link aria-label="' + esc(f.title) + '">' +
      '<div class="hero-art art-1"></div><div class="ghost">' + esc(ghostText(f.title)) + '</div>' +
      '<div class="hero-scrim-b"></div><div class="hero-scrim-l"></div>' +
      '<div class="feature-copy"><span class="eyebrow">Latest · ' + esc(f.comp) + '</span>' +
      '<h2>' + esc(f.title) + '</h2><p>' + esc(f.meta) + '</p>' +
      '<span class="btn-primary">' + SVG.play + 'Play Highlights</span></div></a>';
  }
  return '<main class="wrap page-anim"><div class="page-head"><h1>Highlights</h1>' +
    '<p>The biggest moments, cut down to the essentials.</p></div>' +
    feature +
    '<div class="hl-grid">' + grid + '</div>' +
    (hasVideo ? '' : '<span class="hl-soon">Full video highlights arrive with the highlights pipeline — these cards are placeholders for now.</span>') + '</main>';
}

/* ============ NEWS ============ */
function newsList() {
  return Object.keys(ARTICLES).map(function (slug) {
    var a = ARTICLES[slug];
    return { slug: slug, title: a.title, desc: a.desc, date: a.date, category: a.category, readTime: a.readTime };
  }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
}
function pageNews() {
  var list = newsList();
  var f = list[0];
  var rows = list.slice(1).map(function (a) {
    return '<a class="news-row" href="/news/' + a.slug + '/" data-link>' +
      '<div class="news-thumb"><img src="/media/captains/hero-stadium-2.jpg" alt="" loading="lazy"></div>' +
      '<div class="news-main"><h3>' + esc(a.title) + '</h3>' +
      '<div class="news-ex">' + esc(a.desc) + '</div>' +
      '<div class="news-meta"><span class="pill pill-cat">' + esc(a.category) + '</span>' +
      '<span>' + esc(a.date) + '</span><span>' + a.readTime + ' min read</span></div></div></a>';
  }).join('');
  return '<main class="wrap page-anim"><div class="page-head"><h1>News</h1>' +
    '<p>Previews, features and diaries from the CricketNow desk.</p></div>' +
    '<div class="news-search"><label class="search-pill">' + SVG.search +
    '<input type="search" id="newsSearch" placeholder="Search articles…" aria-label="Search articles"></label></div>' +
    '<div id="newsList">' +
    '<a class="news-feature" href="/news/' + f.slug + '/" data-link>' +
    '<div class="hero-art"><img src="/media/captains/hero-stadium-3.jpg" alt=""></div>' +
    '<div class="hero-scrim-b"></div><div class="hero-scrim-l"></div>' +
    '<div class="news-feature-copy"><span class="pill pill-cat">' + esc(f.category) + '</span>' +
    '<h2>' + esc(f.title) + '</h2>' +
    '<div class="news-meta"><span>' + esc(f.date) + '</span><span>' + f.readTime + ' min read</span></div></div></a>' +
    '<div id="newsRows">' + rows + '</div></div></main>';
}
function pageArticle(slug) {
  var a = ARTICLES[slug];
  if (!a) return page404();
  var others = newsList().filter(function (x) { return x.slug !== slug; }).slice(0, 4);
  var more = others.map(function (o, i) {
    return '<a class="card" href="/news/' + o.slug + '/" data-link aria-label="' + esc(o.title) + '">' +
      '<div class="card-art"><div class="fill art-' + ((i % 8) + 1) + '"></div>' +
      '<div class="ghost-sm">' + esc(ghostText(o.title)) + '</div><div class="fade"></div>' +
      '<span class="badge time">' + esc(o.category) + '</span></div>' +
      '<div class="card-title">' + esc(o.title) + '</div>' +
      '<div class="card-meta">' + esc(o.date) + ' · ' + o.readTime + ' min read</div></a>';
  }).join('');
  return '<main class="wrap page-anim"><article class="article">' +
    '<span class="pill pill-cat">' + esc(a.category) + '</span>' +
    '<h1>' + esc(a.title) + '</h1>' +
    '<div class="news-meta"><span>' + esc(a.date) + '</span><span>' + a.readTime + ' min read</span><span>By CricketNow Desk</span></div>' +
    '<div class="article-hero"><img src="/media/captains/hero-stadium-3.jpg" alt=""></div>' +
    '<div class="article-body">' + a.body + '</div></article>' +
    '<section class="rail" aria-label="More stories"><div class="rail-head"><h2>More stories</h2>' +
    '<span class="rule"></span><a class="viewall" href="/news/" data-link>View All ' + SVG.chevR + '</a></div>' +
    '<div class="rail-body"><div class="rail-track">' + more + '</div></div></section></main>';
}

/* ============ PROSE PAGES ============ */
function proseShell(eyebrow, h1, updated, inner) {
  return '<main class="wrap page-anim"><div class="prose"><div class="eyebrow">' + esc(eyebrow) + '</div>' +
    '<h1>' + esc(h1) + '</h1><div class="updated">' + esc(updated) + '</div>' + inner + '</div></main>';
}
function pageAbout() {
  var n = CHANNELS.length || 23;
  var liveN = LIVE_SCORES.filter(isLiveScoreEntry).length;
  return proseShell('About CricketNow', 'Cricket coverage, organized for matchday', 'Updated October 2026',
    '<p>CricketNow is a discovery and information platform for cricket viewers. We organize match schedules, channel listings, live coverage links, and highlights into a simple matchday experience.</p>' +
    '<h2>What we publish</h2>' +
    '<p>Our public pages focus on useful match information, channel names, fixture context, and viewer navigation. Channel playback is provided through embedded third-party sources where available; CricketNow does not claim ownership of third-party broadcasts or trademarks.</p>' +
    '<h2>Our editorial approach</h2>' +
    '<p>We aim to keep listings clear, current, and transparent. If you represent a rights holder or find inaccurate information, please <a href="/contact/" data-link>contact us</a> so we can review the listing.</p>' +
    '<h2>CricketNow in numbers</h2>' +
    '<div class="kv"><span>Sports channels</span><span>' + n + '</span></div>' +
    '<div class="kv"><span>Live scores in the feed</span><span>' + liveN + '</span></div>' +
    '<div class="kv"><span>Newsroom stories</span><span>' + Object.keys(ARTICLES).length + '</span></div>' +
    '<h2>Explore CricketNow</h2>' +
    '<p><a href="/schedule/" data-link>Browse the match schedule</a>, <a href="/channels/" data-link>view channels</a>, or <a href="/highlights/" data-link>watch highlights</a>.</p>');
}
function pageContact() {
  var q = new URLSearchParams(window.location.search);
  var chSlug = q.get('channel'), issue = q.get('issue');
  var chName = '';
  if (chSlug && CHANNEL_BY_SLUG[chSlug]) chName = CHANNEL_BY_SLUG[chSlug].name;
  var topic = issue === 'stream' ? 'Stream issue' : 'General';
  var msg = chName ? 'Channel: ' + chName + '\nDescribe the issue (what you see, device, time):\n' : '';
  var pills = ['General', 'Stream issue', 'DMCA'].map(function (t) {
    return '<button type="button" class="pill' + (t === topic ? ' active' : '') + '" data-topic="' + t + '">' + t + '</button>';
  }).join('');
  return proseShell('Contact', 'Get in touch', 'Updated October 2026',
    '<p>For corrections, channel rights concerns, privacy requests, or general feedback, email the CricketNow team at <a href="mailto:contact@cricketnow.online">contact@cricketnow.online</a>.</p>' +
    '<form class="form" id="contactForm">' +
    '<div class="field"><label for="cfName">Name</label><input id="cfName" name="name" type="text" required></div>' +
    '<div class="field"><label for="cfEmail">Email</label><input id="cfEmail" name="email" type="email" required></div>' +
    '<div class="field"><label>Topic</label><div class="topic-row" id="topicRow">' + pills + '</div>' +
    '<input type="hidden" id="cfTopic" value="' + esc(topic) + '"></div>' +
    '<div class="field"><label for="cfMsg">Message</label><textarea id="cfMsg" name="message" required>' + esc(msg) + '</textarea></div>' +
    '<button class="btn-primary" type="submit">Send via Email ' + SVG.arrow + '</button>' +
    '<p class="form-note">Opens your email app addressed to contact@cricketnow.online — no account or backend needed.</p></form>' +
    '<h2>What to include</h2>' +
    '<p>Please include the relevant page URL, the specific issue, and any evidence that helps us review it. We do not ask visitors to send passwords or payment details by email.</p>');
}
function pagePrivacy() {
  return proseShell('Privacy', 'Privacy Policy', 'Updated October 2026',
    '<p>CricketNow respects your privacy. This policy explains the information that may be processed when you use CricketNow.online.</p>' +
    '<h2>Information stored in your browser</h2>' +
    '<p>Some features, such as match reminders, use browser local storage. This information remains on your device unless you clear your browser storage.</p>' +
    '<h2>Advertising and third parties</h2>' +
    '<p>This version of CricketNow does not run advertising or ad scripts, and does not set advertising cookies.</p>' +
    '<h2>Third-party embeds</h2>' +
    '<p>Live players may load content from third-party domains. Those services may process information under their own privacy policies.</p>' +
    '<h2>Contact</h2>' +
    '<p>For privacy questions, email <a href="mailto:contact@cricketnow.online">contact@cricketnow.online</a>.</p>');
}
function pageTerms() {
  return proseShell('Terms', 'Terms of Use', 'Updated October 2026',
    '<p>By using CricketNow.online, you agree to use the website lawfully and respectfully.</p>' +
    '<h2>Listings and availability</h2>' +
    '<p>Schedules, channel listings, embedded players, and highlights may change or become unavailable. CricketNow does not guarantee uninterrupted availability or the accuracy of every third-party listing.</p>' +
    '<h2>Third-party content</h2>' +
    '<p>Some pages embed or link to third-party services. Their content, availability, trademarks, and rights remain with the respective providers. CricketNow does not grant rights to copyrighted broadcasts.</p>' +
    '<h2 id="dmca">DMCA</h2>' +
    '<p>CricketNow respects the intellectual property rights of others. If you believe content accessible through this site infringes your copyright, send a notice to <a href="mailto:contact@cricketnow.online">contact@cricketnow.online</a> including: identification of the copyrighted work, the URL of the allegedly infringing material, your contact details, and a good-faith statement. We review valid notices promptly and remove or disable access where appropriate.</p>' +
    '<h2>Contact</h2>' +
    '<p><a href="mailto:contact@cricketnow.online">contact@cricketnow.online</a></p>');
}
function page404() {
  return '<main class="wrap page-anim"><div class="notfound"><h2>Page not found</h2>' +
    '<p>The page you are looking for does not exist or has moved.</p>' +
    '<a class="btn-primary" href="/" data-link>Back Home</a></div></main>';
}

/* ============ MATCH PAGE (SEO: /match/<slug>) ============ */
function findMatchBySlug(slug) {
  var items = matchItems();
  for (var i = 0; i < items.length; i++) {
    if (slugify(items[i].teams) === slug) return items[i];
  }
  var sched = scheduleItems();
  for (var j = 0; j < sched.length; j++) {
    if (slugify(sched[j].teams) === slug) return sched[j];
  }
  return null;
}
function matchMeta(teams, live, comp) {
  var t = String(teams || '');
  var fmt = /test/i.test(comp || '') ? 'Test' : (/odi|league 2|one day/i.test(comp || '') ? 'ODI' : 'T20');
  var title, desc;
  if (live) {
    title = t + ' Live Streaming — Watch ' + fmt + ' Online | CricketNow';
    desc = 'Watch ' + t + ' live streaming online. ' + fmt + ' cricket with ball-by-ball scores, live stream and match info on CricketNow.';
  } else {
    title = t + ' Live Streaming, Schedule & Preview | CricketNow';
    desc = t + ' ' + fmt + ' — watch live streaming online, check schedule, venue details and match preview on CricketNow.';
  }
  return { title: title, desc: desc, fmt: fmt };
}
function pageMatch(slug) {
  var m = findMatchBySlug(slug);
  if (!m) return page404();
  var teams = m.teams || '';
  var live = m.live === true;
  var comp = m.comp || m.competition || '';
  var parts = String(comp).split('·');
  var series = (parts[0] || '').trim(), venue = (parts[1] || '').trim();
  var meta = matchMeta(teams, live, comp);
  var btn = heroButton(m.watch);
  var badge = live ? '<span class="pill-live"><i></i>Live Now</span>' : '<span class="pill pill-cat">Upcoming</span>';
  var img = m.image || '';
  var score = m.score ? '<div class="match-score">' + esc(m.score) + '</div>' : '';
  var detailRows =
    '<div class="kv"><span>Fixture</span><span>' + esc(teams) + '</span></div>' +
    '<div class="kv"><span>Format</span><span>' + esc(meta.fmt) + '</span></div>' +
    (series ? '<div class="kv"><span>Series</span><span>' + esc(series) + '</span></div>' : '') +
    (venue ? '<div class="kv"><span>Venue</span><span>' + esc(venue) + '</span></div>' : '') +
    (m.time && m.time !== 'LIVE NOW' ? '<div class="kv"><span>Start</span><span>' + esc(m.time) + '</span></div>' : '');
  /* related matches: same series first, then others */
  var others = matchItems().filter(function (x) { return x.teams && x.teams !== teams; });
  var rel = others.filter(function (x) { return series && (x.comp || '').indexOf(series) !== -1; })
    .concat(others.filter(function (x) { return !(series && (x.comp || '').indexOf(series) !== -1); }))
    .slice(0, 6);
  var relHTML = rel.map(function (x) {
    return '<a class="rel-card" href="/match/' + slugify(x.teams) + '" data-link>' +
      (x.image ? '<div class="rel-art"><img src="' + esc(x.image) + '" alt="" loading="lazy"></div>' : '') +
      '<div class="rel-info"><div class="n">' + esc(x.teams) + '</div>' +
      '<div class="c">' + (x.live ? '<span class="pill-live"><i></i>Live</span> ' : '') + esc(x.comp || '') + '</div></div></a>';
  }).join('');
  return '<main class="wrap page-anim"><div class="page-head"><div class="match-badge-row">' + badge +
    '<span class="pill pill-cat">' + esc(meta.fmt) + '</span></div>' +
    '<h1>' + esc(teams) + '</h1><p>' + esc(series || comp) + '</p></div>' +
    (img ? '<div class="match-hero-art"><img src="' + esc(img) + '" alt="' + esc(teams) + ' match graphic"></div>' : '') +
    score +
    '<div class="match-cta"><a class="btn-primary" href="' + esc(btn.href) + '" data-link>' + SVG.play + esc(btn.label) + '</a></div>' +
    '<div class="match-details">' + detailRows + '</div>' +
    (relHTML ? '<section class="rail"><div class="rail-head"><h2>More Matches</h2></div><div class="rel-grid">' + relHTML + '</div></section>' : '') +
    '</main>';
}

/* ============ SEO ============ */
/* Mirror-domain guard: never let the pages.dev staging mirror get indexed —
   canonical domain is cricketnow.online. */
(function () {
  try {
    if (/(^|\.)[a-z0-9-]+\.pages\.dev$/i.test(location.hostname)) {
      var m = document.createElement('meta');
      m.name = 'robots';
      m.content = 'noindex, nofollow';
      document.head.appendChild(m);
    }
  } catch (e) {}
})();
var ROUTE_META = {
  '/': ['Watch Live Cricket Streaming Online — Live Scores & Schedule | CricketNow', 'Watch live cricket streaming online with ball-by-ball scores, fixtures and highlights across 23 sports channels.'],
  '/live-tv': ['Watch Live Cricket Streaming Online — 23 Channels | CricketNow', 'Watch live cricket streaming online across 23 sports channels with live scores and HD streams.'],
  '/schedule': ['Cricket Schedule 2026 — Upcoming Matches, Fixtures & Timings | CricketNow', 'Full cricket schedule 2026: upcoming matches, fixtures, venues and timings across every competition, updated daily.'],
  '/channels': ['Live Cricket TV Channels — Watch 23 Sports Channels Online | CricketNow', 'Watch live cricket TV channels online: 23 sports channels streaming live cricket, one click away.'],
  '/watch': ['Watch Live Cricket — CricketNow', 'Live cricket stream player.'],
  '/live-scores': ['Live Cricket Scores — Real-Time Scores & Results | CricketNow', 'Live cricket scores updated every minute: matches in play now, recent results and upcoming fixtures with venues and PKT start times.'],
  '/highlights': ['Cricket Match Highlights — Latest Videos | CricketNow', 'Watch the latest cricket match highlights videos — the biggest moments, cut down to the essentials.'],
  '/news': ['Cricket News — CricketNow', 'Previews, features and diaries from the CricketNow desk.'],
  '/about': ['About — CricketNow', 'Cricket coverage, organized for matchday.'],
  '/contact': ['Contact — CricketNow', 'Get in touch with the CricketNow team.'],
  '/privacy': ['Privacy Policy — CricketNow', 'How CricketNow handles your information.'],
  '/terms': ['Terms of Use — CricketNow', 'Terms of use and DMCA policy for CricketNow.']
};
function setMeta(route, extra) {
  var m = ROUTE_META[route] || ROUTE_META['/'];
  var title = (extra && extra.title) || m[0];
  var desc = (extra && extra.desc) || m[1];
  document.title = title;
  function setTag(sel, attr, val) {
    var el = document.querySelector(sel);
    if (el) el.setAttribute(attr === 'content' ? 'content' : attr, val);
  }
  setTag('meta[name="description"]', 'content', desc);
  setTag('meta[property="og:title"]', 'content', title);
  setTag('meta[property="og:description"]', 'content', desc);
  setTag('meta[property="og:url"]', 'content', 'https://cricketnow.online' + route);
  setTag('link[rel="canonical"]', 'href', 'https://cricketnow.online' + route);
}

/* ============ ROUTER ============ */
var pageTimers = [];
function clearPageTimers() { pageTimers.forEach(function (fn) { try { fn(); } catch (e) {} }); pageTimers = []; }
function currentRoute() {
  var p = window.location.pathname.replace(/\/+$/, '') || '/';
  return p;
}
function render() {
  clearPageTimers();
  var path = currentRoute();
  var page = document.getElementById('page');
  var html, active = path, metaRoute = path, extra = null;
  if (path === '/') html = pageHome();
  else if (path === '/live-scores') html = pageLiveScores();
  else if (path === '/live-tv') html = pageLiveTV();
  else if (path === '/schedule') html = pageSchedule();
  else if (path === '/channels') html = pageChannels();
  else if (path === '/watch') { html = pageWatch(); }
  else if (path === '/highlights') html = pageHighlights();
  else if (path === '/news') html = pageNews();
  else if (path.indexOf('/news/') === 0) {
    var slug = path.split('/')[2];
    html = pageArticle(slug);
    var a = ARTICLES[slug];
    if (a) { extra = { title: a.title + ' — CricketNow', desc: a.desc }; active = '/news'; metaRoute = '/news/' + slug; }
    else { metaRoute = '/'; }
  }
  else if (path.indexOf('/match/') === 0) {
    var mslug = path.split('/')[2];
    var mm = findMatchBySlug(mslug);
    html = pageMatch(mslug);
    if (mm) {
      var mmeta = matchMeta(mm.teams, mm.live === true, mm.comp || mm.competition || '');
      extra = { title: mmeta.title, desc: mmeta.desc };
      metaRoute = '/match/' + mslug;
      /* SportsEvent JSON-LD for rich results */
      var ld = {
        '@context': 'https://schema.org', '@type': 'SportsEvent',
        name: mm.teams, sport: 'Cricket',
        eventStatus: mm.live ? 'https://schema.org/EventLive' : 'https://schema.org/EventScheduled',
        url: 'https://cricketnow.online/match/' + mslug + '/',
        competitor: String(mm.teams).split(' vs ').map(function (t) { return { '@type': 'SportsTeam', name: t.trim() }; }),
        organizer: { '@type': 'Organization', name: 'CricketNow', url: 'https://cricketnow.online/' }
      };
      if (mm.image) ld.image = 'https://cricketnow.online' + mm.image;
      var oldLd = document.getElementById('match-ld');
      if (oldLd) oldLd.remove();
      var scr = document.createElement('script');
      scr.type = 'application/ld+json'; scr.id = 'match-ld';
      scr.textContent = JSON.stringify(ld);
      document.head.appendChild(scr);
    } else { metaRoute = '/'; }
  }
  else if (path === '/about') html = pageAbout();
  else if (path === '/contact') html = pageContact();
  else if (path === '/privacy') html = pagePrivacy();
  else if (path === '/terms') html = pageTerms();
  else { html = page404(); metaRoute = '/'; }
  page.innerHTML = html;
  window.scrollTo(0, 0);
  paintLiveCenter(); /* fill live-center surfaces immediately if data is in */
  setMeta(metaRoute, extra);
  document.querySelectorAll('.nav-links a').forEach(function (a) {
    a.classList.toggle('active', a.getAttribute('href') === active);
  });
  initHero();
  initRails();
  initWatchTabs();
  initNewsSearch();
}
function navigate(url) {
  if (window.location.pathname + window.location.search === url) return;
  window.history.pushState(null, '', url);
  render();
}

/* ============ interactions ============ */
function initRails() {
  document.querySelectorAll('.rail-body').forEach(function (body) {
    var t = body.querySelector('.rail-track');
    if (!t) return;
    var l = body.querySelector('.left'), r = body.querySelector('.right');
    if (l) l.addEventListener('click', function () { t.scrollBy({ left: -t.clientWidth * 0.8, behavior: 'smooth' }); });
    if (r) r.addEventListener('click', function () { t.scrollBy({ left: t.clientWidth * 0.8, behavior: 'smooth' }); });
  });
}
function initWatchTabs() {
  var tabs = document.querySelectorAll('[data-wtab]');
  if (!tabs.length) return;
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.remove('active'); });
      tab.classList.add('active');
      document.getElementById('wtab-about').hidden = tab.getAttribute('data-wtab') !== 'about';
      document.getElementById('wtab-sched').hidden = tab.getAttribute('data-wtab') !== 'sched';
    });
  });
}
function initNewsSearch() {
  var input = document.getElementById('newsSearch');
  if (!input) return;
  var rowsBox = document.getElementById('newsRows');
  var all = newsList().slice(1);
  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();
    var hits = all.filter(function (a) { return a.title.toLowerCase().indexOf(q) !== -1 || a.desc.toLowerCase().indexOf(q) !== -1; });
    rowsBox.innerHTML = hits.length ? hits.map(function (a) {
      return '<a class="news-row" href="/news/' + a.slug + '/" data-link>' +
        '<div class="news-thumb"><img src="/media/captains/hero-stadium-2.jpg" alt="" loading="lazy"></div>' +
        '<div class="news-main"><h3>' + esc(a.title) + '</h3><div class="news-ex">' + esc(a.desc) + '</div>' +
        '<div class="news-meta"><span class="pill pill-cat">' + esc(a.category) + '</span>' +
        '<span>' + esc(a.date) + '</span><span>' + a.readTime + ' min read</span></div></div></a>';
    }).join('') : '<div class="empty"><h3>No articles found</h3><p>Try a different search term.</p></div>';
  });
}
function buildSearchIndex() {
  var idx = [];
  CHANNELS.forEach(function (c) { idx.push({ type: 'Channel', label: c.name, sub: c.category, go: '/watch?c=' + slugify(c.name) }); });
  matchItems().forEach(function (m) { idx.push({ type: m.live ? 'Live match' : 'Fixture', label: m.teams, sub: m.comp || m.competition || '', go: m.live ? '/live-tv' : '/schedule' }); });
  scheduleItems().forEach(function (s) {
    if (!idx.some(function (x) { return x.label === s.teams; })) idx.push({ type: 'Fixture', label: s.teams, sub: s.competition || '', go: '/schedule' });
  });
  newsList().forEach(function (a) { idx.push({ type: 'News', label: a.title, sub: a.category, go: '/news/' + a.slug + '/' }); });
  return idx;
}
function initGlobal() {
  /* link interception */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-link]');
    if (!a) {
      var plain = e.target.closest('a[href^="/"]');
      if (plain && !plain.getAttribute('target')) a = plain;
    }
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) !== '/') return;
    e.preventDefault();
    closeMenu();
    navigate(href);
  });
  window.addEventListener('popstate', render);
  /* nav shadow */
  window.addEventListener('scroll', function () {
    var n = document.getElementById('nav');
    if (n) n.classList.toggle('scrolled', window.scrollY > 24);
  }, { passive: true });
  /* mobile menu */
  document.getElementById('burger').addEventListener('click', function () {
    var m = document.getElementById('mmenu');
    m.classList.add('open'); m.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  });
  document.getElementById('mclose').addEventListener('click', closeMenu);
  /* rail arrows are per-render; schedule filters + reminders (delegated) */
  document.addEventListener('click', function (e) {
    var sf = e.target.closest('[data-sfilter]');
    if (sf) { schedFilter = sf.getAttribute('data-sfilter'); render(); return; }
    var cf = e.target.closest('[data-cfilter]');
    if (cf) { pageChannelsCat = cf.getAttribute('data-cfilter'); render(); return; }
    var rm = e.target.closest('[data-remind]');
    if (rm) {
      e.preventDefault();
      var k = rm.getAttribute('data-remind');
      var i = REMINDERS.indexOf(k);
      if (i === -1) REMINDERS.push(k); else REMINDERS.splice(i, 1);
      saveReminders(); render(); return;
    }
    var tp = e.target.closest('[data-topic]');
    if (tp) {
      document.querySelectorAll('[data-topic]').forEach(function (x) { x.classList.remove('active'); });
      tp.classList.add('active');
      document.getElementById('cfTopic').value = tp.getAttribute('data-topic');
      return;
    }
  });
  /* search */
  var input = document.getElementById('navSearch'), drop = document.getElementById('searchDrop');
  var sel = -1, results = [];
  function close() { drop.classList.remove('open'); drop.innerHTML = ''; sel = -1; results = []; }
  function paint() {
    if (!results.length) { drop.innerHTML = '<div class="search-empty">No matches. Try a team, channel or competition.</div>'; drop.classList.add('open'); return; }
    var lastType = null, html = '';
    results.forEach(function (r, i) {
      if (r.type !== lastType) { html += '<div class="search-group">' + esc(r.type) + 's</div>'; lastType = r.type; }
      html += '<button class="search-item' + (i === sel ? ' sel' : '') + '" data-sr="' + i + '"><span>' + esc(r.label) + '</span><span class="k">' + esc(r.type) + '</span></button>';
    });
    drop.innerHTML = html; drop.classList.add('open');
  }
  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();
    if (q.length < 2) { close(); return; }
    var idx = buildSearchIndex();
    results = idx.filter(function (x) { return x.label.toLowerCase().indexOf(q) !== -1 || x.sub.toLowerCase().indexOf(q) !== -1; }).slice(0, 12);
    sel = results.length ? 0 : -1;
    paint();
  });
  input.addEventListener('keydown', function (e) {
    if (!drop.classList.contains('open')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, results.length - 1); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[sel]) { close(); input.value = ''; navigate(results[sel].go); } }
    else if (e.key === 'Escape') close();
  });
  drop.addEventListener('click', function (e) {
    var b = e.target.closest('[data-sr]');
    if (!b) return;
    var r = results[+b.getAttribute('data-sr')];
    close(); input.value = '';
    navigate(r.go);
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.search-wrap')) close();
  });
  /* newsletter */
  document.addEventListener('submit', function (e) {
    if (e.target.id === 'newsForm') {
      e.preventDefault();
      e.target.outerHTML = '<p class="foot-note" style="color:var(--green)">You are on the list — match alerts incoming.</p>';
    }
    if (e.target.id === 'contactForm') {
      e.preventDefault();
      var topic = document.getElementById('cfTopic').value;
      var name = document.getElementById('cfName').value;
      var email = document.getElementById('cfEmail').value;
      var msg = document.getElementById('cfMsg').value;
      var subject = encodeURIComponent('[CricketNow] ' + topic + ' — ' + name);
      var body = encodeURIComponent(msg + '\n\n— ' + name + ' (' + email + ')');
      window.location.href = 'mailto:contact@cricketnow.online?subject=' + subject + '&body=' + body;
    }
  });
}
function closeMenu() {
  var m = document.getElementById('mmenu');
  if (!m) return;
  m.classList.remove('open'); m.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/* ============ boot ============ */
function renderShell() {
  document.getElementById('app').innerHTML = navHTML('/') + '<div id="page"></div>' + footerHTML();
}
function boot() {
  renderShell();
  initGlobal();
  render(); /* render immediately with whatever the bootstrap inlined (or empty states) */
  Promise.all([fetchJSON('channels.json'), fetchJSON('live-score.json'), fetchJSON('daily-manifest.json')])
    .then(function (res) {
      if (Array.isArray(res[0])) CHANNELS = res[0];
      if (res[1] && Array.isArray(res[1].matches)) LIVE_SCORES = res[1].matches;
      if (res[2]) MANIFEST = res[2];
      if (res[2] && Array.isArray(res[2].highlights) && res[2].highlights.length) HIGHLIGHTS = res[2].highlights;
      CHANNELS.forEach(function (c) { CHANNEL_BY_SLUG[slugify(c.name)] = c; });
      render(); /* re-render with live data */
    });
  fetchLiveCenter(); /* real-time scores, independent of the daily manifest */
  setInterval(refreshScores, 60000);
  setInterval(fetchLiveCenter, 60000);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

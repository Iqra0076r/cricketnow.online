/* CricketNow daily refresh bridge.
 * The scheduled production workflow publishes automation/daily-manifest.json.
 * This bridge keeps an open tab aligned with the latest published daily manifest
 * without introducing a heavy client dependency or changing the existing app bundle.
 */
(function () {
  'use strict';

  var MANIFEST_URL = '/automation/daily-manifest.json';
  var STORAGE_KEY = 'cricketnow-daily-manifest';
  var REFRESH_KEY = 'cricketnow-daily-refresh';
  var PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

  function pktDateKey(date) {
    var pkt = new Date(date.getTime() + PKT_OFFSET_MS);
    return pkt.toISOString().slice(0, 10);
  }

  function shouldRunToday() {
    var now = new Date();
    var pkt = new Date(now.getTime() + PKT_OFFSET_MS);
    var minutes = pkt.getUTCHours() * 60 + pkt.getUTCMinutes();
    return minutes >= 300;
  }

  function refresh() {
    fetch(MANIFEST_URL + '?v=' + Date.now(), { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('Daily manifest unavailable');
        return response.json();
      })
      .then(function (manifest) {
        if (!manifest || typeof manifest !== 'object') return;
        var dateKey = manifest.date || pktDateKey(new Date());
        var previous = null;
        try { previous = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) {}
        if (manifest.liveMatch !== undefined) {
          if (manifest.liveMatch) localStorage.setItem('cricketnow-live-match', JSON.stringify(manifest.liveMatch));
          else localStorage.removeItem('cricketnow-live-match');
        }
        if (manifest.upcomingMatch !== undefined) {
          if (manifest.upcomingMatch) localStorage.setItem('cricketnow-upcoming-match', JSON.stringify(manifest.upcomingMatch));
          else localStorage.removeItem('cricketnow-upcoming-match');
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(manifest));
        window.dispatchEvent(new CustomEvent('cricketnow:daily-update', { detail: manifest }));

        if (shouldRunToday() && dateKey !== (previous && previous.date)) {
          var refreshed = sessionStorage.getItem(REFRESH_KEY);
          if (refreshed !== dateKey) {
            sessionStorage.setItem(REFRESH_KEY, dateKey);
            window.location.reload();
          }
        }
      })
      .catch(function () {
        // The existing bundled schedule remains the safe fallback if the manifest
        // is temporarily unavailable or the visitor is offline.
      });
  }

  refresh();
  window.setInterval(refresh, 15 * 60 * 1000);
})();

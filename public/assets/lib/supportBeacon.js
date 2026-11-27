/** Supporter beacon. */

import { state } from '../core/dom.js';
import { getVozSupport } from './settings.js';

// Via /forum proxy: carries the proxied xf session (direct voz.vn hits would
// be guest — xf_* cookies live on this origin — and fail where voz is blocked).
const ENDPOINT = '/forum/xfmg.php';
// voz.vn samples 10% of loads; a floor between pings avoids over-reporting.
const MIN_INTERVAL_MS = 60_000;

// Ad telemetry (siropu track-view) is what the supporter score mostly counts;
// mimic one real page view every few hours. Scraping the homepage HTML gives
// the CSRF token + the server-rendered ad items for free.
const TELEMETRY_KEY = 'voz-support-telemetry:v1';
const TELEMETRY_INTERVAL_MS = 6 * 60 * 60 * 1000;

let lastSentAt = 0;

function pixelPing() {
  const device = matchMedia('(max-width: 650px)').matches ? 'm' : 'd';
  const img = new Image();
  img.src = `${ENDPOINT}?s=${device}:u:p1b0r1e0&n=${Math.random().toString(36).slice(2)}`;
}

function parseAdItems(html) {
  // Server-rendered items: <div class="samItem" data-xf-init="sam-item"
  // data-id="255" …> wrapped (or not) in a data-position container.
  const items = [];
  const re = /<div[^>]*class="[^"]*samItem[^"]*"[^>]*data-id="(\d+)"[^>]*>/g;
  let match;
  while ((match = re.exec(html))) {
    // Nearest data-position ahead/behind within a small window; fallback generic.
    const before = html.slice(Math.max(0, match.index - 1200), match.index);
    const posMatches = [...before.matchAll(/data-position="([^"]+)"/g)];
    const position = posMatches.length ? posMatches[posMatches.length - 1][1] : 'forum_overview_top';
    items.push({ id: match[1], position });
  }
  return items;
}

async function sendSamTelemetry() {
  let last = 0;
  try {
    last = Number(localStorage.getItem(TELEMETRY_KEY)) || 0;
  } catch { /* storage unavailable */ }
  if (Date.now() - last < TELEMETRY_INTERVAL_MS) return;
  try {
    const res = await fetch('/forum/', { credentials: 'same-origin' });
    if (!res.ok) return;
    const html = await res.text();
    // Not logged in through the /forum proxy: no xf session → reports count as guest.
    if (!/data-logged-in="true"/.test(html)) return;
    const csrf = (html.match(/csrf:\s*'([^']+)'/) || [])[1];
    if (!csrf) return;
    // window._xfr watchdog: voz writes this token into cookie xf_ls only when
    // ads render. Missing xf_ls reads as adblock — emulate the trail; the
    // proxy forwards xf_* cookies to voz like the real ones.
    const xfr = (html.match(/window\._xfr\s*=\s*"([^"]+)"/) || [])[1];
    if (xfr) {
      try {
        const cur = (document.cookie.match(/(?:^|; )xf_ls=([^;]*)/) || [])[1];
        const list = (cur ? cur.split('_') : []).concat(xfr).slice(-10);
        document.cookie = `xf_ls=${list.join('_')}; path=/; max-age=172800; samesite=lax; secure`;
      } catch { /* ignore */ }
    }
    const items = parseAdItems(html);
    if (!items.length) return;
    await Promise.allSettled(items.map(({ id, position }) => {
      const body = new URLSearchParams({
        position_id: position,
        _xfToken: csrf,
        _xfResponseType: 'json',
        _xfWithData: '1',
      });
      return fetch(`/forum/index.php?sam-item/${encodeURIComponent(id)}/track-view`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: body.toString(),
      });
    }));
    try {
      localStorage.setItem(TELEMETRY_KEY, String(Date.now()));
    } catch { /* ignore */ }
  } catch {
    // Silent: telemetry must never break navigation.
  }
}

export function supportPing() {
  if (!getVozSupport() || !state.loggedIn) return;
  const now = Date.now();
  if (now - lastSentAt >= MIN_INTERVAL_MS) {
    lastSentAt = now;
    pixelPing();
  }
  sendSamTelemetry();
}

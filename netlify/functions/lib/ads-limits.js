// ads-limits.js — the guardrails Dennis chose for ad automation (2026-11-17). One place, so every function enforces the same numbers.
// Stored override: pipeline_state key 'ads_limits' (JSON). Anything missing falls back to these defaults.
const DEFAULTS = {
  monthly_ceiling: 2000,      // $ per month, Meta + Google combined; nothing may propose spend beyond this
  max_cost_per_booking: 150,  // $ per booked evaluation; budget increases blocked above this
  min_bookings_14d: 6,        // bookings in the last 14 days before any budget increase is even proposed
  max_increase_pct: 30,       // largest single budget increase
  increase_cooldown_days: 7,  // one change per campaign per week
  alert_multiple: 1.5,        // text Dennis when a day's spend passes this x the daily budget
  protect_booked_days: 7      // never edit an ad that booked an evaluation in this window
};
const SUPA = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
async function load() {
  try {
    const k = process.env.SUPA_SERVICE_KEY || '';
    const r = await fetch(SUPA + '/pipeline_state?key=eq.ads_limits&select=value', { headers: { apikey: k, Authorization: 'Bearer ' + k } });
    const j = await r.json(); let v = j && j[0] && j[0].value; if (typeof v === 'string') v = JSON.parse(v);
    return Object.assign({}, DEFAULTS, (v && typeof v === 'object') ? v : {});
  } catch (e) { return Object.assign({}, DEFAULTS); }
}
module.exports = { DEFAULTS, load };

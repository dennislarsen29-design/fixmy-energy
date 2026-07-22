// Background-function wrapper for ghl-bulk-sync.js — the portal's "Sync Queue to GHL" button
// (bbDialSyncGHL) posts here directly over HTTP. With hundreds of Black Box leads and a
// GHL-rate-limit sleep between each contact upsert, a synchronous run easily takes minutes —
// far past Netlify's ~10s default function timeout. Netlify was killing the request mid-run and
// returning a non-JSON gateway error page, which made Safari's `r.json()` throw
// "SyntaxError: The string did not match the expected pattern." (WebKit's message for parsing
// non-JSON as JSON). The `-background` filename suffix makes Netlify return 202 immediately and
// let the function run for up to 15 minutes, same as bb-auto-pipeline-background.js's nightly
// in-process call to the same handler.
exports.handler = require('./ghl-bulk-sync.js').handler;

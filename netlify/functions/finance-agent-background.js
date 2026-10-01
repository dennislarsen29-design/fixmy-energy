// finance-agent-background.js — the SCHEDULED entry point for the nightly AI financial advisor.
// The `-background` suffix gives Netlify's 15-minute budget. The plain scheduled function
// was capped at ~30s, but this agent runs a multi-turn Claude + web_search loop that takes
// minutes — so it was being killed silently every night (no report AND no error row).
// Logic lives in finance-agent.js (also used by the manual "Run Analysis Now" button).
exports.handler = require('./finance-agent').handler;

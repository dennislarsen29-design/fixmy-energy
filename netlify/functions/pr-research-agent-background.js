// Scheduled entry point for the weekly PR research agent. The `-background` suffix gives Netlify's
// 15-minute budget (the plain scheduled function is capped near 30s and this runs a multi-turn
// Claude + web_search loop). Logic lives in pr-research-agent.js (also used by "Run research now").
exports.handler = require('./pr-research-agent').handler;

// Scheduled entry point for the weekly content agent (Mondays). The -background suffix gives Netlify's
// 15-minute budget. Logic lives in content-agent.js (also run from the portal's "Draft this week now").
exports.handler = require('./content-agent').handler;

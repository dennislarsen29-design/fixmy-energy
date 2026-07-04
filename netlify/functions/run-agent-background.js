// run-agent-background.js — manually triggers any scheduled agent
// GET /?agent=marketing|socials|bizdev|crm-dev
// Background function (15-min timeout) so agents can complete their full run.

const AGENTS = {
  marketing: require('./marketing-agent'),
  socials:   require('./socials-agent'),
  bizdev:    require('./bizdev-agent'),
  'crm-dev': require('./crm-dev-agent'),
  seo:       require('./seo-agent'),
};

exports.handler = async function(event) {
  const agent = (event.queryStringParameters || {}).agent;
  if (!AGENTS[agent]) {
    return { statusCode: 400, body: 'Unknown agent: ' + agent + '. Use: marketing, socials, bizdev, crm-dev, seo' };
  }
  console.log('[run-agent-background] Manually triggering:', agent);
  try {
    await AGENTS[agent].handler(event);
    console.log('[run-agent-background] Completed:', agent);
    return { statusCode: 200, body: agent + ' completed successfully' };
  } catch(e) {
    console.error('[run-agent-background] Error running ' + agent + ':', e.message);
    return { statusCode: 200, body: 'Error: ' + e.message };
  }
};

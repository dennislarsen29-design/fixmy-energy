// Shared push notification utility — used by all agent functions.
// Requires VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, SUPA_SERVICE_KEY env vars.

const webpush = require('web-push');
const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';
const SUPA_REST = SUPA_URL + '/rest/v1';

async function sendAgentNotification(agentName, itemCount) {
  const vapidPublic  = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const supaKey      = process.env.SUPA_SERVICE_KEY;
  if (!vapidPublic || !vapidPrivate || !supaKey) return;

  webpush.setVapidDetails('mailto:admin@fixmy.energy', vapidPublic, vapidPrivate);

  const resp = await fetch(SUPA_REST + '/push_subscriptions?select=endpoint,p256dh,auth', {
    headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey }
  });
  if (!resp.ok) return;
  const subs = await resp.json();
  if (!subs.length) return;

  const label = agentName.replace('-', ' ');
  const plural = itemCount !== 1 ? 's' : '';
  const payload = JSON.stringify({
    title: 'FixMy.Energy — ' + label + ' agent',
    body:  itemCount + ' new action item' + plural + ' in your Agent Inbox.',
    url:   '/portal.html'
  });

  await Promise.allSettled(subs.map(async function(s) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      );
    } catch(err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        fetch(SUPA_REST + '/push_subscriptions?endpoint=eq.' + encodeURIComponent(s.endpoint), {
          method: 'DELETE',
          headers: { apikey: supaKey, Authorization: 'Bearer ' + supaKey }
        }).catch(function(){});
      }
    }
  }));
}

module.exports = { sendAgentNotification };

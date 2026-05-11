// ONE-TIME USE: Visit /.netlify/functions/vapid-setup to generate your VAPID keys.
// Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to Netlify env vars, then DELETE this file.

exports.handler = async function() {
  const webpush = require('web-push');
  const keys = webpush.generateVAPIDKeys();
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instructions: 'Copy these two values into Netlify → Site config → Environment variables. Then delete netlify/functions/vapid-setup.js from your repo.',
      VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey
    }, null, 2)
  };
};

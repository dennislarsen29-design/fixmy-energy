// Business listings (directory citations) for local SEO. Stored in pipeline_state key 'business_listings'
// (no migration). Every listing needs the owner to sign up and verify by phone, email or postcard, so
// nothing here signs up anywhere: it holds the exact business details to enter, a checklist of sites,
// and a check that reads each live listing page to confirm our name and phone are on it.
const { fetchText, hostOk } = require('./pr-fetch');
const SB = 'https://kbtobyoumvbcxfbugsid.supabase.co/rest/v1';
const KEY = 'business_listings';

// Starting details. confirmed:false until Dennis saves them; the panel shows a warning until then.
const NAP_DEFAULT = {
  name: 'Solar Review',
  phone: '(619) 777-6527',
  website: 'https://fixmy.energy',
  email: 'info@fixmy.energy',
  address_mode: 'hidden', // hidden = service-area business, no street address shown
  address: '',
  service_area: 'San Diego, Los Angeles, Orange, Riverside and San Bernardino counties, CA; Salt Lake and St. George areas, UT',
  category: 'Solar energy contractor',
  categories_extra: 'Solar panel repair; Battery storage installer; Electrical contractor',
  hours: 'Mon-Sat 8am-6pm',
  description: 'Solar Review repairs and upgrades existing home solar systems, including systems whose original installer went out of business. Inverter swaps, warranty claims, diagnostics and battery retrofits.',
  confirmed: false
};

// group: core | home | solar | data | local. cost: free | paid | membership. verify: how the site checks it is you.
const SEED = [
  { id: 'google', name: 'Google Business Profile', url: 'https://business.google.com', group: 'core', cost: 'free', verify: 'video, phone or postcard', note: 'Most important listing. Already exists; make sure the service area covers every county above.' },
  { id: 'bing', name: 'Bing Places', url: 'https://www.bingplaces.com', group: 'core', cost: 'free', verify: 'can import from Google', note: 'Import from your Google profile in a few clicks. Also feeds Microsoft Copilot answers.' },
  { id: 'apple', name: 'Apple Business Connect', url: 'https://businessconnect.apple.com', group: 'core', cost: 'free', verify: 'phone or documents', note: 'Puts you on Apple Maps and Siri on iPhones.' },
  { id: 'yelp', name: 'Yelp for Business', url: 'https://biz.yelp.com', group: 'core', cost: 'free', verify: 'phone', note: 'Free listing. Decline the paid ads offer unless you want it.' },
  { id: 'facebook', name: 'Facebook Page (SOLAReview)', url: 'https://www.facebook.com/business', group: 'core', cost: 'free', verify: 'already owned', note: 'Already set up. Check the phone, website and service area match the details above.' },
  { id: 'nextdoor', name: 'Nextdoor Business', url: 'https://business.nextdoor.com', group: 'core', cost: 'free', verify: 'address or phone', note: 'Neighbors recommend local businesses here. Free page.' },
  { id: 'linkedin', name: 'LinkedIn Company Page', url: 'https://www.linkedin.com/company/setup/new/', group: 'core', cost: 'free', verify: 'company email', note: 'Helps recruiting and gives a trusted profile link.' },
  { id: 'bbb', name: 'Better Business Bureau (free profile)', url: 'https://www.bbb.org', group: 'core', cost: 'free', verify: 'phone / email', note: 'A free business profile is separate from paid accreditation (accreditation was deferred). Ask for the free listing only.' },
  { id: 'angi', name: 'Angi (incl. HomeAdvisor)', url: 'https://www.angi.com/pros', group: 'home', cost: 'free', verify: 'phone', note: 'Free profile; leads cost money. You can list without buying leads.' },
  { id: 'thumbtack', name: 'Thumbtack', url: 'https://www.thumbtack.com/pro', group: 'home', cost: 'free', verify: 'phone', note: 'Free profile; you pay only if you accept leads.' },
  { id: 'houzz', name: 'Houzz', url: 'https://www.houzz.com/professionals', group: 'home', cost: 'free', verify: 'email', note: 'Free pro profile.' },
  { id: 'porch', name: 'Porch', url: 'https://pro.porch.com', group: 'home', cost: 'free', verify: 'phone', note: 'Free pro profile.' },
  { id: 'energysage', name: 'EnergySage', url: 'https://www.energysage.com', group: 'solar', cost: 'membership', verify: 'application', note: 'Solar marketplace. Mostly for new installs; ask whether repair/battery companies can list.' },
  { id: 'solarreviews', name: 'SolarReviews.com', url: 'https://www.solarreviews.com', group: 'solar', cost: 'free', verify: 'application', note: 'Installer directory. Similar name to ours, so a profile there also helps people who mix the two up.' },
  { id: 'calssa', name: 'CALSSA member directory', url: 'https://calssa.org', group: 'solar', cost: 'membership', verify: 'membership', note: 'California solar trade group. Paid membership; directory link is a strong local signal.' },
  { id: 'seia', name: 'SEIA member directory', url: 'https://www.seia.org', group: 'solar', cost: 'membership', verify: 'membership', note: 'National solar trade group. Paid; optional.' },
  { id: 'dataaxle', name: 'Data Axle (business data feed)', url: 'https://www.data-axle.com', group: 'data', cost: 'free', verify: 'phone', note: 'Feeds many smaller directories and GPS systems. One correct entry spreads widely.' },
  { id: 'foursquare', name: 'Foursquare', url: 'https://business.foursquare.com', group: 'data', cost: 'free', verify: 'phone', note: 'Feeds location data to many apps.' },
  { id: 'yp', name: 'Yellow Pages (yp.com)', url: 'https://www.yellowpages.com', group: 'data', cost: 'free', verify: 'phone', note: 'Free basic listing.' },
  { id: 'manta', name: 'Manta', url: 'https://www.manta.com', group: 'data', cost: 'free', verify: 'email', note: 'Small-business directory, free listing.' },
  { id: 'sdchamber', name: 'San Diego Regional Chamber of Commerce', url: 'https://sdchamber.org', group: 'local', cost: 'membership', verify: 'membership', note: 'Paid membership. Chamber directory links are trusted local signals.' },
  { id: 'escondidochamber', name: 'Escondido Chamber of Commerce', url: 'https://www.escondidochamber.org', group: 'local', cost: 'membership', verify: 'membership', note: 'Home base city. Often cheaper than the regional chamber.' },
  { id: 'utahchamber', name: 'Salt Lake Chamber', url: 'https://slchamber.com', group: 'local', cost: 'membership', verify: 'membership', note: 'Only once the Utah business is active.' }
];
const STATUSES = ['not_started', 'submitted', 'verifying', 'live', 'skip'];

function headers(k) { return { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }; }

async function load(k) {
  const r = await fetch(SB + '/pipeline_state?key=eq.' + KEY + '&select=value', { headers: headers(k) });
  const rows = r.ok ? await r.json() : [];
  let v = rows[0] && rows[0].value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  if (!v || !Array.isArray(v.items)) v = { nap: Object.assign({}, NAP_DEFAULT), items: [] };
  if (!v.nap) v.nap = Object.assign({}, NAP_DEFAULT);
  // Add any seed sites not yet in the saved list (keeps progress on existing ones).
  SEED.forEach(function (s) { if (!v.items.some(function (x) { return x.id === s.id; })) v.items.push(Object.assign({ status: 'not_started', listing_url: '', check: null }, s)); });
  return v;
}
async function save(k, v) {
  const r = await fetch(SB + '/pipeline_state', { method: 'POST', headers: Object.assign({ Prefer: 'resolution=merge-duplicates' }, headers(k)), body: JSON.stringify({ key: KEY, value: JSON.stringify(v), updated_at: new Date().toISOString() }) });
  return r.ok;
}

// Read a live listing page and see whether our name and phone are on it. Many big sites block
// automated reads; that reports 'blocked' and never overwrites a previous good result.
async function checkItem(item, nap) {
  const at = new Date().toISOString();
  if (!item.listing_url) return { result: 'no_url', at };
  if (!hostOk(item.listing_url)) return { result: 'bad_url', at };
  const page = await fetchText(item.listing_url, 9000);
  if (!page.ok) {
    const blocked = page.status === 403 || page.status === 429 || page.status === 999 || page.error === 'timeout';
    return { result: blocked ? 'blocked' : 'unreachable', status: page.status || null, at };
  }
  const text = page.text.replace(/<[^>]*>/g, ' ');
  const digits = text.replace(/\D/g, '');
  const want = String(nap.phone || '').replace(/\D/g, '').slice(-10);
  const hasPhone = want.length === 10 && digits.indexOf(want) > -1;
  const hasName = new RegExp(String(nap.name || 'Solar Review').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text);
  const hasSite = /fixmy\.energy/i.test(page.text);
  let result = 'mismatch';
  if (hasName && hasPhone) result = 'match';
  else if (hasName) result = 'name_only';
  else if (hasPhone) result = 'phone_only';
  return { result, has_name: hasName, has_phone: hasPhone, has_site: hasSite, status: page.status, at };
}

function mergeCheck(item, c) {
  const prevGood = item.check && item.check.result === 'match';
  if ((c.result === 'blocked' || c.result === 'unreachable') && prevGood) {
    item.check = Object.assign({}, item.check, { last_try: c.at, last_try_result: c.result });
  } else item.check = c;
}

module.exports = { NAP_DEFAULT, SEED, STATUSES, load, save, checkItem, mergeCheck };

// Content engine — weekly drafting agent (2026-11-23, per Dennis).
// Drafts ONE blog article + THREE short posts for the week into content_posts (status 'draft').
// Nothing is published here: Dennis approves each item in the portal (Agents -> Content), then
// content-publish posts it at its scheduled time. Builds on the Google Business posts already written
// (agent_reports agent='gbp') for voice and to avoid repeating topics.
// Manual run: run-agent-background?agent=content (add &force=1 to draft a second batch for the same week).
// Env: ANTHROPIC_KEY, SUPA_SERVICE_KEY.
const C = require('./lib/content');
let feedback = { loadFeedback: async function () { return { text: '', ids: [] }; } };
try { feedback = require('./lib/agent-replies'); } catch (e) {}

const SYSTEM = [
  'You are the content writer for Solar Review (website fixmy.energy, phone (619) 777-6527), a solar diagnostics, repair, warranty-claim and battery company.',
  'We service systems from ANY installer, including companies that went out of business (SunPower, Titan Solar, Sunnova, Sullivan Solar, Freedom Forever and others). Services: free solar evaluation, diagnostics, inverter repair/replacement, warranty claims, Tesla Powerwall battery add-ons, system expansions, new solar through partners.',
  'Service area for copy: California (San Diego and Southern California first), Utah, Texas, Wyoming and Colorado.',
  'Voice: a regular homeowner who has spent about a decade in solar talking to neighbors. Plain words, short sentences, specific and useful, never hype.',
  'HARD RULES (every piece): no prices, no dollar figures, no savings amounts, no incentive or rebate amounts, no percentages, no review counts, no "guarantee". Incentives "may" be available, eligibility is set by others. Never claim to be certified by, partnered with or authorized by a manufacturer (Tesla, SolarEdge, Enphase, etc.). Never invent statistics, customer stories, quotes or names. Do not name a specific customer. Only state facts that are generally true and widely documented; when unsure, leave it out.',
  'California facts you may use: grid-tied solar without a battery shuts off during an outage (anti-islanding, a safety rule); electricity costs most roughly 4-9 pm when solar output has dropped; a NEM true-up settles a year of credits at once; manufacturer warranties usually survive an installer closing, what is lost is the company that files the claim and does the labor; a system can underperform while looking normal from the ground.',
  'BLOG: 900-1400 words, written to answer one real homeowner search question. Use h2 sections (4-6), short paragraphs, a list where it helps. Link to 2-4 of our existing pages using root-relative links from the list you are given (e.g. /blog/sunpower-out-of-business, /book). No external links. Do not include a title h1, CTA boxes or an FAQ section in body_html (the page adds those). 3-4 FAQ items that a homeowner would actually ask, answers 1-3 sentences. Pick a topic NOT already covered by an existing blog page.',
  'SHORT POSTS: three different topics, different from each other and from the recent Google Business posts. For each give: gbp (Google Business Profile, 600-1100 characters, no hashtags, ends with "Call (619) 777-6527 or book a free evaluation at fixmy.energy"); facebook (500-900 characters, friendly, 0-2 hashtags, ends with the same call to action); instagram (300-700 characters, hook in the first line, 4-7 relevant hashtags at the end, says "link in bio" instead of a URL); nextdoor (350-700 characters, neighbor-to-neighbor tone from Dennis, no hashtags, no hard sell, ends with the phone number). At most one emoji per post.',
  'One short post per week should be a practical tip (how to check your system, what an error light means), one should explain a service, and one can be timely or seasonal (outages, heat, true-up season, holidays) for the week given.'
].join('\n');

const TOOL = {
  name: 'submit_content_batch',
  description: 'Submit this week\'s blog article and three short posts.',
  input_schema: {
    type: 'object',
    required: ['blog', 'shorts'],
    properties: {
      blog: {
        type: 'object',
        required: ['title', 'slug', 'meta_description', 'eyebrow', 'lede', 'body_html', 'faq', 'related', 'image_hint'],
        properties: {
          title: { type: 'string', description: '45-65 characters, the search question or answer' },
          slug: { type: 'string', description: 'lowercase-words-with-dashes, 3-7 words, not an existing slug' },
          meta_description: { type: 'string', description: '120-158 characters' },
          eyebrow: { type: 'string', description: '2-4 word category, e.g. "Inverter Repair"' },
          lede: { type: 'string', description: '1-2 sentence summary shown under the title' },
          body_html: { type: 'string', description: 'Article body using only h2, h3, p, ul, ol, li, strong, em, a' },
          faq: { type: 'array', items: { type: 'object', required: ['q', 'a'], properties: { q: { type: 'string' }, a: { type: 'string' } } } },
          related: { type: 'array', items: { type: 'object', required: ['href', 'label'], properties: { href: { type: 'string' }, label: { type: 'string' } } } },
          image_hint: { type: 'string', description: 'Which kind of photo fits: inverter | array | roof | battery | panel | any' }
        }
      },
      shorts: {
        type: 'array', minItems: 3, maxItems: 3,
        items: {
          type: 'object', required: ['topic', 'headline', 'gbp', 'facebook', 'instagram', 'nextdoor', 'image_hint'],
          properties: {
            topic: { type: 'string' },
            headline: { type: 'string', description: '3-7 words, used as the text on a branded image' },
            gbp: { type: 'string' }, facebook: { type: 'string' }, instagram: { type: 'string' }, nextdoor: { type: 'string' },
            image_hint: { type: 'string', description: 'inverter | array | roof | battery | panel | any' }
          }
        }
      }
    }
  }
};

function mondayOf(d) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const wd = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() - (wd - 1)); return x; }
function at(monday, plusDays, utcHour) { const x = new Date(monday); x.setUTCDate(x.getUTCDate() + plusDays); x.setUTCHours(utcHour, 0, 0, 0); return x.toISOString(); }
const HINT_LABELS = { inverter: ['Inverter Photo', 'Serial Number'], array: ['Solar Array', 'Roof Photo'], roof: ['Roof Photo', 'Solar Array'], battery: ['Battery Placement Wall Photo'], panel: ['Panel Placard', 'MSP Sticker Photo'] };
function orderImages(opts, hint) {
  const want = HINT_LABELS[String(hint || '').toLowerCase()] || [];
  return opts.slice().sort((a, b) => (want.indexOf(b.label) > -1) - (want.indexOf(a.label) > -1));
}

async function existingBlog() {
  try {
    const r = await fetch(C.SITE + '/sitemap.xml');
    const t = r.ok ? await r.text() : '';
    const set = {};
    (t.match(/\/blog\/[a-z0-9\-]+/g) || []).forEach(p => { set[p] = 1; });
    return Object.keys(set);
  } catch (e) { return []; }
}

exports.handler = async function (event) {
  const key = process.env.SUPA_SERVICE_KEY;
  if (!process.env.ANTHROPIC_KEY || !key) { console.error('[content-agent] missing env'); return { statusCode: 200, body: 'Missing env' }; }
  const force = ((event && event.queryStringParameters) || {}).force === '1';
  const now = new Date();
  const monday = mondayOf(now);
  const week = monday.toISOString().slice(0, 10);
  try {
    const have = await C.sbGet('/content_posts?batch_week=eq.' + week + '&status=neq.rejected&select=id', key);
    if (have.length && !force) return { statusCode: 200, body: 'batch for ' + week + ' already drafted' };

    const [gbp, recent, blogPaths, imgs] = await Promise.all([
      C.sbGet('/agent_reports?agent=eq.gbp&select=title,body,created_at&order=created_at.desc&limit=10', key).catch(() => []),
      C.sbGet('/content_posts?select=kind,title,topic,status&order=created_at.desc&limit=60', key).catch(() => []),
      existingBlog(),
      C.imageOptions(key, 8)
    ]);
    const fb = await feedback.loadFeedback('content', key);
    const gbpText = gbp.map(g => '- ' + String(g.created_at).slice(0, 10) + ': ' + String(g.body || '').split('\n—')[0].slice(0, 500).replace(/\s+/g, ' ')).join('\n') || 'none yet';
    const recentText = recent.map(r => '- [' + r.kind + ', ' + r.status + '] ' + (r.title || r.topic)).join('\n') || 'none yet';
    const weekLabel = monday.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const user = fb.text + 'Week of ' + weekLabel + '.\n\nEXISTING BLOG PAGES (do not repeat their topic; you may link to them):\n' + (blogPaths.join('\n') || '/blog') +
      '\nOther pages you may link: /book, /defunct-solar-installers, /sunpower, /titan, /sunnova, /southern-california-solar-repair\n\n' +
      'RECENT GOOGLE BUSINESS POSTS (match this voice, do not repeat these topics):\n' + gbpText + '\n\nCONTENT ALREADY DRAFTED OR PUBLISHED (do not repeat):\n' + recentText;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 9000, system: SYSTEM, tools: [TOOL], tool_choice: { type: 'tool', name: 'submit_content_batch' }, messages: [{ role: 'user', content: user }] })
    });
    if (!resp.ok) throw new Error('Claude ' + resp.status + ' ' + (await resp.text()).slice(0, 200));
    const j = await resp.json();
    const out = ((j.content || []).find(b => b.type === 'tool_use') || {}).input;
    if (!out || !out.blog || !Array.isArray(out.shorts)) throw new Error('no content returned');

    const b = out.blog;
    let slug = C.slugify(b.slug || b.title);
    if (blogPaths.indexOf('/blog/' + slug) > -1) slug = slug + '-' + week.slice(5).replace('-', '');
    const flags = [];
    const rows = [];
    const blogText = [b.title, b.meta_description, b.lede, String(b.body_html).replace(/<[^>]+>/g, ' '), (b.faq || []).map(f => f.q + ' ' + f.a).join(' ')].join(' ');
    C.textProblems(blogText).forEach(p => flags.push('Blog ' + p));
    rows.push({
      batch_week: week, kind: 'blog', topic: b.eyebrow, title: b.title, slug, meta_description: b.meta_description,
      body: C.sanitizeArticle(b.body_html), faq: (b.faq || []).slice(0, 5),
      channels: { eyebrow: b.eyebrow, lede: b.lede, related: (b.related || []).slice(0, 4) },
      image_options: orderImages(imgs, b.image_hint), image_url: null, image_source: null,
      scheduled_for: at(monday, 2, 16), status: 'draft'
    });
    out.shorts.slice(0, 3).forEach((s, i) => {
      const ch = { gbp: s.gbp, facebook: s.facebook, instagram: s.instagram, nextdoor: s.nextdoor };
      C.CHANNELS.forEach(c => C.textProblems(ch[c]).forEach(p => flags.push('Post ' + (i + 1) + ' ' + c + ' ' + p)));
      const imgsFor = orderImages(imgs, s.image_hint);
      rows.push({
        batch_week: week, kind: 'short', topic: s.topic, title: s.headline, body: s.facebook, channels: ch,
        image_options: imgsFor, image_url: (imgsFor[0] || {}).url || null, image_source: (imgsFor[0] || {}).source || null,
        scheduled_for: at(monday, [1, 3, 5][i], 17), status: 'draft'
      });
    });
    await C.sbPost('/content_posts', rows, key);

    const summary = 'This week\'s content is ready to review in Agents -> Content.\n\nBlog: ' + b.title + ' (goes live Wednesday once approved)\n' +
      out.shorts.slice(0, 3).map((s, i) => 'Post ' + (i + 1) + ' (' + ['Tue', 'Thu', 'Sat'][i] + '): ' + s.topic).join('\n') +
      (flags.length ? '\n\nCheck before approving: ' + flags.join('; ') : '') + '\n\nNothing is posted until you tap Approve.';
    try { await C.sbPost('/agent_reports', { agent: 'content', priority: 'normal', title: 'Content ready to approve — week of ' + weekLabel, body: summary, action_url: 'https://fixmy.energy/portal' }, key); } catch (e) {}
    return { statusCode: 200, body: 'drafted ' + rows.length + ' items for ' + week };
  } catch (e) {
    console.error('[content-agent]', e.message);
    try { await C.sbPost('/agent_reports', { agent: 'content', priority: 'urgent', title: 'Content agent error — ' + e.message.slice(0, 60), body: 'Error: ' + e.message + (/content_posts|relation|schema cache/i.test(e.message) ? '\n\nRun supabase/migrations/20261123b_content_posts.sql in the Supabase SQL editor first.' : ''), action_url: null }, key); } catch (e2) {}
    return { statusCode: 200, body: 'Error: ' + e.message };
  }
};

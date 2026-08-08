// tracerfy-backfill.js — recover skip-trace results that were paid for but never applied.
//
// Phase 3 of the nightly pipeline has been submitting no-contact leads to Tracerfy for
// weeks, downloading the finished CSVs, and discarding every row — it matched on the
// lead_id we submit, which Tracerfy's advanced trace does not echo back. The credits were
// spent; the phone numbers, emails and owner names never landed.
//
// This walks Tracerfy's own queue history, pulls every completed queue's CSV, and applies
// it with the street+zip matching Phase 3 now uses. Safe to run repeatedly: it only ever
// FILLS BLANKS on a lead, so a re-run cannot overwrite anything a rep has since corrected.
//
//   GET /.netlify/functions/tracerfy-backfill            → dry run, reports what it would write
//   GET /.netlify/functions/tracerfy-backfill?apply=1    → writes
//   ...&maxQueues=40                                     → how far back to walk (default 60)
const SUPA_URL = 'https://kbtobyoumvbcxfbugsid.supabase.co';

const STREET_SUFFIX = {
  LANE:'LN', ROAD:'RD', STREET:'ST', DRIVE:'DR', AVENUE:'AVE', COURT:'CT', PLACE:'PL',
  BOULEVARD:'BLVD', CIRCLE:'CIR', TERRACE:'TER', TRAIL:'TRL', PARKWAY:'PKWY',
  HIGHWAY:'HWY', SQUARE:'SQ', NORTH:'N', SOUTH:'S', EAST:'E', WEST:'W'
};
function normStreet(a) {
  return String(a || '').split(',')[0]
    .toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
    .split(' ').map(w => STREET_SUFFIX[w] || w).join(' ');
}
function normZip(a) {
  const m = String(a || '').match(/\b(\d{5})(?:[-.]\d+)?\b(?![\s\S]*\b\d{5}\b)/);
  return m ? m[1] : '';
}
function parseLine(line) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(v => v.trim());
}

exports.handler = async function (event) {
  const key = process.env.SUPA_SERVICE_KEY;
  const tKey = process.env.TRACERFY_API_KEY;
  if (!key || !tKey) {
    return { statusCode: 200, body: JSON.stringify({ error: 'Missing SUPA_SERVICE_KEY or TRACERFY_API_KEY' }) };
  }
  const q = event.queryStringParameters || {};
  const apply = q.apply === '1' || q.apply === 'true';
  const maxQueues = Math.min(parseInt(q.maxQueues, 10) || 60, 200);

  const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  const REST = SUPA_URL + '/rest/v1';
  const tHdr = { Authorization: 'Bearer ' + tKey, Accept: 'application/json' };
  const log = [];
  const stamp = (m) => { log.push(m); console.log('[tracerfy-backfill] ' + m); };

  try {
    // ── Index every lead that is still missing contact data ──────────────────
    // Only leads with a gap are indexed, so a result can only ever fill a blank.
    const byStreetZip = {}, streetOnly = {}, dupe = {}, leadById = {};
    let off = 0;
    while (true) {
      const r = await fetch(REST + '/customers?lead_source=eq.orphaned_list'
        + '&select=id,address,phone,email,title_owner,first_name,last_name&order=id.asc&limit=1000&offset=' + off, { headers: H });
      if (!r.ok) throw new Error('lead index HTTP ' + r.status);
      const rows = await r.json();
      if (!rows.length) break;
      for (const l of rows) {
        leadById[l.id] = l;
        const st = normStreet(l.address);
        if (!st) continue;
        const z = normZip(l.address);
        if (z) { const k = st + '|' + z; if (!byStreetZip[k]) byStreetZip[k] = l.id; }
        if (streetOnly[st] && streetOnly[st] !== l.id) dupe[st] = true;
        else if (!streetOnly[st]) streetOnly[st] = l.id;
      }
      if (rows.length < 1000) break;
      off += 1000;
    }
    for (const k of Object.keys(dupe)) delete streetOnly[k];
    stamp(`Indexed ${Object.keys(leadById).length} leads`);

    // ── Walk Tracerfy's queue history ────────────────────────────────────────
    const queues = [];
    for (let page = 1; page <= 10 && queues.length < maxQueues; page++) {
      const r = await fetch('https://tracerfy.com/v1/api/queues/?page=' + page, { headers: tHdr });
      if (!r.ok) { stamp(`queue list page ${page} → HTTP ${r.status}`); break; }
      const d = await r.json();
      const list = Array.isArray(d) ? d : (d.results || d.data || []);
      if (!list.length) break;
      queues.push(...list);
      if (!d.next) break;
    }
    stamp(`Found ${queues.length} queues in Tracerfy history`);
    // One run should tell us the whole shape of this API rather than costing another
    // guess-and-redeploy cycle. Dump the field names and a scrubbed sample of the first
    // row so the download URL (and its field name) is unambiguous.
    if (queues[0]) {
      stamp('queue fields: ' + Object.keys(queues[0]).join(','));
      const sample = {};
      Object.keys(queues[0]).forEach(k => {
        const v = queues[0][k];
        sample[k] = (typeof v === 'string' && v.length > 120) ? v.slice(0, 120) + '…' : v;
      });
      stamp('queue sample: ' + JSON.stringify(sample).slice(0, 900));
    }

    // ── Pull each finished queue and resolve its rows ────────────────────────
    const pending = {};   // leadId -> merged update
    let queuesRead = 0, rowsSeen = 0, resolved = 0, alreadyHad = 0;

    const URL_FIELDS = ['download_url','csv_url','result_url','results_url','output_url','file','file_url','url','download','result','link'];

    for (const qu of queues.slice(0, maxQueues)) {
      const status = String(qu.status || qu.state || '').toLowerCase();
      if (status && !/complete|done|finish|success/.test(status)) continue;

      let urlField = URL_FIELDS.find(f => typeof qu[f] === 'string' && /^https?:|^\//.test(qu[f]));
      let url = urlField ? qu[urlField] : null;

      // Some APIs only expose the download link on the per-queue detail endpoint.
      if (!url && qu.id != null) {
        try {
          const dr = await fetch('https://tracerfy.com/v1/api/queues/' + qu.id + '/', { headers: tHdr });
          if (dr.ok) {
            const detail = await dr.json();
            urlField = URL_FIELDS.find(f => typeof detail[f] === 'string' && /^https?:|^\//.test(detail[f]));
            if (urlField) { url = detail[urlField]; urlField = 'detail.' + urlField; }
            else if (queuesRead === 0) stamp(`queue ${qu.id} detail fields: ` + Object.keys(detail).join(','));
          } else if (queuesRead === 0) {
            stamp(`queue ${qu.id} detail → HTTP ${dr.status}`);
          }
        } catch(e) { /* fall through to the no-url branch */ }
      }
      if (!url) { if (queuesRead === 0) stamp(`queue ${qu.id || '?'}: no download URL on the row`); continue; }
      if (url.startsWith('/')) url = 'https://tracerfy.com' + url;

      // ⚠️ Only send the API token to Tracerfy's own host. A results file lives on their
      // CDN as a PRESIGNED link, and S3/DigitalOcean Spaces reject a request that carries
      // both a query signature and an Authorization header — that is an HTTP 400
      // ("only one auth mechanism allowed"), which is exactly what every queue returned.
      const sameHost = /(^|\.)tracerfy\.com$/i.test(new URL(url).hostname);
      const cr = await fetch(url, sameHost ? { headers: tHdr } : {});
      if (!cr.ok) {
        let body = '';
        try { body = (await cr.text()).replace(/\s+/g, ' ').slice(0, 200); } catch(e) {}
        stamp(`queue ${qu.id || '?'} CSV → HTTP ${cr.status} · via ${urlField} · host ${new URL(url).hostname} · ${body}`);
        continue;
      }
      const csv = await cr.text();
      const lines = csv.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) continue;
      queuesRead++;

      const hdrs = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''));
      for (let i = 1; i < lines.length; i++) {
        const vals = parseLine(lines[i]);
        const row = {};
        hdrs.forEach((h, j) => { row[h] = (vals[j] || '').trim(); });
        rowsSeen++;

        const phone = row['primary_phone'] || row['mobile_1'] || row['landline_1'] || null;
        const email = row['email_1'] || row['email'] || null;
        // The skip-traced PERSON. This belongs in first_name/last_name — it is the human
        // who lives there, which for a trust-owned property is the trustee. Writing it to
        // title_owner (as this used to) put it in the column that holds the legal owner of
        // record, where it was then skipped entirely for any lead already carrying a trust
        // name — i.e. exactly the leads the name was needed for.
        const first = (row['first_name'] || row['owner_1_first_name'] || '').trim();
        const last  = (row['last_name']  || row['owner_1_last_name']  || '').trim();
        const human = [first, last].filter(Boolean).join(' ') || null;
        const dncRaw = row['do_not_call'] || row['dnc'] || row['primary_phone_dnc'] || '';
        const dnc = ['true','yes','1','y'].includes(dncRaw.toLowerCase().trim());
        if (!phone && !email && !human && !dnc) continue;

        let id = row['lead_id'] || null;
        if (!id) {
          const st = normStreet(row['street_address'] || row['address'] || '');
          if (!st) continue;
          const zm = String(row['zip'] || row['zip_code'] || '').match(/\d{5}/);
          id = (zm && byStreetZip[st + '|' + zm[0]]) || streetOnly[st] || null;
        }
        if (!id || !leadById[id]) continue;
        resolved++;

        // Fill blanks only — never overwrite what the lead already has.
        const lead = leadById[id];
        const upd = pending[id] || {};
        if (phone && !lead.phone && !upd.phone) upd.phone = phone;
        if (email && !lead.email && !upd.email) upd.email = email;
        if (first && !lead.first_name && !upd.first_name) upd.first_name = first;
        if (last  && !lead.last_name  && !upd.last_name)  upd.last_name  = last;
        // Only use the person as the owner of record when we have nothing there at all —
        // never overwrite a real assessor value (a trust IS the correct owner).
        if (human && !lead.title_owner && !upd.title_owner) upd.title_owner = human;
        if (dnc) upd.dnc = true;
        if (Object.keys(upd).length) { upd.enrichment_source = 'tracerfy'; pending[id] = upd; }
        else alreadyHad++;
      }
    }

    const ids = Object.keys(pending);
    const gains = { phone: 0, email: 0, name: 0, owner: 0, dnc: 0 };
    ids.forEach(id => {
      if (pending[id].phone) gains.phone++;
      if (pending[id].email) gains.email++;
      if (pending[id].first_name || pending[id].last_name) gains.name++;
      if (pending[id].title_owner) gains.owner++;
      if (pending[id].dnc) gains.dnc++;
    });
    stamp(`${queuesRead} queues read · ${rowsSeen} rows · ${resolved} matched a lead · ${ids.length} leads would gain data`);
    stamp(`Would add: ${gains.phone} phones, ${gains.email} emails, ${gains.name} HUMAN names (first/last), ${gains.owner} owner-of-record, ${gains.dnc} DNC flags`);

    if (!apply) {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true, queuesRead, rowsSeen, resolved, leadsToUpdate: ids.length, gains, log }, null, 2) };
    }

    let written = 0, failed = 0;
    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10);
      const res = await Promise.all(chunk.map(id =>
        fetch(REST + '/customers?id=eq.' + id, {
          method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(pending[id])
        }).then(r => r.ok).catch(() => false)
      ));
      written += res.filter(Boolean).length;
      failed += res.filter(x => !x).length;
      await new Promise(r => setTimeout(r, 40));
    }
    stamp(`Applied: ${written} leads updated, ${failed} failed`);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applied: true, queuesRead, rowsSeen, resolved, written, failed, gains, log }, null, 2) };
  } catch (e) {
    console.error('[tracerfy-backfill] ' + e.message);
    return { statusCode: 200, body: JSON.stringify({ error: e.message, log }) };
  }
};

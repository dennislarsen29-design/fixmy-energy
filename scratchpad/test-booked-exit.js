/**
 * Booked means OUT of Black Box — in BOTH motions.
 *
 * Membership was `black_box=true OR lead_source='orphaned_list'`, and a booking sets
 * black_box=false while leaving lead_source alone. So:
 *   - a DOOR-booked lead stayed dialable, with no dial_status, i.e. in **Fresh**
 *   - a PHONE-booked lead stayed an open door, since it has no knock_status
 *
 *   node scratchpad/test-booked-exit.js
 */
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'portal.html'), 'utf8');
let pass = 0, fail = 0;
const ok  = m => { pass++; console.log('  \x1b[32m✓\x1b[0m ' + m); };
const bad = m => { fail++; console.log('  \x1b[31m✗\x1b[0m ' + m); };

// A tiny PostgREST-ish evaluator for the predicate shapes used here, so the filters are
// tested as LOGIC rather than as strings.
function evalOr(expr, row) {
  return expr.split(',').some(function(term) {
    const m = term.match(/^(\w+)\.(is|eq|neq|gt)\.(.*)$/);
    if (!m) return false;
    const [, col, op, val] = m;
    const v = row[col];
    if (op === 'is')  return val === 'null' ? (v === null || v === undefined) : v === (val === 'true');
    if (op === 'eq')  return val === 'true' ? v === true : val === 'false' ? v === false : String(v) === val;
    if (op === 'neq') return String(v) !== val;
    if (op === 'gt')  return v != null && String(v) > val;
    return false;
  });
}

// Extract every or(...) group out of the dialer's and=(...) predicate.
function orGroups(andExpr) {
  const out = []; let depth = 0, cur = '', started = false;
  for (let i = 0; i < andExpr.length; i++) {
    const ch = andExpr[i];
    if (andExpr.startsWith('or(', i) && depth === 0) { started = true; depth = 1; cur = ''; i += 2; continue; }
    if (started) {
      if (ch === '(') depth++;
      if (ch === ')') { depth--; if (depth === 0) { out.push(cur); started = false; continue; } }
      cur += ch;
    }
  }
  return out;
}

const LEADS = {
  'fresh Black Box lead':        { black_box: true,  lead_source: 'orphaned_list', sold_type: null, dnc: null, archived: null, knock_status: null },
  'legacy lead, black_box null': { black_box: null,  lead_source: 'orphaned_list', sold_type: null, dnc: null, archived: null, knock_status: null },
  'booked at the DOOR':          { black_box: false, lead_source: 'orphaned_list', sold_type: null, dnc: null, archived: null, knock_status: 'booked' },
  'booked on the PHONE':         { black_box: false, lead_source: 'orphaned_list', sold_type: null, dnc: null, archived: null, knock_status: null },
  'DQd door':                    { black_box: true,  lead_source: 'orphaned_list', sold_type: null, dnc: null, archived: true, knock_status: 'disqualified' },
  'DNC':                         { black_box: true,  lead_source: 'orphaned_list', sold_type: null, dnc: true, archived: null, knock_status: null }
};

console.log('\n[1] the dialer queue predicate');
{
  const m = SRC.match(/var dialableAnd = '&and=\(([\s\S]*?)\)';/);
  if (!m) { bad('could not find dialableAnd'); }
  else {
    // Drop the recency escape hatch (dialed_at) so we test the membership rule itself.
    const expr = m[1].replace(/'\s*\+\s*recentCutoff\s*\+\s*'/g, '2000-01-01');
    const groups = orGroups(expr);
    const dialable = row => groups.every(g => evalOr(g, row));
    const expect = {
      'fresh Black Box lead': true, 'legacy lead, black_box null': true,
      'booked at the DOOR': false,  'booked on the PHONE': false,
      'DQd door': false,            'DNC': false
    };
    Object.keys(expect).forEach(k => {
      const got = dialable(LEADS[k]);
      if (got === expect[k]) ok((expect[k] ? 'dialable: ' : 'NOT dialable: ') + k);
      else bad(k + ' → dialable=' + got + ', expected ' + expect[k]);
    });
  }
}

console.log('\n[2] every Black Box membership query excludes a booked lead');
{
  const queries = [
    ['rep door route (_canvassFetchBox)', /client\.from\('customers'\)\.select\(SEL\)[\s\S]*?\.limit\(1000\);/],
    ['rep no-GPS fallback',               /\.eq\('lead_source', 'orphaned_list'\)[\s\S]{0,400}?\.order\('lead_score'[\s\S]{0,60}?\.limit\(80\)/],
    ['admin canvass route',               /var adminParams = 'lead_source=eq\.orphaned_list[\s\S]{0,400}?limit=1000/]
  ];
  queries.forEach(([label, rx]) => {
    const m = SRC.match(rx);
    if (!m) return bad(label + ': query not found');
    if (/black_box\.is\.null,black_box\.eq\.true/.test(m[0])) ok(label + ' excludes booked leads');
    else bad(label + ' still returns booked leads');
  });
}

console.log('\n[3] the pre-migration fallback path too');
{
  const fbs = SRC.match(/&and=\(or\(black_box\.eq\.true,lead_source\.eq\.orphaned_list\),[^']*\)/g) || [];
  if (fbs.length >= 2) ok(fbs.length + ' fallback predicates found');
  else bad('expected the BASE-select fallbacks, found ' + fbs.length);
  const missed = fbs.filter(f => !/black_box\.is\.null,black_box\.eq\.true/.test(f));
  if (!missed.length) ok('both fallback predicates exclude booked leads');
  else bad(missed.length + ' fallback predicate(s) would still serve a booked lead');
}

console.log('\n[4] nothing legitimate was dropped');
{
  // The route must still fetch by lead_source, not by black_box alone — a huge share of
  // the pool predates the column and is null.
  const box = (SRC.match(/client\.from\('customers'\)\.select\(SEL\)[\s\S]*?\.limit\(1000\);/) || [''])[0];
  if (/\.eq\('lead_source', 'orphaned_list'\)/.test(box)) ok('still keyed on lead_source, so null-black_box leads survive');
  else bad('membership narrowed to the black_box flag alone');
  if (/black_box\.is\.null/.test(box)) ok('null is explicitly allowed (legacy rows)');
  else bad('null-black_box rows would be dropped — most of the pool');
}

console.log('\n' + '─'.repeat(52));
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

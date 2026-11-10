// Daily brief: new internships, programs, hackathons and networking events in one message.
// Sources (all public, no sign-in):
//   devpost       devpost.com/api/hackathons            open + upcoming hackathons (mostly online, with prizes)
//   mlh           www.mlh.com/seasons/<yr>/events       student hackathons (Inertia page JSON)
//   cerebralvalley cerebralvalley.ai/events + /hackathons   AI events and hackathons (JSON-LD)
//   luma          api.lu.ma/discover/...                 events near Austin/SF/NYC and in the AI + Tech categories
// Internships and programs come from private/candidates.json (./apply scan) and config/programs.json.
import fs from 'node:fs';
import path from 'node:path';
import { P, ROOT, PRIVATE, readJSON, writeJSON, today, nowISO } from './util.mjs';

export const B = {
  dir: path.join(PRIVATE, 'brief'),
  seen: path.join(PRIVATE, 'brief', 'seen.json'),
  programs: path.join(ROOT, 'config', 'programs.json'),
};
const UA = { 'user-agent': 'internships-applier/1.0 (daily brief)', accept: 'application/json,text/html' };
const DAY = 86400000;

async function get(url, { json = true, timeoutMs = 30000 } = {}) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return json ? r.json() : r.text();
}

// ---------------------------------------------------------------- scoring
// What Ayan cares about, strongest first. Robotics/physical AI is the top focus (same as outreach).
const INTEREST = [
  [3, /robot|humanoid|physical ai|embodied|autonom|drone|\bcorl\b|\bros\b|manipulat|self-driving|lidar/i],
  [2, /\bai\b|\bml\b|machine learning|\bagents?\b|agentic|\bllm|gpt|claude|gemini|openai|anthropic|deepmind|model|inference|gpu|nvidia|computer vision/i],
  [1.5, /hardware|embedded|firmware|space|aerospace|defense|deep ?tech|hard ?tech|energy|nuclear|chip|semiconductor/i],
  [1.5, /founder|startup|\byc\b|y combinator|demo day|investor|\bvc\b|venture|a16z|sequoia|builders?\b|hacker|engineer/i],
  [1, /student|university|\but\b|longhorn|intern|career|recruit|hiring/i],
];
const NOT_TECH = /bingo|chess|pickleball|padel|watercolor|yoga|run club|\b5k\b|book club|reading|wine|music|dj\b|comedy|crafts?|fitness|sculpt|movement|poetry|writing club|essay seminar|euchre|dating|singles/i;
export const isHackathon = s => !/workshop|office hours|panel|fireside|meetup|\btalk\b|conference|summit/i.test(s) && /hack(athon|[- ]?(night|day|week|sprint))?\b|buildathon|build[- ](day|night|sprint|challenge|weekend)|game ?jam|code ?jam|\bjam\b|\bhack\b/i.test(s);
export const nearAustin = s => /austin|\batx\b|,\s*tx\b|\btexas\b|round rock|san marcos/i.test(s || '');
const isOnline = s => /online|virtual|digital|remote|anywhere/i.test(s || '');

export function interestScore(text) {
  let s = 0;
  for (const [w, re] of INTEREST) if (re.test(text)) s += w;
  return s;
}

/** Score an event/hackathon. Higher = show first. */
const US_STATE = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b|alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massach|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|wisconsin|wyoming|united states|\busa?\b|san francisco|brooklyn|berkeley|seattle|boston|austin/i;
export const inUS = s => US_STATE.test(s || '');
// Curated sources are worth more than the long tail of Devpost listings.
const SOURCE_BONUS = { cerebralvalley: 2, mlh: 1.5, luma: 0.5, devpost: 0 };

export function scoreItem(it, now = Date.now()) {
  const text = `${it.name} ${it.blurb || ''} ${it.org || ''} ${(it.tags || []).join(' ')}`;
  let s = interestScore(text) + (SOURCE_BONUS[it.source] || 0);
  if (it.abroad || (!it.online && !inUS(it.where))) return -100; // in person abroad (or unknown place): he can't go
  if (nearAustin(it.where)) s += 3; else if (it.online) s += 1; else if (/san francisco|\bsf\b|new york|nyc|bay area|palo alto|mountain view|berkeley/i.test(it.where || '')) s += 0.5;
  if (it.kind === 'hackathon') s += nearAustin(it.where) && !it.online ? 3 : 1; // a Texas hackathon he can drive to beats an online one
  if (it.soldOut) s -= 1.5;
  if (it.source === 'devpost') {
    // Long tail: tiny or club-run online hackathons are rarely worth a weekend. Company-run ones are.
    if (it.managed) s += 1.5;
    if (/universit|college|school|institute|club|society|\bgwc\b|girls who code/i.test(it.org || '')) s -= 1.5;
    if ((it.regs || 0) < 100) s -= 1;
    if (it.prizeUSD && (it.regs || 0) >= 100) s += Math.min(1.5, Math.log10(Math.max(1, it.prizeUSD)) / 3);
  }
  if (it.regs) s += Math.min(1, Math.log10(it.regs + 1) / 3);
  if (it.guests) s += Math.min(1, Math.log10(it.guests + 1) / 3);
  const days = it.start ? (Date.parse(it.start) - now) / DAY : 30;
  if (days < -1 && !(it.end && Date.parse(it.end) > now)) s -= 100; // already over
  if (days > 75) s -= 1;
  if (it.inviteOnly) s -= 100;
  return Math.round(s * 10) / 10;
}

// ---------------------------------------------------------------- date helpers
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
/** Devpost "Nov 09 - 18, 2026" / "Oct 25 - Nov 30, 2026" / "Dec 01, 2026 - Jan 15, 2027" → {start,end} ISO dates. */
export function parseDevpostDates(s) {
  if (!s) return {};
  const [a, b] = s.split(/\s+-\s+/);
  const pr = (x, fb = {}) => {
    const m = x.trim().match(/^(?:([A-Za-z]{3})[a-z]*\s+)?(\d{1,2})(?:,\s*(\d{4}))?$/);
    if (!m) return null;
    return { mo: m[1] ? MONTHS[m[1].toLowerCase()] : fb.mo, d: +m[2], y: m[3] ? +m[3] : fb.y };
  };
  const B2 = b ? pr(b) : pr(a);
  const A2 = pr(a, B2 || {});
  if (!A2 || !B2) return {};
  if (A2.y == null) A2.y = B2.y;
  if (B2.mo == null) B2.mo = A2.mo;
  if (A2.y === B2.y && A2.mo > B2.mo) A2.y -= 1;
  const iso = o => new Date(Date.UTC(o.y, o.mo, o.d)).toISOString().slice(0, 10);
  return { start: iso(A2), end: iso(B2) };
}
const fmtDay = iso => iso ? new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Chicago' }) : '?';

// ---------------------------------------------------------------- sources
export async function fromDevpost({ pages = 3 } = {}) {
  const out = [];
  for (let p = 1; p <= pages; p++) {
    const j = await get(`https://devpost.com/api/hackathons?status[]=upcoming&status[]=open&order_by=recently-added&per_page=50&page=${p}`);
    for (const h of j.hackathons || []) {
      const { start, end } = parseDevpostDates(h.submission_period_dates);
      const prize = Number(String(h.prize_amount || '').replace(/<[^>]+>/g, '').replace(/[^\d.]/g, '')) || 0;
      const where = h.displayed_location?.location || '';
      out.push({
        kind: 'hackathon', source: 'devpost', id: `devpost:${h.id}`, name: h.title, url: h.url, start, end,
        deadline: end, where, online: isOnline(where), org: h.organization_name, prizeUSD: prize, regs: h.registrations_count,
        tags: (h.themes || []).map(t => t.name), inviteOnly: !!h.invite_only, managed: !!h.managed_by_devpost_badge || !!h.featured, note: h.time_left_to_submission, state: h.open_state,
      });
    }
    if ((j.hackathons || []).length < 50) break;
  }
  return out;
}

export async function fromMLH() {
  const yr = new Date().getMonth() >= 6 ? new Date().getFullYear() + 1 : new Date().getFullYear();
  const html = await get(`https://www.mlh.com/seasons/${yr}/events`, { json: false });
  const m = html.match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('MLH page format changed');
  const ev = JSON.parse(m[1]).props?.upcomingEvents || [];
  return ev.map(e => ({
    kind: 'hackathon', source: 'mlh', id: `mlh:${e.id || e.slug}`, name: e.name, url: e.websiteUrl || e.url, start: e.startsAt, end: e.endsAt,
    where: [e.location, e.formatType].filter(Boolean).join(' · '), online: /digital|online/i.test(e.formatType || ''), org: e.organizationName || 'MLH',
    tags: ['student hackathon'],
  }));
}

function ldEvents(html) {
  const out = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let j; try { j = JSON.parse(m[1]); } catch { continue; }
    for (const it of j.itemListElement || []) if (it?.item?.name) out.push(it.item);
  }
  return out;
}
export async function fromCerebralValley() {
  const pages = await Promise.allSettled(['https://cerebralvalley.ai/events', 'https://cerebralvalley.ai/hackathons'].map(u => get(u, { json: false })));
  const seen = new Set(), out = [];
  for (const p of pages) {
    if (p.status !== 'fulfilled') continue;
    for (const e of ldEvents(p.value)) {
      if (seen.has(e.url)) continue; seen.add(e.url);
      const types = [].concat(e['@type'] || []).join(' ');
      const loc = e.location || {};
      const virtual = /Virtual/.test(loc['@type'] || '') || /Online/.test(e.eventAttendanceMode || '');
      const where = virtual ? 'Online' : [...new Set([loc.name, loc.address?.addressLocality, loc.address?.addressRegion].filter(x => x && x !== 'Other'))].filter((x, i, a) => !a.some((y, j) => j !== i && y.includes(x) && y !== x)).join(', ');
      out.push({
        kind: (/Hackathon/.test(types) && !/conference|summit|workshop/i.test(e.name)) || isHackathon(e.name) ? 'hackathon' : 'event', source: 'cerebralvalley', id: `cv:${e.url}`, name: e.name, url: e.url,
        start: e.startDate, end: e.endDate, where, online: virtual, abroad: !!loc.address?.addressCountry && !/^(US|USA|United States)$/i.test(loc.address.addressCountry), org: [].concat(e.organizer || []).map(o => o.name).join(', '), blurb: (e.description || '').slice(0, 200),
      });
    }
  }
  return out;
}

const LUMA_PLACES = { austin: 'discplace-0tPy8KGz3xMycnt', sf: 'discplace-BDj7GNbGlsF7Cka', nyc: 'discplace-Izx1rQVSh8njYpP' };
const LUMA_CATS = { ai: 'cat-ai', tech: 'cat-tech' };
export async function fromLuma({ places = ['austin', 'sf'], cats = ['ai', 'tech'], pagesPer = 2 } = {}) {
  const feeds = [...places.map(p => `discover_place_api_id=${LUMA_PLACES[p]}`), ...cats.map(c => `discover_category_api_id=${LUMA_CATS[c]}`)];
  const out = new Map();
  await Promise.all(feeds.map(async q => {
    let cursor = null;
    for (let i = 0; i < pagesPer; i++) {
      const j = await get(`https://api.lu.ma/discover/get-paginated-events?${q}&pagination_limit=50${cursor ? `&pagination_cursor=${cursor}` : ''}`).catch(() => null);
      if (!j) break;
      for (const x of j.entries || []) {
        const e = x.event; if (!e || out.has(e.api_id)) continue;
        const g = e.geo_address_info || {};
        const online = e.location_type === 'online' || (!g.city && !g.city_state);
        out.set(e.api_id, {
          kind: isHackathon(e.name) ? 'hackathon' : 'event', source: 'luma', id: `luma:${e.api_id}`, name: e.name, url: `https://luma.com/${e.url}`,
          start: e.start_at, end: e.end_at, where: online ? 'Online' : (g.city_state || g.city || ''), online, org: x.calendar?.name && x.calendar.name !== 'Personal' ? x.calendar.name : (x.hosts || []).map(h => h.name).slice(0, 2).join(', '),
          guests: x.guest_count || 0, free: x.ticket_info ? !!x.ticket_info.is_free : undefined, soldOut: !!x.ticket_info?.is_sold_out, waitlist: !!x.waitlist_active,
        });
      }
      if (!j.has_more || !j.next_cursor) break;
      cursor = j.next_cursor;
    }
  }));
  // Keep only things worth his time: hackathons, or tech events that match an interest.
  return [...out.values()].filter(e => !NOT_TECH.test(e.name) && (e.kind === 'hackathon' || interestScore(`${e.name} ${e.org}`) >= 1.5));
}

export const SOURCES = { devpost: fromDevpost, mlh: fromMLH, cerebralvalley: fromCerebralValley, luma: fromLuma };

// ---------------------------------------------------------------- programs + internships
const PROGRAM_TITLE = /sophomore|freshman|first[- ]year|second[- ]year|underclass|\bexplore\b|\bSTEP\b|early insight|discovery program|pathways|launch program|fellowship|fellows?\b(?!.*postdoc)/i;

export function programsSection(cands, { now = Date.now(), seen = {} } = {}) {
  const cfg = readJSON(B.programs, { programs: [] }).programs || [];
  const curated = cfg.filter(p => {
    if (p.status === 'closed') return false;
    if (!p.deadline) return true;
    const d = (Date.parse(p.deadline) - now) / DAY;
    return d >= -1 && d <= 90;
  }).map(p => ({ ...p, daysLeft: p.deadline ? Math.ceil((Date.parse(p.deadline) - now) / DAY) : null }))
    .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999) || ((b.tags || []).includes('robotics') - (a.tags || []).includes('robotics')));
  const fromListings = (cands.jobs || []).filter(j => j.ok && PROGRAM_TITLE.test(j.title) && !/postdoc|phd|mba/i.test(j.title))
    .map(j => ({ name: `${j.company}: ${j.title}`, url: j.url, where: (j.locations || [])[0], firstSeen: j.firstSeen, score: j.score }));
  return { curated, fromListings };
}

const perCompany = (list, n) => { const c = {}, t = new Set(); return list.filter(j => { const k = `${j.company}|${j.title}`.toLowerCase(); if (t.has(k)) return false; t.add(k); return (c[j.company] = (c[j.company] || 0) + 1) <= n; }); };

export function internshipsSection(cands, { sinceDays = 1, now = Date.now(), queue = [], tracker = { rows: [] } } = {}) {
  const since = new Date(now - sinceDays * DAY).toISOString().slice(0, 10);
  const ok = (cands.jobs || []).filter(j => j.ok && !j.hold);
  const fresh = ok.filter(j => (j.firstSeen || '') >= since);
  const q = s => queue.filter(x => x.status === s).length;
  const applied = (tracker.rows || []).filter(r => r.appliedAt && r.appliedAt >= since);
  return {
    since, totalOk: ok.length, newCount: fresh.length,
    top: perCompany(fresh.length ? fresh : ok, 2).slice(0, 10), fallback: !fresh.length,
    queue: { ready: q('ready'), needsInput: q('needs_input'), captcha: q('captcha'), handedToMac: q('handed_to_mac') },
    appliedSince: applied.map(r => `${r.company} (${r.role})`),
  };
}

// ---------------------------------------------------------------- build
export async function gatherEvents({ sources = Object.keys(SOURCES), now = Date.now() } = {}) {
  const errors = [];
  const res = await Promise.all(sources.map(s => SOURCES[s]().catch(e => { errors.push(`${s}: ${e.message}`); return []; })));
  const seen = readJSON(B.seen, {});
  const items = [];
  const dedupe = new Set();
  for (const it of res.flat()) {
    const k = `${it.name}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + '|' + (it.start || '').slice(0, 10);
    if (dedupe.has(k)) continue; dedupe.add(k);
    it.firstSeen = seen[it.id] || today();
    seen[it.id] = it.firstSeen;
    it.score = scoreItem(it, now);
    it.isNew = it.firstSeen >= new Date(now - 1.5 * DAY).toISOString().slice(0, 10);
    items.push(it);
  }
  writeJSON(B.seen, seen);
  return { items, errors, counts: Object.fromEntries(sources.map((s, i) => [s, res[i].length])) };
}

/** Pick what to show: new today first, plus anything older that's strong ("if it's that good"). */
export function pickEvents(items, kind, { max = 8, now = Date.now(), strong = 5, horizonDays = 60 } = {}) {
  return items.filter(i => i.kind === kind && i.score > 0)
    .filter(i => { const t = Date.parse(i.end || i.start || 0); return t > now + (kind === 'hackathon' ? DAY : 0) && Date.parse(i.start || i.end) - now < horizonDays * DAY; })
    .filter(i => i.isNew || i.score >= strong)
    .sort((a, b) => (b.score + (b.isNew ? 1 : 0)) - (a.score + (a.isNew ? 1 : 0)))
    .slice(0, max);
}

const line = it => {
  const bits = [fmtDay(it.start) + (it.end && fmtDay(it.end) !== fmtDay(it.start) && Date.parse(it.end) - Date.parse(it.start) > 12 * 3600e3 ? `–${fmtDay(it.end)}` : ''), it.where || ''];
  if (it.prizeUSD) bits.push(`$${it.prizeUSD.toLocaleString()} prizes`);
  if (it.regs) bits.push(`${it.regs} registered`);
  if (it.guests) bits.push(`${it.guests} going`);
  if (it.note) bits.push(it.note);
  if (it.soldOut) bits.push('sold out'); else if (it.waitlist) bits.push('waitlist');
  return `- ${it.isNew ? '🆕 ' : ''}**${it.name}**${it.org ? ` (${it.org})` : ''}: ${bits.filter(Boolean).join(' · ')}. ${it.url}`;
};

export function renderBrief({ date = today(), intern, programs, hackathons, events, outreach, errors = [] }) {
  const L = [`# Daily brief: ${date}`, ''];
  L.push('## Internships');
  L.push(`${intern.newCount} new eligible postings since ${intern.since} (${intern.totalOk} open overall). Queue: ${intern.queue.ready} ready to submit, ${intern.queue.needsInput} need an answer from you, ${intern.queue.captcha} blocked by CAPTCHA, ${intern.queue.handedToMac} with the Mac.`);
  if (intern.appliedSince.length) L.push(`Applied since ${intern.since}: ${intern.appliedSince.join(', ')}.`);
  L.push(intern.fallback ? 'Nothing new today. Best still-open matches:' : 'Best new matches:');
  for (const j of intern.top) L.push(`- **${j.company}**: ${j.title} (${(j.locations || [])[0] || '?'}, ${j.ats}, fit ${j.score}). ${j.url}`);
  L.push('', '## Programs and fellowships');
  const STATUS = { open: 'Open now, deadline not confirmed', rolling: 'Rolling', check: 'Check the page for this cycle', opening: 'Opens soon' };
  if (programs.curated.length) for (const p of programs.curated.slice(0, 9)) L.push(`- ${p.daysLeft != null && p.daysLeft <= 21 ? '⏰ ' : ''}**${p.name}**: ${p.what || ''} ${p.deadline ? `Due ${fmtDay(p.deadline + 'T18:00:00Z')} (${p.daysLeft} days${p.verify ? ', date from a third-party site' : ''}).` : `${STATUS[p.status] || 'Deadline unconfirmed'}.`} ${p.url}`);
  for (const p of programs.fromListings.slice(0, 5)) L.push(`- ${p.name} (${p.where || '?'}). ${p.url}`);
  if (!programs.curated.length && !programs.fromListings.length) L.push('- Nothing with a deadline in the next 90 days.');
  L.push('', '## Hackathons to register for');
  if (hackathons.length) hackathons.forEach(h => L.push(line(h))); else L.push('- Nothing new or strong this time.');
  L.push('', '## Networking events');
  if (events.length) events.forEach(h => L.push(line(h))); else L.push('- Nothing new or strong this time.');
  if (outreach) {
    L.push('', '## Outreach');
    L.push(`${outreach.ready} drafted emails ready for you, ${outreach.sent} sent, ${outreach.replied} replied. Follow-ups due: ${outreach.due.length ? outreach.due.join(', ') : 'none'}.`);
  }
  if (errors.length) L.push('', `_Sources that failed: ${errors.join('; ')}_`);
  return L.join('\n') + '\n';
}

export async function buildBrief({ sinceDays = 1, now = Date.now(), sources } = {}) {
  const cands = readJSON(P.candidates, { jobs: [] });
  const queue = fs.existsSync(P.queueDir) ? fs.readdirSync(P.queueDir).filter(f => f.endsWith('.json')).map(f => readJSON(path.join(P.queueDir, f))) : [];
  const tracker = readJSON(P.tracker, { rows: [] });
  const intern = internshipsSection(cands, { sinceDays, now, queue, tracker });
  const programs = programsSection(cands, { now });
  const { items, errors, counts } = await gatherEvents({ sources, now });
  const hackathons = pickEvents(items, 'hackathon', { now, max: 8, strong: 4.5 });
  const events = pickEvents(items, 'event', { now, max: 8, strong: 5.5, horizonDays: 30 });
  let outreach = null;
  try {
    const o = await import('./outreach.mjs');
    const all = readJSON(o.O.leads, { leads: {} });
    const leads = Object.values(all.leads || {});
    outreach = {
      ready: leads.filter(l => l.draft && !l.draft.needsPersonalising && !['sent', 'replied', 'meeting', 'closed'].includes(l.status)).length,
      sent: leads.filter(l => l.status === 'sent').length, replied: leads.filter(l => ['replied', 'meeting'].includes(l.status)).length,
      due: o.dueFollowups(all, now).map(x => `${x.L.company} (#${x.n})`),
    };
  } catch { /* outreach not set up */ }
  const md = renderBrief({ date: new Date(now).toISOString().slice(0, 10), intern, programs, hackathons, events, outreach, errors });
  const file = path.join(B.dir, `${new Date(now).toISOString().slice(0, 10)}.md`);
  fs.mkdirSync(B.dir, { recursive: true });
  fs.writeFileSync(file, md);
  writeJSON(path.join(B.dir, 'last.json'), { at: nowISO(), counts, errors, hackathons, events, intern: { ...intern, top: intern.top.map(j => j.id) } });
  return { md, file, counts, errors, hackathons, events, intern, programs };
}

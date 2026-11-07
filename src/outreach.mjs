// Startup outreach: discover startups, find founders, draft personal cold emails, track follow-ups.
// Guardrails (docs/OUTREACH.md): Ayan approves every send; nothing is emailed automatically;
// no LinkedIn scraping; emails are guessed from public patterns and checked only by MX lookup.
import fs from 'node:fs';
import path from 'node:path';
import { P, readJSON, writeJSON, today, nowISO, slugify } from './util.mjs';
import { isQuant, isFinance } from './rules.mjs';

export const O = {
  dir: path.join(P.cache, '..', 'outreach'),
  get yc() { return path.join(this.dir, 'yc-all.json'); },
  get leads() { return path.join(this.dir, 'leads.json'); },
};
const YC_URL = 'https://yc-oss.github.io/api/companies/all.json';

// What Ayan cares about most: physical AI / robotics / humanoids, then AI + dev tools, then any strong SWE startup.
const FOCUS = [
  { key: 'robotics', w: 3.5,
    tags: /^(robotics|humanoids?|drones|autonomous (vehicles|trucking)|manufacturing and robotics)$/i,
    inds: /manufacturing and robotics|drones/i,
    text: /\b(robots?|robotics|robotic|humanoids?|embodied ai|physical ai|drones?|teleoperation|autonomous (vehicles?|robots?|trucks?|drones?)|exoskeletons?|warehouse automation|self-driving)\b/i },
  { key: 'hardtech', w: 2.0,
    tags: /^(hardware|hard tech|aerospace|space exploration|defense|defense tech|3d printing|lidar|industrial|manufacturing)$/i,
    inds: /aviation and space/i, text: null },
  { key: 'ai', w: 1.6, inds: null, tags: /^(ai|artificial intelligence|generative ai|machine learning|ai assistant|llm|nlp|deep learning|ai-enhanced learning|ai agents?|computer vision)$/i, text: /\b(llms?|foundation models?|ai agents?)\b/i },
  { key: 'devtools', w: 1.2, inds: null, tags: /^(developer tools|infrastructure|open source|api|databases?|security|devsecops|cloud computing|data engineering|monitoring)$/i, text: null },
];
const parseList = v => Array.isArray(v) ? v : String(v || '').replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
const batchYear = b => Number((String(b).match(/(20\d\d)/) || [])[1] || 0);

export async function loadYC({ refresh = false } = {}) {
  if (!refresh && fs.existsSync(O.yc) && Date.now() - fs.statSync(O.yc).mtimeMs < 3 * 86400e3) return readJSON(O.yc);
  const r = await fetch(YC_URL, { signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`YC directory HTTP ${r.status}`);
  const d = await r.json(); fs.mkdirSync(O.dir, { recursive: true }); fs.writeFileSync(O.yc, JSON.stringify(d)); return d;
}

/** Score a YC company for Ayan. Returns { score, reasons } or null when excluded. */
export function scoreCompany(c, appliedCompanies = new Set()) {
  if (c.status !== 'Active') return null;
  if (String(c.nonprofit) === 'True') return null;
  const tags = parseList(c.tags), inds = parseList(c.industries);
    if (isQuant(c.name) || isFinance(c.name)) return null;
  const regions = parseList(c.regions).join(' ') + ' ' + (c.all_locations || '');
  if (!/united states|america|remote|usa|\b[A-Z]{2}, USA/i.test(regions) && !/, (CA|NY|TX|WA|MA|CO|IL|PA|GA|NC|VA|FL|OR|UT|MI|OH|MN|AZ|NJ|MD|DC)\b/.test(c.all_locations || '')) return null;
  let s = 0; const why = [];
  const strictText = [c.name, c.one_liner, c.long_description].join(' ');
  for (const f of FOCUS) {
    const hit = tags.some(t => f.tags.test(t)) || (f.inds && inds.some(t => f.inds.test(t))) || (f.text && f.text.test(strictText));
    if (hit) { s += f.w; why.push(f.key); }
  }
  if (!why.length) return null;                          // must be in an area he cares about
  const team = Number(c.team_size || 0);
  if (team >= 3 && team <= 60) { s += 1.2; why.push(`small team (${team})`); }  // founders read their own email
  else if (team > 60 && team <= 400) { s += 0.6; why.push(`${team} people`); }
  else if (team > 1500) s -= 0.8;
  const y = batchYear(c.batch);
  if (y >= 2024) { s += 1.0; why.push(`recent batch ${c.batch}`); } else if (y >= 2021) s += 0.4;
  if (String(c.isHiring) === 'True') { s += 1.0; why.push('hiring'); }
  if (/austin|texas|, tx\b/i.test(c.all_locations || '')) { s += 1.0; why.push('Austin/Texas'); }
  if (/fall 2025/i.test(c.batch)) { s += 0.8; why.push('YC F25 (same batch as Moss & Koyal)'); }
  if (String(c.top_company) === 'True') { s += 0.3; why.push('YC top company'); }
  if (appliedCompanies.has(c.name.toLowerCase())) { s -= 1.0; why.push('already applied there'); }
  return { score: Math.round(s * 10) / 10, reasons: why };
}

export async function discover({ top = 50, focus = null, refresh = false } = {}) {
  const yc = await loadYC({ refresh });
  const tracker = readJSON(P.tracker, { rows: [] });
  const applied = new Set(tracker.rows.filter(r => ['applied', 'interview', 'assessment', 'offer'].includes(r.outcome)).map(r => String(r.company).toLowerCase()));
  const leads = readJSON(O.leads, { updated: null, leads: {} });
  const scored = [];
  for (const c of yc) {
    const sc = scoreCompany(c, applied);
    if (!sc) continue;
    if (focus && !sc.reasons.includes(focus)) continue;
    scored.push({ c, ...sc });
  }
  scored.sort((a, b) => b.score - a.score);
  let added = 0;
  for (const { c, score, reasons } of scored.slice(0, top)) {
    const id = c.slug;
    const prev = leads.leads[id];
    leads.leads[id] = {
      ...(prev || { status: 'new', addedAt: today(), people: [], history: [] }),
      id, company: c.name, website: c.website, ycUrl: c.url, batch: c.batch, teamSize: Number(c.team_size || 0),
      oneLiner: c.one_liner, about: String(c.long_description || '').slice(0, 600), tags: parseList(c.tags), location: c.all_locations,
      isHiring: String(c.isHiring) === 'True', score, reasons, source: 'yc',
    };
    if (!prev) added++;
  }
  leads.updated = nowISO();
  writeJSON(O.leads, leads);
  return { scored: scored.length, added, shown: scored.slice(0, top) };
}

// ---------------------------------------------------------------- people
const decode = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
export async function ycPage(slug) {
  const r = await fetch(`https://www.ycombinator.com/companies/${slug}`, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'Mozilla/5.0 (internships-applier; personal research, low volume)' } });
  if (!r.ok) throw new Error(`YC page ${slug}: HTTP ${r.status}`);
  const html = await r.text();
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) return null;
  const props = JSON.parse(decode(m[1])).props || {};
  const c = props.company || {};
  return {
    founders: (c.founders || []).filter(f => f.is_active !== false).map(f => ({ name: f.full_name, title: f.title, linkedin: f.linkedin_url || null, twitter: f.twitter_url || null, bio: (f.founder_bio || '').slice(0, 400) })),
    jobs: (props.jobPostings || []).map(j => ({ title: j.title, url: j.url ? new URL(j.url, 'https://www.ycombinator.com').href : null, type: j.type || j.jobType, location: j.location })),
    linkedin: c.linkedin_url || null, twitter: c.twitter_url || null, founded: c.year_founded || null,
  };
}

export async function hasMX(domain) {
  try {
    const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`, { signal: AbortSignal.timeout(15000) });
    const d = await r.json();
    return (d.Answer || []).some(a => a.type === 15);
  } catch { return null; }
}
export function domainOf(website) { try { return new URL(website).hostname.replace(/^www\./, ''); } catch { return null; } }

/** Most likely address patterns for small startups (first@ dominates under ~10 people). Marked as guesses. */
export function emailGuesses(fullName, domain, teamSize = 10) {
  const parts = String(fullName).toLowerCase().normalize('NFKD').replace(/[^a-z\s-]/g, '').split(/\s+/).filter(Boolean);
  if (!parts.length || !domain) return [];
  const [f, l] = [parts[0], parts[parts.length - 1]];
  const g = teamSize <= 30 ? [`${f}@${domain}`, `${f}.${l}@${domain}`, `${f}${l}@${domain}`, `${f[0]}${l}@${domain}`]
    : [`${f}.${l}@${domain}`, `${f}@${domain}`, `${f[0]}${l}@${domain}`, `${f}${l}@${domain}`];
  return [...new Set(g)];
}

export async function findPeople(id) {
  const leads = readJSON(O.leads, { leads: {} });
  const L = leads.leads[id]; if (!L) throw new Error(`no lead ${id}`);
  const page = await ycPage(id).catch(e => ({ error: e.message }));
  const domain = domainOf(L.website);
  const mx = domain ? await hasMX(domain) : null;
  if (page && !page.error) {
    L.people = page.founders.map(f => ({ ...f, role: 'founder', emailGuesses: mx ? emailGuesses(f.name, domain, L.teamSize) : [], emailConfidence: mx ? 'pattern guess (domain accepts mail)' : 'no mail server found' }));
    L.jobs = page.jobs; L.companyLinkedin = page.linkedin; L.companyTwitter = page.twitter;
    L.internJobs = page.jobs.filter(j => /\bintern(ship)?s?\b|\bco-?op\b/i.test(`${j.title} ${j.type}`));
    L.techInternJobs = L.internJobs.filter(j => /engineer|software|swe|robot|ml|machine|ai\b|data|developer|research/i.test(j.title));
  } else L.peopleError = page?.error || 'no data';
  L.domain = domain; L.mx = mx;
  // Warm paths Ayan can check himself (no scraping): LinkedIn searches he opens by hand.
  L.warmPaths = warmPaths(L);
  L.history = [...(L.history || []), { at: nowISO(), event: 'people' }];
  writeJSON(O.leads, leads);
  return L;
}

export function warmPaths(L) {
  const q = s => encodeURIComponent(s);
  const paths = [
    { kind: 'UT Austin alumni at company', how: 'Open on LinkedIn and look for Longhorns; ask for a referral with the referral template.', url: `https://www.linkedin.com/search/results/people/?keywords=${q(L.company + ' "University of Texas at Austin"')}` },
    { kind: 'Anyone at company', how: 'Engineers who post about the product are good second contacts.', url: `https://www.linkedin.com/search/results/people/?keywords=${q(L.company)}` },
  ];
  if (/fall 2025/i.test(L.batch || '')) paths.unshift({ kind: 'YC F25 batchmate', how: 'Same batch as Moss and Koyal AI: ask Sri (Moss) or the Koyal founders for an intro, or mention the batch connection.', url: null });
  return paths;
}

// ---------------------------------------------------------------- drafts
const PROOF = {
  'physical-ai': 'At Koyal AI (YC F25) I built OpenCV scene classification across 300+ video scenes that cut manual review 70%, and I have deployed PyTorch models on Modal',
  ai: 'At Moss (YC F25) I shipped 10 open-source apps on a WebAssembly semantic-search SDK with sub-10ms on-device retrieval, and I built hybrid retrieval with reranking that took recall@5 from 0.85 to 0.97',
  devtools: 'At Moss (YC F25) I shipped 10 open-source apps on their SDK, merged 3 PRs into the core SDK, and built the LLM integration layer 5 other interns adopted',
};
/**
 * First-pass draft from facts only. It is deliberately short (<120 words) and must be personalised
 * (the [bracketed] hook) before Ayan approves it.
 */
export function draftEmail(L, { kind = 'founder', person = null } = {}) {
  const first = person?.name ? person.name.split(/\s+/)[0] : 'there';
  const area = L.reasons.includes('robotics') || L.reasons.includes('hardtech') ? 'physical-ai' : (L.reasons.find(r => PROOF[r]) || 'ai');
  const proof = PROOF[area];
  const subj = kind === 'referral' ? `Quick favor re: ${L.company}` : (/fall 2025/i.test(L.batch || '') ? `F25 batchmate's intern → ${L.company}` : `Moss (YC F25) intern → ${L.company}`);
  const hook = `[1 specific line about ${L.company}: ${L.oneLiner || 'their product'} — a demo, launch, paper or customer you noticed]`;
  const ask = L.techInternJobs?.length
    ? `I saw the ${L.techInternJobs[0].title} opening and applied; I'd love to put my hand up directly too.`
    : `You may not have an intern role posted, so I'd like to propose one: a 12-week Summer 2027 project on [specific area at ${L.company}], with a paid trial task first if that's useful.`;
  const body = kind === 'referral'
    ? `Hi ${first},\n\nFellow Longhorn here (UT Austin CS + Business Honors '29). I'm hoping to intern at ${L.company} in Summer 2027 and saw you're on the team. Would you be open to forwarding the short blurb below to the right person? Totally fine if not.\n\n"Ayan Bhardwaj, UT Austin CS '29, interned at Moss and Koyal AI (both YC F25). ${proof}. GitHub: github.com/AyanBhardwaj1"\n\nThanks either way,\nAyan`
    : `Hi ${first},\n\n${hook}\n\nI'm a CS + Business Honors student at UT Austin (May 2029) and have interned at two YC F25 startups. ${proof}. Code: github.com/AyanBhardwaj1\n\n${ask}\n\nWould you be open to a 15-minute call? Resume attached.\n\nAyan Bhardwaj\nlinkedin.com/in/ayan-bhardwaj-579048281`;
  return { subject: subj, body, needsPersonalising: body.includes('['), words: body.split(/\s+/).length, createdAt: nowISO() };
}

export function followupDraft(L, n) {
  const first = (L.sentTo?.name || '').split(/\s+/)[0] || 'there';
  return n === 1
    ? { subject: `Re: ${L.draft?.subject || L.company}`, body: `Hi ${first}, bumping this in case it got buried. [one new thing: a commit, demo or idea relevant to ${L.company}]. Happy to send a quick project proposal if helpful.\n\nAyan` }
    : { subject: `Re: ${L.draft?.subject || L.company}`, body: `Hi ${first}, last note from me. If Summer 2027 interns aren't on the radar, I'd still love any pointer to who I should talk to. Thanks for building ${L.company}.\n\nAyan` };
}

/** Gmail compose link: Ayan taps it on his phone, reviews, attaches his resume, and hits send himself. */
export function gmailComposeUrl(to, subject, body) {
  const q = new URLSearchParams({ view: 'cm', fs: '1', to: to || '', su: subject || '', body: body || '' });
  return `https://mail.google.com/mail/?${q.toString()}`;
}
export function calendarUrl(title, startISO, minutes = 30, details = '') {
  const fmt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const s = new Date(startISO), e = new Date(s.getTime() + minutes * 60000);
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${fmt(s)}/${fmt(e)}`, details })}`;
}

// Follow-up schedule after a send: +4 days, then +11 days, then stop (docs/OUTREACH.md).
export const FOLLOWUP_DAYS = [4, 11];
export function dueFollowups(leads, now = Date.now()) {
  const out = [];
  for (const L of Object.values(leads.leads || {})) {
    if (!L.sentAt || ['replied', 'closed', 'meeting'].includes(L.status)) continue;
    const done = L.followupsSent || 0;
    if (done >= FOLLOWUP_DAYS.length) continue;
    const due = new Date(L.sentAt).getTime() + FOLLOWUP_DAYS[done] * 86400e3;
    if (due <= now) out.push({ L, n: done + 1, dueDate: new Date(due).toISOString().slice(0, 10) });
  }
  return out;
}

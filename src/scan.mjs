// Scan sources for Summer 2027 internships, apply rules, de-dupe against the tracker.
// Sources:
//   simplify  – SimplifyJobs/Summer2027-Internships listings.json via raw.githubusercontent.com (works in the cloud today)
//   boards    – direct Greenhouse / Lever / Ashby public job-board APIs for companies in config/boards.json
//               (needs those hosts allowed in the environment's network settings)
import fs from 'node:fs';
import path from 'node:path';
import { P, ROOT, readJSON, writeJSON, urlKey, normTitle, normCompany, detectATS, today } from './util.mjs';
import { classify, quickScore, resumeFor, holdFor } from './rules.mjs';

const SIMPLIFY_URL = 'https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json';

async function fetchJSON(url, { timeoutMs = 60000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { 'user-agent': 'internships-applier/1.0', accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

export async function fromSimplify({ maxAgeDays = 120 } = {}) {
  const cacheFile = path.join(P.cache, 'simplify-listings.json');
  let data;
  try { data = await fetchJSON(SIMPLIFY_URL, { timeoutMs: 120000 }); writeJSON(cacheFile, data); }
  catch (e) {
    console.error(`[simplify] fetch failed (${e.message}); using cache if present`);
    data = readJSON(cacheFile, []);
  }
  const cutoff = Date.now() / 1000 - maxAgeDays * 86400;
  return data
    .filter(x => x.active && x.is_visible !== false)
    .filter(x => (x.date_posted || x.date_updated || 0) >= cutoff)
    .map(x => ({
      source: 'simplify', sourceId: x.id, company: x.company_name, title: x.title, url: x.url.replace(/[?&]embed=true$/, ''),
      locations: x.locations || [], terms: x.terms || [], category: x.category || '', datePosted: x.date_posted,
      sponsorship: x.sponsorship, degrees: x.degrees || [],
    }));
}

// Direct job-board APIs (blocked until network allowlist includes the ATS hosts).
export async function fromBoards() {
  const cfg = readJSON(path.join(ROOT, 'config', 'boards.json'), { greenhouse: [], lever: [], ashby: [] });
  const out = [];
  const intern = /\bintern(ship)?s?\b|\bco-?op\b/i;
  const tasks = [];
  for (const b of cfg.greenhouse) tasks.push(fetchJSON(`https://boards-api.greenhouse.io/v1/boards/${b}/jobs?content=false`).then(d =>
    (d.jobs || []).filter(j => intern.test(j.title)).forEach(j => out.push({ source: 'greenhouse', company: b, title: j.title,
      url: j.absolute_url, locations: [j.location?.name].filter(Boolean), terms: [], category: '', datePosted: Date.parse(j.updated_at) / 1000 }))).catch(e => ({ b, e })));
  for (const b of cfg.lever) tasks.push(fetchJSON(`https://api.lever.co/v0/postings/${b}?mode=json`).then(d =>
    d.filter(j => intern.test(j.text)).forEach(j => out.push({ source: 'lever', company: b, title: j.text, url: j.hostedUrl,
      locations: [j.categories?.location, ...(j.categories?.allLocations || [])].filter(Boolean), terms: [], category: j.categories?.team || '', datePosted: j.createdAt / 1000 }))).catch(e => ({ b, e })));
  for (const b of cfg.ashby) tasks.push(fetchJSON(`https://api.ashbyhq.com/posting-api/job-board/${b}`).then(d =>
    (d.jobs || []).filter(j => intern.test(j.title)).forEach(j => out.push({ source: 'ashby', company: b, title: j.title, url: j.jobUrl,
      locations: [j.location, ...(j.secondaryLocations || []).map(s => s.location)].filter(Boolean), terms: [], category: j.department || '', datePosted: Date.parse(j.publishedAt) / 1000 }))).catch(e => ({ b, e })));
  const res = await Promise.all(tasks);
  const failed = res.filter(r => r && r.e);
  if (failed.length) console.error(`[boards] ${failed.length}/${tasks.length} boards failed (first: ${failed[0].b}: ${failed[0].e.message})`);
  return out;
}

export function trackerIndex(tracker) {
  const keys = new Set(), titles = new Set();
  for (const r of tracker.rows || []) {
    if (r.url) keys.add(urlKey(r.url));
    titles.add(`${normCompany(r.company)}|${normTitle(r.role)}`);
  }
  return { keys, titles, has: j => keys.has(urlKey(j.url)) || titles.has(`${normCompany(j.company)}|${normTitle(j.title)}`) };
}

export const DEFAULT_SOURCES = ['simplify', 'zero2sudo'];

export async function scan({ sources = DEFAULT_SOURCES, maxAgeDays = 120 } = {}) {
  const tracker = readJSON(P.tracker, { rows: [] });
  const idx = trackerIndex(tracker);
  let jobs = [];
  if (sources.includes('simplify')) jobs.push(...await fromSimplify({ maxAgeDays }));
  if (sources.includes('boards')) jobs.push(...await fromBoards());
  if (sources.includes('zero2sudo')) {
    // zero2sudo's public Notion job table (docs/SOURCES.md). Instagram stories are not scraped.
    try { const z = await import('./zero2sudo.mjs'); jobs.push(...z.notionToJobs(await z.fromNotion())); }
    catch (e) { console.error(`[zero2sudo] ${e.message}`); }
  }
  // Company-site links like stripe.com/jobs?gh_jid=123 -> the real Greenhouse board form.
  const boards = readJSON(path.join(ROOT, 'config', 'boards.json'), { greenhouseByCompany: {} });
  for (const j of jobs) {
    const d = detectATS(j.url);
    if (d.ats === 'greenhouse-embed') {
      const b = boards.greenhouseByCompany[String(j.company).toLowerCase()];
      if (b) { j.originalUrl = j.url; j.url = `https://job-boards.greenhouse.io/${b}/jobs/${d.jobId}`; }
    }
  }
  // de-dupe within the scan
  const seen = new Set();
  jobs = jobs.filter(j => { const k = urlKey(j.url); if (seen.has(k)) return false; seen.add(k); return true; });

  const prev = readJSON(P.candidates, { jobs: [] });
  const prevById = new Map(prev.jobs.map(j => [j.id, j]));
  const out = [];
  for (const j of jobs) {
    const id = urlKey(j.url);
    const c = classify(j);
    const tracked = idx.has(j);
    const hold = holdFor(j.company);
    const p = prevById.get(id);
    out.push({
      id, ...j, ats: detectATS(j.url).ats, lane: tracked ? 'tracked' : c.lane, ok: c.ok && !tracked,
      reasons: c.reasons, hold: hold ? (hold.why || hold.note) : null, score: quickScore(j), resume: resumeFor(j.title),
      firstSeen: p?.firstSeen || today(),
    });
  }
  out.sort((a, b) => (b.ok - a.ok) || (b.score - a.score) || ((b.datePosted || 0) - (a.datePosted || 0)));
  const result = { scannedAt: new Date().toISOString(), sources, total: out.length, jobs: out };
  writeJSON(P.candidates, result);
  return result;
}

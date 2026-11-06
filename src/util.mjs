// Shared helpers: paths, JSON IO, URL normalisation, ATS detection.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PRIVATE = path.join(ROOT, 'private');
export const P = {
  profile: path.join(PRIVATE, 'profile.json'),
  tracker: path.join(PRIVATE, 'tracker.json'),
  candidates: path.join(PRIVATE, 'candidates.json'),
  queueDir: path.join(PRIVATE, 'queue'),
  runsDir: path.join(PRIVATE, 'runs'),
  cache: path.join(PRIVATE, 'cache'),
};

export function readJSON(file, fallback = undefined) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (fallback !== undefined) return fallback; throw new Error(`Cannot read ${file}: ${e.message}`); }
}
export function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1) + '\n');
  fs.renameSync(tmp, file);
}
export const today = () => new Date().toISOString().slice(0, 10);
export const nowISO = () => new Date().toISOString();

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim()
    .replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60);
}

/** Detect the ATS and its board/job ids from a posting URL. */
export function detectATS(url) {
  if (!url) return { ats: 'unknown' };
  let u;
  try { u = new URL(url); } catch { return { ats: 'unknown' }; }
  const h = u.hostname.replace(/^www\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  const ghJid = u.searchParams.get('gh_jid');
  if (/(^|\.)greenhouse\.io$/.test(h)) {
    if (parts[0] === 'embed') {
      return { ats: 'greenhouse', board: u.searchParams.get('for'), jobId: u.searchParams.get('token'), eu: h.includes('.eu.') };
    }
    const i = parts.indexOf('jobs');
    return { ats: 'greenhouse', board: parts[0], jobId: i >= 0 ? parts[i + 1] : ghJid, eu: h.includes('.eu.') };
  }
  if (h === 'jobs.lever.co' || h === 'jobs.eu.lever.co') return { ats: 'lever', board: parts[0], jobId: parts[1], eu: h.includes('.eu.') };
  if (h === 'jobs.ashbyhq.com') return { ats: 'ashby', board: parts[0], jobId: parts[1] };
  if (h === 'jobs.smartrecruiters.com') return { ats: 'smartrecruiters', board: parts[0], jobId: parts[1] };
  if (h === 'apply.workable.com') return { ats: 'workable', board: parts[0], jobId: parts[2] };
  if (/myworkdayjobs\.com$/.test(h)) return { ats: 'workday', signIn: true };
  if (/oraclecloud\.com$/.test(h)) return { ats: 'oracle', signIn: true };
  if (/icims\.com$/.test(h)) return { ats: 'icims', signIn: true };
  if (/eightfold\.ai$|successfactors|taleo\.net$|avature\.net$|phenompeople|yello\.co$|brassring/.test(h)) return { ats: 'account', signIn: true };
  if (ghJid) return { ats: 'greenhouse-embed', jobId: ghJid, host: h };
  return { ats: 'other', host: h };
}

/** Canonical form URL we drive with Playwright. */
export function applyUrl(url) {
  const d = detectATS(url);
  // Embed form: same application, no redirect to the company's own careers site.
  if (d.ats === 'greenhouse' && d.board && d.jobId) return `https://job-boards${d.eu ? '.eu' : ''}.greenhouse.io/embed/job_app?for=${d.board}&token=${d.jobId}`;
  if (d.ats === 'lever' && d.board && d.jobId) return `https://jobs${d.eu ? '.eu' : ''}.lever.co/${d.board}/${d.jobId}/apply`;
  if (d.ats === 'ashby' && d.board && d.jobId) return `https://jobs.ashbyhq.com/${d.board}/${d.jobId}/application`;
  return url;
}

/** Key used for de-duplication against the tracker. */
export function urlKey(url) {
  const d = detectATS(url);
  if (d.jobId && ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable', 'greenhouse-embed'].includes(d.ats)) {
    return `${d.ats === 'greenhouse-embed' ? 'greenhouse' : d.ats}:${d.jobId}`.toLowerCase();
  }
  return String(url || '').split('#')[0].replace(/\?.*$/, '').replace(/\/(apply|application)\/?$/, '').replace(/\/$/, '').toLowerCase();
}

export const NO_SIGNIN_ATS = new Set(['greenhouse', 'lever', 'ashby', 'smartrecruiters']);
export const MAYBE_NO_SIGNIN_ATS = new Set(['workable', 'greenhouse-embed']);

export function normTitle(s) {
  return String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/summer|2027|2026|intern(ship)?|-|–|—|,|:/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
export function normCompany(s) {
  return String(s || '').toLowerCase().replace(/,?\s*(inc\.?|llc|corp(oration)?|technologies|technology|company|co\.|labs?|ai)$/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

export function fmtTable(rows, cols) {
  const w = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
  const line = r => cols.map((c, i) => String(r[c] ?? '').padEnd(w[i])).join('  ');
  return [line(Object.fromEntries(cols.map(c => [c, c]))), w.map(n => '-'.repeat(n)).join('  '), ...rows.map(line)].join('\n');
}

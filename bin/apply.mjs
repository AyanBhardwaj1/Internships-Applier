#!/usr/bin/env node
// Internships Applier CLI. Run with: node bin/apply.mjs <command> [...]
// Use the ./apply wrapper: it sets NODE_USE_ENV_PROXY=1 so fetch() goes through the cloud proxy.
import fs from 'node:fs';
import path from 'node:path';
import { P, ROOT, readJSON, writeJSON, today, nowISO, slugify, urlKey, fmtTable, detectATS, applyUrl } from '../src/util.mjs';

const [cmd, ...args] = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(`--${name}`); if (i < 0) return def; const v = args[i + 1]; args.splice(i, v && !v.startsWith('--') ? 2 : 1); return v && !v.startsWith('--') ? v : true; };

function profile() {
  if (!fs.existsSync(P.profile)) { console.error('private/profile.json missing. See docs/SETUP.md ("Restore private data").'); process.exit(2); }
  return readJSON(P.profile);
}
const qFile = slug => path.join(P.queueDir, `${slug}.json`);
function loadQueue() {
  if (!fs.existsSync(P.queueDir)) return [];
  return fs.readdirSync(P.queueDir).filter(f => f.endsWith('.json')).map(f => readJSON(path.join(P.queueDir, f)));
}
function getItem(ref) {
  const Q = loadQueue();
  const r = String(ref).toLowerCase();
  return Q.find(q => q.slug === r) || Q.find(q => q.slug.startsWith(r)) ||
    (() => { const m = Q.filter(q => q.company.toLowerCase().includes(r) && !['submitted', 'skipped', 'closed'].includes(q.status)); return m.length === 1 ? m[0] : null; })();
}
const saveItem = it => writeJSON(qFile(it.slug), it);

function trackerUpsert(row) {
  const t = readJSON(P.tracker, { rows: [] });
  const i = t.rows.findIndex(r => r.id === row.id || (row.url && r.url && urlKey(r.url) === urlKey(row.url)));
  if (i >= 0) t.rows[i] = { ...t.rows[i], ...row, history: [...(t.rows[i].history || []), ...(row.history || [])] };
  else t.rows.push(row);
  t.updated = today();
  writeJSON(P.tracker, t);
}

const COMMANDS = {
  auto: () => auto(),
  async doctor() {
    // Probe real paths with redirects off: site roots redirect to marketing domains we don't need.
    const hosts = ['https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/README.md', 'https://job-boards.greenhouse.io/figma', 'https://boards-api.greenhouse.io/v1/boards/figma/jobs',
      'https://jobs.lever.co/zoox', 'https://api.lever.co/v0/postings/zoox?mode=json&limit=1', 'https://jobs.ashbyhq.com/saronic', 'https://api.ashbyhq.com/posting-api/job-board/saronic', 'https://jobs.smartrecruiters.com/ServiceNow'];
    const rows = [];
    for (const h of hosts) {
      let s;
      try { const r = await fetch(h, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000) }); s = `ok (${r.status})`; }
      catch (e) { s = `BLOCKED (${(e.cause?.message || e.message).slice(0, 60)})`; }
      rows.push({ host: new URL(h).hostname, status: s });
    }
    console.log(fmtTable(rows, ['host', 'status']));
    const priv = ['profile.json', 'tracker.json', 'resumes/swe.pdf', 'resumes/ml.pdf', 'resumes/pm.pdf'].map(f => ({ file: 'private/' + f, present: fs.existsSync(path.join(ROOT, 'private', f)) ? 'yes' : 'MISSING' }));
    console.log('\n' + fmtTable(priv, ['file', 'present']));
    let pw = 'ok'; try { (await import('node:module')).createRequire(import.meta.url)('playwright'); } catch { pw = 'MISSING'; }
    console.log(`\nplaywright: ${pw}`);
    if (rows.some(r => r.status.startsWith('BLOCKED'))) console.log('\nBlocked ATS hosts: add them under the environment\'s Network access > Allowed domains (docs/SETUP.md).');
  },

  async scan() {
    const { scan } = await import('../src/scan.mjs');
    const sources = ['simplify', ...(flag('boards') ? ['boards'] : [])];
    const r = await scan({ sources, maxAgeDays: Number(flag('days', 120)) });
    const lanes = {}; for (const j of r.jobs) lanes[j.lane] = (lanes[j.lane] || 0) + 1;
    console.log(`Scanned ${r.total} active listings → ${JSON.stringify(lanes)}`);
    const top = r.jobs.filter(j => j.ok).slice(0, Number(flag('top', 30)));
    console.log(fmtTable(top.map(j => ({ score: j.score, company: j.company.slice(0, 26), title: j.title.slice(0, 50), where: (j.locations[0] || '').slice(0, 18), ats: j.ats, hold: j.hold ? 'HOLD' : '' })), ['score', 'company', 'title', 'where', 'ats', 'hold']));
  },

  // Move candidates into the apply queue: `pick --top 25` or `pick <candidate-id|url> ...`
  async pick() {
    const c = readJSON(P.candidates, { jobs: [] });
    const existing = new Set(loadQueue().map(q => q.id));
    let chosen;
    const top = flag('top');
    if (top) chosen = c.jobs.filter(j => j.ok && !j.hold && !existing.has(j.id)).slice(0, Number(top));
    else chosen = args.map(a => c.jobs.find(j => j.id === a || j.url === a || urlKey(a) === j.id) || { id: urlKey(a), url: a, company: detectATS(a).board || 'unknown', title: 'unknown', locations: [], ats: detectATS(a).ats, resume: 'swe', score: null });
    for (const j of chosen) {
      if (existing.has(j.id)) continue;
      const slug = slugify(`${j.company}-${j.title}`).slice(0, 48) + '-' + j.id.split(':').pop().slice(-6);
      saveItem({ slug, id: j.id, company: j.company, title: j.title, url: j.url, applyUrl: applyUrl(j.url), ats: j.ats, locations: j.locations, terms: j.terms,
        resume: j.resume, score: j.score, status: 'new', approved: false, overrides: {}, asks: [], notes: [], addedAt: nowISO(), history: [] });
      console.log(`queued ${slug}`);
    }
  },

  async queue() {
    const Q = loadQueue().filter(q => flag('all') || !['submitted', 'skipped', 'closed'].includes(q.status));
    Q.sort((a, b) => (b.approved - a.approved) || ((b.score || 0) - (a.score || 0)));
    console.log(fmtTable(Q.map(q => ({ slug: q.slug, status: q.status + (q.approved ? ' ✓approved' : ''), score: q.score, company: q.company.slice(0, 22), title: q.title.slice(0, 44), asks: (q.asks || []).filter(a => a.required).length || '' })), ['slug', 'status', 'score', 'company', 'title', 'asks']));
  },

  async show() {
    const it = getItem(args[0]); if (!it) return console.error('not found');
    console.log(JSON.stringify(it, null, 2));
  },

  // Record an answer for a question on one application (essays, why-us, special questions).
  async answer() {
    const [ref, question, ...rest] = args; const it = getItem(ref); if (!it) return console.error('not found');
    it.overrides[question] = rest.join(' '); saveItem(it); console.log(`saved answer for "${question}" on ${it.slug}`);
  },

  async approve() { for (const a of args) { const it = getItem(a); if (!it) { console.error(`not found: ${a}`); continue; } it.approved = true; it.approvedAt = nowISO(); saveItem(it); console.log(`approved ${it.slug}`); } },
  async skip() { for (const a of args) { const it = getItem(a); if (!it) continue; it.status = 'skipped'; saveItem(it); console.log(`skipped ${it.slug}`); } },

  async inspect() { await run('inspect'); },
  async fill() { await run('fill'); },
  // Submit ONLY the named applications (or --approved). Never "everything".
  async submit() { await run('submit'); },

  async status() {
    const t = readJSON(P.tracker, { rows: [] });
    const c = {}; for (const r of t.rows) c[r.outcome] = (c[r.outcome] || 0) + 1;
    console.log(`Tracker: ${t.rows.length} rows`, c);
    const live = t.rows.filter(r => ['assessment', 'interview', 'recruiter_screen', 'oa', 'referral_pending', 'offer'].includes(r.outcome));
    console.log(fmtTable(live.map(r => ({ company: r.company, role: r.role.slice(0, 50), outcome: r.outcome, note: (r.note || '').slice(0, 60) })), ['company', 'role', 'outcome', 'note']));
  },

  // track <tracker-id|company> <outcome> [note...]  e.g. track pnc interview "round 2 scheduled"
  async track() {
    const [ref, outcome, ...note] = args;
    const t = readJSON(P.tracker, { rows: [] });
    const m = t.rows.filter(r => r.id === ref || r.company.toLowerCase().includes(String(ref).toLowerCase()));
    if (m.length !== 1) { console.error(`${m.length} matches:`, m.map(r => `${r.id} (${r.role})`).join(', ')); process.exit(1); }
    const r = m[0]; r.outcome = outcome; r.history = [...(r.history || []), { at: today(), stage: outcome, note: note.join(' ') }];
    if (note.length) r.note = (r.note ? r.note + ' | ' : '') + note.join(' ');
    writeJSON(P.tracker, t); console.log(`${r.company} — ${r.role}: ${outcome}`);
  },
};


// ---------------------------------------------------------------- auto pipeline
// Standing approval (Ayan, 2026-11-06): "keep finding more and applying to them with cloud, prioritize
// ones that won't have a captcha". Auto-submits ONLY forms that fill completely from profile facts
// (no essays, no blanks); everything else waits in the queue for him.
const CAPTCHA_CACHE = path.join(P.cache, 'captcha-by-board.json');
const RANK = { none: 0, 'recaptcha-invisible': 1, recaptcha: 3, unknown: 2, hcaptcha: 4, turnstile: 4, datadome: 5 };
async function auto() {
  const { scan } = await import('../src/scan.mjs');
  const { runApplication } = await import('../src/fill.mjs');
  const prof = profile();
  const maxSubmit = Number(flag('max-submit', 15)), maxProbe = Number(flag('probe', 60)), dry = !!flag('dry'), sweOnly = !!flag('swe');
  const allowRecaptcha = !flag('none-only');
  const cache = readJSON(CAPTCHA_CACHE, {});
  const r = flag('no-scan') ? readJSON(P.candidates, { jobs: [] }) : await scan({ sources: ['simplify'] });
  const queued = new Set(loadQueue().map(q => q.id));
  let cands = r.jobs.filter(j => j.ok && !j.hold && !queued.has(j.id) && ['greenhouse', 'ashby'].includes(j.ats));
  { const seen = new Set(); cands = cands.filter(j => { const k = (j.company + '|' + j.title).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); }
  if (sweOnly) cands = cands.filter(j => /software|swe|sde|developer|backend|full[- ]?stack|frontend|platform|infrastructure|engineer/i.test(j.title) && !/product manag/i.test(j.title));
  const boardOf = j => { const d = detectATS(j.url); return `${d.ats}:${d.board}`.toLowerCase(); };
  // probe one posting per board we haven't seen
  let probed = 0;
  // Probe Ashby boards first: they are the ones that can submit from the cloud.
  const probeOrder = [...cands].sort((a, b) => (a.ats === 'ashby' ? 0 : 1) - (b.ats === 'ashby' ? 0 : 1));
  for (const j of probeOrder) {
    const b = boardOf(j);
    if (cache[b] || probed >= maxProbe) continue;
    const rep = await runApplication({ id: j.id, company: j.company, title: j.title, url: j.url, resume: j.resume }, { mode: 'probe', profile: prof, outDir: path.join(P.runsDir, 'probe-' + b.replace(/[^\w]+/g, '_')) });
    cache[b] = { kind: rep.status === 'closed' ? 'closed-sample' : (rep.captchaKind || 'unknown'), at: today(), sample: j.url };
    probed++; writeJSON(CAPTCHA_CACHE, cache);
    console.log(`probe ${b}: ${cache[b].kind}`);
  }
  const kindOf = j => cache[boardOf(j)]?.kind || 'unknown';
  // Greenhouse with reCAPTCHA falls back to an emailed human-verification code from the cloud, so only
  // Greenhouse boards with no CAPTCHA at all qualify. Ashby invisible reCAPTCHA often passes.
  const ok = cands.filter(j => { const k = kindOf(j); return k === 'none' || (allowRecaptcha && k === 'recaptcha-invisible' && j.ats === 'ashby'); })
    .sort((a, b) => (RANK[kindOf(a)] - RANK[kindOf(b)]) || ((b.score || 0) - (a.score || 0)));
  console.log(`candidates: ${cands.length} · submit-friendly: ${ok.length} (none: ${ok.filter(j => kindOf(j) === 'none').length})`);
  const results = []; let submitted = 0;
  for (const j of ok) {
    if (submitted >= maxSubmit) break;
    const slug = slugify(`${j.company}-${j.title}`).slice(0, 48) + '-' + j.id.split(':').pop().slice(-6);
    const it = { slug, id: j.id, company: j.company, title: j.title, url: j.url, applyUrl: applyUrl(j.url), ats: j.ats, locations: j.locations, terms: j.terms,
      resume: j.resume, score: j.score, status: 'new', approved: false, overrides: {}, asks: [], notes: [], addedAt: nowISO(), history: [], origin: 'auto', captchaKind: kindOf(j) };
    const fillRep = await runApplication(it, { mode: 'fill', profile: prof });
    Object.assign(it, { status: fillRep.status, asks: fillRep.asks, questions: fillRep.questions, filled: fillRep.filled, blankRequired: fillRep.blankRequired, notes: fillRep.notes,
      lastRun: { mode: 'fill', at: fillRep.finishedAt, status: fillRep.status, screenshots: fillRep.screenshots } });
    it.history.push({ at: nowISO(), mode: 'fill', status: fillRep.status });
    const essays = (fillRep.asks || []).some(a => a.required);
    if (fillRep.status === 'ready' && !essays && !dry) {
      const subRep = await runApplication(it, { mode: 'submit', profile: prof });
      it.status = subRep.status; it.notes = subRep.notes; it.lastRun = { mode: 'submit', at: subRep.finishedAt, status: subRep.status, screenshots: subRep.screenshots };
      it.history.push({ at: nowISO(), mode: 'submit', status: subRep.status });
      if (subRep.status === 'submitted') {
        submitted++; it.submittedAt = nowISO();
        trackerUpsert({ id: it.slug, company: it.company, role: it.title, url: it.url, urlKey: it.id, location: (it.locations || [])[0] || null, stage: 'applied', outcome: 'applied',
          history: [{ at: today(), stage: 'applied' }], appliedAt: today(), score: it.score, note: 'Auto-submitted from cloud (standing approval 2026-11-06)', source: 'cloud', submittedBy: 'claude-cloud' });
      }
      // learn: a challenge means this board is not submit-friendly
      if (subRep.status === 'captcha' || (subRep.status === 'unknown' && j.ats === 'greenhouse')) { const b = boardOf(j); cache[b] = { ...(cache[b] || {}), kind: 'challenged', at: today() }; writeJSON(CAPTCHA_CACHE, cache); }
    }
    saveItem(it);
    console.log(`${it.status.padEnd(12)} ${j.company} — ${j.title} [${kindOf(j)}]${it.status === 'needs_input' ? ' (needs: ' + (fillRep.asks || []).filter(a => a.required).map(a => a.q.slice(0, 40)).join('; ') + ')' : ''}`);
    results.push({ company: j.company, title: j.title, status: it.status });
  }
  console.log(`\nsubmitted ${submitted} · ` + Object.entries(results.reduce((a, x) => (a[x.status] = (a[x.status] || 0) + 1, a), {})).map(([k, v]) => `${k} ${v}`).join(' · '));
}

async function run(mode) {
  const { runApplication } = await import('../src/fill.mjs');
  const prof = profile();
  let items;
  if (flag('approved')) items = loadQueue().filter(q => q.approved && !['submitted', 'skipped', 'closed'].includes(q.status));
  else if (mode !== 'submit' && flag('all')) items = loadQueue().filter(q => ['new', 'inspected', 'needs_input', 'ready', 'error'].includes(q.status));
  else items = args.map(a => getItem(a) || (console.error(`not found: ${a}`), null)).filter(Boolean);
  if (mode === 'submit' && !items.length) { console.error('Name the applications to submit (or --approved).'); process.exit(1); }
  const results = [];
  for (const it of items) {
    if (mode === 'submit' && it.status === 'submitted') { console.log(`${it.slug}: already submitted`); continue; }
    process.stdout.write(`${mode} ${it.slug} … `);
    const r = await runApplication(it, { mode, profile: prof, headless: !flag('headed') });
    it.lastRun = { mode, at: r.finishedAt, status: r.status, report: r.screenshots?.[0] ? path.dirname(r.screenshots[0]) : null, screenshots: r.screenshots };
    it.asks = r.asks; it.questions = r.questions || it.questions; it.notes = r.notes; it.filled = r.filled; it.blankRequired = r.blankRequired;
    it.history.push({ at: nowISO(), mode, status: r.status });
    if (mode !== 'inspect' || r.status !== 'inspected') it.status = r.status;
    else it.status = 'inspected';
    if (r.status === 'submitted') {
      it.submittedAt = nowISO();
      trackerUpsert({ id: it.slug, company: it.company, role: it.title, url: it.url, urlKey: it.id, location: (it.locations || [])[0] || null, stage: 'applied', outcome: 'applied',
        history: [{ at: today(), stage: 'applied' }], appliedAt: today(), score: it.score, note: 'Submitted from cloud session after Ayan named it', source: 'cloud', submittedBy: 'claude-cloud' });
    }
    saveItem(it);
    console.log(`${r.status}${r.asks?.length ? ` (${r.asks.filter(a => a.required).length} required question(s) need you)` : ''}${r.notes?.length ? ' — ' + r.notes[0] : ''}`);
    results.push({ slug: it.slug, status: r.status });
  }
  return results;
}

if (!cmd || !COMMANDS[cmd]) {
  console.log(`usage: node bin/apply.mjs <command>
  doctor                      check network + private data
  scan [--boards] [--top N]   pull Summer 2027 listings, apply rules, show best matches
  pick --top N | pick <id..>  add candidates to the apply queue
  queue [--all]               list queued applications
  show <slug>                 full details of one queued application
  inspect <slug..>|--all      open form, list questions + planned answers (changes nothing)
  fill <slug..>|--all         fill forms + screenshot, never submits
  answer <slug> "<q>" "<a>"   save an answer for a question (essays etc.)
  approve <slug..>            mark as approved by Ayan
  submit <slug..>|--approved  submit ONLY the named/approved applications
  skip <slug..>               drop from queue
  status                      tracker summary (live processes)
  track <id|company> <outcome> [note]
  auto [--max-submit N] [--probe N] [--swe] [--none-only] [--dry]  scan → probe CAPTCHA → fill → submit complete ones`);
  process.exit(cmd ? 1 : 0);
}
await COMMANDS[cmd]();

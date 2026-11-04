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
  async doctor() {
    const hosts = ['https://raw.githubusercontent.com', 'https://job-boards.greenhouse.io', 'https://boards-api.greenhouse.io', 'https://jobs.lever.co', 'https://api.lever.co', 'https://jobs.ashbyhq.com', 'https://api.ashbyhq.com', 'https://jobs.smartrecruiters.com'];
    const rows = [];
    for (const h of hosts) {
      let s;
      try { const r = await fetch(h, { method: 'HEAD', signal: AbortSignal.timeout(10000) }); s = `ok (${r.status})`; }
      catch (e) { s = `BLOCKED (${(e.cause?.message || e.message).slice(0, 60)})`; }
      rows.push({ host: h.replace('https://', ''), status: s });
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
  track <id|company> <outcome> [note]`);
  process.exit(cmd ? 1 : 0);
}
await COMMANDS[cmd]();

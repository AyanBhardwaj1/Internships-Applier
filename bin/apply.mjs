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
  outreach: () => outreach(),
  // Daily brief (docs/BRIEF.md): new internships, programs, hackathons, networking events, outreach status.
  async brief() {
    const days = Number(flag('days', 1));
    const sources = flag('sources'); const asJson = !!flag('json');
    const c = readJSON(P.candidates, { scannedAt: null });
    if (flag('scan') || !c.scannedAt || Date.now() - Date.parse(c.scannedAt) > 20 * 3600e3) {
      const { scan } = await import('../src/scan.mjs');
      const r = await scan({ sources: ['simplify'] });
      console.error(`(scanned ${r.total} listings first)`);
    }
    const { buildBrief } = await import('../src/brief.mjs');
    const r = await buildBrief({ sinceDays: days, sources: typeof sources === 'string' ? sources.split(',') : undefined });
    if (asJson) console.log(JSON.stringify({ file: r.file, counts: r.counts, errors: r.errors, hackathons: r.hackathons, events: r.events }, null, 1));
    else { console.log(r.md); console.error(`saved ${path.relative(ROOT, r.file)} · sources ${JSON.stringify(r.counts)}`); }
  },
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
  const maxSubmit = Math.min(7, Number(flag('max-submit', 7))), maxProbe = Number(flag('probe', 60)), dry = !!flag('dry'), sweOnly = !!flag('swe');
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


// ---------------------------------------------------------------- outreach (docs/OUTREACH.md)
async function outreach() {
  const o = await import('../src/outreach.mjs');
  const sub = args.shift();
  const leadsFile = o.O.leads;
  const load = () => readJSON(leadsFile, { leads: {} });
  const pickLeads = (L, refs) => refs.map(r => L.leads[r] || Object.values(L.leads).find(x => x.company.toLowerCase() === r.toLowerCase() || x.id.startsWith(r.toLowerCase()))).filter(Boolean);
  const topIds = (L, n, filter = () => true) => Object.values(L.leads).filter(filter).sort((a, b) => b.score - a.score).slice(0, n).map(x => x.id);
  switch (sub) {
    case 'discover': {
      const r = await o.discover({ top: Number(flag('top', 60)), focus: flag('focus') || null, refresh: !!flag('refresh') });
      console.log(`scored ${r.scored} startups · ${r.added} new leads`);
      console.log(fmtTable(r.shown.slice(0, Number(flag('show', 30))).map(({ c, score, reasons }) => ({ score, company: c.name.slice(0, 22), batch: c.batch, team: c.team_size, why: reasons.join(', ').slice(0, 70) })), ['score', 'company', 'batch', 'team', 'why']));
      break;
    }
    case 'people': {
      const L = load();
      const t = flag('top'); const ids = t ? topIds(L, Number(t), x => !x.people?.length && !x.peopleError) : args;
      for (const id of ids) {
        const lead = await o.findPeople(id).catch(e => ({ company: id, peopleError: e.message }));
        console.log(`${lead.company}: ${(lead.people || []).map(p => `${p.name} (${p.title})`).join('; ') || lead.peopleError}${lead.internJobs?.length ? ` · intern jobs: ${lead.internJobs.map(j => j.title).join('; ')}` : ''}`);
        await new Promise(r => setTimeout(r, 1200)); // be gentle with ycombinator.com
      }
      break;
    }
    case 'draft': {
      const L = load();
      const t = flag('top'); const ids = t ? topIds(L, Number(t), x => x.people?.length && !x.draft) : args;
      for (const id of ids) {
        const lead = L.leads[id]; if (!lead) continue;
        const person = (lead.teamSize > 8 && lead.people?.find(p => /\bcto\b/i.test(p.title || ''))) || lead.people?.find(p => /\bceo\b/i.test(p.title || '')) || lead.people?.[0];
        lead.draft = o.draftEmail(lead, { person });
        lead.to = person ? { name: person.name, title: person.title, email: person.emailGuesses?.[0] || null, alternates: person.emailGuesses?.slice(1) || [] } : null;
        lead.status = lead.status === 'new' ? 'drafted' : lead.status;
        console.log(`${lead.company} → ${lead.to?.name || '?'} <${lead.to?.email || 'no email'}> · ${lead.draft.words} words${lead.draft.needsPersonalising ? ' · NEEDS HOOK' : ''}`);
      }
      writeJSON(leadsFile, L);
      break;
    }
    case 'set': { // outreach set <id> subject|body|to "<text>"
      const L = load(); const [id, field, ...rest] = args; const lead = L.leads[id]; if (!lead) return console.error('no lead');
      const v = rest.join(' ');
      if (field === 'to') lead.to = { ...(lead.to || {}), email: v }; else { lead.draft = { ...(lead.draft || {}), [field]: v }; lead.draft.needsPersonalising = /\[[^\]]+\]/.test(lead.draft.body || ''); lead.draft.words = (lead.draft.body || '').split(/\s+/).length; }
      writeJSON(leadsFile, L); console.log(`updated ${id}.${field}`); break;
    }
    case 'list': {
      const L = load(); const st = flag('status');
      const rows = Object.values(L.leads).filter(x => !st || x.status === st).sort((a, b) => b.score - a.score);
      console.log(fmtTable(rows.slice(0, Number(flag('top', 50))).map(x => ({ id: x.id.slice(0, 22), status: x.status, score: x.score, company: x.company.slice(0, 20), batch: x.batch, contact: x.to?.name || (x.people?.[0]?.name || ''), why: (x.reasons || []).slice(0, 3).join(', ').slice(0, 50) })), ['id', 'status', 'score', 'company', 'batch', 'contact', 'why']));
      break;
    }
    case 'show': {
      const L = load(); for (const x of pickLeads(L, args)) {
        console.log(`# ${x.company} (${x.batch}, ${x.teamSize} people) score ${x.score} · ${x.status}\n${x.oneLiner}\n${x.website} · ${x.ycUrl}`);
        for (const p of x.people || []) console.log(`- ${p.name}, ${p.title} · ${p.linkedin || ''} · guesses: ${(p.emailGuesses || []).join(', ')}`);
        if (x.internJobs?.length) console.log(`Intern jobs: ${x.internJobs.map(j => `${j.title} ${j.url || ''}`).join(' | ')}`);
        if (x.draft) console.log(`\nTo: ${x.to?.name} <${x.to?.email}>\nSubject: ${x.draft.subject}\n\n${x.draft.body}\n\nCompose: ${o.gmailComposeUrl(x.to?.email, x.draft.subject, x.draft.body)}`);
        for (const w of x.warmPaths || []) console.log(`warm path: ${w.kind}: ${w.how} ${w.url || ''}`);
      }
      break;
    }
    case 'approve': { const L = load(); for (const x of pickLeads(L, args)) { if (x.draft?.needsPersonalising) { console.error(`${x.company}: draft still has [placeholders]`); continue; } x.status = 'approved'; x.approvedAt = nowISO(); console.log(`approved ${x.company}`); } writeJSON(leadsFile, L); break; }
    case 'sent': { // record a send Ayan made (or a Gmail draft he sent)
      const L = load(); for (const x of pickLeads(L, args)) { x.status = 'sent'; x.sentAt = nowISO(); x.sentTo = x.to; x.followupsSent = 0; x.history.push({ at: nowISO(), event: 'sent' }); console.log(`sent: ${x.company}`); } writeJSON(leadsFile, L); break;
    }
    case 'replied': case 'meeting': case 'closed': {
      const L = load(); for (const x of pickLeads(L, args)) { x.status = sub; x.history.push({ at: nowISO(), event: sub }); console.log(`${x.company}: ${sub}`); } writeJSON(leadsFile, L); break;
    }
    case 'followups': {
      const L = load(); const due = o.dueFollowups(L);
      if (!due.length) return console.log('no follow-ups due');
      for (const { L: x, n, dueDate } of due) { const f = o.followupDraft(x, n); console.log(`\n## ${x.company} follow-up #${n} (due ${dueDate}) to ${x.sentTo?.email}\n${f.body}\nCompose: ${o.gmailComposeUrl(x.sentTo?.email, f.subject, f.body)}`); }
      break;
    }
    case 'followup-sent': { const L = load(); for (const x of pickLeads(L, args)) { x.followupsSent = (x.followupsSent || 0) + 1; x.history.push({ at: nowISO(), event: `followup ${x.followupsSent}` }); console.log(`${x.company}: follow-up ${x.followupsSent} recorded`); } writeJSON(leadsFile, L); break; }
    case 'meet': { // outreach meet <id> 2026-11-12T15:00:00-06:00 [minutes]
      const L = load(); const [id, when, mins] = args; const x = L.leads[id]; if (!x) return console.error('no lead');
      x.status = 'meeting'; x.meetingAt = when; writeJSON(leadsFile, L);
      console.log(o.calendarUrl(`Call with ${x.to?.name || x.company} (${x.company})`, when, Number(mins || 30), `Outreach lead: ${x.ycUrl}`)); break;
    }
    default:
      console.log(`outreach commands:
  discover [--top N] [--focus robotics|hardtech|ai|devtools] [--refresh]   score YC startups for Ayan
  people <id..> | --top N        founders + open jobs from YC pages, email guesses (MX-checked), warm paths
  draft <id..> | --top N         first-pass email (needs a personal hook before approval)
  set <id> subject|body|to "<text>"
  list [--status S] | show <id..>
  approve <id..>                 Ayan approved the final text
  sent <id..> | replied | meeting | closed <id..>
  followups                      due follow-ups (+4 and +11 days) with compose links
  followup-sent <id..> | meet <id> <ISO time> [mins]  (calendar link)`);
  }
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
  auto [--max-submit N] [--probe N] [--swe] [--none-only] [--dry]  scan → probe CAPTCHA → fill → submit complete ones (default max 7)
  brief [--days N] [--scan] [--sources devpost,mlh,cerebralvalley,luma] [--json]
                              daily brief: new internships, programs, hackathons, events, outreach
  outreach <sub>              startup/founder outreach (docs/OUTREACH.md)`);
  process.exit(cmd ? 1 : 0);
}
await COMMANDS[cmd]();

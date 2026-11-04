#!/usr/bin/env node
// Rebuild private/profile.json and private/tracker.json in a fresh container, from data Ayan already owns:
//   1. the Summer '27 Internship Desk database, exported with
//      ArtifactData list collection=applications out_dir=<dir>   (gives <dir>/applications/*.json)
//   2. the resume PDF(s) restored into private/resumes/ (see CLAUDE.md)
// Usage: node scripts/rebuild-private.mjs <desk-export-dir>
// Nothing personal is hardcoded here: every value is the most common answer he gave on past forms.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { P, ROOT, readJSON, writeJSON, urlKey, today } from '../src/util.mjs';

const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/rebuild-private.mjs <desk-export-dir>'); process.exit(1); }
const appsDir = fs.existsSync(path.join(dir, 'applications')) ? path.join(dir, 'applications') : dir;
const docs = fs.readdirSync(appsDir).filter(f => f.endsWith('.json')).map(f => ({ _id: f.slice(0, -5), ...readJSON(path.join(appsDir, f)) }));

// ---- answer bank: question label -> most common answer
const bank = new Map();
const add = (q, a) => { if (!q || a == null || a === '') return; q = String(q).toLowerCase().trim(); a = String(a).trim(); const m = bank.get(q) || new Map(); m.set(a, (m.get(a) || 0) + 1); bank.set(q, m); };
for (const d of docs) {
  if (Array.isArray(d.filled)) for (const x of d.filled) if (x && x.q) add(x.q, x.a);
  if (d.filled && !Array.isArray(d.filled) && typeof d.filled === 'object') for (const [k, v] of Object.entries(d.filled)) add(k, v);
}
const best = (...rx) => {
  const counts = new Map();
  for (const [q, m] of bank) if (rx.some(r => r.test(q))) for (const [a, n] of m) counts.set(a, (counts.get(a) || 0) + n);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

const tpl = readJSON(path.join(ROOT, 'config', 'profile.example.json'));
const p = JSON.parse(JSON.stringify(tpl));
p._source = `Rebuilt ${today()} from the Internship Desk database by scripts/rebuild-private.mjs`;
const first = best(/^first name$/), last = best(/^last name$/);
if (first) p.name = { ...p.name, first, last, full: `${first} ${last}`, preferred: best(/preferred name/) || first, pronouns: best(/pronoun/) || '' };
p.email = best(/^e-?mail$/) || p.email;
const phone = best(/^phone( number)?$/);
if (phone) { const digits = phone.replace(/\D/g, '').slice(-10); p.phone = { display: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`, e164: `+1${digits}`, digits, country: 'United States +1' }; }
p.links.linkedin = (best(/^linkedin( profile| url)?$/) || p.links.linkedin).replace(/\/$/, '');
p.links.github = best(/^github$/, /^website$/) || p.links.github; p.links.website = p.links.github;
const addr = best(/permanent address|^address$/);
if (addr) { const m = addr.match(/^(.*?),\s*([^,]+),\s*([A-Z]{2})\s*(\d{5})/); if (m) p.permanentAddress = { line1: m[1], city: m[2], state: m[3], zip: m[4], country: 'United States' }; }
const eeo = best(/^eeo$/);
p.eeo.gender = best(/^gender$/) || p.eeo.gender;
p.eeo.race = best(/^race$/) || p.eeo.race;
p.eeo.raceLong = /not hispanic/i.test(eeo || '') ? `${p.eeo.race} (Not Hispanic or Latino)` : p.eeo.raceLong;
p.eeo.veteran = best(/^veteran status$/) || p.eeo.veteran;
p.eeo.disability = best(/^disability$/) || p.eeo.disability;
p.eeo.raceAlt = [p.eeo.race];
p.defaults.howDidYouHear = best(/how (did you )?hear/) || 'LinkedIn';
p.defaults.languages = best(/^languages$/) || p.defaults.languages;
const grad = best(/^grad year$/, /^end date year$/);
if (grad) p.education.graduation = { month: 5, year: Number(grad), text: `May ${grad}`, iso: `${grad}-05-15`, season: `Spring ${grad}` };
p.education.school = 'The University of Texas at Austin'; p.education.schoolShort = best(/^school$/) || 'University of Texas - Austin';
p.resumes = {
  swe: { file: 'private/resumes/swe.pdf', uploadName: `${p.name.first}_${p.name.last} -- Resume.pdf`, use: 'default' },
  ml: { file: 'private/resumes/ml.pdf', uploadName: `${p.name.first}_${p.name.last} -- Resume.pdf`, use: 'ML/AI' },
  pm: { file: 'private/resumes/pm.pdf', uploadName: `${p.name.first}_${p.name.last} -- Resume.pdf`, use: 'PM' },
};
// Experience/education text comes from the resume itself.
const resume = path.join(ROOT, 'private', 'resumes', 'swe.pdf');
if (fs.existsSync(resume)) { try { execFileSync('pdftotext', ['-layout', resume, path.join(ROOT, 'private', 'cv.txt')]); } catch {} }

if (fs.existsSync(P.profile) && !process.argv.includes('--force')) console.log('private/profile.json exists; not overwriting (use --force). Rebuilt copy → private/profile.rebuilt.json');
writeJSON(fs.existsSync(P.profile) && !process.argv.includes('--force') ? path.join(ROOT, 'private', 'profile.rebuilt.json') : P.profile, p);

// ---- tracker from Desk rows
const rows = docs.map(d => ({ id: d._id, num: d.num || null, company: d.company, role: d.role, url: d.url || '', urlKey: d.url ? urlKey(d.url) : '',
  location: d.location || null, stage: d.stage, outcome: d.outcome?.stage || d.stage, history: d.outcome?.history || [], appliedAt: d.appliedAt || null,
  score: d.score ?? null, note: d.note || d.reason || '', source: 'desk' }));
if (!fs.existsSync(P.tracker) || process.argv.includes('--force')) writeJSON(P.tracker, { updated: today(), rows });
console.log(`profile: ${p.name.full} · tracker rows from Desk: ${rows.length}`);

// Runs the filler against local HTML fixtures shaped like Greenhouse / Lever / Ashby forms.
// Uses the fake example profile so no personal data is involved. `node test/fixtures.test.mjs`
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { ROOT, readJSON } from '../src/util.mjs';
import { runApplication } from '../src/fill.mjs';

const profile = readJSON(path.join(ROOT, 'config', 'profile.example.json'));
const fx = n => pathToFileURL(path.join(ROOT, 'test', 'fixtures', n)).href;
const out = n => path.join(os.tmpdir(), 'ia-test-' + n);
let failures = 0;
async function check(name, fn) { try { await fn(); console.log('ok  ', name); } catch (e) { failures++; console.log('FAIL', name, '\n   ', e.message); } }
const get = (r, rx) => r.filled.find(x => rx.test(x.q))?.a;

await check('greenhouse: fill leaves essay for Ayan, fills the rest', async () => {
  const r = await runApplication({ id: 'fx-gh', company: 'Fixture Co', title: 'Software Engineer Intern', url: fx('greenhouse.html'), resume: 'swe' }, { mode: 'fill', profile, outDir: out('gh') });
  assert.equal(get(r, /^First Name/), 'Alex');
  assert.equal(get(r, /Email/), 'alex@example.edu');
  assert.equal(get(r, /^Country/), 'United States +1');
  assert.match(get(r, /Location/) || '', /Austin, Texas/);
  assert.equal(get(r, /authorized/), 'Yes');
  assert.equal(get(r, /sponsorship/), 'No');
  assert.equal(get(r, /How did you hear/), 'LinkedIn');
  assert.equal(get(r, /^Gender/), 'Male');
  assert.equal(get(r, /Veteran/), 'I am not a protected veteran');
  assert.match(get(r, /Disability/) || '', /^No, I do not have a disability/);
  assert.equal(get(r, /acknowledge/i), 'checked');
  assert.ok(r.resumeAttached, 'resume attached');
  assert.ok(!r.filled.some(x => /Cover Letter/.test(x.q)), 'no cover letter upload');
  assert.deepEqual(r.blankRequired.filter(x => !/Why are you interested/.test(x)), []);
  assert.ok(r.asks.some(a => /Why are you interested/.test(a.q)), 'essay flagged');
  assert.equal(r.status, 'needs_input');
});

await check('greenhouse: submit with essay override reaches confirmation', async () => {
  const r = await runApplication({ id: 'fx-gh2', company: 'Fixture Co', title: 'Software Engineer Intern', url: fx('greenhouse.html'), resume: 'swe',
    overrides: { 'why are you interested': 'Test answer.' } }, { mode: 'submit', profile, outDir: out('gh2') });
  assert.equal(r.status, 'submitted', JSON.stringify(r.notes));
});

await check('lever: radios, location autocomplete, EEO selects', async () => {
  const r = await runApplication({ id: 'fx-lv', company: 'Fixture', title: 'Software Engineer Intern', url: fx('lever.html'), resume: 'swe' }, { mode: 'submit', profile, outDir: out('lv') });
  assert.equal(get(r, /Full name/), 'Alex Example');
  assert.equal(get(r, /Current location/), 'Austin, TX');
  assert.equal(get(r, /term/), 'Summer 2027');
  assert.equal(get(r, /onsite/), 'Yes');
  assert.equal(get(r, /sponsorship/), 'No');
  assert.equal(get(r, /^Race/), 'Asian (Not Hispanic or Latino)');
  assert.equal(get(r, /^Gender/), 'Male');
  assert.equal(get(r, /Veteran/i), 'I am not a veteran');
  assert.ok(!get(r, /Current company/), 'current company left blank');
  assert.equal(r.status, 'submitted', JSON.stringify({ notes: r.notes, blank: r.blankRequired, asks: r.asks }));
});

await check('ashby: yes/no buttons; grad-year gate is flagged, not faked', async () => {
  const r = await runApplication({ id: 'fx-ab', company: 'Fixture', title: 'Software Engineer Intern', url: fx('ashby.html'), resume: 'swe',
    overrides: { 'most impressive': 'Test answer.' } }, { mode: 'submit', profile, outDir: out('ab') });
  assert.equal(get(r, /^Name/), 'Alex Example');
  assert.equal(get(r, /sponsorship/), 'No');
  assert.equal(get(r, /in person/), 'Yes');
  assert.ok(r.asks.some(a => /graduate/i.test(a.q) && /No truthful option/.test(a.why)), JSON.stringify(r.asks));
  assert.notEqual(r.status, 'submitted');
});

console.log(failures ? `\n${failures} failing` : '\nall fixture tests passed');
process.exit(failures ? 1 : 0);

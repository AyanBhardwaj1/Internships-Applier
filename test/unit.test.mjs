// Pure-logic tests for rules, URL handling and the answer engine (fake profile only).
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT, readJSON, detectATS, applyUrl, urlKey } from '../src/util.mjs';
import { classify, isQuant, isFinance, resumeFor } from '../src/rules.mjs';
import { answerFor, pickOption } from '../src/answers.mjs';

const profile = readJSON(path.join(ROOT, 'config', 'profile.example.json'));
let n = 0; const t = (name, fn) => { fn(); n++; };

t('ATS detection + canonical apply URLs', () => {
  assert.equal(detectATS('https://job-boards.greenhouse.io/figma/jobs/123').ats, 'greenhouse');
  assert.equal(applyUrl('https://boards.greenhouse.io/figma/jobs/123?gh_jid=123'), 'https://job-boards.greenhouse.io/embed/job_app?for=figma&token=123');
  assert.equal(applyUrl('https://jobs.lever.co/acme/abc-def'), 'https://jobs.lever.co/acme/abc-def/apply');
  assert.equal(applyUrl('https://jobs.ashbyhq.com/acme/uuid-1'), 'https://jobs.ashbyhq.com/acme/uuid-1/application');
  assert.equal(urlKey('https://jobs.ashbyhq.com/acme/UUID-1/application?embed=true'), 'ashby:uuid-1');
  assert.ok(detectATS('https://visa.wd5.myworkdayjobs.com/x').signIn);
});

t('rules: quant never, finance scrape-only, sign-in skipped, Summer 2027 only', () => {
  const base = { title: 'Software Engineer Intern', terms: ['Summer 2027'], locations: ['Austin, TX'], url: 'https://jobs.lever.co/acme/1', category: 'Software' };
  assert.equal(classify({ ...base, company: 'Acme' }).lane, 'queue');
  assert.equal(classify({ ...base, company: 'Jane Street' }).lane, 'quant');
  assert.equal(classify({ ...base, company: 'Sigma Computing' }).lane, 'queue');
  assert.equal(classify({ ...base, company: 'Wells Fargo' }).lane, 'finance');
  assert.equal(classify({ ...base, company: 'Acme', url: 'https://acme.wd1.myworkdayjobs.com/x' }).lane, 'account');
  assert.equal(classify({ ...base, company: 'Acme', terms: ['Spring 2027'] }).lane, 'skip');
  assert.equal(classify({ ...base, company: 'Acme', terms: ['Spring 2027', 'Summer 2027'] }).lane, 'queue');
  assert.equal(classify({ ...base, company: 'Acme', locations: ['London, UK'] }).lane, 'skip');
  assert.equal(classify({ ...base, company: 'Acme', title: 'PhD Research Intern' }).lane, 'skip');
  assert.ok(isQuant('Hudson River Trading') && isQuant('IMC Trading') && !isQuant('Imcd Group'));
  assert.ok(isFinance('Capital One') && !isFinance('Citizen Health'));
});

t('resume variant choice', () => {
  assert.equal(resumeFor('Product Management Intern'), 'pm');
  assert.equal(resumeFor('Machine Learning Engineer Intern'), 'ml');
  assert.equal(resumeFor('Software Engineer Intern'), 'swe');
});

t('answers: facts from profile, never invented', () => {
  const A = (label, type = 'text', extra = {}) => answerFor(profile, { label, type, required: true, ...extra }, { company: 'Acme' });
  assert.equal(A('First Name*').text, 'Alex');
  assert.equal(A('Will you now or in the future require sponsorship?').choose[0], 'No');
  assert.equal(A('Are you authorized to work in the US without sponsorship?').choose[0], 'Yes');
  assert.ok(A('Why do you want to work here?', 'textarea').ask);
  assert.ok(A('Please sign by typing your full name').ask);
  assert.equal(A('Would you like to receive text messages about your application?', 'checkbox', { single: true }).check, false);
  assert.equal(A('I acknowledge the privacy notice', 'checkbox', { single: true }).check, true);
  assert.ok(A('What year are you in?').ask, 'class-year flagged for review');
});

t('pickOption prefers exact, then word-prefix', () => {
  assert.equal(pickOption(['Yes', 'No'], ['No']), 'No');
  assert.equal(pickOption(['No, I will not', 'Yes, I will'], ['No']), 'No, I will not');
  assert.equal(pickOption(['Not Hispanic or Latino', 'Hispanic or Latino'], ['No', 'Not Hispanic or Latino']), 'Not Hispanic or Latino');
  assert.equal(pickOption(['2027', '2028'], ['2029', 'May 2029']), null);
});

console.log(`unit: ${n} groups passed`);

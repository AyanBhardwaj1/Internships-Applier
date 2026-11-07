// Pure-logic tests for the outreach module (no network).
import assert from 'node:assert/strict';
import { emailGuesses, scoreCompany, gmailComposeUrl, dueFollowups, draftEmail, domainOf } from '../src/outreach.mjs';

assert.deepEqual(emailGuesses('Jane Q. Doe', 'acme.ai', 5).slice(0, 2), ['jane@acme.ai', 'jane.doe@acme.ai']);
assert.equal(emailGuesses('Jane Doe', 'acme.ai', 200)[0], 'jane.doe@acme.ai');
assert.equal(domainOf('https://www.acme.ai/about'), 'acme.ai');

const base = { status: 'Active', nonprofit: 'False', name: 'Acme Robotics', one_liner: 'Humanoid robots for warehouses', long_description: '',
  tags: ['Robotics', 'AI'], industries: ['Industrials'], regions: ['United States of America'], all_locations: 'San Francisco, CA, USA',
  team_size: '8', batch: 'Fall 2025', isHiring: 'True', top_company: 'False' };
const s = scoreCompany(base);
assert.ok(s && s.reasons.includes('robotics') && s.reasons.some(r => /F25/.test(r)));
assert.equal(scoreCompany({ ...base, status: 'Inactive' }), null);
assert.equal(scoreCompany({ ...base, name: 'Jane Street' }), null);
assert.equal(scoreCompany({ ...base, regions: ['United Kingdom'], all_locations: 'London, England, United Kingdom' }), null);
assert.equal(scoreCompany({ ...base, tags: ['Consumer'], one_liner: 'Dating app', name: 'Lovr' }), null);
assert.ok(!scoreCompany({ ...base, tags: ['Developer Tools', 'Automation', 'AI'], one_liner: 'agents', name: 'X' }).reasons.includes('robotics'));

const u = new URL(gmailComposeUrl('a@b.co', 'Hi there', 'Line 1\nLine 2'));
assert.equal(u.searchParams.get('to'), 'a@b.co');
assert.equal(u.searchParams.get('body'), 'Line 1\nLine 2');

const sent = new Date(Date.now() - 5 * 86400e3).toISOString();
const due = dueFollowups({ leads: { a: { sentAt: sent, status: 'sent', followupsSent: 0 }, b: { sentAt: sent, status: 'replied' }, c: { sentAt: sent, status: 'sent', followupsSent: 2 } } });
assert.deepEqual(due.map(d => d.n), [1]);

const d = draftEmail({ company: 'Acme', oneLiner: 'robots', reasons: ['robotics'], batch: 'Winter 2024' }, { person: { name: 'Jane Doe' } });
assert.ok(d.needsPersonalising && d.words < 140 && /Hi Jane/.test(d.body));
console.log('outreach: all tests passed');

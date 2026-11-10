// Daily brief: pure scoring/parsing tests (no network).
import assert from 'node:assert/strict';
import { parseDevpostDates, scoreItem, isHackathon, nearAustin, inUS, pickEvents, renderBrief } from '../src/brief.mjs';
import { draftEmail } from '../src/outreach.mjs';

let n = 0; const t = (name, fn) => { fn(); n++; };
const NOW = Date.parse('2026-11-10T12:00:00Z');

t('devpost date ranges', () => {
  assert.deepEqual(parseDevpostDates('Nov 09 - 18, 2026'), { start: '2026-11-09', end: '2026-11-18' });
  assert.deepEqual(parseDevpostDates('Oct 25 - Nov 30, 2026'), { start: '2026-10-25', end: '2026-11-30' });
  assert.deepEqual(parseDevpostDates('Dec 01, 2026 - Jan 15, 2027'), { start: '2026-12-01', end: '2027-01-15' });
  assert.deepEqual(parseDevpostDates('Dec 20 - Jan 05, 2027'), { start: '2026-12-20', end: '2027-01-05' });
  assert.deepEqual(parseDevpostDates(''), {});
});

t('hackathon vs event detection', () => {
  assert.ok(isHackathon('HackUTA'.replace('UTA', ' UTA')) || isHackathon('HackUTA hackathon'));
  assert.ok(isHackathon('Stripe Startups Build Day San Francisco'));
  assert.ok(isHackathon('SF Non-Slop Hackathon'));
  assert.ok(!isHackathon('Hack AI: AI Engineer Workshop'));
  assert.ok(!isHackathon('Physical AI Night'));
});

t('location helpers', () => {
  assert.ok(nearAustin('Austin, TX') && nearAustin('Arlington, Texas') && !nearAustin('San Francisco, CA'));
  assert.ok(inUS('Amherst, MA') && inUS('Princeton, New Jersey') && !inUS('Hamilton, Ontario') && !inUS('Lleida, Spain'));
});

t('scoring: Austin robotics > online generic; abroad / past / invite-only are dropped', () => {
  const base = { start: '2026-11-15T00:00:00Z', end: '2026-11-16T00:00:00Z' };
  const austin = scoreItem({ ...base, kind: 'event', source: 'luma', name: 'Physical AI Night', where: 'Austin, TX' }, NOW);
  const online = scoreItem({ ...base, kind: 'event', source: 'luma', name: 'Founders coffee', where: 'Online', online: true }, NOW);
  assert.ok(austin > online);
  assert.equal(scoreItem({ ...base, kind: 'hackathon', source: 'mlh', name: 'UofTHacks', where: 'Toronto, Ontario' }, NOW), -100);
  assert.equal(scoreItem({ ...base, kind: 'hackathon', source: 'cerebralvalley', name: 'X', where: 'Toronto', abroad: true }, NOW), -100);
  assert.ok(scoreItem({ kind: 'hackathon', source: 'devpost', name: 'Old', online: true, where: 'Online', start: '2026-10-01', end: '2026-10-05' }, NOW) < 0);
  assert.ok(scoreItem({ ...base, kind: 'hackathon', source: 'devpost', name: 'Club', online: true, where: 'Online', inviteOnly: true }, NOW) < 0);
  const tx = scoreItem({ ...base, kind: 'hackathon', source: 'mlh', name: 'HackUTA', where: 'Arlington, Texas · physical', tags: ['student hackathon'] }, NOW);
  const club = scoreItem({ ...base, kind: 'hackathon', source: 'devpost', name: 'Tiny Hacks', org: 'Some University Club', where: 'Online', online: true, regs: 20 }, NOW);
  assert.ok(tx > club);
});

t('pickEvents keeps new or strong, upcoming only, hackathons need a day left', () => {
  const items = [
    { kind: 'hackathon', name: 'ends today', score: 9, isNew: true, start: '2026-11-01', end: '2026-11-10T20:00:00Z' },
    { kind: 'hackathon', name: 'next week', score: 6, isNew: true, start: '2026-11-17', end: '2026-11-18' },
    { kind: 'hackathon', name: 'old but weak', score: 2, isNew: false, start: '2026-11-20', end: '2026-11-21' },
    { kind: 'event', name: 'event', score: 6, isNew: true, start: '2026-11-12', end: '2026-11-12T23:00:00Z' },
  ];
  assert.deepEqual(pickEvents(items, 'hackathon', { now: NOW }).map(i => i.name), ['next week']);
  assert.equal(pickEvents(items, 'event', { now: NOW }).length, 1);
});

t('renderBrief has every section', () => {
  const md = renderBrief({ date: '2026-11-10', intern: { since: '2026-11-09', newCount: 0, totalOk: 3, top: [], fallback: true, queue: { ready: 1, needsInput: 0, captcha: 0, handedToMac: 0 }, appliedSince: [] },
    programs: { curated: [], fromListings: [] }, hackathons: [], events: [], outreach: { ready: 2, sent: 0, replied: 0, due: [] } });
  for (const h of ['## Internships', '## Programs and fellowships', '## Hackathons to register for', '## Networking events', '## Outreach']) assert.ok(md.includes(h), h);
});

t('outreach draft never claims he applied; only Summer-compatible intern roles are named', () => {
  const lead = { company: 'Acme', oneLiner: 'Robots', reasons: ['robotics'], batch: 'Fall 2026' };
  const a = draftEmail({ ...lead, techInternJobs: [{ title: 'Robotics Engineer Intern' }] });
  assert.ok(/Robotics Engineer Intern opening/.test(a.body) && !/applied/.test(a.body));
  const b = draftEmail({ ...lead, techInternJobs: [{ title: 'Research Intern (Winter 2027)' }, { title: 'Mechatronics Engineer' }] });
  assert.ok(/propose one/.test(b.body));
});

console.log(`brief tests: ${n} passed`);

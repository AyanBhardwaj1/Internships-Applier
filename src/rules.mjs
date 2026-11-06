// Ayan's application rules, ported from Career-Ops modes/_custom.md + Desk decisions.
// See docs/RULES.md for the human-readable version. Keep the two in sync.
import { detectATS, NO_SIGNIN_ATS, MAYBE_NO_SIGNIN_ATS } from './util.mjs';

// Quant / HFT / prop trading: browse only, never apply (his rule since 2026-10-14).
export const QUANT_FIRMS = [
  'jane street', 'hudson river trading', 'citadel', 'citadel securities', 'two sigma', 'de shaw', 'd. e. shaw', 'd.e. shaw',
  'jump trading', 'imc', 'imc trading', 'optiver', 'susquehanna', 'sig', 'akuna', 'akuna capital', 'drw', 'five rings',
  'old mission', 'tower research', 'tower research capital', 'virtu', 'virtu financial', 'ctc', 'chicago trading company',
  'man group', 'kershner', 'kershner trading group', 'hrt', 'millennium', 'point72', 'balyasny', 'radix', 'xtx', 'xtx markets',
  'flow traders', 'belvedere', 'vatic', 'vatic investments', 'schonfeld', 'garda capital partners', 'garda', 'jump',
  'dv trading', 'memx', 'members exchange', 'the voleon group', 'voleon group', 'arrowstreet', 'cubist', 'worldquant', 'pdt partners', 'graham capital', 'de shaw & co', 'sig susquehanna',
  'peak6', 'wolverine', 'geneva trading', 'headlands', 'aquatic', 'voleon', 'renaissance', 'g-research', 'squarepoint',
  'qube', 'maven securities', 'da vinci', 'hap capital', 'valkyrie', 'eclipse trading', 'tradebot', 'jpmorgan quant',
];
// Banks / finance firms: scrape-only, needs his explicit OK before filling (his rule). Fintech product cos are fine.
export const FINANCE_FIRMS = [
  'wells fargo', 'goldman sachs', 'morgan stanley', 'jpmorgan', 'jp morgan', 'bank of america', 'citi', 'citigroup', 'barclays',
  'deutsche bank', 'ubs', 'credit suisse', 'hsbc', 'bnp paribas', 'nomura', 'mizuho', 'td securities', 'rbc', 'bmo', 'cibc',
  'scotiabank', 'blackrock', 'vanguard', 'fidelity', 'charles schwab', 'state street', 'bny', 'northern trust', 'pimco',
  'invesco', 'capital one', 'american express', 'us bank', 'u.s. bank', 'pnc', 'truist', 'regions', 'fifth third', 'keybank',
  'citizens bank', 'santander', 'ally', 'discover financial', 'synchrony', 'raymond james', 'edward jones', 'jefferies',
  'lazard', 'evercore', 'piper sandler', 'moelis', 'oliver wyman', 'blackstone', 'kkr', 'apollo', 'carlyle', 'bridgewater',
  'aqr', 'dimensional', 'gcm grosvenor', 'national life', 'national life group', 'drivewealth', 'robinhood markets', 'mfs', 'nuveen', 't. rowe', 't rowe', 'franklin templeton', 'prudential', 'metlife',
];

// Per-company application caps / holds noted in the Desk.
export const COMPANY_HOLDS = [
  { match: /databricks/i, until: '2026-11-20', why: 'Databricks considers one application per 30 days; SWE app pending' },
  { match: /coinbase/i, until: '2027-04-14', why: 'Coinbase reviews max 3 applications per 6 months (slots used/planned)' },
  { match: /skydio/i, note: 'Skydio: 1 app per role per 90 days, max 5 across roles per 60 days' },
  { match: /sierra/i, note: 'Sierra allows one new-grad/intern application' },
];

const BAD_TITLE = /\b(phd|ph\.d|doctoral|master'?s|mba|graduate (student|intern)|new grad|full[- ]time|senior|staff|principal|manager(?! intern)|director|postdoc|apprentice|part[- ]time|high school)\b/i;
const SENIOR_ONLY = /\b(rising senior|final[- ]year|senior year|graduating in (20)?(26|27))\b/i;
const EARLY_PROGRAM = /\b(freshman|first[- ]year|sophomore|explore|early (career|insight|talent)|ignite|launch|discover|step|futureforce)\b/i;
const WANT_TITLE = /(software|engineer|developer|swe|sde|backend|back-end|frontend|front-end|full[- ]?stack|platform|infrastructure|infra|cloud|devops|sre|reliability|data|machine learning|\bml\b|\bai\b|artificial intelligence|applied scientist|research engineer|computer vision|nlp|llm|agent|product manag|\bapm\b|product intern|technical product|tpm|security engineer|mobile|ios|android|forward deployed|solutions engineer|quant dev)/i;
const HARDWARE_ONLY = /\b(mechanical|electrical|hardware|asic|fpga|rf |analog|pcb|manufacturing|chemical|civil|propulsion|avionics|test technician|supply chain|process engineer|industrial)\b/i;
const NON_TECH = /\b(marketing|sales|recruit|hr |human resources|legal|accounting|finance intern|audit|tax|communications|design intern|ux research|content|operations intern|customer success|account exec)\b/i;

const US_STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC';
const US_LOC = new RegExp(`(,\\s*(${US_STATES})\\b|united states|\\busa?\\b|remote|\\bnyc\\b|\\bsf\\b|san francisco|new york|seattle|austin|boston|chicago|los angeles|bay area|silicon valley)`, 'i');
const NON_US = /(canada|toronto|vancouver|montreal|london|uk\b|united kingdom|ireland|dublin|germany|berlin|munich|france|paris|india|bangalore|bengaluru|hyderabad|singapore|japan|tokyo|china|shanghai|beijing|hong kong|taiwan|australia|sydney|israel|tel aviv|netherlands|amsterdam|poland|warsaw|spain|madrid|brazil|mexico|switzerland|zurich|sweden|korea|seoul|remote - (canada|uk|eu))/i;

export function isQuant(company, title = '', category = '') {
  const c = normFirm(company);
  if (/quant/i.test(category)) return true;
  if (/\b(quant(itative)? (trad|research|dev|strat)|trader|trading intern|market making)\b/i.test(title)) return true;
  // whole-name match, or the firm name followed by a corporate suffix ("Jump Trading LLC", "IMC Trading")
  return QUANT_FIRMS.some(q => c === q || c.startsWith(q + ' ') && /^(llc|lp|group|trading|capital|securities|financial|investments|partners|markets|co|international)\b/.test(c.slice(q.length + 1)));
}
function normFirm(s) { return String(s || '').toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim(); }
export function isFinance(company) {
  const c = normFirm(company);
  return FINANCE_FIRMS.some(f => c === f || c.startsWith(f + ' '));
}
export function usLocations(locs = []) {
  const L = (Array.isArray(locs) ? locs : [locs]).filter(Boolean);
  if (!L.length) return { us: true, list: [] };
  const us = L.filter(l => US_LOC.test(l) && !NON_US.test(l));
  return { us: us.length > 0, list: us };
}

/**
 * Decide whether a posting is eligible to be auto-queued.
 * Returns { ok, lane, reasons[] } where lane is one of:
 *   queue (fill + ask), finance (scrape-only), quant (never), account (needs sign-in: skip), skip.
 */
export function classify(job) {
  const reasons = [];
  const title = job.title || '';
  const terms = (job.terms || []).join(' ');
  const ats = detectATS(job.url);
  const loc = usLocations(job.locations);

  if (isQuant(job.company, title, job.category)) return { ok: false, lane: 'quant', reasons: ['Quant/HFT/prop firm: browse only'] };
  if (terms && !/summer 2027/i.test(terms) && !/summer 2027|2027 summer/i.test(title)) reasons.push(`Term is ${terms}, not Summer 2027`);
  if (!terms && !/2027/.test(title)) reasons.push('Term not stated (confirm Summer 2027)');
  if (/\b(fall|spring|winter|autumn)\b/i.test(title) && !/\bsummer\b/i.test(title)) reasons.push('Title names a non-summer term');
  if (/\b(2026|2025)\b/.test(title) && !/2027/.test(title)) reasons.push('Title names a past year');
  if (!loc.us) reasons.push('No US location');
  if (BAD_TITLE.test(title)) reasons.push('Title targets grad/senior/full-time');
  if (HARDWARE_ONLY.test(title) && !/software|firmware|embedded|data|ml|ai\b/i.test(title)) reasons.push('Hardware/non-software role');
  if (NON_TECH.test(title) && !/product|data|engineer|technical/i.test(title)) reasons.push('Non-technical role');
  if (!WANT_TITLE.test(title)) reasons.push('Not a SWE/AI/data/PM title');
  if (/hardware/i.test(job.category || '') && !/software|firmware|embedded/i.test(title)) reasons.push('Hardware category');

  if (ats.signIn) return { ok: false, lane: 'account', reasons: [...reasons, `${ats.ats} requires an account`] };
  const blocking = reasons.filter(r => !/Term not stated/.test(r));
  if (blocking.length) return { ok: false, lane: 'skip', reasons };
  if (isFinance(job.company)) return { ok: false, lane: 'finance', reasons: ['Bank/finance firm: scrape-only, needs your OK'] };
  if (!NO_SIGNIN_ATS.has(ats.ats)) {
    return { ok: false, lane: MAYBE_NO_SIGNIN_ATS.has(ats.ats) ? 'manual' : 'other-host', reasons: [`Host ${ats.ats}${ats.host ? ' ' + ats.host : ''} has no cloud filler yet`] };
  }
  return { ok: true, lane: 'queue', reasons };
}

/** Pick which resume variant to upload. */
export function resumeFor(title) {
  if (/product manag|\bapm\b|product intern|technical product|\btpm\b|program manag/i.test(title)) return 'pm';
  if (/machine learning|\bml\b|\bai\b|artificial intelligence|computer vision|nlp|llm|applied scien|research engineer|deep learning|agent/i.test(title)) return 'ml';
  return 'swe';
}

/** Cheap pre-screen fit score (0-5) from title/location/recency. Real fit checks read the JD. */
export function quickScore(job) {
  const t = job.title || '';
  let s = 3.0;
  if (/software engineer|swe|sde|developer|backend|full[- ]?stack|platform/i.test(t)) s += 0.5;
  if (/machine learning|\bml\b|\bai\b|applied ai|computer vision|llm|agent/i.test(t)) s += 0.5;
  if (/product manag|\bapm\b|technical product/i.test(t)) s += 0.2;
  if (/data engineer|analytics engineer|data scien/i.test(t)) s += 0.2;
  if (EARLY_PROGRAM.test(t)) s += 0.5;
  if (SENIOR_ONLY.test(t)) s -= 1.0;
  if (/security|embedded|firmware|mobile|ios|android|hardware/i.test(t)) s -= 0.3;
  if ((job.locations || []).some(l => /austin|, tx|texas|remote/i.test(l))) s += 0.3;
  const ageDays = job.datePosted ? (Date.now() / 1000 - job.datePosted) / 86400 : 60;
  if (ageDays <= 7) s += 0.3; else if (ageDays > 60) s -= 0.3;
  return Math.max(0, Math.min(5, Math.round(s * 10) / 10));
}

export function holdFor(company) {
  const t = new Date().toISOString().slice(0, 10);
  for (const h of COMPANY_HOLDS) if (h.match.test(company)) {
    if (h.until && t < h.until) return h;
    if (h.note) return h;
  }
  return null;
}

// Map an application-form question to an answer from the profile.
// Every answer is a fact from private/profile.json (resume + answers he already gave on past forms).
// Anything not covered returns { kind: 'ask' } so the item is flagged for Ayan instead of guessed.

const DECLINE = ["I don't wish to answer", 'Decline to self-identify', 'Decline To Self Identify', 'Prefer not to say', 'I prefer not to answer', 'I do not want to answer', 'Decline'];
const yes = ['Yes'];
const no = ['No'];

/**
 * Rules are checked in order; first match wins. `when` tests the normalised question text.
 * `a(profile, field, job)` returns either:
 *   { text }                  – free-text value
 *   { choose: [prefs...] }    – pick the first option matching any pref (selects/radios/comboboxes)
 *   { check: true|false }     – single checkbox
 *   { file: 'resume' }        – resume upload
 *   { skip: true }            – leave untouched (optional / not ours to answer)
 *   { ask: 'reason' }         – needs Ayan
 */
export const RULES = [
  // ---- files
  { when: /\b(resume|cv|curriculum vitae)\b/, types: ['file'], a: () => ({ file: 'resume' }) },
  { when: /cover letter|transcript|writing sample|portfolio file|work sample/, types: ['file'], a: (_, f) => f.required ? { ask: 'Required file upload (cover letter / transcript / sample)' } : { skip: true } },
  { when: /.*/, types: ['file'], a: (_, f) => f.required ? { ask: 'Required file upload' } : { skip: true } },

  // ---- identity / contact
  { when: /^(legal )?first name|^given name|^first$/, a: p => ({ text: p.name.first }) },
  { when: /^(legal )?last name|^surname|^family name|^last$/, a: p => ({ text: p.name.last }) },
  { when: /preferred (first )?name|nickname|name you go by/, a: p => ({ text: p.name.preferred }) },
  { when: /legal name.*(if different|different from)/, a: () => ({ skip: true }) },
  { when: /^(full |legal |your )?(full )?name$|^full legal name|^name\b(?!.*(company|school|reference|employer|manager))/, a: p => ({ text: p.name.full }) },
  { when: /pronoun/, a: p => ({ choose: ['He/him', 'He/Him/His', 'he/him'], text: p.name.pronouns }) },
  { when: /confirm.*email|e-?mail.*(again|confirm)|re-?enter.*email/, a: p => ({ text: p.email }) },
  { when: /e-?mail/, a: p => ({ text: p.email }) },
  { when: /country code|phone.*country|country.*phone/, a: () => ({ choose: ['United States +1', 'United States (+1)', '+1 United States', 'United States', 'US +1', '+1'] }) },
  { when: /phone|mobile|cell/, a: p => ({ text: p.phone.display }) },
  { when: /linked ?in/, a: p => ({ text: p.links.linkedin }) },
  { when: /github/, a: p => ({ text: p.links.github }) },
  { when: /twitter|x\.com|instagram|facebook|dribbble|behance|stack ?overflow|kaggle|leetcode/, a: () => ({ skip: true }) },
  { when: /portfolio|personal (web)?site|^website|website url|other (website|link)|^urls?$|blog/, a: p => ({ text: p.links.website }) },

  // ---- location / address
  { when: /street|address line|^address$|mailing address|permanent address/, a: p => ({ text: `${p.permanentAddress.line1}, ${p.permanentAddress.city}, ${p.permanentAddress.state} ${p.permanentAddress.zip}` }) },
  { when: /zip|postal/, a: p => ({ text: p.permanentAddress.zip }) },
  { when: /^state$|state of residence|^state\/province|^province/, a: () => ({ choose: ['Texas', 'TX'] }) },
  { when: /^city$/, a: p => ({ text: p.location.city }) },
  { when: /^country$|country of residence|which country.*(live|reside)|^country\b/, a: () => ({ choose: ['United States', 'United States of America', 'USA', 'US'] }) },
  { when: /willing to relocate|open to relocat|relocation/, a: () => ({ choose: ['Yes', 'Yes, I am willing to relocate'] }) },
  { when: /(able|willing|open|comfortable|available|plan).*(on-?site|in[- ]office|in[- ]person|commute|office \d|days (a|per) week)|work(ing)? (on-?site|in[- ]person|in (the|our|an) office|from (the|our) office)|hybrid|days (a|per) week/, a: () => ({ choose: ['Yes', 'Yes, I am able', 'Yes, I can'] }) },
  { when: /which (office|location)s?.*(prefer|interested)|preferred (office|location)|location preference/, a: () => ({ ask: 'Office preference' }) },
  { when: /^(current )?location\b|your location|where are you (currently )?(located|based)|city.*state|city you live/, a: p => ({ text: 'Austin, TX', choose: ['Austin, Texas, United States', 'Austin, TX', 'Austin'] , autocomplete: true }) },

  // ---- work authorization
  { when: /(authori[sz]ed|eligible|able) to work.*without.*sponsor/, a: () => ({ choose: ['Yes'], text: 'Yes' }) },
  { when: /sponsor/, a: () => ({ choose: ['No', 'No, I will not require sponsorship', 'I do not require sponsorship'], text: 'No' }) },
  { when: /(legally )?(authori[sz]ed|eligible|permitted).*(work|employment)|right to work|work authori[sz]ation/, a: () => ({ choose: ['Yes', 'Yes, I am authorized', 'U.S. Citizen', 'US Citizen'], text: 'Yes' }) },
  { when: /visa status|immigration status|citizenship status|are you a (us|u\.s\.) citizen|citizen of the united states|u\.?s\.? person|export control|itar/, a: () => ({ choose: ['U.S. Citizen', 'US Citizen', 'Citizen', 'Yes', 'I am a U.S. Citizen'], text: 'U.S. Citizen' }) },
  { when: /(active|current).*(security )?clearance/, a: () => ({ choose: no }) },
  { when: /(eligible|able|willing).*(obtain|get).*clearance/, a: () => ({ choose: ['Yes'] }) },
  { when: /(government|federal) (employ|official)|worked for the (us |u\.s\. )?government|prior government/, a: () => ({ choose: no }) },

  // ---- education
  { when: /school|university|college|institution/, not: /high school|degree|major|gpa|graduat|year|level|start|end/, a: p => ({ text: p.education.school, choose: [p.education.school, 'University of Texas at Austin', p.education.schoolShort, 'University of Texas - Austin', 'UT Austin'], autocomplete: true }) },
  { when: /degree (type|level)|^degree$|highest (level of )?(education|degree)|level of (study|education)|pursuing.*degree/, a: () => ({ choose: ["Bachelor's Degree", "Bachelor's", 'Bachelors', 'Bachelor of Science', 'BS', 'B.S.', 'Undergraduate'] }) },
  { when: /discipline|major|field of study|area of study|concentration/, a: p => ({ text: p.education.major, choose: ['Computer Science', 'Computer Science and Engineering', 'Computer Engineering'] }) },
  { when: /\bgpa\b|grade point/, a: p => ({ text: p.education.gpa, choose: ['4.0', '3.9 - 4.0', '3.8 - 4.0', '3.75 - 4.0', '3.7 - 4.0', '3.5 - 4.0', '3.5+', '4.0 or above', '>=3.7', '3.5 or above', 'Above 3.5'] }) },
  { when: /graduat.*(year)|year.*graduat|class of/, a: p => ({ text: String(p.education.graduation.year), choose: [String(p.education.graduation.year), 'Class of 2029', 'Spring 2029', 'May 2029'], gradGate: true }) },
  { when: /graduat.*(month)/, a: () => ({ choose: ['May', '05', '5'], text: 'May' }) },
  { when: /graduat|expected (completion|end)|degree completion/, a: p => ({ text: '05/15/2029', choose: ['May 2029', 'Spring 2029', '2029', '05/2029'], gradGate: true }) },
  { when: /start (date|year|month).*(school|degree|education|university)|(school|degree|education).*start/, a: p => ({ text: p.education.start.text, choose: ['2026', 'August 2026', 'Fall 2026'] }) },
  { when: /(current|what) (year|grade|class standing|academic (year|standing))|year in school|class standing|academic level/, a: () => ({ choose: ['Freshman', 'First Year', 'First-year', '1st Year', 'Sophomore'], ask: 'Class-year question: he is a first-year graduating May 2029; confirm which option fits' }) },

  // ---- availability
  { when: /(which|what) (term|season|semester|cohort|session)|internship (term|season|period)|term.*interested|interested.*term|cohort/, a: () => ({ choose: ['Summer 2027', 'Summer', 'No preference'] }) },
  { when: /(earliest )?start date|when can you start|available to start|availability/, a: p => ({ text: '05/17/2027', choose: ['May 2027', 'Summer 2027'] }) },
  { when: /end date|available until/, a: () => ({ text: '09/15/2027' }) },
  { when: /full[- ]time.*(summer|internship)|40 hours|work full[- ]time/, a: () => ({ choose: yes }) },
  { when: /(at least )?18( years)?|age of 18|over the age/, a: () => ({ choose: yes }) },
  { when: /final internship|last internship before graduat/, a: () => ({ choose: no }) },

  // ---- history / relationships
  { when: /(previously|ever|before|have you).*(work|employ|intern)(ed|ing)? (for|at|with)\b|worked (here|for us) before|former employee|current or former|(are|were) you (a |an )?(current|former)/,
    a: (p, f, job) => {
      const q = norm(f.label), co = norm(job.company || '').split(' ')[0];
      if (/(for|at) (us|our|the company|this company)|here|former employee|current or former|(current|former) (employee|intern|contractor)/.test(q) || (co && co.length > 2 && q.includes(co))) return { choose: ['No', 'I have never worked', 'No, I have not'] };
      return { ask: 'Prior-experience question that may not be about this employer' };
    } },
  { when: /(previously|ever|before).*appl/, a: () => ({ ask: 'Asks about previous applications to this company: check the tracker' }) },
  { when: /relative|family member|personal relationship|related to (anyone|an employee)/, a: () => ({ choose: no }) },
  { when: /non-?compete|non-?solicit|nda|restrictive covenant/, a: () => ({ choose: no }) },
  { when: /referr(ed|al)|employee referral|know anyone/, a: () => ({ choose: ['No'], text: '' }) },
  { when: /how did you (hear|find|learn)|where did you (hear|find|learn|see)|^source$|referral source/, a: p => ({ choose: [p.defaults.howDidYouHear, 'LinkedIn', 'Job Board', 'Online Job Board', 'Internet', 'Other'], text: p.defaults.howDidYouHear }) },
  { when: /current (company|employer)|most recent (company|employer)/, a: () => ({ skip: true }) },
  { when: /current (title|job title|role)/, a: () => ({ skip: true }) },
  { when: /years of (professional |relevant |work )?experience/, a: () => ({ text: '1', choose: ['0-1', 'Less than 1 year', '0 - 1 years', '1', '1-2', '1 year'] }) },
  { when: /languages? (do you )?speak|fluent|proficien.*language/, a: p => ({ text: p.defaults.languages, choose: ['English'] }) },

  // ---- consent
  { when: /text message|sms|whatsapp|marketing|newsletter|job alerts|future (opportunit|openings)|talent (community|network)/, a: () => ({ check: false, choose: ['No', 'No, I do not consent', 'Decline'] }) },
  { when: /i (agree|acknowledge|consent|certify|confirm|understand|have read)|privacy (policy|notice)|terms|consent|acknowledg|certif|attest|accurate|true and complete/, a: () => ({ check: true, choose: ['I Acknowledge', 'I agree', 'I Agree', 'Yes', 'Acknowledge', 'I acknowledge', 'Confirm'] }) },
  { when: /signature|sign (here|your name)|type your (full )?name/, a: () => ({ ask: 'E-signature field: he types this himself' }) },

  // ---- EEO (voluntary): values come from profile.eeo; anything unset gets a decline option
  { when: /gender identity|^gender|sex\b|^what is your gender/, a: p => ({ choose: [p.eeo.gender, p.eeo.genderIdentity, ...DECLINE].filter(Boolean) }) },
  { when: /transgender/, a: p => ({ choose: [p.eeo.transgender, ...DECLINE].filter(Boolean) }) },
  { when: /sexual orientation|lgbt/, a: p => ({ choose: [p.eeo.sexualOrientation, ...DECLINE].filter(Boolean) }) },
  { when: /hispanic|latin[oax]/, a: p => ({ choose: p.eeo.hispanic === true ? ['Yes', 'Hispanic or Latino'] : p.eeo.hispanic === false ? ['No', 'Not Hispanic or Latino', 'No, not Hispanic or Latino'] : DECLINE }) },
  { when: /\brace\b|ethnicity|ethnic background/, a: p => ({ choose: [p.eeo.raceLong, p.eeo.race, ...(p.eeo.raceAlt || []), ...DECLINE].filter(Boolean) }) },
  { when: /veteran/, a: p => ({ choose: p.eeo.veteran ? [p.eeo.veteran, 'I am not a Protected Veteran', 'Not a protected veteran', 'I am not a veteran', 'No, I am not a veteran', 'No'] : DECLINE }) },
  { when: /disabilit/, a: p => ({ choose: p.eeo.disability ? [p.eeo.disability, 'No, I do not have a disability', "No, I don't have a disability", 'No'] : DECLINE }) },
  { when: /^(date|today'?s date)$/, a: () => ({ text: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) }) },
];

export function norm(q) {
  return String(q || '').toLowerCase().replace(/[‘’]/g, "'").replace(/\(required\)|required|[*✱]/g, '')
    .replace(/\s+/g, ' ').trim();
}

/** overrides: { [normalisedQuestionSubstring]: answer } written per job during prep (essays, why-us). */
export function answerFor(profile, field, job = {}, overrides = {}) {
  const q = norm(field.label);
  for (const [k, v] of Object.entries(overrides || {})) {
    if (k && q.includes(norm(k))) return typeof v === 'string' ? { text: v, choose: [v], override: true } : { ...v, override: true };
  }
  for (const r of RULES) {
    if (r.types && !r.types.includes(field.type)) continue;
    if (!r.types && field.type === 'file') continue;
    if (!r.when.test(q)) continue;
    if (r.not && r.not.test(q)) continue;
    return r.a(profile, field, job);
  }
  if (field.type === 'checkbox' && field.single) return field.required ? { ask: 'Unrecognised required checkbox' } : { skip: true };
  if (field.type === 'textarea' || /why|tell us|describe|explain|what (excites|interests)|share|essay/.test(q)) {
    return field.required ? { ask: 'Free-text question needs a written answer', essay: true } : { skip: true, essay: true };
  }
  return field.required ? { ask: 'No rule for this required question' } : { skip: true };
}

/** Pick the best option for a list of preferences. Exact > word-boundary prefix > contains. */
export function pickOption(options, prefs) {
  if (!options?.length || !prefs?.length) return null;
  const O = options.map(o => ({ o, n: norm(typeof o === 'string' ? o : o.label) }));
  for (const p of prefs) {
    const np = norm(p);
    if (!np) continue;
    let m = O.find(x => x.n === np);
    if (m) return m.o;
    m = O.find(x => new RegExp(`^${esc(np)}\\b`).test(x.n));
    if (m) return m.o;
    if (np.length > 3) {
      m = O.find(x => x.n.includes(np));
      if (m) return m.o;
    }
  }
  return null;
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

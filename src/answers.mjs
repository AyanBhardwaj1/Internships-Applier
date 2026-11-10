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

  // ---- specific questions that broader rules below would otherwise catch
  { when: /^if (yes|so|applicable)\b|^if you (answered|selected) yes/, a: (p, f) => f.required ? { ask: 'Follow-up to a yes/no question' } : { skip: true } },
  { not: /graduation date|expected graduat|when .*graduat|graduat.*(date|year|when)|\bgpa\b/, when: /currently enrolled|enrolled (in|as) (a|an)? ?(full[- ]time )?(student|undergraduate|degree)|are you (a )?current(ly)? (a )?student/, a: () => ({ choose: ['Yes'] }) },
  { when: /returning to school|return to (school|your studies)|continuing (your )?(education|studies) after/, a: () => ({ choose: ['Yes'] }) },
  { when: /highest (level of )?education (you have )?completed|highest degree (completed|earned|obtained)/, a: () => ({ choose: ['High school or equivalency diploma', 'High School Diploma', 'High school', 'High School or equivalent'] }) },
  { when: /what city do you (currently )?live|which city do you (currently )?live|city (do you|you) (currently )?(live|reside)/, a: p => ({ text: `${p.location.city}, ${p.location.stateCode}` }) },
  { when: /how many (prior |previous |past )?(industry |tech |software |professional )?internships/, a: p => { const n = (p.experience || []).filter(e => /intern/i.test(e.title)).length; return { choose: [String(n), n >= 3 ? '3+' : `${n}`], text: String(n) }; } },
  { when: /united states citizen or national|lawfully admitted for permanent residence/, a: p => /citizen/i.test(p.workAuth?.citizenship || '') ? { choose: ['A United States citizen or national', 'U.S. citizen or national', 'U.S. Citizen'] } : { ask: 'Citizenship category' } },
  { when: /comfortable (using|with) git|version control|use git\b/, a: () => ({ choose: ['Yes'] }) },
  { when: /(salary|pay|compensation)( or hourly pay)? range (align|meet|match)|align with your (salary|pay|compensation) expectations/, a: () => ({ choose: ['Yes'] }) },
  { when: /reside in the (us|u\.s\.|united states)|live in the (us|united states) (during|for)|located in the (us|united states) (during|for)/, a: () => ({ choose: ['Yes'] }) },
  { when: /available to work full[- ]time|work full[- ]time .*(between|from|during)|40 hours per week/, a: () => ({ choose: ['Yes'] }) },
  { when: /remote internship (structure )?align|primarily remote/, a: () => ({ choose: ['Yes, a remote internship aligns with my expectations and preferences', 'Yes'] }) },
  { when: /staffing agency|independent contractor|contingent worker|engaged to perform services/, a: () => ({ choose: ['No'] }) },
  { when: /school district|local educational agency|state (education )?agency|curriculum purchasing/, a: () => ({ choose: ['No'] }) },
  { when: /(programming )?languages?.*(framework|tool|librar)|which .*(languages|frameworks|technologies|tools|libraries).*(experience|use|know|familiar|proficien)|tech(nical)? stack you/, types: ['checkbox'],
    a: p => ({ chooseAll: p.skills || [] }) },
  { when: /^candidate'?s? company$|^company$/, a: (p, f) => f.required ? { text: `Student, ${p.education.school}` } : { skip: true } },
  { when: /^degree$/, types: ['text'], a: () => ({ text: 'Bachelor of Science' }) },

  { when: /^(start|end) date (month|year)$|^(start|end) (month|year)$/, a: (p, f) => {
      const q = norm(f.label), st = /^start/.test(q), mon = /month/.test(q), e = p.education;
      const v = mon ? (st ? 'August' : 'May') : String(st ? e.start.year : e.graduation.year);
      return { text: mon ? (st ? '08' : '05') : v, choose: mon ? [v, v.slice(0, 3), st ? '08' : '05', st ? '8' : '5'] : [v], autocomplete: false };
    } },
  { when: /(when did you )?(begin|start)(ed)? (your )?(current )?degree program|degree program.*(begin|start)/, a: p => ({ text: '08/2026' }) },
  { when: /(complete|finish|graduate from) (your )?(current )?degree program|degree program.*(complete|finish)/, a: p => ({ text: '05/2029' }) },
  { when: /degree (are you )?(currently )?pursuing|pursuing.*degree|degree.*working toward|type of degree/, a: () => ({ choose: ["Bachelor’s degree", "Bachelor's degree", "Bachelor's Degree", "Bachelor's", 'Bachelors', 'Bachelor of Science', 'BS', 'Undergraduate'], text: 'Bachelor of Science' }) },
  { when: /rising (senior|junior)|final[- ]year student|graduating (in )?(december|dec) 2027|(december|dec) 2027 or may 2028/, a: () => ({ choose: ['No'] }) },
  { when: /full legal name|legal (full )?name$|^legal name/, a: p => ({ text: p.name.full }) },
  { not: /sponsor/, when: /f-?1 (status|visa)|curricular practical training|\bcpt\b|\bopt\b/, a: () => ({ choose: ['No'] }) },
  { when: /(full[- ]time|return offer).*(what year|which year|when).*(start|available)|(what year|which year) .*(start|available).*(full[- ]time|return)/, a: p => ({ text: String(p.education.graduation.year), choose: [String(p.education.graduation.year), `Summer ${p.education.graduation.year}`, `${p.education.graduation.year}`] }) },
  { when: /(available|able|commit).*(summer|internship).*(may|june|2027)|commit to (attending )?the full .*(program|internship)/, a: () => ({ choose: ['Yes'] }) },
  { when: /intern(ship)? position .*or .*co-?op|interested in (an )?(intern|internship) or (a )?co-?op/, a: () => ({ choose: ['Intern', 'Internship', 'Intern position'] }) },
  { when: /what type of position|position type|type of (role|job) (are you )?applying/, a: () => ({ text: 'Internship', choose: ['Internship', 'Intern', 'Summer Internship'] }) },
  { when: /(desired|expected) (salary|pay|compensation)|salary (requirement|expectation)|compensation expectation|pay expectation/, a: () => ({ text: 'Open to the posted range for this internship', choose: ['Open', 'Negotiable'] }) },
  { when: /(okay|ok|comfortable|happy) (spending|working|being|living)|(commit to|willing to) (living|live|relocat)|commutable distance/, a: () => ({ choose: ['Yes'] }) },
  { not: /authori|eligib|sponsor/, when: /target internship dates|internship dates|which internship (term|session|dates)/, a: () => ({ choose: ['Internship - Summer', 'Summer 2027', 'Summer'] }) },
  { when: /california residents|ccpa|privacy notice for california/, a: () => ({ check: true, choose: ['I acknowledge', 'Acknowledge', 'Yes', 'I Acknowledge', 'I agree'] }) },
  { when: /state or (canadian )?province (do you )?resid|which (u\.?s\.? )?state (do )?you (reside|live)|state of residence/, a: () => ({ text: 'Texas', choose: ['Texas', 'TX'] }) },
  { when: /^if you (answered|selected|chose)\b|^if (other|no|yes)\b|please specify (details )?(from )?(your answer )?above|if you selected other/, a: (p, f) => f.required ? { text: 'N/A' } : { skip: true } },
  { when: /(which|what) (of our )?office|office\(?s\)? .*(willing|relocate|prefer|work from)|preferred (work )?location|work location preference|location preference|locations? (are you )?(open to|applying for)|which location/, a: () => ({ choose: ['Austin', 'Texas', 'TX', 'Dallas', 'I am open to working in any office', 'Open to any office', 'Open to any location', 'Any office', 'Any location', 'No preference', 'Remote'] }) },
  { when: /(current or (most recent|previous)|most recent|previous) (employer|company)|^company name$|^employer( name)?$|most recently work/, a: p => ({ text: p.experience[0].company.replace(/\s*\(.*\)$/, '') }) },
  { when: /(current or (most recent|previous)|most recent|previous) (job )?title|^(job )?title$/, a: p => ({ text: p.experience[0].title }) },
  { when: /country (where|in which) you (currently )?(reside|live)|country of (current )?residence/, a: () => ({ choose: ['United States', 'United States of America', 'USA', 'US'], text: 'United States' }) },
  { when: /(graduat|degree)\w* .*\b(20\d\d) or later\b/, a: (p, f) => { const y = Number(norm(f.label).match(/(20\d\d) or later/)[1]); return { choose: [p.education.graduation.year >= y ? 'Yes' : 'No'] }; } },
  { when: /full[- ]time (role|position|offer|opportunit).* (in|during) (20\d\d)/, a: (p, f) => { const y = Number(norm(f.label).match(/(20\d\d)/)[1]); return { choose: [y >= p.education.graduation.year ? 'Yes' : 'No'] }; } },
  { when: /how many (prior |previous )?internship/, a: () => ({ text: '2', choose: ['2', '2-3', '1-2', 'Two'] }) },
  { when: /export (compliance|control)|u\.?s\.? person/, a: () => ({ choose: ['I am currently a "U.S. Person"', 'A United States Citizen', 'United States Citizen', 'I am a U.S. Person', 'U.S. Citizen', 'US Citizen', 'Yes'] }) },
  { when: /auditor independence|pwc|pricewaterhouse/, a: () => ({ choose: ['No - I have never been employed by PwC', 'No'] }) },
  { when: /redact|age-identifying/, a: () => ({ check: true, choose: ['I Acknowledge', 'I acknowledge', 'Acknowledge'] }) },
  { when: /winter or summer|summer or winter|summer or fall|fall or summer/, a: () => ({ choose: ['Summer', 'Summer 2027'] }) },
  { when: /reside within \d+ miles|hub (location|advertised)/, a: () => ({ choose: ['N/A - I am not in one of the hub locations but I AM able to relocate'] }) },
  { when: /previous (work )?experience in software|prior (work )?experience in software|worked as a software/, a: () => ({ choose: ['Yes'] }) },
  { when: /dates? (are you |you are )?available.*(start|finish|end)|internship availability.*(start|end)|start (date )?and end date/, a: () => ({ text: 'May 17, 2027 to September 15, 2027' }) },
  { when: /still (a )?student|currently (a )?student\??$|currently attend(ing)?\??$|i am still (enrolled|attending)/, types: ['checkbox'], a: () => ({ check: true, choose: ['Yes', 'Still Student?', 'Still student'] }) },
  { when: /physically based|office location indicated|which of the following (best )?describes your (location|relocation)|plan to relocate/, a: () => ({ choose: ['I do not currently live in the location mentioned, but would plan to relocate myself for this role.', 'I would plan to relocate', 'Willing to relocate', 'Yes'] }) },
  { when: /(complete|completing|pursuing|enrolled in) (a |an )?(master'?s|phd|graduate) (or (phd|master'?s) )?(program|degree)|(master'?s|phd) (or (phd|master'?s) )?program in/, a: () => ({ choose: ['No'] }) },
  { when: /(able|available|willing) to be in .* for the (full|entire) (duration|summer)/, a: () => ({ choose: ['Yes'] }) },
  // ---- identity / contact
  { when: /^(legal )?first name|^given name|^first$/, a: p => ({ text: p.name.first }) },
  { when: /^(legal |preferred )?last name|^surname|^family name|^last$/, a: p => ({ text: p.name.last }) },
  { when: /preferred (first )?name|chosen name|nickname|name you go by/, a: p => ({ text: p.name.preferred }) },
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
  { when: /street|address line|^address$|mailing address|permanent address|legal address|home address/, a: p => ({ text: `${p.permanentAddress.line1}, ${p.permanentAddress.city}, ${p.permanentAddress.state} ${p.permanentAddress.zip}` }) },
  { when: /zip|postal/, a: p => ({ text: p.permanentAddress.zip }) },
  { when: /^state$|state of residence|^state\/province|^province/, not: /city/, a: () => ({ choose: ['Texas', 'TX'] }) },
  { when: /^city$/, a: p => ({ text: p.location.city }) },
  { when: /^country$|country of residence|which country.*(live|reside)|^country\b/, a: () => ({ choose: ['United States', 'United States of America', 'USA', 'US'] }) },
  { when: /willing to relocate|open to relocat|relocation|able to relocate|can you relocate/, a: () => ({ choose: ['Yes', 'Yes, I am willing to relocate'] }) },
  { when: /(able|willing|open|comfortable|available|plan).*(on-?site|in[- ]office|in[- ]person|commute|office \d|days (a|per) week)|work(ing)? (on-?site|in[- ]person|in (the|our|an) office|from (the |our )?[\w ,.]*office)|hybrid|days (a|per) week/, a: () => ({ choose: ['Yes', 'Yes, I am able', 'Yes, I can'] }) },
  { when: /^(current )?location\b|your location|where are you (currently )?(located|based)|city.*state|city you live/, a: p => ({ text: 'Austin, TX', typeText: 'Austin', choose: ['Austin, Texas, United States', 'Austin, TX, USA', 'Austin, TX', 'Austin, Texas'], autocomplete: true }) },

  // ---- work authorization
  { when: /(authori[sz]ed|eligible|able) to work.*without.*sponsor/, a: () => ({ choose: ['Yes'], text: 'Yes' }) },
  { when: /sponsor/, a: () => ({ choose: ['No', 'No, I will not require sponsorship', 'I do not require sponsorship', 'None'], text: 'No' }) },
  { when: /(legally )?(authori[sz]ed|eligible|permitted).*(work|employment)|right to work|work authori[sz]ation/, a: () => ({ choose: ['Yes', 'I am authorized to work in the United States for any employer', 'Yes, I am authorized', 'U.S. Citizen', 'US Citizen'], text: 'Yes' }) },
  { when: /visa status|immigration status|citizenship status|are you a (us|u\.s\.) citizen|citizen of the united states|u\.?s\.? person|export control|itar/, a: () => ({ choose: ['U.S. Citizen', 'US Citizen', 'Citizen', 'Yes', 'I am a U.S. Citizen'], text: 'U.S. Citizen' }) },
  { when: /(active|current).*(security )?clearance/, a: () => ({ choose: no }) },
  { when: /(eligible|able|willing).*(obtain|get).*clearance/, a: () => ({ choose: ['Yes'] }) },
  { when: /(government|federal) (employ|official)|worked for the (us |u\.s\. )?government|prior government/, a: () => ({ choose: no }) },

  // ---- education
  { when: /school|university|college|institution/, not: /high school|degree|major|gpa|graduat|\byear|level|\bstart\b|\bend\b|returning|district/, a: p => ({ text: p.education.school, choose: [p.education.school, 'University of Texas at Austin', p.education.schoolShort, 'University of Texas - Austin', 'UT Austin'], autocomplete: true }) },
  { when: /degree (type|level)|^degree$|highest (level of )?(education|degree)|level of (study|education)|pursuing.*degree/, a: () => ({ choose: ["Bachelor's Degree", "Bachelor's", 'Bachelors', 'Bachelor of Science', 'BS', 'B.S.', 'Undergraduate'] }) },
  { when: /discipline|major|field of study|area of study|concentration/, a: p => ({ text: p.education.major, choose: ['Computer Science', 'Computer Science and Engineering', 'Computer Engineering'] }) },
  { when: /\bgpa\b|grade point/, a: p => ({ text: p.education.gpa, choose: ['4.0', '3.9 - 4.0', '3.8 - 4.0', '3.75 - 4.0', '3.7 - 4.0', '3.5 - 4.0', '3.5+', '4.0 or above', '>=3.7', '3.5 or above', 'Above 3.5', '3.75 - 4', '3.75 - 4.00', '3.75+', '3.75 and above', '3.9 - 4', '3.8 - 4', '3.7 - 4', '3.5 - 4', '4', '4.00'] }) },
  { when: /graduat.*(year)|year.*graduat|class of/, a: p => ({ text: String(p.education.graduation.year), choose: [String(p.education.graduation.year), 'Class of 2029', 'Spring 2029', 'May 2029'], gradGate: true }) },
  { when: /graduat.*(month)/, a: () => ({ choose: ['May', '05', '5'], text: 'May' }) },
  { when: /graduat|expected (completion|end)|degree completion/, a: p => ({ text: '05/15/2029', choose: ['May 2029', 'Spring 2029', '2029', '05/2029', '2029 or later', 'Spring 2029 or later', 'After Fall 2028', 'After Summer 2028', 'After Spring 2028', 'After 2028', 'Later than 2028'], gradGate: true }) },
  { when: /start (date|year|month).*(school|degree|education|university)|(school|degree|education).*start/, a: p => ({ text: p.education.start.text, choose: ['2026', 'August 2026', 'Fall 2026'] }) },
  { when: /(current|what) (year|grade|class standing|academic (year|standing))|year in school|class standing|academic level/, a: () => ({ choose: ['Freshman', 'First Year', 'First-year', '1st Year', 'Sophomore'], ask: 'Class-year question: he is a first-year graduating May 2029; confirm which option fits' }) },

  // ---- availability
  { when: /(which|what) (term|season|semester|cohort|session)|internship (term|season|period)|term.*interested|interested.*term|cohort/, a: () => ({ choose: ['Summer 2027', 'Summer', 'No preference'] }) },
  { when: /(earliest )?start date|when can you start|available to start|availability/, a: p => ({ text: '05/17/2027', choose: ['Yes', 'May 2027', 'Summer 2027'] }) },
  { when: /end date|available until/, a: () => ({ text: '09/15/2027' }) },
  { when: /full[- ]time.*(summer|internship)|40 hours|work full[- ]time/, a: () => ({ choose: yes }) },
  { when: /(at least )?18( years)?|age of 18|over the age/, a: () => ({ choose: yes }) },
  { when: /final internship|last internship before graduat/, a: () => ({ choose: no }) },

  // ---- history / relationships
  { when: /(previously|ever|before|have you).*(work|employ|intern)(ed|ing)? (for|at|with|by|in)\b|worked (here|for us) before|former employee|current or former|(are|were) you (a |an )?(current|former)/,
    a: (p, f, job) => {
      const q = norm(f.label), co = norm(job.company || '').split(' ')[0];
      if (/(for|at) (us|our|the company|this company)|here|former employee|current or former|(current|former) (employee|intern|contractor)/.test(q) || (co && co.length > 2 && q.includes(co))) return { choose: ['No', 'I have never worked', 'No, I have not'] };
      return { ask: 'Prior-experience question that may not be about this employer' };
    } },
  { when: /(previously|ever|before).*appl/, a: () => ({ ask: 'Asks about previous applications to this company: check the tracker' }) },
  { when: /relative|family member|personal relationship|related to (any|anyone|an employee)|related to .*employee/, a: () => ({ choose: no }) },
  { when: /non-?compete|non-?solicit|nda|restrictive covenant/, a: () => ({ choose: no }) },
  { when: /referr(ed|al)|employee referral|know anyone/, a: () => ({ choose: ['No', 'No, I was not referred', 'I was not referred', 'Not referred'], text: 'N/A' }) },
  { when: /how (did )?you (first )?(hear|find|learn|connect|come across)|how you (heard|found|learned)|where did you (hear|find|learn|see)|^source$|referral source/, a: p => ({ choose: [p.defaults.howDidYouHear, 'LinkedIn', 'Job Board', 'Online Job Board', 'Internet', 'Other'], text: p.defaults.howDidYouHear }) },
  { when: /^current (company|employer)$|^current (company|employer)\b(?!.* or )/, a: (p, f) => f.required ? { text: `Student, ${p.education.school}` } : { clear: true } },
  { when: /current (title|job title|role)/, a: () => ({ skip: true }) },
  { when: /years of (professional |relevant |work |industry )?experience|years of industry/, a: () => ({ text: '1', choose: ['0-1', 'Less than 1 year', '0 - 1 years', '1', '1-2', '1 year'] }) },
  { when: /languages? (do you )?speak|fluent|proficien.*language/, a: p => ({ text: p.defaults.languages, choose: ['English'] }) },

  { when: /which (software |engineering )?(team|area|group|track|domain)(\(s\)|s)? .*(interest|prefer)|team preference|areas? of interest/, a: () => ({ choose: ['Open to any team/No strong preference', 'Open to any team', 'No preference', 'No strong preference', 'Any', 'Full Stack', 'Full-stack', 'Backend'] }) },
  // ---- consent
  { when: /text message|sms|whatsapp|marketing|newsletter|job alerts|future (opportunit|openings)|talent (community|network)/, a: () => ({ check: false, choose: ['No', 'No, I do not consent', 'Decline'] }) },
  { when: /i (agree|acknowledge|consent|certify|confirm|understand|have read)|privacy (policy|notice)|terms|consent|acknowledg|certif|attest|accurate|true and complete/, a: () => ({ check: true, choose: ['I Acknowledge', 'I agree', 'I Agree', 'Yes', 'Acknowledge', 'I acknowledge', 'Confirm'] }) },
  { when: /signature|sign (here|your name)|type your (full )?name/, a: () => ({ ask: 'E-signature field: he types this himself' }) },

  // ---- EEO (voluntary): values come from profile.eeo; anything unset gets a decline option
  { when: /gender identity|^gender|sex\b|^what is your gender/, a: p => ({ choose: [p.eeo.gender, p.eeo.genderIdentity, ...DECLINE].filter(Boolean) }) },
  { when: /transgender/, a: p => ({ choose: [p.eeo.transgender, ...DECLINE].filter(Boolean) }) },
  { when: /sexual orientation|lgbt/, a: p => ({ choose: [p.eeo.sexualOrientation, ...DECLINE].filter(Boolean) }) },
  { when: /\brace\b|ethnicity|ethnic background/, a: p => ({ choose: [p.eeo.raceLong, p.eeo.race, ...(p.eeo.raceAlt || []), ...DECLINE].filter(Boolean) }) },
  { when: /hispanic|latin[oax]/, not: /\brace\b/, a: (p, f) => (f.options || []).some(o => /\b(asian|white|black)\b/i.test(o)) ? { choose: [p.eeo.raceLong, p.eeo.race, ...DECLINE].filter(Boolean) } : ({ choose: p.eeo.hispanic === true ? ['Yes', 'Hispanic or Latino'] : p.eeo.hispanic === false ? ['No', 'Not Hispanic or Latino', 'No, not Hispanic or Latino'] : DECLINE }) },
  { when: /veteran/, a: p => ({ choose: p.eeo.veteran ? [p.eeo.veteran, 'I am not a Protected Veteran', 'Not a protected veteran', 'I am not a veteran', 'No, I am not a veteran', 'No'] : DECLINE }) },
  { when: /disabilit/, a: p => ({ choose: p.eeo.disability ? [p.eeo.disability, 'No, I do not have a disability', "No, I don't have a disability", 'No'] : DECLINE }) },
  { when: /^(date|today'?s date)$/, a: () => ({ text: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) }) },
];

export function norm(q) {
  return String(q || '').toLowerCase().replace(/[‘’]/g, "'").replace(/\(required\)|required|[*✱]/g, '')
    .replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
}

/** overrides: { [normalisedQuestionSubstring]: answer } written per job during prep (essays, why-us). */
export function answerFor(profile, field, job = {}, overrides = {}) {
  const q = norm(field.label);
  for (const [k, v] of Object.entries(overrides || {})) {
    if (k && q.includes(norm(k))) return typeof v === 'string' ? { text: v, choose: [v], override: true } : { ...v, override: true };
  }
  const opts = (field.options || []).join(' | ');
  // SMS-consent radios often carry the phone field's label.
  if (/text messag|\bsms\b|whatsapp|mobile messages/i.test(opts + ' ' + q) && ['radio', 'select', 'checkbox', 'combobox', 'yesno'].includes(field.type)) return { check: false, choose: ['No - I do not consent to receiving text messages', 'No', 'No, I do not consent', 'Decline'] };
  // Ashby education-entry dates: "Month..."/"Year..." pickers under Start Date / End Date.
  if (/^(start|end) date/.test(q) && /^(month|year)\.\.\./i.test(field.options?.[0] || '')) {
    const start = /^start/.test(q), isMonth = /^month/i.test(field.options[0]);
    const e = profile.education;
    return { choose: [isMonth ? (start ? 'August' : 'May') : String(start ? e.start.year : e.graduation.year)] };
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
    m = O.find(x => new RegExp(`(^|[\\s/(,-])${esc(np)}($|[\\s/),-])`).test(x.n));
    if (m) return m.o;
    if (np.length > 3) {
      m = O.find(x => x.n.includes(np));
      if (m) return m.o;
    }
  }
  return null;
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

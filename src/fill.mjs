// Headless form filler for Greenhouse / Lever / Ashby / SmartRecruiters application pages.
// mode: 'inspect' – load the form, list questions + proposed answers, change nothing
//       'fill'    – fill everything it can, screenshot, never submit
//       'submit'  – fill, verify, click Submit ONLY if nothing required is blank and no CAPTCHA is showing
// Never solves or bypasses CAPTCHAs / spam checks: if one appears it stops and reports.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { applyUrl, detectATS, P, ROOT, writeJSON, nowISO } from './util.mjs';
import { answerFor, pickOption, norm } from './answers.mjs';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch {}
  for (const p of ['/usr/local/lib/node_modules/playwright', '/usr/lib/node_modules/playwright']) { try { return require(p); } catch {} }
  throw new Error('playwright not found (cloud image ships it globally; locally run `npm i -g playwright`)');
}

const CLOSED_RX = /no longer (accepting|available|open)|job (is |has been )?(closed|filled)|position (has been )?(filled|closed)|this job (posting )?(is )?(not|no longer)|page (you('| a)re looking for )?(could not be|was not|not) found|\b404\b|job not found|posting (has )?expired/i;
const DONE_RX = /thank(s| you) for (applying|your (application|interest))|application (has been |was )?(submitted|received)|we('ve| have) received your application|successfully (submitted|applied)|application complete/i;
const SPAM_RX = /flagged (as|for) (possible )?spam|suspicious activity|unusual activity|verify (that )?you are (a )?human|are you a robot|bot detected/i;

// ------------------------------------------------------------------ in-page collector
// Runs inside the page. Tags every control with data-ia="<n>" and returns descriptors.
function collectInPage() {
  const T = el => (el ? (el.innerText || el.textContent || '') : '').replace(/\s+/g, ' ').trim();
  const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && (r.width > 0 || r.height > 0); };
  const WRAP = 'fieldset, [role=radiogroup], [role=group], li.application-question, .application-question, [class*="field-entry"], [class*="FieldEntry"], .field-wrapper, .field, .form-group, .question, [data-qa*="question"], [class*="question"], .input-wrapper';
  const QSEL = 'legend, .application-label, [class*="question-title"], [class*="QuestionTitle"], [class*="label"]:not(input):not(select):not(textarea), label';
  const qText = (wrap, exclude = []) => {
    if (!wrap) return '';
    for (const el of wrap.querySelectorAll(QSEL)) {
      if (exclude.some(x => el.contains(x) || x.contains(el))) continue;
      if (el.querySelector('input[type=radio],input[type=checkbox]')) continue;
      const t = T(el); if (t && t.length < 600) return t;
    }
    return '';
  };
  const labelFor = el => {
    const grp = el.closest('[role=group][aria-labelledby]');
    if (grp) { const t = grp.getAttribute('aria-labelledby').split(/\s+/).map(i => T(document.getElementById(i))).filter(Boolean).join(' '); if (t) return t; }
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l && T(l) && !/^(attach|upload|browse|choose file|enter manually|select file)$/i.test(T(l))) return T(l); }
    const lb = el.getAttribute('aria-labelledby');
    if (lb) { const t = lb.split(/\s+/).map(i => T(document.getElementById(i))).filter(Boolean).join(' '); if (t) return t; }
    const al = el.getAttribute('aria-label'); if (al && !/^(select\.{0,3}|search|choose|toggle)/i.test(al)) return al;
    const wl = el.closest('label'); if (wl && T(wl)) return T(wl);
    let c = el.parentElement;
    for (let i = 0; i < 6 && c; i++, c = c.parentElement) { const t = qText(c, [el]); if (t) return t; }
    return el.getAttribute('placeholder') || el.name || '';
  };
  const reqOf = (el, label, wrap) => !!(el.required || el.getAttribute('aria-required') === 'true' || /\*|✱|\(required\)/.test(label) || (wrap && wrap.querySelector('.required, [class*="required"], abbr[title=required]')));
  document.querySelectorAll('[data-ia], [data-ia-opt]').forEach(e => { e.removeAttribute('data-ia'); e.removeAttribute('data-ia-opt'); });
  const out = []; let n = 0;
  const tag = el => { const id = String(n++); el.setAttribute('data-ia', id); return id; };
  const form = document.querySelector('form#application-form, form#application_form, #application-form, form[action*="apply"], form.application-form, form') || document.body;
  const scope = form === document.body ? document : form;

  // Ashby-style Yes/No button pairs (detected first so their hidden checkbox isn't double-counted)
  const yesnoWraps = new Set();
  for (const wrap of scope.querySelectorAll('[class*="field-entry"], [class*="yesno"], [class*="YesNo"]')) {
    const btns = [...wrap.querySelectorAll('button')].filter(b => /^(yes|no)$/i.test(T(b)) && !b.hasAttribute('data-ia'));
    if (btns.length === 2 && !wrap.querySelector('input[type=radio]')) {
      const label = qText(wrap, btns);
      const entry = wrap.closest('[class*="field-entry"]') || wrap;
      yesnoWraps.add(entry);
      if (out.some(o => o.type === 'yesno' && o.label === label)) continue;
      const hidden = entry.querySelector('input[type=checkbox]');
      out.push({ ia: btns.map(tag), type: 'yesno', label, required: reqOf(hidden || btns[0], label, entry), options: btns.map(T),
        value: btns.filter(b => /selected|active|checked/i.test(b.className) || b.getAttribute('aria-pressed') === 'true').map(T), visible: btns.some(visible) });
    }
  }
  // radios / checkboxes: grouped by shared name, else by their question container (Ashby gives each box its own name)
  const all = [...scope.querySelectorAll('input[type=radio], input[type=checkbox]')];
  const nameCount = {}; for (const el of all) if (el.name) nameCount[el.name] = (nameCount[el.name] || 0) + 1;
  const GROUPWRAP = 'fieldset, [role=radiogroup], [role=group], [class*="field-entry"], li.application-question, .application-question';
  const groups = new Map();
  for (const el of all) {
    const entry = el.closest('[class*="field-entry"]');
    if (entry && yesnoWraps.has(entry) && !visible(el)) continue;
    const box = el.closest(GROUPWRAP);
    const key = el.name && nameCount[el.name] > 1 ? 'n:' + el.name : (box || el.name || el.id || el);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(el);
  }
  for (const [key, els] of groups) {
    const name = els[0].name || '';
    const wrap = els[0].closest(WRAP) || els[0].parentElement?.parentElement;
    const optLabel = el => { const l = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label'); return T(l) || el.value || el.getAttribute('aria-label') || ''; };
    const type = els[0].type === 'radio' ? 'radio' : 'checkbox';
    const single = type === 'checkbox' && els.length === 1;
    const qwrap = els.length > 1 ? (els[0].closest(GROUPWRAP) || wrap) : wrap;
    let label = single ? (qText(wrap, els) || optLabel(els[0])) : (qText(qwrap, els) || name);
    if (single && optLabel(els[0]).length > label.length) label = optLabel(els[0]);
    out.push({ ia: els.map(tag), type, single, name, label, required: reqOf(els[0], label, qwrap), options: els.map(optLabel),
      value: els.filter(e => e.checked).map(optLabel), visible: els.some(e => visible(e) || visible(e.closest('label'))) });
  }
  // selects
  for (const el of scope.querySelectorAll('select')) {
    let label = labelFor(el); const wrap = el.closest(WRAP);
    const optText = T(el); if (optText && label.includes(optText)) label = label.replace(optText, '').trim();
    for (const o of el.options) { const ot = T(o); if (ot && ot.length > 2 && label.endsWith(ot)) label = label.slice(0, -ot.length).trim(); }
    label = label.replace(/\s*select\s*\.{0,3}\s*$/i, '').trim();
    out.push({ ia: [tag(el)], type: 'select', label, name: el.name, required: reqOf(el, label, wrap), disabled: !!(el.disabled || el.getAttribute('aria-disabled') === 'true'),
      options: [...el.options].map(o => T(o) || o.value).filter(t => t && !/^(select|choose|please select|--)/i.test(t)),
      value: el.selectedIndex > 0 ? [T(el.options[el.selectedIndex])] : [], visible: visible(el) || visible(el.parentElement) });
  }
  // text-like, combobox, file
  for (const el of scope.querySelectorAll('input, textarea')) {
    const t = (el.getAttribute('type') || (el.tagName === 'TEXTAREA' ? 'textarea' : 'text')).toLowerCase();
    if (['hidden', 'submit', 'button', 'radio', 'checkbox', 'image', 'reset', 'search'].includes(t)) continue;
    if (el.closest('[class*="g-recaptcha"], [class*="h-captcha"]')) continue;
    if (t !== 'file' && (el.getAttribute('aria-hidden') === 'true' || (el.tabIndex === -1 && el.closest('.select-shell, [class*="container"]') && !el.getAttribute('role')))) continue; // react-select's hidden required twin
    const label = labelFor(el); const wrap = el.closest(WRAP);
    const combo = el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') === 'list' || !!el.closest('[class*="select__control"], [class*="Select-control"]');
    const type = t === 'file' ? 'file' : combo ? 'combobox' : (el.tagName === 'TEXTAREA' ? 'textarea' : 'text');
    let value = el.value ? [el.value] : [];
    if (combo) { const sv = (el.closest('[class*="select__control"]') || el.closest('.select-shell, .select__container, [class*="select-shell"]'))?.querySelector('[class*="single-value"], [class*="singleValue"], [class*="multi-value__label"]'); if (sv) value = [T(sv)]; }
    if (type === 'file') { const w = wrap || el.parentElement; const fn = w && T(w).match(/[\w\- .()]+\.(pdf|docx?|txt)/i); if (el.files?.length) value = [el.files[0].name]; else if (fn) value = [fn[0]]; }
    out.push({ ia: [tag(el)], type, inputType: t, label, name: el.name, required: reqOf(el, label, wrap), disabled: !!(el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[aria-disabled="true"], [class*="disabled"]')), options: [], value, visible: visible(el) || type === 'file' });
  }
  return out;
}

// ------------------------------------------------------------------ actions
const sleep = ms => new Promise(r => setTimeout(r, ms));
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms / 1000}s: ${what}`)), ms))]);
const dbg = (...a) => { if (process.env.IA_DEBUG) console.error('[fill]', ...a); };
const loc = (page, ia) => page.locator(`[data-ia="${ia}"]`);

async function readOptionsOpen(page) {
  return page.evaluate(() => [...document.querySelectorAll('[role=option], [class*="select__option"], .dropdown-results li, [class*="option"][id*="option"]')].concat(document.querySelector('[role=option]') ? [] : [...document.querySelectorAll('[role=listbox] > *')])
    .filter(o => { const r = o.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map((o, i) => { o.setAttribute('data-ia-opt', String(i)); return (o.innerText || o.textContent || '').replace(/\s+/g, ' ').trim(); }));
}

async function chooseCombobox(page, f, prefs, typeText) {
  const el = loc(page, f.ia[0]);
  const tries = [typeText, ...prefs].filter(Boolean).slice(0, 4);
  for (const t of (typeText ? tries : [null, ...tries])) {
    await el.click({ timeout: 4000 }).catch(() => {});
    if (t) { await el.fill('').catch(() => {}); await el.pressSequentially(String(t).slice(0, 30), { delay: 30 }).catch(() => {}); await sleep(1800); }
    else await sleep(400);
    const opts = await readOptionsOpen(page);
    dbg('combobox', f.label.slice(0, 40), 'typed', t, 'opts', JSON.stringify(opts.slice(0, 8)));
    const pick = pickOption(opts, prefs) ?? (t && opts.length && /austin|university of texas/i.test(t) ? opts.find(o => /austin/i.test(o)) : null);
    if (pick != null) {
      const i = opts.indexOf(pick);
      await page.locator(`[data-ia-opt="${i}"]`).first().click({ timeout: 4000 }).catch(async () => { await page.keyboard.press('Enter'); });
      await sleep(250);
      return pick;
    }
    await page.keyboard.press('Escape').catch(() => {});
  }
  return null;
}

async function act(page, f, ans, resumePath) {
  const prefs = ans.choose || (ans.text ? [ans.text] : []);
  switch (f.type) {
    case 'file': {
      if (ans.file !== 'resume' || !resumePath) return null;
      await loc(page, f.ia[0]).setInputFiles(resumePath);
      await sleep(1500);
      return path.basename(resumePath);
    }
    case 'text': case 'textarea': {
      if (ans.clear) { if (f.value?.length) { await loc(page, f.ia[0]).fill(''); return '(cleared autofill)'; } return null; }
      if (ans.text == null || ans.text === '') return null;
      const el = loc(page, f.ia[0]);
      await el.fill(String(ans.text), { timeout: 5000 });
      if (ans.autocomplete) { // Lever/Ashby location-style suggestion lists
        await sleep(900);
        const opts = await readOptionsOpen(page);
        const pick = pickOption(opts, prefs) ?? opts.find(o => /austin/i.test(o));
        if (pick) await page.locator(`[data-ia-opt="${opts.indexOf(pick)}"]`).first().click().catch(() => {});
      }
      await el.evaluate(e => e.blur()).catch(() => {});
      if (/date/i.test(f.label)) await page.keyboard.press('Escape').catch(() => {}); // close date pickers
      return String(ans.text);
    }
    case 'combobox': {
      if (!prefs.length) return null;
      return chooseCombobox(page, f, prefs, ans.autocomplete ? (ans.typeText || ans.text) : null);
    }
    case 'select': {
      const pick = pickOption(f.options, prefs);
      if (pick == null) return null;
      await loc(page, f.ia[0]).selectOption({ label: pick }).catch(async () => loc(page, f.ia[0]).selectOption(pick));
      return pick;
    }
    case 'radio': case 'yesno': {
      const pick = pickOption(f.options, prefs);
      if (pick == null) return null;
      const el = loc(page, f.ia[f.options.indexOf(pick)]);
      if (f.type === 'yesno') await el.click(); else await el.check({ force: true }).catch(() => el.click({ force: true }));
      return pick;
    }
    case 'checkbox': {
      if (f.single) {
        if (ans.check === true) { await loc(page, f.ia[0]).check({ force: true }).catch(() => loc(page, f.ia[0]).click({ force: true })); return 'checked'; }
        return null;
      }
      if (ans.chooseAll) { // "select all that apply" skill lists: every option that is a real fact
        const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const picks = f.options.filter(o => ans.chooseAll.some(c => new RegExp(`(^|[^a-z0-9+#])${esc(norm(c))}($|[^a-z0-9+#])`).test(norm(o))));
        for (const o of picks) await loc(page, f.ia[f.options.indexOf(o)]).check({ force: true }).catch(() => loc(page, f.ia[f.options.indexOf(o)]).click({ force: true }));
        return picks.length ? picks.join(', ') : null;
      }
      const pick = pickOption(f.options, prefs); // multi-select (e.g. race "select all that apply"): one option only
      if (pick == null) return null;
      await loc(page, f.ia[f.options.indexOf(pick)]).check({ force: true }).catch(() => {});
      return pick;
    }
  }
  return null;
}

async function captchaState(page) {
  return page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 30 && r.height > 30 && getComputedStyle(el).visibility !== 'hidden'; };
    const frames = [...document.querySelectorAll('iframe')];
    const challenge = frames.some(f => /recaptcha\/(api2|enterprise)\/bframe|hcaptcha\.com.*(challenge|frame=challenge)|challenges\.cloudflare\.com/.test(f.src) && vis(f));
    // An invisible reCAPTCHA's anchor frame is just the badge, not a checkbox.
    const checkbox = frames.some(f => (/recaptcha\/(api2|enterprise)\/anchor/.test(f.src) && !/size=invisible/.test(f.src) || /hcaptcha\.com.*checkbox|turnstile/.test(f.src)) && vis(f));
    const invisible = frames.some(f => /recaptcha|hcaptcha/.test(f.src));
    return { challenge, checkbox, invisible };
  }).catch(() => ({ challenge: false, checkbox: false, invisible: false }));
}

/** What anti-bot protection a form loads. 'none' forms submit reliably from the cloud. */
async function captchaKind(page) {
  return page.evaluate(() => {
    const srcs = [...document.querySelectorAll('iframe, script')].map(e => e.src || '').join(' ');
    const html = document.documentElement.innerHTML;
    if (/captcha-delivery|datadome/i.test(srcs + html)) return 'datadome';
    if (/hcaptcha/i.test(srcs)) return 'hcaptcha';
    if (/challenges\.cloudflare|turnstile/i.test(srcs)) return 'turnstile';
    if (/recaptcha/i.test(srcs)) return /size=invisible|render=/.test(srcs) ? 'recaptcha-invisible' : 'recaptcha';
    return 'none';
  }).catch(() => 'unknown');
}

async function preparePage(page, ats) {
  // Cookie banners: close or decline rather than accept where possible.
  for (const rx of [/^(reject all|decline|necessary only|only necessary)$/i, /^(close|dismiss|×)$/i, /^(accept|accept all|i accept|got it|ok)$/i]) {
    const b = page.getByRole('button', { name: rx }).first();
    if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await sleep(300); break; }
  }
  if (ats === 'greenhouse' || ats === 'smartrecruiters' || ats === 'other') {
    const hasForm = await page.locator('input[type=file], #first_name, input[name*="first" i]').first().isVisible().catch(() => false);
    if (!hasForm) {
      const b = page.getByRole('button', { name: /^(apply|apply now|apply for this job|i'?m interested)$/i }).first();
      const a = page.getByRole('link', { name: /^(apply|apply now|apply for this job)$/i }).first();
      if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
      else if (await a.isVisible().catch(() => false)) await a.click().catch(() => {});
      await sleep(1500);
    }
  }
  if (ats === 'ashby') {
    const tab = page.getByRole('tab', { name: /application/i }).first();
    if (await tab.isVisible().catch(() => false)) { await tab.click().catch(() => {}); await sleep(800); }
  }
}

async function findSubmit(page) {
  const byRole = page.getByRole('button', { name: /^\s*(submit( application| your application)?|send application|apply( now)?|complete application)\s*$/i });
  if (await byRole.count().catch(() => 0)) return byRole.last();
  const css = page.locator('button[type=submit]:visible, input[type=submit]:visible, #btn-submit:visible, [class*="submit-button"]:visible');
  return css.last();
}

/**
 * item: { id, company, title, url, resume: 'swe'|'ml'|'pm', overrides: {questionSubstring: answer} }
 */
export async function runApplication(item, { mode = 'fill', profile, headless = true, outDir, timeoutMs = 45000 } = {}) {
  const { chromium } = loadPlaywright();
  const ats = detectATS(item.url).ats;
  const url = applyUrl(item.url);
  outDir = outDir || path.join(P.runsDir, `${item.id.replace(/[^\w.-]+/g, '_')}-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });
  const report = { id: item.id, company: item.company, title: item.title, url, ats, mode, startedAt: nowISO(), status: 'started',
    filled: [], blankRequired: [], asks: [], skipped: [], screenshots: [], notes: [] };

  // Resume copied under the filename recruiters saw on every past application.
  const variant = profile.resumes[item.resume || 'swe'] || profile.resumes.swe;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-'));
  const resumePath = path.join(tmpDir, variant.uploadName);
  fs.copyFileSync(path.join(ROOT, variant.file), resumePath);

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1600 }, locale: 'en-US', timezoneId: 'America/Chicago',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const shot = async name => { const f = path.join(outDir, `${name}.png`); await page.screenshot({ path: f, fullPage: true }).catch(() => {}); report.screenshots.push(f); return f; };

  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    report.httpStatus = resp?.status();
    const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 5000);
    if ((resp && resp.status() >= 400) || CLOSED_RX.test(body.slice(0, 1500))) {
      report.status = 'closed'; report.notes.push(`Posting looks closed or missing (HTTP ${resp?.status()})`); await shot('closed'); return report;
    }
    await preparePage(page, ats);
    await sleep(1500);
    report.captchaKind = await captchaKind(page);
    if (mode === 'probe') { report.status = 'probed'; return report; }
    let fields = await page.evaluate(collectInPage);
    if (!fields.some(f => f.type === 'file') && !fields.some(f => /e-?mail/i.test(f.label))) {
      report.status = 'no_form'; report.notes.push('No application form found on the page'); await shot('no-form'); return report;
    }
    // Attach the resume first: on many Ashby/Greenhouse boards it triggers "autofill from resume", which re-renders
    // the form. Then wait for that to settle and re-read the fields before filling anything else.
    let resumeDone = false, stillStudent = false;
    if (mode !== 'inspect') {
      const rf = fields.find(f => f.type === 'file' && /\b(resume|cv)\b/i.test(f.label));
      if (rf) {
        try {
          await loc(page, rf.ia[0]).setInputFiles(resumePath);
          report.filled.push({ q: rf.label, a: path.basename(resumePath) }); resumeDone = true;
          await sleep(2500);
          await page.getByText(/autofill completed|we filled in|parsing complete/i).first().waitFor({ timeout: 12000 }).catch(() => {});
          await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
          await sleep(1000);
          fields = await page.evaluate(collectInPage);
        } catch (e) { report.notes.push(`Resume upload first-pass failed: ${e.message.split('\n')[0]}`); }
      }
    }
    report.questions = fields.map(f => ({ label: f.label, type: f.type, required: f.required, options: f.options.slice(0, 25) }));

    for (const f of fields) {
      if (!f.visible && f.type !== 'file') continue;
      if (resumeDone && f.type === 'file' && /\b(resume|cv)\b/i.test(f.label)) continue;
      if (stillStudent && /^end (date|month|year)/i.test(f.label.trim())) { report.skipped.push(f.label + ' (Still Student ticked)'); continue; }
      const ans = answerFor(profile, f, item, item.overrides);
      if (ans.skip) { report.skipped.push(f.label); continue; }
      if (ans.ask && !ans.choose && !ans.text && !ans.check) { report.asks.push({ q: f.label, why: ans.ask, required: f.required, options: f.options.slice(0, 15) }); continue; }
      if (ans.gradGate && f.options.length && !pickOption(f.options, ans.choose || [])) {
        report.asks.push({ q: f.label, why: 'No truthful option for May 2029 graduation (grad-year gate)', required: f.required, options: f.options.slice(0, 15) });
        continue;
      }
      if (mode === 'inspect') { report.filled.push({ q: f.label, a: ans.text ?? (ans.choose || [])[0] ?? (ans.check ? 'check' : ans.file), planned: true }); continue; }
      if (f.value?.length && f.type !== 'file' && !ans.override && f.type !== 'checkbox') {
        // Pre-filled (e.g. resume autofill). Keep only if it matches what we would enter.
        const want = norm(ans.text ?? (ans.choose || [])[0] ?? '');
        if (want && norm(f.value[0]) === want) { report.filled.push({ q: f.label, a: f.value[0], kept: true }); continue; }
      }
      try {
        dbg('field', f.type, f.label.slice(0, 60));
        const done = await withTimeout(act(page, f, ans, resumePath), 25000, f.label.slice(0, 40));
        if (done === 'checked' && /still (a )?student|currently attend/i.test(f.label)) stillStudent = true;
        if (done != null) report.filled.push({ q: f.label, a: done });
        else if (f.required) report.asks.push({ q: f.label, why: ans.ask || 'Could not match any option', required: true, options: f.options.slice(0, 15) });
        if (ans.ask && done != null) report.notes.push(`Check "${f.label}": ${ans.ask} (entered ${done})`);
      } catch (e) {
        report.asks.push({ q: f.label, why: `Fill error: ${e.message.split('\n')[0]}`, required: f.required });
      }
    }
    if (mode === 'inspect') { report.status = 'inspected'; await shot('form'); return report; }

    // Read back, find blank required fields.
    await sleep(600);
    fields = await page.evaluate(collectInPage);
    report.blankRequired = fields.filter(f => f.required && !f.disabled && (f.visible || f.type === 'file') && !(f.value || []).length).map(f => f.label);
    // Close any open popover (date pickers etc.) so screenshots and the Submit button are unobstructed.
    await page.keyboard.press('Escape').catch(() => {});
    await page.locator('h1, h2').first().click({ timeout: 2000 }).catch(() => {});
    const resumeOk = fields.some(f => f.type === 'file' && /resume|cv/i.test(f.label) && f.value?.length) || report.filled.some(x => /\.pdf$/.test(x.a || ''));
    report.resumeAttached = resumeOk;
    await shot('filled');

    const body2 = await page.locator('body').innerText().catch(() => '');
    if (SPAM_RX.test(body2)) { report.status = 'spam_flag'; report.notes.push('Page shows a spam/human-verification warning: stopped.'); return report; }
    if (mode === 'fill') { report.status = report.blankRequired.length ? 'needs_input' : 'ready'; return report; }

    // ---- submit
    if (report.blankRequired.length) { report.status = 'needs_input'; report.notes.push('Not submitted: required fields blank'); return report; }
    if (!resumeOk) { report.status = 'needs_input'; report.notes.push('Not submitted: resume not confirmed attached'); return report; }
    const cap = await captchaState(page);
    if (cap.challenge || cap.checkbox) { report.status = 'captcha'; report.notes.push('CAPTCHA visible before submit: stopped (never solved by the bot).'); await shot('captcha'); return report; }
    const btn = await findSubmit(page);
    if (!(await btn.count())) { report.status = 'no_submit_button'; return report; }
    const before = page.url();
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    await btn.click({ timeout: 8000 });
    report.submitClickedAt = nowISO();
    let outcome = 'unknown';
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const txt = await page.locator('body').innerText().catch(() => '');
      if (DONE_RX.test(txt) || /confirmation|thank|submitted|success/i.test(page.url()) && page.url() !== before) { outcome = 'submitted'; break; }
      if (SPAM_RX.test(txt)) { outcome = 'spam_flag'; break; }
      const c = await captchaState(page);
      if (c.challenge) { outcome = 'captcha'; break; }
      const errs = await page.locator('[class*="error"]:visible, [role=alert]:visible, .field-error:visible').allInnerTexts().catch(() => []);
      const real = errs.map(s => s.trim()).filter(s => s && s.length < 200 && !/^\s*$/.test(s));
      if (i > 6 && real.length) { outcome = 'validation_error'; report.notes.push(...real.slice(0, 6)); break; }
    }
    report.status = outcome;
    await shot(outcome === 'submitted' ? 'confirmation' : 'after-submit');
    if (outcome === 'captcha') report.notes.push('CAPTCHA challenge appeared after Submit: NOT submitted. Submit from your phone/Mac using the link.');
    if (outcome === 'unknown') report.notes.push('Clicked Submit but saw no confirmation within 20s: check your email before resubmitting.');
    return report;
  } catch (e) {
    report.status = 'error'; report.notes.push(e.message.split('\n')[0]); await shot('error');
    return report;
  } finally {
    report.finishedAt = nowISO();
    writeJSON(path.join(outDir, 'report.json'), report);
    await browser.close().catch(() => {});
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

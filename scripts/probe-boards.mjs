#!/usr/bin/env node
// Bulk-probe which ATS boards load a CAPTCHA on their application form (one browser, N pages in parallel).
// Usage: node scripts/probe-boards.mjs [--ats ashby] [--limit 200] [--concurrency 4]
// Reads private/candidates.json, writes private/cache/captcha-by-board.json.
import path from 'node:path';
import { createRequire } from 'node:module';
import { P, readJSON, writeJSON, detectATS, applyUrl, today } from '../src/util.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const ats = arg('ats', 'ashby'), limit = Number(arg('limit', 200)), conc = Number(arg('concurrency', 4));
const CACHE = path.join(P.cache, 'captcha-by-board.json');
const cache = readJSON(CACHE, {});
const cands = readJSON(P.candidates, { jobs: [] }).jobs.filter(j => j.ok && j.ats === ats);
const byBoard = new Map();
for (const j of cands) { const d = detectATS(j.url); const b = `${d.ats}:${d.board}`.toLowerCase(); if (!cache[b] && !byBoard.has(b)) byBoard.set(b, j); }
const todo = [...byBoard.entries()].slice(0, limit);
console.log(`probing ${todo.length} ${ats} boards (${cands.length} candidates)`);
const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', locale: 'en-US' });
let i = 0, none = 0;
async function worker() {
  while (i < todo.length) {
    const [b, j] = todo[i++];
    const page = await ctx.newPage();
    let kind = 'unknown';
    try {
      const resp = await page.goto(applyUrl(j.url), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
      kind = await page.evaluate(() => {
        const srcs = [...document.querySelectorAll('iframe, script')].map(e => e.src || '').join(' ');
        if (/captcha-delivery|datadome/i.test(srcs)) return 'datadome';
        if (/hcaptcha/i.test(srcs)) return 'hcaptcha';
        if (/challenges\.cloudflare|turnstile/i.test(srcs)) return 'turnstile';
        if (/recaptcha/i.test(srcs)) return 'recaptcha-invisible';
        return document.querySelector('input[type=file]') ? 'none' : 'no-form';
      });
      if (resp && resp.status() >= 400) kind = 'closed-sample';
    } catch (e) { kind = 'unknown'; }
    cache[b] = { kind, at: today(), sample: j.url };
    if (kind === 'none') { none++; console.log(`NONE  ${b}  ${j.company} — ${j.title}`); }
    await page.close().catch(() => {});
    if (i % 20 === 0) writeJSON(CACHE, cache);
  }
}
await Promise.all(Array.from({ length: conc }, worker));
writeJSON(CACHE, cache);
await browser.close();
console.log(`done: ${todo.length} probed, ${none} with no CAPTCHA`);

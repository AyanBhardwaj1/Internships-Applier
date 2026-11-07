#!/usr/bin/env node
// Build the phone-friendly Outreach Desk page from private/outreach/leads.json.
// Output: private/outreach/outreach-desk.html (private; published as a private claude.ai artifact).
import fs from 'node:fs';
import path from 'node:path';
import { readJSON } from '../src/util.mjs';
import { O, gmailComposeUrl } from '../src/outreach.mjs';

const leads = Object.values(readJSON(O.leads, { leads: {} }).leads).filter(l => l.draft && l.status !== 'closed');
const order = { drafted: 0, approved: 1, sent: 2, replied: 3, meeting: 4 };
leads.sort((a, b) => (Number(!!b.draft.personalised) - Number(!!a.draft.personalised)) || ((order[a.status] ?? 9) - (order[b.status] ?? 9)) || (b.score - a.score));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const batchCode = b => { const m = String(b || '').match(/(Winter|Spring|Summer|Fall)\s+(20\d\d)/); return m ? `${m[1][0]}${m[2].slice(2)}` : (b || ''); };
const tagLabel = { robotics: 'Robotics', hardtech: 'Hard tech', ai: 'AI', devtools: 'Dev tools' };

const cards = leads.map(l => {
  const ready = !!l.draft.personalised && !/\[[^\]]+\]/.test(l.draft.body);
  const to = l.to || {};
  const person = (l.people || []).find(p => p.name === to.name) || {};
  const jobs = (l.techInternJobs || []).map(j => `<a href="${esc(j.url)}" target="_blank" rel="noopener">${esc(j.title)}</a>`).join(' · ');
  const tags = (l.reasons || []).filter(r => tagLabel[r]).map(r => `<span class="tag t-${r}">${tagLabel[r]}</span>`).join('');
  const state = l.status === 'sent' ? 'sent' : ready ? 'ready' : 'hook';
  return `<article class="card" data-state="${state}" id="${esc(l.id)}">
  <header class="c-head">
    <div class="c-id"><h2>${esc(l.company)}</h2><p class="one">${esc(l.oneLiner)}</p></div>
    <div class="c-meta"><span class="batch" title="${esc(l.batch)}">${esc(batchCode(l.batch))}</span><span class="team">${esc(l.teamSize)} ppl</span></div>
  </header>
  <div class="tags">${tags}${l.techInternJobs?.length ? '<span class="tag t-job">Intern role posted</span>' : ''}${/fall 2025/i.test(l.batch || '') ? '<span class="tag t-warm">Your F25 batch</span>' : ''}</div>
  <dl class="to">
    <div><dt>To</dt><dd>${esc(to.name || '?')}${to.title ? `, ${esc(to.title)}` : ''}</dd></div>
    <div><dt>Email</dt><dd><code class="addr">${esc(to.email || 'not found')}</code> <span class="guess">pattern guess</span>${to.alternates?.length ? `<span class="alts">If it bounces: ${to.alternates.map(a => `<code>${esc(a)}</code>`).join(' ')}</span>` : ''}</dd></div>
    ${jobs ? `<div><dt>Posted</dt><dd>${jobs}</dd></div>` : ''}
  </dl>
  <details class="mail"${ready ? ' open' : ''}>
    <summary><span class="subj">${esc(l.draft.subject)}</span><span class="wc">${esc(l.draft.words)} words</span></summary>
    <pre class="body">${esc(l.draft.body)}</pre>
  </details>
  ${ready ? '' : `<p class="needs">Needs one personal line before sending. Text: <b>write the hook for ${esc(l.company)}</b></p>`}
  <div class="actions">
    ${ready && to.email ? `<a class="btn primary" href="${esc(gmailComposeUrl(to.email, l.draft.subject, l.draft.body))}" target="_blank" rel="noopener">Open in Gmail</a>` : ''}
    <button class="btn" type="button" data-copy="${esc(l.draft.body)}">Copy email</button>
    ${person.linkedin ? `<a class="btn ghost" href="${esc(person.linkedin)}" target="_blank" rel="noopener">${esc(to.name?.split(' ')[0] || 'Founder')} on LinkedIn</a>` : ''}
    <a class="btn ghost" href="${esc(l.ycUrl)}" target="_blank" rel="noopener">YC page</a>
  </div>
  ${(l.warmPaths || []).length ? `<p class="warm">Warm path: ${l.warmPaths.map(w => w.url ? `<a href="${esc(w.url)}" target="_blank" rel="noopener">${esc(w.kind)}</a>` : esc(w.kind)).join(' · ')}</p>` : ''}
</article>`;
}).join('\n');

const counts = { ready: leads.filter(l => l.draft.personalised && !/\[[^\]]+\]/.test(l.draft.body) && l.status !== 'sent').length, hook: leads.filter(l => !l.draft.personalised).length, sent: leads.filter(l => l.status === 'sent').length };
const html = `<title>Founder Outreach Desk</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=Archivo+Narrow:wght@500;600&family=JetBrains+Mono:wght@500&display=swap">
<style>
/* Layout: one column of founder cards (phone-first); a filter bar of states; each card = who, why, the email, one-tap actions. */
:root{
  --bg:#F3F4F1; --panel:#FFFFFF; --ink:#16181D; --ink-2:#4A4F5A; --line:#DADDD6;
  --signal:#E4572E; --signal-ink:#B23A16; --signal-soft:#FBE3DA; --ok:#2F7D4F; --ok-soft:#DDF0E3; --warm:#6A4FB3; --warm-soft:#ECE6FA;
  --f-display:"Archivo",system-ui,sans-serif; --f-label:"Archivo Narrow","Arial Narrow",system-ui,sans-serif; --f-mono:"JetBrains Mono",ui-monospace,Menlo,monospace;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#121418;--panel:#1B1E24;--ink:#ECEDEF;--ink-2:#A6ABB5;--line:#2C3038;--signal:#FF7A50;--signal-ink:#FFA889;--signal-soft:#3A2119;--ok:#5CC487;--ok-soft:#173326;--warm:#B39CFF;--warm-soft:#2A2340;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#121418;--panel:#1B1E24;--ink:#ECEDEF;--ink-2:#A6ABB5;--line:#2C3038;--signal:#FF7A50;--signal-ink:#FFA889;--signal-soft:#3A2119;--ok:#5CC487;--ok-soft:#173326;--warm:#B39CFF;--warm-soft:#2A2340;color-scheme:dark}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font:400 15px/1.5 var(--f-display);padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:24px 48px}
.wrap{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:18px}
h1{font:800 clamp(28px,6vw,40px)/1.05 var(--f-display);letter-spacing:-.02em;margin:0;text-wrap:balance}
.lede{margin:6px 0 0;color:var(--ink-2);max-width:60ch}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:0;padding:0;list-style:none;counter-reset:s}
.steps li{counter-increment:s;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13.5px;color:var(--ink-2)}
.steps li::before{content:counter(s);font:600 12px var(--f-mono);color:var(--signal-ink);margin-right:8px}
.filters{display:flex;flex-wrap:wrap;gap:8px}
.filters button{font:600 13px var(--f-label);letter-spacing:.04em;text-transform:uppercase;border:1px solid var(--line);background:var(--panel);color:var(--ink-2);border-radius:999px;padding:7px 14px;cursor:pointer}
.filters button[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.filters .n{font-family:var(--f-mono);margin-left:6px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px;min-width:0}
.card[data-state="ready"]{border-left:4px solid var(--signal)}
.card[data-state="sent"]{opacity:.75}
.c-head{display:flex;gap:12px;justify-content:space-between;align-items:flex-start}
.c-id{min-width:0}
h2{margin:0;font:800 21px/1.15 var(--f-display);letter-spacing:-.01em}
.one{margin:2px 0 0;color:var(--ink-2);font-size:14px}
.c-meta{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none}
.batch{font:500 13px var(--f-mono);background:var(--signal-soft);color:var(--signal-ink);border-radius:6px;padding:2px 8px}
.team{font:600 12px var(--f-label);color:var(--ink-2);text-transform:uppercase;letter-spacing:.05em;font-variant-numeric:tabular-nums}
.tags{display:flex;flex-wrap:wrap;gap:6px}
.tag{font:600 11.5px var(--f-label);letter-spacing:.05em;text-transform:uppercase;padding:2px 8px;border-radius:5px;background:var(--bg);color:var(--ink-2);border:1px solid var(--line)}
.t-robotics{color:var(--signal-ink);border-color:var(--signal)}
.t-job{background:var(--ok-soft);color:var(--ok);border-color:transparent}
.t-warm{background:var(--warm-soft);color:var(--warm);border-color:transparent}
.to{margin:0;display:grid;gap:6px}
.to div{display:grid;grid-template-columns:64px 1fr;gap:8px}
.to dt{font:600 12px var(--f-label);text-transform:uppercase;letter-spacing:.06em;color:var(--ink-2);padding-top:2px}
.to dd{margin:0;min-width:0;overflow-wrap:anywhere}
code{font:500 13px var(--f-mono);user-select:all}
.guess{font:600 11px var(--f-label);color:var(--ink-2);text-transform:uppercase;letter-spacing:.05em}
.alts{display:block;font-size:13px;color:var(--ink-2);margin-top:2px}
.alts code{font-size:12px;margin-right:6px}
.mail{border:1px solid var(--line);border-radius:10px;background:var(--bg)}
.mail summary{cursor:pointer;display:flex;justify-content:space-between;gap:10px;padding:10px 12px;font-weight:600}
.wc{font:500 12px var(--f-mono);color:var(--ink-2);flex:none}
.body{margin:0;padding:0 12px 12px;white-space:pre-wrap;overflow-wrap:anywhere;font:400 14.5px/1.55 var(--f-display);color:var(--ink)}
.needs{margin:0;font-size:13.5px;color:var(--signal-ink);background:var(--signal-soft);border-radius:8px;padding:8px 10px}
.actions{display:flex;flex-wrap:wrap;gap:8px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:8px 14px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--ink);font:600 14px var(--f-display);text-decoration:none;cursor:pointer}
.btn.primary{background:var(--signal);border-color:var(--signal);color:#fff}
.btn.ghost{background:transparent}
.btn:focus-visible,.filters button:focus-visible,summary:focus-visible{outline:3px solid var(--warm);outline-offset:2px}
.warm{margin:0;font-size:13px;color:var(--ink-2)}
.warm a{color:var(--warm)}
a{color:var(--signal-ink)}
.toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:8px 14px;border-radius:999px;font-weight:600;font-size:14px}
</style>
<div class="wrap">
  <header>
    <h1>Founder Outreach Desk</h1>
    <p class="lede">Personal cold emails to startup founders for Summer 2027, robotics first. Addresses are pattern guesses; if one bounces, try the next.</p>
  </header>
  <ol class="steps">
    <li>Tap <b>Open in Gmail</b></li><li>Attach your resume PDF</li><li>Read it once, then send</li><li>Text Claude <b>sent &lt;company&gt;</b> to start follow-ups</li>
  </ol>
  <div class="filters" role="group" aria-label="Show">
    <button type="button" data-f="ready" aria-pressed="true">Ready to send<span class="n">${counts.ready}</span></button>
    <button type="button" data-f="hook" aria-pressed="false">Needs a hook<span class="n">${counts.hook}</span></button>
    <button type="button" data-f="sent" aria-pressed="false">Sent<span class="n">${counts.sent}</span></button>
    <button type="button" data-f="all" aria-pressed="false">All</button>
  </div>
  <main id="list" style="display:flex;flex-direction:column;gap:14px">
${cards}
  </main>
</div>
<div class="toast" id="toast" hidden>Copied</div>
<script>
const btns=[...document.querySelectorAll('.filters button')], cards=[...document.querySelectorAll('.card')];
function show(f){btns.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.f===f)));cards.forEach(c=>c.hidden=!(f==='all'||c.dataset.state===f));try{localStorage.setItem('od-filter',f)}catch(e){}}
btns.forEach(b=>b.addEventListener('click',()=>show(b.dataset.f)));
let start='ready';try{start=localStorage.getItem('od-filter')||'ready'}catch(e){}
show(start);
const toast=document.getElementById('toast');
document.addEventListener('click',e=>{const b=e.target.closest('[data-copy]');if(!b)return;
  const t=b.dataset.copy;const done=()=>{toast.hidden=false;setTimeout(()=>toast.hidden=true,1400)};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done).catch(()=>sel(b))}else sel(b);
  function sel(btn){const pre=btn.closest('.card').querySelector('.body');const r=document.createRange();r.selectNodeContents(pre);const s=getSelection();s.removeAllRanges();s.addRange(r);btn.closest('.card').querySelector('.mail').open=true;}
});
</script>
`;
const out = path.join(O.dir, 'outreach-desk.html');
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${leads.length} leads: ${counts.ready} ready, ${counts.hook} need a hook)`);

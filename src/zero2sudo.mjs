// zero2sudo sources: the creator posts internship drops on Instagram stories first.
// Instagram stories need a logged-in account, so we never scrape them. What we can read:
//   1. zero2sudo's public Notion page ("IMPORTANT 2026 JOB LINKS AND EVENTS" table), via Notion's public page API.
//   2. The Direct Consideration newsletter's public sitemap (issues track zero2sudo's drops). The issue pages
//      themselves block automated readers, so we only list new issues with their links; we don't get around that.
//   3. Links or screenshots Ayan forwards from the stories: `./apply add <url..> --from zero2sudo`.
import { detectATS } from './util.mjs';

export const Z2S = {
  notionHost: 'https://zero2sudo.notion.site',
  pageId: '4b5bf549-2a86-418c-8dc7-01bad692df99',
  pageUrl: 'https://zero2sudo.notion.site/SWE-Intern-Learning-Journal-by-zero2sudo-4b5bf5492a86418c8dc701bad692df99',
  sitemap: 'https://directconsideration.com/sitemap.xml',
  instagram: 'https://instagram.com/zero2sudo',
};
const V = x => x?.value?.value || x?.value;
const rich = a => (a || []).map(s => s[0]).join('').trim();
const linkOf = a => { for (const s of a || []) for (const f of s[1] || []) if (f[0] === 'a') return f[1]; const m = rich(a).match(/https?:\/\/\S+/); return m ? m[0] : null; };

async function loadBlocks() {
  const all = {};
  let cursor = { stack: [] };
  for (let chunk = 0; chunk < 30; chunk++) {
    const r = await fetch(`${Z2S.notionHost}/api/v3/loadPageChunk`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ pageId: Z2S.pageId, limit: 100, cursor, chunkNumber: chunk, verticalColumns: false }),
    });
    if (!r.ok) throw new Error(`Notion HTTP ${r.status}`);
    const j = await r.json();
    Object.assign(all, j.recordMap?.block || {});
    if (!j.cursor?.stack?.length) break;
    cursor = j.cursor;
  }
  return all;
}

/** Parse a Notion "Item | Link | Quick notes" table row into a posting/event. */
export function parseRow(cells, edited) {
  const [itemA, linkA, notesA] = cells;
  const item = rich(itemA), url = linkOf(linkA) || linkOf(itemA), notes = rich(notesA);
  if (!item || /^item$/i.test(item)) return null; // header row
  const [company, ...rest] = item.split(/\s+[—–-]\s+/);
  const title = rest.join(' — ') || item;
  const label = rich(linkA);
  const kind = /job posting|apply/i.test(label) || /intern|engineer|apprentice|analyst|developer/i.test(title) && !/event|summit|day\b|hackathon|contest|webinar/i.test(title) ? 'job'
    : /hackathon|contest|challenge/i.test(item) ? 'hackathon' : 'event';
  return { source: 'zero2sudo', company: company.trim(), title: title.trim(), url, notes, kind, edited };
}

/** Rows from the "JOB LINKS AND EVENTS" table(s); archived tables are skipped. */
export async function fromNotion() {
  const all = await loadBlocks();
  const root = V(all[Z2S.pageId]);
  const out = [];
  let section = '';
  for (const id of root?.content || []) {
    const b = V(all[id]); if (!b) continue;
    if (/header/.test(b.type)) section = rich(b.properties?.title);
    if (b.type !== 'table' || !/job|link|event/i.test(section) || /archiv/i.test(section)) continue;
    const order = b.format?.table_block_column_order || [];
    for (const rid of b.content || []) {
      const r = V(all[rid]); if (!r) continue;
      const row = parseRow(order.map(c => r.properties?.[c]), new Date(r.last_edited_time || b.last_edited_time).toISOString());
      if (row) out.push(row);
    }
  }
  return out;
}

/** Notion rows → scan jobs (only links to ATS forms or company job pages). */
export function notionToJobs(rows) {
  return rows.filter(r => r.kind === 'job' && r.url).map(r => {
    const term = (`${r.title} ${r.notes}`.match(/\b(summer|fall|winter|spring)\s+(20\d\d)\b/gi) || []).map(s => s.replace(/\b\w/g, c => c.toUpperCase()));
    return {
      source: 'zero2sudo', company: r.company, title: r.title, url: r.url.replace(/[?&](gh_src|fbclid)=[^&]*/g, ''), locations: (r.notes.match(/(?:[A-Z][a-z]+ ?)+, [A-Z]{2}\b|Remote/g) || ['United States']), // he posts US roles
      terms: term, category: '', datePosted: Date.parse(r.edited) / 1000, note: r.notes,
    };
  });
}

/** Newest Direct Consideration issues from the public sitemap. */
export async function newsletterIssues({ limit = 10 } = {}) {
  const r = await fetch(Z2S.sitemap, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`sitemap HTTP ${r.status}`);
  const xml = await r.text();
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)]
    .map(m => ({ url: (m[1].match(/<loc>([^<]+)/) || [])[1], date: (m[1].match(/<lastmod>([^<]+)/) || [])[1] }))
    .filter(x => x.url && /\/p\//.test(x.url))
    .map(x => ({ ...x, title: x.url.split('/p/')[1].replace(/-[0-9a-f]{16}$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, limit);
}

/** Look up a forwarded posting link on the ATS's public API so it can go through the normal rules. */
export async function resolvePosting(url) {
  const d = detectATS(url);
  const get = async u => { const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
  try {
    if (d.ats === 'greenhouse' && d.board && d.jobId) {
      const j = await get(`https://boards-api.greenhouse.io/v1/boards/${d.board}/jobs/${d.jobId}`);
      return { company: j.company_name || d.board, title: j.title, locations: [j.location?.name].filter(Boolean), url, ats: 'greenhouse' };
    }
    if (d.ats === 'lever' && d.board && d.jobId) {
      const j = await get(`https://api.lever.co/v0/postings/${d.board}/${d.jobId}`);
      return { company: d.board, title: j.text, locations: [j.categories?.location, ...(j.categories?.allLocations || [])].filter(Boolean), url, ats: 'lever' };
    }
    if (d.ats === 'ashby' && d.board && d.jobId) {
      const b = await get(`https://api.ashbyhq.com/posting-api/job-board/${d.board}`);
      const j = (b.jobs || []).find(x => x.id === d.jobId || (x.jobUrl || '').includes(d.jobId));
      if (j) return { company: d.board, title: j.title, locations: [j.location, ...(j.secondaryLocations || []).map(s => s.location)].filter(Boolean), url, ats: 'ashby' };
    }
  } catch (e) { return { url, ats: d.ats, error: e.message }; }
  return { url, ats: d.ats, signIn: !!d.signIn };
}

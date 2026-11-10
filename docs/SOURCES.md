# Where postings come from

| Source | What | How often | Notes |
|---|---|---|---|
| SimplifyJobs Summer 2027 list | Most US internship postings | every scan | `src/scan.mjs` |
| Company job boards (Greenhouse / Lever / Ashby) | Direct postings for companies in `config/boards.json` | `scan --boards` | |
| **zero2sudo Notion** | "IMPORTANT 2026 JOB LINKS AND EVENTS" table on his public Notion page | every scan and brief | Read through Notion's public page API. Job rows go through the normal rules; events show in the brief. The table was last edited 2026-02-06, so it may stay quiet. |
| **Direct Consideration newsletter** | Near-daily roundup that tracks zero2sudo's story drops | every brief | Its pages block automated readers, so the cloud only lists new issues from the public sitemap. Ayan opens them, or the Mac reads one in his normal browser when he asks. |
| **zero2sudo Instagram stories** | Where he posts drops first | — | Stories need a logged-in Instagram account, and scraping them breaks Meta's terms, so Claude never scrapes them. Ayan forwards links or screenshots instead (below). |
| Links Ayan forwards | Anything from stories, friends, group chats | when sent | `./apply add <url..> --from zero2sudo` |
| Hackathons and events | Devpost, MLH, Cerebral Valley, Luma | every brief | docs/BRIEF.md |

## Forwarding zero2sudo drops
1. Turn on story notifications for @zero2sudo in Instagram (profile → bell → Stories).
2. When a drop appears, send the link to either Claude chat: `z2s <link>` (several links are fine). A screenshot also
   works: Claude reads the company and role, finds the official posting, and adds that.
3. Claude runs `./apply add <url..> --from zero2sudo`. Each link goes through docs/RULES.md: quant firms are dropped,
   sign-in sites (Workday, Eightfold, etc.) go to the Mac list, and the rest are queued and filled. "How did you hear
   about us" is answered "Instagram (@zero2sudo)" for these.
4. Every forwarded link is logged in `private/inbox.json` and shows in the next brief.

zero2sudo often posts events and "direct consideration" links at quant firms (HRT, IMC, D.E. Shaw). Those stay excluded.

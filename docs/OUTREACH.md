# Startup outreach

Cold email and referral outreach to startups for Summer 2027 internships and co-ops, alongside the
application pipeline. The research behind this playbook (with sources) is summarised at the end.

## Workflow
```
discover  →  people  →  draft  →  Ayan personalises/approves  →  Ayan sends  →  follow-ups (+4, +11 days)  →  reply / meeting
```
| Step | Command | What happens |
|---|---|---|
| Discover | `./apply outreach discover --top 150 [--focus robotics\|hardtech\|ai\|devtools]` | Scores every active, US-based YC company (yc-oss directory, ~6,400 companies) for fit: robotics, humanoids, drones and autonomy first, then hard tech, AI and dev tools. Small teams, recent batches, hiring, Austin and YC F25 (his Moss and Koyal batch) all rank higher. Quant firms and banks are excluded. |
| People | `./apply outreach people --top 30` | Pulls each company's founders and open jobs from its YC page, at about 1 request per second. Email addresses are pattern guesses (`first@domain` for small teams), checked only for an MX record. Also builds warm-path LinkedIn searches for Ayan to open by hand. |
| Draft | `./apply outreach draft --top 30` | Creates a first draft of under 120 words with a placeholder hook. Claude replaces the hook with one specific line about the company and a concrete Summer 2027 project. A draft can't be approved while any placeholder remains. |
| Review | `./apply outreach show <id>` | Shows the full email, the recipient, alternate addresses, intern jobs, warm paths, and a Gmail compose link. |
| Approve | `./apply outreach approve <id>` | Records Ayan's approval of the final text. |
| Send | Ayan, from Gmail | He taps the compose link, attaches his resume, and sends. Then `./apply outreach sent <id>`. |
| Follow up | `./apply outreach followups` | Lists follow-ups that are due, with compose links. There are at most 2: day 4 adds something new, day 11 is a polite close. |
| Outcome | `outreach replied\|meeting\|closed <id>` · `outreach meet <id> <ISO time>` | Records the outcome. `meet` also gives a Google Calendar link for the call. |

Data lives in `private/outreach/leads.json`, which is gitignored like the rest of `private/`.

## Rules (Ayan's)
- **He approves every email**, and nothing is sent automatically. If a Gmail connector is attached later, Claude only
  creates **drafts** in Gmail; Ayan presses send.
- **Truthful, specific, short.** Every claim comes from his resume. No robotics experience is claimed that he
  doesn't have. Each email references the company's actual product and proposes something concrete.
- **Volume:** at most about 20 new emails a day, sent individually, in plain text, with no tracking pixels or
  link shorteners. Send Tuesday to Thursday, in the recipient's morning.
- **Stop immediately** when someone says no or asks not to be contacted (`outreach closed <id>`).
- **No LinkedIn automation or scraping** (it breaks LinkedIn's terms). The LinkedIn links are for Ayan to open
  himself. No SMTP mailbox probing and no paid enrichment tools.
- **Skip** quant/HFT firms, banks, weapons work and non-US companies, same as for applications.

## Referrals and warm paths
- **YC F25 batch** (Moss, Koyal AI): ask Moss's founder or Koyal's founders for intros, or mention the shared batch.
  This is his strongest warm channel.
- **UT Austin alumni** at the company (LinkedIn search link in `outreach show`). Use the referral template:
  name the role, make "no" easy, and include a 2–3 sentence blurb they can forward.
- **Austin robotics:** Apptronik, Diligent Robotics. Also Longhorn Startup Lab, and Neo Scholars for students.

## Playbook (research summary)
- **Who to email:** founders, or the CTO for engineering at teams under about 50 people. Founders replied about 7×
  more often than HR in one 100-email student test (Whali).
- **Length:** under 100–150 words. One line showing you know the product, one or two lines of proof with links,
  and one easy ask, such as a 15-minute call. Michael Seibel (YC): write less, and make a small ask.
- **No posted role:** propose a specific 10–12 week Summer 2027 project with an outcome, and offer a paid trial
  task first.
- **Follow-ups:** 2–3 short bumps at about 3–4 days and then about 7 days apart, each adding something new.
  This roughly doubles the reply rate. Then stop.
- **Expect** replies in the low single digits up to about 15% for well-targeted email, so combine volume with
  quality.
- **CAN-SPAM:** a one-to-one job inquiry is likely not commercial email, but keep an honest From name and
  subject, and honor any opt-out right away.

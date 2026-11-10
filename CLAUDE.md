# Internships Applier: notes for Claude

This repo is Ayan Bhardwaj's cloud base for applying to Summer 2027 internships, driven from his phone.
Read `docs/RULES.md` before filling or submitting anything. Those rules are his, and they're strict.

## Session start checklist
1. `./apply doctor`. If `private/` files are missing, restore them (docs/SETUP.md §3):
   - Resumes: `Artifact read` on https://claude.ai/artifact/KwnbmT3ePXuvwZUNvadg9p with
     `paths: ["resumes/Ayan_Bhardwaj -- Resume.pdf", "resumes/bank/short-resume-ml-ai-engineering-may-2029.pdf", "resumes/bank/short-resume-product-management-may-2029.pdf"]`,
     then copy them to `private/resumes/{swe,ml,pm}.pdf`.
   - `profile.json` and `tracker.json`: run `ArtifactData list` on the Desk (collection `applications`, `out_dir` set to a scratch dir),
     then `node scripts/rebuild-private.mjs <scratch-dir>`.
2. If ATS hosts show BLOCKED, tell Ayan once (docs/SETUP.md §1) and keep working on what doesn't need them.

## Hard rules (summary; full list in docs/RULES.md)
- Never submit without Ayan naming the application (or approving it on the Desk, then saying "submit the approved ones").
- Never solve or bypass a CAPTCHA, spam check or verification step. Stop and give him the link.
- Never invent experience or choose a false graduation year. He graduates May 2029.
- No quant/HFT/prop firms. Banks are scrape-only. No sites that need an account.
- Personal data stays in `private/` (gitignored, because the repo is public). Never commit it.

## "Submit the approved ones" (Desk flow)
Ayan can tap Approve on Desk cards (https://claude.ai/artifact/KwnbmT3ePXuvwZUNvadg9p). When he says
"submit the approved ones":
1. Run `ArtifactData query` on collection `applications` with `where: [["decision","==","approved"]]`.
2. Skip cards whose stage is already applied, interview or offer. Map each remaining card to its queue item
   (`cloudSlug` for cloud cards, `<docId>-desk` for older Desk cards).
3. Run `./apply approve <slugs>` then `./apply submit --approved`.
4. For each submitted card, update it to `stage: "applied"`, `appliedAt`, `submittedBy: "claude-cloud"`, pinned with `if_version`.
   Report anything that stopped (CAPTCHA, blank required field, grad gate) with its link.

## Outreach (docs/OUTREACH.md)
`./apply outreach discover | people | draft | show | approve | sent | followups | replied | meeting | closed | meet`.
Before Ayan approves a draft, replace its `[hook]` with one specific line about the company and a concrete Summer 2027
project, using only facts from `private/cv.txt`. Never send email yourself. A Gmail connector, if attached, may only create drafts.

## Daily brief (docs/BRIEF.md)
When Ayan says "brief", "daily brief" or "what's new", run `./apply brief` and reply with a phone-length summary:
the top internships, programs due soon, hackathons to register for, and networking events, each with its link.
Never register him for anything.

## zero2sudo drops (docs/SOURCES.md)
When Ayan sends `z2s <link..>` (or a screenshot of a zero2sudo story), run `./apply add <url..> --from zero2sudo`. For a
screenshot, read the company and role, find the official posting link, then add it. Never scrape Instagram.
The scan reads zero2sudo's public Notion job table; the brief lists new Direct Consideration newsletter issues.

## Batches and relaying (standing instructions, 2026-11-10)
- At most **7 applications at a time** (cloud `auto` caps at 7; the Mac opens at most 7 tabs at once).
- After finishing any feature or workflow change here, relay it to the Mac session ("Internships Applier Automated")
  with his prompt word for word, what was built, the commands and the rules (docs/RULES.md, "Relay to the Mac session").

## Commands
`./apply doctor | scan | pick --top N | queue | show <slug> | inspect <slug> | fill <slug|--all> |
answer <slug> "<question>" "<answer>" | approve <slug> | submit <slug..>|--approved | skip | status | track | brief | add | auto | outreach`

Essays: run `./apply inspect <slug>` (or look at `asks` after `fill`), write 2–3 sentences grounded in
`private/cv.txt` and the JD, save them with `./apply answer`, then `./apply fill <slug>` again.

## Tests
`npm test` runs the unit tests plus fixture tests on local HTML shaped like Greenhouse, Lever and Ashby forms, using
the fake profile in `config/profile.example.json`.

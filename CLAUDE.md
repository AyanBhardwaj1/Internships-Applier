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

## Commands
`./apply doctor | scan | pick --top N | queue | show <slug> | inspect <slug> | fill <slug|--all> |
answer <slug> "<question>" "<answer>" | approve <slug> | submit <slug..>|--approved | skip | status | track`

Essays: run `./apply inspect <slug>` (or look at `asks` after `fill`), write 2–3 sentences grounded in
`private/cv.txt` and the JD, save them with `./apply answer`, then `./apply fill <slug>` again.

## Tests
`npm test` runs the unit tests plus fixture tests on local HTML shaped like Greenhouse, Lever and Ashby forms, using
the fake profile in `config/profile.example.json`.

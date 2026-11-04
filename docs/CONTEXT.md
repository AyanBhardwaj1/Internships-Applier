# Context ported from the Mac setup

This repo is the cloud home of Ayan's internship-application automation. It was started on 2026-11-04 by porting
the earlier "Internships Applier Automated" Claude Code session. That session ran on his Mac in a
[career-ops](https://github.com/career-ops-hq/career-ops) checkout and filled forms in his real Chrome through the
Claude in Chrome extension.

Personal details (contact info, EEO answers, the per-company tracker) live in the gitignored `private/` folder,
because this repository is public.

## How the Mac setup worked (Sept – Nov 2026)
- **Sources:** career-ops portal scans, an hourly "Radar" scrape (≈2,900 postings by 2026-10-19), his Simplify
  tracker, and one-off sources such as the @zero2sudo Instagram stories.
- **Evaluation:** each posting got a JD archive and a scored report (0–5) covering fit, gaps, legitimacy,
  term, grad-year gate and pay. Batch workers wrote tracker rows that merged into `data/applications.md`.
- **Summer '27 Internship Desk:** a private claude.ai artifact (https://claude.ai/artifact/KwnbmT3ePXuvwZUNvadg9p).
  It's a board of cards with stages (ready, approval, applied, grad2028, not recommended, don't apply,
  ineligible), the answers that were filled on each form, blank required fields, and Approve buttons.
  It also holds the resume bank.
- **Filling:** subagents filled forms in new Chrome tabs and read every field back with JavaScript. They left forms
  unsubmitted for Ayan, or submitted them when he named them by text (from 2026-11-03).
- **Stats at port time:** 232 tracker rows, about 125 applications submitted, several OAs and interviews in progress,
  17 filled-but-unsubmitted Desk cards, and 19 grad-year-gated roles parked.

## Lessons carried over
- **Ashby** flagged Claude-filled tabs as spam in mid-October, including when Ayan clicked Submit himself from the
  same tab. He re-allowed Ashby on 2026-10-26. Stop on any spam flag.
- **Greenhouse** shows reCAPTCHA at submit on some boards.
- **Grad-year gates** are the most common blocker (forms offering only 2027/2028). Never fake them.
- **Required transcript uploads** (Databricks, Strada, Rhombus) need Ayan's unofficial transcript PDF. It isn't in
  the cloud yet.
- **Application caps:** Databricks 1 per 30 days, Coinbase 3 per 6 months, Skydio 5 per 60 days.
- **"How did you hear":** default to LinkedIn, but use the true source when known.

## Pending from the Mac session (2026-11-01)
A batch of 24 no-sign-in SWE/AI postings was lined up but never evaluated, because the JD download crashed:
MongoDB, LinkedIn, Samsara, Patreon, Lyft, Klaviyo, Sigma Computing, Tanium, The Trade Desk, Whatnot, Figma
(Data Eng), Hex, Brain Co. (×2), Verkada, ServiceNow, Saronic, Base Power, FUTO, C3.ai, Inversion Space,
Domino Data Lab, Amplify and ID.me. The cloud queue starts from these plus fresh scan results.

## What changed in the cloud version
- Scanning uses SimplifyJobs' public Summer 2027 listings, reachable from the cloud today. Direct
  Greenhouse/Lever/Ashby board APIs (`./apply scan --boards`) need the network allowlist in SETUP.md.
- Filling uses headless Playwright Chromium with a label-driven filler (`src/fill.mjs`) and a rule-based answer
  engine (`src/answers.mjs`), instead of the Chrome extension.
- Submitting follows the same submit-by-text rule. The cloud browser can't pass CAPTCHAs, so those fall back to
  Ayan submitting with a link.

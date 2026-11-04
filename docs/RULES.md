# Application rules

These are Ayan's standing rules, carried over from the Career-Ops setup on his Mac
(`modes/_custom.md`, the Claude memory files, and decisions on the Summer '27 Internship Desk).
`src/rules.mjs` and `src/answers.mjs` enforce them in code. Keep this file and the code in sync.

## What to apply to
- **Term: Summer 2027 only.** A "Spring & Summer" posting is fine only if Summer can be picked on the form.
  Fall, Spring-only and Winter co-ops are skipped.
- **US roles only.**
- **Roles:** SWE, backend, full-stack, infra, data engineering, ML/AI, applied AI, and PM/APM/TPM (PM uses the PM resume).
  No hardware-only, PhD/MS-only, new-grad or full-time roles.
- **Quant / HFT / prop trading: never apply** (Jane Street, HRT, Citadel, Jump, IMC, Optiver, SIG, DRW, Five Rings,
  Man Group, Vatic, Schonfeld, etc.). Browse only.
- **Banks and finance firms: scrape-only.** They are listed but never filled without Ayan's explicit OK.
- **No sign-in sites.** Skip anything that needs an account or a verification code: Workday, Oracle Cloud, iCIMS,
  Eightfold, SuccessFactors, Taleo, Avature, Phenom, Yello. Greenhouse, Lever, Ashby and SmartRecruiters are OK.
- **Ashby** was re-allowed on 2026-10-26 ("that error is fixed now"). If Ashby shows a spam or verification flag,
  stop on that form and tell him. Never try to get around it.

## Company caps and holds
- Databricks: one application per 30 days. The SWE application is pending, so hold until 2026-11-20.
- Coinbase: at most 3 applications per 6 months. The planned slots are SWE, FDE and Data Eng.
- Skydio: one application per role per 90 days, and at most 5 across roles per 60 days.
- Sierra: only one intern/new-grad application.

## Filling forms
- Use only facts from the resume and `private/profile.json`. Never invent experience.
- **Graduation is May 2029.** If a form's grad-year options don't include 2029 or later (for example 2027/2028 only),
  leave it blank and flag it. These go to the "Grad 2028" pile for Ayan to decide. Never pick a different year.
- Email: always his UT Austin address (`profile.email`), never a personal one.
- How did you hear: use the true source if it's known (for example Instagram @zero2sudo). Otherwise use LinkedIn.
- Always tick "I agree", privacy, terms and "I certify" boxes (standing consent). Never opt in to SMS or marketing.
  Never type an e-signature.
- EEO: Male, Asian (Not Hispanic or Latino), not a protected veteran, no disability. Use "decline" for transgender and
  orientation questions.
- Why-us and essay questions: write 2–3 plain first-person sentences grounded in the resume and the JD, with no em dashes
  and no fabricated experience. For opinion essays or prompts over ~150 words, leave them blank and show Ayan the
  exact prompt.
- Leave required file uploads other than the resume (transcript, cover letter, work sample) for Ayan.
- Leave "Current company" blank.

## Submitting
- **Submit-by-text (2026-11-03):** submit an application only when Ayan names it in a message
  ("submit Samsara, Lyft") or approves it on the Desk and then says "submit the approved ones".
  "Submit all" covers only what's filled and ready at that moment.
- Before submitting, re-check that the resume is attached and no required field is blank.
- **CAPTCHA or verification on screen: don't submit.** Tell him and give him the link instead.
- After a submit is confirmed, mark the tracker row Applied (`./apply submit` does this automatically).

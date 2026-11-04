# Internships Applier

Ayan's cloud setup for applying to Summer 2027 internships from his phone. It finds postings, fills the
application forms headlessly, and submits **only** the ones he names.

```
scan (SimplifyJobs + ATS boards) → rules filter → queue → fill (Playwright) → Ayan says "submit X" → submit → tracker
```

- **Rules:** [docs/RULES.md](docs/RULES.md). Summer 2027 only, no quant/HFT, no sign-in sites, never fake the
  grad year, never touch CAPTCHAs.
- **Phone commands:** [docs/RUNBOOK.md](docs/RUNBOOK.md).
- **Setup:** [docs/SETUP.md](docs/SETUP.md). The network allowlist is needed before the cloud can open forms.
- **History:** [docs/CONTEXT.md](docs/CONTEXT.md). What was ported from the Mac Career-Ops setup.

## Quick start (in a cloud session)
```bash
./apply doctor          # network + private data check
./apply scan            # fresh Summer 2027 listings, filtered and de-duplicated against the tracker
./apply pick --top 25   # queue the best matches
./apply fill --all      # fill everything, screenshot, never submit
./apply queue           # see what's ready / what needs an answer
./apply submit figma    # only after Ayan says so
```

## Layout
| Path | What |
|---|---|
| `src/scan.mjs` | Listing sources and de-duplication |
| `src/rules.mjs` | Eligibility rules, resume choice, quick fit score |
| `src/answers.mjs` | Question → answer engine (profile facts only) |
| `src/fill.mjs` | Headless form filler and guarded submit |
| `bin/apply.mjs`, `./apply` | CLI |
| `config/boards.json` | Greenhouse/Lever/Ashby board slugs for direct scans |
| `config/profile.example.json` | Fake profile used by tests and as a template |
| `private/` | **gitignored**: real profile, resumes, tracker, queue, screenshots |
| `test/` | `npm test` (unit tests plus local fixture forms) |

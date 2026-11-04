# Setup

## 1. Network access (required before the cloud can open application forms)

The cloud environment's network policy currently **blocks the job sites**: every request to them gets
`403` from the proxy. `./apply doctor` shows which hosts are blocked. Scanning still works because it reads
SimplifyJobs' public list from `raw.githubusercontent.com`.

To allow the job sites, open the environment's settings in the Claude app or on claude.ai/code
(cloud environment menu in the session title bar, then **Edit**, then **Network access**).
Add these under **Allowed domains**, and leave **Allow package managers** ticked:

```
job-boards.greenhouse.io
boards.greenhouse.io
boards-api.greenhouse.io
api.greenhouse.io
jobs.lever.co
api.lever.co
jobs.ashbyhq.com
api.ashbyhq.com
jobs.smartrecruiters.com
api.smartrecruiters.com
www.smartrecruiters.com
```

The forms also load scripts and uploads from a few CDNs. If a form renders blank after the domains above are
allowed, also add:

```
www.google.com
www.gstatic.com
www.recaptcha.net
js.hcaptcha.com
hcaptcha.com
s3.amazonaws.com
cdn.ashbyprd.com
app.ashbyhq.com
```

You can also choose a broader level such as "Full" instead. Docs:
https://code.claude.com/docs/en/cloud-environments#network-access

Then run `./apply doctor`. Every host should say `ok`.

## 2. Make this repository private (recommended)

The repo is **public**, so personal data is kept out of git: `private/` is in `.gitignore`.
If you make the repo private (GitHub → Settings → General → Danger Zone → Change visibility), you can later choose to
commit `private/` so every new cloud session starts with your data already in place.

## 3. Restore private data in a new cloud session

Cloud containers are wiped between sessions, and `private/` isn't in git. A new session rebuilds it from
data you already own (Claude does this; see CLAUDE.md):

1. **Resumes.** Copy these Desk artifact files (https://claude.ai/artifact/KwnbmT3ePXuvwZUNvadg9p) to `private/resumes/`:
   - `resumes/Ayan_Bhardwaj -- Resume.pdf` → `swe.pdf`
   - `resumes/bank/short-resume-ml-ai-engineering-may-2029.pdf` → `ml.pdf`
   - `resumes/bank/short-resume-product-management-may-2029.pdf` → `pm.pdf`
2. **Profile and tracker.** Export the Desk's `applications` database to a folder, then run
   `node scripts/rebuild-private.mjs <folder>`. It takes each answer you gave most often on past forms and rebuilds
   `private/profile.json` and `private/tracker.json` (tested 2026-11-04: identical apart from punctuation).
3. **Queue and cloud-added tracker rows** are mirrored to the Desk as cards, so they come back with step 2.

A private Google Drive folder, "Internships-Applier (private)", was created for direct backups, but uploading
personal files there was blocked by the session's permission guard. Allow it if you want Drive backups too.

## 4. Running locally (optional)

Requirements: Node 22+ and Playwright with Chromium (`npm i -g playwright && npx playwright install chromium`).
On a Mac with a residential IP, CAPTCHAs are much less likely than from a cloud datacenter.

```bash
./apply doctor
./apply scan
```

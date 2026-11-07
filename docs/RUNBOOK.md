# Phone runbook

Text the cloud session from the Claude app. These are the messages it understands. Claude runs the matching
`./apply` command and replies with the result.

| You text | What happens |
|---|---|
| `status` | Live processes (OAs, interviews), plus queue counts. |
| `what's ready?` / `queue` | Lists filled applications ready to submit, and the ones that need an answer from you. |
| `show figma` | Shows what was entered for one application, the questions still open, and a screenshot of the filled form. |
| `answer figma why: <text>` | Saves your answer to an open question. Claude refills that form. |
| `submit figma, lyft` | Submits **only** those applications, after re-checking each one. |
| `approve figma lyft` then `submit the approved ones` | Same thing in two steps. You can also tap Approve on the Desk. |
| `skip valon` | Removes an application from the queue. |
| `find more` / `scan` | Pulls fresh Summer 2027 postings and queues the best new matches (fill only). |
| `got an OA from X` / `rejected by Y` | Updates the tracker. |

## What Claude does on `submit X`
1. Reopens X's form headlessly, refills it from your profile and saved answers, and re-reads every field.
2. Stops if any required field is blank, the resume isn't attached, or a CAPTCHA or spam check is on screen.
3. Clicks Submit and waits up to 20 seconds for a confirmation page.
4. Records the result in the tracker, and sends you the confirmation screenshot or the reason it stopped.

## If a submit is blocked
- **CAPTCHA:** cloud browsers come from datacenter IPs, so Greenhouse's reCAPTCHA or Lever's hCaptcha can challenge
  them. Claude never solves these. You get the direct link to submit from your phone. Your answers are in the
  `show` output to copy.
- **Ashby spam flag:** same. Submit from a fresh tab yourself.
- **Grad-year gate** (only 2027 or 2028 offered): goes to your "you decide" list. Claude never picks a false year.

## Outreach texts
| You text | What happens |
|---|---|
| `outreach` / `who should I email?` | Top startup leads with drafted emails ready for review. |
| `show innate` | The full email, the founder, alternate addresses, warm paths, and a Gmail compose link. |
| `approve innate, yondu` | Marks them approved. Tap the compose link, attach your resume, and send. |
| `sent innate` | Starts the follow-up clock (+4 and +11 days). |
| `follow-ups` | Due follow-ups with compose links. |
| `innate replied` / `call with innate Tue 3pm` | Updates status and gives you a Google Calendar link. |
| `find more robotics startups` | Runs discover + people + draft again. |


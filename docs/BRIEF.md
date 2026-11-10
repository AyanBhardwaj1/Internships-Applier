# Daily brief

Ayan texts **"brief"** (or "daily brief", "what's new today?") to either the cloud session or the Mac session. Claude
runs `./apply brief` and replies with the result, condensed for a phone.

## What it covers, in order
1. **Internships:** new eligible Summer 2027 postings since the last day (rules from docs/RULES.md applied), the best
   matches, the queue counts (ready, needs an answer, blocked by CAPTCHA, with the Mac), and what was applied.
2. **Programs and fellowships:** curated list in `config/programs.json` (research programs, REUs, national labs,
   underclassman programs, VC fellowships, builder grants), sorted by deadline. ⏰ marks anything due within 3 weeks.
   Also includes program-like postings found by the scan (fellow, sophomore, Explore, etc.).
3. **Hackathons to register for:** open or upcoming, at least a day left, ranked for him:
   - Texas in-person (HackUTA, Austin build nights) first, then strong online ones, then SF/NYC.
   - Robotics / physical AI > AI/agents > hardware > founder/startup themes.
   - Curated sources (Cerebral Valley, MLH) beat the long tail of Devpost; tiny or club-run Devpost listings are pushed down.
   - In-person events outside the US are dropped.
4. **Networking events:** Luma (Austin, SF and the AI/Tech categories) and Cerebral Valley. Only tech events that
   match his interests; sold-out ones are pushed down. Good founders met here become outreach leads (docs/OUTREACH.md).
5. **Outreach:** drafted emails ready, sent, replies, and follow-ups due.

"New" (🆕) means first seen in the last ~36 hours. Older items appear again only when they score high ("if it's that
good"). Seen items are stored in `private/brief/seen.json`, and each brief is saved as `private/brief/<date>.md`.

## Sources
| Source | What | How |
|---|---|---|
| Devpost | open and upcoming hackathons | `devpost.com/api/hackathons` |
| MLH | student hackathons this season | `www.mlh.com/seasons/<year>/events` (page JSON) |
| Cerebral Valley | AI hackathons and events | `cerebralvalley.ai/events` and `/hackathons` (JSON-LD) |
| Luma | Austin, SF, AI and Tech events | `api.lu.ma/discover/get-paginated-events` |
| SimplifyJobs + boards | internships | `./apply scan` (auto-run if the last scan is older than 20 hours) |

The cloud environment allowlists these hosts: devpost.com, www.mlh.com, mlh.io, cerebralvalley.ai, lu.ma, api.lu.ma,
luma.com. Everything is public; nothing signs in or registers. **Claude never registers Ayan for an event or
hackathon.** It gives him the link.

## Commands
```bash
./apply brief                 # today's brief (scans first if needed)
./apply brief --days 7        # internships from the past week
./apply brief --sources luma,mlh --json
```
Refresh `config/programs.json` about once a month (deadlines, newly opened cycles). Entries with `"verify": true` have
dates from third-party sites; say so when reporting them.

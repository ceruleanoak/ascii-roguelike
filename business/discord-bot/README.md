# Pure Rogue Discord Ops Bot

A **passive engagement-analytics collector** for the CeruleanOak Discord. It
listens, classifies messages with deterministic heuristics, and writes a local
store that powers engagement reports and the community-heartbeat job.

## Operating principle — invisible by design

The core audience is retro-literate and craft-obsessed; visible, chatty,
generative bots are a turnoff. So this bot:

- **Posts nothing.** It has no commands, no welcome messages, no generated text.
- **Is purely operational.** Every output is deterministic and auditable — message
  counts, classifications by regex, timing histograms. No LLM in the loop.
- **Stays out of sight.** Members should not notice it beyond a member-list entry.

Any future visible feature (e.g. reaction-role assignment) must remain strictly
logical/operational. Never add generative output.

This replaces the legacy `/tmp/discord_full.txt` dump on the Mac mini with a
structured, de-duplicated, queryable store.

## What it produces

- `data/events.jsonl` — one normalized message event per line (de-duped by ID).
- `data/members.json` — roster snapshot for lurker-vs-active / retention analysis.
- `report.js` → a markdown engagement brief in `../drafts/discord-report-<date>.md`:
  most active members + heuristic persona tags, channel mix, hour-of-day activity,
  and a surfaced list of open questions/bug reports for a human to answer.

## Files

| File | Role |
|------|------|
| `bot.js` | Live collector — long-running listener. Posts nothing. |
| `backfill.js` | One-time/re-runnable history pull to bootstrap the store. |
| `report.js` | Deterministic engagement/persona report → `../drafts/`. |
| `src/collector.js` | Normalizes a message → store event. |
| `src/classify.js` | Heuristic tagging (bug/question/feedback/help/social). |
| `src/store.js` | JSON-lines event log + member roster, de-dup by ID. |
| `src/config.js` / `src/env.js` | Env-driven config + tiny `.env` loader. |

## Setup

The bot **token already exists**. You still need to confirm two privileged intents
are enabled, because this bot reads message content and the member list.

1. **Discord Developer Portal → your application → Bot:**
   - Enable **MESSAGE CONTENT INTENT** (required to classify messages).
   - Enable **SERVER MEMBERS INTENT** (required for roster / retention).
2. **Invite scope** (if not already in the server): OAuth2 URL with `bot` scope and
   read permissions — *View Channels* and *Read Message History*. No send/manage
   permissions are needed; keep the bot least-privileged.
3. **Config:**
   ```bash
   cp .env.example .env
   # fill in DISCORD_BOT_TOKEN and GUILD_ID (right-click server → Copy Server ID,
   # with Developer Mode on)
   npm install
   ```
4. **Bootstrap history, then run live:**
   ```bash
   node backfill.js        # pulls BACKFILL_DAYS of history into data/
   node report.js          # generates the first engagement brief
   npm start               # begins live collection (leave running)
   ```

## Deploy on the Mac mini (the ops node)

`192.168.1.35` / `macs-mac-mini.local` is the always-on execution plane. Run the
collector there so it keeps logging when the laptop sleeps.

```bash
# on the mini, from this folder
npm install
cp .env.example .env && $EDITOR .env   # token + guild id

# keep it alive with launchd (preferred on macOS) or pm2:
npx pm2 start bot.js --name pr-discord-collector
npx pm2 save
```

Schedule the report (daily) via cron/launchd, or let the Cowork
`pure-rogue` scheduled jobs run `node report.js` and pick up the markdown from
`business/drafts/`. The report only reads the local store — no live API calls — so
it is cheap to run often.

## Privacy & security notes

- The token, guild ID, and `data/` are **gitignored**. The token lives only in the
  mini's `.env`, never in the repo.
- `STORE_CONTENT=false` keeps only metadata + classification if you'd rather not
  retain message text. Default is `true` because the heartbeat job drafts replies
  from context. Bot-authored messages never store content.
- Least privilege: the bot requests read-only permissions. It cannot post, kick, or
  manage anything as configured.

## Roadmap (not built here)

Per `business/STRATEGY.md §5`, a later phase adds a **separate, approval-gated**
sender for patch-note/devlog announcements on deploy. Keep that as its own module
with send scope, never folded into this passive collector.

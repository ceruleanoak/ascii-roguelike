# Pure Rogue — Business, Brand & Operations Plan

*Owner: CeruleanOak ops/marketing (this Cowork project). Companion file: `business/DESIGN-DIRECTION.md`. Last assembled 2026-06-09.*

This is the operating plan for the **non-dev** side of Pure Rogue. Dev happens daily in the repo (Claude Code); this plan defines everything around it — brand, audience, the few roles that matter, the recurring work that runs in lockstep with dev, and the infrastructure (Discord, Mac mini, Tailscale) we migrate to later.

---

## 1. Current state — assuming zero market footprint

**The product.** A browser-based real-time ASCII roguelike, public name **Pure Rogue** (repo name "ASCII Roguelike"). Vanilla JS + Vite, deployed free-to-play at `ceruleanoak.github.io/ascii-roguelike/`. The hook is unusually sharp for the genre: *no save file — your mind is the save file.* Permadeath resets everything; the only thing that carries between runs is player knowledge (recipes, zone patterns, mechanics). Real-time arcade combat over a discovery-crafting loop, wrapped in a deliberate 80s CLI aesthetic.

**The build is far past "demo."** Public messaging says "20%, playable in alpha," and that conservative framing is fine for hype — but internally the engine is mature: ~56 enemy definitions, six playable characters mapped to the cosmology paths, and dozens of systems (combat, physics, crafting, zones, dungeons/huts/mazes interiors, fishing, boss encounters, audio, a death-telemetry pipeline). The bottleneck is **not** systems — it's *content identity*. Most enemies, zones, and rooms are mechanically wired but thematically placeholder. That is the single most important fact for both design and marketing: we are selling a vibe the content doesn't fully deliver yet. The design-direction file addresses exactly this.

**The design spine already exists and is excellent.** `claudedocs/zone-cosmology.md` defines four "paths" (not biomes): Green/Greed/*Acquire*, Yellow/Storm/*Channel*, Red/Reaction/*React*, Cyan/Stillness/*Anticipate*, with Gray (Death) as the terminus and Blue (Tidefall) as a secret. This is a genuine creative asset — most solo roguelikes never get this coherent. Marketing should lean on it; design should finish delivering it.

**The studio.** CeruleanOak = one developer (Thomas), "one dev, one room." Three games live (Pure Rogue, Hanafuda Koi-Koi, Dice Wars Reloaded), a personal hub site with a devlog + RSS, original NES-constraint chiptune (square wave + noise only), a YouTube channel, and a Discord. Brand identity is strong and authentic: *solo, retro-literate, craft-obsessed, transparent.* That authenticity is the whole marketing strategy — we don't fight it, we amplify it.

**Existing channels (treat traction as ~zero regardless).** Discord (`discord.gg/ceruleanoak`), YouTube (`@ceruleanoak`), RSS devlog (roughly monthly: Feb/Mar/Apr 2026 entries), a music page. A Mac mini server (`192.168.1.35` / `macs-mac-mini.local`) already runs a Discord-related job and is SSH-reachable. Live death telemetry POSTs to a Google Sheet on every player death. **We have the pipes; we have no audience yet.** The plan assumes we are starting the funnel from nothing.

**Honest weaknesses.**
- Devlog cadence is monthly and reactive; there's no steady drumbeat between releases.
- No conversion target — the demo is top-of-funnel with nothing to convert *toward* (no Steam "coming soon", no email list).
- Telemetry is captured but not yet turned into a regular feedback loop for design.
- Content placeholder-ness undercuts the strongest marketing asset (the cosmology).
- All ops currently depend on Thomas's laptop being on; nothing runs unattended.

---

## 2. Brand positioning

**One-line positioning.** *Pure Rogue — a real-time ASCII roguelike where your only save file is your own memory.*

**Pillars (every piece of content should hit at least one):**
1. **"Your mind is the save file."** The permadeath/mental-progression koan. This is the differentiator; repeat it relentlessly.
2. **Hand-made by one person.** The "one dev, one room" honesty — ugly first passes, square-wave music, the workshop. People follow *people*.
3. **Retro literacy, not retro nostalgia-bait.** We know *why* 80s/90s games felt the way they did (constraint breeds clarity) and we build from that principle, not from a filter.
4. **Depth under a simple surface.** ASCII glyphs hiding a four-path cosmology, kinetic puzzles, and discovery crafting. "It looks like text; it plays like a system."

**Voice.** First-person, dry, specific, a little self-deprecating. Show the seams. The existing devlog voice ("Coded my first boss — it was immediately fun") is exactly right; keep it.

**Naming hygiene.** Standardize on **Pure Rogue** everywhere public. "ASCII Roguelike" stays as the repo/dev name only. Fix any public surface still using the generic title.

**Business model (free demo now; decide the conversion target deliberately).** The web build stays free forever as the top of the funnel — frictionless, linkable, the best possible trailer. The open strategic question is what it converts *toward*. Three credible paths, not mutually exclusive: (a) a future paid **Steam** release of Pure Rogue with the web build as a permanent free demo, using a "coming soon" wishlist page as the conversion target; (b) **itch.io** with optional "pay what you want" / donations to keep it pure-free; (c) keep everything free and treat the catalog as a portfolio that builds reputation toward a larger future title. *This is a financial/strategic decision for Thomas, not something to lock in here — I'm flagging the trade-offs, not recommending one.* What's safe to start now regardless of which path wins: build the **email list / wishlist intent** capture, because every path benefits from a list of people who want the next thing.

---

## 3. Critical roles — just a few heads

At zero footprint with a solo dev who codes daily, headcount is about **functions covered**, not bodies hired. There is realistically one human (Thomas) plus this agent. The goal is to name the few functions that must not go uncovered, and be explicit about who fills each.

| # | Role / function | Who fills it | Why it's critical now |
|---|----------------|--------------|----------------------|
| 1 | **Developer** | Thomas (daily) | The product. Stays ~100% on the game — every other role exists to protect this focus. |
| 2 | **Producer / Marketing-Ops** | **This Cowork agent** | Converts raw dev output (commits, telemetry, bug list) into devlogs, patch notes, telemetry reports, social cuts, and design briefs — *without* taking Thomas off the keyboard. This is the role this project instantiates. Covers ~80% of the non-dev load asynchronously. |
| 3 | **Community lead / Moderator** | **1 human — recruit a trusted volunteer from the Discord** | The one function an async agent genuinely cannot own: real-time human presence, welcoming new members, running playtests, judgment calls on moderation. At a small server this is a few hours a week. This is the only "hire" to actively pursue, and it should be a volunteer/community member, not a paid role yet. |

**Deliberately *not* hiring yet:** audio (Thomas's chiptune is a brand asset, not a gap), art (ASCII *is* the art), and a dedicated designer (design stays with Thomas, scaffolded by agent briefs from the cosmology). Adding heads here would dilute the "one dev, one room" story that is doing real marketing work.

**The shape this gives you:** one developer, one always-on producer/ops layer (agent), and one human community anchor. Three "heads," only one of which costs anything (and that cost is goodwill, not money).

---

## 4. Schedulable work — lightweight, progressive, in lockstep or ahead of dev

The design principle: **the agent should always be one step ahead of Thomas's keyboard.** When he finishes a feature, the devlog draft, patch note, telemetry read, and social cut should already be waiting for a 5-minute edit-and-approve — never a from-scratch task. Each job below is small, runs unattended, and feeds the next.

| Cadence | Job | What it does | Lockstep or ahead? | Runs (now → later) |
|---------|-----|--------------|--------------------|--------------------|
| Daily AM | **Dev pulse / standup** | Read `git log` since yesterday + the death ledger + `known-bugs.md`; emit a 5-line internal summary and flag anything anomalous (e.g. a spike of deaths to one weak enemy = balance bug). | Lockstep | Cowork now → Mac mini later |
| Daily | **Telemetry watch** | Pull the Google-Sheet death ledger; compute where/what/at-what-depth players die; auto-open P2 entries when a balance threshold trips (e.g. Bug #65-style dead-pool math, or "70% of deaths in Green depth 1-3"). | Lockstep | Cowork → Mac mini |
| 3×/week | **Community heartbeat** | Via the Mac mini's Discord pull, surface unanswered questions, playtest feedback, and bug reports; draft replies in CeruleanOak voice for Thomas/mod to send. | Lockstep | **Mac mini** (it already pulls Discord) |
| Weekly | **Devlog draft** | From the week's commits + telemetry highlights, draft the next RSS/devlog entry in-voice, *ahead* of dev so publishing is a quick edit. Keeps the public drumbeat weekly instead of monthly. | **Ahead** | Cowork → Mac mini |
| Weekly | **Social cut list** | Pick the single most demo-able change of the week; write a 15–30s clip script + caption for YouTube Shorts / Reddit (r/roguelikes, r/IndieDev) / X / Bluesky. Thomas just records. | **Ahead** | Cowork |
| Weekly | **Telemetry → design report** | Turn the week's deaths into a one-page balance read that feeds the bug list and the design briefs. | Lockstep | Cowork → Mac mini |
| Biweekly | **Design brief** | Produce one finished enemy or room spec (per `DESIGN-DIRECTION.md`) so there's always a de-placeholdered, cosmology-aligned piece of content queued *ahead* of the dev schedule. | **Ahead** | Cowork |
| On deploy (event) | **Patch notes + Discord announce** | On `npm run deploy`, draft player-facing patch notes and a Discord `#announcements` post. | Lockstep | Mac mini (watches gh-pages) |
| Monthly | **Brand / funnel review** | Channel growth, devlog cadence adherence, wishlist/email intent, positioning drift. One page. | Ahead | Cowork |

**Sequencing logic (why these specific jobs).** Telemetry feeds the bug list and design reports; design reports feed the biweekly briefs; briefs feed dev; dev produces commits; commits feed the devlog and social cuts; the community heartbeat closes the loop by routing player reaction back into telemetry and bugs. Every job is either reading something cheap (git, a sheet, Discord) or drafting something Thomas approves in minutes. Nothing here asks Thomas to *start* a non-dev task from zero.

**Start small.** Stand up just three first — **Dev pulse (daily)**, **Devlog draft (weekly)**, and **Social cut list (weekly)** — because together they create the public drumbeat from day one. Add telemetry and community jobs once the Mac mini migration (§5) is in place. *I can wire the schedulable jobs that don't need the Mac mini as Cowork scheduled tasks whenever you want — say the word and I'll set up the three starters.*

---

## 5. Infrastructure — Discord via the Mac mini + Tailscale dashboard (architecture for later migration)

**Intent (per the brief): plan and architecture only. Nothing is built here.** The goal is to move the recurring ops off this laptop and onto the always-on Mac mini, leverage the Discord integration that already lives there, and view everything through a private dashboard reachable from anywhere via Tailscale.

### 5.1 Why migrate at all
Today every scheduled job depends on Thomas's laptop being awake and Cowork being open. That breaks the "always one step ahead" promise the moment the lid closes. The Mac mini (`192.168.1.35` / `macs-mac-mini.local`) is already on 24/7, already SSH-reachable, and already runs a Discord job (it dumps `/tmp/discord_full.txt`). It is the natural **ops node**. Cowork remains the **control plane** — where Thomas does ad-hoc work and reviews drafts — while the Mac mini becomes the **execution plane** that runs the recurring jobs unattended.

### 5.2 Component architecture

```
                         ┌─────────────────────────────────────────┐
                         │           MAC MINI (ops node)            │
                         │        always-on · tailnet member        │
                         │                                          │
  Discord  ──bot token──▶│  discord-pull   ─┐                       │
  (server activity)      │  (cron/launchd)  │                       │
                         │                  ▼                       │
  Google Sheet ──fetch──▶│  telemetry-pull ─┼─▶  data store         │
  (death ledger)         │                  │    (SQLite/JSON       │
                         │  git/gh-pages ───┤     on local disk)    │
  GitHub repo  ──poll───▶│  commit-watch    │                       │
                         │                  ▼                       │
                         │            dashboard web app             │
                         │         (static + tiny API, :8787)       │
                         │                  │                       │
                         │            agent runner (headless)       │
                         │        drafts devlog/patch/social ──┐    │
                         └──────────────────┼──────────────────┼────┘
                                            │ Tailscale         │ drafts land in
                                  MagicDNS / Serve (HTTPS)      │ a review queue
                                            │                   ▼
                  ┌─────────────────────────▼──────┐   ┌──────────────────┐
                  │  Thomas — any device on tailnet │   │  Cowork (laptop) │
                  │  opens http://macs-mac-mini:8787│   │  control plane:  │
                  │  (or Tailscale Serve HTTPS URL) │   │  review/approve, │
                  │  → the dashboard                │   │  ad-hoc work     │
                  └─────────────────────────────────┘   └──────────────────┘
```

**Data plane.** Three pullers (Discord, Google Sheet telemetry, GitHub commits) write to one small local store on the mini (SQLite is plenty; JSON files work too). Everything the dashboard and the agent runner need reads from that store — no live API calls on page load.

**Discord integration.** Upgrade the current `/tmp/discord_full.txt` dump to a proper read via a **Discord bot token** (a bot in the CeruleanOak server with read scope on the relevant channels). The puller normalizes recent messages into the store: who, channel, timestamp, text, whether it's a question/bug/feedback. This is what powers the "community heartbeat" job and the dashboard's community panel. *Posting* back to Discord (patch announcements) uses the same bot with send scope, gated behind Thomas's approval from the review queue.

**Agent runner.** The recurring drafting jobs (devlog, patch notes, social cuts, telemetry reports) run headless on the mini on a schedule (launchd is the right macOS primitive — survives reboots, runs without a logged-in GUI session). Output is **drafts into a review queue**, never auto-published. Thomas approves from the dashboard or from Cowork.

### 5.3 Tailscale — the access layer
Tailscale gives the mini a stable private identity on Thomas's tailnet so the dashboard is reachable from any of his devices **without exposing a single port to the public internet.**
- **MagicDNS:** reach the dashboard at `http://macs-mac-mini:8787` from any tailnet device — no IP memorization, works off the home LAN.
- **Tailscale Serve:** wrap the dashboard in automatic HTTPS *inside* the tailnet (clean certs, no warnings), still private.
- **Tailscale Funnel (only if ever needed):** expose a read-only public status page to the internet. Default is **off** — keep everything private until there's a reason.
- **ACLs:** restrict dashboard:8787 and SSH to Thomas's own devices. The Discord bot token, Google Sheet endpoint, and any GitHub token live in env/secrets on the mini, never in the repo.

### 5.4 Dashboard spec (what the page shows)
A single private page, panels top to bottom:
1. **Dev pulse** — commits in the last 24h/7d, current `known-bugs.md` P1/P2 counts, deploy status (is gh-pages ahead of last announce?).
2. **Telemetry** — deaths over time; heatmap of *where* players die (zone × depth); top killers; top weapons held at death; auto-flags ("Green depth 1–3 = 60% of deaths").
3. **Community** — recent Discord activity, unanswered questions/bug reports, member count trend.
4. **Funnel** — devlog cadence (days since last post), channel growth, wishlist/email intent count.
5. **Review queue** — drafts waiting for approval (devlog, patch notes, social cuts) with one-click approve.

This is the same data the scheduled jobs already produce — the dashboard is just the single pane of glass over it.

### 5.5 Migration path (phased, low-risk)
- **Phase 0 (now):** Run the three starter jobs in Cowork on the laptop. Validate the drafts are useful and in-voice. *No mini work yet.*
- **Phase 1:** Stand up the data store + the three pullers (Discord bot, telemetry, commit-watch) on the mini behind Tailscale. Read-only. Dashboard panels 1–3.
- **Phase 2:** Move the recurring **drafting** jobs to the mini's agent runner (launchd). Add the review queue (panel 5) and funnel panel (4). Cowork becomes review/approve + ad-hoc only.
- **Phase 3:** Enable approved **write-backs** (Discord announce on deploy, etc.) gated behind the review queue. Consider Funnel for a public status page only if there's audience demand.

Each phase is independently useful and reversible; nothing here is required to start getting value from §4.

---

## 6. 30 / 60 / 90 — what to actually do

**First 30 days (drumbeat + identity).** Standardize on "Pure Rogue" across public surfaces. Stand up the three starter scheduled jobs (dev pulse, weekly devlog draft, weekly social cut) so the public cadence goes monthly → weekly. Recruit one volunteer Discord mod. Ship the first two de-placeholdered design briefs from `DESIGN-DIRECTION.md` into the dev queue. Decide the conversion target (Steam coming-soon vs itch vs portfolio) — or at minimum start capturing email/wishlist intent regardless.

**Days 30–60 (infra + loop).** Execute migration Phase 1 (pullers + dashboard read-only behind Tailscale). Turn telemetry into a weekly design-feeding report. Begin the biweekly design-brief drumbeat. First short-form video cuts go out; start posting devlogs to r/roguelikes and r/IndieGaming on cadence.

**Days 60–90 (de-placeholder + convert).** Migration Phase 2 (agent runner + review queue on the mini — ops now survive a closed laptop). Land the first fully-realized zone (Green is the most build-ready) as the showcase "this is what Pure Rogue actually is" milestone, and build the marketing beat around it. Re-evaluate the conversion target with real funnel numbers.

---

## 7. Open decisions for Thomas (not blockers)
These are genuinely yours to call; I'll proceed on sensible defaults until you say otherwise.
1. **Conversion target:** Steam (paid, web stays free demo) / itch (PWYW) / pure-free portfolio. *Default: start the email-list capture now, defer the rest.*
2. **Volunteer mod:** who from the Discord, and how much do you want to delegate.
3. **Which three scheduled jobs to wire first** (default: dev pulse, devlog draft, social cut).
4. **Mac mini migration go-ahead** and whether the dashboard stays tailnet-private (default: yes, private).

---
*See `business/DESIGN-DIRECTION.md` for the enemy and zone design work.*

// One-time (re-runnable) historical backfill. Walks each readable text channel
// backwards and records messages into the store, so the engagement report has
// history on day one instead of starting empty. Safe to re-run: the store
// de-dups by message ID.
//
//   node backfill.js          # uses BACKFILL_DAYS from .env (default 90)
//   node backfill.js --all    # ignore the day window, pull everything reachable

import { loadEnv } from './src/env.js';
loadEnv();

import { Client, GatewayIntentBits, Partials, Events, ChannelType } from 'discord.js';
import { config, assertToken, channelAllowed } from './src/config.js';
import { collect } from './src/collector.js';
import { recordMember, flushSeen } from './src/store.js';

assertToken();

const ALL = process.argv.includes('--all');
const cutoff = ALL || config.backfillDays === 0
  ? 0
  : Date.now() - config.backfillDays * 24 * 60 * 60 * 1000;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel],
});

async function backfillChannel(channel) {
  let before;
  let total = 0;
  for (;;) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || batch.size === 0) break;

    let reachedCutoff = false;
    for (const msg of batch.values()) {
      if (msg.createdTimestamp < cutoff) {
        reachedCutoff = true;
        continue;
      }
      if (collect(msg)) total += 1;
    }
    before = batch.last()?.id;
    if (reachedCutoff || batch.size < 100) break;
  }
  return total;
}

client.once(Events.ClientReady, async (c) => {
  console.log(`[backfill] ${c.user.tag} | window=${ALL ? 'ALL' : config.backfillDays + 'd'}`);
  const guild = config.guildId
    ? await c.guilds.fetch(config.guildId).catch(() => null)
    : c.guilds.cache.first();
  if (!guild) {
    console.error('[backfill] could not resolve guild — check GUILD_ID.');
    process.exit(1);
  }

  // Roster snapshot.
  const members = await guild.members.fetch().catch(() => null);
  if (members) {
    for (const m of members.values()) {
      recordMember({
        id: m.id,
        tag: m.user?.username ?? null,
        isBot: Boolean(m.user?.bot),
        joinedAt: m.joinedTimestamp ?? null,
        present: true,
      });
    }
    console.log(`[backfill] roster: ${members.size} members`);
  } else {
    console.log('[backfill] roster fetch failed (enable SERVER MEMBERS intent) — continuing.');
  }

  const channels = await guild.channels.fetch().catch(() => null);
  let grand = 0;
  for (const ch of (channels?.values() ?? [])) {
    if (!ch || ch.type !== ChannelType.GuildText) continue;
    if (!channelAllowed(ch.id)) continue;
    if (!ch.viewable) continue;
    const n = await backfillChannel(ch).catch((e) => {
      console.log(`[backfill] #${ch.name}: skipped (${e?.message ?? 'no access'})`);
      return 0;
    });
    console.log(`[backfill] #${ch.name}: +${n}`);
    grand += n;
  }

  flushSeen();
  console.log(`[backfill] done — ${grand} new messages recorded to ${config.dataDir}`);
  client.destroy();
  process.exit(0);
});

client.login(config.token);

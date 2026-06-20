// CeruleanOak / Pure Rogue ops bot — LIVE collector.
//
// Design constraint (from ops direction): the bot is invisible to members. It
// posts NOTHING, runs no generative output, and exposes no chat commands. It
// only listens, classifies with deterministic heuristics, and records to a local
// store. Visible/operational features (if ever added) must stay strictly
// logical — never generative.
//
// What it does:
//   - Records every new message (metadata + optional content) for engagement analytics.
//   - Tracks member joins/leaves for roster + retention signals.
//   - Periodically flushes the de-dup index to disk.

import { loadEnv } from './src/env.js';
loadEnv();

import { Client, GatewayIntentBits, Partials, Events } from 'discord.js';
import { config, assertToken } from './src/config.js';
import { collect } from './src/collector.js';
import { recordMember, flushSeen } from './src/store.js';

assertToken();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged — enable in the Dev Portal
    GatewayIntentBits.GuildMembers, // privileged — enable in the Dev Portal
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (c) => {
  console.log(`[ready] collecting as ${c.user.tag} | guild=${config.guildId || '(any)'}`);
  console.log('[mode] passive — this bot never posts to the server.');
});

client.on(Events.MessageCreate, (message) => {
  try {
    if (config.guildId && message.guildId !== config.guildId) return;
    collect(message);
  } catch (err) {
    console.error('[collect:error]', err?.message ?? err);
  }
});

// Roster tracking for retention / lurker-vs-active analysis.
client.on(Events.GuildMemberAdd, (member) => {
  if (config.guildId && member.guild.id !== config.guildId) return;
  recordMember({
    id: member.id,
    tag: member.user?.username ?? null,
    isBot: Boolean(member.user?.bot),
    joinedAt: member.joinedTimestamp ?? Date.now(),
    present: true,
  });
});

client.on(Events.GuildMemberRemove, (member) => {
  if (config.guildId && member.guild.id !== config.guildId) return;
  recordMember({ id: member.id, present: false, leftAt: Date.now() });
});

// Persist the de-dup index regularly and on shutdown.
const flushTimer = setInterval(flushSeen, 60_000);
flushTimer.unref?.();

function shutdown() {
  console.log('\n[shutdown] flushing store...');
  flushSeen();
  client.destroy();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.login(config.token);

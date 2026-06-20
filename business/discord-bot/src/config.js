// Central config — reads .env (loaded by the entrypoint) with sane defaults.
// No secrets are hard-coded here; everything comes from the environment.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function list(name) {
  const raw = process.env[name];
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

function int(name, fallback) {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  token: process.env.DISCORD_BOT_TOKEN ?? '',
  guildId: process.env.GUILD_ID ?? '',
  channelAllowlist: list('CHANNEL_ALLOWLIST'),
  channelDenylist: list('CHANNEL_DENYLIST'),
  dataDir: path.resolve(ROOT, process.env.DATA_DIR ?? './data'),
  storeContent: bool('STORE_CONTENT', true),
  backfillDays: int('BACKFILL_DAYS', 90),
};

export function assertToken() {
  if (!config.token) {
    console.error('Missing DISCORD_BOT_TOKEN. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
}

// Returns true if a channel ID should be collected, honoring allow/deny lists.
export function channelAllowed(channelId) {
  if (config.channelDenylist.includes(channelId)) return false;
  if (config.channelAllowlist.length > 0) {
    return config.channelAllowlist.includes(channelId);
  }
  return true;
}

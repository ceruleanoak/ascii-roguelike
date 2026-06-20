// Append-only event log + lightweight member roster.
// Zero native deps: events live in data/events.jsonl (one JSON object per line),
// members in data/members.json. Plenty for a near-zero-traction server, and
// greppable in the same spirit as the legacy /tmp/discord_full.txt dump it replaces.

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const EVENTS_FILE = () => path.join(config.dataDir, 'events.jsonl');
const MEMBERS_FILE = () => path.join(config.dataDir, 'members.json');
const SEEN_FILE = () => path.join(config.dataDir, 'seen-ids.json');

function ensureDir() {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

// In-memory set of message IDs already recorded, so backfill + live collection
// never double-count. Loaded lazily, persisted on flush.
let seen = null;
function loadSeen() {
  if (seen) return seen;
  ensureDir();
  try {
    const raw = JSON.parse(fs.readFileSync(SEEN_FILE(), 'utf8'));
    seen = new Set(raw);
  } catch {
    seen = new Set();
  }
  return seen;
}

export function hasMessage(id) {
  return loadSeen().has(id);
}

// Appends one normalized message event. Returns false if it was a duplicate.
export function recordMessage(event) {
  ensureDir();
  const s = loadSeen();
  if (s.has(event.id)) return false;
  s.add(event.id);
  fs.appendFileSync(EVENTS_FILE(), JSON.stringify(event) + '\n');
  return true;
}

// Persist the seen-id set. Call periodically and on shutdown.
export function flushSeen() {
  if (!seen) return;
  ensureDir();
  fs.writeFileSync(SEEN_FILE(), JSON.stringify([...seen]));
}

// Upsert a member record (id -> {tag, joinedAt, isBot, roles}).
export function recordMember(member) {
  ensureDir();
  let roster = {};
  try {
    roster = JSON.parse(fs.readFileSync(MEMBERS_FILE(), 'utf8'));
  } catch {
    roster = {};
  }
  roster[member.id] = { ...roster[member.id], ...member };
  fs.writeFileSync(MEMBERS_FILE(), JSON.stringify(roster, null, 2));
}

export function readMembers() {
  try {
    return JSON.parse(fs.readFileSync(MEMBERS_FILE(), 'utf8'));
  } catch {
    return {};
  }
}

// Streams all recorded events as an array (fine at this scale).
export function readEvents() {
  try {
    const raw = fs.readFileSync(EVENTS_FILE(), 'utf8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

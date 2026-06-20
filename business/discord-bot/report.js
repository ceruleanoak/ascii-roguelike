// Engagement report — deterministic analytics over the collected store.
// No LLM, no generation: every number traces to a recorded event. Writes a
// markdown brief to ../drafts/ and prints a summary to stdout.
//
//   node report.js            # all-time
//   node report.js --days 30  # window to the last N days

import { loadEnv } from './src/env.js';
loadEnv();

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEvents, readMembers } from './src/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRAFTS_DIR = path.resolve(__dirname, '..', 'drafts');

const daysArg = (() => {
  const i = process.argv.indexOf('--days');
  return i !== -1 ? Number.parseInt(process.argv[i + 1], 10) : null;
})();
const since = daysArg ? Date.now() - daysArg * 86_400_000 : 0;

const events = readEvents().filter((e) => !e.isBot && e.ts >= since);
const members = readMembers();

// ---- Persona heuristics -----------------------------------------------------
// Volume tier by message count; role by dominant classification mix.
function volumeTier(n) {
  if (n >= 50) return 'core';
  if (n >= 15) return 'regular';
  if (n >= 4) return 'occasional';
  return 'drive-by';
}
function roleTag(mix) {
  const ranked = Object.entries(mix).sort((a, b) => b[1] - a[1]);
  const [top] = ranked[0] ?? ['social', 0];
  return {
    bug: 'bug-hunter',
    question: 'asker',
    help: 'helper',
    feedback: 'critic',
    social: 'socializer',
  }[top] ?? 'socializer';
}
function activeWindow(hours) {
  // hours: array of 24 counts. Bucket into morning/afternoon/evening/late.
  const buckets = { morning: 0, afternoon: 0, evening: 0, late: 0 };
  hours.forEach((c, h) => {
    if (h >= 5 && h < 12) buckets.morning += c;
    else if (h >= 12 && h < 17) buckets.afternoon += c;
    else if (h >= 17 && h < 22) buckets.evening += c;
    else buckets.late += c;
  });
  return Object.entries(buckets).sort((a, b) => b[1] - a[1])[0][0];
}

// ---- Aggregate --------------------------------------------------------------
const byUser = new Map();
const byChannel = new Map();
const byTag = { bug: 0, question: 0, feedback: 0, help: 0, social: 0 };
const hourHist = new Array(24).fill(0);
const dowHist = new Array(7).fill(0);
let firstTs = Infinity;
let lastTs = 0;

for (const e of events) {
  firstTs = Math.min(firstTs, e.ts);
  lastTs = Math.max(lastTs, e.ts);
  const d = new Date(e.ts);
  hourHist[d.getHours()] += 1;
  dowHist[d.getDay()] += 1;
  byChannel.set(e.channelName ?? e.channelId, (byChannel.get(e.channelName ?? e.channelId) ?? 0) + 1);
  byTag[e.tag] = (byTag[e.tag] ?? 0) + 1;

  const id = e.authorId ?? e.authorTag ?? 'unknown';
  if (!byUser.has(id)) {
    byUser.set(id, {
      tag: e.authorTag ?? id,
      count: 0,
      words: 0,
      mix: { bug: 0, question: 0, feedback: 0, help: 0, social: 0 },
      hours: new Array(24).fill(0),
      first: e.ts,
      last: e.ts,
      questions: 0,
      bugs: 0,
    });
  }
  const u = byUser.get(id);
  u.count += 1;
  u.words += e.words ?? 0;
  u.mix[e.tag] = (u.mix[e.tag] ?? 0) + 1;
  u.hours[d.getHours()] += 1;
  u.first = Math.min(u.first, e.ts);
  u.last = Math.max(u.last, e.ts);
  if (e.isQuestion) u.questions += 1;
  if (e.mentionsBug) u.bugs += 1;
}

const memberCount = Object.values(members).filter((m) => m.present !== false && !m.isBot).length;
const activeAuthors = byUser.size;
const fmtDate = (ts) => (Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : 'n/a');
const bar = (n, max, width = 24) => '█'.repeat(Math.round((n / (max || 1)) * width)).padEnd(width, '·');

const topUsers = [...byUser.values()].sort((a, b) => b.count - a.count).slice(0, 15);
const topChannels = [...byChannel.entries()].sort((a, b) => b[1] - a[1]);
const peakHour = hourHist.indexOf(Math.max(...hourHist));
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Open questions/bugs worth a human reply (most recent, surfaced for heartbeat).
const openSignals = events
  .filter((e) => (e.tag === 'question' || e.tag === 'bug'))
  .sort((a, b) => b.ts - a.ts)
  .slice(0, 12);

// ---- Render -----------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
const scope = daysArg ? `last ${daysArg} days` : 'all-time';
const L = [];
L.push(`# Pure Rogue — Discord Engagement Report`);
L.push('');
L.push(`_Generated ${today} · scope: ${scope} · data: ${fmtDate(firstTs)} → ${fmtDate(lastTs)}_`);
L.push('');
L.push(`> Deterministic analytics from the passive collector. No generative content; every figure traces to a recorded message event.`);
L.push('');
L.push(`## Snapshot`);
L.push('');
L.push(`- **Members (present, non-bot):** ${memberCount || 'n/a (enable members intent + backfill)'}`);
L.push(`- **Active authors in scope:** ${activeAuthors}`);
L.push(`- **Messages in scope:** ${events.length}`);
L.push(`- **Participation rate:** ${memberCount ? Math.round((activeAuthors / memberCount) * 100) + '%' : 'n/a'} of members posted`);
L.push(`- **Peak activity:** ${String(peakHour).padStart(2, '0')}:00 local, busiest day ${DOW[dowHist.indexOf(Math.max(...dowHist))]}`);
L.push('');

L.push(`## Message mix`);
L.push('');
const tagMax = Math.max(...Object.values(byTag), 1);
for (const [t, n] of Object.entries(byTag).sort((a, b) => b[1] - a[1])) {
  L.push(`- \`${t.padEnd(8)}\` ${bar(n, tagMax)} ${n}`);
}
L.push('');

L.push(`## Most active members`);
L.push('');
L.push(`| # | Member | Msgs | Avg words | Persona | Active window | Bug/Q signals |`);
L.push(`|---|--------|------|-----------|---------|---------------|---------------|`);
topUsers.forEach((u, i) => {
  const persona = `${volumeTier(u.count)} · ${roleTag(u.mix)}`;
  const avg = u.count ? Math.round(u.words / u.count) : 0;
  L.push(`| ${i + 1} | ${u.tag} | ${u.count} | ${avg} | ${persona} | ${activeWindow(u.hours)} | ${u.bugs}b / ${u.questions}q |`);
});
L.push('');

L.push(`## Channels`);
L.push('');
const chMax = topChannels[0]?.[1] ?? 1;
for (const [name, n] of topChannels) {
  L.push(`- \`#${String(name).padEnd(16)}\` ${bar(n, chMax)} ${n}`);
}
L.push('');

L.push(`## Activity by hour (local)`);
L.push('');
const hMax = Math.max(...hourHist, 1);
L.push('```');
for (let h = 0; h < 24; h += 1) {
  L.push(`${String(h).padStart(2, '0')} ${bar(hourHist[h], hMax, 32)} ${hourHist[h]}`);
}
L.push('```');
L.push('');

L.push(`## Open questions & bug reports (surface for a human reply)`);
L.push('');
if (openSignals.length === 0) {
  L.push('_None in scope._');
} else {
  for (const e of openSignals) {
    const who = e.authorTag ?? 'someone';
    const when = fmtDate(e.ts);
    const snippet = (e.content ?? '(content not stored)').replace(/\s+/g, ' ').slice(0, 140);
    L.push(`- **[${e.tag}]** ${who} in #${e.channelName ?? '?'} (${when}): ${snippet}`);
  }
}
L.push('');
L.push(`---`);
L.push(`_Engagement fostering is a human call — this report identifies who and when; CeruleanOak voice decides the how. Bot stays invisible._`);

const out = L.join('\n');
console.log(out);

fs.mkdirSync(DRAFTS_DIR, { recursive: true });
const outPath = path.join(DRAFTS_DIR, `discord-report-${today}.md`);
fs.writeFileSync(outPath, out + '\n');
console.error(`\n[report] written to ${outPath}`);

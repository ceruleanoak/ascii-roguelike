// Normalizes a discord.js Message into a flat event and records it.
// Shared by live collection (bot.js) and historical backfill (backfill.js).

import { config, channelAllowed } from './config.js';
import { classifyMessage } from './classify.js';
import { recordMessage } from './store.js';

// Turn a Message into the stored event shape. Returns null if it should be skipped.
export function normalize(message) {
  const channelId = message.channelId ?? message.channel?.id;
  if (!channelId || !channelAllowed(channelId)) return null;

  const content = message.content ?? '';
  const { tag, hasLink, isQuestion, mentionsBug } = classifyMessage(content);

  const createdMs =
    message.createdTimestamp ??
    (message.createdAt ? message.createdAt.getTime() : Date.now());

  return {
    id: message.id,
    ts: createdMs,
    channelId,
    channelName: message.channel?.name ?? null,
    authorId: message.author?.id ?? null,
    authorTag: message.author?.username ?? message.author?.tag ?? null,
    isBot: Boolean(message.author?.bot),
    len: content.length,
    words: content ? content.trim().split(/\s+/).length : 0,
    tag,
    hasLink,
    isQuestion,
    mentionsBug,
    hasAttachment: (message.attachments?.size ?? 0) > 0,
    mentions: message.mentions?.users?.size ?? 0,
    isReply: Boolean(message.reference?.messageId),
    // Content stored only if configured. Bot messages never store content.
    content: config.storeContent && !message.author?.bot ? content : undefined,
  };
}

// Normalize + persist. Returns true if a new event was recorded.
export function collect(message) {
  const event = normalize(message);
  if (!event) return false;
  return recordMessage(event);
}

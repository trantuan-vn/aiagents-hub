/**
 * Multi-channel inbound hooks (OpenClaw-compatible).
 *
 * Telegram, Slack, and Discord bots POST to platform-specific webhook URLs.
 * Payloads are normalized to a workflow input string before runTrigger().
 *
 * OpenClaw gateway can forward channel messages to the same URLs by setting
 * a custom webhook target in the channel plugin config.
 */

export type ChannelType = 'telegram' | 'slack' | 'discord';

export interface ParsedChannelMessage {
  text: string;
  channel: ChannelType;
  senderId?: string;
  senderName?: string;
  raw?: unknown;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

/** Telegram Bot API update: message.text */
export function parseTelegramPayload(body: unknown): ParsedChannelMessage | null {
  const root = asRecord(body);
  if (!root) return null;
  const message = asRecord(root.message) ?? asRecord(root.edited_message);
  if (!message) return null;
  const text = String(message.text ?? message.caption ?? '').trim();
  if (!text) return null;
  const from = asRecord(message.from);
  return {
    text,
    channel: 'telegram',
    senderId: from?.id != null ? String(from.id) : undefined,
    senderName: from?.username ? `@${from.username}` : from?.first_name ? String(from.first_name) : undefined,
    raw: body,
  };
}

/** Slack Events API or slash-command payload */
export function parseSlackPayload(body: unknown): ParsedChannelMessage | null {
  const root = asRecord(body);
  if (!root) return null;

  // URL verification challenge — caller should respond with challenge, not run workflow
  if (root.type === 'url_verification') return null;

  const event = asRecord(root.event);
  if (event) {
    const text = String(event.text ?? '').trim();
    if (!text) return null;
    const user = String(event.user ?? event.user_id ?? '');
    return {
      text,
      channel: 'slack',
      senderId: user || undefined,
      senderName: user ? `slack:${user}` : undefined,
      raw: body,
    };
  }

  const text = String(root.text ?? root.command ?? '').trim();
  if (!text) return null;
  return {
    text,
    channel: 'slack',
    senderId: root.user_id != null ? String(root.user_id) : undefined,
    senderName: root.user_name != null ? String(root.user_name) : undefined,
    raw: body,
  };
}

/** Discord interaction or simple JSON { content } webhook */
export function parseDiscordPayload(body: unknown): ParsedChannelMessage | null {
  const root = asRecord(body);
  if (!root) return null;

  // PING from Discord — respond with type 1, do not run workflow
  if (root.type === 1) return null;

  const content = String(root.content ?? '').trim();
  if (content) {
    const author = asRecord(root.author);
    return {
      text: content,
      channel: 'discord',
      senderId: author?.id != null ? String(author.id) : undefined,
      senderName: author?.username != null ? String(author.username) : undefined,
      raw: body,
    };
  }

  const data = asRecord(root.data);
  if (data?.content) {
    return {
      text: String(data.content).trim(),
      channel: 'discord',
      raw: body,
    };
  }

  return null;
}

export function parseChannelPayload(channel: ChannelType, body: unknown): ParsedChannelMessage | null {
  switch (channel) {
    case 'telegram':
      return parseTelegramPayload(body);
    case 'slack':
      return parseSlackPayload(body);
    case 'discord':
      return parseDiscordPayload(body);
    default:
      return null;
  }
}

/** Serialize channel context as workflow trigger input (JSON string). */
export function formatChannelInput(msg: ParsedChannelMessage): string {
  return JSON.stringify({
    channel: msg.channel,
    text: msg.text,
    senderId: msg.senderId,
    senderName: msg.senderName,
  });
}

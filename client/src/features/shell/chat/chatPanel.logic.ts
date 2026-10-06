import { decodeLegacyChatEntities } from './chatDisplay';

/** Default body of `createRateLimiter` when chat send hits 429. */
export const CHAT_RATE_LIMIT_MESSAGE = 'Too many requests. Slow down.';

/** Body of `requireEmailVerified` when send is refused. */
export const CHAT_EMAIL_NOT_VERIFIED_MESSAGE = 'Confirme seu e-mail para usar este recurso.';

export type ChatSendResult = { ok?: boolean; message?: unknown };

export type ChatSendFeedback =
  | { kind: 'ok' }
  | { kind: 'rate_limited' }
  | { kind: 'email_not_verified' }
  | { kind: 'server'; text: string }
  | { kind: 'failed' };

export function classifyChatSendResult(result: ChatSendResult | null | undefined): ChatSendFeedback {
  if (result?.ok === true) return { kind: 'ok' };
  const text = typeof result?.message === 'string' ? result.message.trim() : '';
  if (!text) return { kind: 'failed' };
  if (text === CHAT_RATE_LIMIT_MESSAGE) return { kind: 'rate_limited' };
  if (text === CHAT_EMAIL_NOT_VERIFIED_MESSAGE || text === 'EMAIL_NOT_VERIFIED') return { kind: 'email_not_verified' };
  return { kind: 'server', text };
}

export type PublicChatRow = {
  id?: string | number;
  createdAt?: string | number | Date | null;
  username?: string | null;
  message?: unknown;
  user?: { name?: string | null; username?: string | null } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Keeps only the fields the public transcript renders. Drops ids, email and reply payloads. */
export function toPublicChatRow(value: unknown): PublicChatRow | null {
  if (!isRecord(value)) return null;
  const user = isRecord(value.user) ? value.user : null;
  return {
    id: typeof value.id === 'string' || typeof value.id === 'number' ? value.id : undefined,
    createdAt:
      typeof value.createdAt === 'string' || typeof value.createdAt === 'number' || value.createdAt instanceof Date
        ? value.createdAt
        : null,
    username: typeof value.username === 'string' ? value.username : null,
    message: value.message,
    user: user
      ? {
          name: typeof user.name === 'string' ? user.name : null,
          username: typeof user.username === 'string' ? user.username : null,
        }
      : null,
  };
}

export function publicChatDisplayName(row: PublicChatRow, fallback: string): string {
  const name = row.username || row.user?.username || row.user?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : fallback;
}

export function chatBodyText(message: unknown): string {
  return decodeLegacyChatEntities(typeof message === 'string' ? message : '');
}

export type PrivateConversationRow = {
  userId: number;
  username: string | null;
};

export function toPrivateConversation(value: unknown): PrivateConversationRow | null {
  if (!isRecord(value)) return null;
  const userId = typeof value.userId === 'number' ? value.userId : Number(value.userId);
  if (!Number.isInteger(userId) || userId < 1) return null;
  return {
    userId,
    username: typeof value.username === 'string' && value.username.trim() ? value.username.trim() : null,
  };
}

export type PrivateChatRow = {
  id?: string | number;
  createdAt?: string | number | Date | null;
  message?: unknown;
  senderId?: number;
};

export function toPrivateChatRow(value: unknown): PrivateChatRow | null {
  if (!isRecord(value)) return null;
  const senderId = typeof value.senderId === 'number' ? value.senderId : Number(value.senderId);
  return {
    id: typeof value.id === 'string' || typeof value.id === 'number' ? value.id : undefined,
    createdAt:
      typeof value.createdAt === 'string' || typeof value.createdAt === 'number' || value.createdAt instanceof Date
        ? value.createdAt
        : null,
    message: value.message,
    senderId: Number.isInteger(senderId) ? senderId : undefined,
  };
}

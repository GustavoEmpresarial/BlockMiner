import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Lock, MessageSquare, X } from 'lucide-react';
import IconBadge from '../../../shared/components/IconBadge';
import TabPills from '../../../shared/components/TabPills';
import { useAuthStore } from '../../../shared/auth/auth.store';
import { useGameStore } from '../lib/game.store';
import { buildChatTimeline, formatChatTime } from './chatDisplay';
import {
  chatBodyText,
  classifyChatSendResult,
  publicChatDisplayName,
  toPrivateChatRow,
  toPrivateConversation,
  toPublicChatRow,
  type ChatSendFeedback,
} from './chatPanel.logic';

type ChatTab = 'public' | 'private';

function feedbackText(feedback: ChatSendFeedback, t: (key: string) => string): string | null {
  if (feedback.kind === 'ok') return null;
  if (feedback.kind === 'rate_limited') return t('chat.rate_limited');
  if (feedback.kind === 'email_not_verified') return t('chat.email_not_verified');
  if (feedback.kind === 'server') return feedback.text;
  return t('chat.send_failed');
}

export default function ChatPanel() {
  const { t, i18n } = useTranslation();
  const isChatOpen = useGameStore((s) => s.isChatOpen);
  const closeChat = useGameStore((s) => s.closeChat);
  const messages = useGameStore((s) => s.messages);
  const privateMessages = useGameStore((s) => s.privateMessages);
  const conversations = useGameStore((s) => s.conversations);
  const unreadPms = useGameStore((s) => s.unreadPms);
  const fetchMessages = useGameStore((s) => s.fetchMessages);
  const fetchConversations = useGameStore((s) => s.fetchConversations);
  const searchChatUsers = useGameStore((s) => s.searchChatUsers);
  const chatUserHits = useGameStore((s) => s.chatUserHits);
  const fetchPrivateMessages = useGameStore((s) => s.fetchPrivateMessages);
  const sendMessage = useGameStore((s) => s.sendMessage);
  const sendPrivateMessage = useGameStore((s) => s.sendPrivateMessage);
  const setActivePrivateUser = useGameStore((s) => s.setActivePrivateUser);
  const clearActivePrivateUser = useGameStore((s) => s.clearActivePrivateUser);
  const clearUnreadPms = useGameStore((s) => s.clearUnreadPms);
  const selfId = useAuthStore((s) => s.user?.id);

  const panelRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<ChatTab>('public');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePeer, setActivePeer] = useState<{ userId: number; username: string | null } | null>(null);
  const [userQuery, setUserQuery] = useState('');

  useEffect(() => {
    if (!isChatOpen) return;
    void fetchMessages();
    void fetchConversations();
  }, [isChatOpen, fetchMessages, fetchConversations]);

  useEffect(() => {
    if (activePeer == null) return;
    clearUnreadPms();
  }, [activePeer, clearUnreadPms]);

  const dismiss = useCallback(() => {
    setError(null);
    setActivePeer(null);
    clearActivePrivateUser();
    closeChat();
  }, [clearActivePrivateUser, closeChat]);

  useEffect(() => {
    if (!isChatOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-chat-toggle]')) return;
      dismiss();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [isChatOpen, dismiss]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, privateMessages, tab, isChatOpen]);

  if (!isChatOpen || typeof document === 'undefined') return null;

  const locale = i18n.language || 'pt-BR';
  const dayLabels = { today: t('chat.today'), yesterday: t('chat.yesterday') };
  const publicRows = messages
    .map(toPublicChatRow)
    .filter((row): row is NonNullable<typeof row> => row != null);
  const publicTimeline = buildChatTimeline(publicRows, locale, dayLabels);
  const conversationRows = conversations
    .map(toPrivateConversation)
    .filter((row): row is NonNullable<typeof row> => row != null);
  const privateRows = privateMessages
    .map(toPrivateChatRow)
    .filter((row): row is NonNullable<typeof row> => row != null);
  const privateTimeline = buildChatTimeline(privateRows, locale, dayLabels);

  async function submitPublic() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const result = await sendMessage(text);
    setSending(false);
    const feedback = classifyChatSendResult(result);
    if (feedback.kind === 'ok') {
      setDraft('');
      void fetchMessages();
      return;
    }
    setError(feedbackText(feedback, t));
  }

  async function submitPrivate() {
    const text = draft.trim();
    if (!text || sending || !activePeer) return;
    setSending(true);
    setError(null);
    const result = await sendPrivateMessage(activePeer.userId, text);
    setSending(false);
    const feedback = classifyChatSendResult(result);
    if (feedback.kind === 'ok') {
      setDraft('');
      return;
    }
    setError(feedbackText(feedback, t));
  }

  function openConversation(row: { userId: number; username: string | null }) {
    setActivePeer(row);
    setError(null);
    setActivePrivateUser({ id: row.userId, username: row.username ?? undefined });
    void fetchPrivateMessages(row.userId);
  }

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t('chat.title')}
      className="fixed z-50 bottom-20 right-4 flex w-[min(24rem,calc(100vw-2rem))] max-h-[min(32rem,calc(100dvh-8rem))] flex-col overflow-hidden rounded-3xl border-2 border-slate-800 bg-slate-900 shadow-[4px_4px_0px_#000000] backdrop-blur-md md:bottom-6"
    >
      <div className="flex items-center gap-2.5 border-b border-slate-800 bg-slate-950/40 px-5 py-4">
        <IconBadge icon={MessageSquare} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-black uppercase tracking-widest text-white">{t('chat.title')}</p>
          {unreadPms > 0 ? (
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">{t('chat.unread', { n: unreadPms })}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label={t('chat.close')}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="border-b border-slate-800 px-4 py-3">
        <TabPills
          ariaLabel={t('chat.tabs')}
          activeTab={tab}
          onChange={(key) => {
            setTab(key === 'private' ? 'private' : 'public');
            setError(null);
          }}
          tabs={[
            { key: 'public', label: t('chat.public'), icon: MessageSquare },
            {
              key: 'private',
              label: t('chat.private'),
              icon: Lock,
              badge: unreadPms > 0 ? unreadPms : undefined,
            },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {tab === 'public' ? (
          publicTimeline.length === 0 ? (
            <p className="py-8 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('chat.empty_public')}</p>
          ) : (
            publicTimeline.map((item) =>
              item.kind === 'day' ? (
                <p key={item.key} className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {item.label}
                </p>
              ) : (
                <div key={item.key} className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {publicChatDisplayName(item.message, t('chat.unknown_user'))}
                    <span className="ml-2 font-medium normal-case tracking-normal text-slate-500">
                      {formatChatTime(item.message.createdAt, locale)}
                    </span>
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{chatBodyText(item.message.message)}</p>
                </div>
              ),
            )
          )
        ) : (
          <div className="space-y-3">
            <input
              value={userQuery}
              onChange={(event) => {
                const value = event.target.value;
                setUserQuery(value);
                searchChatUsers(value);
              }}
              placeholder={t('chat.search_users')}
              aria-label={t('chat.search_users')}
              className="w-full rounded-xl border-2 border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 outline-none focus:border-primary/50"
            />
            {chatUserHits.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {chatUserHits.map((hit) => (
                  <button
                    key={hit.id}
                    type="button"
                    onClick={() => {
                      openConversation({ userId: hit.id, username: hit.username });
                      setUserQuery('');
                      searchChatUsers('');
                    }}
                    className="rounded-xl border-2 border-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:border-slate-600 hover:text-white"
                  >
                    {hit.username}
                  </button>
                ))}
              </div>
            ) : null}
            {conversationRows.length === 0 ? (
              <p className="py-8 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('chat.empty_private')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {conversationRows.map((row) => (
                  <button
                    key={row.userId}
                    type="button"
                    onClick={() => openConversation(row)}
                    className={`rounded-xl border-2 px-3 py-2 text-xs font-bold ${
                      activePeer?.userId === row.userId
                        ? 'border-primary/25 bg-primary/10 text-primary'
                        : 'border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'
                    }`}
                  >
                    {row.username ?? t('chat.unknown_user')}
                  </button>
                ))}
              </div>
            )}
            {activePeer ? (
              privateTimeline.length === 0 ? null : (
                privateTimeline.map((item) =>
                  item.kind === 'day' ? (
                    <p key={item.key} className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {item.label}
                    </p>
                  ) : (
                    <div key={item.key}>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {item.message.senderId != null && item.message.senderId === selfId
                          ? t('chat.you')
                          : (activePeer.username ?? t('chat.unknown_user'))}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{chatBodyText(item.message.message)}</p>
                    </div>
                  ),
                )
              )
            ) : conversationRows.length > 0 ? (
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('chat.pick_conversation')}</p>
            ) : null}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error ? (
        <p role="alert" className="px-4 pb-1 text-xs font-bold text-amber-300">
          {error}
        </p>
      ) : null}

      <form
        className="flex items-center gap-2 border-t border-slate-800 bg-slate-950/40 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (tab === 'public') void submitPublic();
          else void submitPrivate();
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('chat.placeholder')}
          aria-label={t('chat.placeholder')}
          className="min-w-0 flex-1 rounded-xl border-2 border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 outline-none focus:border-primary/50"
        />
        <button
          type="submit"
          disabled={sending || draft.trim().length === 0 || (tab === 'private' && !activePeer)}
          className="shrink-0 rounded-xl border-2 border-primary/40 bg-primary px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-950 disabled:opacity-40"
        >
          {t('chat.send')}
        </button>
      </form>
    </div>
  );

  return createPortal(panel, document.body);
}

/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../i18n/locales/pt-BR.json';
import ChatPanel from './ChatPanel';
import { CHAT_EMAIL_NOT_VERIFIED_MESSAGE, CHAT_RATE_LIMIT_MESSAGE } from './chatPanel.logic';

const store = vi.hoisted(() => ({
  isChatOpen: false,
  messages: [] as unknown[],
  privateMessages: [] as unknown[],
  conversations: [] as unknown[],
  unreadPms: 0,
  hasMention: true,
  activePrivateUser: null as { id: number; username?: string } | null,
  closeChat: vi.fn(),
  fetchMessages: vi.fn(),
  fetchConversations: vi.fn(),
  searchChatUsers: vi.fn(),
  chatUserHits: [] as { id: number; username: string }[],
  fetchPrivateMessages: vi.fn(),
  sendMessage: vi.fn(),
  sendPrivateMessage: vi.fn(),
  setActivePrivateUser: vi.fn(),
  clearActivePrivateUser: vi.fn(),
  clearUnreadPms: vi.fn(),
  clearMention: vi.fn(),
}));

vi.mock('../lib/game.store', () => ({
  useGameStore: (selector: (state: typeof store) => unknown) => selector(store),
}));

vi.mock('../../../shared/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { id: number } }) => unknown) => selector({ user: { id: 7 } }),
}));

const i18n = i18next.createInstance();

function mount() {
  return render(
    <I18nextProvider i18n={i18n}>
      <ChatPanel />
    </I18nextProvider>,
  );
}

beforeAll(async () => {
  await i18n.init({
    lng: 'pt-BR',
    resources: { 'pt-BR': { translation: ptBR } },
    interpolation: { escapeValue: false },
  });
});

beforeEach(() => {
  store.isChatOpen = false;
  store.messages = [];
  store.privateMessages = [];
  store.conversations = [];
  store.unreadPms = 0;
  store.hasMention = true;
  store.activePrivateUser = null;
  store.closeChat.mockReset();
  store.fetchMessages.mockReset();
  store.fetchConversations.mockReset();
  store.searchChatUsers.mockReset();
  store.chatUserHits = [];
  store.fetchPrivateMessages.mockReset();
  store.sendMessage.mockReset();
  store.sendPrivateMessage.mockReset();
  store.setActivePrivateUser.mockReset();
  store.clearActivePrivateUser.mockReset();
  store.clearUnreadPms.mockReset();
  store.clearUnreadPms.mockImplementation(() => {
    store.unreadPms = 0;
  });
  store.clearMention.mockReset();
  store.sendMessage.mockResolvedValue({ ok: true, message: { id: 1, message: 'ok' } });
  store.sendPrivateMessage.mockResolvedValue({ ok: true, message: { id: 2 } });
});

afterEach(() => {
  cleanup();
});

describe('ChatPanel', () => {
  it('does not render when the chat is closed', () => {
    mount();
    expect(screen.queryByRole('dialog', { name: 'Chat' })).toBeNull();
    expect(store.clearMention).not.toHaveBeenCalled();
    expect(store.hasMention).toBe(true);
  });

  it('renders the public transcript as text when the chat is open', () => {
    store.isChatOpen = true;
    store.unreadPms = 2;
    store.messages = [
      {
        id: 9,
        userId: 42,
        email: 'secret@example.com',
        username: 'ada',
        message: '<img src=x onerror=alert(1)> &lt;3',
        createdAt: '2026-08-25T10:00:00.000Z',
        replyTo: { id: 1, username: 'hidden', message: 'quote' },
      },
    ];
    mount();
    const dialog = screen.getByRole('dialog', { name: 'Chat' });
    expect(dialog.parentElement).toBe(document.body);
    expect(screen.getByText('2 não lidas')).toBeInTheDocument();
    expect(screen.getByText('ada')).toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)> <3')).toBeInTheDocument();
    expect(dialog.querySelector('img')).toBeNull();
    expect(dialog.textContent).not.toContain('secret@example.com');
    expect(dialog.textContent).not.toContain('42');
    expect(dialog.textContent).not.toContain('quote');
    expect(store.clearMention).not.toHaveBeenCalled();
    expect(store.fetchMessages).toHaveBeenCalledTimes(1);
  });

  it('sends a public message once and refreshes the transcript', async () => {
    store.isChatOpen = true;
    mount();
    fireEvent.change(screen.getByLabelText('Escreva uma mensagem'), { target: { value: '  olá  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(store.sendMessage).toHaveBeenCalledTimes(1));
    expect(store.sendMessage).toHaveBeenCalledWith('olá');
    expect(store.fetchMessages).toHaveBeenCalledTimes(2);
  });

  it('shows the server error and does not send again', async () => {
    store.isChatOpen = true;
    store.sendMessage.mockResolvedValue({ ok: false, message: 'Message cannot be empty.' });
    mount();
    fireEvent.change(screen.getByLabelText('Escreva uma mensagem'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Message cannot be empty.');
    expect(store.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('shows a clear message for rate limit and unverified email', async () => {
    store.isChatOpen = true;
    store.sendMessage.mockResolvedValueOnce({ ok: false, message: CHAT_RATE_LIMIT_MESSAGE });
    mount();
    fireEvent.change(screen.getByLabelText('Escreva uma mensagem'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas mensagens');

    store.sendMessage.mockResolvedValueOnce({ ok: false, message: CHAT_EMAIL_NOT_VERIFIED_MESSAGE });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Confirme seu e-mail para enviar mensagens.');
    expect(store.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('closes on Escape and on an outside click, and ignores the chat toggle', () => {
    store.isChatOpen = true;
    mount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(store.closeChat).toHaveBeenCalledTimes(1);
    expect(store.clearActivePrivateUser).toHaveBeenCalledTimes(1);

    store.closeChat.mockClear();
    const toggle = document.createElement('button');
    toggle.setAttribute('data-chat-toggle', '');
    document.body.appendChild(toggle);
    fireEvent.mouseDown(toggle);
    expect(store.closeChat).not.toHaveBeenCalled();
    toggle.remove();

    fireEvent.mouseDown(document.body);
    expect(store.closeChat).toHaveBeenCalledTimes(1);
  });

  it('clears the unread private count when a conversation is selected', () => {
    store.isChatOpen = true;
    store.unreadPms = 3;
    store.conversations = [{ userId: 99, username: 'bea', lastMessageAt: '2026-08-25T10:00:00.000Z' }];
    const view = mount();
    expect(screen.getByText('3 não lidas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /privado/i }));
    expect(store.clearUnreadPms).not.toHaveBeenCalled();
    expect(store.unreadPms).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: 'bea' }));
    expect(store.clearUnreadPms).toHaveBeenCalledTimes(1);
    expect(store.unreadPms).toBe(0);
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <ChatPanel />
      </I18nextProvider>,
    );
    expect(screen.queryByText('3 não lidas')).toBeNull();
  });

  it('sends a private message to the selected conversation without showing the user id', async () => {
    store.isChatOpen = true;
    store.conversations = [{ userId: 99, username: 'bea', lastMessageAt: '2026-08-25T10:00:00.000Z', email: 'bea@example.com' }];
    store.privateMessages = [
      { id: 3, senderId: 99, receiverId: 7, message: 'oi', createdAt: '2026-08-25T10:00:00.000Z', email: 'bea@example.com' },
    ];
    mount();
    fireEvent.click(screen.getByRole('tab', { name: /privado/i }));
    const dialog = screen.getByRole('dialog', { name: 'Chat' });
    expect(dialog.textContent).not.toContain('99');
    expect(dialog.textContent).not.toContain('bea@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'bea' }));
    expect(store.setActivePrivateUser).toHaveBeenCalledWith({ id: 99, username: 'bea' });
    expect(store.fetchPrivateMessages).toHaveBeenCalledWith(99);
    expect(screen.getByText('oi')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Escreva uma mensagem'), { target: { value: 'resposta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(store.sendPrivateMessage).toHaveBeenCalledWith(99, 'resposta'));
  });

  it('shows user search when there are no conversations and opens the chosen person', () => {
    store.isChatOpen = true;
    store.conversations = [];
    store.chatUserHits = [{ id: 15, username: 'cleo' }];
    mount();
    fireEvent.click(screen.getByRole('tab', { name: /privado/i }));
    expect(screen.getByLabelText('Buscar usuário')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma conversa privada.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar usuário'), { target: { value: 'cl' } });
    expect(store.searchChatUsers).toHaveBeenCalledWith('cl');
    fireEvent.click(screen.getByRole('button', { name: 'cleo' }));
    expect(store.setActivePrivateUser).toHaveBeenCalledWith({ id: 15, username: 'cleo' });
    expect(store.fetchPrivateMessages).toHaveBeenCalledWith(15);
    expect(store.searchChatUsers).toHaveBeenCalledWith('');
  });
});

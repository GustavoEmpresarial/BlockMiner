import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MessageCircle,
  RefreshCw,
  Send,
  CheckCircle2,
  Clock,
  ChevronLeft,
  Loader2,
  ImageIcon,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { resolveApiErrorMessage } from '../../../shared/utils/apiErrorI18n';
import {
  getAdminPublicSupportTicket,
  listAdminPublicSupportTickets,
  replyAdminPublicSupportTicket,
  setAdminPublicSupportTicketStatus,
  uploadAdminSupportImage,
} from '../lib/admin.api';
import type { AdminPublicSupportMessage, AdminPublicSupportStatusFilter, AdminPublicSupportTicket } from '../lib/admin.types';
import {
  ADMIN_PUBLIC_SUPPORT_TICKETS_PAGE_SIZE,
  ADMIN_SUPPORT_ALLOWED_IMAGE_MIME,
  ADMIN_SUPPORT_UPLOAD_MAX_BYTES,
} from './support.constants';

const STATUS_FILTERS: AdminPublicSupportStatusFilter[] = ['all', 'open', 'closed'];

function isAllowedImageMime(type: string): boolean {
  return (ADMIN_SUPPORT_ALLOWED_IMAGE_MIME as readonly string[]).includes(type);
}

export default function AdminPublicSupportPage() {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<AdminPublicSupportTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<AdminPublicSupportStatusFilter>('all');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AdminPublicSupportTicket | null>(null);
  const [reply, setReply] = useState('');
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const [replyImagePreview, setReplyImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingTicket, setLoadingTicket] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAdminPublicSupportTickets({ status: filter, page });
      setTickets(res.data.tickets ?? []);
      setTotal(res.data.total ?? 0);
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, t('adminPublicSupport.load_error')));
    } finally {
      setLoading(false);
    }
  }, [filter, page, t]);

  useEffect(() => {
    void fetchTickets();
  }, [fetchTickets]);

  async function openTicket(id: number) {
    setLoadingTicket(true);
    try {
      const res = await getAdminPublicSupportTicket(id);
      setSelected(res.data.ticket);
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, t('adminPublicSupport.load_error')));
    } finally {
      setLoadingTicket(false);
    }
  }

  function pickImage(file: File | undefined | null) {
    if (!file) return;
    if (!isAllowedImageMime(file.type)) {
      toast.error(t('adminPublicSupport.action_error'));
      return;
    }
    if (file.size > ADMIN_SUPPORT_UPLOAD_MAX_BYTES) {
      toast.error(t('adminPublicSupport.action_error'));
      return;
    }
    setReplyImage(file);
    const reader = new FileReader();
    reader.onload = (e) => setReplyImagePreview(typeof e.target?.result === 'string' ? e.target.result : null);
    reader.readAsDataURL(file);
  }

  function clearImage() {
    setReplyImage(null);
    setReplyImagePreview(null);
    if (imageRef.current) imageRef.current.value = '';
  }

  async function uploadImage(file: File): Promise<string | null> {
    try {
      const res = await uploadAdminSupportImage(file);
      return res.data.url ?? null;
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, t('adminPublicSupport.action_error')));
      return null;
    }
  }

  async function sendReply(e: FormEvent) {
    e.preventDefault();
    if (!selected || (!reply.trim() && !replyImage)) return;
    setSending(true);
    try {
      let imageUrl: string | null = null;
      if (replyImage) imageUrl = await uploadImage(replyImage);
      const res = await replyAdminPublicSupportTicket(selected.id, {
        message: reply,
        imageUrl,
      });
      const msg: AdminPublicSupportMessage = res.data.message;
      setSelected((tk) => (tk ? { ...tk, messages: [...(tk.messages ?? []), msg] } : tk));
      setReply('');
      clearImage();
      toast.success(t('adminPublicSupport.sent'));
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, t('adminPublicSupport.action_error')));
    } finally {
      setSending(false);
    }
  }

  async function setStatus(status: 'open' | 'closed') {
    if (!selected) return;
    try {
      await setAdminPublicSupportTicketStatus(selected.id, status);
      setSelected((tk) => (tk ? { ...tk, status } : tk));
      setTickets((ts) => ts.map((tk) => (tk.id === selected.id ? { ...tk, status } : tk)));
      toast.success(t('adminPublicSupport.status_updated'));
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, t('adminPublicSupport.action_error')));
    }
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (selected) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="mb-4 flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" /> {t('adminPublicSupport.back')}
        </button>

        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-white">{selected.subject}</p>
              <p className="text-sm text-gray-400">
                {selected.guestName} &lt;{selected.guestEmail}&gt;
              </p>
              <p className="mt-1 text-xs text-gray-500">{fmtDate(selected.createdAt)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-1 text-xs ${
                  selected.status === 'open' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                }`}
              >
                {selected.status}
              </span>
              <button
                type="button"
                onClick={() => void setStatus(selected.status === 'open' ? 'closed' : 'open')}
                className="rounded-lg bg-white/10 px-3 py-1 text-xs text-white transition-colors hover:bg-white/20"
              >
                {selected.status === 'open' ? t('adminPublicSupport.close') : t('adminPublicSupport.reopen')}
              </button>
            </div>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3">
          {(selected.messages ?? []).map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
                m.authorType === 'admin'
                  ? 'ml-auto border border-blue-500/20 bg-blue-600/20 text-blue-100'
                  : 'border border-white/10 bg-white/5 text-gray-200'
              }`}
            >
              <p className="mb-1 text-xs text-gray-400">
                {m.authorType === 'admin' ? t('admin_support.label_team') : selected.guestName} · {fmtDate(m.createdAt)}
              </p>
              {m.content ? <p className="whitespace-pre-wrap">{m.content}</p> : null}
              {m.imageUrl ? (
                <a
                  href={m.imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block"
                  title={t('adminPublicSupport.image')}
                >
                  <img
                    src={m.imageUrl}
                    alt=""
                    className="max-h-48 max-w-full rounded-lg border border-white/10 object-contain"
                  />
                </a>
              ) : null}
            </div>
          ))}
        </div>

        {selected.status === 'open' ? (
          <form onSubmit={(e) => void sendReply(e)} className="flex flex-col gap-2">
            {replyImagePreview ? (
              <div className="relative w-fit">
                <img
                  src={replyImagePreview}
                  alt=""
                  className="max-h-32 rounded-lg border border-white/10 object-contain"
                />
                <button
                  type="button"
                  onClick={clearImage}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : null}
            <input
              ref={imageRef}
              type="file"
              accept={ADMIN_SUPPORT_ALLOWED_IMAGE_MIME.join(',')}
              className="hidden"
              onChange={(e) => pickImage(e.target.files?.[0])}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => imageRef.current?.click()}
                className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
                title={t('admin_support.add_images')}
              >
                <ImageIcon className="h-4 w-4" />
              </button>
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={t('adminPublicSupport.reply_placeholder')}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={sending || (!reply.trim() && !replyImage)}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-500 disabled:bg-blue-600/40"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? t('adminPublicSupport.sending') : t('adminPublicSupport.send')}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-gray-500">{t('adminPublicSupport.closed_hint')}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageCircle className="h-6 w-6 text-blue-400" />
          <div>
            <h1 className="text-xl font-bold text-white">{t('adminPublicSupport.title')}</h1>
            <p className="text-sm text-gray-400">{t('adminPublicSupport.subtitle')}</p>
          </div>
        </div>
        <button type="button" onClick={() => void fetchTickets()} className="text-gray-400 transition-colors hover:text-white">
          <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setFilter(s);
              setPage(1);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize transition-colors ${
              filter === s ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'
            }`}
          >
            {t(`adminPublicSupport.${s}`)}
          </button>
        ))}
        <span className="ml-auto self-center text-sm text-gray-400">
          {total} {t('adminPublicSupport.all').toLowerCase()}
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : null}

      {!loading && tickets.length === 0 ? (
        <p className="py-12 text-center text-gray-500">{t('adminPublicSupport.empty')}</p>
      ) : null}

      <div className="flex flex-col gap-2">
        {tickets.map((tk) => (
          <button
            key={tk.id}
            type="button"
            onClick={() => void openTicket(tk.id)}
            disabled={loadingTicket}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{tk.subject}</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {tk.guestName} · {tk.guestEmail}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    tk.status === 'open' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {tk.status === 'open' ? (
                    <CheckCircle2 className="mr-1 inline h-3 w-3" />
                  ) : (
                    <Clock className="mr-1 inline h-3 w-3" />
                  )}
                  {tk.status}
                </span>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">{fmtDate(tk.updatedAt)}</p>
          </button>
        ))}
      </div>

      {total > ADMIN_PUBLIC_SUPPORT_TICKETS_PAGE_SIZE ? (
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="text-sm text-gray-400 transition-colors hover:text-white disabled:opacity-40"
          >
            {t('adminPublicSupport.previous')}
          </button>
          <span className="text-sm text-gray-400">
            {page}
          </span>
          <button
            type="button"
            disabled={page * ADMIN_PUBLIC_SUPPORT_TICKETS_PAGE_SIZE >= total}
            onClick={() => setPage((p) => p + 1)}
            className="text-sm text-gray-400 transition-colors hover:text-white disabled:opacity-40"
          >
            {t('adminPublicSupport.next')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

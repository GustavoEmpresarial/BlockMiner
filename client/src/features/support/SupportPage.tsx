import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Headphones, Loader2, MessageSquarePlus, RefreshCw, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../shared/auth/auth.store';
import SupportAttachmentThumbnails from '../../shared/components/SupportAttachmentThumbnails';
import { useSupportTicketSocket } from './lib/useSupportTicketSocket';
import {
  createSupportTicket,
  getSupportTicket,
  listSupportTickets,
  replySupportTicket,
  uploadSupportImage,
} from './lib/support.api';

type TicketRow = { id: number; subject: string; isReplied?: boolean; createdAt?: string };
type ReplyRow = {
  id: number;
  message?: string;
  body?: string;
  isAdmin?: boolean;
  authorType?: string;
  createdAt?: string;
  attachments?: { url: string; mimeType?: string }[];
};
type TicketDetail = TicketRow & {
  body?: string;
  message?: string;
  attachments?: { url: string; mimeType?: string }[];
  replies?: ReplyRow[];
};

const PAGE_SIZE = 20;
const MAX_ATTACHMENTS = 5;

function isAdminReply(r: ReplyRow): boolean {
  return r.isAdmin === true || r.authorType === 'admin';
}

function replyText(r: ReplyRow): string {
  return r.body || r.message || '';
}

export default function SupportPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [createFiles, setCreateFiles] = useState<File[]>([]);

  const loadList = useCallback(
    async (p = 1, append = false) => {
      setListLoading(true);
      try {
        const res = await listSupportTickets({ page: p, limit: PAGE_SIZE });
        // Server contract: `{ messages, total }` (admin uses the same). Older builds used `tickets`.
        const data = res.data as {
          ok?: boolean;
          messages?: TicketRow[];
          tickets?: TicketRow[];
          total?: number;
        };
        if (data?.ok) {
          const rows = data.messages ?? data.tickets ?? [];
          setTickets((prev) => (append ? [...prev, ...rows] : rows));
          setTotal(data.total ?? 0);
          setPage(p);
        }
      } catch {
        toast.error(t('support_tickets.error_list'));
      } finally {
        setListLoading(false);
      }
    },
    [t],
  );

  const loadDetail = useCallback(
    async (id: number) => {
      setDetailLoading(true);
      try {
        const res = await getSupportTicket(id);
        const data = res.data as { ok?: boolean; message?: TicketDetail; ticket?: TicketDetail };
        const thread = data?.message ?? data?.ticket;
        if (data?.ok && thread) setDetail(thread);
        else toast.error(t('support_tickets.error_thread'));
      } catch {
        toast.error(t('support_tickets.error_thread'));
      } finally {
        setDetailLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadList(1, false);
  }, [loadList]);

  useEffect(() => {
    if (selectedId != null) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  useSupportTicketSocket(selectedId, (payload) => {
    const p = payload as ReplyRow;
    setDetail((prev) => (prev ? { ...prev, replies: [...(prev.replies ?? []), p] } : prev));
  });

  const uploadFiles = async (files: File[]) => {
    const out: { url: string; mimeType?: string }[] = [];
    for (const file of files.slice(0, MAX_ATTACHMENTS)) {
      const fd = new FormData();
      fd.append('image', file);
      const res = await uploadSupportImage(fd);
      const data = res.data as { ok?: boolean; url?: string };
      if (data?.ok && data.url) out.push({ url: data.url, mimeType: file.type });
    }
    return out;
  };

  const onPickFiles = (e: ChangeEvent<HTMLInputElement>, setter: (f: File[]) => void, current: File[]) => {
    const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
    setter([...current, ...picked].slice(0, MAX_ATTACHMENTS));
    e.target.value = '';
  };

  const submitCreate = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error(t('support_tickets.validation_required'));
      return;
    }
    if (!user?.name || !user?.email) {
      toast.error(t('support_tickets.validation_profile'));
      return;
    }
    setSending(true);
    try {
      const attachments = createFiles.length ? await uploadFiles(createFiles) : [];
      const res = await createSupportTicket({
        subject: subject.trim(),
        message: message.trim(),
        name: user.name,
        email: user.email,
        attachments,
      });
      const data = res.data as { ok?: boolean; id?: number };
      if (data?.ok) {
        toast.success(t('support_tickets.created'));
        setModalOpen(false);
        setSubject('');
        setMessage('');
        setCreateFiles([]);
        await loadList(1, false);
        if (data.id) setSelectedId(data.id);
      }
    } catch {
      toast.error(t('support_tickets.error_create'));
    } finally {
      setSending(false);
    }
  };

  const submitReply = async () => {
    if (!selectedId || (!reply.trim() && replyFiles.length === 0)) return;
    setSending(true);
    try {
      const attachments = replyFiles.length ? await uploadFiles(replyFiles) : [];
      await replySupportTicket(selectedId, {
        message: reply.trim() || t('support_tickets.reply_image_only'),
        attachments,
      });
      toast.success(t('support_tickets.reply_sent'));
      setReply('');
      setReplyFiles([]);
      await loadDetail(selectedId);
    } catch {
      toast.error(t('support_tickets.error_reply'));
    } finally {
      setSending(false);
    }
  };

  const hasMore = page * PAGE_SIZE < total;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <Headphones className="w-8 h-8 text-primary" />
            {t('support_tickets.title')}
          </h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">{t('support_tickets.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadList(page)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-bold uppercase tracking-wider hover:border-primary/40"
          >
            <RefreshCw className={`w-4 h-4 ${listLoading ? 'animate-spin' : ''}`} />
            {t('support_tickets.refresh')}
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-slate-950 text-xs font-black uppercase tracking-wider hover:opacity-90"
          >
            <MessageSquarePlus className="w-4 h-4" />
            {t('support_tickets.new_ticket')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[480px]">
        <div className="lg:col-span-4 flex flex-col rounded-2xl border border-slate-800 bg-slate-950/50 overflow-hidden">
          <div className="p-3 border-b border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-500">
            {t('support_tickets.list_heading')}
          </div>
          <div className="flex-1 overflow-y-auto">
            {listLoading && tickets.length === 0 ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
              </div>
            ) : tickets.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">{t('support_tickets.empty_list')}</p>
            ) : (
              tickets.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-800/80 hover:bg-slate-900/80 ${
                    selectedId === row.id ? 'bg-slate-900 border-l-2 border-l-primary' : ''
                  }`}
                >
                  <p className="text-sm font-bold text-white truncate">{row.subject}</p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {row.isReplied ? t('support_tickets.status_replied') : t('support_tickets.status_open')}
                  </p>
                </button>
              ))
            )}
          </div>
          {hasMore ? (
            <button
              type="button"
              onClick={() => void loadList(page + 1, true)}
              className="p-3 text-xs font-bold text-primary border-t border-slate-800 hover:bg-slate-900"
            >
              {t('support_tickets.load_more')}
            </button>
          ) : null}
        </div>

        <div className="lg:col-span-8 flex flex-col rounded-2xl border border-slate-800 bg-slate-950/50 overflow-hidden min-h-[320px]">
          {!selectedId ? (
            <p className="m-auto text-slate-500 text-sm p-8 text-center">{t('support_tickets.select_prompt')}</p>
          ) : detailLoading && !detail ? (
            <div className="flex justify-center py-24">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : detail ? (
            <>
              <div className="p-4 border-b border-slate-800">
                <p className="text-lg font-black text-white">{t('support_tickets.protocol', { id: detail.id })}</p>
                <p className="text-sm text-slate-400 mt-1">{detail.subject}</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {(detail.body || detail.message || detail.attachments?.length) ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm">
                    <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">
                      {t('support_tickets.you')}
                    </p>
                    {detail.body || detail.message ? (
                      <p className="whitespace-pre-wrap text-slate-200">{detail.body || detail.message}</p>
                    ) : null}
                    {detail.attachments?.length ? (
                      <SupportAttachmentThumbnails attachments={detail.attachments} variant="compact" />
                    ) : null}
                  </div>
                ) : null}
                {(detail.replies ?? []).map((r) => {
                  const fromTeam = isAdminReply(r);
                  return (
                    <div
                      key={r.id}
                      className={`rounded-xl p-3 text-sm ${
                        fromTeam
                          ? 'border border-primary/20 bg-primary/10'
                          : 'border border-slate-800 bg-slate-900'
                      }`}
                    >
                      <p className="mb-1 text-[10px] font-bold uppercase text-slate-500">
                        {fromTeam ? t('support_tickets.team') : t('support_tickets.you')}
                      </p>
                      <p className="whitespace-pre-wrap text-slate-200">{replyText(r)}</p>
                      {r.attachments?.length ? (
                        <SupportAttachmentThumbnails attachments={r.attachments} variant="compact" />
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="p-4 border-t border-slate-800 space-y-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={t('support_tickets.reply_placeholder')}
                  className="w-full min-h-[80px] rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-white"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-bold text-slate-400 cursor-pointer">
                    {t('support_tickets.add_images')}
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPickFiles(e, setReplyFiles, replyFiles)} />
                  </label>
                  {replyFiles.map((f, i) => (
                    <span key={f.name} className="text-[10px] text-slate-500 flex items-center gap-1">
                      {f.name}
                      <button type="button" aria-label={t('support_tickets.remove_file')} onClick={() => setReplyFiles((p) => p.filter((_, j) => j !== i))}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void submitReply()}
                    className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-slate-950 text-xs font-black uppercase"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {t('support_tickets.send')}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-white">{t('support_tickets.modal_title')}</h2>
              <button type="button" onClick={() => setModalOpen(false)} aria-label={t('support_tickets.close')}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('support_tickets.field_subject')}
              className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-white"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('support_tickets.field_message')}
              className="w-full min-h-[120px] rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-white"
            />
            <input type="file" accept="image/*" multiple onChange={(e) => onPickFiles(e, setCreateFiles, createFiles)} />
            <button
              type="button"
              disabled={sending}
              onClick={() => void submitCreate()}
              className="w-full py-3 rounded-xl bg-primary text-slate-950 font-black text-sm uppercase"
            >
              {sending ? t('support_tickets.submitting') : t('support_tickets.submit')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

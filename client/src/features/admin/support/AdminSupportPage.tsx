import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ChangeEvent,
  type MouseEvent,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { io, type Socket } from "socket.io-client";
import {
  Search,
  Clock,
  User,
  Mail,
  Send,
  Inbox,
  RefreshCw,
  Loader2,
  ImagePlus,
  X,
  ChevronDown,
  ChevronUp,
  Fingerprint,
  Wallet,
  CheckCircle2,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Copy,
  Check,
  ShieldCheck,
  Archive,
  MessageSquare,
  Sparkles,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import SupportAttachmentThumbnails from "../../../shared/components/SupportAttachmentThumbnails";
import PlayerDossier from "./components/PlayerDossier";
import CreditPolModal from "./components/CreditPolModal";
import { adminSupportApi } from "./adminSupport.api";
import {
  isAdminSupportPlayerDossierBundle,
  type AdminSupportAttachment,
  type AdminSupportInboxMessage,
  type AdminSupportListFilter,
  type AdminSupportMessageDetail,
  type AdminSupportPlayerDossierBundle,
  type AdminSupportPlayerDossierParams,
  type AdminSupportReplyEntry,
  type AdminSupportSocketReplyPayload,
  type AdminSupportStats,
  type AdminSupportSubscribeAck,
} from "./adminSupport.types";
import { ADMIN_SUPPORT_REPLY_MAX_ATTACHMENTS } from "./support.constants";

function defaultDossierParams(): AdminSupportPlayerDossierParams {
  return {
    limit: 30,
    depositsPage: 1,
    ccpaymentPage: 1,
    withdrawalsPage: 1,
    payoutsPage: 1,
    minersPage: 1,
    inventoryPage: 1,
    vaultPage: 1,
  };
}

function mergeReplyUnique(
  replies: AdminSupportReplyEntry[] | undefined,
  incoming: AdminSupportReplyEntry | null | undefined
): AdminSupportReplyEntry[] {
  const base = replies ?? [];
  if (!incoming?.id) return base;
  if (base.some((r) => r.id === incoming.id)) return base;
  return [...base, incoming];
}

function formatRelativeTime(dateStr: string | Date | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return "Agora";
  if (diffMin < 60) return `Há ${diffMin}m`;
  if (diffHours < 24) return `Há ${diffHours}h`;
  if (diffDays === 1) return "Ontem";
  if (diffDays < 7) return `Há ${diffDays}d`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function AdminSupportPage() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<AdminSupportInboxMessage[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminSupportStats>({
    total: 0,
    pending: 0,
    unread: 0,
    open: 0,
    archived: 0,
  });

  const [selectedMessage, setSelectedMessage] = useState<AdminSupportMessageDetail | null>(null);
  const [reply, setReply] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [sendingReply, setSendingReply] = useState(false);
  const [closeOnReply, setCloseOnReply] = useState(false);
  const [closingTicket, setClosingTicket] = useState(false);
  const [cleaningRetention, setCleaningRetention] = useState(false);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AdminSupportListFilter>("all");
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [dossierBundle, setDossierBundle] = useState<AdminSupportPlayerDossierBundle | null>(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossierError, setDossierError] = useState(false);
  const [dossierParams, setDossierParams] = useState<AdminSupportPlayerDossierParams>(() => defaultDossierParams());
  const [dossierOpen, setDossierOpen] = useState(false);
  const [creditPolOpen, setCreditPolOpen] = useState(false);
  const [copiedProtocol, setCopiedProtocol] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const selectedIdRef = useRef<number | null>(null);
  selectedIdRef.current = selectedMessage?.id ?? null;
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const fetchMessages = useCallback(
    async (p = 1, append = false) => {
      try {
        setLoading(true);
        const res = await adminSupportApi.listMessages({
          page: p,
          limit,
          status: filter !== "all" ? filter : undefined,
        });
        if (res.data.ok) {
          const rows = res.data.messages ?? [];
          setMessages((prev) => (append ? [...prev, ...rows] : rows));
          setTotal(res.data.total ?? 0);
          setPage(res.data.page ?? p);
          if (res.data.stats) {
            setStats(res.data.stats);
          }
        }
      } catch {
        toast.error("Erro ao carregar lista de chamados de suporte.");
      } finally {
        setLoading(false);
      }
    },
    [limit, filter]
  );

  useEffect(() => {
    void fetchMessages(1, false);
  }, [fetchMessages]);

  useEffect(() => {
    if (!selectedMessage?.id) {
      setDossierBundle(null);
      setDossierError(false);
      setDossierLoading(false);
      return;
    }
    if (!dossierOpen) return;
    const ticketId = selectedMessage.id;
    let cancelled = false;
    const run = async () => {
      setDossierLoading(true);
      setDossierError(false);
      try {
        const res = await adminSupportApi.getDossier(ticketId, dossierParams);
        if (cancelled) return;
        if (isAdminSupportPlayerDossierBundle(res.data)) {
          setDossierBundle(res.data);
          setDossierError(false);
        } else {
          setDossierError(true);
        }
      } catch {
        if (!cancelled) setDossierError(true);
      } finally {
        if (!cancelled) setDossierLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedMessage?.id, dossierParams, dossierOpen]);

  const selectMessage = async (msg: AdminSupportInboxMessage) => {
    setLoadingDetails(true);
    setReply("");
    setReplyFiles([]);
    setCloseOnReply(false);
    setDossierOpen(false);
    setDossierBundle(null);
    try {
      const res = await adminSupportApi.getMessage(msg.id);
      if (res.data.ok && res.data.message) {
        setSelectedMessage(res.data.message);
        setDossierParams(defaultDossierParams());
        if (!msg.isRead) {
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, isRead: true } : m)));
          setStats((prev) => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
        }
      }
    } catch {
      toast.error("Erro ao abrir detalhes do chamado.");
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleDossierParamsChange = useCallback((patch: Partial<AdminSupportPlayerDossierParams>) => {
    setDossierParams((prev: AdminSupportPlayerDossierParams) => ({ ...prev, ...patch }));
  }, []);

  const handleToggleArchive = async () => {
    if (!selectedMessage) return;
    const nextArchived = !selectedMessage.archived;
    setClosingTicket(true);
    try {
      const res = await adminSupportApi.setArchived(selectedMessage.id, nextArchived);
      if (res.data.ok) {
        toast.success(nextArchived ? "Ticket encerrado com sucesso!" : "Ticket reaberto com sucesso!");
        setSelectedMessage((prev) => (prev ? { ...prev, archived: nextArchived } : null));
        setMessages((prev) =>
          prev.map((m) => (m.id === selectedMessage.id ? { ...m, archived: nextArchived } : m))
        );
        void fetchMessages(page, false);
      }
    } catch {
      toast.error("Falha ao alterar estado de arquivamento do ticket.");
    } finally {
      setClosingTicket(false);
    }
  };

  const handleCleanupRetention = async () => {
    if (!window.confirm("Atenção: deseja limpar permanentemente todos os tickets inativos há mais de 30 dias?")) {
      return;
    }
    setCleaningRetention(true);
    try {
      const res = await adminSupportApi.cleanupRetention();
      if (res.data.ok) {
        const removed = res.data.support + res.data.publicSupport;
        toast.success(`${removed} tickets com mais de 30 dias foram apagados com sucesso!`);
        void fetchMessages(1, false);
      }
    } catch {
      toast.error("Erro ao executar limpeza de retenção.");
    } finally {
      setCleaningRetention(false);
    }
  };

  // Socket.IO real-time ticket room subscription
  useEffect(() => {
    if (!selectedMessage?.id) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const ticketId = selectedMessage.id;
    const socketOrigin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://blockminer.space";

    const s = io(socketOrigin, {
      path: "/socket.io/",
      transports: ["websocket", "polling"],
      withCredentials: true,
    });
    socketRef.current = s;

    s.on("connect", () => {
      s.emit(
        "support:subscribeAdmin",
        { supportMessageId: ticketId },
        (ack?: AdminSupportSubscribeAck) => {
          if (ack && ack.ok === false) {
            toast.error(ack.message || "Erro no canal de tempo real.");
          }
        }
      );
    });

    const onSocketReply = (payload: AdminSupportSocketReplyPayload) => {
      if (!payload || Number(payload.supportMessageId) !== selectedIdRef.current) return;
      if (payload.reply) {
        setSelectedMessage((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            replies: mergeReplyUnique(prev.replies, payload.reply),
          };
        });
      }
    };

    s.on("support:reply", onSocketReply);

    return () => {
      s.off("support:reply", onSocketReply);
      s.disconnect();
      if (socketRef.current === s) socketRef.current = null;
    };
  }, [selectedMessage?.id]);

  const uploadAdminImages = async (files: File[]): Promise<AdminSupportAttachment[]> => {
    const urls: AdminSupportAttachment[] = [];
    for (const file of files) {
      const res = await adminSupportApi.uploadImage(file);
      if (res.data?.ok && res.data.url) {
        urls.push({ url: res.data.url, mimeType: res.data.mimeType || file.type });
      }
    }
    return urls;
  };

  const handleReply = async () => {
    if (!selectedMessage) return;
    if (!reply.trim() && replyFiles.length === 0) {
      toast.error("Digite uma mensagem ou anexe uma imagem para responder.");
      return;
    }
    setSendingReply(true);
    try {
      let attachments: AdminSupportAttachment[] = [];
      if (replyFiles.length) {
        attachments = await uploadAdminImages(replyFiles);
      }
      const res = await adminSupportApi.reply(selectedMessage.id, {
        reply: reply.trim() || "[Anexo de imagem enviado]",
        attachments,
        closeTicket: closeOnReply,
      });
      if (res.data.ok) {
        toast.success(closeOnReply ? "Resposta enviada e ticket encerrado!" : "Resposta enviada com sucesso!");
        const detailsRes = await adminSupportApi.getMessage(selectedMessage.id);
        if (detailsRes.data.ok && detailsRes.data.message) {
          const updatedFull = detailsRes.data.message;
          setSelectedMessage(updatedFull);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updatedFull.id
                ? {
                    ...m,
                    isReplied: true,
                    archived: closeOnReply ? true : m.archived,
                    isAwaitingReply: false,
                  }
                : m
            )
          );
        }
        setReply("");
        setReplyFiles([]);
        setCloseOnReply(false);
        void fetchMessages(page, false);
      }
    } catch {
      toast.error("Erro ao enviar resposta ao chamado.");
    } finally {
      setSendingReply(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleReply();
    }
  };

  const filteredMessages = messages.filter((msg) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (msg.subject || "").toLowerCase().includes(q) ||
      (msg.name || "").toLowerCase().includes(q) ||
      (msg.email || "").toLowerCase().includes(q) ||
      (msg.user?.username || "").toLowerCase().includes(q) ||
      String(msg.id).includes(q)
    );
  });

  const copyProtocol = (id: number) => {
    void navigator.clipboard.writeText(String(id));
    setCopiedProtocol(true);
    toast.success(`Protocolo #${id} copiado para a área de transferência!`);
    setTimeout(() => setCopiedProtocol(false), 2000);
  };

  const hasMore = messages.length < total;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-5 animate-in fade-in duration-300">
      {/* ─── Top Header & Title ────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Inbox className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
                Central de Suporte Administrativo
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Retenção 30d
                </span>
              </h1>
              <p className="text-slate-400 text-xs mt-0.5">
                Gerenciamento de tickets, histórico de atendimento, dossiê do jogador e compensações em POL.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleCleanupRetention}
            disabled={cleaningRetention}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 text-xs font-bold transition-all shadow-sm disabled:opacity-50"
            title="Apagar tickets inativos com mais de 30 dias"
          >
            {cleaningRetention ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            <span>Limpar &gt;30 dias</span>
          </button>

          <button
            type="button"
            onClick={() => void fetchMessages(1, false)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* ─── Modern KPI Summary Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 shrink-0">
        <button
          type="button"
          onClick={() => setFilter("pending")}
          className={`flex items-center justify-between p-4 rounded-2xl border text-left transition-all ${
            filter === "pending"
              ? "bg-amber-500/15 border-amber-500/60 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/30"
              : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" />
              Aguardando Resposta
            </div>
            <div className="text-2xl font-black text-white mt-1">{stats.pending}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">Usuários esperando resposta</p>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilter("unread")}
          className={`flex items-center justify-between p-4 rounded-2xl border text-left transition-all ${
            filter === "unread"
              ? "bg-sky-500/15 border-sky-500/60 shadow-lg shadow-sky-500/10 ring-1 ring-sky-500/30"
              : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div>
            <div className="text-sky-400 text-xs font-bold uppercase tracking-wider">Não Lidos</div>
            <div className="text-2xl font-black text-white mt-1">{stats.unread}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">Mensagens não abertas</p>
          </div>
          <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <Mail className="w-5 h-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilter("replied")}
          className={`flex items-center justify-between p-4 rounded-2xl border text-left transition-all ${
            filter === "replied"
              ? "bg-emerald-500/15 border-emerald-500/60 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/30"
              : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div>
            <div className="text-emerald-400 text-xs font-bold uppercase tracking-wider">Respondidos</div>
            <div className="text-2xl font-black text-white mt-1">{stats.open - stats.pending}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">Atendidos pela equipe</p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilter("archived")}
          className={`flex items-center justify-between p-4 rounded-2xl border text-left transition-all ${
            filter === "archived"
              ? "bg-slate-700/20 border-slate-600 shadow-lg ring-1 ring-slate-500/30"
              : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div>
            <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">Fechados</div>
            <div className="text-2xl font-black text-white mt-1">{stats.archived}</div>
            <p className="text-[11px] text-slate-400 mt-0.5">Tickets resolvidos</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-400">
            <Archive className="w-5 h-5" />
          </div>
        </button>
      </div>

      {/* ─── Main Content Split Pane ────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-5 flex-1 min-h-0 h-[calc(100dvh-17.5rem)]">
        {/* ── Left Column: Ticket List ── */}
        <div className="flex flex-col min-h-0 rounded-2xl border border-slate-800 bg-slate-950/60 backdrop-blur-md overflow-hidden">
          {/* Search & Filter Bar */}
          <div className="p-3.5 border-b border-slate-800 space-y-2.5 shrink-0 bg-slate-900/40">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por protocolo, nome, e-mail..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pl-9 pr-8 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 transition-colors"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap ${
                  filter === "all"
                    ? "bg-amber-500 text-slate-950"
                    : "bg-slate-800/80 text-slate-400 hover:text-white"
                }`}
              >
                Todos ({stats.open + stats.archived})
              </button>
              <button
                type="button"
                onClick={() => setFilter("pending")}
                className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all whitespace-nowrap ${
                  filter === "pending"
                    ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                Pendentes ({stats.pending})
              </button>
              <button
                type="button"
                onClick={() => setFilter("unread")}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap ${
                  filter === "unread"
                    ? "bg-sky-500 text-slate-950"
                    : "bg-slate-800/80 text-slate-400 hover:text-white"
                }`}
              >
                Não Lidos ({stats.unread})
              </button>
              <button
                type="button"
                onClick={() => setFilter("replied")}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap ${
                  filter === "replied"
                    ? "bg-emerald-500 text-slate-950"
                    : "bg-slate-800/80 text-slate-400 hover:text-white"
                }`}
              >
                Respondidos
              </button>
              <button
                type="button"
                onClick={() => setFilter("archived")}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap ${
                  filter === "archived"
                    ? "bg-slate-600 text-white"
                    : "bg-slate-800/80 text-slate-400 hover:text-white"
                }`}
              >
                Fechados ({stats.archived})
              </button>
            </div>
          </div>

          {/* Ticket list scroll area */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2 scrollbar-thin scrollbar-thumb-slate-800">
            {loading && messages.length === 0 ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="h-20 bg-slate-900/60 rounded-xl animate-pulse border border-slate-800/50" />
              ))
            ) : filteredMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
                <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs font-bold">Nenhum chamado encontrado</p>
                <p className="text-[11px] mt-0.5">Tente ajustar seus filtros ou termo de busca.</p>
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const isSelected = selectedMessage?.id === msg.id;
                const isPending = !msg.isReplied && !msg.archived;
                const isClosed = Boolean(msg.archived);

                return (
                  <button
                    key={msg.id}
                    type="button"
                    onClick={() => void selectMessage(msg)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all relative ${
                      isSelected
                        ? "bg-amber-500/15 border-amber-500/60 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/30"
                        : isPending
                        ? "bg-amber-500/5 border-amber-500/40 hover:border-amber-500/70 hover:bg-amber-500/10"
                        : isClosed
                        ? "bg-slate-950/40 border-slate-900 hover:border-slate-800 opacity-60"
                        : "bg-slate-900/40 border-slate-800/70 hover:border-slate-700"
                    }`}
                  >
                    {/* Header line: Protocol, Badges, Relative Time */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          #{msg.id}
                        </span>

                        {isPending ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            Aguardando Resposta
                          </span>
                        ) : isClosed ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                            Fechado
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Respondido
                          </span>
                        )}

                        {!msg.isRead && (
                          <span className="w-2 h-2 rounded-full bg-sky-400 shadow-sm shadow-sky-400/50" title="Não lido" />
                        )}
                      </div>

                      <span className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {formatRelativeTime(msg.lastActivityAt || msg.createdAt)}
                      </span>
                    </div>

                    {/* Subject */}
                    <h3 className="text-white font-bold text-xs truncate leading-snug">
                      {msg.subject || "(Sem assunto)"}
                    </h3>

                    {/* User info & Last snippet */}
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="truncate font-medium flex items-center gap-1">
                        <User className="w-3 h-3 text-slate-500" />
                        {msg.user?.username ? `@${msg.user.username}` : msg.name}
                      </span>

                      {msg.message && (
                        <span className="truncate max-w-[140px] text-[10px] text-slate-500 italic">
                          "{msg.message.slice(0, 30)}..."
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}

            {hasMore && (
              <button
                type="button"
                className="w-full text-center py-2.5 text-xs font-bold text-amber-400 hover:text-amber-300 bg-slate-900/50 hover:bg-slate-900 border border-slate-800 rounded-xl transition-all"
                onClick={() => void fetchMessages(page + 1, true)}
              >
                Carregar mais chamados...
              </button>
            )}
          </div>
        </div>

        {/* ── Right Column: Active Ticket Thread ── */}
        <div className="flex flex-col min-h-0 rounded-2xl border border-slate-800 bg-slate-950/60 backdrop-blur-md overflow-hidden">
          {loadingDetails ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin mb-3" />
              <p className="text-xs font-bold">Carregando detalhes do chamado...</p>
            </div>
          ) : selectedMessage ? (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Ticket View Header */}
              <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/40 shrink-0 space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <button
                        type="button"
                        onClick={() => copyProtocol(selectedMessage.id)}
                        className="font-mono text-xs font-black px-2 py-0.5 rounded bg-slate-800 text-amber-400 hover:bg-slate-700 flex items-center gap-1.5 transition-colors"
                        title="Clique para copiar o protocolo"
                      >
                        {copiedProtocol ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        #{selectedMessage.id}
                      </button>

                      {selectedMessage.archived ? (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                          Ticket Fechado
                        </span>
                      ) : !selectedMessage.isReplied ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          Aguardando Resposta do Suporte
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          Respondido
                        </span>
                      )}

                      <span className="text-xs text-slate-500 ml-1">
                        {new Date(selectedMessage.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <h2 className="text-xl font-black text-white tracking-tight">{selectedMessage.subject}</h2>

                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-400">
                      <span className="flex items-center gap-1.5 font-bold text-slate-300">
                        <User className="w-3.5 h-3.5 text-amber-400" />
                        {selectedMessage.name}
                        {selectedMessage.user?.username && (
                          <span className="text-slate-500 font-normal">(@{selectedMessage.user.username})</span>
                        )}
                      </span>
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Mail className="w-3.5 h-3.5 text-slate-500" />
                        {selectedMessage.email}
                      </span>
                    </div>
                  </div>

                  {/* Actions Header Bar */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleToggleArchive}
                      disabled={closingTicket}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                        selectedMessage.archived
                          ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                      }`}
                    >
                      {closingTicket ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : selectedMessage.archived ? (
                        <RotateCcw className="w-3.5 h-3.5" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                      <span>{selectedMessage.archived ? "Reabrir Ticket" : "Fechar Ticket"}</span>
                    </button>

                    {selectedMessage.userId && (
                      <button
                        type="button"
                        onClick={() => setCreditPolOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-all shadow-sm"
                      >
                        <Wallet className="w-3.5 h-3.5" />
                        <span>Creditar POL</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setDossierOpen((v) => !v)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                        dossierOpen
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                          : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                      }`}
                    >
                      <Fingerprint className="w-3.5 h-3.5" />
                      <span>{dossierOpen ? "Ocultar Dossiê" : "Ver Dossiê"}</span>
                    </button>
                  </div>
                </div>

                {/* Collapsible Player Dossier Box */}
                {dossierOpen && (
                  <div className="pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <PlayerDossier
                      bundle={dossierBundle}
                      loading={dossierLoading}
                      error={dossierError}
                      params={dossierParams}
                      onParamsChange={handleDossierParamsChange}
                      onRetry={() => {
                        if (selectedMessage?.id) setDossierParams((p) => ({ ...p }));
                      }}
                      onCreditPol={() => setCreditPolOpen(true)}
                    />
                  </div>
                )}
              </div>

              {/* Chat Thread Messages */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 scrollbar-thin scrollbar-thumb-slate-800">
                {/* 1. Ticket Opener Message (Player) */}
                <div className="flex gap-3 max-w-[85%]">
                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-slate-300 font-bold text-xs">
                    {selectedMessage.name ? selectedMessage.name[0].toUpperCase() : "U"}
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-white">{selectedMessage.name}</span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(selectedMessage.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <div className="p-4 rounded-2xl rounded-tl-sm bg-slate-900 border border-slate-800 text-slate-200 text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {selectedMessage.body ?? selectedMessage.message}

                      {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-800/80">
                          <SupportAttachmentThumbnails
                            attachments={selectedMessage.attachments}
                            variant="adminStrip"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Legacy single reply fallback */}
                {selectedMessage.reply && (!selectedMessage.replies || selectedMessage.replies.length === 0) && (
                  <div className="flex gap-3 max-w-[85%] ml-auto flex-row-reverse">
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 text-amber-300">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div className="space-y-1.5 min-w-0 text-right">
                      <div className="flex items-center justify-end gap-2 text-xs">
                        <span className="text-[10px] text-slate-500">
                          {selectedMessage.repliedAt
                            ? new Date(selectedMessage.repliedAt).toLocaleString("pt-BR")
                            : "Resposta enviada"}
                        </span>
                        <span className="font-bold text-amber-400">Equipe BlockMiner</span>
                      </div>
                      <div className="p-4 rounded-2xl rounded-tr-sm bg-amber-500/10 border border-amber-500/30 text-amber-100 text-sm leading-relaxed whitespace-pre-wrap break-words text-left">
                        {selectedMessage.reply}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Chronological Replies List */}
                {selectedMessage.replies?.map((r) => {
                  const isAdmin = r.isAdmin;

                  return (
                    <div
                      key={r.id}
                      className={`flex gap-3 max-w-[85%] ${isAdmin ? "ml-auto flex-row-reverse" : ""}`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                          isAdmin
                            ? "bg-amber-500/20 border border-amber-500/40 text-amber-300"
                            : "bg-slate-800 border border-slate-700 text-slate-300"
                        }`}
                      >
                        {isAdmin ? <Shield className="w-4 h-4" /> : selectedMessage.name ? selectedMessage.name[0].toUpperCase() : "U"}
                      </div>

                      <div className={`space-y-1.5 min-w-0 ${isAdmin ? "text-right" : ""}`}>
                        <div
                          className={`flex items-center gap-2 text-xs ${
                            isAdmin ? "justify-end" : ""
                          }`}
                        >
                          {!isAdmin && (
                            <span className="font-bold text-white">{selectedMessage.name}</span>
                          )}
                          <span className="text-[10px] text-slate-500">
                            {new Date(r.createdAt).toLocaleString("pt-BR")}
                          </span>
                          {isAdmin && (
                            <span className="font-bold text-amber-400">Equipe BlockMiner</span>
                          )}
                        </div>

                        <div
                          className={`p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words text-left ${
                            isAdmin
                              ? "rounded-tr-sm bg-amber-500/10 border border-amber-500/30 text-amber-100"
                              : "rounded-tl-sm bg-slate-900 border border-slate-800 text-slate-200"
                          }`}
                        >
                          {r.body ?? r.message}

                          {r.attachments && r.attachments.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-800/80">
                              <SupportAttachmentThumbnails
                                attachments={r.attachments}
                                variant="adminStrip"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div ref={messagesEndRef} />
              </div>

              {/* Reply Box Footer (Sticky) */}
              <div className="p-4 border-t border-slate-800 bg-slate-900/60 shrink-0 space-y-3">
                {replyFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {replyFiles.map((f, i) => (
                      <span
                        key={`${f.name}-${i}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300"
                      >
                        <ImagePlus className="w-3.5 h-3.5 text-amber-400" />
                        <span className="max-w-[150px] truncate">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => setReplyFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          className="hover:text-rose-400 ml-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="relative">
                  <textarea
                    rows={3}
                    placeholder="Escreva sua resposta para o jogador... (Ctrl+Enter para enviar)"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sendingReply}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 resize-none transition-colors"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-bold text-slate-300 cursor-pointer transition-colors">
                      <ImagePlus className="w-4 h-4 text-amber-400" />
                      <span>Anexar Imagem</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) {
                            const newFiles = Array.from(e.target.files).filter((f) =>
                              f.type.startsWith("image/")
                            );
                            setReplyFiles((prev) =>
                              [...prev, ...newFiles].slice(0, ADMIN_SUPPORT_REPLY_MAX_ATTACHMENTS)
                            );
                          }
                        }}
                      />
                    </label>

                    <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={closeOnReply}
                        onChange={(e) => setCloseOnReply(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500/30"
                      />
                      <span>Encerrar ticket ao enviar resposta</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={handleReply}
                    disabled={sendingReply || (!reply.trim() && replyFiles.length === 0)}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sendingReply ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>Enviar Resposta</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
              <div className="p-4 rounded-3xl bg-slate-900/60 border border-slate-800 text-slate-600 mb-3">
                <Inbox className="w-10 h-10" />
              </div>
              <h3 className="text-base font-bold text-white">Nenhum chamado selecionado</h3>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                Selecione um chamado da lista ao lado para ver a conversa, dados do jogador e responder.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Credit POL Modal */}
      <CreditPolModal
        open={creditPolOpen}
        ticketId={selectedMessage?.id ?? null}
        playerLabel={selectedMessage?.user?.username ?? selectedMessage?.name ?? selectedMessage?.email ?? null}
        onClose={() => setCreditPolOpen(false)}
        onCredited={() => {
          if (selectedMessage?.id) {
            setDossierParams((p: AdminSupportPlayerDossierParams) => ({ ...p }));
            void adminSupportApi.getMessage(selectedMessage.id).then((detailsRes) => {
              if (detailsRes.data.ok) setSelectedMessage(detailsRes.data.message ?? null);
            }).catch(() => {});
          }
        }}
      />
    </div>
  );
}

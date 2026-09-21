import { useState, useEffect, useMemo, type ChangeEvent, type SyntheticEvent } from "react";
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Eye,
  EyeOff,
  Megaphone,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  ExternalLink,
  Search,
  SlidersHorizontal,
  Clock,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  getAdminBroadcasts,
  createAdminBroadcast,
  updateAdminBroadcast,
  deleteAdminBroadcast,
  resetAdminBroadcastViews,
  uploadAdminBroadcastImage,
  readAxiosResponseMessage,
} from "../lib/admin.api";
import type { AdminBroadcastMessage, AdminBroadcastForm } from "../lib/admin.types";

const EMPTY_FORM: AdminBroadcastForm = {
  title: "",
  content: "",
  imageUrl: "",
  isActive: false,
  dismissDelaySeconds: 10,
  linkUrl: "",
  linkLabel: "",
  linkNewTab: false,
};

export default function AdminBroadcast() {
  const [messages, setMessages] = useState<AdminBroadcastMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<AdminBroadcastForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Preview Modal
  const [previewMsg, setPreviewMsg] = useState<{
    title: string;
    content?: string | null;
    imageUrl?: string | null;
    dismissDelaySeconds?: number;
    linkUrl?: string | null;
    linkLabel?: string | null;
    linkNewTab?: boolean;
  } | null>(null);
  const [previewRemaining, setPreviewRemaining] = useState(0);

  // Confirmation Modals
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmResetId, setConfirmResetId] = useState<number | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);

  const loadMessages = async () => {
    try {
      setIsLoading(true);
      const res = await getAdminBroadcasts();
      if (res.data.ok) {
        setMessages(res.data.messages || []);
      } else {
        toast.error("Erro ao carregar notificações broadcast.");
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) ?? "Erro de comunicação com o servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadMessages();
  }, []);

  // Timer countdown for preview modal
  useEffect(() => {
    if (!previewMsg || previewRemaining <= 0) return;
    const timerId = window.setInterval(() => {
      setPreviewRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [previewMsg, previewRemaining]);

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem maior que o limite de 5 MB.");
      return;
    }
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await uploadAdminBroadcastImage(fd);
      if (res.data?.ok && res.data.url) {
        setForm((f) => ({ ...f, imageUrl: res.data.url! }));
        toast.success("Imagem enviada com sucesso!");
      } else {
        toast.error(res.data?.message ?? "Falha no upload da imagem.");
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) ?? "Falha no upload.");
    } finally {
      setUploadingImage(false);
    }
  };

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (m: AdminBroadcastMessage) => {
    setEditId(m.id);
    setForm({
      title: m.title,
      content: m.content || "",
      imageUrl: m.imageUrl || "",
      isActive: m.isActive,
      dismissDelaySeconds: typeof m.dismissDelaySeconds === "number" ? m.dismissDelaySeconds : 10,
      linkUrl: m.linkUrl ?? "",
      linkLabel: m.linkLabel ?? "",
      linkNewTab: Boolean(m.linkNewTab),
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_FORM);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error("O título da notificação é obrigatório.");
      return;
    }

    if (form.linkUrl.trim()) {
      const u = form.linkUrl.trim();
      const isRelative = u.startsWith("/") && !u.startsWith("//");
      const isHttps = /^https:\/\//i.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)/i.test(u);
      if (!isRelative && !isHttps) {
        toast.error("A URL do botão deve ser um caminho interno (/loja) ou link seguro (https://...).");
        return;
      }
    }

    setSaving(true);
    try {
      if (editId != null) {
        const res = await updateAdminBroadcast(editId, form);
        if (res.data?.ok) {
          toast.success("Notificação atualizada com sucesso.");
        }
      } else {
        const res = await createAdminBroadcast(form);
        if (res.data?.ok) {
          toast.success("Notificação criada com sucesso.");
        }
      }
      cancelForm();
      await loadMessages();
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) ?? "Erro ao salvar notificação.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (m: AdminBroadcastMessage) => {
    try {
      await updateAdminBroadcast(m.id, { isActive: !m.isActive });
      toast.success(m.isActive ? "Notificação desativada." : "Notificação ativada (outras desativadas).");
      await loadMessages();
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) ?? "Erro ao alterar status.");
    }
  };

  const executeDelete = async () => {
    if (!confirmDeleteId) return;
    setActionInProgress(true);
    try {
      await deleteAdminBroadcast(confirmDeleteId);
      toast.success("Notificação excluída com sucesso.");
      setConfirmDeleteId(null);
      await loadMessages();
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) ?? "Erro ao excluir notificação.");
    } finally {
      setActionInProgress(false);
    }
  };

  const executeResetViews = async () => {
    if (!confirmResetId) return;
    setActionInProgress(true);
    try {
      const res = await resetAdminBroadcastViews(confirmResetId);
      if (res.data?.ok) {
        toast.success(res.data.message || "Visualizações resetadas com sucesso! Todos os usuários verão o anúncio novamente.");
      }
      setConfirmResetId(null);
      await loadMessages();
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) ?? "Erro ao resetar visualizações.");
    } finally {
      setActionInProgress(false);
    }
  };

  const openLivePreview = (data: {
    title: string;
    content?: string | null;
    imageUrl?: string | null;
    dismissDelaySeconds?: number;
    linkUrl?: string | null;
    linkLabel?: string | null;
    linkNewTab?: boolean;
  }) => {
    const delay = Math.max(0, Math.min(120, Number(data.dismissDelaySeconds) || 0));
    setPreviewRemaining(delay);
    setPreviewMsg(data);
  };

  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      if (statusFilter === "active" && !m.isActive) return false;
      if (statusFilter === "inactive" && m.isActive) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = m.title.toLowerCase().includes(q);
        const matchContent = (m.content || "").toLowerCase().includes(q);
        const matchLabel = (m.linkLabel || "").toLowerCase().includes(q);
        if (!matchTitle && !matchContent && !matchLabel) return false;
      }
      return true;
    });
  }, [messages, statusFilter, searchQuery]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black tracking-tight text-white">Notificações Broadcast</h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-amber-500/10 text-amber-400 border border-amber-500/30">
              Popups Globais
            </span>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Comunicados de alta visibilidade exibidos em modal para cada jogador autenticado pós-login.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-xl uppercase tracking-widest transition-all shadow-lg shadow-amber-500/10 active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" /> Nova Notificação
        </button>
      </div>

      {/* Form Card */}
      {showForm && (
        <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-6 shadow-xl space-y-5 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <p className="text-xs font-black text-amber-400 uppercase tracking-widest flex items-center gap-2">
              <Megaphone className="w-4 h-4" />
              {editId != null ? "Editar Notificação" : "Nova Notificação"}
            </p>
            <button
              type="button"
              onClick={() => openLivePreview(form)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/10 border border-sky-500/30 hover:bg-sky-500/20 text-sky-300 rounded-lg text-xs font-bold transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              Pré-visualizar Popup
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                Título *
              </label>
              <input
                value={form.title}
                maxLength={200}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Grande Atualização do Sistema ou Manutenção Programada"
                className="w-full bg-slate-800/90 border border-slate-700 rounded-xl py-2.5 px-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60 transition-all"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                Mensagem / Conteúdo (opcional)
              </label>
              <textarea
                value={form.content}
                maxLength={4000}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Descreva as novidades, instruções ou avisos importantes para os jogadores..."
                rows={3}
                className="w-full bg-slate-800/90 border border-slate-700 rounded-xl py-2.5 px-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60 transition-all resize-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                Banner Visual (opcional)
              </label>
              <div className="flex items-start gap-4">
                {form.imageUrl ? (
                  <img
                    src={form.imageUrl}
                    alt="preview"
                    className="h-20 w-32 object-cover rounded-xl border border-slate-700 bg-slate-950 shrink-0"
                    onError={(e: SyntheticEvent<HTMLImageElement>) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="h-20 w-32 grid place-items-center rounded-xl border border-dashed border-slate-700 bg-slate-900/60 text-slate-500 shrink-0">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <label className="inline-flex items-center justify-center gap-2 cursor-pointer rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-4 py-2.5 text-xs font-black text-amber-300 uppercase tracking-widest transition-colors">
                    {uploadingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                    {uploadingImage ? "Enviando arquivo..." : form.imageUrl ? "Trocar imagem do banner" : "Fazer upload do computador"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => void handleImageUpload(e)}
                      disabled={uploadingImage}
                    />
                  </label>
                  <input
                    value={form.imageUrl}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                    placeholder="...ou insira a URL direta da imagem (https://...)"
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500/60 transition-all"
                  />
                </div>
              </div>
              <p className="mt-1.5 text-[10px] text-slate-500">Formatos aceitos: JPG, PNG, WebP ou GIF. Tamanho máximo: 5 MB.</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${
                  form.isActive
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-300"
                }`}
              >
                {form.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {form.isActive ? "Ativo (Exibindo aos jogadores)" : "Inativo (Rascunho)"}
              </button>
              <span className="text-[10px] text-slate-500">
                {form.isActive ? "Nota: Salvar como ativo desativa outros broadcasts anteriores." : "Pode ser ativado depois."}
              </span>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                Contagem regressiva de bloqueio (segundos)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={form.dismissDelaySeconds}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const n = Math.max(0, Math.min(120, Math.floor(Number(e.target.value) || 0)));
                    setForm((f) => ({ ...f, dismissDelaySeconds: n }));
                  }}
                  className="w-28 bg-slate-800/90 border border-slate-700 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-amber-500/60 transition-all"
                />
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {form.dismissDelaySeconds === 0 ? "Sem delay (fechamento imediato)" : `Trava o botão por ${form.dismissDelaySeconds}s`}
                </span>
              </div>
            </div>

            {/* Call to Action Section */}
            <div className="md:col-span-2 rounded-xl border border-sky-500/20 bg-sky-500/[0.03] p-4 space-y-3">
              <p className="text-[10px] font-black text-sky-400 uppercase tracking-widest flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" />
                Botão de Ação / Call-to-action (opcional)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-3">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    URL ou Caminho de Destino
                  </label>
                  <input
                    value={form.linkUrl}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
                    placeholder="/shop, /faucet ou https://parceiro.com"
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-sky-500/60 transition-all placeholder:text-slate-600"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    Use rotas internas iniciando com <code>/</code> (ex: <code>/shop</code>) ou links externos com <code>https://</code>.
                  </p>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    Rótulo do Botão
                  </label>
                  <input
                    value={form.linkLabel}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, linkLabel: e.target.value }))}
                    placeholder="Conferir Agora"
                    maxLength={60}
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-sky-500/60 transition-all placeholder:text-slate-600"
                  />
                </div>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={form.linkNewTab}
                  onChange={(e) => setForm((f) => ({ ...f, linkNewTab: e.target.checked }))}
                  className="rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-500/30"
                />
                <span className="text-xs text-slate-300 select-none">Abrir link em nova aba (`_blank`)</span>
              </label>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs rounded-xl uppercase tracking-widest transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? "Salvando..." : editId != null ? "Salvar Alterações" : "Criar Notificação"}
            </button>
            <button
              type="button"
              onClick={cancelForm}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-black text-xs rounded-xl uppercase tracking-widest transition-all"
            >
              <X className="w-3.5 h-3.5" /> Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-3 rounded-2xl">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por título ou mensagem..."
            className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500 mr-1 hidden sm:inline" />
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === "all" ? "bg-amber-500 text-black" : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            Todos ({messages.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === "active" ? "bg-emerald-500 text-black" : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            Ativos ({messages.filter((m) => m.isActive).length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("inactive")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === "inactive" ? "bg-slate-700 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            Inativos ({messages.filter((m) => !m.isActive).length})
          </button>
        </div>
      </div>

      {/* Messages List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-slate-900/80 border border-slate-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredMessages.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center text-center gap-3">
          <Megaphone className="w-10 h-10 text-slate-600" />
          <p className="text-slate-400 text-sm font-bold">
            {messages.length === 0 ? "Nenhuma notificação broadcast cadastrada." : "Nenhuma notificação corresponde aos filtros de busca."}
          </p>
          {messages.length === 0 && (
            <button
              type="button"
              onClick={openCreate}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold text-xs rounded-xl hover:bg-amber-500/20 transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Criar primeira notificação
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMessages.map((m) => {
            const viewsCount = m._count?.views ?? 0;
            return (
              <div
                key={m.id}
                className={`bg-slate-900 border rounded-2xl p-5 flex flex-col sm:flex-row items-start gap-4 transition-all hover:border-slate-700 ${
                  m.isActive ? "border-emerald-500/40 shadow-lg shadow-emerald-500/5" : "border-slate-800"
                }`}
              >
                {/* Banner Thumbnail */}
                {m.imageUrl ? (
                  <img
                    src={m.imageUrl}
                    alt=""
                    className="w-20 h-20 rounded-xl object-cover shrink-0 border border-slate-700 bg-slate-950"
                    onError={(e: SyntheticEvent<HTMLImageElement>) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-20 h-20 rounded-xl border border-dashed border-slate-800 bg-slate-950/60 grid place-items-center text-slate-600 shrink-0">
                    <Megaphone className="w-6 h-6 text-slate-700" />
                  </div>
                )}

                {/* Content Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-white font-black text-sm tracking-tight">{m.title}</span>
                    {m.isActive ? (
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-emerald-500/15 text-emerald-400 rounded-full border border-emerald-500/30">
                        ATIVO (EM EXIBIÇÃO)
                      </span>
                    ) : (
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full border border-slate-700">
                        INATIVO
                      </span>
                    )}
                    {typeof m.dismissDelaySeconds === "number" && m.dismissDelaySeconds > 0 && (
                      <span className="text-[9px] font-bold px-2 py-0.5 bg-amber-500/10 text-amber-300 rounded-full border border-amber-500/20">
                        Bloqueio {m.dismissDelaySeconds}s
                      </span>
                    )}
                    {m.linkUrl && (
                      <span className="text-[9px] font-bold px-2 py-0.5 bg-sky-500/10 text-sky-300 rounded-full border border-sky-500/20 flex items-center gap-1">
                        <ExternalLink className="w-2.5 h-2.5" />
                        CTA: {m.linkLabel || "Link"}
                      </span>
                    )}
                  </div>

                  {m.content && <p className="text-slate-400 text-xs mt-1 line-clamp-2 leading-relaxed">{m.content}</p>}

                  <div className="flex items-center gap-3 text-slate-500 text-[11px] mt-2 flex-wrap">
                    <span className="font-semibold text-slate-300">
                      👁️ {viewsCount} {viewsCount === 1 ? "visualização" : "visualizações"}
                    </span>
                    <span>&middot;</span>
                    <span>
                      Criado em{" "}
                      {new Date(m.createdAt).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  {/* Live Preview Button */}
                  <button
                    type="button"
                    onClick={() => openLivePreview(m)}
                    className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-sky-300 hover:bg-sky-500/10 border border-slate-700/80 transition-all"
                    title="Pré-visualizar modal como usuário"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>

                  {/* Reset Views Button */}
                  <button
                    type="button"
                    onClick={() => setConfirmResetId(m.id)}
                    className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 border border-slate-700/80 transition-all"
                    title="Resetar visualizações (Re-exibir para todos os jogadores)"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  {/* Toggle Active Button */}
                  <button
                    type="button"
                    onClick={() => void toggleActive(m)}
                    className={`p-2 rounded-xl transition-all border ${
                      m.isActive
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                        : "bg-slate-800 border-slate-700/80 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10"
                    }`}
                    title={m.isActive ? "Desativar notificação" : "Ativar notificação"}
                  >
                    {m.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>

                  {/* Edit Button */}
                  <button
                    type="button"
                    onClick={() => openEdit(m)}
                    className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 border border-slate-700/80 transition-all"
                    title="Editar notificação"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(m.id)}
                    className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-slate-700/80 transition-all"
                    title="Excluir notificação"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Live Preview Modal */}
      {previewMsg && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl border border-amber-400/40 bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="inline-block rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-300">
                Aviso Geral (Simulação de Jogador)
              </div>
              <button
                type="button"
                onClick={() => setPreviewMsg(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <h2 className="text-xl font-extrabold tracking-tight text-white">{previewMsg.title}</h2>

            {previewMsg.imageUrl && (
              <img
                src={previewMsg.imageUrl}
                alt=""
                className="max-h-48 w-full rounded-xl object-cover border border-slate-800"
                onError={(e: SyntheticEvent<HTMLImageElement>) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}

            {previewMsg.content && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{previewMsg.content}</p>
            )}

            <div className="grid gap-2 pt-2">
              {previewMsg.linkUrl && previewMsg.linkLabel && (
                <a
                  href={previewMsg.linkUrl}
                  target={previewMsg.linkNewTab ? "_blank" : undefined}
                  rel={previewMsg.linkNewTab ? "noopener noreferrer" : undefined}
                  className="rounded-xl border border-sky-500/40 bg-sky-500/20 px-4 py-2.5 text-center text-sm font-bold text-sky-200 hover:bg-sky-500/30 transition-colors"
                >
                  {previewMsg.linkLabel}
                </a>
              )}
              <button
                type="button"
                disabled={previewRemaining > 0}
                onClick={() => setPreviewMsg(null)}
                className="rounded-xl bg-amber-400 hover:bg-amber-300 px-4 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              >
                {previewRemaining > 0 ? `Entendi (${previewRemaining}s)` : "Entendi"}
              </button>
            </div>
            <p className="text-[10px] text-center text-slate-500">
              * Esta é uma pré-visualização fiel de como a tela de aviso aparecerá para os usuários.
            </p>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Delete */}
      {confirmDeleteId != null && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-white">Excluir Notificação Broadcast</h3>
            <p className="text-sm text-slate-400">
              Tem certeza que deseja excluir esta notificação? Todos os registros de visualizações vinculados a ela também serão removidos.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                disabled={actionInProgress}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void executeDelete()}
                disabled={actionInProgress}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 transition-colors flex items-center gap-1.5"
              >
                {actionInProgress && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Excluir Definitivamente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Reset Views */}
      {confirmResetId != null && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-amber-400">
              <RotateCcw className="w-5 h-5" />
              <h3 className="text-lg font-black text-white">Resetar Visualizações</h3>
            </div>
            <p className="text-sm text-slate-300">
              Isso apagará o histórico de visualizações desta notificação. Todos os jogadores voltarão a ver o popup em sua próxima navegação no sistema.
            </p>
            <p className="text-xs text-slate-500">Deseja confirmar a reexibição em massa?</p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmResetId(null)}
                disabled={actionInProgress}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void executeResetViews()}
                disabled={actionInProgress}
                className="px-4 py-2 rounded-xl text-xs font-bold text-black bg-amber-500 hover:bg-amber-400 transition-colors flex items-center gap-1.5"
              >
                {actionInProgress && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirmar Re-exibição
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

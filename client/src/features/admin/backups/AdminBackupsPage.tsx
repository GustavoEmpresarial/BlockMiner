import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Database,
  RefreshCw,
  Trash2,
  Clock,
  AlertCircle,
  PlayCircle,
  ShieldCheck,
  ShieldAlert,
  Cloud,
  CloudOff,
  ExternalLink,
  Lock,
  CheckCircle2,
  X,
  Settings,
} from "lucide-react";
import {
  getAdminBackups,
  createAdminBackup,
  deleteAdminBackup,
  verifyAdminBackup,
  getAdminGoogleDriveStatus,
  getAdminGoogleDriveAuthUrl,
  connectAdminGoogleDrive,
  uploadAdminBackupToGoogleDrive,
  configureAdminGoogleDrive,
  readAxiosResponseMessage,
} from "../lib/admin.api";
import type {
  AdminBackupRow,
  GoogleDriveStatus,
} from "../lib/admin.types";

function backupStatusKey(status: string): string {
  if (status === "success") return "adminBackups.status_success";
  if (status === "failed") return "adminBackups.status_failed";
  if (status === "legacy_mock") return "adminBackups.status_legacy_mock";
  if (status === "legacy") return "adminBackups.status_legacy";
  return "adminBackups.status_unknown";
}

export default function AdminBackups() {
  const { t } = useTranslation();
  const [backups, setBackups] = useState<AdminBackupRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Cloud & Verification state
  const [driveStatus, setDriveStatus] = useState<GoogleDriveStatus | null>(null);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [verifyingFile, setVerifyingFile] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);

  // Google Drive connect modal
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [authUrl, setAuthUrl] = useState<string>("");
  const [authCode, setAuthCode] = useState("");
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);

  // OAuth credentials setup
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [configClientId, setConfigClientId] = useState("");
  const [configClientSecret, setConfigClientSecret] = useState("");
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const fetchBackups = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await getAdminBackups();
      if (res.data.ok) {
        setBackups(res.data.backups || []);
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) || t("adminBackups.load_error"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  const fetchDriveStatus = useCallback(async () => {
    try {
      setIsLoadingDrive(true);
      const res = await getAdminGoogleDriveStatus();
      if (res.data.ok && res.data.status) {
        setDriveStatus(res.data.status);
      }
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingDrive(false);
    }
  }, []);

  useEffect(() => {
    fetchBackups();
    fetchDriveStatus();
  }, [fetchBackups, fetchDriveStatus]);

  const handleCreateBackup = async () => {
    if (!window.confirm(t("adminBackups.confirm_create"))) return;

    try {
      setIsCreating(true);
      toast.info(t("adminBackups.creating"));
      const res = await createAdminBackup();
      if (res.data.ok) {
        const b = res.data.backup;
        let extra = "";
        if (b && typeof b.publicTableCount === "number") {
          extra += ` (${t("adminBackups.meta_tables", { count: b.publicTableCount })})`;
        }
        if (b && typeof b.totalDataRows === "number" && typeof b.publicTablesWithRows === "number") {
          extra += ` — ${t("adminBackups.toast_row_audit", {
            rows: b.totalDataRows,
            withData: b.publicTablesWithRows,
          })}`;
        }
        if (b?.sha256) {
          extra += ` — SHA: ${b.sha256.slice(0, 8)}…`;
        }
        if (b?.bundleName) {
          extra += ` — bundle ${b.bundleName}`;
        }
        toast.success(`${t("adminBackups.create_success")}${extra}`);
        fetchBackups();
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) || t("adminBackups.create_error"));
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!window.confirm(t("adminBackups.confirm_delete", { name: filename }))) return;

    try {
      const res = await deleteAdminBackup(filename);
      if (res.data.ok) {
        toast.success(t("adminBackups.delete_success"));
        fetchBackups();
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) || t("adminBackups.delete_error"));
    }
  };

  const handleVerifyBackup = async (filename: string) => {
    try {
      setVerifyingFile(filename);
      toast.info(`${t("adminBackups.verifying")} ${filename}`);
      const res = await verifyAdminBackup(filename);
      if (res.data.ok && res.data.report) {
        const rep = res.data.report;
        if (rep.ok) {
          toast.success(`${t("adminBackups.verify_success")} (SHA-256: ${rep.sha256.slice(0, 10)}…)`);
        } else {
          toast.error(`${t("adminBackups.verify_corrupted")} ${rep.errors.join("; ")}`);
        }
        fetchBackups();
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) || t("adminBackups.verify_error"));
    } finally {
      setVerifyingFile(null);
    }
  };

  const handleUploadToDrive = async (filename: string) => {
    try {
      setUploadingFile(filename);
      toast.info(t("adminBackups.gdrive_uploading"));
      const res = await uploadAdminBackupToGoogleDrive(filename);
      if (res.data.ok) {
        toast.success(t("adminBackups.gdrive_upload_success"));
        fetchBackups();
        fetchDriveStatus();
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) || t("adminBackups.gdrive_upload_error"));
    } finally {
      setUploadingFile(null);
    }
  };

  const handleOpenConnectModal = async () => {
    setShowConnectModal(true);
    if (!driveStatus?.isConfigured) {
      setShowConfigForm(true);
      return;
    }
    try {
      const res = await getAdminGoogleDriveAuthUrl();
      if (res.data.ok && res.data.authUrl) {
        setAuthUrl(res.data.authUrl);
        setShowConfigForm(false);
      } else {
        setShowConfigForm(true);
      }
    } catch {
      setShowConfigForm(true);
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configClientId.trim() || !configClientSecret.trim()) {
      toast.error("Preencha o Client ID e o Client Secret.");
      return;
    }

    try {
      setIsSavingConfig(true);
      const res = await configureAdminGoogleDrive({
        clientId: configClientId.trim(),
        clientSecret: configClientSecret.trim(),
      });
      if (res.data.ok) {
        toast.success("Credenciais do Google Drive salvas com sucesso!");
        await fetchDriveStatus();
        const urlRes = await getAdminGoogleDriveAuthUrl();
        if (urlRes.data.ok && urlRes.data.authUrl) {
          setAuthUrl(urlRes.data.authUrl);
          setShowConfigForm(false);
        }
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) || "Falha ao salvar credenciais.");
    } finally {
      setIsSavingConfig(false);
    }
  };

  const extractCodeFromInput = (input: string): string => {
    let val = input.trim();
    if (val.includes("code=")) {
      try {
        const url = new URL(val.startsWith("http") ? val : `http://localhost/${val.replace(/^\?/, "")}`);
        const extracted = url.searchParams.get("code");
        if (extracted) return extracted.trim();
      } catch {
        const match = val.match(/[?&]code=([^&]+)/);
        if (match && match[1]) return decodeURIComponent(match[1]).trim();
      }
    }
    return val;
  };

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = extractCodeFromInput(authCode);
    if (!clean) {
      toast.error("Insira o código de autorização.");
      return;
    }

    try {
      setIsConnectingDrive(true);
      const res = await connectAdminGoogleDrive(clean);
      if (res.data.ok) {
        toast.success("Google Drive conectado com sucesso!");
        setShowConnectModal(false);
        setAuthCode("");
        fetchDriveStatus();
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) || "Falha ao vincular Google Drive.");
    } finally {
      setIsConnectingDrive(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-3">
            <Database className="w-6 h-6 text-blue-500" aria-hidden />
            {t("adminBackups.title")}
          </h2>
          <p className="text-slate-500 text-sm font-medium mt-1 max-w-2xl">{t("adminBackups.subtitle")}</p>
          <p className="text-slate-600 text-xs font-medium mt-2 max-w-3xl leading-relaxed">{t("adminBackups.subtitle_full_copy")}</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              fetchBackups();
              fetchDriveStatus();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-700/50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden />
            {t("adminBackups.refresh")}
          </button>
          <button
            type="button"
            onClick={handleCreateBackup}
            disabled={isCreating}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-glow disabled:opacity-50"
          >
            {isCreating ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden /> : <PlayCircle className="w-4 h-4" aria-hidden />}
            {t("adminBackups.force_backup")}
          </button>
        </div>
      </div>

      {/* Google Drive Cloud Sync Banner Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-2xl ${driveStatus?.isConnected ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
              <Cloud className="w-6 h-6" aria-hidden />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold text-white">{t("adminBackups.gdrive_title")}</h3>
                {driveStatus?.isConnected ? (
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" />
                    {t("adminBackups.gdrive_connected")}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <CloudOff className="w-3 h-3" />
                    {t("adminBackups.gdrive_needs_auth")}
                  </span>
                )}
              </div>
              <p className="text-slate-500 text-xs mt-1">
                {driveStatus?.isConnected
                  ? `${t("adminBackups.gdrive_folder")} ${driveStatus.folderName || "BlockMiner-Backups"}${driveStatus.lastSyncAt ? ` · ${t("adminBackups.gdrive_last_sync")} ${new Date(driveStatus.lastSyncAt).toLocaleString()}` : ""}`
                  : "Conecte sua conta do Google Drive para sincronização externa e recuperação automática de desastres."}
              </p>
              {driveStatus?.lastError ? (
                <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {driveStatus.lastError}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleOpenConnectModal}
              disabled={isLoadingDrive}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all border border-slate-700/50 whitespace-nowrap"
            >
              <Lock className="w-3.5 h-3.5 text-blue-400" />
              {driveStatus?.isConnected ? t("adminBackups.gdrive_reconnect_btn") : t("adminBackups.gdrive_connect_btn")}
            </button>
          </div>
        </div>
      </div>

      {/* Backups Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="px-8 py-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/20">
          <h2 className="text-lg font-bold text-white flex items-center gap-3">
            <Clock className="w-5 h-5 text-slate-400" aria-hidden />
            {t("adminBackups.history_title")}
          </h2>
          <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
            {t("adminBackups.file_count", { count: backups.length })}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="bg-slate-800/30 text-[10px] uppercase font-bold tracking-widest text-slate-500">
              <tr>
                <th className="px-8 py-4">{t("adminBackups.col_file")}</th>
                <th className="px-8 py-4">{t("adminBackups.col_size")}</th>
                <th className="px-8 py-4">{t("adminBackups.col_created")}</th>
                <th className="px-8 py-4">{t("adminBackups.col_status")}</th>
                <th className="px-8 py-4 text-right">{t("adminBackups.col_actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-medium">
              {backups.map((b) => {
                const isVerifying = verifyingFile === b.name;
                const isUploading = uploadingFile === b.name;
                const isDriveSynced = Boolean(b.googleDrive?.fileId);

                return (
                  <tr key={b.name} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <Database className="w-4 h-4 text-blue-500 opacity-75" aria-hidden />
                        <div>
                          <span className="text-white font-mono text-xs block">{b.name}</span>
                          {b.sha256 ? (
                            <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                              SHA256: {b.sha256.slice(0, 16)}…
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5 font-mono text-xs">{formatBytes(b.size)}</td>
                    <td className="px-8 py-5 text-xs text-slate-500">{new Date(b.created).toLocaleString()}</td>
                    <td className="px-8 py-5 text-xs">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-300 font-medium">{t(backupStatusKey(b.status))}</span>

                          {/* Integrity badge */}
                          {b.integrityStatus === "valid" ? (
                            <span
                              title={b.lastVerifiedAt ? `Auditado em: ${new Date(b.lastVerifiedAt).toLocaleString()}` : "Íntegro"}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              {t("adminBackups.badge_valid")}
                            </span>
                          ) : b.integrityStatus === "corrupted" ? (
                            <span
                              title={b.integrityErrors?.join("; ") || "Corrompido"}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse"
                            >
                              <ShieldAlert className="w-3 h-3" />
                              {t("adminBackups.badge_corrupted")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                              <AlertCircle className="w-3 h-3" />
                              {t("adminBackups.badge_unverified")}
                            </span>
                          )}

                          {/* Cloud Sync badge */}
                          {isDriveSynced ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              <Cloud className="w-3 h-3" />
                              {t("adminBackups.gdrive_synced_badge")}
                            </span>
                          ) : null}
                        </div>

                        {typeof b.publicTableCount === "number" ? (
                          <div className="text-[10px] text-slate-600 space-y-0.5">
                            <div>
                              {t("adminBackups.meta_tables", { count: b.publicTableCount })}
                              {typeof b.durationMs === "number" ? ` · ${t("adminBackups.meta_duration", { ms: b.durationMs })}` : null}
                            </div>
                            {typeof b.totalDataRows === "number" &&
                            typeof b.publicTablesWithRows === "number" &&
                            typeof b.publicTablesEmpty === "number" ? (
                              <div className="text-slate-500">
                                {t("adminBackups.meta_row_audit", {
                                  rows: b.totalDataRows,
                                  withData: b.publicTablesWithRows,
                                  empty: b.publicTablesEmpty,
                                })}
                              </div>
                            ) : null}
                            {b.bundleName ? (
                              <div className="text-sky-400">
                                Bundle: {b.bundleName}
                                {typeof b.bundleSize === "number" ? ` · ${formatBytes(b.bundleSize)}` : ""}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex items-center gap-2 justify-end flex-wrap">
                        {/* Verify Integrity Button */}
                        <button
                          type="button"
                          onClick={() => handleVerifyBackup(b.name)}
                          disabled={isVerifying}
                          title="Auditar integridade de arquivo, rodapé e tabelas críticas"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
                        >
                          <ShieldCheck className={`w-3 h-3 ${isVerifying ? "animate-spin" : ""}`} />
                          {isVerifying ? t("adminBackups.verifying") : t("adminBackups.verify")}
                        </button>

                        {/* Google Drive Upload Button */}
                        <button
                          type="button"
                          onClick={() => handleUploadToDrive(b.name)}
                          disabled={isUploading}
                          title="Sincronizar backup no Google Drive corporativo"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
                        >
                          <Cloud className={`w-3 h-3 ${isUploading ? "animate-spin" : ""}`} />
                          {isUploading ? "Enviando…" : t("adminBackups.gdrive_upload_btn")}
                        </button>


                        {/* Google Drive View Link if synced */}

                        {b.googleDrive?.webViewLink ? (
                          <a
                            href={b.googleDrive.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir no Google Drive"
                            className="flex items-center gap-1 px-2 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 rounded-lg transition-all text-[10px] font-bold"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : null}

                        {/* Delete Backup */}
                        <button
                          type="button"
                          onClick={() => handleDeleteBackup(b.name)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest"
                        >
                          <Trash2 className="w-3 h-3" aria-hidden />
                          {t("adminBackups.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {backups.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={5} className="px-8 py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-500">
                      <AlertCircle className="w-8 h-8 mb-3 opacity-50" aria-hidden />
                      <p className="italic font-medium">{t("adminBackups.empty")}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Google Drive OAuth Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-6 shadow-2xl relative">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Cloud className="w-5 h-5 text-blue-500" />
                {t("adminBackups.gdrive_modal_title")}
              </h3>
              <button
                type="button"
                onClick={() => setShowConnectModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* If not configured or user clicked to reconfigure credentials */}
            {showConfigForm ? (
              <form onSubmit={handleSaveCredentials} className="space-y-4 text-xs">
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-blue-300">
                  Insira o <strong>Client ID</strong> e o <strong>Client Secret</strong> do projeto Google Cloud para habilitar a integração.
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Google OAuth Client ID</label>
                  <input
                    type="text"
                    value={configClientId}
                    onChange={(e) => setConfigClientId(e.target.value)}
                    placeholder="244478264579-...apps.googleusercontent.com"
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Google OAuth Client Secret</label>
                  <input
                    type="password"
                    value={configClientSecret}
                    onChange={(e) => setConfigClientSecret(e.target.value)}
                    placeholder="GOCSPX-..."
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowConfigForm(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingConfig || !configClientId.trim() || !configClientSecret.trim()}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold uppercase tracking-widest transition-all disabled:opacity-50 shadow-glow"
                  >
                    {isSavingConfig ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Salvar e Prosseguir
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 text-xs text-slate-400">
                <div className="flex items-center justify-between">
                  <span>Credenciais OAuth configuradas</span>
                  <button
                    type="button"
                    onClick={() => setShowConfigForm(true)}
                    className="flex items-center gap-1 text-blue-400 hover:text-blue-300 font-bold text-[11px]"
                  >
                    <Settings className="w-3 h-3" />
                    Alterar credenciais
                  </button>
                </div>

                <p>{t("adminBackups.gdrive_modal_step1")}</p>
                {authUrl ? (
                  <a
                    href={authUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all shadow-glow"
                  >
                    <ExternalLink className="w-4 h-4" />
                    {t("adminBackups.gdrive_modal_open_link")}
                  </a>
                ) : (
                  <div className="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl">
                    Clique em "Alterar credenciais" acima para configurar o Client ID.
                  </div>
                )}

                <p className="pt-2">{t("adminBackups.gdrive_modal_step2")}</p>
                <form onSubmit={handleConnectSubmit} className="space-y-4">
                  <input
                    type="text"
                    value={authCode}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const clean = extractCodeFromInput(raw);
                      setAuthCode(clean);
                      if (clean !== raw.trim() && clean.length > 5) {
                        toast.success("Código de autorização extraído com sucesso da URL!");
                      }
                    }}
                    placeholder={t("adminBackups.gdrive_modal_code_placeholder")}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 font-mono text-xs focus:outline-none focus:border-blue-500"
                  />

                  <div className="flex gap-3 justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setShowConnectModal(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all"
                    >
                      {t("adminBackups.gdrive_modal_cancel")}
                    </button>
                    <button
                      type="submit"
                      disabled={isConnectingDrive || !authCode.trim()}
                      className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold uppercase tracking-widest transition-all disabled:opacity-50 shadow-glow"
                    >
                      {isConnectingDrive ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      {t("adminBackups.gdrive_modal_confirm")}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

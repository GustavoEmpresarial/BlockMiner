import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  RefreshCw,
  Terminal,
  Search,
  Filter,
  Download,
  FileJson,
  FileSpreadsheet,
  Info,
  AlertTriangle,
  AlertOctagon,
  Eye,
  X,
} from "lucide-react";
import { getAdminSystemLogs } from "../lib/admin.api";
import type { AdminSystemLogItem } from "../lib/admin.types";

const PAGE_SIZE = 50;

const KNOWN_SOURCES = ["all", "database", "user", "system", "client"];
const KNOWN_SEVERITIES = ["all", "info", "warn", "error"];

function severityBadge(sev: string) {
  switch (sev?.toLowerCase()) {
    case "error":
      return {
        cls: "bg-red-500/10 text-red-400 border border-red-500/30",
        icon: <AlertOctagon className="w-3 h-3 text-red-400 inline mr-1" aria-hidden />,
      };
    case "warn":
      return {
        cls: "bg-amber-500/10 text-amber-400 border border-amber-500/30",
        icon: <AlertTriangle className="w-3 h-3 text-amber-400 inline mr-1" aria-hidden />,
      };
    case "info":
    default:
      return {
        cls: "bg-blue-500/10 text-blue-400 border border-blue-500/30",
        icon: <Info className="w-3 h-3 text-blue-400 inline mr-1" aria-hidden />,
      };
  }
}

function sourceBadgeClass(src: string): string {
  switch (src?.toLowerCase()) {
    case "database":
      return "bg-purple-500/10 text-purple-400 border border-purple-500/30";
    case "user":
      return "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30";
    case "system":
      return "bg-violet-500/10 text-violet-300 border border-violet-500/30";
    case "client":
      return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30";
    default:
      return "bg-slate-800 text-slate-300 border border-slate-700";
  }
}

function formatLogDetails(log: AdminSystemLogItem): string {
  const raw = log.detailsJson ?? log.metadata;
  if (raw == null || raw === "") return log.description || "—";
  let val = raw;
  if (typeof raw === "string") {
    try {
      val = JSON.parse(raw);
    } catch {
      val = raw;
    }
  }
  if (typeof val !== "object" || Array.isArray(val)) return String(val);
  const pairs = Object.entries(val as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  return pairs.length ? pairs.join(" · ") : log.description || "—";
}

function formatTimestamp(log: AdminSystemLogItem): string {
  const raw = log.created_at ?? log.createdAt;
  if (!raw) return "—";
  try {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? "—" : d.toLocaleString();
  } catch {
    return "—";
  }
}

export default function AdminLogs() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AdminSystemLogItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [selectedSource, setSelectedSource] = useState("all");
  const [selectedSeverity, setSelectedSeverity] = useState("all");
  const [sourcesCounts, setSourcesCounts] = useState<Record<string, number>>({});
  const [severitiesCounts, setSeveritiesCounts] = useState<Record<string, number>>({});

  // Modal detail view
  const [inspectedLog, setInspectedLog] = useState<AdminSystemLogItem | null>(null);

  const fetchLogs = useCallback(
    async (targetPage = 1, append = false) => {
      try {
        setIsLoading(true);
        const res = await getAdminSystemLogs({
          page: targetPage,
          pageSize: PAGE_SIZE,
          source: selectedSource === "all" ? undefined : selectedSource,
          severity: selectedSeverity === "all" ? undefined : selectedSeverity,
          q: activeQuery || undefined,
        });

        if (res.data && res.data.ok) {
          const batch = res.data.logs || [];
          setLogs((prev) => (append ? [...prev, ...batch] : batch));
          setPage(res.data.page);
          setHasMore(Boolean(res.data.hasMore));
          setTotal(typeof res.data.total === "number" ? res.data.total : null);

          if (res.data.sourcesSummary) {
            const counts: Record<string, number> = {};
            for (const s of res.data.sourcesSummary) counts[s.source] = s.count;
            setSourcesCounts(counts);
          }
          if (res.data.severitiesSummary) {
            const counts: Record<string, number> = {};
            for (const sev of res.data.severitiesSummary) counts[sev.severity] = sev.count;
            setSeveritiesCounts(counts);
          }
        } else {
          toast.error(t("adminLogs.load_error"));
        }
      } catch {
        toast.error(t("adminLogs.load_error"));
      } finally {
        setIsLoading(false);
      }
    },
    [t, selectedSource, selectedSeverity, activeQuery],
  );

  useEffect(() => {
    setPage(1);
    void fetchLogs(1, false);
  }, [fetchLogs]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveQuery(searchTerm.trim());
  };

  const handleLoadMore = () => {
    if (!hasMore || isLoading) return;
    void fetchLogs(page + 1, true);
  };

  const handleExport = async (format: "csv" | "json") => {
    try {
      setIsExporting(true);
      const params = new URLSearchParams();
      params.set("format", format);
      if (selectedSource !== "all") params.set("source", selectedSource);
      if (selectedSeverity !== "all") params.set("severity", selectedSeverity);
      if (activeQuery) params.set("q", activeQuery);

      const downloadUrl = `/api/admin/logs/export?${params.toString()}`;
      window.open(downloadUrl, "_blank");
      toast.success(format === "csv" ? "CSV export iniciado." : "JSON export iniciado.");
    } catch {
      toast.error("Falha ao exportar logs.");
    } finally {
      setIsExporting(false);
    }
  };

  const sourceChips = useMemo(() => {
    return KNOWN_SOURCES.map((key) => {
      const count = key === "all" ? total : sourcesCounts[key];
      return {
        key,
        label: t(`adminLogs.source_${key}`, { defaultValue: key.toUpperCase() }),
        count: typeof count === "number" ? count : null,
        active: selectedSource === key,
      };
    });
  }, [t, selectedSource, total, sourcesCounts]);

  const severityChips = useMemo(() => {
    return KNOWN_SEVERITIES.map((key) => {
      const count = key === "all" ? total : severitiesCounts[key];
      return {
        key,
        label: t(`adminLogs.severity_${key}`, { defaultValue: key.toUpperCase() }),
        count: typeof count === "number" ? count : null,
        active: selectedSeverity === key,
      };
    });
  }, [t, selectedSeverity, total, severitiesCounts]);

  return (
    <div className="min-w-0 space-y-6 animate-in fade-in duration-700 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-3">
            <Terminal className="w-6 h-6 text-purple-500" aria-hidden />
            {t("adminLogs.title")}
          </h2>
          <p className="text-slate-500 text-sm font-medium mt-1 max-w-2xl">{t("adminLogs.subtitle")}</p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-auto">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden />
            <input
              type="text"
              placeholder={t("adminLogs.filter_placeholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:w-64 rounded-xl border border-slate-700 bg-slate-900 py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 transition-colors focus:border-purple-500 focus:outline-none"
            />
          </form>

          <button
            type="button"
            onClick={() => void fetchLogs(1, false)}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-xl border border-slate-700/50 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 transition-all hover:bg-slate-700 disabled:opacity-50"
            title={t("adminLogs.refresh")}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden />
            <span className="hidden sm:inline">{t("adminLogs.refresh")}</span>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleExport("csv")}
              disabled={isExporting}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700/60 bg-slate-800/80 px-3 py-2 text-xs font-semibold text-emerald-400 transition-all hover:bg-emerald-950/40 hover:border-emerald-500/50 disabled:opacity-50"
              title={t("adminLogs.export_csv")}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={() => void handleExport("json")}
              disabled={isExporting}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700/60 bg-slate-800/80 px-3 py-2 text-xs font-semibold text-blue-400 transition-all hover:bg-blue-950/40 hover:border-blue-500/50 disabled:opacity-50"
              title={t("adminLogs.export_json")}
            >
              <FileJson className="w-3.5 h-3.5" aria-hidden />
              <span>JSON</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Chips Bar */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 space-y-3">
        {/* Source Filter */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {t("adminLogs.filter_source")}
          </span>
          <div className="flex flex-wrap gap-2">
            {sourceChips.map(({ key, label, count, active }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedSource(key)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border flex items-center gap-1.5 ${
                  active
                    ? "bg-purple-600/30 border-purple-500/60 text-purple-200"
                    : "bg-slate-950/80 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                }`}
              >
                <span>{label}</span>
                {count != null && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] ${
                      active ? "bg-purple-500/30 text-purple-100" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Severity Filter */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {t("adminLogs.filter_severity")}
          </span>
          <div className="flex flex-wrap gap-2">
            {severityChips.map(({ key, label, count, active }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedSeverity(key)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border flex items-center gap-1.5 ${
                  active
                    ? "bg-slate-700 border-slate-500 text-white"
                    : "bg-slate-950/80 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                }`}
              >
                <span>{label}</span>
                {count != null && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] ${
                      active ? "bg-slate-600 text-white" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Table / Card View */}
      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
        {/* Table Header / Counter */}
        <div className="flex flex-col justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:px-6">
          <div className="flex min-w-0 items-center gap-2 text-slate-400">
            <Filter className="w-4 h-4 shrink-0" aria-hidden />
            <span className="min-w-0 text-[10px] font-bold uppercase tracking-wide sm:tracking-widest">
              {t("adminLogs.showing_filtered", { shown: logs.length, loaded: logs.length })}
              {total != null ? ` · ${t("adminLogs.total_approx", { n: total })}` : null}
            </span>
          </div>
          {hasMore ? (
            <button
              type="button"
              disabled={isLoading}
              onClick={handleLoadMore}
              className="text-left text-[10px] font-bold uppercase tracking-widest text-purple-400 hover:text-purple-300 disabled:opacity-50 sm:text-right"
            >
              {isLoading ? t("adminLogs.loading") : t("adminLogs.load_more")}
            </button>
          ) : null}
        </div>

        {/* Mobile View (Cards) */}
        <div className="space-y-3 p-3 lg:hidden">
          {logs.map((log) => {
            const sevInfo = severityBadge(log.severity);
            const srcCls = sourceBadgeClass(log.source);
            const details = formatLogDetails(log);

            return (
              <article
                key={log.id}
                onClick={() => setInspectedLog(log)}
                className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 cursor-pointer hover:border-slate-700 transition-colors"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${sevInfo.cls}`}>
                        {sevInfo.icon}
                        {log.severity}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold ${srcCls}`}>
                        {log.source}
                      </span>
                    </div>
                    <span className="shrink-0 text-right text-[10px] font-mono text-slate-500">
                      {formatTimestamp(log)}
                    </span>
                  </div>

                  <p className="text-sm font-semibold text-white break-words">{log.action}</p>

                  <div className="grid grid-cols-1 gap-1 text-xs text-slate-400">
                    <p className="min-w-0 break-words">
                      <span className="font-bold text-slate-500">{t("adminLogs.col_user")}: </span>
                      <span className="text-slate-300">
                        {log.user_email || log.user?.email || (log.userId ? `User #${log.userId}` : "—")}
                      </span>
                    </p>
                    <p className="min-w-0 break-words">
                      <span className="font-bold text-slate-500">{t("adminLogs.col_ip")}: </span>
                      <span className="text-slate-300">{log.ip || "—"}</span>
                    </p>
                    <p className="min-w-0 break-words line-clamp-2">
                      <span className="font-bold text-slate-500">{t("adminLogs.col_details")}: </span>
                      <span className="text-slate-400 font-mono text-[11px]">{details}</span>
                    </p>
                  </div>
                </div>
              </article>
            );
          })}

          {logs.length === 0 && !isLoading && (
            <div className="px-4 py-12 text-center text-sm italic text-slate-600">
              {t("adminLogs.empty_filter")}
            </div>
          )}
        </div>

        {/* Desktop View (Table) */}
        <div className="hidden max-h-[640px] overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800 lg:block">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="bg-slate-900/70 text-[10px] uppercase font-bold tracking-widest text-slate-500 sticky top-0 backdrop-blur-md z-10 border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5">{t("adminLogs.col_time")}</th>
                <th className="px-4 py-3.5">{t("adminLogs.col_severity")}</th>
                <th className="px-4 py-3.5">{t("adminLogs.col_source")}</th>
                <th className="px-5 py-3.5">{t("adminLogs.col_event")}</th>
                <th className="px-5 py-3.5">{t("adminLogs.col_user")}</th>
                <th className="px-4 py-3.5">{t("adminLogs.col_ip")}</th>
                <th className="px-6 py-3.5">{t("adminLogs.col_details")}</th>
                <th className="px-4 py-3.5 text-right">{t("adminLogs.col_actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 font-medium font-mono text-xs">
              {logs.map((log) => {
                const sevInfo = severityBadge(log.severity);
                const srcCls = sourceBadgeClass(log.source);
                const details = formatLogDetails(log);

                return (
                  <tr
                    key={log.id}
                    onClick={() => setInspectedLog(log)}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{formatTimestamp(log)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${sevInfo.cls}`}>
                        {sevInfo.icon}
                        {log.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold ${srcCls}`}>
                        {log.source}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-white font-sans font-semibold">
                      <div className="flex flex-col">
                        <span>{log.action}</span>
                        {log.label && <span className="text-[10px] text-slate-500 font-mono">{log.label}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-300 font-sans whitespace-nowrap">
                      {log.user_email || log.user?.email || (log.userId ? `User #${log.userId}` : "—")}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{log.ip || "—"}</td>
                    <td className="px-6 py-3 max-w-sm truncate text-slate-400 text-[11px]" title={details}>
                      {details}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectedLog(log);
                        }}
                        className="p-1 rounded-lg text-slate-400 hover:text-purple-400 hover:bg-purple-500/10 transition-colors"
                        title="Ver detalhes"
                      >
                        <Eye className="w-4 h-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {logs.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-slate-600 italic">
                    {t("adminLogs.empty_filter")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect Log Detail Modal */}
      {inspectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <Terminal className="w-5 h-5 text-purple-400" aria-hidden />
                <h3 className="text-lg font-bold text-white">
                  {t("adminLogs.details_modal_title", { id: inspectedLog.id })}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedLog(null)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                    {t("adminLogs.col_time")}
                  </span>
                  <span className="text-slate-300 font-mono">{formatTimestamp(inspectedLog)}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                    {t("adminLogs.col_source")}
                  </span>
                  <span className="text-purple-300 font-semibold">{inspectedLog.source}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                    {t("adminLogs.col_severity")}
                  </span>
                  <span className="text-amber-300 font-semibold uppercase">{inspectedLog.severity}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                    {t("adminLogs.col_ip")}
                  </span>
                  <span className="text-slate-300 font-mono">{inspectedLog.ip || "—"}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                  {t("adminLogs.col_event")}
                </span>
                <p className="text-white font-semibold text-sm">{inspectedLog.action}</p>
                {inspectedLog.label && <p className="text-slate-400 font-mono">{inspectedLog.label}</p>}
                {inspectedLog.description && <p className="text-slate-300 mt-1">{inspectedLog.description}</p>}
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                  {t("adminLogs.col_user")}
                </span>
                <p className="text-white">
                  {inspectedLog.user_email || inspectedLog.user?.email || "—"}{" "}
                  {inspectedLog.userId ? `(ID: #${inspectedLog.userId})` : ""}
                </p>
                {inspectedLog.userAgent && (
                  <p className="text-slate-500 font-mono text-[10px] break-all">
                    User-Agent: {inspectedLog.userAgent}
                  </p>
                )}
              </div>

              {(inspectedLog.detailsJson || inspectedLog.metadata) && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">
                    {t("adminLogs.metadata")}
                  </span>
                  <pre className="mt-1 p-3 rounded-lg bg-black/50 border border-slate-800 text-[11px] font-mono text-purple-300 overflow-x-auto max-h-60">
                    {JSON.stringify(
                      typeof inspectedLog.detailsJson === "string"
                        ? JSON.parse(inspectedLog.detailsJson || "{}")
                        : inspectedLog.detailsJson || inspectedLog.metadata,
                      null,
                      2,
                    )}
                  </pre>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectedLog(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 text-xs font-bold text-white hover:bg-slate-700 transition-colors"
              >
                {t("adminLogs.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";

interface LogEntry {
  id: string;
  user_role: string;
  user_name: string | null;
  action: string;
  module: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

const MODULE_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "auth", label: "Auth" },
  { value: "reebok", label: "Reebok" },
  { value: "guias", label: "Guías" },
  { value: "reclamos", label: "Reclamos" },
  { value: "prestamos", label: "Préstamos" },
];

const ACTION_LABELS: Record<string, string> = {
  login: "Inicio de sesión",
  inventory_upload: "Carga de inventario CSV",
  product_create: "Producto creado",
  product_delete: "Producto eliminado",
  guia_create: "Guía creada",
  guia_dispatch: "Guía despachada",
  reclamo_create: "Reclamo creado",
  prestamo_approve: "Préstamo aprobado",
};

const MODULE_COLORS: Record<string, string> = {
  auth: "bg-gray-100 text-gray-600",
  reebok: "bg-purple-100 text-purple-700",
  guias: "bg-blue-100 text-blue-700",
  reclamos: "bg-amber-100 text-amber-700",
  prestamos: "bg-green-100 text-green-700",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "Hace un momento";
  if (diff < 3_600_000) return `Hace ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `Hace ${Math.floor(diff / 3_600_000)}h`;
  return d.toLocaleDateString("es-PA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function ActivityLog({ darkMode }: { darkMode: boolean }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleFilter, setModuleFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (moduleFilter) params.set("module", moduleFilter);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    try {
      const res = await fetch(`/api/activity?${params}`);
      if (res.ok) setLogs(await res.json());
    } catch { /* */ }
    setLoading(false);
  }, [moduleFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const inputCls = `text-xs border rounded-lg px-3 py-2 ${darkMode ? "bg-gray-800 border-gray-700 text-gray-200" : "bg-white border-gray-200 text-gray-700"}`;

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} className={inputCls}>
          {MODULE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} placeholder="Desde" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} placeholder="Hasta" />
        {(moduleFilter || dateFrom || dateTo) && (
          <button onClick={() => { setModuleFilter(""); setDateFrom(""); setDateTo(""); }} className="text-xs text-gray-400 hover:text-gray-600 transition">Limpiar</button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className={`h-12 rounded-lg animate-pulse ${darkMode ? "bg-gray-800" : "bg-gray-50"}`} />)}
        </div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Sin actividad registrada</p>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <div key={log.id} className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${darkMode ? "border-gray-800 bg-gray-900" : "border-gray-200 bg-white"}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded-full ${MODULE_COLORS[log.module] || "bg-gray-100 text-gray-600"}`}>
                    {log.module}
                  </span>
                  <span className={`text-sm ${darkMode ? "text-gray-200" : "text-gray-800"}`}>
                    {ACTION_LABELS[log.action] || log.action}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-400">{log.user_name || log.user_role}</span>
                  {log.details && Object.keys(log.details).length > 0 && (
                    <span className="text-xs text-gray-300 truncate max-w-[200px]">
                      {Object.entries(log.details)
                        .filter(([k]) => k !== "userName")
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(", ")}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">{formatDate(log.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

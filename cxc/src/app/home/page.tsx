"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import FGLogo from "@/components/FGLogo";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import ReportExport from "./components/ReportExport";
import ActivityLog from "./components/ActivityLog";
import SearchBar from "@/components/SearchBar";
import { useBadges } from "@/lib/hooks/useBadges";
import { cacheSet, cacheGet, CACHE_KEYS } from "@/lib/offlineCache";
import { useOnline } from "@/lib/OnlineContext";

// SVG icon components for a premium internal-tool feel
const MODULE_ICONS: Record<string, React.ReactNode> = {
  cxc: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 9h20"/><path d="M10 9v12"/></svg>,
  upload: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  guias: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5a2 2 0 01-2 2h-1"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/><path d="M8 16H16"/></svg>,
  caja: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  directorio: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
  cheques: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 12h4"/><path d="M14 12h4"/><path d="M6 16h12"/></svg>,
  prestamos: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><path d="M12 9v4l2 2"/></svg>,
  reclamos: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  ventas: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  reebok: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.38 3.46L16 2 7.56 14.55a8 8 0 00-1.27 2.7L5 22l3.75-1.29a8 8 0 002.7-1.27L24 11z"/></svg>,
  camisetas: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 7l3 2.5-.5 3.5H9.5L9 9.5z"/><path d="M12 2v5M22 12h-5.5M19.5 19l-4.5-3M4.5 19l4.5-3M2 12h5.5"/></svg>,
  usuarios: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
};

const ALL_MODULES = [
  { key: "cxc", label: "Cuentas por Cobrar", subtitle: "Cartera de clientes", href: "/admin", roles: ["admin", "secretaria", "director", "vendedor"] },
  { key: "upload", label: "Cargar CSV", subtitle: "Antigüedad de deuda", href: "/upload", roles: ["admin", "secretaria"] },
  { key: "guias", label: "Guías", subtitle: "Transporte y despacho", href: "/guias", roles: ["admin", "secretaria", "bodega", "director"] },
  { key: "caja", label: "Caja Menuda", subtitle: "Control de gastos", href: "/caja", roles: ["admin", "secretaria"] },
  { key: "directorio", label: "Directorio", subtitle: "Clientes y contactos", href: "/directorio", roles: ["admin", "secretaria", "director", "contabilidad", "vendedor"] },
  { key: "cheques", label: "Cheques", subtitle: "Posfechados", href: "/cheques", roles: ["admin", "secretaria", "director"] },
  { key: "prestamos", label: "Préstamos", subtitle: "Colaboradores", href: "/prestamos", roles: ["admin", "contabilidad"] },
  { key: "reclamos", label: "Reclamos", subtitle: "Seguimiento", href: "/reclamos", roles: ["admin", "secretaria", "director"] },
  { key: "ventas", label: "Ventas", subtitle: "Mensuales", href: "/ventas", roles: ["admin", "director", "contabilidad"] },
  { key: "reebok", label: "Catálogo Reebok", subtitle: "Productos y pedidos", href: "/catalogo/reebok", roles: ["admin", "vendedor", "cliente", "secretaria"] },
  { key: "camisetas", label: "Camisetas Selección", subtitle: "Pedidos y stock", href: "/camisetas", roles: ["admin", "vendedor"] },
  { key: "usuarios", label: "Usuarios", subtitle: "Permisos y accesos", href: "/admin/usuarios", roles: ["admin"] },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return "Buenos días";
  if (h >= 12 && h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function getDateLabel() {
  const d = new Date();
  const dias = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${dias[d.getDay()]}, ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

export default function PlantillasPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState("");
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState("");
  const [fgModules, setFgModules] = useState<string[] | null>(null);
  const [moduleOrder, setModuleOrder] = useState<string[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const badges = useBadges();
  const isOnline = useOnline();
  const [statsCached, setStatsCached] = useState(false);
  const [showFinancials, setShowFinancials] = useState(false);
  const [showPendingSection, setShowPendingSection] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!r) { router.push("/"); return; }
    if (r === "cliente") { router.push("/catalogo/reebok"); return; }
    setRole(r);
    setUserName(sessionStorage.getItem("fg_user_name") || "");
    setUserId(sessionStorage.getItem("fg_user_id") || "");
    const isDark = localStorage.getItem("fg_dark_mode") === "1";
    setDarkMode(isDark);
    if (isDark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");

    // Load modules from new system
    try {
      const mods = sessionStorage.getItem("fg_modules");
      if (mods) setFgModules(JSON.parse(mods));
    } catch { console.error('Failed to parse fg_modules'); }

    setAuthChecked(true);
  }, [router]);

  // Load saved module order
  const loadOrder = useCallback(async () => {
    const uid = sessionStorage.getItem("fg_user_id");
    if (uid) {
      try {
        const res = await fetch(`/api/user/module-order?userId=${uid}`);
        if (res.ok) {
          const data = await res.json();
          if (data.module_order?.length) setModuleOrder(data.module_order);
        }
      } catch { console.error('Failed to load module order'); }
    } else {
      // Legacy: load from localStorage
      const r = sessionStorage.getItem("cxc_role") || "";
      try {
        const saved = localStorage.getItem(`module_order_${r}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) setModuleOrder(parsed);
        }
      } catch { console.error('Failed to parse saved module order'); }
    }
  }, []);

  // Home stats for alerts + KPIs
  interface HomeStats {
    vencenHoy: number; vencenEstaSemana: number; prestamosPendientes: number;
    reclamosViejos: number; reclamosPendientes: number; reclamosResueltosEsteMes: number;
    cxcStale: boolean; lastUpload: string | null;
    ventasMes: number; ventasPrev: number;
    cxcTotal: number; cxcVencida: number;
    chequesTotalPendiente: number;
    guiasPendientes: number;
  }
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Pending actions feed
  interface PendingAction {
    id: string; module: string; icon: string; description: string;
    timeContext: string; href: string; urgency: number;
  }
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [showAllActions, setShowAllActions] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/home-stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        setStatsCached(false);
        cacheSet(CACHE_KEYS.HOME_STATS, data);
      }
    } catch {
      // Offline or network error — try cache
      const cached = cacheGet<HomeStats>(CACHE_KEYS.HOME_STATS);
      if (cached) {
        setStats(cached);
        setStatsCached(true);
      }
    }
    setStatsLoading(false);
  }, []);

  const loadPendingActions = useCallback(async () => {
    try {
      const res = await fetch("/api/pending-actions");
      if (res.ok) {
        const data = await res.json();
        setPendingActions(data.actions || []);
        setPendingTotal(data.totalCount || 0);
      }
    } catch { console.error('Failed to load pending actions'); }
    setPendingLoading(false);
  }, []);

  useEffect(() => { if (authChecked) { loadOrder(); loadStats(); loadPendingActions(); } }, [authChecked, loadOrder, loadStats, loadPendingActions]);

  if (!authChecked) return null;

  // Build alerts — only show alerts relevant to the user's role
  const alertRoles = ['admin', 'secretaria', 'director', 'contabilidad'];
  const showAlerts = alertRoles.includes(role);
  const alerts: { label: string; count: number; href: string; color: "red" | "yellow" | "blue" }[] = [];
  if (stats && showAlerts) {
    if (stats.vencenHoy > 0) alerts.push({ label: "Cheques vencen hoy", count: stats.vencenHoy, href: "/cheques?filtro=vencen_hoy", color: "red" });
    if (stats.vencenEstaSemana > 0) alerts.push({ label: "Cheques vencen esta semana", count: stats.vencenEstaSemana, href: "/cheques?filtro=vencen_semana", color: "yellow" });
    if (stats.prestamosPendientes > 0) alerts.push({ label: "Aprobaciones pendientes", count: stats.prestamosPendientes, href: "/prestamos?pendientes=1", color: "blue" });
    if (stats.reclamosViejos > 0 && (role === 'admin' || role === 'secretaria')) alerts.push({ label: "Reclamos +45 días sin resolver", count: stats.reclamosViejos, href: "/reclamos?viejos=1", color: "red" });
    if (stats.cxcStale) alerts.push({ label: "Datos de cartera desactualizados", count: 0, href: "/upload", color: "yellow" });
  }

  // Pending actions: show to admin, secretaria, director, contabilidad
  const showPendingActions = alertRoles.includes(role);
  const visibleActions = showAllActions ? pendingActions : pendingActions.slice(0, 5);

  // Determine visible modules
  const isAdmin = role === "admin";
  const visibleKeys = new Set<string>();

  if (isAdmin) {
    ALL_MODULES.forEach(m => visibleKeys.add(m.key));
  } else if (fgModules) {
    // New system: use fg_modules from session
    fgModules.forEach(k => visibleKeys.add(k));
  } else {
    // Legacy: use role-based defaults
    ALL_MODULES.forEach(m => { if (m.roles.includes(role)) visibleKeys.add(m.key); });
  }

  // Build ordered list
  const orderedKeys = [...moduleOrder.filter(k => visibleKeys.has(k))];
  visibleKeys.forEach(k => { if (!orderedKeys.includes(k)) orderedKeys.push(k); });
  const visibleModules = orderedKeys.map(k => ALL_MODULES.find(m => m.key === k)!).filter(Boolean);

  // Drag end
  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const items = [...orderedKeys];
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setModuleOrder(items);
  }

  async function saveOrder() {
    setEditMode(false);
    if (userId) {
      await fetch("/api/user/module-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, moduleOrder }),
      });
    } else {
      localStorage.setItem(`module_order_${role}`, JSON.stringify(moduleOrder));
    }
  }

  const displayName = userName || "";

  return (
    <div className={`min-h-screen ${darkMode ? "bg-gray-950 text-gray-100" : ""}`}>
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <FGLogo variant="horizontal" theme="light" size={30} />
          <span className={`text-lg font-light ${darkMode ? "text-gray-100" : "text-gray-800"}`}>{getGreeting()}{displayName ? `, ${displayName}` : ""}</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { const next = !darkMode; setDarkMode(next); if (next) { document.documentElement.classList.add("dark"); localStorage.setItem("fg_dark_mode", "1"); } else { document.documentElement.classList.remove("dark"); localStorage.setItem("fg_dark_mode", "0"); } }} className="text-sm text-gray-400 hover:text-black transition px-1">{darkMode ? "☀" : "◑"}</button>
          <button onClick={() => { sessionStorage.clear(); router.push("/"); }} className="text-sm text-gray-400 hover:text-black transition">Salir</button>
        </div>
      </div>

      {/* Global Search — admin, secretaria, director */}
      {["admin", "secretaria", "director"].includes(role) && (
        <SearchBar darkMode={darkMode} />
      )}

      {/* KPI Cards — admin and director only */}
      {(role === "admin" || role === "director") && (
        statsLoading ? (
          <div className="grid grid-cols-3 gap-2 mb-6">
            {[1,2,3].map(i => <div key={i} className="h-20 rounded-lg bg-gray-50 border border-gray-200 animate-pulse" />)}
          </div>
        ) : stats ? (
          <div className="mb-6">
          {statsCached && <p className="text-xs text-amber-600 mb-1">(datos cacheados)</p>}
          <div className="grid grid-cols-3 gap-2">
            {/* Ventas del mes — click to toggle */}
            <div
              onClick={() => setShowFinancials(!showFinancials)}
              className={`rounded-lg p-3 border cursor-pointer transition ${darkMode ? "border-gray-800 bg-gray-900 hover:border-gray-600" : "border-gray-200 bg-white hover:border-gray-300"}`}
            >
              <p className="text-xs uppercase tracking-wider text-gray-500">Ventas del mes</p>
              {showFinancials ? (
                <>
                  <p className="text-lg font-semibold tabular-nums mt-0.5">${stats.ventasMes > 0 ? (stats.ventasMes / 1000).toFixed(0) + "K" : "—"}</p>
                  <p className={`text-xs mt-1 ${stats.ventasPrev > 0 && stats.ventasMes >= stats.ventasPrev ? "text-green-600" : "text-gray-400"}`}>
                    {stats.ventasPrev > 0 ? `vs $${(stats.ventasPrev / 1000).toFixed(0)}K prev` : "—"}
                  </p>
                </>
              ) : (
                <>
                  <p className={`text-lg font-semibold tabular-nums mt-0.5 ${darkMode ? "text-gray-600" : "text-gray-300"}`}>••••</p>
                  <p className={`text-xs mt-1 ${darkMode ? "text-gray-600" : "text-gray-300"}`}>Toca para ver</p>
                </>
              )}
            </div>
            {/* CxC — click to toggle (shared state) */}
            <div
              onClick={() => setShowFinancials(!showFinancials)}
              className={`rounded-lg p-3 border cursor-pointer transition ${darkMode ? "border-gray-800 bg-gray-900 hover:border-gray-600" : "border-gray-200 bg-white hover:border-gray-300"}`}
            >
              <p className="text-xs uppercase tracking-wider text-gray-500">Cuentas por Cobrar</p>
              {showFinancials ? (
                <>
                  <p className="text-lg font-semibold tabular-nums mt-0.5">${stats.cxcTotal > 0 ? (stats.cxcTotal / 1000).toFixed(0) + "K" : "—"}</p>
                  {stats.cxcVencida > 0
                    ? <p className="text-xs text-red-500 mt-1">${(stats.cxcVencida / 1000).toFixed(0)}K vencida</p>
                    : <p className="text-xs text-green-600 mt-1">Sin vencidos</p>}
                </>
              ) : (
                <>
                  <p className={`text-lg font-semibold tabular-nums mt-0.5 ${darkMode ? "text-gray-600" : "text-gray-300"}`}>••••</p>
                  <p className={`text-xs mt-1 ${darkMode ? "text-gray-600" : "text-gray-300"}`}>Toca para ver</p>
                </>
              )}
            </div>
            {/* Reclamos — always visible */}
            <div className={`rounded-lg p-3 border ${darkMode ? "border-gray-800 bg-gray-900" : "border-gray-200 bg-white"}`}>
              <p className="text-xs uppercase tracking-wider text-gray-500">Reclamos</p>
              <p className="text-lg font-semibold tabular-nums mt-0.5">{stats.reclamosPendientes}</p>
              <div className="flex items-center gap-2 mt-1">
                {stats.reclamosViejos > 0 && <span className="text-xs text-red-500">{stats.reclamosViejos} +45d</span>}
                {stats.reclamosResueltosEsteMes > 0 && <span className="text-xs text-green-600">{stats.reclamosResueltosEsteMes} resueltos</span>}
                {stats.reclamosViejos === 0 && stats.reclamosResueltosEsteMes === 0 && <span className="text-xs text-gray-300">—</span>}
              </div>
            </div>
          </div>
          </div>
        ) : null
      )}

      {/* Export Reports — admin and director */}
      {(role === "admin" || role === "director") && stats && !statsLoading && <ReportExport stats={stats} darkMode={darkMode} />}

      {/* Activity Log toggle — admin only */}
      {isAdmin && (
        <div className="mb-6">
          <button
            onClick={() => setShowActivity(!showActivity)}
            className={`flex items-center gap-2 text-xs px-4 py-2 rounded-md border transition ${
              showActivity
                ? darkMode ? "bg-gray-800 border-gray-600 text-white" : "bg-gray-900 text-white border-gray-900"
                : darkMode ? "border-gray-700 text-gray-400 hover:text-gray-200" : "border-gray-200 text-gray-500 hover:text-gray-800"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
            Actividad
          </button>
          {showActivity && (
            <div className="mt-4">
              <ActivityLog darkMode={darkMode} />
            </div>
          )}
        </div>
      )}

      {/* Alerts */}
      {showAlerts && (statsLoading ? (
        <div className="mb-4 h-10 bg-gray-50 rounded-lg animate-pulse" />
      ) : alerts.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {alerts.map((a, i) => (
            <button key={i} onClick={() => router.push(a.href)}
              className={`flex items-center gap-2 px-3 py-1 rounded-lg border text-xs font-medium transition ${
                a.color === "red" ? "border-red-200 bg-red-50 text-red-700 hover:border-red-300" :
                a.color === "yellow" ? "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300" :
                "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300"
              }`}>
              {a.count > 0 && <span className="font-bold tabular-nums">{a.count}</span>}
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      ) : stats ? (
        <p className="mb-4 text-sm text-gray-500">
          <span className="text-green-600">✓</span> Todo en orden — no hay alertas pendientes
        </p>
      ) : null)}

      {/* Pending Actions Feed — collapsible, collapsed by default */}
      {showPendingActions && !pendingLoading && pendingActions.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowPendingSection(!showPendingSection)}
            className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-md border transition ${
              darkMode ? "border-gray-700 text-gray-400 hover:text-gray-200" : "border-gray-200 text-gray-500 hover:text-gray-800"
            }`}
          >
            <svg className={`w-3 h-3 transition-transform ${showPendingSection ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Acciones pendientes ({pendingTotal})
          </button>
          {showPendingSection && (
            <div className={`mt-2 rounded-lg border overflow-hidden ${darkMode ? "border-gray-800" : "border-gray-200"}`}>
              {visibleActions.map((action, i) => (
                <button
                  key={action.id}
                  onClick={() => router.push(action.href)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition ${
                    i > 0 ? (darkMode ? "border-t border-gray-800" : "border-t border-gray-100") : ""
                  } ${darkMode ? "hover:bg-gray-800/50" : "hover:bg-gray-50"}`}
                >
                  <span className="text-base shrink-0 w-6 text-center">{action.icon}</span>
                  <span className={`flex-1 text-[13px] leading-snug truncate ${darkMode ? "text-gray-200" : "text-gray-800"}`}>
                    {action.description}
                  </span>
                  <span className={`text-[11px] shrink-0 tabular-nums ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                    {action.timeContext}
                  </span>
                  <svg className={`w-3.5 h-3.5 shrink-0 ${darkMode ? "text-gray-600" : "text-gray-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit toggle */}
      <div className="flex justify-end mb-2">
        {editMode ? (
          <button onClick={saveOrder} className="text-[11px] bg-black text-white px-3 py-1 rounded-md hover:bg-gray-800 transition">Guardar</button>
        ) : (
          <button onClick={() => setEditMode(true)} className="text-[11px] text-gray-400 hover:text-black transition">Editar orden</button>
        )}
      </div>

      {/* Module grid — Apple iOS style */}
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="modules" direction="vertical">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {visibleModules.map((mod, index) => (
                <Draggable key={mod.key} draggableId={mod.key} index={index} isDragDisabled={!editMode}>
                  {(prov, snapshot) => (
                    <div
                      ref={prov.innerRef}
                      {...prov.draggableProps}
                      {...(editMode ? prov.dragHandleProps : {})}
                      onClick={() => { if (!editMode) router.push(mod.href); }}
                      className={`relative border rounded-xl p-4 text-center transition-all duration-150 cursor-pointer select-none hover:shadow-md hover:scale-[1.02] ${
                        snapshot.isDragging ? "border-gray-300 bg-white z-50 shadow-lg" : `${darkMode ? "border-gray-800 hover:border-gray-600 bg-gray-900" : "border-gray-200 hover:border-gray-300 bg-white"}`
                      } ${editMode ? "cursor-grab active:cursor-grabbing" : ""}`}
                    >
                      {editMode && (
                        <span className="absolute top-2 right-2 text-gray-300 text-xs">⠿</span>
                      )}
                      {/* Badge — absolute top-right of card */}
                      {(() => {
                        const badgeMap: Record<string, number> = {
                          cheques: badges.cheques,
                          reclamos: badges.reclamos,
                          prestamos: badges.prestamos,
                          guias: badges.guias,
                          cxc: badges.cxc,
                          upload: badges.cxc,
                        };
                        const count = badgeMap[mod.key] || 0;
                        if (count === 0) return null;
                        return (
                          <span className="absolute top-2 right-2 bg-red-500 text-white text-[9px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center leading-none">
                            {count > 99 ? "99+" : count}
                          </span>
                        );
                      })()}
                      <div className="flex items-center justify-center w-10 h-10 mx-auto text-gray-700 dark:text-gray-300">
                        {MODULE_ICONS[mod.key] || <span className="w-5 h-5 block" />}
                      </div>
                      <div className="text-[13px] font-semibold leading-tight mt-2">{mod.label}</div>
                      <div className={`text-[11px] mt-0.5 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{mod.subtitle}</div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
    </div>
  );
}

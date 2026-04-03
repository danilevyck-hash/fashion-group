"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import FGLogo from "@/components/FGLogo";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import ReportExport from "./components/ReportExport";
import ActivityLog from "./components/ActivityLog";
import SearchBar from "@/components/SearchBar";
import { useBadges } from "@/lib/hooks/useBadges";

const ALL_MODULES = [
  { key: "cxc", label: "Cuentas por Cobrar", subtitle: "Cartera de clientes", icon: "📊", href: "/admin", roles: ["admin", "secretaria", "director", "vendedor"] },
  { key: "upload", label: "Cargar CSV", subtitle: "Antigüedad de deuda", icon: "📤", href: "/upload", roles: ["admin", "secretaria"] },
  { key: "guias", label: "Guías", subtitle: "Transporte y despacho", icon: "🚚", href: "/guias", roles: ["admin", "secretaria", "bodega", "director"] },
  { key: "caja", label: "Caja Menuda", subtitle: "Control de gastos", icon: "💵", href: "/caja", roles: ["admin", "secretaria"] },
  { key: "directorio", label: "Directorio", subtitle: "Clientes y contactos", icon: "📋", href: "/directorio", roles: ["admin", "secretaria", "director", "contabilidad", "vendedor"] },
  { key: "cheques", label: "Cheques", subtitle: "Posfechados", icon: "🏦", href: "/cheques", roles: ["admin", "secretaria", "director"] },
  { key: "prestamos", label: "Préstamos", subtitle: "Colaboradores", icon: "🤝", href: "/prestamos", roles: ["admin", "contabilidad"] },
  { key: "reclamos", label: "Reclamos", subtitle: "Seguimiento", icon: "📝", href: "/reclamos", roles: ["admin", "secretaria", "director"] },
  { key: "ventas", label: "Ventas", subtitle: "Mensuales", icon: "📈", href: "/ventas", roles: ["admin", "director", "contabilidad"] },
  { key: "reebok", label: "Catálogo Reebok", subtitle: "Productos y pedidos", icon: "👟", href: "/catalogo/reebok", roles: ["admin", "vendedor", "cliente", "secretaria"] },
  { key: "camisetas", label: "Camisetas Selección", subtitle: "Pedidos y stock", icon: "👕", href: "/camisetas", roles: ["admin", "vendedor"] },
  { key: "usuarios", label: "Usuarios", subtitle: "Permisos y accesos", icon: "👥", href: "/admin/usuarios", roles: ["admin"] },
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
    } catch { /* */ }

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
      } catch { /* */ }
    } else {
      // Legacy: load from localStorage
      const r = sessionStorage.getItem("cxc_role") || "";
      try {
        const saved = localStorage.getItem(`module_order_${r}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) setModuleOrder(parsed);
        }
      } catch { /* */ }
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

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/home-stats");
      if (res.ok) setStats(await res.json());
    } catch { /* */ }
    setStatsLoading(false);
  }, []);

  useEffect(() => { if (authChecked) { loadOrder(); loadStats(); } }, [authChecked, loadOrder, loadStats]);

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
      <div className="flex items-center justify-between mb-5">
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
            {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-lg bg-gray-50 animate-pulse" />)}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
            {/* Ventas */}
            <div className={`rounded-lg px-3 py-2.5 border ${darkMode ? "border-gray-800 bg-gray-900" : "border-gray-200 bg-white"}`}>
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Ventas del mes</p>
              <p className="text-lg font-semibold tabular-nums mt-0.5">${stats.ventasMes > 0 ? (stats.ventasMes / 1000).toFixed(0) + "K" : "—"}</p>
              {stats.ventasPrev > 0 && stats.ventasMes > 0 ? (() => {
                const pct = ((stats.ventasMes - stats.ventasPrev) / stats.ventasPrev * 100);
                return <p className={`text-xs mt-1 ${pct >= 0 ? "text-green-600" : "text-red-500"}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(0)}% vs mes anterior</p>;
              })() : <p className="text-xs text-gray-300 mt-1">—</p>}
            </div>
            {/* Reclamos */}
            <div className={`rounded-lg px-3 py-2.5 border ${darkMode ? "border-gray-800 bg-gray-900" : "border-gray-200 bg-white"}`}>
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Reclamos</p>
              <p className="text-lg font-semibold tabular-nums mt-0.5">{stats.reclamosPendientes}</p>
              <div className="flex items-center gap-2 mt-1">
                {stats.reclamosViejos > 0 && <span className="text-xs text-red-500">{stats.reclamosViejos} +45d</span>}
                {stats.reclamosResueltosEsteMes > 0 && <span className="text-xs text-green-600">{stats.reclamosResueltosEsteMes} resueltos</span>}
                {stats.reclamosViejos === 0 && stats.reclamosResueltosEsteMes === 0 && <span className="text-xs text-gray-300">—</span>}
              </div>
            </div>
            {/* CxC */}
            <div className={`rounded-lg px-3 py-2.5 border ${darkMode ? "border-gray-800 bg-gray-900" : "border-gray-200 bg-white"}`}>
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Cuentas por Cobrar</p>
              <p className="text-lg font-semibold tabular-nums mt-0.5">${stats.cxcTotal > 0 ? (stats.cxcTotal / 1000).toFixed(0) + "K" : "—"}</p>
              {stats.cxcVencida > 0
                ? <p className="text-xs text-red-500 mt-1">${(stats.cxcVencida / 1000).toFixed(0)}K vencida</p>
                : <p className="text-xs text-green-600 mt-1">Sin vencidos</p>}
            </div>
            {/* Cheques */}
            <div className={`rounded-lg px-3 py-2.5 border ${darkMode ? "border-gray-800 bg-gray-900" : "border-gray-200 bg-white"}`}>
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Cheques</p>
              <p className="text-lg font-semibold tabular-nums mt-0.5">{stats.vencenEstaSemana}</p>
              <p className="text-xs text-gray-400 mt-1">
                {stats.chequesTotalPendiente > 0 ? `$${(stats.chequesTotalPendiente / 1000).toFixed(0)}K pendiente` : "—"}
              </p>
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
      {statsLoading ? (
        <div className="mb-4 h-10 bg-gray-50 rounded-lg animate-pulse" />
      ) : alerts.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {alerts.map((a, i) => (
            <button key={i} onClick={() => router.push(a.href)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition hover:shadow-sm ${
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
        <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
          <span>✓</span> Todo al dia
        </div>
      ) : null}

      {/* Edit toggle */}
      <div className="flex justify-end mb-2">
        {editMode ? (
          <button onClick={saveOrder} className="text-[11px] bg-black text-white px-3 py-1 rounded-full hover:bg-gray-800 transition">Guardar</button>
        ) : (
          <button onClick={() => setEditMode(true)} className="text-[11px] text-gray-400 hover:text-black transition">Editar orden</button>
        )}
      </div>

      {/* Module grid */}
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="modules" direction="vertical">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {visibleModules.map((mod, index) => (
                <Draggable key={mod.key} draggableId={mod.key} index={index} isDragDisabled={!editMode}>
                  {(prov, snapshot) => (
                    <div
                      ref={prov.innerRef}
                      {...prov.draggableProps}
                      {...(editMode ? prov.dragHandleProps : {})}
                      onClick={() => { if (!editMode) router.push(mod.href); }}
                      className={`relative border rounded-lg px-3 py-3 transition cursor-pointer select-none ${
                        snapshot.isDragging ? "shadow-lg border-gray-300 bg-white z-50" : `${darkMode ? "border-gray-800 hover:border-gray-600 bg-gray-900" : "border-gray-200 hover:border-gray-300 bg-white"}`
                      } ${editMode ? "cursor-grab active:cursor-grabbing" : ""}`}
                    >
                      {editMode && (
                        <span className="absolute top-2 right-2 text-gray-300 text-xs">⠿</span>
                      )}
                      <div className="text-xl mb-1.5 relative inline-block">
                        {mod.icon}
                        {(() => {
                          const badgeMap: Record<string, number> = {
                            cheques: badges.cheques,
                            reclamos: badges.reclamos,
                            prestamos: badges.prestamos,
                            guias: badges.guias,
                            cxc: badges.cxc,
                            upload: badges.cxc, // upload page badge = stale CXC data
                          };
                          const count = badgeMap[mod.key] || 0;
                          if (count === 0) return null;
                          return (
                            <span className="absolute -top-1.5 -right-3.5 bg-red-500 text-white text-[9px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center leading-none">
                              {count > 99 ? "99+" : count}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="text-[13px] font-medium leading-tight">{mod.label}</div>
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

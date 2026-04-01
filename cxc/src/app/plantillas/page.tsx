"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import FGLogo from "@/components/FGLogo";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

const ALL_MODULES = [
  { key: "cxc", label: "CXC", subtitle: "Cuentas por cobrar", icon: "📊", href: "/admin", roles: ["admin", "director", "vendedor"] },
  { key: "upload", label: "Cargar CSV", subtitle: "Antigüedad de deuda", icon: "📤", href: "/upload", roles: ["admin", "upload"] },
  { key: "guias", label: "Guías", subtitle: "Transporte y despacho", icon: "🚚", href: "/guias", roles: ["admin", "upload", "secretaria", "bodega"] },
  { key: "caja", label: "Caja Menuda", subtitle: "Control de gastos", icon: "💵", href: "/caja", roles: ["admin", "upload", "contabilidad"] },
  { key: "directorio", label: "Directorio", subtitle: "Clientes y contactos", icon: "📋", href: "/directorio", roles: ["admin", "upload", "vendedor"] },
  { key: "cheques", label: "Cheques", subtitle: "Posfechados", icon: "🏦", href: "/cheques", roles: ["admin", "upload", "director", "contabilidad"] },
  { key: "prestamos", label: "Préstamos", subtitle: "Colaboradores", icon: "🤝", href: "/prestamos", roles: ["admin", "contabilidad"] },
  { key: "reclamos", label: "Reclamos", subtitle: "Seguimiento", icon: "📝", href: "/reclamos", roles: ["admin", "upload", "secretaria"] },
  { key: "ventas", label: "Ventas", subtitle: "Mensuales", icon: "📈", href: "/ventas", roles: ["admin", "director", "contabilidad"] },
  { key: "reebok", label: "Catálogo Reebok", subtitle: "Productos y pedidos", icon: "👟", href: "/catalogo/reebok", roles: ["admin", "vendedor", "cliente", "secretaria"] },
  { key: "camisetas", label: "Camisetas Selección", subtitle: "Pedidos y stock", icon: "👕", href: "/camisetas", roles: ["admin"] },
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
  const alertRoles = ['admin', 'secretaria', 'director', 'contabilidad', 'upload'];
  const showAlerts = alertRoles.includes(role);
  const alerts: { label: string; count: number; href: string; color: "red" | "yellow" | "blue" }[] = [];
  if (stats && showAlerts) {
    if (stats.vencenHoy > 0) alerts.push({ label: "Cheques vencen hoy", count: stats.vencenHoy, href: "/cheques", color: "red" });
    if (stats.vencenEstaSemana > 0) alerts.push({ label: "Cheques vencen esta semana", count: stats.vencenEstaSemana, href: "/cheques", color: "yellow" });
    if (stats.prestamosPendientes > 0) alerts.push({ label: "Aprobaciones pendientes", count: stats.prestamosPendientes, href: "/prestamos", color: "blue" });
    if (stats.reclamosViejos > 0 && (role === 'admin' || role === 'secretaria')) alerts.push({ label: "Reclamos +45 días sin resolver", count: stats.reclamosViejos, href: "/reclamos", color: "red" });
    if (stats.cxcStale) alerts.push({ label: "Data CXC desactualizada", count: 0, href: "/upload", color: "yellow" });
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
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <FGLogo variant="horizontal" theme="light" size={36} />
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => { const next = !darkMode; setDarkMode(next); if (next) { document.documentElement.classList.add("dark"); localStorage.setItem("fg_dark_mode", "1"); } else { document.documentElement.classList.remove("dark"); localStorage.setItem("fg_dark_mode", "0"); } }} className="text-sm text-gray-400 hover:text-black transition px-1">{darkMode ? "☀" : "◑"}</button>
          <button onClick={() => { sessionStorage.clear(); router.push("/"); }} className="text-sm text-gray-400 hover:text-black transition">Salir</button>
        </div>
      </div>

      {/* Greeting */}
      <div className="mb-8">
        <h1 className={`text-2xl font-light ${darkMode ? "text-gray-100" : "text-gray-800"}`}>{getGreeting()}{displayName ? `, ${displayName}` : ""}</h1>
        <p className="text-sm text-gray-400 mt-1">{getDateLabel()}</p>
      </div>

      {/* KPI Cards — admin and director only */}
      {(role === "admin" || role === "director") && (
        statsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {[1,2,3,4].map(i => <div key={i} className="h-24 rounded-2xl bg-gray-50 animate-pulse" />)}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {/* Ventas */}
            <div className={`rounded-2xl p-4 border ${darkMode ? "border-gray-800 bg-gray-900" : "border-gray-100 bg-white"}`}>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Ventas del mes</p>
              <p className="text-xl font-semibold tabular-nums">${stats.ventasMes > 0 ? (stats.ventasMes / 1000).toFixed(0) + "K" : "—"}</p>
              {stats.ventasPrev > 0 && stats.ventasMes > 0 ? (() => {
                const pct = ((stats.ventasMes - stats.ventasPrev) / stats.ventasPrev * 100);
                return <p className={`text-xs mt-1 ${pct >= 0 ? "text-green-600" : "text-red-500"}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(0)}% vs mes anterior</p>;
              })() : <p className="text-xs text-gray-300 mt-1">—</p>}
            </div>
            {/* Reclamos */}
            <div className={`rounded-2xl p-4 border ${darkMode ? "border-gray-800 bg-gray-900" : "border-gray-100 bg-white"}`}>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Reclamos</p>
              <p className="text-xl font-semibold tabular-nums">{stats.reclamosPendientes}</p>
              <div className="flex items-center gap-2 mt-1">
                {stats.reclamosViejos > 0 && <span className="text-xs text-red-500">{stats.reclamosViejos} +45d</span>}
                {stats.reclamosResueltosEsteMes > 0 && <span className="text-xs text-green-600">{stats.reclamosResueltosEsteMes} resueltos</span>}
                {stats.reclamosViejos === 0 && stats.reclamosResueltosEsteMes === 0 && <span className="text-xs text-gray-300">—</span>}
              </div>
            </div>
            {/* CxC */}
            <div className={`rounded-2xl p-4 border ${darkMode ? "border-gray-800 bg-gray-900" : "border-gray-100 bg-white"}`}>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Cartera (CxC)</p>
              <p className="text-xl font-semibold tabular-nums">${stats.cxcTotal > 0 ? (stats.cxcTotal / 1000).toFixed(0) + "K" : "—"}</p>
              {stats.cxcVencida > 0
                ? <p className="text-xs text-red-500 mt-1">${(stats.cxcVencida / 1000).toFixed(0)}K vencida</p>
                : <p className="text-xs text-green-600 mt-1">Sin vencidos</p>}
            </div>
            {/* Cheques */}
            <div className={`rounded-2xl p-4 border ${darkMode ? "border-gray-800 bg-gray-900" : "border-gray-100 bg-white"}`}>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Cheques</p>
              <p className="text-xl font-semibold tabular-nums">{stats.vencenEstaSemana}</p>
              <p className="text-xs text-gray-400 mt-1">
                {stats.chequesTotalPendiente > 0 ? `$${(stats.chequesTotalPendiente / 1000).toFixed(0)}K pendiente` : "—"}
              </p>
            </div>
          </div>
        ) : null
      )}

      {/* Alerts */}
      {statsLoading ? (
        <div className="mb-6 space-y-2">
          {[1, 2].map(i => <div key={i} className="h-12 bg-gray-50 rounded-xl animate-pulse" />)}
        </div>
      ) : alerts.length > 0 ? (
        <div className="mb-6 space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Acciones de hoy</div>
          {alerts.map((a, i) => (
            <button key={i} onClick={() => router.push(a.href)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition hover:shadow-sm ${
                a.color === "red" ? "border-red-200 bg-red-50 hover:border-red-300" :
                a.color === "yellow" ? "border-amber-200 bg-amber-50 hover:border-amber-300" :
                "border-blue-200 bg-blue-50 hover:border-blue-300"
              }`}>
              <span className={`text-lg ${
                a.color === "red" ? "text-red-500" :
                a.color === "yellow" ? "text-amber-500" :
                "text-blue-500"
              }`}>
                {a.color === "red" ? "⚠" : a.color === "yellow" ? "⏳" : "📋"}
              </span>
              <span className={`text-sm flex-1 ${
                a.color === "red" ? "text-red-700" :
                a.color === "yellow" ? "text-amber-700" :
                "text-blue-700"
              }`}>{a.label}</span>
              {a.count > 0 && (
                <span className={`text-lg font-semibold tabular-nums ${
                  a.color === "red" ? "text-red-600" :
                  a.color === "yellow" ? "text-amber-600" :
                  "text-blue-600"
                }`}>{a.count}</span>
              )}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 flex-shrink-0"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          ))}
        </div>
      ) : stats ? (
        <div className="mb-6 flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <span className="text-emerald-500 text-lg">✓</span>
          <span className="text-sm text-emerald-700">Todo al día — sin alertas pendientes</span>
        </div>
      ) : null}

      {/* Edit toggle */}
      <div className="flex justify-end mb-3">
        {editMode ? (
          <button onClick={saveOrder} className="text-xs bg-black text-white px-4 py-1.5 rounded-full hover:bg-gray-800 transition">Guardar orden</button>
        ) : (
          <button onClick={() => setEditMode(true)} className="text-xs text-gray-400 hover:text-black transition flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            Editar orden
          </button>
        )}
      </div>

      {/* Module grid */}
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="modules" direction="vertical">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {visibleModules.map((mod, index) => (
                <Draggable key={mod.key} draggableId={mod.key} index={index} isDragDisabled={!editMode}>
                  {(prov, snapshot) => (
                    <div
                      ref={prov.innerRef}
                      {...prov.draggableProps}
                      {...(editMode ? prov.dragHandleProps : {})}
                      onClick={() => { if (!editMode) router.push(mod.href); }}
                      className={`relative border rounded-2xl p-4 transition cursor-pointer select-none ${
                        snapshot.isDragging ? "shadow-lg border-gray-300 bg-white z-50" : `${darkMode ? "border-gray-800 hover:border-gray-600 bg-gray-900" : "border-gray-100 hover:border-gray-300 hover:shadow-sm bg-white"}`
                      } ${editMode ? "cursor-grab active:cursor-grabbing" : ""}`}
                    >
                      {editMode && (
                        <span className="absolute top-2 right-2 text-gray-300 text-xs">⠿</span>
                      )}
                      <div className="text-2xl mb-2">{mod.icon}</div>
                      <div className="text-sm font-medium">{mod.label}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{mod.subtitle}</div>
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

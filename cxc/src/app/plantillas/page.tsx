"use client";

import { useState, useEffect, useCallback, ReactNode } from "react";
import { useRouter } from "next/navigation";
import FGLogo from "@/components/FGLogo";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const ROLE_NAMES: Record<string, string> = { admin: "Daniel", director: "Director", upload: "Secretaria", david: "David", contabilidad: "Contabilidad", vendedor: "Vendedor", cliente: "Cliente" };
const ROLE_LABELS: Record<string, string> = { admin: "Administrador", upload: "Secretaria", director: "Director", david: "David", contabilidad: "Contabilidad", vendedor: "Vendedor", cliente: "Cliente" };
function fmt(n: number) { return (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
const fmtDate = (d: string) => { const dt = new Date(d); return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`; };

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

interface CxcSummary { totalCxc: number; vencidoMas121: number; clientesCriticos: number; corrientePct: number; vigilanciaPct: number; vencidoPct: number; lastUpload: string | null; lastUploadEmpresa: string | null; empresasCount?: number; }
interface HomeStats { reclamosPendientes: number; vencenEstaSemana: number; vencenHoy: number; cajaDisponible: number | null; cajaFondo: number | null; guiasEsteMes: number; totalClientes: number; }

interface ModuleDef {
  id: string;
  label: string;
  desc: string;
  ruta: string;
  icon: ReactNode;
}

const icons: Record<string, ReactNode> = {
  guias: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  upload: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  caja: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/><path d="M6 14h4"/></svg>,
  reclamos: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg>,
  cheques: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg>,
  directorio: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  ventas: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg>,
  prestamos: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>,
  catalogo_reebok: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>,
};

const ALL_MODULES: ModuleDef[] = [
  { id: "guias", label: "Guía de Transporte", desc: "Registro y gestión de guías de envío", ruta: "/guias", icon: icons.guias },
  { id: "upload", label: "Carga de Archivos", desc: "Importar CSV de cuentas por cobrar", ruta: "/upload", icon: icons.upload },
  { id: "caja", label: "Caja Menuda", desc: "Control de gastos y fondo rotativo", ruta: "/caja", icon: icons.caja },
  { id: "reclamos", label: "Reclamos a Proveedores", desc: "Gestión de reclamos y notas de crédito", ruta: "/reclamos", icon: icons.reclamos },
  { id: "cheques", label: "Cheques Posfechados", desc: "Registro de cheques con recordatorios", ruta: "/cheques", icon: icons.cheques },
  { id: "directorio", label: "Directorio de Clientes", desc: "Base de datos de clientes y contactos", ruta: "/directorio", icon: icons.directorio },
  { id: "ventas", label: "Ventas Mensuales", desc: "Facturacion y margen por empresa", ruta: "/ventas", icon: icons.ventas },
  { id: "prestamos", label: "Préstamos a Colaboradores", desc: "Control de préstamos y deducciones", ruta: "/prestamos", icon: icons.prestamos },
  { id: "catalogo_reebok", label: "Catálogo Reebok", desc: "Catálogo de productos y pedidos", ruta: "/catalogo/reebok", icon: icons.catalogo_reebok },
];

const DEFAULT_ORDER = ALL_MODULES.map(m => m.id);

function SortableModuleCard({ mod, onClick, subtitle }: { mod: ModuleDef; onClick: () => void; subtitle?: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: mod.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : "auto" as const,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className="relative text-left border border-gray-100 rounded-2xl p-5 hover:border-gray-300 hover:shadow-sm bg-white group w-full min-h-[140px] cursor-grab active:cursor-grabbing touch-none select-none"
    >
      <div onClick={onClick}>
        <div className="bg-gray-100 rounded-xl p-2.5 w-10 h-10 flex items-center justify-center mb-3 text-gray-700">{mod.icon}</div>
        <div className="text-sm font-medium">{mod.label}</div>
        <div className="text-xs text-gray-400 mt-0.5">{mod.desc}</div>
        {subtitle}
        <span className="absolute bottom-4 right-5 text-gray-400 group-hover:text-gray-700 transition text-lg font-medium">→</span>
      </div>
    </div>
  );
}

function OverlayCard({ mod }: { mod: ModuleDef }) {
  return (
    <div className="relative text-left border border-gray-200 rounded-2xl p-5 bg-white w-full min-h-[140px] shadow-2xl scale-105 opacity-90 rotate-[2deg]">
      <div className="bg-gray-100 rounded-xl p-2.5 w-10 h-10 flex items-center justify-center mb-3 text-gray-700">{mod.icon}</div>
      <div className="text-sm font-medium">{mod.label}</div>
      <div className="text-xs text-gray-400 mt-0.5">{mod.desc}</div>
      <span className="absolute bottom-4 right-5 text-gray-400 text-lg font-medium">→</span>
    </div>
  );
}

export default function PlantillasPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState("");
  const [modulos, setModulos] = useState<string[]>([]);
  const [moduleOrder, setModuleOrder] = useState<string[]>(DEFAULT_ORDER);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cxc, setCxc] = useState<CxcSummary | null>(null);
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // CAMBIO 1: Only enable TouchSensor on desktop (>=640px) to avoid scroll conflicts on mobile
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 8 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } });
  const sensors = useSensors(...(isDesktop ? [pointerSensor, touchSensor] : [pointerSensor]));

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsDesktop(window.innerWidth >= 640);
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!r) { router.push("/"); return; }
    if (r === "cliente") { router.push("/catalogo/reebok"); return; }
    setRole(r); setAuthChecked(true);
    setDarkMode(localStorage.getItem("fg_dark_mode") === "1");

    try {
      const saved = localStorage.getItem(`module_order_${r}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) setModuleOrder(parsed);
      }
    } catch { /* */ }

    fetch(`/api/admin/usuarios?role=${encodeURIComponent(r)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.modulos) setModulos(data.modulos); })
      .catch(() => {});
  }, [router]);

  const loadCxc = useCallback(async () => { try { const res = await fetch("/api/cxc-summary"); if (res.ok) setCxc(await res.json()); } catch { /* */ } }, []);
  const loadStats = useCallback(async () => { try { const res = await fetch("/api/home-stats"); if (res.ok) setStats(await res.json()); } catch { /* */ } }, []);

  useEffect(() => {
    if (authChecked) { loadStats(); if (role === "admin" || role === "director") loadCxc(); }
  }, [authChecked, role, loadCxc, loadStats]);

  if (!authChecked) return null;

  const hasAccess = (mod: string) => role === "admin" || modulos.includes(mod);
  const isAdmin = role === "admin";

  const visibleModules = moduleOrder
    .filter(id => hasAccess(id) && ALL_MODULES.some(m => m.id === id))
    .map(id => ALL_MODULES.find(m => m.id === id)!);
  ALL_MODULES.forEach(m => {
    if (hasAccess(m.id) && !visibleModules.some(v => v.id === m.id)) visibleModules.push(m);
  });
  const visibleIds = visibleModules.map(m => m.id);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    try { navigator?.vibrate?.(10); } catch { /* */ }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = visibleIds.indexOf(String(active.id));
    const newIndex = visibleIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const newVisible = arrayMove(visibleIds, oldIndex, newIndex);
    const filtered = moduleOrder.filter(id => !newVisible.includes(id));
    const finalOrder = [...newVisible, ...filtered];
    setModuleOrder(finalOrder);
    localStorage.setItem(`module_order_${role}`, JSON.stringify(finalOrder));
  }

  const activeModule = activeId ? ALL_MODULES.find(m => m.id === activeId) : null;

  function getSubtitle(id: string): ReactNode {
    if (!stats) return null;
    switch (id) {
      case "guias": return <p className="text-[11px] text-gray-400 mt-2">{stats.guiasEsteMes} {stats.guiasEsteMes === 1 ? 'guía' : 'guías'} este mes</p>;
      case "caja": return stats.cajaDisponible !== null ? <p className={`text-[11px] mt-2 font-medium ${stats.cajaFondo && stats.cajaDisponible / stats.cajaFondo < 0.2 ? "text-red-500" : stats.cajaFondo && stats.cajaDisponible / stats.cajaFondo < 0.5 ? "text-amber-500" : "text-gray-400"}`}>${stats.cajaDisponible.toFixed(2)} disponibles</p> : null;
      case "reclamos": return <p className={`text-[11px] mt-2 font-medium ${stats.reclamosPendientes > 0 ? "text-amber-500" : "text-gray-400"}`}>{stats.reclamosPendientes} pendientes</p>;
      case "cheques": return <p className={`text-[11px] mt-2 font-medium ${stats.vencenHoy > 0 ? "text-red-500" : stats.vencenEstaSemana > 0 ? "text-amber-500" : "text-gray-400"}`}>{stats.vencenHoy > 0 ? `${stats.vencenHoy} vencen hoy` : stats.vencenEstaSemana > 0 ? `${stats.vencenEstaSemana} vencen esta semana` : "Al día"}</p>;
      case "directorio": return <p className="text-[11px] text-gray-400 mt-2">{stats.totalClientes} clientes</p>;
      default: return null;
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="flex items-end justify-between mb-10">
        <div>
          <FGLogo variant="horizontal" theme="light" size={36} />
          <p className="text-sm text-gray-400 mt-2">Sistema Interno</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => { const next = !darkMode; setDarkMode(next); if (next) { document.documentElement.classList.add("dark"); localStorage.setItem("fg_dark_mode", "1"); } else { document.documentElement.classList.remove("dark"); localStorage.setItem("fg_dark_mode", "0"); } }} title={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} className="text-sm text-gray-400 hover:text-black transition px-1">{darkMode ? "☀" : "◑"}</button>
          <span className="text-sm text-gray-400">{ROLE_LABELS[role] || role}</span>
          <span className="text-gray-200">·</span>
          <button onClick={() => { sessionStorage.removeItem("cxc_role"); router.push("/"); }} className="text-sm text-gray-400 hover:text-black transition">Salir</button>
        </div>
      </div>

      {/* CAMBIO 6: Contextual greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-light text-gray-800">{getGreeting()}, {ROLE_NAMES[role] || role}</h1>
        <p className="text-sm text-gray-400 mt-1">{getDateLabel()}</p>
      </div>

      {/* CXC Card */}
      {hasAccess("cxc") && cxc && (
        <button onClick={() => router.push("/admin")} className="w-full text-left border border-gray-100 rounded-2xl p-5 mb-4 hover:border-gray-300 transition cursor-pointer group">
          <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-3">Panel CXC</div>
          <div className="flex gap-8 flex-wrap">
            <div><div className="text-xl font-semibold tabular-nums whitespace-nowrap">${fmt(cxc.totalCxc)}</div><div className="text-xs text-gray-400 mt-0.5">Total CXC</div></div>
            <div><div className="text-xl font-semibold text-red-600 tabular-nums whitespace-nowrap">${fmt(cxc.vencidoMas121)}</div><div className="text-xs text-gray-400 mt-0.5">Vencido +121d</div></div>
            <div><div className="text-xl font-semibold tabular-nums">{cxc.clientesCriticos}</div><div className="text-xs text-gray-400 mt-0.5">Clientes críticos</div></div>
          </div>
          <div className="mt-3 flex h-1.5 rounded-full overflow-hidden gap-px">
            <div style={{ flex: cxc.corrientePct, background: "#22c55e" }} className="rounded-l-full" />
            <div style={{ flex: cxc.vigilanciaPct, background: "#facc15" }} />
            <div style={{ flex: cxc.vencidoPct, background: "#f87171" }} className="rounded-r-full" />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-gray-400">Corriente {Math.round(cxc.corrientePct)}%</span>
            <span className="text-[10px] text-amber-500">Vigilancia {Math.round(cxc.vigilanciaPct)}%</span>
            <span className="text-[10px] text-red-400">Vencido {Math.round(cxc.vencidoPct)}%</span>
          </div>
          {/* CAMBIO 4: Show empresas count + upload date */}
          {cxc.lastUpload && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {cxc.empresasCount && <span className="text-[10px] text-gray-500 font-medium">{cxc.empresasCount} empresa{cxc.empresasCount > 1 ? "s" : ""}</span>}
              <span className="text-[10px] text-gray-400">· datos al</span>
              <span className="text-[10px] text-gray-500 font-medium">{fmtDate(cxc.lastUpload)}</span>
              {(() => { const d = Math.floor((Date.now() - new Date(cxc.lastUpload).getTime()) / 86400000); return d > 7 ? <span className="text-[10px] text-amber-500 font-medium">· desactualizados ({d}d)</span> : null; })()}
            </div>
          )}
          <div className="mt-2 flex justify-end">
            <span className="text-[11px] text-gray-400 group-hover:text-gray-600 transition">Ver panel →</span>
          </div>
        </button>
      )}

      {/* Admin: Usuarios link */}
      {isAdmin && (
        <button onClick={() => router.push("/admin/usuarios")} className="w-full text-left border border-gray-100 rounded-2xl p-4 mb-4 hover:border-gray-300 transition cursor-pointer group flex items-center gap-3">
          <div className="bg-gray-100 rounded-xl p-2.5 w-10 h-10 flex items-center justify-center text-gray-700"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></div>
          <div>
            <div className="text-sm font-medium">Usuarios y Permisos</div>
            <div className="text-xs text-gray-400">Gestionar roles y acceso a módulos</div>
          </div>
          <span className="ml-auto text-gray-400 group-hover:text-gray-700 transition text-lg font-medium">→</span>
        </button>
      )}

      {/* Draggable module grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-hidden">
            {visibleModules.map((mod) => (
              <SortableModuleCard
                key={mod.id}
                mod={mod}
                onClick={() => router.push(mod.ruta)}
                subtitle={getSubtitle(mod.id)}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
          {activeModule ? <OverlayCard mod={activeModule} /> : null}
        </DragOverlay>
      </DndContext>

      {/* CAMBIO 2: Drag hint — desktop only */}
      <p className="hidden sm:block text-[11px] text-gray-300 text-center mt-2">Mantén presionado para reordenar</p>
    </div>
  );
}

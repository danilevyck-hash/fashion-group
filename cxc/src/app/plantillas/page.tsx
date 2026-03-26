"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import FGLogo from "@/components/FGLogo";

const ROLE_LABELS: Record<string, string> = { admin: "Administrador", upload: "Secretaria", director: "Director", david: "David" };
function fmt(n: number) { return (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
const fmtDate = (d: string) => { const dt = new Date(d); return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`; };

interface CxcSummary { totalCxc: number; vencidoMas121: number; clientesCriticos: number; corrientePct: number; vigilanciaPct: number; vencidoPct: number; lastUpload: string | null; lastUploadEmpresa: string | null; }
interface HomeStats { reclamosPendientes: number; vencenEstaSemana: number; vencenHoy: number; cajaDisponible: number | null; cajaFondo: number | null; guiasEsteMes: number; totalClientes: number; }

export default function PlantillasPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState("");
  const [cxc, setCxc] = useState<CxcSummary | null>(null);
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!r) { router.push("/"); return; }
    setRole(r); setAuthChecked(true);
    setDarkMode(localStorage.getItem("fg_dark_mode") === "1");
  }, [router]);

  const loadCxc = useCallback(async () => { try { const res = await fetch("/api/cxc-summary"); if (res.ok) setCxc(await res.json()); } catch { /* */ } }, []);
  const loadStats = useCallback(async () => { try { const res = await fetch("/api/home-stats"); if (res.ok) setStats(await res.json()); } catch { /* */ } }, []);

  useEffect(() => {
    if (authChecked) { loadStats(); if (role === "admin" || role === "director") loadCxc(); }
  }, [authChecked, role, loadCxc, loadStats]);

  if (!authChecked) return null;

  const isSecretaria = role === "upload" || role === "secretaria";
  const isAdminOrDirector = role === "admin" || role === "director";

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

      {/* CXC Card */}
      {isAdminOrDirector && cxc && (
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
          {cxc.lastUpload && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-gray-400">Datos al</span>
              <span className="text-[10px] text-gray-500 font-medium">{fmtDate(cxc.lastUpload)}</span>
              {cxc.lastUploadEmpresa && <span className="text-[10px] text-gray-300">· {cxc.lastUploadEmpresa}</span>}
              {(() => { const d = Math.floor((Date.now() - new Date(cxc.lastUpload).getTime()) / 86400000); return d > 7 ? <span className="text-[10px] text-amber-500 font-medium">· desactualizados ({d}d)</span> : null; })()}
            </div>
          )}
          <div className="mt-2 flex justify-end">
            <span className="text-[11px] text-gray-400 group-hover:text-gray-600 transition">Ver panel →</span>
          </div>
        </button>
      )}

      {/* Module cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Guías */}
        <button onClick={() => router.push("/guias")} className="relative text-left border border-gray-100 rounded-2xl p-5 hover:border-gray-300 hover:shadow-sm transition bg-white group w-full min-h-[140px]">
          <div className="bg-gray-100 rounded-xl p-2.5 w-10 h-10 flex items-center justify-center mb-3 text-gray-700"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div>
          <div className="text-sm font-medium">Guía de Transporte</div>
          <div className="text-xs text-gray-400 mt-0.5">Registro y gestión de guías de envío</div>
          {stats && <p className="text-[11px] text-gray-400 mt-2">{stats.guiasEsteMes} {stats.guiasEsteMes === 1 ? 'guía' : 'guías'} este mes</p>}
          <span className="absolute bottom-4 right-5 text-gray-400 group-hover:text-gray-700 transition text-lg font-medium">→</span>
        </button>

        {/* Carga */}
        <button onClick={() => router.push("/upload")} className="relative text-left border border-gray-100 rounded-2xl p-5 hover:border-gray-300 hover:shadow-sm transition bg-white group w-full min-h-[140px]">
          <div className="bg-gray-100 rounded-xl p-2.5 w-10 h-10 flex items-center justify-center mb-3 text-gray-700"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>
          <div className="text-sm font-medium">Carga de Archivos</div>
          <div className="text-xs text-gray-400 mt-0.5">Importar CSV de cuentas por cobrar</div>
          {isSecretaria && <p className="text-[11px] text-amber-600 mt-2 font-medium">⚠ Recordar hacerlo todos los lunes</p>}
          <span className="absolute bottom-4 right-5 text-gray-400 group-hover:text-gray-700 transition text-lg font-medium">→</span>
        </button>

        {/* Caja */}
        <button onClick={() => router.push("/caja")} className="relative text-left border border-gray-100 rounded-2xl p-5 hover:border-gray-300 hover:shadow-sm transition bg-white group w-full min-h-[140px]">
          <div className="bg-gray-100 rounded-xl p-2.5 w-10 h-10 flex items-center justify-center mb-3 text-gray-700"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/><path d="M6 14h4"/></svg></div>
          <div className="text-sm font-medium">Caja Menuda</div>
          <div className="text-xs text-gray-400 mt-0.5">Control de gastos y fondo rotativo</div>
          {stats && stats.cajaDisponible !== null && (
            <p className={`text-[11px] mt-2 font-medium ${stats.cajaFondo && stats.cajaDisponible / stats.cajaFondo < 0.2 ? "text-red-500" : stats.cajaFondo && stats.cajaDisponible / stats.cajaFondo < 0.5 ? "text-amber-500" : "text-gray-400"}`}>
              ${stats.cajaDisponible.toFixed(2)} disponibles
            </p>
          )}
          <span className="absolute bottom-4 right-5 text-gray-400 group-hover:text-gray-700 transition text-lg font-medium">→</span>
        </button>

        {/* Reclamos */}
        <button onClick={() => router.push("/reclamos")} className="relative text-left border border-gray-100 rounded-2xl p-5 hover:border-gray-300 hover:shadow-sm transition bg-white group w-full min-h-[140px]">
          <div className="bg-gray-100 rounded-xl p-2.5 w-10 h-10 flex items-center justify-center mb-3 text-gray-700"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg></div>
          <div className="text-sm font-medium">Reclamos a Proveedores</div>
          <div className="text-xs text-gray-400 mt-0.5">Gestión de reclamos y notas de crédito</div>
          {stats && <p className={`text-[11px] mt-2 font-medium ${stats.reclamosPendientes > 0 ? "text-amber-500" : "text-gray-400"}`}>{stats.reclamosPendientes} pendientes</p>}
          <span className="absolute bottom-4 right-5 text-gray-400 group-hover:text-gray-700 transition text-lg font-medium">→</span>
        </button>

        {/* Cheques */}
        <button onClick={() => router.push("/cheques")} className="relative text-left border border-gray-100 rounded-2xl p-5 hover:border-gray-300 hover:shadow-sm transition bg-white group w-full min-h-[140px]">
          <div className="bg-gray-100 rounded-xl p-2.5 w-10 h-10 flex items-center justify-center mb-3 text-gray-700"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg></div>
          <div className="text-sm font-medium">Cheques Posfechados</div>
          <div className="text-xs text-gray-400 mt-0.5">Registro de cheques con recordatorios</div>
          {stats && <p className={`text-[11px] mt-2 font-medium ${stats.vencenHoy > 0 ? "text-red-500" : stats.vencenEstaSemana > 0 ? "text-amber-500" : "text-gray-400"}`}>
            {stats.vencenHoy > 0 ? `${stats.vencenHoy} vencen hoy` : stats.vencenEstaSemana > 0 ? `${stats.vencenEstaSemana} vencen esta semana` : "Al día"}
          </p>}
          <span className="absolute bottom-4 right-5 text-gray-400 group-hover:text-gray-700 transition text-lg font-medium">→</span>
        </button>

        {/* Directorio */}
        <button onClick={() => router.push("/directorio")} className="relative text-left border border-gray-100 rounded-2xl p-5 hover:border-gray-300 hover:shadow-sm transition bg-white group w-full min-h-[140px]">
          <div className="bg-gray-100 rounded-xl p-2.5 w-10 h-10 flex items-center justify-center mb-3 text-gray-700"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
          <div className="text-sm font-medium">Directorio de Clientes</div>
          <div className="text-xs text-gray-400 mt-0.5">Base de datos de clientes y contactos</div>
          {stats && <p className="text-[11px] text-gray-400 mt-2">{stats.totalClientes} clientes</p>}
          <span className="absolute bottom-4 right-5 text-gray-400 group-hover:text-gray-700 transition text-lg font-medium">→</span>
        </button>

        {/* Ventas — admin/director only */}
        {isAdminOrDirector && (
          <button onClick={() => router.push("/ventas")} className="relative text-left border border-gray-100 rounded-2xl p-5 hover:border-gray-300 hover:shadow-sm transition bg-white group w-full min-h-[140px]">
            <div className="bg-gray-100 rounded-xl p-2.5 w-10 h-10 flex items-center justify-center mb-3 text-gray-700"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg></div>
            <div className="text-sm font-medium">Ventas Mensuales</div>
            <div className="text-xs text-gray-400 mt-0.5">Facturacion y margen por empresa</div>
            <span className="absolute bottom-4 right-5 text-gray-400 group-hover:text-gray-700 transition text-lg font-medium">→</span>
          </button>
        )}

        {/* Préstamos — admin/director/contabilidad */}
        {!isSecretaria && (
          <button onClick={() => router.push("/prestamos")} className="relative text-left border border-gray-100 rounded-2xl p-5 hover:border-gray-300 hover:shadow-sm transition bg-white group w-full min-h-[140px]">
            <div className="bg-gray-100 rounded-xl p-2.5 w-10 h-10 flex items-center justify-center mb-3 text-gray-700"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg></div>
            <div className="text-sm font-medium">Préstamos a Colaboradores</div>
            <div className="text-xs text-gray-400 mt-0.5">Control de préstamos y deducciones</div>
            <span className="absolute bottom-4 right-5 text-gray-400 group-hover:text-gray-700 transition text-lg font-medium">→</span>
          </button>
        )}
      </div>
    </div>
  );
}

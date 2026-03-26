"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import FGLogo from "@/components/FGLogo";

const ROLE_LABELS: Record<string, string> = { admin: "Administrador", upload: "Secretaria", director: "Director", david: "David" };

function fmt(n: number) { return (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

interface CxcSummary { totalCxc: number; vencidoMas121: number; clientesCriticos: number; corrientePct: number; vigilanciaPct: number; vencidoPct: number; lastUpload: string | null; lastUploadEmpresa: string | null; }

const CARDS = [
  { title: "Guía de Transporte", description: "Registro y gestión de guías de envío", href: "/guias", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> },
  { title: "Carga de Archivos", description: "Importar CSV de cuentas por cobrar", href: "/upload", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>, showReminder: true },
  { title: "Caja Menuda", description: "Control de gastos y fondo rotativo", href: "/caja", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/><path d="M6 14h4"/></svg> },
  { title: "Reclamos a Proveedores", description: "Gestión de reclamos y notas de crédito", href: "/reclamos", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg> },
  { title: "Cheques Posfechados", description: "Registro de cheques con recordatorios", href: "/cheques", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg> },
  { title: "Directorio de Clientes", description: "Base de datos de clientes y contactos", href: "/directorio", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
];

export default function PlantillasPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState("");
  const [cxc, setCxc] = useState<CxcSummary | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!r) { router.push("/"); return; }
    setRole(r); setAuthChecked(true);
  }, [router]);

  const loadCxc = useCallback(async () => {
    try { const res = await fetch("/api/cxc-summary"); if (res.ok) setCxc(await res.json()); } catch { /* */ }
  }, []);

  useEffect(() => {
    if (authChecked && (role === "admin" || role === "director")) loadCxc();
  }, [authChecked, role, loadCxc]);

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
          <span className="text-sm text-gray-400">{ROLE_LABELS[role] || role}</span>
          <button onClick={() => { sessionStorage.removeItem("cxc_role"); router.push("/"); }} className="text-sm text-gray-400 hover:text-black transition">Salir</button>
        </div>
      </div>

      {/* CXC Card */}
      {isAdminOrDirector && cxc && (
        <button onClick={() => router.push("/admin")} className="w-full text-left border border-gray-100 rounded-2xl p-5 mb-4 hover:border-gray-300 transition">
          <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-3">Panel CXC</div>
          <div className="flex gap-8">
            <div><div className="text-xl font-semibold tabular-nums">${fmt(cxc.totalCxc)}</div><div className="text-xs text-gray-400 mt-0.5">Total CXC</div></div>
            <div><div className="text-xl font-semibold text-red-600 tabular-nums">${fmt(cxc.vencidoMas121)}</div><div className="text-xs text-gray-400 mt-0.5">Vencido +121d</div></div>
            <div><div className="text-xl font-semibold tabular-nums">{cxc.clientesCriticos}</div><div className="text-xs text-gray-400 mt-0.5">Clientes críticos</div></div>
          </div>
          <div className="mt-3 flex h-1.5 rounded-full overflow-hidden gap-px">
            <div style={{ flex: cxc.corrientePct, background: "#22c55e" }} className="rounded-l-full" />
            <div style={{ flex: cxc.vigilanciaPct, background: "#facc15" }} />
            <div style={{ flex: cxc.vencidoPct, background: "#f87171" }} className="rounded-r-full" />
          </div>
          {cxc.lastUpload && (
            <p className="text-[10px] text-gray-400 mt-2">Última carga: {new Date(cxc.lastUpload).toLocaleDateString("es-PA")}{cxc.lastUploadEmpresa ? ` (${cxc.lastUploadEmpresa})` : ""}</p>
          )}
        </button>
      )}

      {/* Module cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CARDS.map((card) => (
          <button key={card.href} onClick={() => router.push(card.href)}
            className="relative text-left border border-gray-100 rounded-2xl p-5 hover:border-gray-300 hover:shadow-sm transition bg-white group w-full">
            <div className="bg-gray-50 rounded-xl p-2.5 w-10 h-10 flex items-center justify-center mb-3 text-gray-600">{card.icon}</div>
            <div className="text-sm font-medium">{card.title}</div>
            <div className="text-xs text-gray-400 mt-0.5">{card.description}</div>
            {card.showReminder && isSecretaria && <p className="text-[11px] text-amber-600 mt-2 font-medium">⚠ Recordar hacerlo todos los lunes</p>}
            <span className="absolute bottom-5 right-5 text-gray-300 group-hover:text-gray-500 transition text-base">→</span>
          </button>
        ))}
      </div>
    </div>
  );
}

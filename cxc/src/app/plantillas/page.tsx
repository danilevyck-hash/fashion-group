"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import FGLogo from "@/components/FGLogo";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  upload: "Secretaria",
  director: "Director",
  david: "David",
};

const CARDS = [
  {
    title: "Guía de Transporte",
    description: "Registro y gestión de guías de envío",
    href: "/guias",
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 3h15v13H1z" /><path d="M16 8h4l3 3v5h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>,
  },
  {
    title: "Carga de Archivos",
    description: "Importar CSV de cuentas por cobrar",
    href: "/upload",
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
    showReminder: true,
  },
  {
    title: "Caja Menuda",
    description: "Control de gastos y fondo rotativo",
    href: "/caja",
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 10h20" /><path d="M6 14h4" /></svg>,
  },
  {
    title: "Reclamos a Proveedores",
    description: "Gestión de reclamos y notas de crédito",
    href: "/reclamos",
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 14l2 2 4-4" /></svg>,
  },
  {
    title: "Cheques Posfechados",
    description: "Registro de cheques con recordatorios automáticos",
    href: "/cheques",
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 12l2 2 4-4" /></svg>,
  },
  {
    title: "Directorio de Clientes",
    description: "Base de datos de clientes y contactos",
    href: "/directorio",
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  },
];

export default function PlantillasPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!r) { router.push("/"); return; }
    setRole(r);
    setAuthChecked(true);
  }, [router]);

  if (!authChecked) return null;

  const isSecretaria = role === "upload" || role === "secretaria";

  function logout() {
    sessionStorage.removeItem("cxc_role");
    router.push("/");
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="flex items-end justify-between mb-10">
        <div>
          <FGLogo variant="horizontal" theme="light" size={36} />
          <p className="text-sm text-gray-400 mt-2">Sistema Interno</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{ROLE_LABELS[role] || role}</span>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-black transition">
            Salir
          </button>
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CARDS.map((card) => (
          <button
            key={card.href}
            onClick={() => router.push(card.href)}
            className="relative text-left border border-gray-100 rounded-2xl p-6 hover:border-gray-300 hover:shadow-sm transition bg-white group"
          >
            <div className="bg-gray-50 rounded-full p-3 w-12 h-12 flex items-center justify-center">
              {card.icon}
            </div>
            <div className="text-base font-semibold mt-4">{card.title}</div>
            <div className="text-sm text-gray-400 mt-1">{card.description}</div>
            {card.showReminder && isSecretaria && (
              <p className="text-[11px] text-amber-600 mt-2 font-medium">⚠ Recordar hacerlo todos los lunes</p>
            )}
            <span className="absolute bottom-6 right-6 text-gray-300 group-hover:text-gray-500 transition text-lg">→</span>
          </button>
        ))}
      </div>

      {/* Admin link */}
      {role === "admin" && (
        <div className="text-center mt-8">
          <button onClick={() => router.push("/admin")} className="text-sm text-gray-400 hover:text-black transition">
            Panel CXC →
          </button>
        </div>
      )}
    </div>
  );
}

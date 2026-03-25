"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import FGLogo from "@/components/FGLogo";

export default function PlantillasPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = sessionStorage.getItem("cxc_role");
    if (!r || (r !== "admin" && r !== "director" && r !== "upload")) {
      router.push("/");
    } else {
      setAuthChecked(true);
    }
  }, []);

  if (!authChecked) return null;

  const cards = [
    {
      title: "Guía de Transporte",
      description: "Registro de envíos con detalle de clientes, bultos y transportista",
      href: "/guias",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 3h15v13H1z" />
          <path d="M16 8h4l3 3v5h-7V8z" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      ),
    },
    {
      title: "Caja Menuda",
      description: "Control de gastos menores por período con reporte imprimible",
      href: "/caja",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M2 10h20" />
          <path d="M6 14h4" />
        </svg>
      ),
    },
    {
      title: "Directorio de Clientes",
      description: "Base de datos de contactos con importación y exportación CSV",
      href: "/directorio",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
    },
    {
      title: "Reclamos",
      description: "Seguimiento de reclamos a proveedores con pipeline y alertas",
      href: "/reclamos",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 14l2 2 4-4" />
        </svg>
      ),
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <button onClick={() => router.push("/admin")} className="text-sm text-gray-400 hover:text-black transition mb-8 block">
        ← Dashboard
      </button>

      <FGLogo variant="horizontal" theme="light" size={32} />
      <p className="text-sm text-gray-400 mt-2 mb-10">Plantillas — Documentos y formularios del grupo</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map((card) => (
          <button
            key={card.href}
            onClick={() => router.push(card.href)}
            className="relative text-left border border-gray-100 rounded-2xl p-6 hover:shadow-sm transition bg-white group"
          >
            <div className="bg-gray-50 rounded-full p-3 w-12 h-12 flex items-center justify-center">
              {card.icon}
            </div>
            <div className="text-base font-semibold mt-4">{card.title}</div>
            <div className="text-sm text-gray-400 mt-1">{card.description}</div>
            <span className="absolute bottom-6 right-6 text-gray-300 group-hover:text-gray-500 transition text-lg">→</span>
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-300 text-center mt-12">Más plantillas próximamente</p>
    </div>
  );
}

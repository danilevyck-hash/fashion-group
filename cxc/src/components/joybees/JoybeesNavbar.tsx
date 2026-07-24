"use client";

// Espejo Joybees del Navbar de Reebok (components/reebok/Navbar): link a
// Inicio, marca, y acceso secundario "Pedidos" para roles gestores.

import Link from "next/link";
import { useEffect, useState } from "react";

export default function JoybeesNavbar() {
  const [role, setRole] = useState("");

  useEffect(() => {
    setRole(sessionStorage.getItem("cxc_role") || "");
  }, []);

  const isManager = role === "admin" || role === "vendedor" || role === "secretaria";

  return (
    <nav className="sticky top-0 z-50 bg-white">
      <div className="h-[2px] bg-[#FFE443]" />
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4 border-b border-gray-100">
        <Link href="/home" className="text-xs text-[#404041] hover:text-[#FFE443] transition flex-shrink-0 py-2">
          ← Inicio
        </Link>
        <Link href="/catalogo/joybees" className="flex items-center gap-2 flex-shrink-0">
          <span className="text-lg">🐝</span>
          <span className="font-black text-[#404041] uppercase tracking-wide text-sm">Joybees</span>
        </Link>
        <div className="flex-1" />
        {isManager && (
          <Link href="/catalogo/joybees/pedidos" className="text-sm text-[#404041] hover:text-black transition py-2 px-2 font-medium">Pedidos</Link>
        )}
      </div>
    </nav>
  );
}

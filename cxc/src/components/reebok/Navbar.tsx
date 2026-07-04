"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Navbar() {
  const [role, setRole] = useState("");

  useEffect(() => {
    setRole(sessionStorage.getItem("cxc_role") || "");
  }, []);

  const isManager = role === "admin" || role === "vendedor" || role === "secretaria";
  const showSystem = role && role !== "cliente";

  return (
    <nav className="sticky top-0 z-50 bg-white">
      <div className="h-[2px] bg-[#E4002B]" />
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4 border-b border-gray-100">
        {showSystem && (
          <Link href="/home" className="text-xs text-[#1A2656] hover:text-[#E4002B] transition flex-shrink-0 py-2">← Inicio</Link>
        )}
        <Link href="/catalogo/reebok" className="flex-shrink-0">
          <img src="/reebok/reebok-logo.png" alt="Reebok" className="h-7" />
        </Link>
        <div className="flex-1" />
        {/* El pedido se arma en el carrito → "Ver pedido" → checkout. Aquí solo
            queda "Pedidos" como acceso secundario a la lista (no crea nada). El
            botón rojo "Nuevo pedido" + NewOrderModal murieron: eran el flujo viejo
            (borraban el carrito y pedían un cliente que el checkout ya no usa). */}
        {isManager && (
          <Link href="/catalogo/reebok/pedidos" className="text-sm text-[#1A2656] hover:text-[#E4002B] transition py-2 px-2 font-medium">Pedidos</Link>
        )}
      </div>
    </nav>
  );
}

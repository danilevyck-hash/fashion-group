"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Navbar() {
  const router = useRouter();
  const [role, setRole] = useState("");

  useEffect(() => {
    setRole(sessionStorage.getItem("cxc_role") || "");
  }, []);

  const isManager = role === "admin" || role === "vendedor" || role === "secretaria";
  const showSystem = role && role !== "cliente";

  function handleNewOrder() {
    // Clear any active draft so the catalog starts fresh
    sessionStorage.removeItem("reebok_active_draft_id");
    router.push("/catalogo/reebok/productos");
  }

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
        {showSystem && (
          <Link href="/plantillas" className="text-xs text-gray-400 hover:text-gray-600 transition flex-shrink-0 py-2">← Dashboard</Link>
        )}
        <Link href="/catalogo/reebok" className="flex-shrink-0">
          <img src="/reebok/reebok-logo.png" alt="Reebok" className="h-7" />
        </Link>

        <div className="flex-1" />

        {isManager && (
          <div className="flex items-center gap-3">
            <Link href="/catalogo/reebok/pedidos" className="text-sm text-gray-500 hover:text-black transition py-2 px-2">Pedidos</Link>
            <button onClick={handleNewOrder} className="text-sm bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition">Nuevo pedido</button>
          </div>
        )}
      </div>
    </nav>
  );
}

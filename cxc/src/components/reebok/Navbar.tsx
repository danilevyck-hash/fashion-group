"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NewOrderModal from "./NewOrderModal";

export default function Navbar() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [showNewOrder, setShowNewOrder] = useState(false);

  useEffect(() => {
    setRole(sessionStorage.getItem("cxc_role") || "");
  }, []);

  const isManager = role === "admin" || role === "vendedor";
  const showSystem = role && role !== "cliente";

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center gap-4">
          {showSystem && (
            <Link href="/plantillas" className="text-[11px] text-gray-400 hover:text-gray-600 transition flex-shrink-0">← Sistema</Link>
          )}
          <Link href="/catalogo/reebok" className="flex-shrink-0">
            <img src="/reebok/reebok-logo.png" alt="Reebok" className="h-6" />
          </Link>

          <div className="flex-1" />

          {isManager && (
            <div className="flex items-center gap-3">
              <Link href="/catalogo/reebok/pedidos" className="text-xs text-gray-500 hover:text-black transition">Pedidos</Link>
              <button onClick={() => setShowNewOrder(true)} className="text-xs bg-black text-white px-3 py-1.5 rounded hover:bg-gray-800 transition">+ Nuevo</button>
            </div>
          )}
        </div>
      </nav>

      {showNewOrder && (
        <NewOrderModal
          onClose={() => setShowNewOrder(false)}
          onCreated={(id) => { setShowNewOrder(false); router.push(`/catalogo/reebok/pedido/${id}`); }}
        />
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NewOrderModal from "./NewOrderModal";

export default function Navbar() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [activeId, setActiveId] = useState("");
  const [activeClient, setActiveClient] = useState("");
  const [showNewOrder, setShowNewOrder] = useState(false);

  useEffect(() => {
    setRole(sessionStorage.getItem("cxc_role") || "");
    setActiveId(localStorage.getItem("reebok_active_order_id") || "");
    setActiveClient(localStorage.getItem("reebok_active_order_client") || "");
  }, []);

  // Listen for storage changes
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveId(localStorage.getItem("reebok_active_order_id") || "");
      setActiveClient(localStorage.getItem("reebok_active_order_client") || "");
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const isManager = role === "admin" || role === "vendedor" || role === "staff";
  const showSystem = role && role !== "cliente";

  function clearActive() {
    localStorage.removeItem("reebok_active_order_id");
    localStorage.removeItem("reebok_active_order_number");
    localStorage.removeItem("reebok_active_order_client");
    setActiveId(""); setActiveClient("");
  }

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

          {/* Active order indicator */}
          {isManager && activeId && activeClient && (
            <div className="flex items-center gap-1.5 ml-2">
              <Link href={`/catalogo/reebok/pedido/${activeId}`} className="text-xs text-gray-500 hover:text-black transition">
                Para: <span className="font-medium text-black">{activeClient}</span>
              </Link>
              <button onClick={clearActive} className="text-gray-300 hover:text-gray-500 transition text-xs">×</button>
            </div>
          )}

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

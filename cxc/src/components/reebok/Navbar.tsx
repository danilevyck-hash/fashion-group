"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NewOrderModal from "./NewOrderModal";

function getOrderCount(): number {
  try {
    const items = JSON.parse(localStorage.getItem("reebok_order_items") || "[]");
    return items.reduce((s: number, i: { quantity: number }) => s + (i.quantity || 0), 0);
  } catch { return 0; }
}

export default function Navbar() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [orderCount, setOrderCount] = useState(0);
  const [activeClient, setActiveClient] = useState("");

  useEffect(() => {
    setRole(sessionStorage.getItem("cxc_role") || "");
    setOrderCount(getOrderCount());
    setActiveClient(localStorage.getItem("reebok_active_order_client") || "");
  }, []);

  // Listen for order changes
  useEffect(() => {
    function handler() {
      setOrderCount(getOrderCount());
      setActiveClient(localStorage.getItem("reebok_active_order_client") || "");
    }
    window.addEventListener("reebok-order-changed", handler);
    return () => window.removeEventListener("reebok-order-changed", handler);
  }, []);

  const isManager = role === "admin" || role === "vendedor";
  const showSystem = role && role !== "cliente";

  // #15: Warn if active order exists when creating new
  function handleNewOrder() {
    const activeId = localStorage.getItem("reebok_active_order_id");
    if (activeId && orderCount > 0) {
      // Show modal anyway — the user will see the client name and can decide
      setShowNewOrder(true);
    } else {
      setShowNewOrder(true);
    }
  }

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
          {showSystem && (
            <Link href="/plantillas" className="text-xs text-gray-400 hover:text-gray-600 transition flex-shrink-0 py-2">← Sistema</Link>
          )}
          <Link href="/catalogo/reebok" className="flex-shrink-0">
            <img src="/reebok/reebok-logo.png" alt="Reebok" className="h-7" />
          </Link>

          {/* #4: Show active order in navbar */}
          {activeClient && orderCount > 0 && (
            <Link href={`/catalogo/reebok/pedido/${localStorage.getItem("reebok_active_order_id")}`}
              className="flex items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-full hover:bg-green-100 transition truncate max-w-[200px]">
              <span className="truncate">{activeClient}</span>
              <span className="font-semibold tabular-nums flex-shrink-0">{orderCount}</span>
            </Link>
          )}

          <div className="flex-1" />

          {isManager && (
            <div className="flex items-center gap-3">
              <Link href="/catalogo/reebok/pedidos" className="text-sm text-gray-500 hover:text-black transition py-2 px-2">Pedidos</Link>
              <button onClick={handleNewOrder} className="text-sm bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition">Nuevo pedido</button>
            </div>
          )}
        </div>
      </nav>

      {/* #15: New order modal with warning if active order */}
      {showNewOrder && (
        <NewOrderModal
          onClose={() => setShowNewOrder(false)}
          onCreated={(id) => { setShowNewOrder(false); router.push(`/catalogo/reebok/pedido/${id}`); }}
        />
      )}
    </>
  );
}

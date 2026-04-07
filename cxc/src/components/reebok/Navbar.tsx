"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import NewOrderModal from "./NewOrderModal";

export default function Navbar() {
  const [role, setRole] = useState("");
  const [showNewOrder, setShowNewOrder] = useState(false);

  useEffect(() => {
    setRole(sessionStorage.getItem("cxc_role") || "");
  }, []);

  const isManager = role === "admin" || role === "vendedor" || role === "secretaria";
  const showSystem = role && role !== "cliente";

  function handleNewOrder() {
    // Clear everything — fresh start
    sessionStorage.removeItem("reebok_draft_id");
    sessionStorage.removeItem("reebok_draft_client");
    sessionStorage.removeItem("reebok_cart");
    setShowNewOrder(true);
  }

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white">
        <div className="h-[2px] bg-[#E4002B]" />
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4 border-b border-gray-100">
          {showSystem && (
            <Link href="/home" className="text-xs text-[#1A2656] hover:text-[#E4002B] transition flex-shrink-0 py-2">← Dashboard</Link>
          )}
          <Link href="/catalogo/reebok" className="flex-shrink-0">
            <img src="/reebok/reebok-logo.png" alt="Reebok" className="h-7" />
          </Link>
          <div className="flex-1" />
          {isManager && (
            <div className="flex items-center gap-3">
              <Link href="/catalogo/reebok/pedidos" className="text-sm text-[#1A2656] hover:text-[#E4002B] transition py-2 px-2 font-medium">Pedidos</Link>
              <button onClick={handleNewOrder} className="text-sm bg-[#E4002B] text-white px-4 py-2 rounded-md hover:bg-[#c90025] transition font-medium uppercase tracking-wider text-xs">Nuevo pedido</button>
            </div>
          )}
        </div>
      </nav>
      {showNewOrder && <NewOrderModal onClose={() => setShowNewOrder(false)} />}
    </>
  );
}

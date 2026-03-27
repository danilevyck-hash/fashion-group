"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import NewOrderModal from "@/components/reebok/NewOrderModal";

export default function ReebokLanding() {
  const router = useRouter();
  const [showNewOrder, setShowNewOrder] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-48px)] px-4">
      <img src="/reebok/reebok-logo.png" alt="Reebok" className="h-20 mb-10" />

      <div className="w-full max-w-xs flex flex-col gap-3">
        <button
          onClick={() => setShowNewOrder(true)}
          className="w-full bg-black text-white py-4 rounded text-sm font-medium hover:bg-gray-800 transition"
        >
          📋 Nuevo pedido
        </button>
        <button
          onClick={() => router.push("/catalogo/reebok/productos")}
          className="w-full bg-white text-black border border-black py-4 rounded text-sm font-medium hover:bg-gray-50 transition"
        >
          🛍 Ver catálogo
        </button>
        <button
          onClick={() => router.push("/catalogo/reebok/pedidos")}
          className="w-full bg-white text-black border border-black py-4 rounded text-sm font-medium hover:bg-gray-50 transition"
        >
          🕐 Mis pedidos
        </button>
      </div>

      {showNewOrder && (
        <NewOrderModal
          onClose={() => setShowNewOrder(false)}
          onCreated={(id) => { setShowNewOrder(false); router.push(`/catalogo/reebok/pedido/${id}`); }}
        />
      )}
    </div>
  );
}

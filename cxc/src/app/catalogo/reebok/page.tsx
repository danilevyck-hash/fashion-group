"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NewOrderModal from "@/components/reebok/NewOrderModal";

const ADMIN_ROLES = ["admin", "secretaria"];

export default function ReebokLanding() {
  const router = useRouter();
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role") || "";
    setRole(r);
    setReady(true);
  }, []);

  if (!ready) return null;

  // Admin/secretaria see control panel
  if (role && ADMIN_ROLES.includes(role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-48px)] px-4">
        <img src="/reebok/reebok-logo.png" alt="Reebok" className="h-20 mb-10" />

        <div className="w-full max-w-sm grid grid-cols-1 gap-4">
          <button
            onClick={() => router.push("/catalogo/reebok/admin")}
            className="w-full bg-black text-white py-5 rounded-lg text-sm font-medium hover:bg-gray-800 transition"
          >
            Administrar Catalogo
          </button>
          <button
            onClick={() => router.push("/catalogo/reebok/productos")}
            className="w-full bg-white text-black border border-black py-5 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
          >
            Ver Catalogo y Pedidos
          </button>
        </div>
      </div>
    );
  }

  // Everyone else: regular landing
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-48px)] px-4">
      <img src="/reebok/reebok-logo.png" alt="Reebok" className="h-20 mb-10" />

      <div className="w-full max-w-xs flex flex-col gap-3">
        <button
          onClick={() => setShowNewOrder(true)}
          className="w-full bg-black text-white py-4 rounded text-sm font-medium hover:bg-gray-800 transition"
        >
          Nuevo pedido
        </button>
        <button
          onClick={() => router.push("/catalogo/reebok/productos")}
          className="w-full bg-white text-black border border-black py-4 rounded text-sm font-medium hover:bg-gray-50 transition"
        >
          Ver catalogo
        </button>
        <button
          onClick={() => router.push("/catalogo/reebok/pedidos")}
          className="w-full bg-white text-black border border-black py-4 rounded text-sm font-medium hover:bg-gray-50 transition"
        >
          Mis pedidos
        </button>
      </div>

      {showNewOrder && (
        <NewOrderModal
          onClose={() => setShowNewOrder(false)}
          onCreated={() => { setShowNewOrder(false); router.push("/catalogo/reebok/productos"); }}
        />
      )}
    </div>
  );
}

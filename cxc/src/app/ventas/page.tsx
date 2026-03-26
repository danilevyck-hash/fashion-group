"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";

export default function VentasPage() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const r = sessionStorage.getItem("cxc_role") || "";
    if (!r) { router.push("/"); return; }
    setRole(r);
  }, [router]);

  if (!mounted) return null;

  return (
    <div>
      <AppHeader module="Ventas" />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold mb-4">Ventas Mensuales</h1>
        <p className="text-gray-400 text-sm">Módulo cargando — role: {role}</p>
      </div>
    </div>
  );
}

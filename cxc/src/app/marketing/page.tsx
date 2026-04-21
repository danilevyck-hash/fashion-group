"use client";

import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import ProyectosDashboard from "./components/ProyectosDashboard";

export default function MarketingHomePage() {
  const router = useRouter();
  const { authChecked } = useAuth({
    moduleKey: "marketing",
    allowedRoles: ["admin", "secretaria", "director"],
  });

  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Marketing" />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Proyectos de marketing
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Gastos compartidos entre marcas. Cada proyecto reparte facturas a Tommy, Calvin o Reebok según el % acordado.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => router.push("/marketing/reportes")}
              className="rounded-md border border-gray-300 bg-white text-gray-800 px-3 py-2 text-sm hover:bg-gray-50 active:scale-[0.97] transition"
            >
              Reportes
            </button>
            <button
              onClick={() => router.push("/marketing/papelera")}
              className="rounded-md border border-gray-300 bg-white text-gray-800 px-3 py-2 text-sm hover:bg-gray-50 active:scale-[0.97] transition"
            >
              Papelera
            </button>
            <button
              onClick={() => router.push("/marketing/proyectos/nuevo")}
              className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition"
            >
              + Nuevo proyecto
            </button>
          </div>
        </div>

        <ProyectosDashboard />
      </main>
    </div>
  );
}

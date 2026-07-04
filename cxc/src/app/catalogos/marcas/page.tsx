"use client";

import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import AppHeader from "@/components/AppHeader";

export default function CatalogosMarcasPage() {
  // Alineado con modules.ts (roles del módulo catalogos) y role_permissions:
  // secretaria y bodega tienen el módulo — sin ellos aquí dependían del
  // fallback fg_modules y un load frío los rebotaba a /home.
  const { authChecked, role } = useAuth({
    moduleKey: "catalogos",
    allowedRoles: ["admin", "secretaria", "vendedor", "bodega"],
  });

  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Catalogos" breadcrumbs={[{ label: "Marcas" }]} />
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Catalogos</h1>
        <p className="text-sm text-gray-400 mb-8">Selecciona una marca</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Reebok */}
          <Link href="/catalogo/reebok" className="group block">
            <div className="relative overflow-hidden rounded-2xl border border-[#1A2656]/10 bg-[#1A2656] p-8 transition-all duration-200 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#E4002B]/15 rounded-full -translate-y-10 translate-x-10" />
              <div className="relative">
                <h2 className="text-3xl font-extrabold text-white tracking-tight">REEBOK</h2>
                <p className="text-sm text-white/50 mt-1">Calzado deportivo</p>
                <div className="flex items-center gap-1.5 mt-6 text-xs font-medium text-white/40 group-hover:text-white/70 transition">
                  <span>Ver catalogo</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-1">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </div>
              </div>
            </div>
          </Link>

          {/* Joybees */}
          <Link href="/catalogo/joybees" className="group block">
            <div className="relative overflow-hidden rounded-2xl border border-[#FFE443]/30 bg-[#FFE443] p-8 transition-all duration-200 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#404041]/10 rounded-full -translate-y-10 translate-x-10" />
              <div className="relative">
                <h2 className="text-3xl font-extrabold text-[#404041] tracking-tight">JOYBEES</h2>
                <p className="text-sm text-[#404041]/50 mt-1">Clogs, sandalias y mas</p>
                <div className="flex items-center gap-1.5 mt-6 text-xs font-medium text-[#404041]/40 group-hover:text-[#404041]/70 transition">
                  <span>Ver catalogo</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-1">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Administrar Catalogos — admin only */}
        {role === "admin" && (
          <div className="mt-5">
            <Link href="/catalogos/admin" className="group block">
              <div className="relative overflow-hidden rounded-2xl border border-gray-300 bg-gray-800 p-8 transition-all duration-200 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-10 translate-x-10" />
                <div className="relative flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">Administrar Catalogos</h2>
                    <p className="text-sm text-white/40 mt-0.5">Productos, inventario y pedidos</p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-white/30 group-hover:text-white/60 transition-all group-hover:translate-x-1">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </div>
              </div>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

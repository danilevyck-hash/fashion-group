"use client";

import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import AppHeader from "@/components/AppHeader";

export default function AdminCatalogosPage() {
  const { authChecked } = useAuth({
    moduleKey: "catalogos",
    allowedRoles: ["admin"],
  });

  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Administrar Catalogos" />
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Administrar Catalogos</h1>
        <p className="text-sm text-gray-400 mb-8">Selecciona una marca para administrar</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Reebok */}
          <Link href="/catalogos/admin/reebok" className="group block">
            <div className="relative overflow-hidden rounded-2xl border border-[#1A2656]/10 bg-[#1A2656] p-8 transition-all duration-200 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#E4002B]/15 rounded-full -translate-y-10 translate-x-10" />
              <div className="relative">
                <h2 className="text-3xl font-extrabold text-white tracking-tight">REEBOK</h2>
                <p className="text-sm text-white/50 mt-1">Calzado deportivo</p>
                <div className="flex items-center gap-1.5 mt-6 text-xs font-medium text-white/40 group-hover:text-white/70 transition">
                  <span>Administrar</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-1">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </div>
              </div>
            </div>
          </Link>

          {/* Joybees */}
          <Link href="/catalogos/admin/joybees" className="group block">
            <div className="relative overflow-hidden rounded-2xl border border-[#FFE443]/30 bg-[#FFE443] p-8 transition-all duration-200 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#404041]/10 rounded-full -translate-y-10 translate-x-10" />
              <div className="relative">
                <h2 className="text-3xl font-extrabold text-[#404041] tracking-tight">JOYBEES</h2>
                <p className="text-sm text-[#404041]/50 mt-1">Clogs, sandalias y mas</p>
                <div className="flex items-center gap-1.5 mt-6 text-xs font-medium text-[#404041]/40 group-hover:text-[#404041]/70 transition">
                  <span>Administrar</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-1">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { CobranzasLista } from "../components/CobranzasLista";

export default function CobranzasPage() {
  const { authChecked } = useAuth({
    moduleKey: "marketing",
    allowedRoles: ["admin", "secretaria", "director"],
  });

  if (!authChecked) return null;

  return (
    <div>
      <AppHeader module="Marketing · Cobranzas" />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <h1 className="text-xl font-light tracking-tight">Cobranzas</h1>
          <Link
            href="/marketing/cobranzas/nueva"
            className="text-sm bg-fuchsia-600 text-white px-4 py-2 rounded-md font-medium hover:bg-fuchsia-700 active:scale-[0.97] transition"
          >
            Nueva cobranza
          </Link>
        </div>
        <CobranzasLista />
      </main>
    </div>
  );
}

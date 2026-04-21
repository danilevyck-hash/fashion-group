"use client";

import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { NuevaCobranzaWizard } from "../../components/NuevaCobranzaWizard";

export default function NuevaCobranzaPage() {
  const { authChecked } = useAuth({
    moduleKey: "marketing",
    allowedRoles: ["admin", "secretaria", "director"],
  });

  if (!authChecked) return null;

  return (
    <div>
      <AppHeader module="Marketing · Nueva cobranza" />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <Link
              href="/marketing/cobranzas"
              className="text-xs text-gray-500 hover:text-black"
            >
              ← Cobranzas
            </Link>
            <h1 className="text-xl font-light tracking-tight mt-1">
              Nueva cobranza
            </h1>
          </div>
        </div>
        <NuevaCobranzaWizard />
      </main>
    </div>
  );
}

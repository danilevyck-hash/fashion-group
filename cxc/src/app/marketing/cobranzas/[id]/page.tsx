"use client";

import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { CobranzaDetalle } from "../../components/CobranzaDetalle";

interface PageProps {
  params: { id: string };
}

export default function CobranzaDetallePage({ params }: PageProps) {
  const { authChecked } = useAuth({
    moduleKey: "marketing",
    allowedRoles: ["admin", "secretaria", "director"],
  });

  if (!authChecked) return null;

  return (
    <div>
      <AppHeader module="Marketing · Cobranza" />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-5">
          <Link
            href="/marketing/cobranzas"
            className="text-xs text-gray-500 hover:text-black"
          >
            ← Cobranzas
          </Link>
        </div>
        <CobranzaDetalle cobranzaId={params.id} />
      </main>
    </div>
  );
}

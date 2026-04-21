"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import PapeleraLista from "../components/PapeleraLista";

export default function MarketingPapeleraPage() {
  const { authChecked, role } = useAuth({
    moduleKey: "marketing",
    allowedRoles: ["admin", "secretaria", "director"],
  });
  const [esAdmin, setEsAdmin] = useState(false);

  useEffect(() => {
    setEsAdmin(role === "admin");
  }, [role]);

  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        module="Marketing"
        breadcrumbs={[
          { label: "Marketing", onClick: undefined },
          { label: "Papelera" },
        ]}
      />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Papelera</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Proyectos, facturas y cobranzas anulados. Puedes restaurarlos o, si
            tienen más de un año, eliminarlos definitivamente.
          </p>
        </div>

        <PapeleraLista esAdmin={esAdmin} />
      </main>
    </div>
  );
}

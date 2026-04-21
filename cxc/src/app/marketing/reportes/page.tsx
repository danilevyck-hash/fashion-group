"use client";

import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import ReportesTabs from "../components/ReportesTabs";

export default function MarketingReportesPage() {
  const { authChecked } = useAuth({
    moduleKey: "marketing",
    allowedRoles: ["admin", "secretaria", "director"],
  });

  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        module="Marketing"
        breadcrumbs={[
          { label: "Marketing", onClick: undefined },
          { label: "Reportes" },
        ]}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Reportes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Resúmenes de gasto y cobro de marketing, agrupados por marca,
            tienda o proyecto.
          </p>
        </div>

        <ReportesTabs />
      </main>
    </div>
  );
}

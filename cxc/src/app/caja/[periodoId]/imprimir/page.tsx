"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import PrintView from "../../components/PrintView";
import type { CajaPeriodo, CajaGasto } from "../../components/types";

export default function PeriodoImprimirPage() {
  const router = useRouter();
  const params = useParams<{ periodoId: string }>();
  const periodoId = params?.periodoId ?? "";
  const { authChecked } = useAuth({
    moduleKey: "caja",
    allowedRoles: ["admin", "secretaria"],
  });

  const [periodo, setPeriodo] = useState<CajaPeriodo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authChecked || !periodoId) return;
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`/api/caja/periodos/${periodoId}`);
        if (!res.ok) {
          if (!cancelado) setError("Período no encontrado");
          return;
        }
        const data = await res.json();
        const gastos = data.caja_gastos || [];
        data.total_gastado = gastos.reduce((s: number, g: CajaGasto) => s + (g.total || 0), 0);
        if (!cancelado) setPeriodo(data);
      } catch {
        if (!cancelado) setError("Error al cargar período");
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [authChecked, periodoId]);

  if (!authChecked) return null;

  if (loading) {
    return (
      <div>
        <div className="print:hidden">
          <AppHeader module="Caja Menuda" breadcrumbs={[{ label: "Cargando..." }]} />
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
          <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !periodo) {
    return (
      <div>
        <div className="print:hidden">
          <AppHeader module="Caja Menuda" breadcrumbs={[{ label: "Error" }]} />
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 text-center">
          <p className="text-sm text-red-500">{error || "No encontrado"}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="print:hidden">
        <AppHeader
          module="Caja Menuda"
          breadcrumbs={[
            { label: `Período N°${periodo.numero}`, onClick: () => router.push(`/caja/${periodo.id}`) },
            { label: "Imprimir" },
          ]}
        />
      </div>
      <PrintView
        current={periodo}
        onBack={() => router.push(`/caja/${periodo.id}`)}
      />
    </div>
  );
}

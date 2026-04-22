"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import GuiaDetail from "../../components/GuiaDetail";
import type { Guia } from "../../components/types";

export default function GuiaImprimirPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? null;
  const { authChecked } = useAuth({
    moduleKey: "guias",
    allowedRoles: ["admin", "secretaria", "bodega", "director", "vendedor"],
  });

  const [guia, setGuia] = useState<Guia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authChecked || !id) return;
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`/api/guias/${id}`);
        if (!res.ok) {
          if (!cancelado) setError("Guía no encontrada");
          return;
        }
        const data = (await res.json()) as Guia;
        if (!cancelado) setGuia(data);
      } catch {
        if (!cancelado) setError("Error al cargar guía");
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [authChecked, id]);

  if (!authChecked) return null;

  if (loading) {
    return (
      <div>
        <div className="print:hidden">
          <AppHeader module="Guías de Transporte" breadcrumbs={[{ label: "Cargando..." }]} />
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !guia) {
    return (
      <div>
        <div className="print:hidden">
          <AppHeader module="Guías de Transporte" breadcrumbs={[{ label: "Error" }]} />
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 text-center">
          <p className="text-sm text-red-500">{error || "No encontrada"}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="print:hidden">
        <AppHeader
          module="Guías de Transporte"
          breadcrumbs={[
            { label: `GT-${String(guia.numero).padStart(3, "0")}` },
            { label: "Imprimir" },
          ]}
        />
      </div>
      <GuiaDetail guia={guia} onBack={() => router.push("/guias")} />
    </div>
  );
}

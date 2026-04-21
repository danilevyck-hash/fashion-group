"use client";

// Fase 3: el home es lista de proyectos (sin vista intermedia de marca).
// URL patterns:
//   /marketing                      → home (lista de proyectos)
//   /marketing?proyecto=<uuid>      → home + overlay del proyecto
//   /marketing?vista=papelera       → papelera (reemplaza home)
//   /marketing?vista=reportes       → reportes (reemplaza home)

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import type { MkMarca } from "@/lib/marketing/types";
import ProyectosHomeView from "./components/ProyectosHomeView";
import ProyectoOverlay from "./components/ProyectoOverlay";
import PapeleraLista from "./components/PapeleraLista";
import ReportesTabs from "./components/ReportesTabs";
import NuevoProyectoModal from "./components/NuevoProyectoModal";
import HistorialView from "./components/HistorialView";

type VistaExtra = "papelera" | "reportes" | "historial" | null;

export default function MarketingPageWrapper() {
  return (
    <Suspense>
      <MarketingPage />
    </Suspense>
  );
}

function MarketingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authChecked, role } = useAuth({
    moduleKey: "marketing",
    allowedRoles: ["admin", "secretaria", "director"],
  });

  const proyectoParam = searchParams.get("proyecto");
  const vistaParam = (searchParams.get("vista") as VistaExtra) ?? null;

  const [marcas, setMarcas] = useState<MkMarca[]>([]);
  const [showNuevoProyecto, setShowNuevoProyecto] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [nombreProyectoActual, setNombreProyectoActual] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/marketing/marcas");
        if (!res.ok) throw new Error();
        const data = (await res.json()) as MkMarca[];
        if (!cancelado) setMarcas(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelado) setMarcas([]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const navegar = useCallback(
    (next: { proyecto?: string | null; vista?: VistaExtra }) => {
      const params = new URLSearchParams();
      const nextProyecto =
        next.proyecto === undefined ? proyectoParam : next.proyecto ?? null;
      const nextVista = next.vista === undefined ? vistaParam : next.vista;
      if (nextVista) {
        params.set("vista", nextVista);
      } else if (nextProyecto) {
        params.set("proyecto", nextProyecto);
      }
      const qs = params.toString();
      router.replace(qs ? `/marketing?${qs}` : "/marketing");
    },
    [proyectoParam, vistaParam, router],
  );

  const refrescar = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    if (!proyectoParam) setNombreProyectoActual(null);
  }, [proyectoParam]);

  if (!authChecked) return null;

  const mostrandoVistaExtra =
    vistaParam === "papelera" ||
    vistaParam === "reportes" ||
    vistaParam === "historial";

  const breadcrumbs: { label: string; onClick?: () => void }[] = [];
  if (vistaParam === "papelera") {
    breadcrumbs.push({ label: "Papelera" });
  } else if (vistaParam === "reportes") {
    breadcrumbs.push({ label: "Reportes" });
  } else if (vistaParam === "historial") {
    breadcrumbs.push({ label: "Historial" });
  } else if (proyectoParam && nombreProyectoActual) {
    breadcrumbs.push({ label: nombreProyectoActual });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Marketing" breadcrumbs={breadcrumbs} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {mostrandoVistaExtra ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => navegar({ vista: null })}
              className="text-sm text-gray-600 hover:text-black transition inline-flex items-center gap-1"
            >
              ← Volver
            </button>
            {vistaParam === "papelera" ? (
              <PapeleraLista esAdmin={role === "admin"} />
            ) : vistaParam === "historial" ? (
              <HistorialView
                marcas={marcas}
                onOpenProyecto={(id) => navegar({ proyecto: id })}
                refreshKey={refreshKey}
              />
            ) : (
              <ReportesTabs />
            )}
          </div>
        ) : (
          <ProyectosHomeView
            marcas={marcas}
            onOpenProyecto={(id) => navegar({ proyecto: id })}
            onNuevoProyecto={() => setShowNuevoProyecto(true)}
            onOpenPapelera={() => navegar({ vista: "papelera" })}
            onOpenReportes={() => navegar({ vista: "reportes" })}
            onOpenHistorial={() => navegar({ vista: "historial" })}
            refreshKey={refreshKey}
          />
        )}
      </main>

      {proyectoParam && !mostrandoVistaExtra && (
        <ProyectoOverlay
          proyectoId={proyectoParam}
          onClose={() => navegar({ proyecto: null })}
          onChange={refrescar}
          onNombreProyecto={setNombreProyectoActual}
        />
      )}

      {showNuevoProyecto && (
        <NuevoProyectoModal
          marcas={marcas}
          onClose={() => setShowNuevoProyecto(false)}
          onCreated={(id) => {
            setShowNuevoProyecto(false);
            refrescar();
            navegar({ proyecto: id });
          }}
        />
      )}
    </div>
  );
}

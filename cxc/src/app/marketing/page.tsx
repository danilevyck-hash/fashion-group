"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import type { MkMarca } from "@/lib/marketing/types";
import MarcaSelector from "./components/MarcaSelector";
import ProyectosView from "./components/ProyectosView";
import ProyectoOverlay from "./components/ProyectoOverlay";
import PapeleraLista from "./components/PapeleraLista";
import ReportesTabs from "./components/ReportesTabs";
import NuevoProyectoModal from "./components/NuevoProyectoModal";

type VistaExtra = "papelera" | "reportes" | null;

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

  const marcaParam = searchParams.get("marca");
  const proyectoParam = searchParams.get("proyecto");
  const vistaParam = (searchParams.get("vista") as VistaExtra) ?? null;

  const [marcas, setMarcas] = useState<MkMarca[]>([]);
  const [marcasLoading, setMarcasLoading] = useState(true);
  const [showNuevoProyecto, setShowNuevoProyecto] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setMarcasLoading(true);
      try {
        const res = await fetch("/api/marketing/marcas");
        if (!res.ok) throw new Error("No se pudieron cargar las marcas");
        const data = (await res.json()) as MkMarca[];
        if (!cancelado) setMarcas(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelado) setMarcas([]);
      } finally {
        if (!cancelado) setMarcasLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const marcaActual = useMemo(
    () => marcas.find((m) => m.codigo === marcaParam) ?? null,
    [marcas, marcaParam],
  );

  const navegar = useCallback(
    (next: {
      marca?: string | null;
      proyecto?: string | null;
      vista?: VistaExtra;
    }) => {
      const params = new URLSearchParams();
      const nextMarca =
        next.marca === undefined ? marcaParam : next.marca ?? null;
      const nextProyecto =
        next.proyecto === undefined ? proyectoParam : next.proyecto ?? null;
      const nextVista = next.vista === undefined ? vistaParam : next.vista;
      if (nextVista) {
        params.set("vista", nextVista);
      } else {
        if (nextMarca) params.set("marca", nextMarca);
        if (nextProyecto) params.set("proyecto", nextProyecto);
      }
      const qs = params.toString();
      router.replace(qs ? `/marketing?${qs}` : "/marketing");
    },
    [marcaParam, proyectoParam, vistaParam, router],
  );

  const refrescar = () => setRefreshKey((k) => k + 1);

  if (!authChecked) return null;

  const mostrandoVistaExtra = vistaParam === "papelera" || vistaParam === "reportes";

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Marketing" />
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
            ) : (
              <ReportesTabs />
            )}
          </div>
        ) : !marcaActual ? (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  Marketing
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  Gastos compartidos. Elige una marca para ver sus proyectos.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0 text-sm">
                <button
                  type="button"
                  onClick={() => navegar({ vista: "reportes" })}
                  className="text-gray-600 hover:text-black transition"
                >
                  Reportes
                </button>
                <span className="text-gray-300">·</span>
                <button
                  type="button"
                  onClick={() => navegar({ vista: "papelera" })}
                  className="text-gray-600 hover:text-black transition"
                >
                  Papelera
                </button>
              </div>
            </div>
            <MarcaSelector
              marcas={marcas}
              loading={marcasLoading}
              onSelect={(m) =>
                navegar({ marca: m.codigo, proyecto: null, vista: null })
              }
              refreshKey={refreshKey}
            />
          </div>
        ) : (
          <ProyectosView
            marca={marcaActual}
            onBack={() => navegar({ marca: null, proyecto: null })}
            onOpenProyecto={(id) => navegar({ proyecto: id })}
            onOpenPapelera={() => navegar({ vista: "papelera" })}
            onOpenReportes={() => navegar({ vista: "reportes" })}
            onNuevoProyecto={() => setShowNuevoProyecto(true)}
            refreshKey={refreshKey}
          />
        )}
      </main>

      {proyectoParam && marcaActual && !mostrandoVistaExtra && (
        <ProyectoOverlay
          proyectoId={proyectoParam}
          marca={marcaActual}
          onClose={() => navegar({ proyecto: null })}
          onChange={refrescar}
        />
      )}

      {showNuevoProyecto && (
        <NuevoProyectoModal
          marcas={marcas}
          marcaPreseleccionada={marcaActual}
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

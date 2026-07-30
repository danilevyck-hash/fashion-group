"use client";

// Fase 3: el home es lista de proyectos (sin vista intermedia de marca).
// URL patterns:
//   /marketing                      → home (lista de proyectos)
//   /marketing?proyecto=<uuid>      → home + overlay del proyecto
//   /marketing?vista=anulados       → anulados (reemplaza home)
//   /marketing?vista=reportes       → reportes (reemplaza home)
//   /marketing?vista=historial      → historial (reemplaza home)
//
// Legacy: /marketing?vista=papelera redirige a ?vista=anulados.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import type { MkMarca } from "@/lib/marketing/types";
import {
  MULTIFASHION_BUCKET,
  MULTIFASHION_LABEL,
} from "@/lib/marketing/multifashion";
import ProyectosHomeView from "./components/ProyectosHomeView";
import MarcaSelector from "./components/MarcaSelector";
import ProyectoOverlay from "./components/ProyectoOverlay";
import AnuladosLista from "./components/AnuladosLista";
import ReportesTabs from "./components/ReportesTabs";
import ImpulsadorasView from "./components/ImpulsadorasView";
import NuevoProyectoModal from "./components/NuevoProyectoModal";

// `historial` se removió de la UI; el archivo del componente queda en disco
// (HistorialView.tsx) por si se reactiva, pero ya no se rutea.
type VistaExtra = "anulados" | "reportes" | "impulsadoras" | null;

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
    allowedRoles: ["admin", "secretaria"],
  });

  const proyectoParam = searchParams.get("proyecto");
  // Bucket de card: "legacy" (archivo Tommy/Calvin) o un marca_id (uuid). null = selector.
  const marcaParam = searchParams.get("marca");
  const vistaRaw = searchParams.get("vista");
  // Compatibilidad: la vista legacy "papelera" se trata internamente como
  // "anulados". Más abajo redirigimos la URL para que quede limpia.
  const vistaParam: VistaExtra =
    vistaRaw === "papelera"
      ? "anulados"
      : vistaRaw === "anulados" || vistaRaw === "reportes" || vistaRaw === "impulsadoras"
        ? (vistaRaw as VistaExtra)
        : null;

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
        if (cancelado) return;
        setMarcas(Array.isArray(data) ? data : []);
      } catch {
        if (cancelado) return;
        setMarcas([]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const navegar = useCallback(
    (next: { proyecto?: string | null; vista?: VistaExtra; marca?: string | null }) => {
      const params = new URLSearchParams();
      const nextProyecto =
        next.proyecto === undefined ? proyectoParam : next.proyecto ?? null;
      const nextVista = next.vista === undefined ? vistaParam : next.vista;
      const nextMarca = next.marca === undefined ? marcaParam : next.marca ?? null;
      if (nextVista) {
        // Anulados/Reportes son globales: no arrastran marca ni proyecto.
        params.set("vista", nextVista);
      } else {
        if (nextMarca) params.set("marca", nextMarca);
        if (nextProyecto) params.set("proyecto", nextProyecto);
      }
      const qs = params.toString();
      router.replace(qs ? `/marketing?${qs}` : "/marketing");
    },
    [proyectoParam, vistaParam, marcaParam, router],
  );

  const refrescar = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    if (!proyectoParam) setNombreProyectoActual(null);
  }, [proyectoParam]);

  // Redirect URL legacy ?vista=papelera → ?vista=anulados.
  useEffect(() => {
    if (vistaRaw === "papelera") {
      const params = new URLSearchParams(searchParams.toString());
      params.set("vista", "anulados");
      router.replace(`/marketing?${params.toString()}`);
    }
  }, [vistaRaw, searchParams, router]);

  if (!authChecked) return null;

  const mostrandoVistaExtra =
    vistaParam === "anulados" || vistaParam === "reportes" || vistaParam === "impulsadoras";

  // Etiqueta del bucket activo (card seleccionada).
  const bucketLabel =
    marcaParam === "legacy"
      ? "Gastos Tommy y Calvin"
      : marcaParam === MULTIFASHION_BUCKET
        ? MULTIFASHION_LABEL
        : marcaParam
          ? marcas.find((m) => m.id === marcaParam)?.nombre ?? "Marca"
          : null;

  const breadcrumbs: { label: string; onClick?: () => void }[] = [];
  if (vistaParam === "anulados") {
    breadcrumbs.push({ label: "Anulados" });
  } else if (vistaParam === "reportes") {
    breadcrumbs.push({ label: "Reportes" });
  } else if (vistaParam === "impulsadoras") {
    breadcrumbs.push({ label: "Impulsadoras" });
  } else if (proyectoParam && nombreProyectoActual) {
    if (bucketLabel) breadcrumbs.push({ label: bucketLabel, onClick: () => navegar({ proyecto: null }) });
    breadcrumbs.push({ label: nombreProyectoActual });
  } else if (bucketLabel) {
    breadcrumbs.push({ label: bucketLabel });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Marketing" breadcrumbs={breadcrumbs} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {mostrandoVistaExtra ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => router.push("/marketing")}
              /* Volver era texto suelto (~20 px de alto): 44 de área táctil,
                 con -my-1 para no separar el contenido de abajo. */
              className="text-sm text-gray-600 hover:text-black transition inline-flex items-center gap-1 min-h-[44px] -my-1"
            >
              ← Proyectos
            </button>
            {vistaParam === "anulados" ? (
              <AnuladosLista esAdmin={role === "admin"} />
            ) : vistaParam === "impulsadoras" ? (
              <ImpulsadorasView marcas={marcas} />
            ) : (
              <ReportesTabs />
            )}
          </div>
        ) : marcaParam ? (
          <ProyectosHomeView
            marcas={marcas}
            grupo={
              marcaParam === "legacy"
                ? "legacy"
                : marcaParam === MULTIFASHION_BUCKET
                  ? "multifashion"
                  : "marca"
            }
            marcaIdFijo={
              marcaParam === "legacy" || marcaParam === MULTIFASHION_BUCKET
                ? undefined
                : marcaParam
            }
            bucketLabel={bucketLabel ?? ""}
            bucketEsLegacy={marcaParam === "legacy"}
            onBack={() => navegar({ marca: null, proyecto: null })}
            onOpenProyecto={(id) => navegar({ proyecto: id })}
            onNuevoProyecto={() => setShowNuevoProyecto(true)}
            onOpenAnulados={() => navegar({ vista: "anulados" })}
            onOpenReportes={() => navegar({ vista: "reportes" })}
            onOpenImpulsadoras={() => navegar({ vista: "impulsadoras" })}
            onOpenInventario={() => router.push("/marketing/mobiliario")}
            refreshKey={refreshKey}
          />
        ) : (
          <MarcaSelector
            marcas={marcas}
            onSelectMarca={(id) => navegar({ marca: id })}
            onSelectLegacy={() => navegar({ marca: "legacy" })}
            onSelectMultifashion={() => navegar({ marca: MULTIFASHION_BUCKET })}
            onNuevoProyecto={() => setShowNuevoProyecto(true)}
            onOpenAnulados={() => navegar({ vista: "anulados" })}
            onOpenReportes={() => navegar({ vista: "reportes" })}
            onOpenImpulsadoras={() => navegar({ vista: "impulsadoras" })}
            onOpenInventario={() => router.push("/marketing/mobiliario")}
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

"use client";

// Marketing se organiza por PROVEEDOR, que es a quien se le reporta el gasto y
// con quien se cierra un período. Daniel, textual: *"le reportas ese gasto al
// proveedor"*, *"cada proveedor solo su parte"*.
//
// URL patterns:
//   /marketing                        → inicio (bloques por proveedor)
//   /marketing?proveedor=pvh          → lista de proyectos de ese proveedor
//   /marketing?proyecto=<uuid>        → + overlay del proyecto
//   /marketing?vista=reportes         → reportes (reemplaza el inicio)
//   /marketing?vista=impulsadoras     → impulsadoras (reemplaza el inicio)
//
// Legacy: `?vista=papelera` y `?vista=anulados` redirigen a /marketing — la
// pantalla de Anulados se retiró. Un enlace viejo tiene que llegar al inicio,
// no a un error.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import type { MkMarca } from "@/lib/marketing/types";
import {
  MULTIFASHION_KEY,
  SIN_PROVEEDOR,
  esProveedorKey,
  proveedorPorKey,
} from "@/lib/marketing/proveedores";
import InicioMarketing from "./components/InicioMarketing";
import ProyectosHomeView from "./components/ProyectosHomeView";
import ProyectoOverlay from "./components/ProyectoOverlay";
import ReportesTabs from "./components/ReportesTabs";
import ImpulsadorasView from "./components/ImpulsadorasView";
import NuevoProyectoModal from "./components/NuevoProyectoModal";

// `historial` se removió de la UI; el archivo del componente queda en disco
// (HistorialView.tsx) por si se reactiva, pero ya no se rutea.
type VistaExtra = "reportes" | "impulsadoras" | null;

/** Bloques que dibuja el inicio y que "Ver proyectos" puede abrir. */
function esBloqueValido(k: string | null): boolean {
  if (!k) return false;
  return esProveedorKey(k) || k === MULTIFASHION_KEY || k === SIN_PROVEEDOR;
}

function nombreBloque(k: string): string {
  if (k === MULTIFASHION_KEY) return "Multifashion";
  if (k === SIN_PROVEEDOR) return "Sin proveedor asignado";
  return proveedorPorKey(k)?.nombre ?? "Proveedor";
}

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
  const { authChecked } = useAuth({
    moduleKey: "marketing",
    allowedRoles: ["admin", "secretaria"],
  });

  const proyectoParam = searchParams.get("proyecto");
  const proveedorRaw = searchParams.get("proveedor");
  const proveedorParam = esBloqueValido(proveedorRaw) ? proveedorRaw : null;
  const vistaRaw = searchParams.get("vista");
  const vistaParam: VistaExtra =
    vistaRaw === "reportes" || vistaRaw === "impulsadoras"
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
    (next: {
      proyecto?: string | null;
      vista?: VistaExtra;
      proveedor?: string | null;
    }) => {
      const params = new URLSearchParams();
      const nextProyecto =
        next.proyecto === undefined ? proyectoParam : next.proyecto ?? null;
      const nextVista = next.vista === undefined ? vistaParam : next.vista;
      const nextProveedor =
        next.proveedor === undefined ? proveedorParam : next.proveedor ?? null;
      if (nextVista) {
        // Reportes e Impulsadoras son globales: no arrastran proveedor ni proyecto.
        params.set("vista", nextVista);
      } else {
        if (nextProveedor) params.set("proveedor", nextProveedor);
        if (nextProyecto) params.set("proyecto", nextProyecto);
      }
      const qs = params.toString();
      router.replace(qs ? `/marketing?${qs}` : "/marketing");
    },
    [proyectoParam, vistaParam, proveedorParam, router],
  );

  const refrescar = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    if (!proyectoParam) setNombreProyectoActual(null);
  }, [proyectoParam]);

  // Enlaces viejos: la pantalla de Anulados ya no existe. Se manda al inicio
  // en vez de dejar una URL que no dibuja nada.
  useEffect(() => {
    if (vistaRaw === "papelera" || vistaRaw === "anulados") {
      router.replace("/marketing");
    }
  }, [vistaRaw, router]);

  if (!authChecked) return null;

  const mostrandoVistaExtra = vistaParam !== null;
  const bloqueLabel = proveedorParam ? nombreBloque(proveedorParam) : null;

  const breadcrumbs: { label: string; onClick?: () => void }[] = [];
  if (vistaParam === "reportes") {
    breadcrumbs.push({ label: "Reportes" });
  } else if (vistaParam === "impulsadoras") {
    breadcrumbs.push({ label: "Impulsadoras" });
  } else if (proyectoParam && nombreProyectoActual) {
    if (bloqueLabel) {
      breadcrumbs.push({
        label: bloqueLabel,
        onClick: () => navegar({ proyecto: null }),
      });
    }
    breadcrumbs.push({ label: nombreProyectoActual });
  } else if (bloqueLabel) {
    breadcrumbs.push({ label: bloqueLabel });
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
              ← Marketing
            </button>
            {vistaParam === "impulsadoras" ? (
              <ImpulsadorasView marcas={marcas} />
            ) : (
              <ReportesTabs />
            )}
          </div>
        ) : proveedorParam ? (
          <ProyectosHomeView
            marcas={marcas}
            proveedor={proveedorParam}
            bucketLabel={bloqueLabel ?? ""}
            onBack={() => navegar({ proveedor: null, proyecto: null })}
            onOpenProyecto={(id) => navegar({ proyecto: id })}
            onNuevoProyecto={() => setShowNuevoProyecto(true)}
            onOpenReportes={() => navegar({ vista: "reportes" })}
            onOpenImpulsadoras={() => navegar({ vista: "impulsadoras" })}
            onOpenInventario={() => router.push("/marketing/mobiliario")}
            refreshKey={refreshKey}
          />
        ) : (
          <InicioMarketing
            onSelectProveedor={(key) => navegar({ proveedor: key })}
            onNuevoProyecto={() => setShowNuevoProyecto(true)}
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

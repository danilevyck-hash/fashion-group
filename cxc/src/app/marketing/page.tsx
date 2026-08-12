"use client";

// Marketing se organiza por MARCA. Daniel, textual: *"ellos facturan a mi bajo
// compañia diferentes. una por marca. cada marca tiene su encargado"*. El
// agrupador "proveedor" desapareció de la pantalla, y cada marca se cierra
// SOLA — el atajo "Cerrar las tres" se retiró el 11-ago-2026 (Daniel: *"que
// sea por separado mejor no?"*).
//
// URL patterns:
//   /marketing                        → inicio (un bloque por marca)
//   /marketing?bloque=TH              → lista de proyectos de esa marca
//   /marketing?bloque=TH&proyecto=…   → + overlay del proyecto
//   /marketing?vista=reportes         → reportes (reemplaza el inicio)
//   /marketing?vista=impulsadoras     → impulsadoras (reemplaza el inicio)
//
// Legacy: `?proveedor=` sigue entrando (era la clave vieja) y `?vista=papelera`
// / `?vista=anulados` redirigen a /marketing — esa pantalla se retiró. Un
// enlace viejo tiene que llegar a algún lado, no a un error.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import type { MkMarca } from "@/lib/marketing/types";
import {
  MULTIFASHION_KEY,
  SIN_BLOQUE,
  esMarcaCodigo,
  nombreDeBloque,
} from "@/lib/marketing/bloques";
import InicioMarketing from "./components/InicioMarketing";
import ProyectosHomeView from "./components/ProyectosHomeView";
import ProyectoOverlay from "./components/ProyectoOverlay";
import ReportesTabs from "./components/ReportesTabs";
import ImpulsadorasView from "./components/ImpulsadorasView";
import RegistrarGastoModal from "./components/RegistrarGastoModal";

// `historial` se removió de la UI; el archivo del componente queda en disco
// (HistorialView.tsx) por si se reactiva, pero ya no se rutea.
type VistaExtra = "reportes" | "impulsadoras" | null;

/** Bloques que dibuja el inicio y que "Ver proyectos" puede abrir. */
function esBloqueValido(k: string | null): boolean {
  if (!k) return false;
  return esMarcaCodigo(k) || k === MULTIFASHION_KEY || k === SIN_BLOQUE;
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
  // `proveedor` es la clave vieja: un enlace guardado sigue funcionando.
  const bloqueRaw = searchParams.get("bloque") ?? searchParams.get("proveedor");
  const bloqueParam = esBloqueValido(bloqueRaw) ? bloqueRaw : null;
  const vistaRaw = searchParams.get("vista");
  const vistaParam: VistaExtra =
    vistaRaw === "reportes" || vistaRaw === "impulsadoras"
      ? (vistaRaw as VistaExtra)
      : null;

  const [marcas, setMarcas] = useState<MkMarca[]>([]);
  const [registrandoGasto, setRegistrandoGasto] = useState(false);
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
      bloque?: string | null;
    }) => {
      const params = new URLSearchParams();
      const nextProyecto =
        next.proyecto === undefined ? proyectoParam : next.proyecto ?? null;
      const nextVista = next.vista === undefined ? vistaParam : next.vista;
      const nextBloque =
        next.bloque === undefined ? bloqueParam : next.bloque ?? null;
      if (nextVista) {
        // Reportes e Impulsadoras son globales: no arrastran marca ni proyecto.
        params.set("vista", nextVista);
      } else {
        if (nextBloque) params.set("bloque", nextBloque);
        if (nextProyecto) params.set("proyecto", nextProyecto);
      }
      const qs = params.toString();
      router.replace(qs ? `/marketing?${qs}` : "/marketing");
    },
    [proyectoParam, vistaParam, bloqueParam, router],
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
  const bloqueLabel = bloqueParam ? nombreDeBloque(bloqueParam, marcas) : null;

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
        ) : bloqueParam ? (
          <ProyectosHomeView
            marcas={marcas}
            bloque={bloqueParam}
            bucketLabel={bloqueLabel ?? ""}
            onBack={() => navegar({ bloque: null, proyecto: null })}
            onOpenProyecto={(id) => navegar({ proyecto: id })}
            onRegistrarGasto={() => setRegistrandoGasto(true)}
            onOpenReportes={() => navegar({ vista: "reportes" })}
            onOpenImpulsadoras={() => navegar({ vista: "impulsadoras" })}
            onOpenInventario={() => router.push("/marketing/mobiliario")}
            refreshKey={refreshKey}
          />
        ) : (
          <InicioMarketing
            onSelectBloque={(key) => navegar({ bloque: key })}
            onRegistrarGasto={() => setRegistrandoGasto(true)}
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

      {registrandoGasto && (
        <RegistrarGastoModal
          marcas={marcas}
          onClose={() => setRegistrandoGasto(false)}
          onSaved={() => {
            setRegistrandoGasto(false);
            refrescar();
          }}
        />
      )}
    </div>
  );
}

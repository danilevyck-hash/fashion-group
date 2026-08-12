"use client";

// Marketing se organiza por MARCA, en TRES NIVELES con URL propia
// (12-ago-2026 — mockup aprobado por Daniel):
//
//   /marketing                        → nivel 1: las marcas (este archivo)
//   /marketing/[marca]                → nivel 2: SUS períodos
//   /marketing/[marca]/[periodo]      → nivel 3: el detalle del período
//   /marketing?vista=reportes         → reportes (reemplaza el inicio)
//   /marketing?vista=impulsadoras     → impulsadoras (reemplaza el inicio)
//
// Daniel, textual: *"quiero que dentro de cada marca aparezca 'periodo uno'
// periodo dos, y dentro de cada periodo la info… que este ordenado"*.
//
// Legacy: `?bloque=` / `?proveedor=` eran la lista de la marca en esta misma
// página — ahora REDIRIGEN a /marketing/[marca] (conservando ?proyecto=). Y
// `?vista=papelera` / `?vista=anulados` siguen redirigiendo a /marketing.
// Un enlace viejo tiene que llegar a algún lado, no a un error.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import type { MkMarca } from "@/lib/marketing/types";
import { esBloqueKey } from "@/lib/marketing/bloques";
import { slugDeMarca } from "@/lib/marketing/slugs";
import InicioMarketing from "./components/InicioMarketing";
import ProyectoOverlay from "./components/ProyectoOverlay";
import ReportesTabs from "./components/ReportesTabs";
import ImpulsadorasView from "./components/ImpulsadorasView";
import RegistrarGastoModal from "./components/RegistrarGastoModal";

type VistaExtra = "reportes" | "impulsadoras" | null;

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
  // `bloque`/`proveedor` son de la URL vieja (la lista vivía acá): redirigen.
  const bloqueRaw = searchParams.get("bloque") ?? searchParams.get("proveedor");
  const bloqueParam = esBloqueKey(bloqueRaw) ? bloqueRaw : null;
  const vistaRaw = searchParams.get("vista");
  const vistaParam: VistaExtra =
    vistaRaw === "reportes" || vistaRaw === "impulsadoras"
      ? (vistaRaw as VistaExtra)
      : null;

  const [marcas, setMarcas] = useState<MkMarca[]>([]);
  const [registrandoGasto, setRegistrandoGasto] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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
    (next: { vista?: VistaExtra }) => {
      const params = new URLSearchParams();
      const nextVista = next.vista === undefined ? vistaParam : next.vista;
      // Reportes e Impulsadoras son globales: no arrastran marca ni proyecto.
      if (nextVista) params.set("vista", nextVista);
      const qs = params.toString();
      // PUSH, no replace: cada nivel es "otra página" y deja su entrada en el
      // historial → el botón Atrás deshace UN nivel (espejo del breadcrumb).
      // 🩸 Con replace, entrar a Reportes PISABA la entrada /marketing y Atrás
      // caía en "/". Mismo patrón que el módulo de referencia (ReclamosClient).
      router.push(qs ? `/marketing?${qs}` : "/marketing");
    },
    [vistaParam, router],
  );

  const refrescar = () => setRefreshKey((k) => k + 1);

  // Enlaces viejos, UNA sola puerta de redirect: la pantalla de Anulados
  // (papelera) ya no existe, y ?bloque= ahora es una página propia
  // (/marketing/[marca], nivel 2). Se conserva ?proyecto= en el viaje.
  useEffect(() => {
    const destinoLegacy =
      vistaRaw === "papelera" || vistaRaw === "anulados"
        ? "/marketing"
        : bloqueParam
          ? `/marketing/${slugDeMarca(bloqueParam, marcas)}${
              proyectoParam ? `?proyecto=${encodeURIComponent(proyectoParam)}` : ""
            }`
          : null;
    if (destinoLegacy) router.replace(destinoLegacy);
  }, [vistaRaw, bloqueParam, proyectoParam, marcas, router]);

  if (!authChecked) return null;

  const mostrandoVistaExtra = vistaParam !== null;

  const breadcrumbs: { label: string; onClick?: () => void }[] = [];
  if (vistaParam === "reportes") {
    breadcrumbs.push({ label: "Reportes" });
  } else if (vistaParam === "impulsadoras") {
    breadcrumbs.push({ label: "Impulsadoras" });
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
        ) : (
          <InicioMarketing
            onSelectBloque={(key) =>
              // Drill-down con push: el nivel 2 es otra página y Atrás vuelve
              // acá (candado navegacion-atras-fluido).
              router.push(`/marketing/${slugDeMarca(key, marcas)}`)
            }
            onRegistrarGasto={() => setRegistrandoGasto(true)}
            onOpenImpulsadoras={() => navegar({ vista: "impulsadoras" })}
            onOpenInventario={() => router.push("/marketing/mobiliario")}
            onOpenReportes={() => navegar({ vista: "reportes" })}
            refreshKey={refreshKey}
          />
        )}
      </main>

      {/* Overlay de un enlace viejo /marketing?proyecto=<id> sin bloque: se
          sigue abriendo acá para no dejar el enlace muerto. */}
      {proyectoParam && !mostrandoVistaExtra && !bloqueParam && (
        <ProyectoOverlay
          proyectoId={proyectoParam}
          onClose={() => router.push("/marketing")}
          onChange={refrescar}
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

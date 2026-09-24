"use client";

// Marketing se organiza en DOS puertas (23-sep-2026, Tiendas y Marcas —
// mockup aprobado por Daniel):
//
//   /marketing                        → la portada: Tiendas · Marcas ·
//                                       Impulsadoras · Mobiliario (`?tab=`)
//   /marketing/tienda/[codigo]        → la ficha de la tienda (se registra,
//                                       se edita y se anula ahí)
//   /marketing/[marca]                → la marca: su período abierto con UNA
//                                       línea por tienda, y los cerrados
//   /marketing/[marca]/[periodo]      → el detalle de un período
//
// Daniel, textual: el gasto *«se registra cuando llega la factura del
// proveedor»*, a la marca se le pasa *«cada 6 meses»*, y *«no quiero que se
// enfoque el módulo en [el cobro], sino en registrar bien los gastos para
// pasárselos a la marca»*.
//
// 🩸 Lo que se fue de la pantalla (patrón `mayor_lineas`: el código y las
// rutas se quedan, sin puerta): «Reportes» (`?vista=reportes`, por tienda ES
// la pestaña Tiendas y por marca ES la página de la marca) y el overlay del
// proyecto (`?proyecto=<id>`, que ahora REDIRIGE a la ficha de la tienda de
// ese proyecto). Todo detrás de `MARKETING_TIENDAS_Y_MARCAS`: en `false`, la
// pantalla de antes, intacta (`MarketingPageDeAntes`).
//
// Legacy que sigue llegando: `?bloque=` / `?proveedor=` REDIRIGEN a
// /marketing/[marca]; `?vista=papelera` / `?vista=anulados` a /marketing;
// `?vista=impulsadoras` a la pestaña Impulsadoras. Un enlace viejo tiene que
// llegar a algún lado, no a un error.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { puedeEscribirMarketing } from "@/lib/marketing/roles";
import type { MkMarca } from "@/lib/marketing/types";
import { esBloqueKey } from "@/lib/marketing/bloques";
import { slugDeMarca } from "@/lib/marketing/slugs";
import { ROLES_MARKETING } from "@/lib/marketing/roles";
import {
  MARKETING_TIENDAS_Y_MARCAS,
  destinoDeVistaVieja,
} from "@/lib/marketing/tiendas-y-marcas";
import InicioMarketing from "./components/InicioMarketing";
import ProyectoOverlay from "./components/ProyectoOverlay";
import ReportesTabs from "./components/ReportesTabs";
import ImpulsadorasView from "./components/ImpulsadorasView";
import RegistrarGastoModal from "./components/RegistrarGastoModal";
import PortadaTiendasYMarcas from "./components/PortadaTiendasYMarcas";
import { useRedirigirProyectoViejo } from "./components/useProyectoViejo";

type VistaExtra = "reportes" | "impulsadoras" | null;

export default function MarketingPageWrapper() {
  return (
    <Suspense>
      {MARKETING_TIENDAS_Y_MARCAS ? <MarketingPage /> : <MarketingPageDeAntes />}
    </Suspense>
  );
}

/** El catálogo de marcas, para «＋ Gasto» y los enlaces por slug. */
function useMarcas(): MkMarca[] {
  const [marcas, setMarcas] = useState<MkMarca[]>([]);
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
  return marcas;
}

// ─── LA PORTADA NUEVA: TIENDAS · MARCAS · IMPULSADORAS · MOBILIARIO ──────────

function MarketingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Contabilidad entra a mirar (23-sep-2026); quién escribe lo decide la
  // portada con `puedeEscribirMarketing`.
  const { authChecked, role } = useAuth({
    moduleKey: "marketing",
    allowedRoles: [...ROLES_MARKETING],
  });
  const marcas = useMarcas();
  const [registrandoGasto, setRegistrandoGasto] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const proyectoParam = searchParams.get("proyecto");
  const vistaRaw = searchParams.get("vista");
  // `bloque`/`proveedor` son de la URL vieja (la lista vivía acá): redirigen.
  const bloqueRaw = searchParams.get("bloque") ?? searchParams.get("proveedor");
  const bloqueParam = esBloqueKey(bloqueRaw) ? bloqueRaw : null;

  // 🔴 Un `?proyecto=<id>` viejo va a la ficha de la tienda de ese proyecto.
  // Con `?bloque=` se deja que el redirect de abajo lo lleve a la marca, que
  // a su vez redirige (la marca también lee `?proyecto=`).
  const redirigiendoProyecto = useRedirigirProyectoViejo(bloqueParam ? null : proyectoParam);

  // Enlaces viejos, UNA sola puerta de redirect: `?vista=` (Reportes se fue,
  // Impulsadoras es una pestaña), la papelera, y `?bloque=` (nivel 2).
  useEffect(() => {
    const destinoLegacy =
      vistaRaw !== null
        ? destinoDeVistaVieja(vistaRaw)
        : bloqueParam
          ? `/marketing/${slugDeMarca(bloqueParam, marcas)}${
              proyectoParam ? `?proyecto=${encodeURIComponent(proyectoParam)}` : ""
            }`
          : null;
    if (destinoLegacy) router.replace(destinoLegacy);
  }, [vistaRaw, bloqueParam, proyectoParam, marcas, router]);

  if (!authChecked) return null;
  if (redirigiendoProyecto) return null;

  const refrescar = () => setRefreshKey((k) => k + 1);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Marketing" breadcrumbs={[]} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <PortadaTiendasYMarcas
          role={role}
          marcas={marcas}
          refreshKey={refreshKey}
          onRegistrarGasto={() => setRegistrandoGasto(true)}
          onSelectBloque={(key) =>
            // Drill-down con push: el nivel 2 es otra página y Atrás vuelve
            // acá (candado navegacion-atras-fluido).
            router.push(`/marketing/${slugDeMarca(key, marcas)}`)
          }
          onSelectCerrado={(key, periodoId) =>
            router.push(`/marketing/${slugDeMarca(key, marcas)}/${periodoId}`)
          }
        />
      </main>

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

// ─── LA PANTALLA DE ANTES (interruptor en `false`), INTACTA ──────────────────
//
// Marketing se organizaba por MARCA, en TRES NIVELES con URL propia
// (12-ago-2026 — mockup aprobado por Daniel):
//
//   /marketing                        → nivel 1: las marcas
//   /marketing?vista=reportes         → reportes (reemplaza el inicio)
//   /marketing?vista=impulsadoras     → impulsadoras (reemplaza el inicio)
//
// Daniel, textual: *"quiero que dentro de cada marca aparezca 'periodo uno'
// periodo dos, y dentro de cada periodo la info… que este ordenado"*.

function MarketingPageDeAntes() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authChecked, role } = useAuth({
    moduleKey: "marketing",
    allowedRoles: [...ROLES_MARKETING],
  });

  const proyectoParam = searchParams.get("proyecto");
  const bloqueRaw = searchParams.get("bloque") ?? searchParams.get("proveedor");
  const bloqueParam = esBloqueKey(bloqueRaw) ? bloqueRaw : null;
  const vistaRaw = searchParams.get("vista");
  const vistaParam: VistaExtra =
    vistaRaw === "reportes" || vistaRaw === "impulsadoras"
      ? (vistaRaw as VistaExtra)
      : null;

  const marcas = useMarcas();
  const [registrandoGasto, setRegistrandoGasto] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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
              <ImpulsadorasView marcas={marcas} escribe={puedeEscribirMarketing(role)} />
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
            onSelectCerrado={(key, periodoId) =>
              // Un período cerrado abre su nivel 3 directo, por su ID: la
              // página del período lo resuelve (`seccionPorSlug` acepta el
              // slug o el id).
              router.push(`/marketing/${slugDeMarca(key, marcas)}/${periodoId}`)
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

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
// 🔴 Desde el 8-oct-2026 la portada ES el Marketing nuevo (Por cobrar · Gastos
// · Impulsadoras) para todos los roles de Marketing. La portada de pestañas
// (Tiendas · Marcas…) y la pantalla de antes se borraron; las subpáginas
// /marketing/tienda/… y /marketing/[marca] siguen vivas.
//
// Legacy que sigue llegando: `?bloque=` / `?proveedor=` REDIRIGEN a
// /marketing/[marca]; `?vista=papelera` / `?vista=anulados` a /marketing;
// `?vista=impulsadoras` a la pestaña Impulsadoras. Un enlace viejo tiene que
// llegar a algún lado, no a un error.

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import type { MkMarca } from "@/lib/marketing/types";
import { esBloqueKey } from "@/lib/marketing/bloques";
import { slugDeMarca } from "@/lib/marketing/slugs";
import { ROLES_MARKETING } from "@/lib/marketing/roles";
import { destinoDeVistaVieja } from "@/lib/marketing/tiendas-y-marcas";
import { useRedirigirProyectoViejo } from "./components/useProyectoViejo";
import { useEsCelular } from "./components/celular/useEsCelular";

// 🔴 MARKETING NUEVO (8-oct-2026, todos los roles de Marketing). Lazy.
const MarketingNuevo = dynamic(() => import("./components/nuevo/MarketingNuevo"), { ssr: false });

export default function MarketingPageWrapper() {
  return (
    <Suspense>
      <MarketingPage />
    </Suspense>
  );
}

/** El catálogo de marcas, para el Marketing nuevo y los enlaces por slug. */
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

function MarketingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Contabilidad entra a mirar (23-sep-2026); quién escribe lo decide el
  // Marketing nuevo con `puedeEscribirMarketing`.
  const { authChecked, role } = useAuth({
    moduleKey: "marketing",
    allowedRoles: [...ROLES_MARKETING],
  });
  const marcas = useMarcas();
  // 🔴 En el celular, cada pantalla de Marketing ya trae su título grande
  // (`TituloCelular`): «Marketing», «Marcas», la tienda, la marca… El layout no
  // agrega otro (24-sep-2026).
  const celular = useEsCelular();

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

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Marketing" breadcrumbs={[]} tituloEnLaPantalla={celular} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <MarketingNuevo role={role} marcas={marcas} />
      </main>
    </div>
  );
}

"use client";

// Shell del módulo «Ventas Boston» (/boston) — era «Confecciones Boston» con
// seis pestañas hasta el 23-sep-2026.
//
// Gate vía useAuth, el mismo patrón que /admin y /multifashion, y con
// `gerente_boston` EXPLÍCITO en `allowedRoles`: sin eso dependería del fallback
// de `fg_modules` en sessionStorage, y un login frío lo rebotaría a /home, que
// lo re-redirige acá (loop). Es la lección que dejó escrita `MultifashionShell`.
//
// 🔑 La lista de roles sale de `lib/boston/rol.ts` y las pestañas de
// `lib/boston/ventas-boston.ts`. Escribirlas acá sería la segunda copia, que es
// el bug que dejó a los 3 vendedores tocando una pestaña que siempre les
// contestaba 403 (ver `boston-roles.ts`).
//
// 🔴 CON `VENTAS_BOSTON` PRENDIDO QUEDAN INICIO Y VENTAS (23-sep-2026). Daniel:
// *«Llámalo Ventas Boston entonces. Y dale acceso a los otros módulos»*. Por
// cobrar vive en `/cxc`; Planilla y Préstamos en Asistencia. Las tarjetas del
// Inicio siguen siendo PUERTAS: las que apuntan a una pestaña que ya no está
// acá llevan a donde vive eso ahora (`destinoFueraDeBoston`).
//
// 🔴 FALLA ABIERTA: mientras `role_permissions` no le dé `cxc` a David, «Por
// cobrar» sigue acá (`tieneCxc` lo decide la MISMA regla que el menú,
// `hasModuleAccess`), y nada se le abre de más. Con el interruptor en `false`
// son las seis de siempre. Un `?tab=` viejo cae en Inicio.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { hasModuleAccess } from "@/lib/auth-check";
import AppHeader from "@/components/AppHeader";
import BostonTab from "@/components/cxc/BostonTab";
import { MODULO_BOSTON, rolesModuloBoston, type TabBoston } from "@/lib/boston/rol";
import {
  ROLES_PANTALLA_CXC,
  destinoFueraDeBoston,
  pestanasDeBoston,
  rotuloModuloBoston,
  tabDeBoston,
} from "@/lib/boston/ventas-boston";
import InicioBoston from "./tabs/InicioBoston";
import VentasBoston from "./tabs/VentasBoston";
import ClientesBoston from "./tabs/ClientesBoston";
import PlanillaBoston from "./tabs/PlanillaBoston";
import PrestamosBoston from "./tabs/PrestamosBoston";

export function BostonShell() {
  const { authChecked } = useAuth({
    moduleKey: MODULO_BOSTON,
    allowedRoles: rolesModuloBoston(),
  });
  const router = useRouter();

  // ¿Quien mira tiene Cuentas por Cobrar? La MISMA pregunta que el menú
  // (`hasModuleAccess` lee lo que dejó el login). Arranca en `false` a
  // propósito: en el primer cuadro del servidor no hay sessionStorage, y
  // dibujar «Por cobrar» para sacarla un tick después es peor que al revés.
  const [tieneCxc, setTieneCxc] = useState(false);
  useEffect(() => { setTieneCxc(hasModuleAccess("cxc", [...ROLES_PANTALLA_CXC])); }, []);
  const pestanas = pestanasDeBoston({ tieneCxc });

  // La pestaña vive en la URL para que un marcador o el botón de atrás lleguen
  // al mismo lugar. `replace` porque es un filtro del MISMO nivel, no un
  // drill-down (ver § Navegación e Historial).
  const [tabRaw, setTab] = useUrlState("tab", "inicio");
  const tab = tabDeBoston(tabRaw, pestanas);

  /** Cambia de pestaña, o sale del módulo si esa pestaña ya vive en otro lado. */
  const irA = (destino: TabBoston) => {
    const afuera = destinoFueraDeBoston(destino, pestanas);
    if (afuera) router.push(afuera);
    else setTab(destino);
  };

  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module={rotuloModuloBoston()} />

      {/* Las pestañas. `data-pestanas` es el asidero de la MEDICIÓN: buscarlas
          por su clase de Tailwind devuelve media pantalla y el script pasa en
          verde sin haber mirado la barra — el mismo motivo por el que las
          pestañas del CXC llevan su marca fija. */}
      <div className="max-w-6xl mx-auto px-2 lg:px-4 pt-2">
        <div
          data-pestanas="boston"
          className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto"
        >
          {pestanas.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={tab === key ? "page" : undefined}
              className={`min-h-[44px] min-w-[44px] px-1 lg:px-3 text-xs lg:text-sm whitespace-nowrap border-b-2 -mb-px transition
                          ${
                            tab === key
                              ? "border-gray-900 text-gray-900 font-medium"
                              : "border-transparent text-gray-400 hover:text-gray-600"
                          }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4">
        {tab === "inicio" && <InicioBoston onIr={irA} />}
        {tab === "cxc" && <BostonTab />}
        {tab === "ventas" && <VentasBoston />}
        {tab === "clientes" && <ClientesBoston />}
        {tab === "planilla" && <PlanillaBoston />}
        {tab === "prestamos" && <PrestamosBoston />}
      </div>
    </div>
  );
}

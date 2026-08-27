"use client";

// Shell del módulo Confecciones Boston (/boston) — seis pestañas.
//
// Gate vía useAuth, el mismo patrón que /admin y /multifashion, y con
// `gerente_boston` EXPLÍCITO en `allowedRoles`: sin eso dependería del fallback
// de `fg_modules` en sessionStorage, y un login frío lo rebotaría a /home, que
// lo re-redirige acá (loop). Es la lección que dejó escrita `MultifashionShell`.
//
// 🔑 La lista de roles y la de pestañas salen de `lib/boston/rol.ts`. Escribirlas
// acá sería la segunda copia, que es el bug que dejó a los 3 vendedores tocando
// una pestaña que siempre les contestaba 403 (ver `boston-roles.ts`).

import { useAuth } from "@/lib/hooks/useAuth";
import { useUrlState } from "@/lib/hooks/useUrlState";
import AppHeader from "@/components/AppHeader";
import BostonTab from "@/components/cxc/BostonTab";
import {
  MODULO_BOSTON,
  PESTANAS_BOSTON,
  rolesModuloBoston,
  tabBostonValida,
} from "@/lib/boston/rol";
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

  // La pestaña vive en la URL para que un marcador o el botón de atrás lleguen
  // al mismo lugar. `replace` porque es un filtro del MISMO nivel, no un
  // drill-down (ver § Navegación e Historial).
  const [tabRaw, setTab] = useUrlState("tab", "inicio");
  const tab = tabBostonValida(tabRaw);

  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-white">
      <AppHeader module="Confecciones Boston" />

      {/* Las pestañas. `data-pestanas` es el asidero de la MEDICIÓN: buscarlas
          por su clase de Tailwind devuelve media pantalla y el script pasa en
          verde sin haber mirado la barra — el mismo motivo por el que las
          pestañas del CXC llevan su marca fija. */}
      <div className="max-w-6xl mx-auto px-2 lg:px-4 pt-2">
        <div
          data-pestanas="boston"
          className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto"
        >
          {PESTANAS_BOSTON.map(({ key, label }) => (
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
        {tab === "inicio" && <InicioBoston onIr={setTab} />}
        {tab === "cxc" && <BostonTab />}
        {tab === "ventas" && <VentasBoston />}
        {tab === "clientes" && <ClientesBoston />}
        {tab === "planilla" && <PlanillaBoston />}
        {tab === "prestamos" && <PrestamosBoston />}
      </div>
    </div>
  );
}

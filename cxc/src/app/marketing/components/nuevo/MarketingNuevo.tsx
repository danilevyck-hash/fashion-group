"use client";

// ============================================================================
// MARKETING NUEVO — Por cobrar · Gastos · Impulsadoras · ··· (8-oct-2026).
//
// Mockup «Marketing desde cero», aprobado por Daniel («¿Lo aplicamos y veo qué
// tal?»), con sus cambios: un solo «Subir factura», sin «Registrar pago»,
// Descargar ZIP y Cerrar por separado, y «Excluir de este cierre».
//
// 🔴 UN SOLO NÚMERO POR MARCA: todo lo que se ve sale de `/api/marketing/cobros`
// (`resumenesDeCobro`), que es el cálculo del ZIP. La portada, el detalle del
// cobro, el cierre y el ZIP dicen lo mismo.
//
// Se ve con `veMarketingNuevo(role)` (desde el 8-oct-2026: todos los roles de
// Marketing). Contabilidad solo mira: sin «＋ Gasto», «Cerrar», «Subir
// comprobante» ni editar (`escribe`).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUrlState } from "@/lib/hooks/useUrlState";
import OverflowMenu from "@/components/ui/OverflowMenu";
import { Aviso } from "@/components/ui/Aviso";
import type { MkMarca } from "@/lib/marketing/types";
import type { MarketingDelCobro } from "@/lib/marketing/zip-marca";
import { puedeEscribirMarketing } from "@/lib/marketing/roles";
import { HREF_MOBILIARIO } from "@/lib/marketing/tiendas-y-marcas";
import { PESTANA_ACTIVA, PESTANA_INACTIVA } from "@/lib/marketing/marketing-2026-10";
import { SoloCobrableContexto } from "@/lib/marketing/solo-cobrable-contexto";
import RegistrarGastoModal from "../RegistrarGastoModal";
import PortadaProveedores from "../PortadaProveedores";
import PorCobrarNuevo from "./PorCobrarNuevo";
import GastosNuevo from "./GastosNuevo";
import ImpulsadorasNuevo from "./ImpulsadorasNuevo";

type Pestana = "por-cobrar" | "gastos" | "impulsadoras" | "proveedores";
const PESTANAS: ReadonlyArray<{ id: Pestana; rotulo: string }> = [
  { id: "por-cobrar", rotulo: "Por cobrar" },
  { id: "gastos", rotulo: "Gastos" },
  { id: "impulsadoras", rotulo: "Impulsadoras" },
];

export default function MarketingNuevo({ role, marcas }: { role: string; marcas: MkMarca[] }) {
  const router = useRouter();
  const [tabRaw, setTab] = useUrlState<Pestana>("tab", "por-cobrar");
  const tab: Pestana = (["por-cobrar", "gastos", "impulsadoras", "proveedores"] as const).includes(tabRaw)
    ? tabRaw
    : "por-cobrar";
  const escribe = puedeEscribirMarketing(role);
  const [datos, setDatos] = useState<MarketingDelCobro | null>(null);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [registrando, setRegistrando] = useState(false);
  const refrescar = useCallback(() => setRefresh((k) => k + 1), []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/marketing/cobros", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const d = (await res.json()) as MarketingDelCobro;
        if (!cancelado) {
          setDatos(d);
          setError(false);
        }
      } catch {
        if (!cancelado) setError(true);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [refresh]);

  return (
    <SoloCobrableContexto.Provider value>
      <div className="space-y-5" data-testid="marketing-nuevo">
        <h1 className="text-2xl font-semibold text-gray-900 sm:sr-only">Marketing</h1>
        <div className="flex items-center gap-1 border-b border-gray-200" role="tablist">
          {PESTANAS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={tab === p.id}
              onClick={() => setTab(p.id)}
              className={`inline-flex min-h-[44px] items-center px-3 sm:px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === p.id ? PESTANA_ACTIVA : PESTANA_INACTIVA
              }`}
            >
              {p.rotulo}
            </button>
          ))}
          <div className={`border-b-2 -mb-px ${tab === "proveedores" ? "border-gray-900" : "border-transparent"}`}>
            <OverflowMenu
              ariaLabel="Más secciones"
              align="left"
              items={[
                { label: "Mobiliario", onClick: () => router.push(HREF_MOBILIARIO) },
                { label: "Proveedores", onClick: () => setTab("proveedores") },
              ]}
            />
          </div>
        </div>

        {error && (
          <Aviso tono="error" accion={{ texto: "Reintentar", onClick: refrescar }}>
            No se pudo leer Marketing.
          </Aviso>
        )}

        {tab === "por-cobrar" && <PorCobrarNuevo datos={datos} escribe={escribe} onCambio={refrescar} />}
        {tab === "gastos" && (
          <GastosNuevo
            datos={datos}
            marcas={marcas}
            escribe={escribe}
            onRegistrar={() => setRegistrando(true)}
            onCambio={refrescar}
          />
        )}
        {tab === "impulsadoras" && <ImpulsadorasNuevo datos={datos} escribe={escribe} onCambio={refrescar} />}
        {tab === "proveedores" && <PortadaProveedores refreshKey={refresh} />}
      </div>

      {registrando && (
        <RegistrarGastoModal
          marcas={marcas}
          onClose={() => setRegistrando(false)}
          onSaved={() => {
            setRegistrando(false);
            refrescar();
          }}
        />
      )}
    </SoloCobrableContexto.Provider>
  );
}

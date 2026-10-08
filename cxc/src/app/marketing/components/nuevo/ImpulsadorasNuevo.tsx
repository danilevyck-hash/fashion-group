"use client";

// ============================================================================
// Marketing nuevo › IMPULSADORAS (8-oct-2026).
//
// Pregunta: ¿qué meses tienen comprobante y cuáles faltan?
//
// Una tarjeta por persona con la fila de meses: Cobrado (entró a un cierre) ·
// Comprobante (registrado, por cobrar) · Falta comprobante. «Subir comprobante»
// registra el pago del mes con su comprobante (el mismo registro de siempre).
// Un mes sin comprobante no tiene gasto, así que no entra al cobro.
// ============================================================================

import { useEffect, useState } from "react";
import { hoyPanama } from "@/lib/fecha-panama";
import { etiquetaMes } from "@/lib/marketing/meses";
import { formatearMonto } from "@/lib/marketing/normalizar";
import type { ImpulsadoraConEstado } from "@/lib/marketing/types";
import type { GastoDeLaLista, MarketingDelCobro } from "@/lib/marketing/zip-marca";
import RegistrarPagoModal from "../RegistrarPagoModal";
import { BOTON_SECUNDARIO } from "./PorCobrarNuevo";

const MESES_A_LA_VISTA = 4;

export type EstadoDelMes = "cobrado" | "comprobante" | "falta";

/** Los últimos `n` meses hasta el de hoy, «YYYY-MM», el más viejo primero. */
export function mesesALaVista(hoy: string, n: number = MESES_A_LA_VISTA): string[] {
  const [y, m] = hoy.slice(0, 7).split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** El estado de un mes de una impulsadora, según los gastos (que son los del ZIP). */
export function estadoDelMes(gastos: ReadonlyArray<GastoDeLaLista>, impulsadoraId: string, mes: string): EstadoDelMes {
  const delMes = gastos.filter((g) => g.impulsadoraId === impulsadoraId && g.impulsadoraMes === mes);
  if (delMes.some((g) => g.estado === "cobrado")) return "cobrado";
  if (delMes.length > 0) return "comprobante";
  return "falta";
}

const ROTULO_MES: Record<EstadoDelMes, string> = {
  cobrado: "Cobrado",
  comprobante: "✓ Comprobante",
  falta: "Falta comprobante",
};
const CLASE_MES: Record<EstadoDelMes, string> = {
  cobrado: "bg-gray-100 text-gray-600",
  comprobante: "bg-emerald-50 text-emerald-700",
  falta: "bg-amber-50 text-amber-700",
};

export default function ImpulsadorasNuevo({
  datos,
  escribe,
  onCambio,
}: {
  datos: MarketingDelCobro | null;
  escribe: boolean;
  onCambio: () => void;
}) {
  const [lista, setLista] = useState<ImpulsadoraConEstado[] | null>(null);
  const [subiendo, setSubiendo] = useState<{ imp: ImpulsadoraConEstado; mes: string } | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/marketing/impulsadoras", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!cancelado) setLista(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (!cancelado) setLista([]);
      });
    return () => {
      cancelado = true;
    };
  }, [refresh]);

  if (!datos || !lista) return <div className="text-sm text-gray-500 py-8 text-center">Cargando…</div>;
  if (lista.length === 0) {
    return <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500 text-center">Sin impulsadoras</div>;
  }

  const meses = mesesALaVista(hoyPanama());

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {lista.map((imp) => {
        const estados = meses.map((mes) => ({ mes, estado: estadoDelMes(datos.gastos, imp.id, mes) }));
        const faltan = estados.filter((e) => e.estado === "falta");
        const marca = imp.marcas[0]?.marca?.nombre ?? "";
        const suyos = datos.gastos.filter((g) => g.impulsadoraId === imp.id && g.estado !== "no_recuperable" && g.monto > 0);
        const pct = suyos.length > 0 ? Math.round((suyos[0].aCobrar / suyos[0].monto) * 100) : null;
        const proximo = faltan[0]?.mes ?? null;
        return (
          <section key={imp.id} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3" data-testid={`impulsadora-${imp.nombre}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-gray-900">{imp.nombre}</div>
                <div className="text-xs text-gray-500">
                  {[marca, `${formatearMonto(imp.monto_mensual)} al mes`, pct !== null ? `se cobra ${pct} %` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${
                  faltan.length > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {faltan.length > 0 ? `Falta ${faltan.length}` : "Al día"}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {estados.map((e) => (
                <div key={e.mes} className={`rounded-md px-2 py-2 text-xs ${CLASE_MES[e.estado]}`} data-testid="mes-impulsadora" data-estado={e.estado}>
                  <div className="font-medium">{etiquetaMes(`${e.mes}-01`)}</div>
                  <div>{ROTULO_MES[e.estado]}</div>
                </div>
              ))}
            </div>
            {escribe && proximo && (
              <button type="button" onClick={() => setSubiendo({ imp, mes: proximo })} className={BOTON_SECUNDARIO}>
                Subir comprobante · {etiquetaMes(`${proximo}-01`).toLowerCase()}
              </button>
            )}
          </section>
        );
      })}

      {subiendo && (
        <RegistrarPagoModal
          impulsadora={subiendo.imp}
          mesInicial={`${subiendo.mes}-01`}
          onClose={() => setSubiendo(null)}
          onSaved={() => {
            setSubiendo(null);
            setRefresh((k) => k + 1);
            onCambio();
          }}
        />
      )}
    </div>
  );
}

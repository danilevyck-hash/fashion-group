"use client";

// ─────────────────────────────────────────────────────────────────────────────
// NUEVA GUÍA › «FACTURAS ETIQUETADAS PENDIENTES» (18-sep-2026).
//
// 🔴 LA GUÍA SE SIGUE ARMANDO IGUAL QUE HOY. Esto es un ATAJO: marcar una
// factura etiquetada rellena los MISMOS renglones que se escriben a mano
// (cliente, empresa, facturas «A, B», bultos, dirección). El payload del POST
// no cambia ni un campo, y si no se toca, la pantalla es la de siempre.
//
// 🔴 SE JUNTAN POR CLIENTE **Y** EMPRESA, con los bultos SUMADOS: tres facturas
// del mismo par van en UN renglón. Dos del mismo cliente en empresas distintas
// van en dos — que es lo que ya pasa de verdad (GT-256 llevó a Nova Lux en
// cuatro renglones, uno por empresa).
//
// 🔴 LO ESCRITO A MANO NUNCA SE PISA: se agrega al renglón que ya existe para
// ese par, exactamente como `marcarFactura`.
//
// 🔴 ANTI-DOBLE CAPTURA, LA VUELTA DE ACÁ (18-sep-2026). Si la factura de esta
// etiqueta YA está en un renglón y no la puso este panel —la marcó el selector
// de siempre, o alguien la escribió a mano—, la casilla sale **bloqueada** y
// dice por qué. Volver a marcarla sumaría sus cajas encima de un renglón que ya
// la tiene. La regla vive en `lib/guias/anti-doble-captura.ts`, junto con la
// explicación de por qué esto FRENA y «Ya salió en GT-XXX» solo AVISA.
//
// ⚠️ Solo se ofrecen las PENDIENTES: una etiqueta que ya salió en una guía no
// entra a otra. La lista la lee `GuiaForm` una sola vez (`useEtiquetasVivas`) y
// la comparten los dos paneles; sin ella, esta sección no se dibuja.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import type { GuiaItem } from "./types";
import {
  desmarcarEtiqueta,
  marcarEtiqueta,
  type EtiquetaFila,
} from "@/lib/guias/etiquetas";
import {
  MOTIVO_TOMADA_POR_EL_SELECTOR,
  capturaEnEtiquetas,
  idsParaAtar,
} from "@/lib/guias/anti-doble-captura";

interface Props {
  items: GuiaItem[];
  /** Las etiquetas pendientes, leídas UNA vez por `GuiaForm`. */
  etiquetas: readonly EtiquetaFila[];
  /** Reemplaza los renglones del formulario (el hook renumera y asigna uid). */
  onReemplazarItems: (items: GuiaItem[]) => void;
  /** Los ids marcados, para que al guardar la guía se aten a sus renglones. */
  onSeleccion?: (ids: number[]) => void;
}

export default function EtiquetasPendientes({
  items,
  etiquetas,
  onReemplazarItems,
  onSeleccion,
}: Props) {
  // 🔑 LO ÚNICO QUE SE GUARDA APARTE ES QUIÉN MARCÓ. Qué está marcado se sigue
  // DERIVANDO de los renglones: `capturaEnEtiquetas` exige las dos cosas —estar
  // en `mias` y seguir en un renglón—, así que borrar una fila a mano desmarca
  // su etiqueta sola, igual que en la Fase 1. El conjunto hace falta porque el
  // renglón no guarda de dónde salió cada número.
  const [mias, setMias] = useState<ReadonlySet<number>>(new Set());

  const marcadas = idsParaAtar(items, etiquetas, mias);
  useEffect(() => {
    onSeleccion?.(marcadas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcadas.join(",")]);

  if (etiquetas.length === 0) return null;

  function alternar(e: EtiquetaFila) {
    const estado = capturaEnEtiquetas(items, e, mias);
    if (estado === "tomada-por-el-selector") return; // bloqueada: no se toca
    if (estado === "marcada") {
      setMias((previas) => {
        const siguiente = new Set(previas);
        siguiente.delete(e.id);
        return siguiente;
      });
      onReemplazarItems(desmarcarEtiqueta(items, e) as GuiaItem[]);
      return;
    }
    setMias((previas) => new Set(previas).add(e.id));
    onReemplazarItems(marcarEtiqueta(items, e) as GuiaItem[]);
  }

  return (
    <div data-testid="etiquetas-pendientes" className="mb-8">
      <div className="mb-4 text-xs uppercase tracking-[0.05em] text-gray-400">
        Facturas etiquetadas pendientes · {etiquetas.length}
      </div>
      <div className="rounded-lg border border-gray-200 p-4">
        <ul>
          {etiquetas.map((e) => {
            const estado = capturaEnEtiquetas(items, e, mias);
            const bloqueada = estado === "tomada-por-el-selector";
            return (
              <li key={e.id} className="border-t border-gray-100 first:border-t-0">
                <label
                  className={`flex min-h-[44px] flex-wrap items-center gap-3 py-1.5 text-sm lg:[@media(pointer:fine)]:min-h-0 lg:[@media(pointer:fine)]:py-1 ${
                    bloqueada ? "cursor-default" : "cursor-pointer"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={estado === "marcada" || bloqueada}
                    disabled={bloqueada}
                    onChange={() => alternar(e)}
                    className="h-4 w-4 shrink-0 accent-black disabled:opacity-60"
                  />
                  <span className="shrink-0 font-mono tabular-nums">{e.secuencial}</span>
                  <span className="shrink-0 text-gray-500">{e.empresa}</span>
                  <span className="min-w-0 truncate">{e.cliente_nombre}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-gray-600">
                    {e.cajas} {e.cajas === 1 ? "caja" : "cajas"}
                  </span>
                  {/* 🔴 EL BLOQUEO DICE POR QUÉ: una casilla apagada y muda se
                      lee como una falla del sistema. */}
                  {bloqueada && (
                    <span className="shrink-0 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                      {MOTIVO_TOMADA_POR_EL_SELECTOR}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

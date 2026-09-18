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
// ⚠️ Solo se ofrecen las PENDIENTES: una etiqueta que ya salió en una guía no
// entra a otra. Y falla ABIERTA: sin la migración corrida o sin red, esta
// sección no se dibuja y el formulario es el de siempre.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import type { GuiaItem } from "./types";
import {
  desmarcarEtiqueta,
  estaImportada,
  etiquetaMarcada,
  etiquetasMarcadas,
  marcarEtiqueta,
  type EtiquetaFila,
} from "@/lib/guias/etiquetas";

interface Props {
  items: GuiaItem[];
  /** Reemplaza los renglones del formulario (el hook renumera y asigna uid). */
  onReemplazarItems: (items: GuiaItem[]) => void;
  /** Los ids marcados, para que al guardar la guía se aten a sus renglones. */
  onSeleccion?: (ids: number[]) => void;
}

export default function EtiquetasPendientes({ items, onReemplazarItems, onSeleccion }: Props) {
  const [etiquetas, setEtiquetas] = useState<EtiquetaFila[]>([]);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/guias/etiquetas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { etiquetas?: EtiquetaFila[] } | null) => {
        if (cancelado || !d || !Array.isArray(d.etiquetas)) return;
        setEtiquetas(d.etiquetas.filter((e) => !estaImportada(e)));
      })
      .catch(() => { /* sin sección; la guía se arma a mano como siempre */ });
    return () => { cancelado = true; };
  }, []);

  // 🔑 QUÉ ESTÁ MARCADO SE DERIVA DE LOS RENGLONES, no se guarda aparte: así
  // borrar una fila a mano desmarca su etiqueta sola, sin efectos cruzados.
  const marcadas = etiquetasMarcadas(items, etiquetas);
  useEffect(() => {
    onSeleccion?.(marcadas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcadas.join(",")]);

  if (etiquetas.length === 0) return null;

  function alternar(e: EtiquetaFila) {
    const nuevos = etiquetaMarcada(items, e)
      ? desmarcarEtiqueta(items, e)
      : marcarEtiqueta(items, e);
    onReemplazarItems(nuevos as GuiaItem[]);
  }

  return (
    <div data-testid="etiquetas-pendientes" className="mb-8">
      <div className="mb-4 text-xs uppercase tracking-[0.05em] text-gray-400">
        Facturas etiquetadas pendientes · {etiquetas.length}
      </div>
      <div className="rounded-lg border border-gray-200 p-4">
        <ul>
          {etiquetas.map((e) => (
            <li key={e.id} className="border-t border-gray-100 first:border-t-0">
              <label className="flex min-h-[44px] cursor-pointer flex-wrap items-center gap-3 py-1.5 text-sm lg:[@media(pointer:fine)]:min-h-0 lg:[@media(pointer:fine)]:py-1">
                <input
                  type="checkbox"
                  checked={etiquetaMarcada(items, e)}
                  onChange={() => alternar(e)}
                  className="h-4 w-4 shrink-0 accent-black"
                />
                <span className="shrink-0 font-mono tabular-nums">{e.secuencial}</span>
                <span className="shrink-0 text-gray-500">{e.empresa}</span>
                <span className="min-w-0 truncate">{e.cliente_nombre}</span>
                <span className="ml-auto shrink-0 tabular-nums text-gray-600">
                  {e.cajas} {e.cajas === 1 ? "caja" : "cajas"}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

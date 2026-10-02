"use client";

// ─────────────────────────────────────────────────────────────────────────────
// NUEVA GUÍA › «DETALLE DE ENVÍO», UNA SOLA TABLA (1-oct-2026, Daniel aprobó el
// mockup; interruptor `GUIA_NUEVA_2026_10`).
//
// Arriba, lo que VA en la guía:
//   · los envíos etiquetados marcados — sus bultos con candado (lo impreso no
//     se cambia) y una casilla para sacarlos;
//   · los renglones sin etiqueta — chip «Sin etiqueta», ✎ para escribirlo y ✕
//     para quitarlo.
// El total de bultos y «+ Agregar sin etiquetas» (el buscador de cliente y sus
// facturas vive ADENTRO de ese panel, `AgregarSinEtiquetas`).
// Abajo, en gris, «Etiquetados, sin marcar»: los envíos pendientes que todavía
// no van, con su casilla para sumarlos.
//
// 🔴 UN RENGLÓN POR ENVÍO (`marcarEnvio`): dos envíos del mismo cliente +
// empresa + destino son dos renglones. Al guardar, cada envío se ata a SU
// renglón por sus facturas (`renglonDelEnvio`, en el servidor).
//
// 🩸 Se fueron las dos secciones de arriba —«Envíos etiquetados pendientes» y
// «Facturas del cliente»— y la fila vacía con la que nacía la guía.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, type ReactNode } from "react";
import type { GuiaItem } from "./types";
import type { ClienteHit } from "@/lib/hooks/useBusquedaClientes";
import type { EtiquetaFila } from "@/lib/guias/etiquetas";
import {
  agruparEnEnvios,
  desmarcarEnvio,
  facturasDelEnvio,
  marcarEnvio,
  type Envio,
} from "@/lib/guias/etiquetas-por-envio";
import { envioTomadoPorUnRenglon } from "@/lib/guias/anti-doble-captura";
import { filaTieneDatos } from "./guia-form-logic";
import { emptyItem } from "./constants";
import AgregarSinEtiquetas from "./AgregarSinEtiquetas";
import { facturasParaMostrar } from "@/lib/guias/numero-factura";

/** El chip del renglón escrito a mano. */
export const CHIP_SIN_ETIQUETA = "Sin etiqueta";
/** Por qué un envío etiquetado no se puede sumar: su factura ya está en un renglón sin etiqueta. */
export const MOTIVO_FACTURA_EN_RENGLON = "Su factura ya está en un renglón sin etiqueta";

/**
 * Los ids de las etiquetas que van en la guía: las de los envíos que tienen
 * SU renglón (`envio_id`). Se atan después de crear la guía.
 */
export function idsDeLosEnviosMarcados(items: readonly GuiaItem[], envios: readonly Envio[]): number[] {
  const marcados = new Set(items.map((r) => r.envio_id).filter(Boolean));
  return envios.filter((v) => marcados.has(v.envio_id)).flatMap((v) => v.filas.map((f) => f.id));
}

function Candado() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** Las columnas, iguales en el encabezado y en cada renglón (solo en pantalla ancha). */
const COLUMNAS =
  "lg:grid lg:grid-cols-[2.75rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_5rem_6rem] lg:items-center lg:gap-x-3";

const BOTON_ICONO =
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-gray-400 transition hover:text-black";

interface Props {
  items: GuiaItem[];
  /** Las etiquetas PENDIENTES (`useEtiquetasVivas`). */
  etiquetas: readonly EtiquetaFila[];
  onReemplazarItems: (items: GuiaItem[]) => void;
  onSeleccion?: (ids: number[]) => void;
  /** Quita un renglón sin etiqueta (con su «Deshacer»). */
  onQuitar: (idx: number) => void;
  /** Los campos del renglón sin etiqueta, para escribirlo (✎). */
  editor: (item: GuiaItem, idx: number) => ReactNode;
  clientesTop?: ClienteHit[];
  destinoAutollenadoDe?: (codigo: string) => string | null;
}

export default function DetalleDeEnvio({
  items,
  etiquetas,
  onReemplazarItems,
  onSeleccion,
  onQuitar,
  editor,
  clientesTop,
  destinoAutollenadoDe,
}: Props) {
  const [editando, setEditando] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);

  const envios = agruparEnEnvios(etiquetas);
  const marcados = new Set(items.map((r) => r.envio_id).filter(Boolean));
  const sinMarcar = envios.filter((v) => !marcados.has(v.envio_id));
  const porId = new Map(envios.map((v) => [v.envio_id, v]));
  /** Solo los renglones escritos a mano: contra ellos se mira si una factura ya está. */
  const aMano = items.filter((r) => !r.envio_id);

  const ids = idsDeLosEnviosMarcados(items, envios);
  useEffect(() => {
    onSeleccion?.(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  const visibles = items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => filaTieneDatos(item) || item.uid === editando);
  const total = items.reduce((s, i) => s + (i.bultos || 0), 0);

  function sacar(v: Envio) {
    onReemplazarItems(desmarcarEnvio(items, v));
  }
  function sumar(v: Envio) {
    if (envioTomadoPorUnRenglon(aMano, v.filas)) return;
    onReemplazarItems(marcarEnvio(items, v));
  }
  function quitar(idx: number) {
    if (items.length > 1) onQuitar(idx);
    else onReemplazarItems([emptyItem(1)]);
  }

  return (
    <div data-testid="detalle-de-envio">
      {visibles.length > 0 && (
        <div className={`hidden border-b border-gray-200 py-2 text-xs uppercase tracking-[0.05em] text-gray-400 ${COLUMNAS}`}>
          <span />
          <span>Cliente</span>
          <span>Empresa</span>
          <span>Destino</span>
          <span>Facturas</span>
          <span className="text-right">Bultos</span>
          <span />
        </div>
      )}

      <ul>
        {visibles.map(({ item, idx }) => {
          const envio = item.envio_id ? porId.get(item.envio_id) : undefined;
          const etiquetado = Boolean(item.envio_id || item.con_etiquetas);
          const abierto = !etiquetado && item.uid === editando;
          return (
            <li
              key={item.uid ?? idx}
              data-renglon={etiquetado ? "etiquetado" : "sin-etiqueta"}
              className="border-b border-gray-100 py-2"
            >
              <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${COLUMNAS}`}>
                <span className="flex items-center">
                  {etiquetado ? (
                    <label className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked
                        disabled={!envio}
                        onChange={() => envio && sacar(envio)}
                        aria-label={`Sacar de la guía el envío de ${item.cliente}`}
                        className="h-4 w-4 accent-black"
                      />
                    </label>
                  ) : (
                    <span className="text-xs tabular-nums text-gray-300">{idx + 1}</span>
                  )}
                </span>
                <span className="min-w-0 basis-full break-words lg:basis-auto">
                  <span className="font-medium">{item.cliente || "Sin cliente"}</span>
                  {!etiquetado && (
                    <span className="ml-2 inline-block rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 align-middle text-xs text-gray-600">
                      {CHIP_SIN_ETIQUETA}
                    </span>
                  )}
                </span>
                <span className="min-w-0 break-words text-gray-500">{item.empresa || "—"}</span>
                <span className="min-w-0 break-words text-gray-600">{item.direccion || "—"}</span>
                {/* La factura se guarda COMPLETA y se muestra corta; entera en el `title`. Nunca se corta a medias. */}
                <span className="min-w-0 break-words tabular-nums text-gray-600" title={item.facturas}>
                  {facturasParaMostrar(item.facturas) || "—"}
                </span>
                <span
                  className="ml-auto inline-flex items-center justify-end gap-1 tabular-nums lg:ml-0"
                  data-bultos-de-etiquetas={etiquetado ? "1" : undefined}
                >
                  {etiquetado && <Candado />}
                  {item.bultos || 0}
                  {etiquetado && <span className="sr-only">, de las etiquetas impresas: no se cambian</span>}
                </span>
                <span className="flex items-center justify-end">
                  {!etiquetado && (
                    <>
                      <button
                        type="button"
                        aria-label={`Editar el envío ${idx + 1}`}
                        title="Editar"
                        aria-expanded={abierto}
                        onClick={() => setEditando(abierto ? null : (item.uid ?? null))}
                        className={BOTON_ICONO}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        aria-label={`Quitar el envío ${idx + 1}`}
                        title="Quitar"
                        onClick={() => quitar(idx)}
                        className={`${BOTON_ICONO} hover:text-red-500`}
                      >
                        ✕
                      </button>
                    </>
                  )}
                </span>
              </div>
              {abierto && (
                <div className="mt-2 rounded-lg border border-gray-200 p-4">
                  {editor(item, idx)}
                  <button
                    type="button"
                    onClick={() => setEditando(null)}
                    className="mt-3 inline-flex min-h-[44px] items-center text-sm text-gray-500 transition hover:text-black"
                  >
                    Listo
                  </button>
                </div>
              )}
            </li>
          );
        })}
        {visibles.length === 0 && (
          <li className="py-3 text-sm text-gray-400">Todavía no hay envíos en la guía.</li>
        )}
      </ul>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setAgregando((a) => !a)}
          aria-expanded={agregando}
          className="-mx-2 inline-flex min-h-[44px] items-center px-2 text-sm text-gray-500 transition hover:text-black"
        >
          + Agregar sin etiquetas
        </button>
        <div className="flex items-baseline gap-2">
          <span className="text-xs uppercase tracking-[0.05em] text-gray-400">Total</span>
          <span className="text-lg font-semibold tabular-nums">{total}</span>
          <span className="text-sm text-gray-500">{total === 1 ? "bulto" : "bultos"}</span>
        </div>
      </div>

      {agregando && (
        <AgregarSinEtiquetas
          items={items}
          etiquetas={etiquetas}
          onReemplazarItems={onReemplazarItems}
          onEditar={setEditando}
          onCerrar={() => setAgregando(false)}
          clientesTop={clientesTop}
          destinoAutollenadoDe={destinoAutollenadoDe}
        />
      )}

      {sinMarcar.length > 0 && (
        <div data-testid="etiquetados-sin-marcar" className="mt-6">
          <div className="mb-1 text-xs uppercase tracking-[0.05em] text-gray-400">
            Etiquetados, sin marcar · {sinMarcar.length}
          </div>
          <ul className="text-gray-400">
            {sinMarcar.map((v) => {
              const bloqueado = envioTomadoPorUnRenglon(aMano, v.filas);
              return (
                <li key={v.envio_id} className="border-b border-gray-100 last:border-0">
                  <label
                    className={`flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm ${
                      bloqueado ? "cursor-default" : "cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={false}
                      disabled={bloqueado}
                      onChange={() => sumar(v)}
                      aria-label={`Sumar a la guía el envío de ${v.cliente_nombre}`}
                      className="h-4 w-4 shrink-0 accent-black disabled:opacity-60"
                    />
                    <span className="min-w-0 break-words">
                      {v.cliente_nombre} · {v.empresa}
                    </span>
                    <span className="min-w-0 break-words">→ {v.destino}</span>
                    <span className="min-w-0 break-words tabular-nums" title={facturasDelEnvio(v)}>
                      {facturasParaMostrar(facturasDelEnvio(v))}
                    </span>
                    <span className="ml-auto shrink-0 tabular-nums">
                      {v.total} {v.total === 1 ? "bulto" : "bultos"}
                    </span>
                    {bloqueado && (
                      <span className="shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-600">
                        {MOTIVO_FACTURA_EN_RENGLON}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

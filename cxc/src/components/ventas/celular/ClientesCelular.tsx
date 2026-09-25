"use client";

// ============================================================================
// VENTAS › CLIENTES EN EL CELULAR — la «3f» (25-sep-2026).
//
// 🩸 QUÉ REEMPLAZA, medido el 25-sep-2026 a 390 px:
//   · el primer cliente empezaba a **y=487** (58 %) y su monto a **y=572**
//     (68 %), con **13 cosas tocables** antes;
//   · abría por «última compra», así que **los 10 primeros eran los 10 que
//     compraron ayer**, en orden alfabético, y el más grande del año
//     ($1.431.353) quedaba cuarto **de casualidad**;
//   · la fecha que MANDABA el orden iba **sin rótulo**, en gris de 12 px, en la
//     esquina derecha —donde el botón flotante le comía 39 px de los 79 que
//     mide «24 sept 2026»—;
//   · «Descargar en Excel» se llevaba un renglón entero él solo (166 × 44 px);
//   · había **dos formas de ordenar en la misma pestaña**: una hoja en Ventas y
//     tres chips en Utilidad.
//
// 🔴 ABRE POR PLATA DEL AÑO: el que más compró, arriba. Lo decidió Daniel.
// 🔴 EL % ES LO MÁS GRANDE DE LA FILA y el monto va ENTERO debajo, sin
//    centavos. La línea gris contesta «¿me compró hace poco?» con palabras
//    —«compró ayer», «3 meses sin comprar»— calculadas de la última compra
//    REAL, no del orden.
//
// 🔴 NINGÚN NÚMERO CAMBIA: las filas llegan ya filtradas y ordenadas por
// `ClientesView`, con los mismos montos y los mismos deltas de la computadora.
// ============================================================================

import { useState } from "react";
import { Search } from "lucide-react";
import type { Cliente } from "../types";
import {
  lineaGrisDelCliente,
  montoDeLaTabla,
  porcentajeDelCliente,
  ultimaCompraEnPalabras,
} from "@/lib/ventas/celular";
import {
  ESTILO_COLCHON_DERECHA,
  GrupoVentas,
  PantallaVentas,
  TituloVentas,
  colorDelTono,
} from "./PiezasVentas";

interface Props {
  filas: readonly Cliente[];
  /** Cuántos hay en total (para el subtítulo). */
  total: number;
  selectedYear: number;
  /** «Hoy» de Panamá, `AAAA-MM-DD`. Llega por parámetro: acá no se mira el reloj. */
  hoy: string;
  busqueda: string;
  onBusqueda: (v: string) => void;
  /** El chip «Todas las empresas» / la empresa elegida. */
  empresaRotulo: string;
  onEmpresa: () => void;
  onTocarCliente: (c: Cliente) => void;
  /** El «···» de arriba: Ordenar · Actualizar ahora · Descargar. */
  accion?: React.ReactNode;
  /** Lo que está pasando abajo del todo (los sin compras, «Otros»…). */
  pie?: React.ReactNode;
}

export function ClientesCelular({
  filas,
  total,
  selectedYear,
  hoy,
  busqueda,
  onBusqueda,
  empresaRotulo,
  onEmpresa,
  onTocarCliente,
  accion,
  pie,
}: Props) {
  const [buscando, setBuscando] = useState(busqueda.length > 0);

  return (
    <PantallaVentas>
      <TituloVentas
        titulo="Clientes"
        detalle={`${total.toLocaleString("en-US")} clientes · año ${selectedYear}`}
        accion={
          <div className="flex items-center gap-1">
            {/* 🔴 BUSCAR ES UNA LUPA, NO UNA CAJA SIEMPRE ABIERTA: la caja se
                llevaba un renglón entero en una lista de 115 nombres. */}
            <button
              type="button"
              aria-label="Buscar cliente"
              data-lupa-clientes
              onClick={() => setBuscando((v) => !v)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-gray-600 active:opacity-60"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
            {accion}
          </div>
        }
      />

      {buscando && (
        <div className="px-4 pt-2">
          <input
            autoFocus
            value={busqueda}
            onChange={(e) => onBusqueda(e.target.value)}
            placeholder="Buscar cliente o código…"
            aria-label="Buscar cliente o código"
            data-buscador-clientes
            className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[16px] text-gray-900 placeholder:text-gray-400"
          />
        </div>
      )}

      {/* 🔴 «TODAS LAS EMPRESAS» ES UN CHIP, no un desplegable de ancho casi
          completo: en la práctica casi nunca se toca. */}
      <div className="flex flex-wrap gap-2 px-4 pt-3">
        <button
          type="button"
          onClick={onEmpresa}
          data-chip-empresa
          className="min-h-[36px] rounded-full border border-gray-300 bg-white px-3 text-[13px] font-medium text-gray-800 active:opacity-60"
        >
          {empresaRotulo} ▾
        </button>
      </div>

      <GrupoVentas className="mt-3">
        {filas.length === 0 && (
          <p className="px-4 py-6 text-center text-[14px] text-gray-500">
            Ningún cliente con ese nombre o código.
          </p>
        )}
        {filas.map((c) => {
          const pct = porcentajeDelCliente(c.delta);
          const ultima = ultimaCompraEnPalabras(c.ultimaIso, hoy);
          const gris = lineaGrisDelCliente(c.id, c.empresas_count, ultima);
          return (
            <button
              key={`${c.empresaKey}|${c.id}`}
              type="button"
              data-fila-cliente={`${c.empresaKey}|${c.id}`}
              onClick={() => onTocarCliente(c)}
              className="flex w-full min-h-[64px] items-center gap-3 border-t border-gray-100 px-4 py-2.5 text-left first:border-t-0 active:bg-gray-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-gray-900">{c.nombre}</span>
                <span
                  className={`mt-0.5 block truncate text-[12.5px] ${
                    ultima?.avisa ? "text-amber-700" : "text-gray-500"
                  }`}
                >
                  {gris}
                </span>
              </span>
              <span className="shrink-0 text-right">
                {/* 🔴 EL % ES LO MÁS GRANDE DE LA FILA, y lleva su color. */}
                <span className={`block text-[17px] font-bold tabular-nums ${colorDelTono(pct.tono)}`}>
                  {pct.texto}
                </span>
                {/* 🔴 EL MONTO, ENTERO Y DEBAJO. Sin centavos: en el teléfono
                    los centavos de un total de año no deciden nada. */}
                <span className="block text-[13px] tabular-nums text-gray-600">
                  {montoDeLaTabla(c.ytd)}
                </span>
              </span>
            </button>
          );
        })}
      </GrupoVentas>

      <div className="px-6 pt-3 text-[12.5px] text-gray-500" style={ESTILO_COLCHON_DERECHA}>
        {pie}
      </div>
    </PantallaVentas>
  );
}

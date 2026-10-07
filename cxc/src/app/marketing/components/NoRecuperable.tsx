"use client";

// ============================================================================
// Marketing › «No recuperable» (7-oct-2026, `MKT_SOLO_COBRABLE_2026_10`, apagado).
//
// Pregunta de la pantalla: ¿qué gastos hay que NO se le cobran a ninguna marca?
//
// 🔴 SOLO DE CONSULTA. Daniel decidió que Marketing registra solo lo cobrable;
// esto es lo que ya existía antes (Multi Fashion, la compra de barras #145) y
// no se borra. No suma a ninguna marca ni entra a ningún ZIP. Sin botón de
// registrar: abrir aquí una segunda puerta reabriría lo que el registro nuevo
// cerró. Editar o anular cada gasto sigue en la ficha de su tienda.
// ============================================================================

import { useEffect, useState } from "react";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";
import {
  ROTULO_MOTIVO,
  ROTULO_NO_RECUPERABLE,
  type FilaNoRecuperable,
} from "@/lib/marketing/solo-cobrable-2026-10";
import { ROTULO_SIN_TIENDA } from "@/lib/marketing/proveedores-2026-10";
import { useEsCelular } from "./celular/useEsCelular";
import {
  FilaCelular,
  GrupoCelular,
  PantallaCelular,
  TituloCelular,
  VacioCelular,
} from "./celular/PiezasCelular";

interface Datos {
  filas: FilaNoRecuperable[];
  total: number;
}

function tiendaDe(f: FilaNoRecuperable): string {
  return f.tiendaNombre || f.tiendaCodigo || ROTULO_SIN_TIENDA;
}

function piePlural(n: number): string {
  return `${n} ${n === 1 ? "gasto" : "gastos"}`;
}

export default function NoRecuperable({
  refreshKey,
  hrefVolver,
}: {
  refreshKey: number;
  hrefVolver?: string;
}) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  const celular = useEsCelular();

  useEffect(() => {
    let cancelado = false;
    setError(false);
    fetch("/api/marketing/no-recuperable", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Datos) => !cancelado && setDatos(d))
      .catch(() => !cancelado && setError(true));
    return () => {
      cancelado = true;
    };
  }, [refreshKey]);

  const pie = datos
    ? `${piePlural(datos.filas.length)} · ${formatearMonto(datos.total)} · no suman a ninguna marca ni entran al ZIP`
    : "";

  if (celular) {
    return (
      <PantallaCelular>
        {hrefVolver && (
          <div className="px-2 pt-1">
            <a href={hrefVolver} className="inline-flex min-h-[44px] items-center px-2 text-[17px] text-blue-600 active:opacity-60">
              ‹ Marketing
            </a>
          </div>
        )}
        <TituloCelular titulo={ROTULO_NO_RECUPERABLE} />
        {error ? (
          <VacioCelular>No se pudo cargar la lista. Sin conexión con el servidor.</VacioCelular>
        ) : !datos ? (
          <div className="mx-4 mt-3 h-52 animate-pulse rounded-2xl bg-white" />
        ) : datos.filas.length === 0 ? (
          <VacioCelular>Sin gastos no recuperables.</VacioCelular>
        ) : (
          <>
            <GrupoCelular>
              {datos.filas.map((f) => (
                <FilaCelular
                  key={`${f.tipo}-${f.id}`}
                  data-fila="no-recuperable"
                  titulo={f.proveedor}
                  detalle={`${formatearFecha(f.fecha)} · ${tiendaDe(f)} · ${ROTULO_MOTIVO[f.motivo]}`}
                  monto={formatearMonto(f.total)}
                />
              ))}
            </GrupoCelular>
            <p className="px-4 pt-2 text-xs text-gray-500">{pie}</p>
          </>
        )}
      </PantallaCelular>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">
        No se pudo cargar la lista. Sin conexión con el servidor.
      </div>
    );
  }
  if (!datos) return <div className="h-64 rounded-lg bg-gray-100 animate-pulse" />;
  if (datos.filas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-600">
        Sin gastos no recuperables.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm" data-testid="tabla-no-recuperable">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Proveedor</th>
              <th className="px-4 py-2 font-medium">Concepto</th>
              <th className="px-4 py-2 font-medium">Tienda</th>
              <th className="px-4 py-2 font-medium">Motivo</th>
              <th className="px-4 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {datos.filas.map((f) => (
              <tr key={`${f.tipo}-${f.id}`} className="border-b border-gray-100 last:border-b-0">
                <td className="px-4 py-2.5 whitespace-nowrap text-gray-600 tabular-nums">{formatearFecha(f.fecha)}</td>
                <td className="px-4 py-2.5 text-gray-900">{f.proveedor}</td>
                <td className="px-4 py-2.5 text-gray-600">
                  {f.concepto}
                  {f.numero && <span className="text-gray-400"> · N.º {f.numero}</span>}
                </td>
                <td className="px-4 py-2.5 text-gray-600">{tiendaDe(f)}</td>
                <td className="px-4 py-2.5">
                  <span className="whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{ROTULO_MOTIVO[f.motivo]}</span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{formatearMonto(f.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">{pie}</p>
    </div>
  );
}

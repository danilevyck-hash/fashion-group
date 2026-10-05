"use client";

// Multifashion › Productos con la pantalla común (PRODUCTOS_FILTROS_2026_10):
// Marca ▾ · Departamento ▾ · Género ▾ · Descripción ▾ · 🔍 código. Sin
// existencia, días de inventario ni chips de atención: no hay inventario de
// Multifashion en la base. Sin «Mayores variaciones». El período es el del módulo.

import { useMemo } from "react";
import useSWR from "swr";
import { PantallaProductos } from "@/components/productos/FiltrosProductos";
import { CHIPS_MULTIFASHION, articulosMultifashion, type DepartamentosPorCodigo } from "@/lib/multifashion/productos-filtros";
import type { RenglonRanking } from "@/lib/multifashion/productos-ranking";
import type { Periodo } from "@/lib/multifashion/periodo";

interface Resp {
  desde: string;
  hasta: string;
  departamentos?: DepartamentosPorCodigo;
  ranking: { codigos: RenglonRanking[] };
}

export function ProductosFiltrosMf({ selectedYear, mes, periodo }: { selectedYear: number; mes: number; periodo: Periodo }) {
  // La MISMA dirección que la pestaña de siempre (misma caché).
  const api = periodo.tipo === "rango" ? "rango" : periodo.tipo === "ultimos" && periodo.n === 12 ? "12m" : "mes";
  const url = periodo.tipo === "rango"
    ? `/api/multifashion/productos?desde=${periodo.desde}&hasta=${periodo.hasta}`
    : `/api/multifashion/productos?year=${selectedYear}&mes=${mes}&periodo=${api}`;
  const { data, error, isLoading, mutate } = useSWR<Resp>(url, async (u: string) => {
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }, { dedupingInterval: 5 * 60_000, revalidateOnFocus: false, keepPreviousData: true });

  const articulos = useMemo(
    () => (data ? articulosMultifashion(data.ranking.codigos, data.departamentos ?? { n: [], c: {} }) : null),
    [data],
  );

  return (
    <PantallaProductos
      articulos={articulos}
      cargando={isLoading}
      error={error ? "error" : null}
      onReintentar={() => void mutate()}
      chips={CHIPS_MULTIFASHION}
      conInventario={false}
    />
  );
}

"use client";

// ============================================================================
// Los datos de una MARCA para los niveles 2 y 3 (12-ago-2026).
//
// UNA sola fuente: `GET /api/marketing/proyectos-lista?bloque=<slug>`, que ya
// corre el agregador único. El nivel 2 usa `secciones` (los períodos con su
// total); el nivel 3 usa UNA sección (montos por proyecto DE ese período) y
// la lista plana `proyectos` (los datos de cada fila, filtrados por la
// búsqueda en el servidor — la búsqueda NO cambia los totales).
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import type { SeccionPeriodo } from "@/lib/marketing/lista-por-periodo";
import type { BloqueResumen } from "./InicioMarketing";
import type { MkMarca } from "@/lib/marketing/types";

export interface ProyectoListItem {
  id: string;
  nombre: string | null;
  tienda: string;
  created_at: string;
  anulado_en: string | null;
  facturas_count: number;
  fotos_count: number;
  entregas_count?: number;
  marcas: Array<{
    id: string;
    nombre: string;
    codigo: string;
    tipo?: "externa" | "interna";
  }>;
  /** Gasto bruto histórico (Σ factura.total + entregas) — el modo plano. */
  gasto_real?: number;
  por_cobrar_total: number;
  por_cobrar_por_marca: Array<{
    marca_id: string;
    marca_nombre: string;
    monto: number;
  }>;
}

export interface RespuestaMarca {
  proyectos: ProyectoListItem[];
  particion: boolean;
  marca: { key: string; nombre: string; slug: string } | null;
  bloque_resumen: BloqueResumen | null;
  secciones: SeccionPeriodo[] | null;
}

export function useMarcaPeriodos(
  marcaSlug: string,
  busqueda: string,
  refreshKey: number,
) {
  const [datos, setDatos] = useState<RespuestaMarca | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const qs = new URLSearchParams();
      qs.set("bloque", marcaSlug);
      if (busqueda) qs.set("busqueda", busqueda);
      const res = await fetch(`/api/marketing/proyectos-lista?${qs.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as RespuestaMarca;
      setDatos({
        proyectos: Array.isArray(data.proyectos) ? data.proyectos : [],
        particion: data.particion === true,
        marca: data.marca ?? null,
        bloque_resumen: data.bloque_resumen ?? null,
        secciones: Array.isArray(data.secciones) ? data.secciones : null,
      });
    } catch {
      setDatos(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [marcaSlug, busqueda]);

  useEffect(() => {
    cargar();
    // refreshKey: un gasto nuevo / un cambio en el overlay recarga la lista.
  }, [cargar, refreshKey]);

  return { datos, loading, error, recargar: cargar };
}

/** El catálogo de marcas — para Registrar gasto y el overlay del proyecto. */
export function useMarcasCatalogo(): MkMarca[] {
  const [marcas, setMarcas] = useState<MkMarca[]>([]);
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/marketing/marcas");
        if (!res.ok) throw new Error();
        const data = (await res.json()) as MkMarca[];
        if (!cancelado) setMarcas(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelado) setMarcas([]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);
  return marcas;
}

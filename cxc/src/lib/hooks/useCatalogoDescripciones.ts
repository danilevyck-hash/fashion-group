"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { marcaKey, type CatalogoDescripciones } from "@/lib/depurador/logic";
import { normalizarEspacios } from "@/lib/depurador/veredicto";

// Catálogo de descripciones por marca del Depurador. La fuente de verdad es la
// tabla depurador_descripciones (SIN fallback al archivo TS: un solo dueño de
// la verdad). Mientras carga o si falla, los consumidores deben bloquear el
// procesamiento/descarga y ofrecer reintentar.
//
// Misma key de SWR en todos los consumidores (Depurador, Facturas Tienda,
// fórmulas, reglas) → un solo fetch compartido y caché entre pestañas.

export const CATALOGO_DESCRIPCIONES_KEY = "/api/productos/cargar/descripciones";

interface CatalogoResponse {
  catalogo: CatalogoDescripciones;
}

const fetcher = async (url: string): Promise<CatalogoResponse> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo cargar el catálogo de descripciones.");
  return res.json();
};

export function useCatalogoDescripciones() {
  const { data, error, mutate } = useSWR<CatalogoResponse>(CATALOGO_DESCRIPCIONES_KEY, fetcher);

  /** Agrega una descripción recién aprobada al catálogo EN MEMORIA (sin refetch)
   *  y devuelve el catálogo actualizado, para re-evaluar alarmas en vivo. */
  const agregarDescripcion = useCallback(
    (marca: string, descripcionRaw: string): CatalogoDescripciones => {
      // Misma normalización de espacios que guarda el servidor: el catálogo en
      // memoria y la tabla no pueden diferir ni en un espacio.
      const descripcion = normalizarEspacios(descripcionRaw);
      const base = data?.catalogo ?? {};
      if (!descripcion) return base;
      // La marca puede venir en otra caja → busca la key existente del catálogo.
      const marcaExistente = Object.keys(base).find((m) => marcaKey(m) === marcaKey(marca)) ?? marca;
      const lista = base[marcaExistente] ?? [];
      if (lista.some((d) => marcaKey(d) === marcaKey(descripcion))) return base;
      const actualizado: CatalogoDescripciones = {
        ...base,
        [marcaExistente]: [...lista, descripcion].sort((a, b) => a.localeCompare(b, "es")),
      };
      mutate({ catalogo: actualizado }, { revalidate: false });
      return actualizado;
    },
    [data, mutate]
  );

  const reintentar = useCallback(() => { void mutate(); }, [mutate]);

  return {
    /** null mientras carga o si falló — los consumidores bloquean con esto. */
    catalogo: data?.catalogo ?? null,
    cargando: !data && !error,
    fallo: !data && !!error,
    reintentar,
    agregarDescripcion,
  };
}

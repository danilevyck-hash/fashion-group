"use client";

// ─────────────────────────────────────────────────────────────────────────────
// El ENVÍO de las descripciones que pasan (17-sep-2026). Ver el porqué en
// `descripciones-que-pasan.ts`.
//
// ⚠️ DOS COSAS QUE NO PUEDEN CAMBIAR:
//
// 1. 🔴 ESCRIBIR NO FRENA NI RETRASA LA DESCARGA DEL EXCEL. Esto corre cuando
//    el archivo se PROCESA —el mismo momento en que se calcula el veredicto y
//    aparece (o no) la alarma—, no cuando se descarga. El camino de la
//    descarga no se tocó: no llama a este gancho, no lo espera y no sabe que
//    existe. Por eso la única puerta al endpoint es este archivo, y hay un
//    barrido que lo exige.
//
// 2. 🔴 NO SE MANDA DOS VECES LO MISMO. Tres candados encimados:
//    · el `ref` de acá, que recuerda lo ya mandado mientras la pantalla vive
//      (el catálogo se recarga y el efecto vuelve a correr: sin esto, cada
//      recálculo remandaría todo);
//    · el filtro de `descripcionesQuePasan`, que saca lo que ya está en el
//      catálogo en memoria;
//    · y el índice único de la base (`lower(marca), lower(descripcion)`), que
//      es el que manda de verdad.
//
// Falla en silencio a propósito: si el envío no sale, la descripción pasa
// igual y el Excel sale igual. Nadie ve un error por esto.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import type { CatalogoDescripciones } from "@/lib/depurador/logic";
import {
  claveRegistro,
  descripcionesQuePasan,
  type ParMarcaDesc,
} from "./descripciones-que-pasan";

/** La ÚNICA dirección por la que se registra una descripción que pasa. */
export const RUTA_REGISTRAR = "/api/productos/cargar/descripciones/registrar";

/**
 * Registra en el catálogo las descripciones del archivo que pasan solas.
 *
 * `pares` son los renglones ya procesados (marca + descripción) y `catalogo` el
 * de descripciones en memoria. Con cualquiera de los dos vacío no hace nada.
 */
export function useRegistrarQuePasan(
  pares: ParMarcaDesc[],
  catalogo: CatalogoDescripciones | null | undefined,
): void {
  // Lo ya mandado en esta pantalla. `ref` y no estado: no se dibuja nada con
  // esto, y cambiarlo no puede provocar un render.
  const mandadas = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!catalogo || pares.length === 0) return;
    const faltan = descripcionesQuePasan(pares, catalogo).filter(
      (d) => !mandadas.current.has(claveRegistro(d.marca, d.descripcion)),
    );
    if (faltan.length === 0) return;
    // Se marcan ANTES de mandar: si el envío falla, no se reintenta en bucle.
    // Lo que no se registró hoy se registra la próxima vez que el archivo pase.
    for (const d of faltan) mandadas.current.add(claveRegistro(d.marca, d.descripcion));
    fetch(RUTA_REGISTRAR, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descripciones: faltan }),
    }).catch(() => {
      // En silencio: la descripción pasó igual y el Excel sale igual.
    });
  }, [pares, catalogo]);
}

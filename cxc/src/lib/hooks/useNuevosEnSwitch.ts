"use client";

// Pregunta UNA vez, por archivo cargado, cuántos códigos son nuevos en Switch.
// Lo usan las DOS pantallas de Plantilla Switch (Reebok y Calvin/Tommy/KL).
//
// ⚠️ FALLA ABIERTA: mientras no haya respuesta —y para siempre si la hay
// mala— devuelve `null` y la pantalla no dibuja la línea. Nunca frena nada.
//
// 🔑 La consulta se dispara por una LLAVE de texto (empresa + los códigos), no
// por el arreglo: un arreglo nuevo en cada render volvería a preguntar en cada
// tecla que se toque en la pantalla.

import { useEffect, useState, useMemo } from "react";
import { normalizarCodigo, type ContraSwitch } from "@/lib/depurador/resumen-del-archivo";

export const RUTA_NUEVOS_EN_SWITCH = "/api/productos/cargar/nuevos-en-switch";

export function useNuevosEnSwitch(empresa: string, codigos: readonly (string | number | null | undefined)[]): ContraSwitch | null {
  const lista = useMemo(
    () => [...new Set(codigos.map(normalizarCodigo).filter(Boolean))].sort(),
    [codigos],
  );
  const llave = `${empresa}|${lista.join(",")}`;
  const [resultado, setResultado] = useState<ContraSwitch | null>(null);

  useEffect(() => {
    let vivo = true;
    setResultado(null);
    if (!empresa || lista.length === 0) return;
    (async () => {
      try {
        const res = await fetch(RUTA_NUEVOS_EN_SWITCH, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ empresa, codigos: lista }),
        });
        if (!res.ok) return;
        const json = await res.json();
        if (vivo && json?.ok) setResultado({ nuevos: Number(json.nuevos) || 0, yaEstan: Number(json.yaEstan) || 0 });
      } catch {
        // Falla abierta: sin línea en pantalla, sin ruido.
      }
    })();
    return () => { vivo = false; };
    // `lista` viaja dentro de `llave`: la llave es lo que decide preguntar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llave]);

  return resultado;
}

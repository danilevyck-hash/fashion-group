"use client";

// Los rubros que el catálogo Reebok sabe traducir, preguntados UNA vez al abrir
// la pantalla de Plantilla Switch.
//
// 🩸 Antes eran una lista del código (`REEBOK_CATEGORY_ESPERADAS`), espejo del
// mapa de lectura: agregar un rubro pedía tocar dos archivos y desplegar. Desde
// el 17-sep-2026 el mapa se administra en Catálogos › Reebok › Categorías del
// catálogo (`reebok_rubro_categoria`) y este gancho es el que lo trae.
//
// ⚠️ FALLA ABIERTA, y en las dos direcciones:
//   · mientras no hay respuesta, y para siempre si la respuesta es mala, se
//     devuelven los seis del código y el aviso se porta exactamente como ayer;
//   · el servidor, sin la migración, contesta 200 con esos mismos seis.
// El Excel se procesa igual pase lo que pase: esto solo decide de qué avisa la
// pantalla, nunca qué sale en el archivo.

import { useEffect, useState } from "react";
import { REEBOK_CATEGORY_ESPERADAS } from "@/lib/depurador/reebok";

export const RUTA_RUBROS_REEBOK = "/api/catalogo/reebok/rubros";

export function useRubrosDelCatalogoReebok(): readonly string[] {
  const [rubros, setRubros] = useState<readonly string[]>(REEBOK_CATEGORY_ESPERADAS);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(RUTA_RUBROS_REEBOK, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { rubros?: unknown };
        const lista = Array.isArray(json?.rubros)
          ? json.rubros.filter((r): r is string => typeof r === "string" && r.trim() !== "")
          : [];
        // Una lista vacía NO se acepta: sería apagar el mapa entero por una
        // respuesta rara. Sin nada útil, se queda la red del código.
        if (vivo && lista.length > 0) setRubros(lista);
      } catch {
        // Falla abierta: los seis de siempre, sin ruido en pantalla.
      }
    })();
    return () => { vivo = false; };
  }, []);

  return rubros;
}

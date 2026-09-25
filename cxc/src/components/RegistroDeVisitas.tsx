"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EL REGISTRO DE VISITAS — el componente que no dibuja nada.
//
// Vive en el layout raíz y hace UNA cosa: cuando la dirección pasa a ser de OTRO
// módulo, avisa. No pinta, no bloquea, no espera respuesta y no muestra
// errores. Si algo falla, no pasa nada.
//
// 🔴 NO CUENTA CADA CLIC: cuenta ENTRADAS A UN MÓDULO. Cambiar de pestaña
// adentro de Asistencia, filtrar la lista de Guías o marcar diez veces desde el
// teléfono son la misma visita — la dirección sigue resolviendo al mismo módulo
// y la memoria de la pestaña (10 min) frena el resto.
//
// Las reglas viven en `src/lib/visitas/registro.ts`; la plomería, en
// `src/lib/visitas/anotar.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { aparatoDeQuienMira } from "@/lib/aparato";
import { anotarVisita } from "@/lib/visitas/anotar";
import { REGISTRO_DE_VISITAS, moduloDeLaRuta } from "@/lib/visitas/registro";

export default function RegistroDeVisitas() {
  const pathname = usePathname();

  useEffect(() => {
    if (!REGISTRO_DE_VISITAS) return;
    const modulo = moduloDeLaRuta(pathname);
    if (!modulo) return;
    try {
      anotarVisita(modulo, aparatoDeQuienMira());
    } catch {
      /* jamás se le muestra a nadie: esto es una medición, no una pantalla */
    }
  }, [pathname]);

  return null;
}

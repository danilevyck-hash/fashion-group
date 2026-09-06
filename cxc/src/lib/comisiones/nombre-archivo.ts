// ─────────────────────────────────────────────────────────────────────────────
// EL NOMBRE DEL ARCHIVO DEL DETALLE — qué es, de quién, de cuándo. (módulo PURO)
//
// 🩸 EL PDF SE LLAMABA «Fashion Group.pdf» (6-sep-2026). El reporte se imprime
// con `window.print()`, y Chrome nombra el PDF con el `document.title` de la
// página — que en toda la app es «Fashion Group». O sea que los doce reportes
// que Daniel imprimía en un cierre de mes bajaban con el MISMO nombre, y el
// sistema operativo los desempataba con «(1)», «(2)»…
//
// Ahora dice `Comisión-Edwin-Vistana-2026-08`, con la forma de la casa: qué es,
// de quién, de cuándo. El mecanismo es cambiar `document.title` justo antes de
// imprimir y devolverlo a como estaba después — también si el usuario CANCELA
// el diálogo, que es el caso que se olvida.
//
// 🔴 UN SOLO NOMBRE PARA LOS DOS ARCHIVOS. El Excel del detalle usa esta misma
// función: dos generadores de nombre para el mismo reporte es cómo se llega a
// que el PDF y el Excel de la misma pantalla no se puedan poner uno al lado del
// otro. Y la empresa va con su nombre CORTO («Vistana», no «Vistana
// International») — diccionario § 0.
// ─────────────────────────────────────────────────────────────────────────────

import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { nombreVendedorEnPantalla } from "@/lib/comisiones/alias";
import { sufijoArchivoPeriodo } from "@/lib/comisiones/periodo";

/** Lo que puede ir en un nombre de archivo: letras (con acento), números y `-`. */
function trozo(texto: string): string {
  return texto
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * `Comisión-Edwin-Vistana-2026-08` — sin extensión: la pone quien descarga
 * (`.xlsx`) o el navegador al imprimir (`.pdf`).
 */
export function nombreArchivoComision(
  vendedor: string,
  empresaKey: string,
  year: number,
  mes: number,
): string {
  const quien = trozo(nombreVendedorEnPantalla(vendedor));
  const donde = trozo(nombreCortoEmpresa(empresaKey));
  return ["Comisión", quien, donde, sufijoArchivoPeriodo(year, mes)]
    .filter(Boolean)
    .join("-");
}

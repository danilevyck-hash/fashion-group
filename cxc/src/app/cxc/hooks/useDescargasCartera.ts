"use client";

import { useCallback } from "react";
import type { Company } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";
import { hoyPanama } from "@/lib/fecha-panama";
import {
  bloquesPorCompania,
  companiasDeLaVista,
  filasTotalPorCliente,
  nombreArchivoDescarga,
  ROTULO_DESCARGA,
  subtituloDelPapel,
  type ClaveDescarga,
} from "@/lib/cxc/descargas";

export type FormatoDescarga = "pdf" | "excel";

/**
 * 🔴 LAS DOS DESCARGAS, UNA SOLA VEZ — la computadora y el celular llaman a
 * ESTE hook (8-sep-2026).
 *
 * 🩸 Antes cada pantalla armaba su archivo: el menú del escritorio bajaba un CSV
 * y el «···» del celular bajaba OTRO, con otras columnas. Dos archivos para la
 * misma pregunta es cómo se arregla uno y queda mal el otro.
 *
 * ⚠️ **Lo que se descarga es lo que se está viendo**: entra `filtered`, la misma
 * lista que dibuja la tabla, con el filtro de empresa, el de tramo, la búsqueda
 * y el de «sin pagar» ya aplicados. Y las compañías que se listan salen del
 * FILTRO (`companiasDeLaVista`), no del rol.
 *
 * ⚠️ jsPDF y xlsx entran por `import()` a propósito: pesan, y la mayoría de las
 * veces que se abre Cuentas por Cobrar nadie descarga nada.
 */
export function useDescargasCartera(
  filtered: ConsolidatedClient[],
  cxcCompanies: Company[],
  companyFilter: string,
) {
  return useCallback(
    async (clave: ClaveDescarga, formato: FormatoDescarga) => {
      const companias = companiasDeLaVista(cxcCompanies, companyFilter);
      const empresa = companyFilter === "all" ? null : (companias[0]?.name ?? null);
      const hoy = hoyPanama();
      const titulo = subtituloDelPapel(clave, empresa);

      if (clave === "total-por-cliente") {
        const filas = filasTotalPorCliente(filtered);
        if (formato === "pdf") {
          const { pdfTotalPorCliente } = await import("@/lib/pdf-cxc");
          pdfTotalPorCliente(filas, {
            subtitulo: titulo,
            archivo: nombreArchivoDescarga(clave, "pdf", hoy),
            hoy,
          });
          return;
        }
        const [{ libroTotalPorCliente }, { downloadWorkbook }] = await Promise.all([
          import("@/lib/cxc/excel-cartera"),
          import("@/lib/excel-export"),
        ]);
        downloadWorkbook(
          libroTotalPorCliente(filas, titulo),
          nombreArchivoDescarga(clave, "xlsx", hoy),
        );
        return;
      }

      const bloques = bloquesPorCompania(filtered, companias);
      if (formato === "pdf") {
        const { pdfPorCompania } = await import("@/lib/pdf-cxc");
        pdfPorCompania(bloques, {
          subtitulo: titulo,
          archivo: nombreArchivoDescarga(clave, "pdf", hoy),
          hoy,
        });
        return;
      }
      const [{ libroPorCompania }, { downloadWorkbook }] = await Promise.all([
        import("@/lib/cxc/excel-cartera"),
        import("@/lib/excel-export"),
      ]);
      downloadWorkbook(
        libroPorCompania(bloques, titulo),
        nombreArchivoDescarga(clave, "xlsx", hoy),
      );
    },
    [filtered, cxcCompanies, companyFilter],
  );
}

/** Las dos líneas del menú, en su orden. El rótulo sale de `descargas.ts`. */
export const LINEAS_DESCARGA: { clave: ClaveDescarga; rotulo: string }[] = (
  ["total-por-cliente", "por-compania"] as ClaveDescarga[]
).map((clave) => ({ clave, rotulo: ROTULO_DESCARGA[clave] }));

// ─────────────────────────────────────────────────────────────────────────────
// EL RASTRO DE COMISIONES — quién bajó qué papel y quién tocó la configuración.
// (módulo PURO salvo `anotarDescargaComision`, que manda un POST y nunca frena)
//
// 🩸 POR QUÉ (22-sep-2026). Medido: `activity_logs` tenía 1.547 filas en 90
// días y **cero** eran de Comisiones — el módulo no anotaba descargas, cambios
// de tasa, clientes sin comisión ni descuentos. Si un vendedor reclama «me
// mandaron un PDF distinto», no había con qué contestar. Ventas sí anota cada
// descarga (`descarga_excel`, `lib/ventas/descarga.ts`); esto es lo mismo.
//
// Lo que se anota, y nada más:
//   · cada DESCARGA (PDF o Excel) con su alcance: el reporte de un vendedor en
//     una empresa, en todas sus empresas, la matriz del mes o la del año;
//   · cada CAMBIO DE CONFIGURACIÓN: tasa, cliente que no comisiona, descuento
//     y el interruptor mensual de un descuento (eso lo anota el SERVIDOR, en
//     `rastro-server.ts`, con el nombre de quien lo tocó).
//
// ⚠️ Anotar es SECUNDARIO: la descarga ya ocurrió y un fallo del registro se
// dice en la consola (`logActivityClient`), nunca frena ni rompe nada.
// ─────────────────────────────────────────────────────────────────────────────

import { logActivityClient } from "@/lib/logActivityClient";

/** `entity_type` en `activity_logs`. Uno solo para todo el módulo. */
export const MODULO_ACTIVIDAD_COMISIONES = "comisiones";

/** Las acciones de descarga. Mismos nombres que Ventas para el Excel. */
export const ACCION_DESCARGA_PDF = "descarga_pdf";
export const ACCION_DESCARGA_EXCEL = "descarga_excel";

/** Las acciones de configuración, anotadas por el servidor. */
/**
 * 🔴 «MANDAR» DEJA RASTRO IGUAL QUE UNA DESCARGA (25-sep-2026, la «9r»). Se
 * anota DESPUÉS de que el correo salió o el enlace quedó firmado, nunca antes.
 */
export const ACCION_MANDAR_CORREO = "mandar_correo";
export const ACCION_MANDAR_LINK = "mandar_link";

export const ACCION_CONFIG_TASA = "config_tasa";
export const ACCION_CONFIG_CLIENTE_SIN_COMISION = "config_cliente_sin_comision";
export const ACCION_CONFIG_DESCUENTO = "config_descuento";
export const ACCION_CONFIG_DESCUENTO_MES = "config_descuento_mes";

export type FormatoDescarga = "pdf" | "excel";

/** Qué se bajó: el reporte de UNA persona (una o todas sus empresas) o la matriz. */
export type AlcanceDescarga = "vendedor" | "vendedor-todas" | "matriz-grupo" | "matriz-empresa";

export interface DetalleDescarga {
  alcance: AlcanceDescarga;
  year: number;
  /** 0 = todo el año (`MES_TODO_EL_ANIO`). */
  mes: number;
  /** La clave en mayúsculas, la misma con la que se pidió el detalle. */
  vendedor?: string;
  /** `empresa_key`; con «todas» van separadas por coma. */
  empresa?: string;
}

/** Lo que va en `details`, listo para el POST. */
export function detalleDeDescarga(
  formato: FormatoDescarga,
  d: DetalleDescarga,
): Record<string, string | number> {
  const out: Record<string, string | number> = {
    formato,
    alcance: d.alcance,
    year: d.year,
    mes: d.mes,
  };
  if (d.vendedor) out.vendedor = d.vendedor;
  if (d.empresa) out.empresa = d.empresa;
  return out;
}

/** El alcance de un reporte por vendedor según cuántas empresas lleva. */
export function alcanceDeVendedor(cuantasEmpresas: number): AlcanceDescarga {
  return cuantasEmpresas > 1 ? "vendedor-todas" : "vendedor";
}

/**
 * Anota una descarga desde el navegador. Nunca frena la descarga.
 */
export function anotarDescargaComision(formato: FormatoDescarga, d: DetalleDescarga): void {
  logActivityClient({
    action: formato === "pdf" ? ACCION_DESCARGA_PDF : ACCION_DESCARGA_EXCEL,
    module: MODULO_ACTIVIDAD_COMISIONES,
    details: detalleDeDescarga(formato, d),
  });
}

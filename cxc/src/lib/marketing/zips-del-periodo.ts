// ============================================================================
// Marketing — LO QUE YA SE LE MANDÓ A LA MARCA. Módulo PURO (sin React, sin
// Supabase, sin fetch).
//
// 🩸 EL HUECO (pieza D, 22-sep-2026). Desde ese día CADA ZIP que se baja queda
// anotado en `mk_periodos.zips_bajados` (`zips-bajados.ts › anotarZipBajado`)
// y el archivo se guarda en `marketing/periodos/<id>/<fecha>.zip`… pero NINGUNA
// pantalla lo mostraba. La bitácora existía y no se leía.
//
// 🔴 SIN ZIPS ANOTADOS NO SE DIBUJA NADA. Medido contra producción el
// 22-sep-2026: los SEIS períodos tienen `zips_bajados = []`. Un bloque vacío
// con un título («Lo que ya se mandó — todavía nada») es ruido en una pantalla
// donde lo que importa son los montos.
//
// 🔴 EL MÁS NUEVO ARRIBA. Es lo último que se le mandó a la marca, y es lo que
// se busca cuando alguien pregunta «¿ya le mandaste el reporte?».
//
// 🔴 LOS LINKS DURAN 30 DÍAS (`TTL_LINK_ZIP_SEGUNDOS`, pieza D). Por eso cada
// renglón ofrece «Volver a firmar», que es `POST /api/marketing/zip/firmar-de-
// nuevo` — no se vuelve a armar el ZIP (tarda y baja todas las fotos), se
// vuelve a firmar el archivo que ya está guardado.
//
// Todo cuelga de `ZIP_E_IMPULSADORAS_NUEVO`; no hay un interruptor nuevo.
// ============================================================================

import { formatearMonto } from "./normalizar";
import type { RegistroZip } from "./periodo-estado";

/** Cuántos días dura un link recién firmado. Lo dice la pantalla, no lo decide. */
export const DIAS_DEL_LINK = 30;

const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * La lista de `mk_periodos.zips_bajados`, normalizada y con el MÁS NUEVO
 * ARRIBA. Lo que no sea una lista (la columna sin la migración, un `null`) se
 * lee como lista vacía: falla ABIERTA, nunca revienta la pantalla.
 *
 * Un registro sin `bajado_en` no se tira: se deja al final, porque es un ZIP
 * que sí salió de la casa aunque no sepamos cuándo.
 */
export function zipsDelPeriodo(valor: unknown): RegistroZip[] {
  if (!Array.isArray(valor)) return [];
  const filas = valor
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      bajado_en: String(r.bajado_en ?? "").trim(),
      bajado_por: String(r.bajado_por ?? "").trim(),
      gastos: numero(r.gastos),
      monto: numero(r.monto),
      archivo_path: String(r.archivo_path ?? "").trim(),
    }));
  return [...filas].sort((a, b) => {
    if (a.bajado_en === b.bajado_en) return 0;
    if (a.bajado_en === "") return 1;
    if (b.bajado_en === "") return -1;
    return a.bajado_en < b.bajado_en ? 1 : -1;
  });
}

/** 🔴 Sin un solo ZIP anotado, la sección NO se dibuja. */
export function hayZipsQueMostrar(lista: readonly RegistroZip[]): boolean {
  return lista.length > 0;
}

const FECHA_PANAMA = new Intl.DateTimeFormat("es-PA", {
  timeZone: "America/Panama",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * «22 sep 2026, 3:12 p. m.» — la hora de PANAMÁ, nunca la del navegador de
 * quien mira. Sin fecha guardada se dice que no se sabe, no se inventa «hoy».
 */
export function cuandoSeBajo(z: Pick<RegistroZip, "bajado_en">): string {
  const iso = String(z.bajado_en ?? "").trim();
  if (iso.length === 0) return "Sin fecha";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Sin fecha";
  return FECHA_PANAMA.format(d).replace(/\./g, "").replace(/\s+/g, " ").trim();
}

/** Quién lo bajó, si se anotó. `null` = no se sabe y no se dibuja nada. */
export function quienLoBajo(z: Pick<RegistroZip, "bajado_por">): string | null {
  const quien = String(z.bajado_por ?? "").trim();
  if (quien.length === 0 || quien === "sistema") return null;
  return quien;
}

/** «40 gastos · $94,104.43». En cero se dice igual: el ZIP salió así. */
export function loQueLlevaba(z: Pick<RegistroZip, "gastos" | "monto">): string {
  const n = Math.max(0, Math.trunc(numero(z.gastos)));
  return `${n} ${n === 1 ? "gasto" : "gastos"} · ${formatearMonto(numero(z.monto))}`;
}

/** ¿Hay archivo guardado que se pueda volver a firmar? */
export function sePuedeVolverAFirmar(z: Pick<RegistroZip, "archivo_path">): boolean {
  return String(z.archivo_path ?? "").trim().length > 0;
}

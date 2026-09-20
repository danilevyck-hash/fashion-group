// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — EL AVISO SEMANAL DE LO QUE LLEVA MUCHO SIN COBRARSE (20-sep-2026).
//
// 🩸 POR QUÉ EXISTE. Hasta hoy NO HABÍA NADA: ni cron, ni Telegram, ni
// recordatorio. Un reclamo que Andrea carga y nadie vuelve a mirar se queda
// quieto para siempre, y la única forma de enterarse era abrir el módulo.
// Medido contra producción el 20-sep-2026: **15 reclamos pasados de 90 días por
// $6.220,41**, y uno de **594 días por $929,83**.
//
// 🔴 EL CORTE NO SE ESCRIBE ACÁ: sale de `DIAS_RECLAMO_VIEJO` (120), la MISMA
// constante que usa la portada. Un aviso que dijera «viejo» con otro número que
// la pantalla es un aviso que nadie puede verificar.
//
// 🔴 UNA LÍNEA POR SEMANA, NO UNA POR DÍA. Va al chat de 📊 NEGOCIO —es plata
// que se le debe a la empresa, no una avería del sistema—, así que NO lleva el
// prefijo de sistema ni ninguna regla anti-ruido: la que hay es el horario, los
// lunes a las 9 de la mañana de Panamá.
//
// 🔴 SIN NADA VIEJO NO SE MANDA NADA. Nunca un «todo al día ✅»: el mismo
// criterio del resumen de fotos y del aviso de guías (Daniel: *«solo dime si me
// faltan fotos, no si no me faltan fotos»*).
//
// Módulo PURO: recibe los reclamos y el «hoy» de Panamá, devuelve el texto o
// `null`. El I/O vive en `app/api/cron/reclamos-viejos/route.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { empresaKeyDeReclamo } from "./empresas";
import { DIAS_RECLAMO_VIEJO, resumenViejos, type ReclamoViejo } from "./viejos";
import type { ReclamoDePortada } from "./portada";

/** Cuántos se nombran en el mensaje. Los demás viven en la pantalla. */
export const CUANTOS_SE_NOMBRAN = 3;

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** El nombre corto de la empresa de un reclamo; si no cruza, el que trae. */
function empresaEnPantalla(empresa: string): string {
  const key = empresaKeyDeReclamo(empresa);
  return key ? nombreCortoEmpresa(key) : empresa;
}

function linea(r: ReclamoViejo): string {
  return `• ${r.nroReclamo} · ${empresaEnPantalla(r.empresa)} · ${r.dias} días · $${money(r.monto)}`;
}

/**
 * El mensaje, o `null` si no hay ni un reclamo pasado del corte.
 *
 * Dice lo mismo que diría Daniel: cuántos son, cuánto suman y cuáles son los
 * tres más viejos. Sin nombres de tabla, sin jerga y sin pedirle que entre a
 * ninguna parte a calcular nada.
 */
export function mensajeReclamosViejos(
  reclamos: readonly (ReclamoDePortada & { nro_reclamo?: string | null })[],
  hoy: string,
): string | null {
  const { n, monto, masViejos } = resumenViejos(reclamos, hoy);
  if (n === 0) return null;

  const titulo =
    n === 1
      ? `📋 1 reclamo lleva más de ${DIAS_RECLAMO_VIEJO} días sin cobrarse — $${money(monto)}`
      : `📋 ${n} reclamos llevan más de ${DIAS_RECLAMO_VIEJO} días sin cobrarse — $${money(monto)} en total`;

  const lineas = masViejos.slice(0, CUANTOS_SE_NOMBRAN).map(linea);
  const resto = n - lineas.length;
  const cola = resto > 0 ? `\n…y ${resto} más.` : "";

  return (
    `${titulo}\n\nLos más viejos:\n${lineas.join("\n")}${cola}\n\n` +
    `Están en Reclamos, en «Por cobrar» de cada empresa.`
  );
}

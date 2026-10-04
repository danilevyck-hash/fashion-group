// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS · LA LISTA, EL DETALLE Y ETIQUETAS › ENVÍOS ESTILO APPLE (4-oct-2026,
// propuesta «hoy vs recomendación», APAGADA hasta el «sí» de Daniel).
//
// Daniel aprobó el 4-oct-2026 rediseñar todo el sistema «como lo haría Apple si
// hiciera un ERP profesional». Las cuatro cosas que cambian:
//
//   1. Lo importante primero: arriba, «3 guías hoy · 1 pendiente de despacho»,
//      y las pendientes (de CUALQUIER fecha) como la primera sección. Se va el
//      aviso ámbar que repetía lo mismo que esas filas.
//   2. El mismo selector de período que Ventas y Comisiones (`ComisionesPeriodo`):
//      abre en el mes en curso y ofrece «Todo el año». Reemplaza «último mes +
//      Ver guías más viejas». Buscar sigue buscando en TODAS (19-sep-2026).
//   3. Un toque abre el detalle (`/guias/[id]`): se va el acordeón, que era un
//      segundo detalle, y el botón «Despachar», que llevaba a la misma página.
//      El detalle toma el marco compacto del 2-oct (`GUIA_DETALLE_APPLE_2026_10`)
//      y dice «Pendiente» al lado del título.
//   4. Etiquetas › envíos: arriba «4 envíos hoy · 1 pendiente de guía»; en el
//      celular, tarjetas de dos líneas en vez de la tabla de 720 px que se
//      arrastraba de lado.
//
// 🔴 SOLO PANTALLA: no cambia ninguna lectura, ningún guardado ni ningún papel.
// La frescura de Switch no aplica: las guías y los envíos son datos propios.
// `false` = las pantallas como el 4-oct-2026. Candado `guias-lista-apple-2026-10`.
// ─────────────────────────────────────────────────────────────────────────────

import { esTodoElAnio } from "@/lib/comisiones/periodo";

/** 🔴 El interruptor. `false` = la lista, el detalle y Etiquetas de hoy. */
export const GUIAS_LISTA_APPLE_2026_10 = false;

export interface PeriodoGuias {
  year: number;
  /** 1–12, o `MES_TODO_EL_ANIO` (0). */
  mes: number;
}

/** ¿La guía cae en el período? Compara el día `YYYY-MM-DD` de la guía, sin horas. */
export function enElPeriodo(fecha: string | null | undefined, p: PeriodoGuias): boolean {
  const f = String(fecha ?? "").slice(0, 10);
  const prefijo = esTodoElAnio(p.mes) ? `${p.year}-` : `${p.year}-${String(p.mes).padStart(2, "0")}-`;
  return f.startsWith(prefijo);
}

/** Los años con guías, nunca después del año en curso; el año en curso siempre está. */
export function aniosConGuias(fechas: readonly (string | null | undefined)[], anioEnCurso: number): number[] {
  const anios = new Set<number>([anioEnCurso]);
  for (const f of fechas) {
    const y = Number(String(f ?? "").slice(0, 4));
    if (Number.isInteger(y) && y > 2000 && y <= anioEnCurso) anios.add(y);
  }
  return [...anios].sort((a, b) => a - b);
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «3 guías hoy» · y, si hay, «1 pendiente de despacho» (en ámbar en pantalla). */
export function resumenDeGuias(
  guias: readonly { fecha?: string | null }[],
  pendientes: number,
  hoyYmd: string,
): { hoy: string; pendientes: string | null } {
  const deHoy = guias.filter((g) => String(g.fecha ?? "").slice(0, 10) === hoyYmd).length;
  return {
    hoy: `${plural(deHoy, "guía", "guías")} hoy`,
    pendientes: pendientes > 0 ? `${pendientes} ${pendientes === 1 ? "pendiente" : "pendientes"} de despacho` : null,
  };
}

/** «4 envíos hoy» · y, si hay, «1 pendiente de guía». `diaDe` pasa `creado_en` al día de Panamá. */
export function resumenDeEnvios(
  envios: readonly { creado_en: string; guia_numero: number | null }[],
  hoyYmd: string,
  diaDe: (iso: string) => string,
): { hoy: string; pendientes: string | null } {
  const deHoy = envios.filter((e) => diaDe(e.creado_en) === hoyYmd).length;
  const sinGuia = envios.filter((e) => e.guia_numero === null).length;
  return {
    hoy: `${plural(deHoy, "envío", "envíos")} hoy`,
    pendientes: sinGuia > 0 ? `${sinGuia} ${sinGuia === 1 ? "pendiente" : "pendientes"} de guía` : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LA LÍNEA DEL BONO (23-sep-2026) — reemplaza la columna «Bono» de Vendedoras.
//
// 🩸 La columna decía «al cierre» en las cuatro filas durante 29 días de cada
// 30: solo tiene dato el mes cerrado. Ahora es UNA línea debajo de la tabla:
//
//   · mes en curso → «Bono: se define al cerrar el mes (retail contra retail).
//                     En agosto: Jennifer Miranda $100 · Sheynee Batista $50.»
//   · mes cerrado  → «Bono de agosto 2026 (retail contra retail): Jennifer
//                     Miranda $100 · Sheynee Batista $50.»
//
// ⚠️ Ni el monto ni la regla del bono viven aquí: los decide la RPC
// (`multifashion_bonos_v5`, retail contra retail; cae a la v4). Esto solo elige
// las palabras. Módulo PURO.
// ─────────────────────────────────────────────────────────────────────────────

import type { BonosMultifashion } from "@/components/ventas/types";
import { nombreEnPantalla } from "./nombres";

const MES_LARGO = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export const BONO_SE_DEFINE = "Bono: se define al cerrar el mes (retail contra retail).";

/** «Jennifer Miranda $100 · Sheynee Batista $50» — quién cobró qué en un mes cerrado. */
export function quienesCobraron(resp: BonosMultifashion): string {
  const partes: string[] = [];
  const g = resp.gerente;
  if (g?.nombre) {
    partes.push(g.bono > 0 ? `${nombreEnPantalla(g.nombre)} $${g.bono}` : `${nombreEnPantalla(g.nombre)} sin bono`);
  }
  const ganadora = (resp.vendedoras ?? []).find((v) => v.bono_vendedora);
  if (ganadora) partes.push(`${nombreEnPantalla(ganadora.nombre)} $50`);
  return partes.length ? partes.join(" · ") : "nadie alcanzó el bono";
}

/**
 * La línea, según lo que se mira. `visto` = la respuesta del mes que se mira;
 * `ultimo` = la del último mes elegible (solo hace falta cuando el visto no
 * cerró). `null` = no hay nada que decir (rango de meses, sin datos).
 */
export function lineaBono(
  visto: BonosMultifashion | null | undefined,
  ultimo: BonosMultifashion | null | undefined,
): string | null {
  if (!visto || visto.sin_data) return null;
  if (visto.es_elegible) {
    const { mes, year } = visto.mes_evaluado;
    return `Bono de ${MES_LARGO[mes - 1]} ${year} (retail contra retail): ${quienesCobraron(visto)}.`;
  }
  if (ultimo && !ultimo.sin_data && ultimo.es_elegible) {
    return `${BONO_SE_DEFINE} En ${MES_LARGO[ultimo.mes_evaluado.mes - 1]}: ${quienesCobraron(ultimo)}.`;
  }
  return BONO_SE_DEFINE;
}

// ─────────────────────────────────────────────────────────────────────────────
// CON QUÉ MES ABRE COMISIONES — el ÚLTIMO MES CERRADO, y en hora de PANAMÁ.
//
// 🩸 POR QUÉ (6-sep-2026). La pantalla abría en el mes EN CURSO
// (`new Date().getMonth() + 1`). Medido el 5-sep-2026, con 5 días de
// septiembre: la comisión bruta de las 6 empresas era **$101,77** y el
// descuento fijo de **$1.573,08** se restaba entero, así que lo primero que
// veía Daniel al entrar era **«Total a pagar −$1.471,31»** — la pantalla
// diciéndole que le debe plata a su vendedor, todos los primeros días de cada
// mes. Daniel eligió «a»: abrir en el último mes completo, con el mes en curso
// a un toque.
//
// 🩸 Y el mes lo decidía el RELOJ DEL NAVEGADOR. Panamá es **UTC−5 fijo** y es
// invariante de la casa (`hoyPanama`): en un componente `"use client"` que
// también renderiza en el servidor (UTC), el primer y el último día del mes
// pueden pintar un mes distinto del que el navegador elige después. Acá se
// recibe la fecha de Panamá ya calculada y no se llama a `new Date()`.
//
// Es SOLO el mes con el que abre: no cambia ni un cálculo, ni qué meses se
// pueden elegir. Enero abre en diciembre del año anterior.
// ─────────────────────────────────────────────────────────────────────────────

// 🔴 4-oct-2026 — VUELVE A ABRIR EN EL MES EN CURSO. Daniel: «quiero que en
// Comisiones y también en Multifashion se vea el mes en curso». Revisado ese
// día: Comisiones (celular y computadora, y Multifashion dentro de Comisiones,
// que sigue al mismo selector) abría en septiembre, el último mes cerrado; el
// módulo Multifashion ya abría en el mes en curso y no se tocó. El mes sigue
// siendo el de PANAMÁ y el mes cerrado queda a un toque. `false` = el último
// mes cerrado, como desde el 6-sep-2026.
export const ABRE_EN_EL_MES_EN_CURSO_2026_10 = true;

export interface Periodo {
  year: number;
  mes: number;
}

/** «2026-09-06» → { year: 2026, mes: 9 }. El mes en curso, en Panamá. */
export function mesEnCurso(hoyYmd: string): Periodo {
  return { year: Number(hoyYmd.slice(0, 4)), mes: Number(hoyYmd.slice(5, 7)) };
}

/**
 * El último mes CERRADO: el anterior al que corre hoy en Panamá.
 * «2026-09-06» → agosto 2026. «2026-01-02» → diciembre 2025.
 */
export function ultimoMesCerrado(hoyYmd: string): Periodo {
  const { year, mes } = mesEnCurso(hoyYmd);
  return mes === 1 ? { year: year - 1, mes: 12 } : { year, mes: mes - 1 };
}

/**
 * Con qué período abre la pantalla, respetando los años que el servidor ofrece.
 *
 * Si el último mes cerrado cae en un año que no está en la lista (la app recién
 * estrenada en enero, sin datos del año anterior), se queda en el mes en curso:
 * más vale abrir en un mes que existe que en uno que la pantalla no puede pedir.
 */
export function periodoInicial(hoyYmd: string, availableYears: readonly number[]): Periodo {
  if (ABRE_EN_EL_MES_EN_CURSO_2026_10) return mesEnCurso(hoyYmd);
  const cerrado = ultimoMesCerrado(hoyYmd);
  if (availableYears.length === 0 || availableYears.includes(cerrado.year)) return cerrado;
  return mesEnCurso(hoyYmd);
}

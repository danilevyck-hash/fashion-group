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
  const cerrado = ultimoMesCerrado(hoyYmd);
  if (availableYears.length === 0 || availableYears.includes(cerrado.year)) return cerrado;
  return mesEnCurso(hoyYmd);
}

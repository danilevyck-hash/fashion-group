// ─────────────────────────────────────────────────────────────────────────────
// EL ESTADO DE CUENTA: LO CHICO SE AGRUPA, POR MONTO Y SOLO POR MONTO. Puro.
//
// 🩸 EL PROBLEMA MEDIDO (5-sep-2026). City Mall Paso Canoa abre con 110
// documentos; **36 de ellos valen menos de $50 y suman $227,20** — o sea un
// tercio de la lista para el 0,05 % del saldo. Buscar la factura que importa
// es bajar por 36 renglones de centavos.
//
// 🔴 SE AGRUPA POR MONTO, NUNCA POR TIPO DE DOCUMENTO. Es la tentación
// obvia —«las notas de débito son las chicas»— y es FALSA: hay notas de débito
// grandes y de verdad ($5.000 de Internacional Belén en 2024, $3.349,10 de
// City Mall David). Esconder una nota de débito de $5.000 porque «las ND son
// chicas» es esconder plata que hay que cobrar.
//
// ⚠️ Contexto que NO se dice en pantalla: esas notas chicas son, casi todas,
// de las retenciones — los 7 clientes que las tienen son los 7 que pagan
// reteniendo. Pero **Switch no manda el motivo**, así que afirmarlo en la
// pantalla sería inventar. Se agrupa por lo que se puede medir: el monto.
//
// El corte mira el VALOR ABSOLUTO: un crédito de -$12 también es chico.
// ─────────────────────────────────────────────────────────────────────────────

/** Debajo de esto (en valor absoluto) el documento se pliega. Dólares. */
export const UMBRAL_DOC_CHICO = 50;

/** Lo mínimo que este módulo mira de un documento: su saldo con signo. */
export interface DocConSaldo {
  saldo: number;
}

export interface DocumentosPartidos<T extends DocConSaldo> {
  /** Los que se ven siempre. */
  grandes: T[];
  /** Los que se pliegan en una línea. */
  chicos: T[];
  /** Suma con signo de los plegados — la que se muestra en la línea. */
  totalChicos: number;
}

/** ¿Este documento es de los que se pliegan? Por MONTO, jamás por tipo. */
export function esDocChico(saldo: number): boolean {
  return Math.abs(saldo) < UMBRAL_DOC_CHICO;
}

export function partirDocumentos<T extends DocConSaldo>(docs: T[]): DocumentosPartidos<T> {
  const grandes: T[] = [];
  const chicos: T[] = [];
  let totalChicos = 0;
  for (const d of docs) {
    if (esDocChico(d.saldo)) { chicos.push(d); totalChicos += d.saldo; }
    else grandes.push(d);
  }
  return { grandes, chicos, totalChicos: Math.round(totalChicos * 100) / 100 };
}

/** «36 documentos de menos de $50 · $227.20 — ver» */
export function textoDocsChicos(cuantos: number, total: string): string {
  return `${cuantos} ${cuantos === 1 ? "documento" : "documentos"} de menos de $${UMBRAL_DOC_CHICO} · ${total}`;
}

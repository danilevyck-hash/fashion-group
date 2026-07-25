// ─────────────────────────────────────────────────────────────────────────────
// Formato de PIEZAS en lenguaje de bodega — una sola función para las 3 marcas
// (Reebok, Joybees, Tommy Hilfiger).
//
// El cliente pide en BULTOS y Switch trabaja en PIEZAS. Cuando hay menos piezas
// de las pedidas hay que decir la cantidad REAL como la diría un bodeguero:
// "1 bulto · 8 pzas" (un bulto completo + 8 sueltas), no "20 piezas".
// Objetivo explícito de Daniel: que nadie crea que recibe 12 si hay 8.
//
// Puro (sin I/O) — testeable con vitest.
// ─────────────────────────────────────────────────────────────────────────────

/** "1 bulto · 8 pzas" · "2 bultos" · "8 pzas" · "0 pzas". */
export function formatBultosPiezas(piezas: number, bultoSize: number): string {
  const total = Math.max(0, Math.floor(Number(piezas) || 0));
  const size = Math.max(1, Math.floor(Number(bultoSize) || 1));
  const bultos = Math.floor(total / size);
  const sueltas = total - bultos * size;

  const partes: string[] = [];
  if (bultos > 0) partes.push(`${bultos} bulto${bultos === 1 ? "" : "s"}`);
  if (sueltas > 0 || bultos === 0) partes.push(`${sueltas} pza${sueltas === 1 ? "" : "s"}`);
  return partes.join(" · ");
}

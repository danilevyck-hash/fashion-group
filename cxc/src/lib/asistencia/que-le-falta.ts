// ─────────────────────────────────────────────────────────────────────────────
// QUÉ LE FALTA A UN COLABORADOR — la regla de los dos chips de la lista
// (10-sep-2026)
//
// Daniel, textual: *«veo falta configurar 4 y sin saldo bastantes, todos deben
// de estar en sin configurar no?»* → sí. Y al definirlo mejor: no es UN chip,
// son DOS, separados por si el dato que falta hace que la QUINCENA SALGA MAL.
//
//   · «Falta para pagar»  — sin ficha (un código del reloj sin nombre), sin
//     empresa, sin salario (salvo servicio profesional) o sin horario (salvo
//     quien cobra fijo y no pasa por el reloj). Con cualquiera de estos la
//     planilla sale mal o no sale.
//   · «Falta completar»   — sin cargo, sin cédula, sin saldo de vacaciones (el
//     saldo Y su fecha de corte) o sin fecha de ingreso. La quincena sale
//     igual; lo que sale mal es el comprobante, el saldo o la antigüedad.
//
// 🔴 Los dos cuentan solo ACTIVOS (eso lo filtra quien llama: la lista ya
// separa a los que se fueron) y un colaborador puede estar en los dos.
// 🔴 Un código SIN FICHA cuenta solo en «para pagar», y ahí dice «ficha»: sin
// ficha no hay cargo ni cédula que revisar todavía, y listarle los cuatro
// faltantes sería decir cuatro veces lo mismo.
// 🔴 Nada de lo que se guarda cambia: esto solo LEE la ficha.
// ─────────────────────────────────────────────────────────────────────────────

export type FaltaParaPagar = "ficha" | "empresa" | "salario" | "horario";
export type FaltaCompletar = "cargo" | "cedula" | "saldo" | "ingreso";

export interface Faltantes {
  paraPagar: FaltaParaPagar[];
  completar: FaltaCompletar[];
}

/** Lo que la regla mira de una ficha. Es un subconjunto del payload de la lista. */
export interface FichaParaFaltantes {
  /** `false` = el código marca en el reloj y nadie dijo quién es. */
  configurado: boolean;
  empresa?: string | null;
  servicioProfesional?: boolean;
  /** Cobra fijo y no pasa por el reloj: no necesita horario. */
  noMarcaReloj?: boolean;
  salarioMensual: number | null;
  /** `null`/`undefined` = no se pudo saber (la lectura falló): no se acusa. */
  tieneHorario?: boolean | null;
  posicion?: string | null;
  cedula?: string | null;
  fechaIngreso: string | null;
  saldoVacacionesDias: number | null;
  saldoVacacionesCorte: string | null;
}

const vacio = (v: string | null | undefined) => !v || !String(v).trim();

export function queLeFalta(p: FichaParaFaltantes): Faltantes {
  if (!p.configurado) return { paraPagar: ["ficha"], completar: [] };

  const paraPagar: FaltaParaPagar[] = [];
  if (vacio(p.empresa)) paraPagar.push("empresa");
  if (
    p.servicioProfesional !== true
    && (p.salarioMensual === null || !Number.isFinite(p.salarioMensual))
  ) {
    paraPagar.push("salario");
  }
  if (p.noMarcaReloj !== true && p.tieneHorario === false) paraPagar.push("horario");

  const completar: FaltaCompletar[] = [];
  if (vacio(p.posicion)) completar.push("cargo");
  if (vacio(p.cedula)) completar.push("cedula");
  // 🔴 Los DOS datos: un saldo sin fecha de corte es un saldo a un día que
  // nadie sabe (mismo CHECK de la tabla).
  if (
    p.saldoVacacionesDias === null
    || !Number.isFinite(p.saldoVacacionesDias)
    || vacio(p.saldoVacacionesCorte)
  ) {
    completar.push("saldo");
  }
  if (vacio(p.fechaIngreso)) completar.push("ingreso");

  return { paraPagar, completar };
}

/** Cómo se nombra cada faltante en la fila. Corto, sin artículo: «Falta cargo y cédula». */
export const ROTULO_FALTANTE: Readonly<Record<FaltaParaPagar | FaltaCompletar, string>> = Object.freeze({
  ficha: "ficha",
  empresa: "empresa",
  salario: "salario",
  horario: "horario",
  cargo: "cargo",
  cedula: "cédula",
  saldo: "saldo de vacaciones",
  ingreso: "fecha de ingreso",
});

/** «a, b y c». */
function enumerar(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

/**
 * Lo que dice la fila: «Falta salario, cargo y cédula». Lo de PAGAR va primero.
 * `null` cuando no falta nada — la fila no dibuja ninguna etiqueta.
 */
export function textoFaltantes(f: Faltantes): string | null {
  const todos = [...f.paraPagar, ...f.completar].map((k) => ROTULO_FALTANTE[k]);
  if (todos.length === 0) return null;
  return `Falta ${enumerar(todos)}`;
}

export const CHIP_PARA_PAGAR = "Falta para pagar";
export const CHIP_COMPLETAR = "Falta completar";

/** Cuántos entran a cada chip. Uno puede estar en los dos. */
export function contarFaltantes(lista: readonly FichaParaFaltantes[]): { paraPagar: number; completar: number } {
  let paraPagar = 0;
  let completar = 0;
  for (const p of lista) {
    const f = queLeFalta(p);
    if (f.paraPagar.length > 0) paraPagar += 1;
    if (f.completar.length > 0) completar += 1;
  }
  return { paraPagar, completar };
}

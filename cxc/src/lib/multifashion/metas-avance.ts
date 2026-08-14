// ─────────────────────────────────────────────────────────────────────────────
// ¿EL RITMO ALCANZA? — la cuenta del avance de una meta. Módulo PURO: no toca
// base, ni red, ni `new Date()`; el "hoy" entra siempre como parámetro para
// poder testear con fechas FIJAS. Panamá es UTC−5 fijo y el día se decide
// AFUERA (`hoyPanama`), así que acá no hay ninguna zona horaria que adivinar.
//
// ── 🔴 POR QUÉ NO SE PROYECTA "POR DÍAS TRANSCURRIDOS" ───────────────────────
// Es la pregunta que Daniel pidió explícitamente contestar: *"que vean cómo
// van"*. Y la respuesta ingenua —regla de tres sobre los días— MIENTE, con un
// error medido contra producción, no supuesto.
//
// La meta real va de septiembre a diciembre. Así se repartió ESE MISMO período
// el año pasado (sep-dic 2025, retail, medido el 13-ago-2026):
//
//     sep 2025   $36.430,41   10,7%   ▓▓▓▓▓
//     oct 2025   $46.429,63   13,6%   ▓▓▓▓▓▓▓
//     nov 2025   $57.580,78   16,9%   ▓▓▓▓▓▓▓▓
//     dic 2025  $200.257,73   58,8%   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
//     TOTAL     $340.698,55
//
// **Diciembre solo pesa el 58,8% de la temporada.** Al 31 de octubre habrán
// pasado 61 de 122 días — la mitad del calendario— pero apenas el 24,3% de la
// venta esperada. Con regla de tres sobre los días, una tienda que va PERFECTA
// para llegar a $420.000 se vería como si fuera a cerrar en ~$204.000: la
// pantalla anunciaría un fracaso rotundo en el mes en que todavía no pasó nada.
// Y el error simétrico es peor: en enero (si la meta arrancara en diciembre) la
// misma cuenta prometería un éxito que no va a ocurrir.
//
// Así que el reloj de esta pantalla NO son los días: es **cuánta temporada pasó**.
//
//     proyección = vendido ÷ (temporada transcurrida ÷ temporada total)
//
// donde el peso de cada día sale de lo que ESE MISMO mes vendió el año pasado.
// Es la misma idea que ya usa `multifashion_proyeccion_cierre_v1` para el año
// (CLAUDE.md § Multifashion) — acá aplicada a un rango libre.
//
// ⚠️ SI NO HAY AÑO PASADO, SE CAE A LOS DÍAS Y LA PANTALLA LO DICE. Una tienda
// nueva, o un período sin comparable, no puede tener pesos de temporada. En ese
// caso `base` sale `"dias"` y el texto de la pantalla cambia — proyectar con una
// regla peor SIN avisarlo sería el problema, no la regla peor.
//
// 🔴 NO SE PROYECTA AL PRINCIPIO, Y ES A PROPÓSITO. Con el 2% de la temporada
// transcurrida, dividir por 0,02 multiplica por 50 cualquier ruido: un solo día
// bueno "proyecta" el triple de la meta y un lunes flojo anuncia la catástrofe.
// Por debajo de `FRACCION_MINIMA_PARA_PROYECTAR` la pantalla dice *"todavía es
// muy pronto para saber si el ritmo alcanza"*, que es la verdad. Un número
// inventado con cara de dato es peor que no tener número.
// ─────────────────────────────────────────────────────────────────────────────

/** Debajo de esto no se proyecta: el divisor es tan chico que amplifica ruido. */
export const FRACCION_MINIMA_PARA_PROYECTAR = 0.05;

/** Cuánto de la temporada tiene que faltar para que un día pese. Ver `pesosPorDia`. */
export interface PesoMes {
  /** `YYYY-MM` del mes DE REFERENCIA (el año pasado). */
  mes: string;
  /** Lo que vendió ese mes. Puede ser 0; nunca negativo para pesar. */
  ventas: number;
}

export type BaseProyeccion = "temporada" | "dias";

export interface EntradaAvance {
  /** `YYYY-MM-DD` inclusive. */
  desde: string;
  /** `YYYY-MM-DD` inclusive. */
  hasta: string;
  /** El día de Panamá que se considera "hoy". */
  hoy: string;
  objetivo: number;
  /** Lo vendido dentro del período, ya sumado con la semántica del módulo. */
  vendido: number;
  /** Reparto del MISMO período un año antes. Vacío → se cae a los días. */
  pesos?: readonly PesoMes[];
}

export interface Avance {
  vendido: number;
  objetivo: number;
  /** Lo que falta para llegar. Nunca negativo. */
  falta: number;
  /** 0..n — puede pasar de 1 si se superó la meta. */
  pctVendido: number;
  diasTotales: number;
  diasTranscurridos: number;
  diasQueFaltan: number;
  /** Qué proporción de la TEMPORADA ya pasó (0..1). El divisor de la proyección. */
  fraccionTranscurrida: number;
  base: BaseProyeccion;
  /** `null` cuando todavía no se puede afirmar (ver `motivoSinProyeccion`). */
  proyeccion: number | null;
  motivoSinProyeccion: "no-empezo" | "muy-temprano" | null;
  /** `null` mientras no haya proyección. */
  alcanza: boolean | null;
  /** Cuánto le sobra (+) o le falta (−) a la proyección contra el objetivo. */
  brechaProyectada: number | null;
  estado: "por-empezar" | "en-curso" | "cerrada";
  /** La meta ya se alcanzó (aunque el período siga abierto). */
  cumplida: boolean;
}

// ── Aritmética de fechas: TODO en UTC sobre `YYYY-MM-DD` ─────────────────────
// Nunca `new Date(string)` con hora local: en Panamá (UTC−5) eso corre un día
// entero según dónde corra el proceso, y acá un día de más al principio o al
// final del período cambia la proyección.

const MS_DIA = 86_400_000;

function aUtc(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

const dd = (n: number) => String(n).padStart(2, "0");

function isoDe(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${dd(d.getUTCMonth() + 1)}-${dd(d.getUTCDate())}`;
}

/** Días inclusive entre dos fechas (`a`..`b`). 0 si `b` es anterior a `a`. */
export function diasInclusive(a: string, b: string): number {
  return Math.max(0, Math.round((aUtc(b) - aUtc(a)) / MS_DIA) + 1);
}

/** Cuántos días tiene el mes `YYYY-MM`. */
export function diasDelMes(mes: string): number {
  const anio = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  return new Date(Date.UTC(anio, m, 0)).getUTCDate();
}

/** El mismo mes un año antes: `2026-09` → `2025-09`. */
export function mesDelAnioAnterior(mes: string): string {
  return `${Number(mes.slice(0, 4)) - 1}-${mes.slice(5, 7)}`;
}

/**
 * El peso de CADA día del período, en orden.
 *
 * El peso de un día es el de su mes (tomado del año pasado) repartido en partes
 * iguales entre los días de ESE MES — no entre los días del período. Si no,
 * un período que agarra medio diciembre le daría a esos 15 días el peso del mes
 * entero, y diciembre pesa el 58,8%: el error sería enorme justo donde más
 * duele.
 *
 * Devuelve `null` cuando no hay con qué ponderar (sin pesos, o todos en cero) →
 * quien llama se cae a los días.
 */
export function pesosPorDia(
  desde: string,
  hasta: string,
  pesos: readonly PesoMes[] | undefined,
): number[] | null {
  if (!pesos || pesos.length === 0) return null;

  const porMes = new Map<string, number>();
  for (const p of pesos) {
    // Un mes con venta negativa (más devoluciones que ventas) no puede "pesar"
    // negativo: sería un divisor que baja al avanzar el tiempo. Se trata como 0.
    porMes.set(p.mes, Math.max(0, Number(p.ventas) || 0));
  }

  const total = [...porMes.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return null;

  const out: number[] = [];
  const fin = aUtc(hasta);
  for (let t = aUtc(desde); t <= fin; t += MS_DIA) {
    const iso = isoDe(t);
    const mesRef = mesDelAnioAnterior(iso.slice(0, 7));
    const delMes = porMes.get(mesRef);
    // Un mes del período SIN comparable no invalida la ponderación entera: pesa
    // 0 y los demás siguen ordenando el reloj. (Si TODOS faltan, `total` de
    // abajo da 0 y se cae a los días.)
    out.push(delMes == null ? 0 : delMes / diasDelMes(mesRef));
  }
  return out.some((p) => p > 0) ? out : null;
}

export interface Transcurrido {
  fraccion: number;
  base: BaseProyeccion;
}

/**
 * Qué proporción del período ya pasó — ponderada por temporada si se puede.
 *
 * ⚠️ EL DÍA DE HOY CUENTA COMPLETO. Es una elección, y la conservadora: contar
 * medio día haría que la proyección subiera sola a lo largo de la jornada, así
 * que el mismo número mirado a las 9am y a las 6pm diría cosas distintas sin que
 * hubiera pasado nada. Contándolo entero, la proyección solo se mueve cuando se
 * mueve la VENTA — y el sesgo (proyectar un poquito por lo bajo temprano en el
 * día) juega a favor: nunca promete de más.
 */
export function transcurrido(
  desde: string,
  hasta: string,
  hoy: string,
  pesos: readonly PesoMes[] | undefined,
): Transcurrido {
  if (hoy < desde) return { fraccion: 0, base: pesosPorDia(desde, hasta, pesos) ? "temporada" : "dias" };
  if (hoy >= hasta) return { fraccion: 1, base: pesosPorDia(desde, hasta, pesos) ? "temporada" : "dias" };

  const porDia = pesosPorDia(desde, hasta, pesos);
  if (porDia == null) {
    const total = diasInclusive(desde, hasta);
    return { fraccion: total === 0 ? 0 : diasInclusive(desde, hoy) / total, base: "dias" };
  }

  const total = porDia.reduce((a, b) => a + b, 0);
  const corridos = porDia.slice(0, diasInclusive(desde, hoy)).reduce((a, b) => a + b, 0);
  return { fraccion: total === 0 ? 0 : corridos / total, base: "temporada" };
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** El avance completo de una meta. Todo lo que la pantalla necesita saber. */
export function avanceMeta(e: EntradaAvance): Avance {
  const vendido = centavos(e.vendido);
  const objetivo = centavos(e.objetivo);
  const { fraccion, base } = transcurrido(e.desde, e.hasta, e.hoy, e.pesos);

  const diasTotales = diasInclusive(e.desde, e.hasta);
  const diasTranscurridos =
    e.hoy < e.desde ? 0 : Math.min(diasTotales, diasInclusive(e.desde, e.hoy));
  const estado: Avance["estado"] =
    e.hoy < e.desde ? "por-empezar" : e.hoy > e.hasta ? "cerrada" : "en-curso";

  // Período cerrado: no hay nada que proyectar, lo vendido ES el cierre.
  let proyeccion: number | null = null;
  let motivo: Avance["motivoSinProyeccion"] = null;
  if (estado === "cerrada") {
    proyeccion = vendido;
  } else if (estado === "por-empezar") {
    motivo = "no-empezo";
  } else if (fraccion < FRACCION_MINIMA_PARA_PROYECTAR) {
    motivo = "muy-temprano";
  } else {
    proyeccion = centavos(vendido / fraccion);
  }

  return {
    vendido,
    objetivo,
    falta: centavos(Math.max(0, objetivo - vendido)),
    pctVendido: objetivo > 0 ? vendido / objetivo : 0,
    diasTotales,
    diasTranscurridos,
    diasQueFaltan: Math.max(0, diasTotales - diasTranscurridos),
    fraccionTranscurrida: fraccion,
    base,
    proyeccion,
    motivoSinProyeccion: motivo,
    alcanza: proyeccion == null ? null : proyeccion >= objetivo,
    brechaProyectada: proyeccion == null ? null : centavos(proyeccion - objetivo),
    estado,
    cumplida: vendido >= objetivo,
  };
}

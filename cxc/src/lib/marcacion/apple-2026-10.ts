// ─────────────────────────────────────────────────────────────────────────────
// MARCACIÓN ESTILO APPLE (1-oct-2026, mockup «hoy vs recomendación», APAGADO
// hasta el «sí» de Daniel; reglas en docs/diseno.md).
//
// La pregunta de la pantalla: «¿qué marco ahora?». La responde el botón, que
// no cambia. Lo que cambia es cómo se lee el día:
//
//   1. El día en CUATRO RENGLONES FIJOS —Entrada · Salida a almuerzo · Regreso
//      de almuerzo · Salida— con la hora a la derecha o «—». Siempre visibles,
//      también con cero marcas: medido el 1-oct, desde el 24-sep las cuatro
//      personas que marcan por teléfono dejaron las 4 marcas en 23 de 23 días. 🩸
//      Hoy la pastilla verde es UNA frase que en el celular ocupa 3 renglones
//      y corta «p. m.» a la mitad.
//   2. «Deshacer» va en el renglón de la marca que deshace, como «Deshacer ·
//      1:45»: el renglón ya la nombra. Medido: 2 usos en 113 marcas (Daniel
//      probando y Angel el 25-sep). Se usa poco, así que sigue chico, pero no se
//      quita: es regla de CLAUDE.md.
//   3. 🔴 «Se envía sola» era FALSO con la app cerrada (CLAUDE.md: «Con la app
//      CERRADA no sale nada»). Medido: 11 de 113 marcas fueron sin señal y 6 se
//      guardaron entre 3 y 18 horas después. La marca pendiente lleva su chip
//      «Pendiente de envío» en su renglón y una línea gris dice la verdad.
//
// 🔴 SOLO PANTALLA. Lo que se manda y se guarda es idéntico: candados
// `marcacion-payload-igual` y `marcacion-apple-2026-10`.
// `false` = la pantalla «un toque» de hoy, intacta.
// ─────────────────────────────────────────────────────────────────────────────

import { enDoceHoras } from "./marcacion";
import { MARCACION_CUATRO_MARCAS } from "./cuatro-marcas";

/** 🔴 El interruptor. `false` = la pantalla de hoy. */
// 🔴 2-oct-2026: PRENDIDO. Daniel aprobó las capturas el 2-oct-2026: «sí».
export const MARCACION_APPLE_2026_10 = true;

/** Los renglones del día, en el orden en que se marcan. */
export function rotulosDelDia(): readonly string[] {
  return MARCACION_CUATRO_MARCAS
    ? ["Entrada", "Salida a almuerzo", "Regreso de almuerzo", "Salida"]
    : ["Entrada", "Salida"];
}

export interface RenglonDelDia {
  rotulo: string;
  /** «8:58 a. m.», o `null` si todavía no se marcó. */
  hora: string | null;
  /** La marca está en el teléfono, esperando señal. */
  pendiente: boolean;
}

/**
 * Los renglones fijos del día. `horas` son todas las de HOY en orden («HH:MM»,
 * las guardadas y las de la cola juntas, como las cuenta el botón);
 * `horasPendientes`, las de la cola. Una hora que no cabe en los renglones
 * (el reloj físico puede dejar más) no se dibuja: el botón ya está apagado.
 */
export function renglonesDelDia(
  horas: readonly string[],
  horasPendientes: readonly string[] = [],
): RenglonDelDia[] {
  const enCola = [...horasPendientes];
  return rotulosDelDia().map((rotulo, i) => {
    const h = horas[i];
    if (!h) return { rotulo, hora: null, pendiente: false };
    const j = enCola.indexOf(h);
    if (j >= 0) enCola.splice(j, 1);
    return { rotulo, hora: enDoceHoras(h), pendiente: j >= 0 };
  });
}

/** El chip del renglón que todavía no salió del teléfono. */
export const TEXTO_PENDIENTE_DE_ENVIO = "Pendiente de envío";

/** Sin señal se puede marcar: eso es lo que la persona necesita saber. */
export const TEXTO_SIN_SENAL_APPLE = "Sin señal. Puedes marcar igual.";

/** 🔴 La verdad sobre la cola: con la app cerrada no se envía nada. */
export function textoPendientesDeEnvio(n: number): string {
  const cuantas = n === 1 ? "1 marca pendiente de envío" : `${n} marcas pendientes de envío`;
  return `${cuantas}. Se envía al tener señal, con la app abierta.`;
}

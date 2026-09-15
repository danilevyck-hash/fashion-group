// ─────────────────────────────────────────────────────────────────────────────
// DESHACER LA ÚLTIMA MARCA — DOS MINUTOS (14-sep-2026). Módulo PURO.
//
// Daniel probó el reloj del teléfono él mismo y marcó la SALIDA cinco minutos
// después de la entrada, por error de dedo. Hasta hoy, arreglar eso pedía
// escribirle a la contadora para que entrara a corregir.
//
// 🔴 DESHACER NO ES BORRAR. `asistencia_marcaciones` es append-only —hay
// barrido estático que prohíbe update y delete— y esta función no la toca: la
// marca deja de contar por una CORRECCIÓN ENCIMA, en `asistencia_correcciones`,
// que es el mecanismo que ya existía para eso (motivo obligatorio, firma de
// quien la hizo, `anulada_en` para deshacer el deshacer). Lo único que nace es
// una tercera FORMA de corrección —quitar— al lado de las dos de siempre:
// pisar la hora y agregar la que el reloj nunca registró.
//
// ── POR QUÉ DOS MINUTOS Y NO DIEZ ────────────────────────────────────────────
// Con una ventana larga alguien podría borrar su entrada a media tarde y
// volver a marcarla a otra hora, y eso ya no es deshacer un error: es cambiar
// su hora de llegada. Dos minutos alcanzan para el error de dedo y no alcanzan
// para nada más. Daniel eligió 2 sobre 10 y sobre «hasta la siguiente marca».
//
// ── LA VENTANA SE CUENTA DESDE LA HORA QUE CUENTA ────────────────────────────
// Desde `ocurrio_en`, no desde cuándo llegó al servidor. Con señal son el mismo
// instante. Sin señal, `ocurrio_en` es la hora de la foto: una marca que se
// tomó a las 8:00 y subió a las 11:30 YA NO se puede deshacer a las 11:31 — a
// esa hora nadie está mirando el error de las 8:00, y abrir ahí una ventana
// sería abrirla justo donde no hace falta.
// ─────────────────────────────────────────────────────────────────────────────

import { DISPOSITIVO_TELEFONO, type TipoMarca } from "./marcacion";

/** Dos minutos. Daniel, 14-sep-2026. */
export const VENTANA_DESHACER_MS = 2 * 60_000;

/**
 * El motivo que queda escrito en la corrección. Es obligatorio en la base
 * (CHECK `btrim(motivo) <> ''`) y acá no se le pide a nadie que lo teclee: en
 * un deshacer de dos minutos no hay nada que explicar más que lo que pasó.
 */
export const MOTIVO_DESHACER =
  "La persona deshizo su marca desde el teléfono, dentro de los 2 minutos.";

/** Una marca guardada, como la ve el servidor para decidir. */
export interface MarcaGuardada {
  id: string;
  ocurrioEn: string;
  dispositivo: string;
}

/** Lo que el servidor le manda a la pantalla: qué se puede deshacer y hasta
 *  cuándo. `null` = no hay nada que deshacer. */
export interface Deshacible {
  /** La hora que cuenta de esa marca — de ahí sale la cuenta regresiva. */
  ocurrioEn: string;
  /** «entrada» o «salida», según cuántas marcas del día había antes que ella. */
  tipo: TipoMarca;
}

/**
 * ¿Qué puede deshacer esta persona, mirando lo que ya está guardado?
 *
 * 🔴 SOLO LA ÚLTIMA, Y SOLO SI SALIÓ DEL TELÉFONO. Si lo último que marcó fue
 * en el reloj de la tienda, el teléfono no lo deshace: el teléfono solo deshace
 * lo que el teléfono hizo. Y si la última es del teléfono pero ya pasaron los
 * dos minutos, tampoco — el botón no está.
 *
 * ⚠️ `marcas` tiene que venir SIN las que ya se deshicieron: una marca quitada
 * dejó de contar, así que la «última» es la anterior a ella.
 */
export function queSePuedeDeshacer(
  marcas: readonly MarcaGuardada[],
  ahoraIso: string,
): (Deshacible & { id: string }) | null {
  const ahora = Date.parse(ahoraIso);
  if (!Number.isFinite(ahora)) return null;
  const ordenadas = marcas
    .filter((m) => Number.isFinite(Date.parse(m.ocurrioEn)))
    .slice()
    .sort((a, b) => Date.parse(a.ocurrioEn) - Date.parse(b.ocurrioEn));
  const ultima = ordenadas[ordenadas.length - 1];
  if (!ultima) return null;
  if (ultima.dispositivo !== DISPOSITIVO_TELEFONO) return null;
  if (!dentroDeLaVentana(ultima.ocurrioEn, ahoraIso)) return null;
  // 🔑 Qué ERA esa marca sale de cuántas hubo ANTES en su mismo día, con la
  // misma regla de todo el módulo: la primera del día es la entrada.
  const antes = ordenadas.filter(
    (m) => m !== ultima && diaDeMismoCorte(m.ocurrioEn, ultima.ocurrioEn),
  ).length;
  return { id: ultima.id, ocurrioEn: ultima.ocurrioEn, tipo: antes === 0 ? "entrada" : "salida" };
}

/** Dos instantes del MISMO día de Panamá. Se compara con el corte de −5 h. */
function diaDeMismoCorte(a: string, b: string): boolean {
  const dia = (iso: string) =>
    new Date(Date.parse(iso) - 5 * 3600_000).toISOString().slice(0, 10);
  return dia(a) === dia(b);
}

/** ¿Esa marca sigue dentro de los dos minutos? */
export function dentroDeLaVentana(ocurrioEn: string, ahoraIso: string): boolean {
  return restanMs(ocurrioEn, ahoraIso) > 0;
}

/**
 * Cuántos milisegundos le quedan a la ventana. 0 o menos = se acabó.
 *
 * ⚠️ Una marca en el FUTURO (el reloj del teléfono adelantado, con la pantalla
 * midiendo con su propio reloj) no estira la ventana más allá de los dos
 * minutos: se capea. Sin esto, mover el reloj tres horas adelante dejaría el
 * botón «Deshacer» puesto tres horas.
 */
export function restanMs(ocurrioEn: string, ahoraIso: string): number {
  const t = Date.parse(ocurrioEn);
  const ahora = Date.parse(ahoraIso);
  if (!Number.isFinite(t) || !Number.isFinite(ahora)) return 0;
  const pasado = ahora - t;
  if (pasado < 0) return VENTANA_DESHACER_MS;
  return Math.max(0, VENTANA_DESHACER_MS - pasado);
}

/** «1:47» — lo que le queda al botón. Siempre m:ss. */
export function cuentaRegresiva(ms: number): string {
  const seg = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;
}

/** «Deshacer la salida» — el rótulo del botón, con lo que se va a deshacer. */
export function rotuloDeshacer(tipo: TipoMarca): string {
  return `Deshacer la ${tipo}`;
}

/** Lo que dice la pantalla después. Nunca «se borró»: no se borró nada. */
export function avisoDeshecha(tipo: TipoMarca): string {
  return `Listo, se deshizo la ${tipo}. Puedes marcar de nuevo.`;
}

// ── LO QUE TODAVÍA NO SALIÓ DEL TELÉFONO ─────────────────────────────────────

/** Una marca que espera señal, como la guarda el teléfono. */
export interface MarcaEnCola {
  eventoId: string;
  tipo: TipoMarca;
  horaTelefono: string;
}

export type QueSeDeshace =
  | { donde: "servidor"; tipo: TipoMarca; ocurrioEn: string; restanMs: number }
  | { donde: "telefono"; tipo: TipoMarca; eventoId: string; ocurrioEn: string; restanMs: number };

/**
 * La decisión COMPLETA de la pantalla: entre lo guardado y lo que espera
 * señal, qué se puede deshacer ahora mismo.
 *
 * 🔑 Las dos puertas y una sola regla. Una marca que todavía está en el
 * teléfono NUNCA fue una marca: deshacerla es sacarla de la cola, y no hay
 * nada que anular ni rastro que dejar. Una marca guardada se quita con una
 * corrección firmada. Lo que la persona ve es lo mismo en los dos casos.
 */
export function queSeDeshace(x: {
  servidor: Deshacible | null;
  pendientes: readonly MarcaEnCola[];
  /** El instante del SERVIDOR (corregido por el desfase), para lo guardado. */
  ahoraServidorIso: string;
  /** El instante de ESTE TELÉFONO, para lo que todavía no salió de él. */
  ahoraTelefonoIso: string;
}): QueSeDeshace | null {
  // 🔑 CADA MARCA SE MIDE CON EL RELOJ QUE LA ESTAMPÓ. Lo guardado lleva la
  // hora del servidor; lo que espera señal, la del teléfono. Mezclarlos deja
  // el botón «Deshacer» puesto dos horas en un teléfono adelantado dos horas.
  const candidatos: QueSeDeshace[] = [];
  if (x.servidor) {
    candidatos.push({
      donde: "servidor",
      tipo: x.servidor.tipo,
      ocurrioEn: x.servidor.ocurrioEn,
      restanMs: restanMs(x.servidor.ocurrioEn, x.ahoraServidorIso),
    });
  }
  for (const p of x.pendientes) {
    candidatos.push({
      donde: "telefono",
      tipo: p.tipo,
      eventoId: p.eventoId,
      ocurrioEn: p.horaTelefono,
      restanMs: restanMs(p.horaTelefono, x.ahoraTelefonoIso),
    });
  }
  const vivos = candidatos.filter(
    (c) => c.restanMs > 0 && Number.isFinite(Date.parse(c.ocurrioEn)),
  );
  if (vivos.length === 0) return null;
  // La ÚLTIMA es la que más ventana le queda — y se compara ASÍ, y no por
  // instante, justamente para no comparar dos relojes distintos.
  return vivos.reduce((a, b) => (b.restanMs > a.restanMs ? b : a));
}

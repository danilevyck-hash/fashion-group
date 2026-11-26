// «Activa los avisos» AL ENTRAR A LA APP, para TODOS (25-nov-2026, Daniel:
// «que le pida la notificación al entrar al app, a todos, incluso los de
// marcación»). Puro: decide qué se le muestra a ESTE aparato.
//
//   · pedir      → ventana «Activa los avisos» con botón (iOS exige el toque).
//   · instalar   → iPhone abierto en Safari: cómo agregarla a la pantalla de inicio.
//   · sincronizar→ ya tiene permiso y suscripción: se guarda otra vez a nombre
//                  del usuario, en silencio (así un teléfono suscrito desde
//                  Marcación también recibe los avisos por usuario).
//   · nada       → bloqueado, sin soporte, computadora o iPad, o ya se decidió hace poco.
// «Ahora no» (o «Entendido») no vuelve a preguntar en 7 días en ese aparato
// (localStorage). En computadora e iPad la ventana no sale nunca; sincronizar sí.

import type { EstadoDelAviso } from "@/lib/marcacion/push-cliente";

/** 🔴 PRENDIDO (25-nov-2026). `false` = nadie ve la ventana ni se sincroniza nada. */
export const AVISOS_AL_ENTRAR_2026_11 = true;

/** localStorage: fecha (ms) en que se dijo «Ahora no» / «Entendido» en este aparato. */
export const LLAVE_AVISOS_DECIDIDO = "fg_avisos_decidido";

export const DIAS_SIN_VOLVER_A_PREGUNTAR = 7;

/** ¿Lo guardado en `LLAVE_AVISOS_DECIDIDO` sigue vigente? Un valor ilegible o futuro no cuenta. */
export function decididoReciente(guardado: string | null, ahora: number): boolean {
  const t = Number(guardado);
  if (!guardado || !Number.isFinite(t) || t > ahora) return false;
  return ahora - t < DIAS_SIN_VOLVER_A_PREGUNTAR * 86_400_000;
}

export type QueOfrecer = "pedir" | "instalar" | "sincronizar" | "nada";

/** Pantallas donde NO se ofrece: sin sesión (login) y Marcación, que ya trae su propio aviso. */
export function rutaSinAviso(pathname: string | null | undefined): boolean {
  const p = pathname ?? "/";
  return p === "/" || p.startsWith("/marcacion");
}

export function queOfrecer(a: {
  estado: EstadoDelAviso;
  iphoneSinInstalar: boolean;
  yaDecidido: boolean;
  /** Computadora o iPad: la ventana no sale nunca (sincronizar sí). */
  esComputadora?: boolean;
}): QueOfrecer {
  if (!AVISOS_AL_ENTRAR_2026_11) return "nada";
  if (a.estado === "activo") return "sincronizar";
  if (a.yaDecidido || a.esComputadora) return "nada";
  if (a.estado === "falta") return "pedir";
  if (a.estado === "no-puede" && a.iphoneSinInstalar) return "instalar";
  return "nada";
}

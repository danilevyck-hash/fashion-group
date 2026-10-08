// La sesión ya comprobada no se vuelve a preguntar a la base durante 60 s.
//
// 🩸 Medido en producción (Vercel, 7 días al 7-oct-2026): el middleware le
// pregunta a `user_sessions` en CADA petición —la página y cada una de sus
// 3 a 9 llamadas— y esa pregunta tarda 246 ms en la mitad de los casos y
// 358 ms en el 5 % peor, porque la función corre en Virginia (iad1) y la base
// en Oregón (us-west-2). Abrir CxC pagaba ese viaje nueve veces.
//
// 🔴 Lo que se guarda es SOLO un «sí» DEFINITIVO de la base: un «no» se
// vuelve a preguntar siempre (y desloguea igual que antes), y el «sí por las
// dudas» del fail-open ante un blip tampoco se guarda. Una sesión revocada
// puede seguir viva hasta 60 s en la instancia que ya la tenía: es el precio.
//
// La memoria es la de la instancia del borde (sin cookies nuevas, sin nada que
// el navegador pueda falsificar): una instancia fría pregunta como siempre.

export const TTL_SESION_VALIDA_MS = 60_000;
const TOPE_ENTRADAS = 1000;

/** `definitiva: false` = la base no contestó y se dejó pasar por las dudas. */
export interface Veredicto {
  valida: boolean;
  definitiva: boolean;
}

const validas = new Map<string, number>(); // token → vence (ms)
const enVuelo = new Map<string, Promise<Veredicto>>();

export async function sesionValidaConCache(
  token: string,
  consultar: (token: string) => Promise<Veredicto>,
  ahora: number = Date.now(),
): Promise<boolean> {
  const vence = validas.get(token);
  if (vence !== undefined && vence > ahora) return true;

  // Las llamadas que salen juntas al abrir una pantalla esperan UNA consulta.
  let p = enVuelo.get(token);
  if (!p) {
    p = consultar(token).finally(() => enVuelo.delete(token));
    enVuelo.set(token, p);
  }
  const v = await p;
  if (v.valida && v.definitiva) {
    if (validas.size >= TOPE_ENTRADAS) validas.clear();
    validas.set(token, ahora + TTL_SESION_VALIDA_MS);
  } else {
    validas.delete(token);
  }
  return v.valida;
}

/** Solo para pruebas. */
export function _vaciarCacheDeSesiones() {
  validas.clear();
  enVuelo.clear();
}

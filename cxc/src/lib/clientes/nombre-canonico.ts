// ─────────────────────────────────────────────────────────────────────────────
// QUÉ NOMBRE LLEVA UN CÓDIGO EN EL MAESTRO — módulo PURO, sin base ni red.
//
// ── 🩸 EL HUECO, medido contra producción el 8-ago-2026 ─────────────────────
//
// El síntoma que se reportó era *"faltan 3 clientes que YA tienen código D-XXX
// en Switch y el sync no subió"*:
//
//     Rey Store (Agua)         D-134   vistana
//     City Moda                D-26    fashion_wear, active_wear
//     El Machetazo-Calidonia   D-170   active_wear
//
// **No faltaba ninguno.** Los tres códigos están en `switch_clientes` y los tres
// están en `clientes_master`. Lo que pasa es que están **con OTRO nombre**:
//
//     D-134  →  "Rey Store"            (y no "Rey Store (Agua)")
//     D-26   →  "City Moda Chorrera"   (y no "City Moda")
//     D-170  →  "Nova Lux, S.A."       (y no "El Machetazo-Calidonia")
//
// ── LA CAUSA: EL CÓDIGO NO ES UNA LLAVE GLOBAL ──────────────────────────────
//
// Cada empresa de Switch lleva su PROPIA numeración de clientes, así que el
// mismo `D-XXX` puede nombrar cosas distintas en dos empresas. Medido sobre los
// 145 códigos del grupo: **4 tienen más de un nombre** (D-134, D-26, D-170 y
// TCKCTA, el mostrador). `clientes_master.codigo` es UNIQUE global, así que sólo
// cabe UNO — y hay que elegir.
//
// ── LO QUE ESTABA MAL NO ERA ELEGIR: ERA QUIÉN ELEGÍA ───────────────────────
//
// El desempate era `ORDER BY synced_at DESC` → ganaba **la empresa cuyo cron
// corrió último**. Medido ese día:
//
//     05:31 vistana · 05:33 active_wear · 05:35 fashion_shoes
//     05:37 fashion_wear · 05:40 active_shoes · 05:42 joystep  ← siempre gana
//
// O sea que el nombre de un cliente lo decidía **el calendario de crons**. Mover
// una entrada de `vercel.json` 15 minutos —algo que este repo hace seguido y por
// razones que no tienen nada que ver con clientes— habría renombrado clientes en
// silencio, en el Directorio, en Guías, en Cheques y en el buscador global. Ese
// es el hueco: no que se saltara filas, sino que el resultado **no era una
// función de los datos**.
//
// ── LA REGLA NUEVA: EL NOMBRE QUE USAN MÁS EMPRESAS ─────────────────────────
//
// Gana el nombre que más empresas del grupo comparten; si empatan, el orden de
// `EMPRESAS_DEL_GRUPO` (una lista fija en el código, no un horario). Es
// determinista, no depende de cuándo corrió nada, y **reproduce EXACTAMENTE lo
// que hay hoy en producción**: D-134 va 5 a 1, D-170 va 5 a 1 y D-26 va 4 a 2,
// así que el ganador no se mueve en ninguno de los tres. Cambiar la causa sin
// cambiar el efecto es justamente lo que se buscaba — arreglar el mecanismo no
// puede renombrarle clientes a nadie.
//
// ── LO QUE ESTE MÓDULO NO HACE, A PROPÓSITO ─────────────────────────────────
//
// No inventa un código nuevo para el nombre perdedor, no fusiona los dos
// clientes y no borra nada. Que `D-170` sea "Nova Lux, S.A." en cinco empresas y
// "El Machetazo-Calidonia" en `active_wear` es un dato de Switch: son casi con
// seguridad DOS clientes distintos, y decidir eso es de Daniel, no del sync.
// Lo que sí hace es **dejar de esconderlo**: `codigosAmbiguos()` los devuelve
// para que se vean y se puedan corregir en el panel de Switch.
// ─────────────────────────────────────────────────────────────────────────────

import { EMPRESAS_DEL_GRUPO } from "@/lib/clientes/mundos";

/** Prioridad de desempate: la posición en `EMPRESAS_DEL_GRUPO`. Una empresa que
 *  no esté en la lista (Boston) va al final, nunca gana un empate. */
const ORDEN = new Map<string, number>(EMPRESAS_DEL_GRUPO.map((e, i) => [e, i]));
const prioridad = (empresa: string): number => ORDEN.get(empresa) ?? Number.MAX_SAFE_INTEGER;

/** Lo mínimo que hace falta de una fila de `switch_clientes` para elegir. */
export interface CandidatoNombre {
  empresa_key: string;
  nombre: string | null;
}

/** Un código con más de un nombre entre las empresas que lo conocen. */
export interface CodigoAmbiguo {
  codigo: string;
  /** Ordenadas de más a menos empresas. La primera es la que gana. */
  variantes: Array<{ nombre: string; empresas: string[] }>;
}

const N2 = (s: string | null | undefined): string =>
  (s ?? "").trim().toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

/**
 * Elige el nombre canónico de un código entre sus candidatos.
 *
 * Criterio, en orden: (1) el que más empresas usan, (2) el de la empresa que
 * viene antes en `EMPRESAS_DEL_GRUPO`. Nunca mira relojes ni `synced_at`.
 *
 * Devuelve `null` si no hay ningún candidato con nombre — quien llame decide
 * (hoy: se saltea la fila y lo cuenta como `skipped_sin_nombre`).
 */
export function elegirNombreCanonico(candidatos: readonly CandidatoNombre[]): string | null {
  // Se agrupa por nombre NORMALIZADO para que "Nova Lux, S.A." y
  // "NOVA LUX SA" no cuenten como dos variantes distintas; pero lo que se
  // devuelve es el nombre TAL CUAL vino de Switch (con sus mayúsculas y sus
  // puntos), que es lo que la pantalla muestra.
  const porNombre = new Map<string, { crudo: string; empresas: string[] }>();
  for (const c of candidatos) {
    const clave = N2(c.nombre);
    if (!clave) continue;
    const prev = porNombre.get(clave);
    if (prev) {
      prev.empresas.push(c.empresa_key);
      // Entre dos formas de escribir el MISMO nombre gana la de la empresa de
      // mayor prioridad, por la misma razón que arriba: que no lo decida el reloj.
      if (prioridad(c.empresa_key) < Math.min(...prev.empresas.map(prioridad))) {
        prev.crudo = (c.nombre ?? "").trim();
      }
    } else {
      porNombre.set(clave, { crudo: (c.nombre ?? "").trim(), empresas: [c.empresa_key] });
    }
  }
  if (porNombre.size === 0) return null;

  let mejor: { crudo: string; empresas: string[] } | null = null;
  for (const v of porNombre.values()) {
    if (!mejor) { mejor = v; continue; }
    if (v.empresas.length > mejor.empresas.length) { mejor = v; continue; }
    if (v.empresas.length === mejor.empresas.length) {
      const pv = Math.min(...v.empresas.map(prioridad));
      const pm = Math.min(...mejor.empresas.map(prioridad));
      if (pv < pm) mejor = v;
    }
  }
  return mejor?.crudo ?? null;
}

/**
 * Los códigos que llevan más de un nombre. Es lo que hay que corregir en el
 * panel de Switch, y lo que antes quedaba invisible porque el sync elegía uno
 * y se callaba.
 *
 * `TCKCTA` NO entra: el mostrador se llama distinto en cada empresa a propósito
 * (Contado / VENTAS / VENTAS LOCA) y ya se normaliza aparte. Reportarlo todos
 * los días sería la alerta que suena para siempre.
 */
export function codigosAmbiguos(
  porCodigo: ReadonlyMap<string, readonly CandidatoNombre[]>,
  excluir: readonly string[] = ["TCKCTA"],
): CodigoAmbiguo[] {
  const fuera = new Set(excluir.map((e) => e.toUpperCase()));
  const out: CodigoAmbiguo[] = [];

  for (const [codigo, candidatos] of porCodigo) {
    if (fuera.has(codigo.toUpperCase())) continue;
    const porNombre = new Map<string, { nombre: string; empresas: string[] }>();
    for (const c of candidatos) {
      const clave = N2(c.nombre);
      if (!clave) continue;
      const prev = porNombre.get(clave);
      if (prev) prev.empresas.push(c.empresa_key);
      else porNombre.set(clave, { nombre: (c.nombre ?? "").trim(), empresas: [c.empresa_key] });
    }
    if (porNombre.size <= 1) continue;

    out.push({
      codigo,
      variantes: [...porNombre.values()]
        .map((v) => ({ nombre: v.nombre, empresas: [...v.empresas].sort() }))
        .sort((a, b) => b.empresas.length - a.empresas.length || a.nombre.localeCompare(b.nombre)),
    });
  }
  return out.sort((a, b) => a.codigo.localeCompare(b.codigo));
}

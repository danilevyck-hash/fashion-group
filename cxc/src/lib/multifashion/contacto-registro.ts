// ─────────────────────────────────────────────────────────────────────────────
// «LE ESCRIBIERON HACE 3 DÍAS» — el rastro de a quién ya contactó la tienda.
// Módulo PURO: los textos y las reglas, sin base de datos.
//
// 🩸 QUÉ HABÍA (medido el 16-sep-2026): **NADA**. No existía ninguna tabla donde
// quedara registrado que se contactó a un cliente de Multifashion, así que dos
// personas de la tienda podían escribirle al mismo cliente el mismo día y
// ninguna de las dos se enteraba.
//
// 🔑 EL PATRÓN NO SE INVENTA: se copia del CXC (`src/lib/cxc/envios-registro.ts`
// + `cxc_emails_enviados`), donde el canal, el anti-duplicado y la frase ya
// están resueltos. Lo que cambia acá, y es a propósito:
//
//   · 🔴 **ES DEL MÓDULO, NO DE LA PERSONA.** Daniel, 16-sep-2026: *«desde la
//     tienda, el ya se escribió debe de ser general por módulo, no por usuario
//     ni nada de eso»*. Se guarda QUIÉN escribió (`contactado_por`), porque un
//     registro sin firma no sirve para nada, pero **ninguna lectura filtra por
//     usuario**: si alguien de la tienda escribe, lo ven todos.
//   · 🔴 **NO HAY VENTANA QUE APAGUE LA MARCA.** En el CXC la marca dura 7 días
//     porque ahí la pregunta es «¿ya le cobré esta semana?». Acá la pregunta es
//     «¿alguien ya intentó recuperarlo?», y eso no caduca: el mockup que Daniel
//     aprobó muestra «le escribieron hace 12 días». Sin contacto, la línea
//     simplemente no dice nada — no se escribe «nunca» al lado de cada nombre.
//   · 🔴 **LA IDENTIDAD ES EL CÓDIGO DE SWITCH** (`cliente_switch_id`), nunca el
//     nombre. Dos clientes se pueden llamar igual; el código no se repite.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los canales que dejan rastro. Lista CERRADA, y hoy tiene uno solo porque hoy
 * hay un solo botón: WhatsApp. Daniel: *«vacío»* — el botón abre WhatsApp sin
 * texto sugerido, así que lo único que se anota es que se abrió.
 *
 * ⚠️ Agregar un canal (una llamada, un correo) es una decisión de Daniel Y una
 * migración: el CHECK de la tabla enumera esta misma lista.
 */
export const CANALES_CONTACTO = ["whatsapp"] as const;
export type CanalContacto = (typeof CANALES_CONTACTO)[number];

export function esCanalContacto(v: unknown): v is CanalContacto {
  return typeof v === "string" && (CANALES_CONTACTO as readonly string[]).includes(v);
}

/** «hoy» · «ayer» · «hace N días». La misma forma que usa el resto del sistema. */
export function haceCuanto(dias: number): string {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}

/**
 * La mitad gris del renglón: «le escribieron hace 3 días».
 *
 * `null` = no se dibuja nada. Un cliente al que nadie escribió no necesita que
 * la pantalla se lo diga en cada línea: lo que no está, no está.
 */
export function textoUltimoContacto(dias: number | null | undefined): string | null {
  if (dias === null || dias === undefined || dias < 0) return null;
  return `le escribieron ${haceCuanto(dias)}`;
}

/** Días entre el contacto y hoy (los dos `YYYY-MM-DD`). `null` si no hay fecha. */
export function diasDesdeContacto(
  fechaContacto: string | null | undefined,
  hoy: string,
): number | null {
  if (!fechaContacto) return null;
  const a = Date.parse(`${String(fechaContacto).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(hoy).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Lo que la ruta devuelve por cliente: el ÚLTIMO contacto, de quien sea. */
export interface UltimoContacto {
  canal: CanalContacto;
  /** `YYYY-MM-DD` del contacto. */
  fecha: string;
}

/** Una fila cruda de `multifashion_contactos`, en lo que importa. */
export interface FilaContacto {
  cliente_switch_id: number | null;
  canal?: unknown;
  created_at: string;
}

/**
 * El último contacto de CADA cliente, sea quien sea el que escribió.
 *
 * 🔴 Acá vive el «es del módulo, no del usuario»: la función no recibe ningún
 * usuario y no lo podría filtrar aunque quisiera.
 *
 * Espera las filas ya ordenadas de la MÁS NUEVA a la más vieja (lo que hace la
 * ruta con `.order("created_at", { ascending: false })`); la primera que se ve
 * de cada cliente es la última y no se pisa después.
 */
export function ultimoContactoPorCliente(
  filas: readonly FilaContacto[],
): Record<number, UltimoContacto> {
  const porCliente: Record<number, UltimoContacto> = {};
  for (const fila of filas) {
    const id = fila.cliente_switch_id;
    if (typeof id !== "number" || !Number.isFinite(id)) continue;
    if (porCliente[id]) continue;
    if (!esCanalContacto(fila.canal)) continue;
    porCliente[id] = { canal: fila.canal, fecha: String(fila.created_at).slice(0, 10) };
  }
  return porCliente;
}

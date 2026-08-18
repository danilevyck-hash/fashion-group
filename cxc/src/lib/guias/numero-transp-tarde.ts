// ─────────────────────────────────────────────────────────────────────────────
// ANOTAR EL N° DEL TRANSPORTISTA DESPUÉS, EN UNA GUÍA QUE YA SALIÓ — la regla,
// sin nada de red.
//
// Desde el 17-ago-2026 el número **no bloquea** el despacho (Daniel: *"a veces
// el transportista lo da, a veces no"*), así que hay guías que salen sin él y
// quedan marcadas. Faltaba poder completarlo. Daniel, textual:
// ***"hazle la excepción para ese número"***.
//
// 🔑 EL MOLDE ES `PATCH /api/guias/[id]/cliente`, Y SE COPIA. Ese endpoint
// existe precisamente por esto: el 98% de las guías están cerradas, y anotar un
// dato sobre el destino de un renglón NO es editar el despacho. Anotar el número
// que el transportista dio tarde tampoco: no cambia un bulto, ni una factura, ni
// el texto que escribió bodega, ni una firma, ni la placa, ni el estado.
//
// 🔴 UN "0" NO SE PUEDE GUARDAR, y no es una manía. El papel trata el `"0"`
// pelado como vacío (`sinCeroPelado`) y la marca ámbar también: si se dejara
// escribir, la pantalla diría "guardado" y el aviso de que FALTA el número
// seguiría ahí — una pantalla que se contradice a sí misma. Se dice con todas
// las letras en vez de aceptarlo en silencio.
//
// ⚠️ Nada que CONTENGA un cero se pierde: `EK0700`, `TR-0` y `00` son números
// válidos y se guardan tal cual. Es el mismo criterio que `sinCeroPelado`, y hay
// candado.
// ─────────────────────────────────────────────────────────────────────────────

/** Tope de sanidad. El más largo de producción no llega a 20 caracteres. */
export const NUMERO_TRANSP_MAX = 60;

export type ResultadoNumeroTransp =
  | { ok: true; numero: string }
  | { ok: false; error: string };

/**
 * ¿Se puede guardar esto en `guia_items.numero_guia_transp`?
 *
 * - `""` / `null` → borrarlo. Siempre válido: alguien pudo anotar el número
 *   equivocado y tiene que poder dejarlo como estaba.
 * - `"0"` pelado → NO. Ver la cabecera.
 */
export function validarNumeroTransp(valor: unknown): ResultadoNumeroTransp {
  if (valor === null || valor === undefined) return { ok: true, numero: "" };
  if (typeof valor !== "string") {
    return { ok: false, error: "El N° del transportista tiene que ser texto" };
  }
  const n = valor.trim();
  if (!n) return { ok: true, numero: "" };
  if (n === "0") {
    return {
      ok: false,
      error: "Un 0 no es un N° de guía. Déjalo vacío si el transportista no dio ninguno.",
    };
  }
  if (n.length > NUMERO_TRANSP_MAX) {
    return { ok: false, error: `El N° del transportista no puede pasar de ${NUMERO_TRANSP_MAX} caracteres` };
  }
  return { ok: true, numero: n };
}

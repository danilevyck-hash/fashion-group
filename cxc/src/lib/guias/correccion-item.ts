// ─────────────────────────────────────────────────────────────────────────────
// CORREGIR UN RENGLÓN DE UNA GUÍA — qué se puede tocar, y qué se escribe.
//
// Daniel, sobre lo que hace bodega cuando llega el camión, textual: *"la parte
// de bodega es firmar más que nada para que quede registrado, y si hay algún
// cambio que hacer por error por ejemplo nombre, dirección, cantidad de bultos,
// que lo pueda arreglar"* · *"bodega puede corregir"*.
//
// 🔴 POR QUÉ ESTO EXISTE EN VEZ DE MANDAR `items`.
//
// `items` en el PUT de `/api/guias/[id]` es un **REEMPLAZO COMPLETO**: borra
// todos los renglones e inserta otros nuevos, así que **les cambia el id**. Con
// eso se pierde el trabajo de atar clientes (`guia_items.cliente_codigo`) y, en
// pleno despacho, los ids que la pantalla ya tiene en la mano dejan de existir.
// Está escrito en el CLAUDE.md desde ago-2026 y es la razón por la que el N° del
// transportista viaja por su propio campo.
//
// Corregir un nombre mal escrito NO puede costar la lista entera. Por eso esto
// arma un UPDATE de **los campos tocados de UNA fila**, y el endpoint lo aplica
// con `.eq("id", itemId).eq("guia_id", id)`.
//
// ⚠️ EL CANDADO DE LA GUÍA YA DESPACHADA NO SE TOCA. Esto es para corregir ANTES
// de que salga; una guía Completada sigue cerrada (el endpoint la rechaza).
// Atar el cliente de una guía vieja sigue yendo por su propio camino
// (`/api/guias/[id]/cliente`), que ni mira el estado — son dos cosas distintas
// y siguen separadas.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los campos de un renglón que este endpoint sabe traducir a un UPDATE.
 *
 * 🔑 **SE LEE DE `campos-editables.ts`, no se escribe acá.** Había dos listas
 * —una en cada archivo— y con dos listas el día que una cambiara la pantalla
 * ofrecería un campo que el servidor no sabe escribir, o al revés.
 *
 * ⚠️ Esto dice qué se sabe TRADUCIR. Qué se puede escribir **en una guía en
 * este estado** lo decide `camposEditablesDeRenglon`, y el endpoint aplica las
 * dos: una guía ya despachada acepta solo el cliente, las facturas y el N° del
 * transportista.
 */
export { CAMPOS_DE_RENGLON as CAMPOS_CORREGIBLES } from "./campos-editables";
import { CAMPOS_DE_RENGLON, type CampoDeRenglon } from "./campos-editables";

export type CampoCorregible = CampoDeRenglon;

export type ResultadoCorreccion =
  | { ok: true; cambios: Record<string, string | number | null> }
  | { ok: false; error: string };

/** Tope de sanidad. La guía más cargada de la historia no llega a 300 bultos. */
export const BULTOS_MAX = 9999;

const texto = (v: unknown): string => String(v ?? "").trim();

/**
 * Traduce el cuerpo del pedido en el UPDATE de UNA fila.
 *
 * 🔴 Solo viajan los campos que vinieron. Un cuerpo con `{ bultos: 5 }` escribe
 * `bultos` y NADA más: sin esto, corregir los bultos borraría la dirección de la
 * fila con un `""` que nadie escribió. Es el mismo error que `items`, en chico.
 *
 * ⚠️ `cliente_codigo` se acepta acá pero NO se valida acá: el universo de
 * códigos vivos lo pone el endpoint con la puerta única de clientes
 * (`validarCodigoParaAtar`), igual que `/api/guias/[id]/cliente`.
 */
export function armarCorreccion(body: unknown): ResultadoCorreccion {
  if (!body || typeof body !== "object") return { ok: false, error: "Cuerpo inválido" };
  const b = body as Record<string, unknown>;
  const cambios: Record<string, string | number | null> = {};

  for (const campo of CAMPOS_DE_RENGLON) {
    if (!(campo in b) || b[campo] === undefined) continue;

    if (campo === "bultos") {
      const n = typeof b.bultos === "number" ? b.bultos : Number(texto(b.bultos));
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > BULTOS_MAX) {
        return { ok: false, error: "Los bultos tienen que ser un número entero de 0 en adelante" };
      }
      cambios.bultos = n;
      continue;
    }

    if (campo === "cliente_codigo") {
      // null / "" = desatar. Se guarda NULL, nunca "": con "" un
      // `cliente_codigo IS NOT NULL` contaría líneas que no están atadas.
      if (b.cliente_codigo !== null && typeof b.cliente_codigo !== "string") {
        return { ok: false, error: "Código inválido" };
      }
      cambios.cliente_codigo = texto(b.cliente_codigo) || null;
      continue;
    }

    if (typeof b[campo] !== "string") {
      return { ok: false, error: `El campo "${campo}" tiene que ser texto` };
    }
    cambios[campo] = texto(b[campo]);
  }

  if (Object.keys(cambios).length === 0) {
    return { ok: false, error: "No hay nada que corregir" };
  }
  return { ok: true, cambios };
}

/**
 * ¿La corrección cambia algo de lo que ya está guardado?
 *
 * Sirve para que la pantalla no mande un pedido por cada tecla ni por abrir y
 * cerrar el renglón sin tocar nada — la misma idea que el guard de catálogos:
 * *las escrituras que no cambian nada no se hacen*.
 */
export function hayCambioReal(
  cambios: Record<string, string | number | null>,
  actual: Record<string, unknown>,
): boolean {
  return Object.entries(cambios).some(([k, v]) => {
    if (k === "bultos") return Number(actual[k] ?? 0) !== Number(v);
    if (k === "cliente_codigo") return (texto(actual[k]) || null) !== v;
    return texto(actual[k]) !== v;
  });
}

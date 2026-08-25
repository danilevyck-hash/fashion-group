// ─────────────────────────────────────────────────────────────────────────────
// QUÉ SE PUEDE TOCAR DE UNA GUÍA, SEGÚN SI YA SALIÓ O NO.  (módulo PURO)
//
// Daniel, sobre una guía YA DESPACHADA, punto por punto:
//   · «Se puede corregir **N° del transportista · cliente · facturas**»
//   · «Los **bultos** de una despachada **NO se tocan** — es lo que el
//     transportista firmó»
//   · «La **firma** queda la vieja. No se vuelve a firmar»
//
// 🔴 POR QUÉ ES UN MÓDULO Y NO UN `if` EN CADA LADO. La regla la aplican TRES
// lugares: el formulario (qué campos dibuja editables), el endpoint que escribe
// (`PATCH /api/guias/[id]/item`) y el candado. Con tres copias, el día que una
// cambiara, la pantalla ofrecería un campo que el servidor rechaza —o peor, el
// servidor aceptaría uno que la pantalla creía cerrado—. Acá la lista es una
// sola y las tres la LEEN.
//
// 🩸 Y LO QUE SE ABRE **NO** PASA POR EL PUT. `items` en el PUT de
// `/api/guias/[id]` es un REEMPLAZO COMPLETO: borra los renglones e inserta
// otros con ids NUEVOS, y con eso se pierden el cliente atado
// (`cliente_codigo`) y el N° que se anotó tarde. Corregir una factura de una
// guía firmada no puede costar eso. Las correcciones de una despachada van por
// escrituras POR COLUMNA — el molde de `PATCH …/cliente` y `PATCH
// …/numero-transp`, que ya existían por exactamente la misma razón.
//
// ⚠️ EL CANDADO DEL PUT NO SE TOCA: una guía Completada lo sigue rechazando
// entero. Lo que se abre son tres columnas, nombradas de a una.
// ─────────────────────────────────────────────────────────────────────────────

import { guiaYaDespachada } from "./modo-despacho";

/** Los campos de un renglón que alguien puede corregir desde la pantalla. */
export const CAMPOS_DE_RENGLON = [
  "cliente",
  "cliente_codigo",
  "direccion",
  "empresa",
  "facturas",
  "bultos",
  "numero_guia_transp",
] as const;

export type CampoDeRenglon = (typeof CAMPOS_DE_RENGLON)[number];

/**
 * 🔴 LO ÚNICO QUE SE PUEDE CORREGIR DE UNA GUÍA QUE YA SALIÓ.
 *
 * `cliente` y `cliente_codigo` van juntos porque son el mismo dato: el nombre
 * que se ve y el código que lo ata. `numero_guia_transp` ya tenía su propia
 * excepción desde el 18-ago-2026 y sigue funcionando igual.
 *
 * ⚠️ `bultos` NO está, y no es un olvido: es el papel firmado. Tampoco
 * `direccion` ni `empresa`, que describen un envío que ya se hizo.
 */
export const CAMPOS_DESPACHADA: readonly CampoDeRenglon[] = [
  "cliente",
  "cliente_codigo",
  "facturas",
  "numero_guia_transp",
];

/**
 * Los campos que se pueden escribir en un renglón de una guía en este estado.
 *
 * Antes de salir: todos. Después de salir: los tres de arriba.
 */
export function camposEditablesDeRenglon(estado: string | null | undefined): readonly CampoDeRenglon[] {
  return guiaYaDespachada(estado) ? CAMPOS_DESPACHADA : CAMPOS_DE_RENGLON;
}

/** ¿Se puede escribir ESTE campo en una guía en ESTE estado? */
export function campoEditable(estado: string | null | undefined, campo: string): boolean {
  return (camposEditablesDeRenglon(estado) as readonly string[]).includes(campo);
}

/**
 * ¿La CABECERA se puede tocar? (fecha, modo de entrega, transportista, quién
 * despacha, observaciones.)
 *
 * En una guía despachada NO: nada de eso está en la lista de tres. Es lo que
 * hace que el formulario de una guía firmada muestre esos datos como texto y no
 * como campos — campos que parecen editables y no dejan escribir son peor que
 * no mostrarlos.
 */
export function cabeceraEditable(estado: string | null | undefined): boolean {
  return !guiaYaDespachada(estado);
}

/**
 * ¿Se pueden AGREGAR o QUITAR renglones? Solo antes de salir. Agregar un envío
 * a una guía que el transportista ya firmó sería inventar carga que no viajó.
 */
export function renglonesSeAgregan(estado: string | null | undefined): boolean {
  return !guiaYaDespachada(estado);
}

/**
 * Los campos que de verdad cambiaron entre lo guardado y lo que hay en
 * pantalla, filtrados por lo que el estado permite escribir.
 *
 * 🔑 Devuelve `{}` cuando no hay nada que escribir: *las escrituras que no
 * cambian nada no se hacen* (la misma regla de catálogos y de la corrección de
 * renglón). Sin esto, abrir una guía despachada y cerrarla mandaría un PATCH
 * por renglón sin que nadie tocara una tecla.
 */
export function cambiosDeRenglon(
  estado: string | null | undefined,
  guardado: Partial<Record<CampoDeRenglon, unknown>>,
  actual: Partial<Record<CampoDeRenglon, unknown>>,
): Partial<Record<CampoDeRenglon, string | number | null>> {
  const permitidos = camposEditablesDeRenglon(estado);
  const cambios: Partial<Record<CampoDeRenglon, string | number | null>> = {};
  for (const campo of permitidos) {
    if (!(campo in actual)) continue;
    if (campo === "bultos") {
      const a = Number(actual.bultos ?? 0);
      const g = Number(guardado.bultos ?? 0);
      if (a !== g) cambios.bultos = a;
      continue;
    }
    if (campo === "cliente_codigo") {
      // "" y null son el MISMO estado (línea sin atar): se guarda NULL siempre.
      const a = String(actual.cliente_codigo ?? "").trim() || null;
      const g = String(guardado.cliente_codigo ?? "").trim() || null;
      if (a !== g) cambios.cliente_codigo = a;
      continue;
    }
    const a = String(actual[campo] ?? "").trim();
    const g = String(guardado[campo] ?? "").trim();
    if (a !== g) cambios[campo] = a;
  }
  return cambios;
}

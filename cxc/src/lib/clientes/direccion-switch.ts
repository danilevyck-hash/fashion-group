// ─────────────────────────────────────────────────────────────────────────────
// LA DIRECCIÓN QUE MANDA SWITCH — se MUESTRA, y NO alimenta Guías.
//
// 🔴 LA REGLA (5-sep-2026). Switch trae una dirección por cliente
// (`switch_clientes.raw_data->>'direccion'`) para **702 de los 847** clientes
// del grupo, y hasta hoy no se guardaba en ningún lado. Se guarda y se muestra
// en la ficha, rotulada como lo que es —un dato de Switch— y **NO entra al
// módulo de Guías**: ni a los destinos definidos, ni a los botones de destino,
// ni al autollenado.
//
// 🩸 POR QUÉ, MEDIDO CONTRA LOS DESTINOS QUE DANIEL DEFINIÓ A MANO:
//
//   · **City Moda Chorrera (D-26)** — Switch dice «Chorrera». Daniel marcó como
//     «el de siempre» **Sport Corner Calidonia**, que es a donde de verdad va la
//     mercancía; «Chorrera» quedó de botón, no de autollenado. Si la dirección
//     de Switch autollenara, cada guía de ese cliente saldría con el destino
//     equivocado y habría que corregirla a mano.
//   · **Sporting Shoes (D-142)** — Switch dice «Los Andes, Panama», una línea.
//     Daniel le tiene **8 destinos definidos**, con tienda opcional. Una línea
//     no puede reemplazar a ocho.
//
// La dirección de Switch es la dirección FISCAL del cliente. El destino de una
// guía es **a dónde va ESE envío**, que es otra cosa (lo dice el invariante de
// Guías: *«La dirección de un renglón es el DESTINO del envío, no la dirección
// del cliente»*). Confundirlas es el error que este archivo existe para impedir.
//
// El candado (`clientes-direccion-no-alimenta-guias.test.ts`) barre el módulo de
// Guías entero y pone el build ROJO si alguna vez lee esta columna.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La columna donde vive. Nombrada UNA vez para que el candado la busque por
 * este mismo nombre y no por una copia a mano que se pueda desincronizar.
 *
 * ⚠️ Migración `20260930120000_clientes_master_direccion.sql` — **pendiente de
 * aplicar** (la corre Daniel). Mientras no corra, el dato llega `undefined` y
 * la ficha simplemente no muestra la línea.
 */
export const COLUMNA_DIRECCION_SWITCH = "direccion_switch";

/** Rótulo en pantalla. Dice de dónde salió, para que nadie la confunda con el
 *  destino de una guía. */
export const ROTULO_DIRECCION_SWITCH = "Dirección en Switch";

/**
 * 🔴 LOS ARCHIVOS QUE NO PUEDEN TOCARLA. Es la lista que barre el candado.
 * Guías decide sus destinos con `guias_destino_cliente`, la constante
 * `DESTINOS_DEFINIDOS` y el histórico agrupado — en ese orden y solo ese.
 */
export const GUIAS_NO_LA_TOCAN = [
  "src/lib/guias",
  "src/app/guias",
  "src/app/api/guias",
] as const;

/** Limpia lo que manda Switch: espacios de más y la cadena vacía → `null`. */
export function limpiarDireccionSwitch(cruda: unknown): string | null {
  if (typeof cruda !== "string") return null;
  const limpia = cruda.replace(/\s+/g, " ").trim();
  return limpia === "" ? null : limpia;
}

/**
 * La línea fiscal del encabezado de la ficha:
 * `D-25 · City Mall S A · RUC 1513069-1-650069 · Paso Canoas, Chiriquí`.
 *
 * Se arma con lo que HAY: cada tramo que falta no deja un « · » colgando ni un
 * «—». Un cliente sin RUC y sin provincia muestra solo su código y su razón
 * social, y eso ya es una línea correcta.
 */
export function lineaFiscal(datos: {
  codigo: string;
  razonSocial?: string | null;
  ruc?: string | null;
  direccionSwitch?: string | null;
  provincia?: string | null;
}): string {
  const lugar = [datos.direccionSwitch, datos.provincia]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
  return [
    datos.codigo,
    (datos.razonSocial ?? "").trim(),
    (datos.ruc ?? "").trim() ? `RUC ${(datos.ruc as string).trim()}` : "",
    lugar,
  ]
    .filter(Boolean)
    .join(" · ");
}

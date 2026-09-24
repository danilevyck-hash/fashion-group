// ─────────────────────────────────────────────────────────────────────────────
// EL CORREO AL PROVEEDOR — EL ASUNTO Y EL MENSAJE, EN UN SOLO LUGAR.
//
// 🔑 Por qué existe (24-sep-2026): en el celular el correo se manda desde una
// hoja corta (8b) donde el asunto y el mensaje van PLEGADOS detrás de «Ver el
// texto». Para que la hoja del teléfono y la ventana de la computadora manden
// EXACTAMENTE lo mismo, las dos leen estas dos funciones — antes el texto
// estaba escrito adentro de la ventana y copiarlo habría creado un segundo
// correo que se separa el día que alguien toque uno de los dos.
//
// 🔴 EL TEXTO NO CAMBIÓ NI UNA COMA respecto de lo que se mandaba: son las
// mismas frases de `EnviarProveedorModal`, movidas acá tal cual.
// ─────────────────────────────────────────────────────────────────────────────

/** «Reclamo FW-2026-0006 — Fashion Wear» o «Reclamos pendientes — … (11)». */
export function asuntoPorDefecto(
  count: number,
  empresa: string,
  defaultSubject?: string,
): string {
  return (
    defaultSubject ||
    (count === 1 ? `Reclamo pendiente — ${empresa}` : `Reclamos pendientes — ${empresa} (${count})`)
  );
}

/** El cuerpo de siempre. Sin contacto se saluda al «equipo», como antes. */
export function mensajePorDefecto(count: number, empresa: string, contactoNombre?: string): string {
  const nombre = (contactoNombre || "").trim() || "equipo";
  const plural = count === 1 ? "" : "s";
  return `Estimado/a ${nombre},\n\nAdjuntamos ${count} reclamo${plural} pendiente${plural} de ${empresa} con su evidencia fotográfica y el detalle en Excel. Quedamos en espera de la nota de crédito correspondiente.`;
}

/**
 * 🔴 LA HOJA DICE QUÉ VA ADJUNTO ANTES DE MANDAR (8b). Un adjunto que falta en
 * silencio es el proveedor pidiéndolo por WhatsApp dos días después.
 *
 * El Excel va SIEMPRE (lo arma el servidor). La factura y las fotos, solo si
 * existen: no se promete lo que no hay.
 */
export function loQueVaAdjunto(p: { facturas: number; fotos: number }): string {
  const piezas = ["Excel"];
  if (p.facturas > 0) piezas.push(`${p.facturas} factura${p.facturas === 1 ? "" : "s"}`);
  if (p.fotos > 0) piezas.push(`${p.fotos} foto${p.fotos === 1 ? "" : "s"}`);
  return piezas.join(" · ");
}

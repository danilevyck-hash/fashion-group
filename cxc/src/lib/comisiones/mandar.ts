// ─────────────────────────────────────────────────────────────────────────────
// 🔴 MANDARLE LA COMISIÓN AL VENDEDOR — la «9r» (25-sep-2026).
//
// 🩸 QUÉ VINO A ARREGLAR: el papel de un vendedor se BAJABA al teléfono y de
// ahí había que buscarlo en la carpeta de descargas y adjuntarlo a mano. Ahora
// «Mandar» vive en el detalle del vendedor —que es donde se está mirando lo que
// se va a mandar— y abre la MISMA hoja de tres salidas del estado de cuenta de
// Cuentas por Cobrar: **Correo · WhatsApp · Copiar el link**.
//
// 🔴 EL PDF ES EL MISMO QUE BAJA «DESCARGAR». No hay un segundo generador: la
// pantalla arma el papel con `construirPdfComision` —el de siempre— y manda sus
// BYTES. Si el papel cambia, cambia el que se manda, sin tocar este archivo.
//
// 🔑 EL CORREO PIDE LA DIRECCIÓN. El sistema no guarda el correo de ningún
// vendedor: `comision_vendedor_tasa` y `comision_vendedor_alias` solo tienen el
// nombre. Inventar una dirección sería peor que preguntarla.
//
// ⚠️ EL LINK NECESITA UN CAJÓN EN STORAGE. Cuentas por Cobrar **no tiene** link
// firmado —copia el texto del mensaje y adjunta el PDF al correo—, así que este
// mecanismo es nuevo y sigue el patrón de los ZIP de Marketing: subir el
// archivo a un cajón PRIVADO y firmar la dirección por **30 días**
// (`firmarPath` + `createSignedUrl`). El cajón es `comisiones-papeles` y se
// crea UNA vez; mientras no exista, la ruta contesta que no se pudo y las dos
// salidas que dependen del link se apagan **diciendo por qué** — nunca se manda
// un link roto.
// ─────────────────────────────────────────────────────────────────────────────

/** El cajón privado donde vive el papel de una comisión mientras dura el link. */
export const CAJON_PAPELES = "comisiones-papeles";

/** 30 días, el mismo plazo que los ZIP de Marketing. */
export const DIAS_DEL_LINK = 30;
export const TTL_LINK_SEGUNDOS = 60 * 60 * 24 * DIAS_DEL_LINK;

/** El remitente. El mismo de las alertas y los reportes del sistema. */
export const REMITENTE_COMISIONES = "Fashion Group <notificaciones@fashiongr.com>";

/** Dónde se guarda el papel: por año, mes y vendedor, con la marca de tiempo. */
export function pathDelPapel(
  year: number,
  mes: number,
  vendedor: string,
  empresa: string,
  ahoraIso: string,
): string {
  const limpio = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
  const sello = ahoraIso.replace(/[^0-9]/g, "").slice(0, 14);
  return `${year}/${String(mes).padStart(2, "0")}/${limpio(empresa)}-${limpio(vendedor)}-${sello}.pdf`;
}

/** El asunto del correo. Sin jerga: dice el mes y de quién es. */
export function asuntoDelCorreo(vendedor: string, periodo: string): string {
  return `Tu comisión de ${periodo} — ${vendedor}`;
}

/** El cuerpo del correo, en texto simple. */
export function cuerpoDelCorreo(vendedor: string, periodo: string): string {
  return [
    `Hola ${vendedor},`,
    "",
    `Te va el detalle de tu comisión de ${periodo}, en el archivo adjunto.`,
    "",
    "Cualquier cosa, respóndele a este correo.",
    "",
    "Fashion Group",
  ].join("\n");
}

/** El mensaje de WhatsApp. Lleva el link, que caduca a los 30 días. */
export function mensajeDeWhatsApp(vendedor: string, periodo: string, link: string): string {
  return `Hola ${vendedor}, aquí está tu comisión de ${periodo}: ${link}\n\nEl enlace vence en ${DIAS_DEL_LINK} días.`;
}

/** Lo que se dice cuando el cajón todavía no existe. Sin códigos ni jerga. */
export const SIN_CAJON =
  "Todavía no se puede armar el enlace. Manda el papel por correo, que va adjunto.";

/** Lo que se dice cuando el correo salió. */
export const CORREO_ENVIADO = "Listo, el correo salió";
/** Y cuando el link quedó copiado. */
export const LINK_COPIADO = `Listo, enlace copiado — vence en ${DIAS_DEL_LINK} días`;

// ─────────────────────────────────────────────────────────────────────────────
// LAS FIRMAS DE UNA GUÍA YA DESPACHADA: UNA LÍNEA, NO MEDIA PANTALLA
// (5-sep-2026).
//
// 🩸 Al abrir una guía firmada se dibujaban los DOS cuadros de firma a tamaño
// completo, uno al lado del otro. En un iPhone de 390 px caen apilados y se
// llevan media pantalla para decir algo que casi siempre es lo mismo: que está
// firmada. Medido sobre las 221 guías despachadas vivas (5-sep-2026): **156
// tienen las dos firmas y 65 no tienen ninguna** — de esas 65, todas anteriores
// al 10-ago, ya lo dice la marca ámbar «Salió incompleta».
//
// 🔴 AL FIRMAR NO CAMBIA NADA. Esto es SOLO para MIRAR una guía ya firmada. El
// cuadro de `SignatureCanvas` del despacho sigue midiendo 150 px de alto y todo
// el ancho, uno debajo del otro — Daniel preguntó expresamente por eso. Este
// módulo no lo conoce, y `DespachoForm` no lo importa.
//
// 🔴 Y NO MIENTE: si falta una firma, la línea dice CUÁL falta. Si no hay
// ninguna, no dice nada — es exactamente lo que se ve hoy en esas 65, y estrenar
// ahí un «Sin firmas» sería agregar un cartel a guías que ya están marcadas.
//
// Las firmas siguen saliendo ENTERAS en el papel, el PDF y la imagen: este
// módulo no lo toca ninguno de los tres.
// ─────────────────────────────────────────────────────────────────────────────

export interface GuiaConFirmas {
  firma_base64?: string | null;
  firma_entregador_base64?: string | null;
}

export interface ResumenDeFirmas {
  /** Las dos están. */
  completas: boolean;
  /** Hay al menos una que mostrar. En `false` no se dibuja nada. */
  hayAlguna: boolean;
  /** Lo que dice la línea plegada. Vacío cuando no hay ninguna. */
  texto: string;
}

const hay = (v: string | null | undefined) => String(v ?? "").trim() !== "";

/**
 * Cómo se llama cada firma. En entrega directa el camión es nuestro: firma el
 * CHOFER y firma el CLIENTE. Con transportista externo, el TRANSPORTISTA y el
 * ENTREGADOR. Los cuatro rótulos vivían escritos a mano en tres pantallas.
 */
export function etiquetaFirmaTransportista(directa: boolean): string {
  return directa ? "Firma del chofer" : "Firma del transportista";
}

export function etiquetaFirmaEntregador(directa: boolean): string {
  return directa ? "Firma del cliente" : "Firma del entregador";
}

/** Quién falta, en minúscula, para meterlo en la frase «Falta la firma del …». */
function quien(etiqueta: string): string {
  return etiqueta.replace(/^Firma del /, "");
}

export function resumenDeFirmas(g: GuiaConFirmas, directa: boolean): ResumenDeFirmas {
  const t = hay(g.firma_base64);
  const e = hay(g.firma_entregador_base64);
  if (t && e) return { completas: true, hayAlguna: true, texto: "✓ Firmada por las dos partes" };
  if (t) return { completas: false, hayAlguna: true, texto: `Falta la firma del ${quien(etiquetaFirmaEntregador(directa))}` };
  if (e) return { completas: false, hayAlguna: true, texto: `Falta la firma del ${quien(etiquetaFirmaTransportista(directa))}` };
  return { completas: false, hayAlguna: false, texto: "" };
}

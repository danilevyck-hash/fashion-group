// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS — QUÉ ADJUNTOS VIAJAN EN EL CORREO AL PROVEEDOR (11-sep-2026).
//
// Daniel, textual: *«la factura y la foto del reclamo que sale por correo en el
// excel, sale por medio de un link… se puede adjuntar directo al correo y
// quitarlo del excel? Va»*.
//
// Hasta hoy el correo llevaba UN archivo —el Excel— con dos links adentro: la
// factura firmada (1 año) y la galería pública por token. El proveedor tenía
// que abrir el Excel, tocar un link y esperar al navegador. Ahora la factura en
// PDF y las fotos viajan ADJUNTAS, y el Excel deja de citar links.
//
// 🔴 EL TOPE NO ES EL DEL ARCHIVO, ES EL DEL CORREO YA CODIFICADO. Resend
// acepta 40 MB por correo, pero un adjunto viaja en base64 y base64 crece 4/3.
// Por eso el presupuesto de bytes CRUDOS es 3/4 del tope: pasarse de ahí es un
// correo que Resend rechaza entero — y con él se caen los adjuntos Y el Excel.
//
// 🔴 LO QUE NO CABE SE DICE, NO SE ESCONDE. Si un correo se pasa del tope se
// manda lo que quepa —la factura antes que las fotos, porque es el papel que
// respalda el reclamo— y el cuerpo dice cuántas fotos quedaron fuera. Un
// proveedor que no sabe que faltan fotos no las pide.
//
// Módulo PURO: nombres de archivo, reparto y textos. Ni Supabase ni sharp.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que Resend acepta por correo, ya codificado. */
export const TOPE_RESEND_BYTES = 40 * 1024 * 1024;

/**
 * Presupuesto en bytes CRUDOS. base64 crece 4/3, así que el crudo que cabe es
 * 3/4 del tope. Se derivan uno del otro a propósito: escribir «30 MB» a mano al
 * lado de «40 MB» es cómo se llega a un correo rechazado el día que cambie el
 * tope del proveedor.
 */
export const TOPE_CRUDO_BYTES = Math.floor((TOPE_RESEND_BYTES * 3) / 4);

/** Lado mayor de una foto adjunta, en px (mismo valor que el ZIP de Marketing). */
export const MAX_DIM = 1600;
/** Calidad JPEG de una foto adjunta. */
export const JPEG_QUALITY = 80;

export type ClaseAdjunto = "excel" | "factura" | "foto";

export interface CandidatoAdjunto {
  /** Nombre del archivo tal como lo ve el proveedor. */
  nombre: string;
  clase: ClaseAdjunto;
  /** N° de reclamo del que viene (vacío para el Excel, que es de todos). */
  nroReclamo: string;
  contenido: Buffer;
}

export interface RepartoAdjuntos {
  incluidos: CandidatoAdjunto[];
  omitidos: CandidatoAdjunto[];
}

/** Limpia un N° de reclamo para usarlo como nombre de archivo. */
export function nombreSeguro(nro: string | null | undefined): string {
  const limpio = String(nro ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return limpio || "Reclamo";
}

/** `REC-2026-0026-factura.pdf` */
export function nombreFactura(nroReclamo: string | null | undefined): string {
  return `${nombreSeguro(nroReclamo)}-factura.pdf`;
}

/** `REC-2026-0026-foto-1.jpg` — el índice es 1-based, en el orden de la ficha. */
export function nombreFoto(nroReclamo: string | null | undefined, indice: number, ext = "jpg"): string {
  const limpia = String(ext || "jpg").replace(/^\./, "").toLowerCase() || "jpg";
  return `${nombreSeguro(nroReclamo)}-foto-${indice}.${limpia}`;
}

/** La extensión de un path de storage (sin punto, minúscula). `jpg` si no tiene. */
export function extensionDe(path: string | null | undefined): string {
  const m = String(path ?? "").match(/\.([A-Za-z0-9]{1,5})$/);
  return m ? m[1].toLowerCase() : "jpg";
}

/**
 * Orden en que se PRUEBA meter cada adjunto: el Excel primero (es el
 * documento), después las facturas en el orden de los reclamos, y al final las
 * fotos de la más liviana a la más pesada — así entran más fotos, no menos.
 * `sort` es estable: dentro de cada clase el orden de llegada se conserva.
 */
export function ordenDeAdjuntos(candidatos: readonly CandidatoAdjunto[]): CandidatoAdjunto[] {
  const peso: Record<ClaseAdjunto, number> = { excel: 0, factura: 1, foto: 2 };
  return candidatos
    .slice()
    .sort((a, b) => {
      if (peso[a.clase] !== peso[b.clase]) return peso[a.clase] - peso[b.clase];
      if (a.clase !== "foto") return 0;
      return a.contenido.length - b.contenido.length;
    });
}

/**
 * Reparte los adjuntos dentro del presupuesto. Greedy sobre `ordenDeAdjuntos`:
 * lo que no cabe se salta y se sigue probando con los que vienen — un PDF
 * enorme no puede dejar fuera a diez fotos que sí entraban.
 */
export function repartirAdjuntos(
  candidatos: readonly CandidatoAdjunto[],
  tope: number = TOPE_CRUDO_BYTES,
): RepartoAdjuntos {
  const incluidos: CandidatoAdjunto[] = [];
  const omitidos: CandidatoAdjunto[] = [];
  let usado = 0;
  for (const c of ordenDeAdjuntos(candidatos)) {
    if (usado + c.contenido.length <= tope) {
      incluidos.push(c);
      usado += c.contenido.length;
    } else {
      omitidos.push(c);
    }
  }
  return { incluidos, omitidos };
}

/** Cuántos de cada clase quedaron dentro. */
export function contarPorClase(adjuntos: readonly CandidatoAdjunto[]): Record<ClaseAdjunto, number> {
  const cuenta: Record<ClaseAdjunto, number> = { excel: 0, factura: 0, foto: 0 };
  for (const a of adjuntos) cuenta[a.clase] += 1;
  return cuenta;
}

/**
 * Lo que dice el cuerpo del correo sobre lo que NO cupo. Cadena vacía si cupo
 * todo: no se escribe un renglón para decir que no pasó nada.
 */
export function avisoDeOmitidos(omitidos: readonly CandidatoAdjunto[]): string {
  if (omitidos.length === 0) return "";
  const c = contarPorClase(omitidos);
  const partes: string[] = [];
  if (c.factura > 0) partes.push(`${c.factura} factura${c.factura === 1 ? "" : "s"}`);
  if (c.foto > 0) partes.push(`${c.foto} foto${c.foto === 1 ? "" : "s"}`);
  if (partes.length === 0) return "";
  const lista = partes.join(" y ");
  return `${lista} no cupieron en el correo; pídelas si las necesitas.`;
}

/**
 * Lo que dice el cuerpo del correo sobre lo que SÍ viaja. Texto PLANO: lo
 * escapa quien arma el HTML. Un helper que devuelve etiquetas es cómo un
 * nombre de archivo termina inyectando marcado en el correo del proveedor.
 */
export function avisoDeAdjuntos(incluidos: readonly CandidatoAdjunto[], nombreExcel: string): string {
  const c = contarPorClase(incluidos);
  const partes = [`el Excel ${nombreExcel}`];
  if (c.factura > 0) partes.push(`${c.factura} factura${c.factura === 1 ? "" : "s"} en PDF`);
  if (c.foto > 0) partes.push(`${c.foto} foto${c.foto === 1 ? "" : "s"}`);
  if (partes.length === 1) return `Adjunto encontrará ${partes[0]}.`;
  const ultima = partes.pop() as string;
  return `Adjunto encontrará ${partes.join(", ")} y ${ultima}.`;
}

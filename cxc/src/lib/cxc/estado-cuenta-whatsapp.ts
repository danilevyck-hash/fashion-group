// ─────────────────────────────────────────────────────────────────────────────
// ESTADOS DE CUENTA POR WHATSAPP (27-nov-2026, Daniel aprobó el mockup).
//
// Los clientes con saldo y SIN correo: el lunes el cron `estado-cuenta-semanal`
// imprime sus PDF de Switch con el MISMO candado al centavo y los guarda en el
// bucket privado `estados-cuenta` (columna `pdfs` de la fila 'sin_correo'). En
// Cuentas por cobrar la secretaria los manda uno por uno: en el teléfono abre la
// hoja de compartir con el texto + los PDF y ELLA elige el chat («ella todo lo
// tiene, en los sistemas no están bien cargados ni correos ni teléfonos»); en la
// computadora se descargan y se abre WhatsApp Web con el texto. Queda anotado
// quién y cuándo (`whatsapp_por` · `whatsapp_en`), con «Deshacer» de 5 s.
//
// 🔴 Solo admin y secretaria. Boston no entra: el envío es de las 6 del grupo.
// Lo PURO vive aquí; el I/O en el cron y en `/api/cxc/whatsapp`.
// ─────────────────────────────────────────────────────────────────────────────

/** Interruptor. `false` = el lunes no se imprimen los sin correo y la fila no se dibuja. */
export const ESTADO_CUENTA_WHATSAPP_2026_11 = true;

export const BUCKET_ESTADOS_CUENTA = "estados-cuenta";

/** Quién ve la fila y manda. Ni vendedor ni la gerencia de Boston. */
export const ROLES_WHATSAPP = ["admin", "secretaria"] as const;

export function puedeMandarPorWhatsApp(role: string | null | undefined): boolean {
  return typeof role === "string" && (ROLES_WHATSAPP as readonly string[]).includes(role);
}

/** Un PDF guardado de la semana. */
export interface PdfGuardado {
  empresa: string;
  nombreEmpresa: string;
  total: number;
  /** Ruta dentro del bucket. */
  path: string;
  /** Nombre del archivo que ve el cliente. */
  archivo: string;
}

/** «2026-11-30/D-170/fashion_wear.pdf». El código se limpia para que sea una ruta segura. */
export function rutaDelPdf(semana: string, codigo: string, empresa: string): string {
  const limpio = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_");
  return `${semana}/${limpio(codigo)}/${limpio(empresa)}.pdf`;
}

const dinero = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** El texto que acompaña los PDF: el cuadro de saldos por empresa y el total. */
export function textoWhatsApp(pdfs: readonly Pick<PdfGuardado, "nombreEmpresa" | "total">[], fechaLegible: string): string {
  const total = Math.round(pdfs.reduce((s, p) => s + p.total, 0) * 100) / 100;
  return [
    "Buen día,",
    "",
    `Le compartimos sus estados de cuenta al ${fechaLegible}:`,
    "",
    ...pdfs.map((p) => `• ${p.nombreEmpresa}: ${dinero(p.total)}`),
    ...(pdfs.length > 1 ? [`*Total: ${dinero(total)}*`] : []),
    "",
    "Favor confirmar su programación de pagos.",
    "",
    "Departamento de Cobros · Fashion Group",
  ].join("\n");
}

/** WhatsApp Web con el texto puesto; el chat lo elige quien manda. */
export function enlaceWhatsAppWeb(texto: string): string {
  return `https://web.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
}

/** «30 nov» → la fecha de la semana para el rótulo «Semana del 30 nov». */
export function rotuloSemana(semanaISO: string): string {
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const [, m, d] = semanaISO.split("-").map(Number);
  return `${d} ${meses[m - 1]}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EL CORREO DE COBRO DE CONFECCIONES BOSTON — LO FIRMA BOSTON (9-sep-2026).
//
// Daniel, textual, al prender el correo de esta cartera: *«Firma Confecciones
// Boston»*.
//
// 🩸 POR QUÉ NO SE REUSA EL ARMADOR DEL GRUPO. `estado-cuenta-email.ts` no es
// neutro: su membrete dice «FASHION GROUP» en la banda negra, su firma cierra
// con «Fashion Group Panamá» y su pie dice «generado desde fashiongr.com». Un
// parámetro «quién firma» encima de ese armador arregla hoy y deja el defecto
// para mañana — el día que alguien no lo pase, un cliente de Boston recibe un
// cobro a nombre de una empresa que no le vendió nada. Acá el armador es de
// Boston y NO PUEDE decir Fashion Group: no tiene dónde escribirlo.
//
// ⚠️ Lo que SÍ se comparte son las piezas que no dicen de quién es la plata
// —escapar HTML, formatear dinero, el nombre del mes—: repetirlas sería tener
// dos formas de escribir «$1,234.00».
//
// ⚠️ LA PALABRA «VENCIDO» ESTÁ PROHIBIDA en lo que lee el cliente: `dias` es la
// EDAD del documento desde su emisión, NO días de mora. Los tramos se rotulan
// por su RANGO, con la MISMA lista (`cxc-aging`) que rotula la pantalla y el
// papel.
// ─────────────────────────────────────────────────────────────────────────────

import { AGING_ORDER, tramoRango } from "@/lib/cxc-aging";
import { CASA_BOSTON } from "@/lib/cxc/casa-del-papel";
import { escapeHtml, money, mesLabel } from "@/lib/cxc/estado-cuenta-email";
import { tramosDelPapel } from "@/lib/cxc/estado-cuenta-switch";

/** Lo mínimo que este módulo mira de un documento. */
export interface DocDeBoston {
  debito: number;
  credito: number;
  dias: number | null;
}

const TH = "padding:6px 8px;font-size:11px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;background:#f9fafb";
const TD = "padding:6px 8px;font-size:12px;color:#111827;border-bottom:1px solid #f3f4f6";

function nl2br(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br>");
}

/**
 * El resumen del cuerpo: los TRES tramos y el total.
 *
 * Boston es UNA sola compañía, así que no hay columna «Empresa» —sería una
 * columna con el mismo valor en todas las filas—. Los tramos son los mismos
 * tres de su pestaña y del papel adjunto, con los mismos cortes.
 */
export function resumenBoston(docs: DocDeBoston[], cliente: string): string {
  const t = tramosDelPapel(docs);
  const valores: Record<string, number> = { current: t.current, watch: t.watch, overdue: t.overdue };
  const total = Math.round((t.current + t.watch + t.overdue) * 100) / 100;

  const filas = AGING_ORDER.map(
    (k) => `<tr>
        <td style="${TD}">${escapeHtml(tramoRango(k))}</td>
        <td style="${TD};text-align:right;font-variant-numeric:tabular-nums">${money(valores[k] ?? 0)}</td>
      </tr>`,
  ).join("");

  return `
  <div style="margin:0 0 18px">
    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#111827">${escapeHtml(cliente)}</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">
      <thead>
        <tr>
          <th style="${TH};text-align:left">Antigüedad</th>
          <th style="${TH};text-align:right">Saldo</th>
        </tr>
      </thead>
      <tbody>
        ${filas}
        <tr>
          <td style="${TD};font-weight:700">Total</td>
          <td style="${TD};text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${money(total)}</td>
        </tr>
      </tbody>
    </table>
    <p style="margin:8px 0 0;font-size:12px;color:#6b7280">
      El detalle de cada documento está en el estado de cuenta adjunto.
    </p>
  </div>`;
}

/** «Confecciones Boston — Estado de cuenta Septiembre 2026». */
export function asuntoBoston(mes: string): string {
  return `${CASA_BOSTON.nombre} — Estado de cuenta ${mes}`;
}

/**
 * El cuerpo editable por defecto. Saluda por el nombre del CONTACTO cuando hay
 * uno; sin contacto, saludo genérico — nunca se saluda con la razón social, que
 * es lo que dice la factura y no cómo se llama la persona.
 */
export function cuerpoBoston(mes: string, contacto?: string | null): string {
  const nombre = (contacto ?? "").trim();
  return [
    nombre ? `Buen día ${nombre},` : "Buen día,",
    "",
    "Espero se encuentren bien.",
    "",
    `Adjunto encontrarán su estado de cuenta con ${CASA_BOSTON.nombre} al cierre del mes de ${mes}.`,
    "",
    "Favor confirmar su programación de pagos.",
  ].join("\n");
}

/** Firma: quien manda, y debajo la casa que cobra. */
export function firmaBoston(nombreCompleto: string): string {
  return `${(nombreCompleto || "").trim() || CASA_BOSTON.nombre}\n${CASA_BOSTON.firma}`;
}

/** El HTML completo del correo. El membrete y el pie son los de Boston. */
export function composeCorreoBoston(opts: { cuerpo: string; resumenHtml: string; firma: string }): string {
  const { cuerpo, resumenHtml, firma } = opts;
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:0 auto;color:#111827">
    <div style="background:#111827;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
      <h2 style="margin:0;font-size:18px;letter-spacing:0.02em">${escapeHtml(CASA_BOSTON.membrete)}</h2>
      <p style="margin:4px 0 0;font-size:12px;opacity:0.75">Departamento de Cobros · Panamá</p>
    </div>
    <div style="padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
      <p style="font-size:13px;line-height:1.6;margin:0 0 18px">${nl2br(cuerpo)}</p>
      ${resumenHtml}
      <p style="font-size:13px;line-height:1.6;margin:18px 0 0">Quedamos atentos a sus comentarios.</p>
      <p style="font-size:13px;line-height:1.6;margin:12px 0 0">Saludos,<br>${nl2br(firma)}</p>
    </div>
  </div>`;
}

/** El mes en palabras, el mismo que usa el correo del grupo. */
export { mesLabel };

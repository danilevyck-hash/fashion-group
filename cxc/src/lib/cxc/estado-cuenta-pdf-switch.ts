// ─────────────────────────────────────────────────────────────────────────────
// EL PDF DE SWITCH EN EL CORREO DE LOS LUNES (27-nov-2026, Daniel: «te dije que
// era de switch que quiero el pdf, no uno regenerado por ti»). Módulo PURO.
//
// El camino (I/O en `estado-cuenta-pdf-switch-io.ts`), el mismo que hace Daniel:
//   1. En el panel de Switch: la ficha del cliente → «Pendientes» → «Imprimir»
//      (`leerEstadoCuentaParaImprimir` en `switch-api/web-client.ts`).
//   2. Ese papel se guarda a PDF con Chromium sin cabeza, sin tocarle nada.
//   3. UN correo por cliente desde info@ por Resend, con un PDF por empresa.
//
// 🔴 EL CANDADO, antes de mandar (`veredictoDelPapel`): en CADA empresa, el
//   · «Código:» impreso tiene que ser el del cliente (igualdad exacta);
//   · «Total General» tiene que ser, AL CENTAVO, el saldo que Switch da en ese
//     momento por su API (`/apicliente/estadocuenta` › `saldoTotal`);
//   · y el papel tiene que traer los MISMOS documentos que esa respuesta
//     (si salió la historia completa en vez de los pendientes, no cuadra).
//   Si una empresa no cuadra, ese cliente NO se manda: queda 'error' y va en el
//   resumen del Telegram privado.
// ─────────────────────────────────────────────────────────────────────────────

import { escapeHtml, money, sanitizeFilenamePart } from "@/lib/cxc/estado-cuenta-email";

/** La prueba (`?prueba=<código>`) va SOLO aquí, nunca al cliente. */
export const DESTINO_PRUEBA = "daniel@fashiongr.com";

export interface FilaIdSwitch {
  cliente_switch_id: number | null;
  ausente_desde: string | null;
}

/** El id de Switch de un (cliente, empresa): el único presente. Dos o ninguno = `null`. */
export function elegirIdSwitch(filas: readonly FilaIdSwitch[]): number | null {
  const conId = filas.filter((f) => f.cliente_switch_id != null);
  const presentes = conId.filter((f) => !f.ausente_desde);
  const candidatos = presentes.length ? presentes : conId;
  return candidatos.length === 1 ? Number(candidatos[0].cliente_switch_id) : null;
}

export interface LecturaDelPapel {
  codigo: string | null;
  /** «Total General»; `null` si no se pudo leer. */
  total: number | null;
  /** Renglones de documento (los que empiezan con una fecha). */
  documentos: number;
}

/** Lo que dice de sí mismo el papel que imprime Switch (su HTML de «Imprimir»). */
export function leerPapelSwitch(html: string): LecturaDelPapel {
  const codigo = html.match(/C(?:&oacute;|ó)digo:\s*<\/span>\s*([^<]*?)\s*<\/td>/i)?.[1]?.trim() || null;
  const t = html.match(/Total General:\s*<\/span>\s*(-?[\d,]+(?:\.\d+)?)\s*</i)?.[1];
  const documentos = (html.match(/<tr>\s*<td[^>]*class="rowBody">\d\d-\d\d-\d{4}<\/td>/g) ?? []).length;
  return { codigo, total: t ? Number(t.replace(/,/g, "")) : null, documentos };
}

/** Lo que Switch dice por su API en el mismo momento. */
export interface SaldoDeSwitch {
  saldo: number | null;
  documentos: number | null;
}

export type Veredicto = { ok: true; total: number } | { ok: false; motivo: string };

const centavos = (n: number) => Math.round(n * 100);

/** 🔴 El candado: ¿este papel se puede mandar como el estado de cuenta de `codigo`? */
export function veredictoDelPapel(papel: LecturaDelPapel, codigo: string, switchDice: SaldoDeSwitch): Veredicto {
  if (!papel.codigo || papel.codigo.toUpperCase() !== codigo.trim().toUpperCase()) {
    return { ok: false, motivo: `el papel dice código ${papel.codigo ?? "ilegible"}, no ${codigo}` };
  }
  if (papel.total == null) return { ok: false, motivo: "no se pudo leer el total del papel" };
  if (switchDice.saldo == null) return { ok: false, motivo: "Switch no dio el saldo para comprobar" };
  if (centavos(papel.total) !== centavos(switchDice.saldo)) {
    return { ok: false, motivo: `el papel suma ${money(papel.total)} y Switch dice ${money(switchDice.saldo)}` };
  }
  if (switchDice.documentos != null && papel.documentos !== switchDice.documentos) {
    return { ok: false, motivo: `el papel trae ${papel.documentos} documentos y Switch tiene ${switchDice.documentos} pendientes` };
  }
  return { ok: true, total: papel.total };
}

/** El cuadrito del correo: cada empresa con el «Total General» de SU PDF, y la suma. */
export function resumenPdfsHtml(filas: readonly { empresa: string; total: number }[]): string {
  const td = "padding:4px 16px 4px 0;font-size:14px";
  const num = "padding:4px 0;font-size:14px;text-align:right;font-variant-numeric:tabular-nums";
  const total = Math.round(filas.reduce((s, f) => s + f.total, 0) * 100) / 100;
  const rows = filas.map((f) => `<tr><td style="${td}">${escapeHtml(f.empresa)}</td><td style="${num}">${money(f.total)}</td></tr>`).join("");
  return `<table style="border-collapse:collapse;margin:8px 0 16px">${rows}<tr><td style="${td};border-top:1px solid #d1d5db"><b>Total</b></td><td style="${num};border-top:1px solid #d1d5db"><b>${money(total)}</b></td></tr></table>`;
}

/** Nombre del archivo que ve el cliente; el contenido es el papel de Switch. */
export function nombreDelPdf(empresa: string, cliente: string, fechaDDMMAAAA: string): string {
  return `${sanitizeFilenamePart(`Estado de cuenta ${empresa} - ${cliente} - ${fechaDDMMAAAA}`)}.pdf`;
}

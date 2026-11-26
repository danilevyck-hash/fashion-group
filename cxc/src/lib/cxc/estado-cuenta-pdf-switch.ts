// ─────────────────────────────────────────────────────────────────────────────
// EL PDF DE SWITCH, INTACTO, EN EL CORREO DE LOS LUNES (26-nov-2026, Daniel:
// «te dije que era de switch que quiero el pdf, no uno regenerado por ti»).
// Módulo PURO: cómo se reconoce cada correo de Switch y qué dice su PDF.
//
// El camino (I/O en `estado-cuenta-pdf-switch-io.ts`):
//   1. El botón «Email» del panel de Switch (GET `/clientes/enviarestadodecuenta`,
//      solo pendiente) manda el PDF a `BUZON_INTERMEDIO` desde noreply@switch-soft.com.
//   2. El sistema lo lee por Microsoft Graph (Mail.Read) y lo reenvía al cliente
//      desde info@ por Resend, UN correo con todos sus PDF. El PDF no se toca:
//      solo cambia el NOMBRE del archivo.
//
// 🔴 Cómo se sabe de quién es cada correo, sin adivinar:
//   · la EMPRESA sale del asunto: «<NOMBRE LEGAL> le ha enviado el estado de
//     cuenta solicitado» (el nombre legal es el de `empresa-fiscal.ts`);
//   · el CLIENTE sale del adjunto: «<id de Switch>_<MMDDhhmmss>.pdf»;
//   · y antes de mandar, el «Código:» IMPRESO en el PDF tiene que ser el del
//     cliente. Si no lo es, o no se puede leer, ese cliente NO se manda.
// ─────────────────────────────────────────────────────────────────────────────

import { inflateSync } from "node:zlib";
import { fichaFiscal } from "@/lib/cxc/empresa-fiscal";
import { escapeHtml, money, sanitizeFilenamePart } from "@/lib/cxc/estado-cuenta-email";

/** El buzón intermedio si no se configura otro. */
export const BUZON_POR_DEFECTO = "info@fashiongr.com";

/**
 * El buzón al que Switch manda el PDF (y que el sistema lee por Graph). Su
 * dirección se IMPRIME en el PDF («Email:»), así que el cliente la ve.
 * Se cambia sin código con la variable `ESTADO_CUENTA_BUZON` en Vercel
 * (p. ej. un buzón compartido estadosdecuenta@fashiongr.com). Solo vale un
 * buzón de @fashiongr.com y NUNCA el de una persona como daniel@: cualquier
 * otro valor cae al de por defecto.
 */
export function buzonIntermedio(valor: string | undefined = process.env.ESTADO_CUENTA_BUZON): string {
  const v = (valor ?? "").trim().toLowerCase();
  return /^[a-z0-9._-]+@fashiongr\.com$/.test(v) && !v.startsWith("daniel@") ? v : BUZON_POR_DEFECTO;
}

export const BUZON_INTERMEDIO = buzonIntermedio();
export const REMITENTE_SWITCH = "noreply@switch-soft.com";
/** A dónde va el correo del modo prueba (`?prueba=<código>`). */
export const DESTINO_PRUEBA = "daniel@fashiongr.com";

const COLA_DEL_ASUNTO = " le ha enviado el estado de cuenta solicitado";

/** La empresa de un correo de Switch, por su asunto. `null` = no es de las pedidas. */
export function empresaDelAsunto(asunto: string, empresas: readonly string[]): string | null {
  const a = asunto.trim().toUpperCase();
  for (const key of empresas) {
    const legal = fichaFiscal(key, "").legal.trim().toUpperCase();
    if (legal && a === `${legal}${COLA_DEL_ASUNTO}`.toUpperCase()) return key;
  }
  return null;
}

/** El id de Switch del cliente, por el nombre del adjunto («13_1126171058.pdf»). */
export function idDelAdjunto(nombre: string): number | null {
  const m = nombre.trim().match(/^(\d+)_\d+\.pdf$/i);
  return m ? Number(m[1]) : null;
}

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

/** Los textos del PDF (dompdf: `[(texto)] TJ` dentro de streams deflate), en orden. */
export function textosDelPdf(bytes: Uint8Array): string[] {
  const buf = Buffer.from(bytes);
  const s = buf.toString("latin1");
  const textos: string[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const inicio = m.index + m[0].length;
    const fin = s.indexOf("endstream", inicio);
    if (fin < 0) break;
    let plano: string;
    try {
      plano = inflateSync(buf.subarray(inicio, fin)).toString("latin1");
    } catch {
      continue; // imagen u otro stream que no es texto
    }
    for (const t of plano.matchAll(/\[\(((?:[^()\\]|\\.)*)\)\]\s*TJ/g)) {
      textos.push(t[1].replace(/\\(.)/g, "$1"));
    }
  }
  return textos;
}

export interface LecturaPdf {
  codigo: string | null;
  /** «Total General» del papel; `null` si no se pudo leer. */
  total: number | null;
}

/** Lo que el PDF de Switch dice de sí mismo: el código del cliente y el total. */
export function leerPdfSwitch(bytes: Uint8Array): LecturaPdf {
  const t = textosDelPdf(bytes);
  const despuesDe = (prefijo: string) => {
    const i = t.findIndex((x) => x.trim().startsWith(prefijo));
    return i >= 0 && i + 1 < t.length ? t[i + 1].trim() : null;
  };
  const codigo = despuesDe("Código:");
  const totalTxt = despuesDe("Total General:");
  const total = totalTxt != null && /^-?[\d,]+(\.\d+)?$/.test(totalTxt) ? Number(totalTxt.replace(/,/g, "")) : null;
  return { codigo: codigo || null, total };
}

/** ¿El PDF es de este cliente? Igualdad EXACTA del código, nunca por parecido. */
export function pdfEsDelCliente(lectura: LecturaPdf, codigo: string): boolean {
  return !!lectura.codigo && lectura.codigo.trim().toUpperCase() === codigo.trim().toUpperCase();
}

/** El cuadrito del correo: cada empresa con el «Total General» de SU PDF, y la suma. */
export function resumenPdfsHtml(filas: readonly { empresa: string; total: number }[]): string {
  const td = "padding:4px 16px 4px 0;font-size:14px";
  const num = "padding:4px 0;font-size:14px;text-align:right;font-variant-numeric:tabular-nums";
  const total = Math.round(filas.reduce((s, f) => s + f.total, 0) * 100) / 100;
  const rows = filas.map((f) => `<tr><td style="${td}">${escapeHtml(f.empresa)}</td><td style="${num}">${money(f.total)}</td></tr>`).join("");
  return `<table style="border-collapse:collapse;margin:8px 0 16px">${rows}<tr><td style="${td};border-top:1px solid #d1d5db"><b>Total</b></td><td style="${num};border-top:1px solid #d1d5db"><b>${money(total)}</b></td></tr></table>`;
}

/** Nombre del archivo que ve el cliente; el contenido es el de Switch, sin tocar. */
export function nombreDelPdf(empresa: string, cliente: string, fechaDDMMAAAA: string): string {
  return `${sanitizeFilenamePart(`Estado de cuenta ${empresa} - ${cliente} - ${fechaDDMMAAAA}`)}.pdf`;
}

/** Desde cuándo vale un PDF para la semana: el lunes 00:00 de Panamá (05:00 UTC). */
export function inicioDeLaSemanaUtc(semana: string): string {
  return `${semana}T05:00:00Z`;
}

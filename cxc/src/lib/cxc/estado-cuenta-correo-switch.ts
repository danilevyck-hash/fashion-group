// El correo de UN cliente con sus PDF de Switch (27-nov-2026). Lo usan el envío
// de los lunes (`/api/cron/estado-cuenta-semanal`) y la prueba
// (`/api/cron/estado-cuenta-switch?prueba=<código>`). No toca Switch: los PDF ya
// están en el buzón intermedio.
//
// 🔴 Antes de mandar, el «Código:» impreso en CADA PDF tiene que ser el del
// cliente. Si falta un PDF, no se lee o no es suyo, lanza y NO sale nada.

import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { buildCuentasHtml, buildFirma, composeEmailHtml, escapeHtml } from "@/lib/cxc/estado-cuenta-email";
import { contactoDelCliente } from "@/lib/cxc/correo-del-cliente";
import {
  FIRMA_AUTOMATICO,
  REMITENTE_AUTOMATICO,
  RESPONDER_A_AUTOMATICO,
  asuntoAutomatico,
  cuerpoAutomatico,
} from "@/lib/cxc/estado-cuenta-automatico";
import { DESTINO_PRUEBA, leerPdfSwitch, nombreDelPdf, pdfEsDelCliente, resumenPdfsHtml } from "@/lib/cxc/estado-cuenta-pdf-switch";
import {
  archivarCorreoSwitch,
  bajarPdf,
  llavePar,
  type ClienteConCorreo,
  type PdfEnBuzon,
} from "@/lib/cxc/estado-cuenta-pdf-switch-io";

/** Tope del correo YA codificado de Resend (40 MB), con aire. */
const TOPE_ADJUNTOS_BASE64 = 38 * 1024 * 1024;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function mandarPorResend(
  key: string,
  payload: Record<string, unknown>,
  idempotencia: string | null,
): Promise<{ ok: true; id: string } | { ok: false; motivo: string }> {
  for (let intento = 0; intento < 3; intento += 1) {
    const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
    if (idempotencia) headers["Idempotency-Key"] = idempotencia;
    try {
      const res = await fetch("https://api.resend.com/emails", { method: "POST", headers, body: JSON.stringify(payload) });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (res.ok && body.id) return { ok: true, id: body.id };
      if (res.status === 429 && intento < 2) {
        await dormir(1500);
        continue;
      }
      return { ok: false, motivo: `${res.status} ${body.message ?? ""}`.trim() };
    } catch (e) {
      if (intento < 2) {
        await dormir(1500);
        continue;
      }
      return { ok: false, motivo: (e as Error).message };
    }
  }
  return { ok: false, motivo: "sin respuesta" };
}

interface PdfDelCliente {
  empresa: string;
  nombreEmpresa: string;
  total: number;
  bytes: Uint8Array;
  mensajeId: string;
}

/** Los PDF de Switch de un cliente, verificados. Lanza si falta uno o no es suyo. */
async function pdfsDelCliente(
  token: string,
  c: ClienteConCorreo,
  ids: Map<string, number>,
  indice: Map<string, PdfEnBuzon>,
): Promise<PdfDelCliente[]> {
  const out: PdfDelCliente[] = [];
  for (const e of c.empresas) {
    const nombreEmpresa = nombreCortoEmpresa(e);
    const id = ids.get(`${e}:${c.codigo}`);
    if (id == null) throw new Error(`sin id único de Switch en ${nombreEmpresa}`);
    const pdf = indice.get(llavePar(e, id));
    if (!pdf) throw new Error(`falta el PDF de Switch de ${nombreEmpresa}`);
    const bytes = await bajarPdf(token, pdf);
    const lectura = leerPdfSwitch(bytes);
    if (!pdfEsDelCliente(lectura, c.codigo)) {
      throw new Error(`el PDF de ${nombreEmpresa} dice código ${lectura.codigo ?? "ilegible"}, no ${c.codigo}`);
    }
    if (lectura.total == null) throw new Error(`no se pudo leer el total del PDF de ${nombreEmpresa}`);
    if (lectura.total > 0) out.push({ empresa: e, nombreEmpresa, total: lectura.total, bytes, mensajeId: pdf.mensajeId });
  }
  if (!out.length) throw new Error("Switch ya no muestra saldo pendiente");
  return out;
}

export interface Enviado {
  resendId: string;
  empresas: string[];
  saldo: number;
  asunto: string;
  pdfs: number;
  a: string[];
}

/**
 * Arma y manda el correo de un cliente. `prueba` = va SOLO a daniel@ con
 * «[PRUEBA]». Lanza si no salió (el correo de Switch se queda para el reintento);
 * si salió, mueve los correos de Switch a su carpeta.
 */
export async function mandarCorreoDelCliente(o: {
  resendKey: string;
  token: string;
  cliente: ClienteConCorreo;
  ids: Map<string, number>;
  indice: Map<string, PdfEnBuzon>;
  fecha: string;
  fechaArchivo: string;
  prueba: boolean;
  idempotencia: string | null;
}): Promise<Enviado> {
  const c = o.cliente;
  const pdfs = await pdfsDelCliente(o.token, c, o.ids, o.indice);
  const saldo = Math.round(pdfs.reduce((s, p) => s + p.total, 0) * 100) / 100;
  const adjuntos = pdfs.map((p) => ({
    filename: nombreDelPdf(p.nombreEmpresa, c.nombre, o.fechaArchivo),
    content: Buffer.from(p.bytes).toString("base64"),
  }));
  if (adjuntos.reduce((s, a) => s + a.content.length, 0) > TOPE_ADJUNTOS_BASE64) {
    throw new Error("los PDF pasan el tope de 40 MB del correo");
  }
  const contacto = await contactoDelCliente(c.codigo);
  const destino = o.prueba ? [DESTINO_PRUEBA] : c.correos;
  if (!destino.length) throw new Error("sin correo");
  const avisoPrueba = o.prueba
    ? `<p style="background:#fef3c7;padding:8px 12px;font-size:12px;margin:0 0 12px">PRUEBA — este correo iría a: ${escapeHtml(c.correos.join(", ") || "(no tiene correo: no saldría)")}</p>`
    : "";
  const html =
    avisoPrueba +
    composeEmailHtml({
      cuerpo: cuerpoAutomatico(o.fecha, contacto),
      resumenHtml: resumenPdfsHtml(pdfs.map((p) => ({ empresa: p.nombreEmpresa, total: p.total }))),
      firma: buildFirma(FIRMA_AUTOMATICO),
      cuentasHtml: buildCuentasHtml(pdfs.map((p) => ({ empresa_key: p.empresa, empresa_nombre: p.nombreEmpresa }))),
    });
  const asunto = `${o.prueba ? "[PRUEBA] " : ""}${asuntoAutomatico(pdfs.map((p) => p.nombreEmpresa), o.fecha)}`;
  const envio = await mandarPorResend(
    o.resendKey,
    { from: REMITENTE_AUTOMATICO, to: destino, reply_to: RESPONDER_A_AUTOMATICO, subject: asunto, html, attachments: adjuntos },
    o.idempotencia,
  );
  if (!envio.ok) throw new Error(envio.motivo);
  // Ya salió: el correo de Switch se va a su carpeta (si falló, se queda para el reintento).
  for (const p of pdfs) await archivarCorreoSwitch(o.token, p.mensajeId);
  return { resendId: envio.id, empresas: pdfs.map((p) => p.empresa), saldo, asunto, pdfs: pdfs.length, a: destino };
}

/** «30-11-2026» de «2026-11-30». */
export const fechaDelArchivo = (hoyISO: string): string => `${hoyISO.slice(8, 10)}-${hoyISO.slice(5, 7)}-${hoyISO.slice(0, 4)}`;

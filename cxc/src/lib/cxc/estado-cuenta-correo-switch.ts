// El correo de UN cliente con sus PDF de Switch (27-nov-2026). Lo usa el envío
// de los lunes (`/api/cron/estado-cuenta-semanal`), también en su prueba
// (`?prueba=<código>`). Los PDF ya vienen impresos y comprobados
// (`imprimirEstadosDeCuenta`).
//
// 🔴 Si el papel de UNA empresa donde debe no está o no cuadró, lanza y NO sale
// nada: el cliente no se manda incompleto.

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
import { DESTINO_PRUEBA, nombreDelPdf, resumenPdfsHtml } from "@/lib/cxc/estado-cuenta-pdf-switch";
import { llave, type ClienteConCorreo, type Papel } from "@/lib/cxc/estado-cuenta-pdf-switch-io";

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
}

/** Los PDF de un cliente, ya comprobados. Lanza si falta uno o no cuadró. */
function pdfsDelCliente(c: ClienteConCorreo, papeles: Map<string, Papel>): PdfDelCliente[] {
  const out: PdfDelCliente[] = [];
  for (const e of c.empresas) {
    const nombreEmpresa = nombreCortoEmpresa(e);
    const papel = papeles.get(llave(e, c.codigo));
    if (!papel) throw new Error(`sin el estado de cuenta de Switch de ${nombreEmpresa}`);
    if (!papel.ok) throw new Error(`${nombreEmpresa}: ${papel.motivo}`);
    if (papel.total > 0) out.push({ empresa: e, nombreEmpresa, total: papel.total, bytes: papel.pdf });
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
 * «[PRUEBA]». Lanza si no salió.
 */
export async function mandarCorreoDelCliente(o: {
  resendKey: string;
  cliente: ClienteConCorreo;
  papeles: Map<string, Papel>;
  fecha: string;
  fechaArchivo: string;
  prueba: boolean;
  idempotencia: string | null;
}): Promise<Enviado> {
  const c = o.cliente;
  const pdfs = pdfsDelCliente(c, o.papeles);
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
  return { resendId: envio.id, empresas: pdfs.map((p) => p.empresa), saldo, asunto, pdfs: pdfs.length, a: destino };
}

/** «30-11-2026» de «2026-11-30». */
export const fechaDelArchivo = (hoyISO: string): string => `${hoyISO.slice(8, 10)}-${hoyISO.slice(5, 7)}-${hoyISO.slice(0, 4)}`;
